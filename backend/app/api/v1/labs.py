import json
import logging
from datetime import datetime
from typing import Annotated, Any, AsyncGenerator

logger = logging.getLogger(__name__)

from fastapi import APIRouter, Depends, HTTPException, Query, Response
from pydantic import BaseModel
from starlette.responses import StreamingResponse
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.database import SessionLocal, get_db
from app.models.lab import LabChatMessage, LabDefinition, LabGenerationSession, LabStatus as OrmLabStatus, MessageRole
from app.schemas.lab import (
    ChatMessageResponse,
    Dimension,
    LabDefinitionCreate,
    LabDefinitionResponse,
    LabDefinitionSaveRequest,
    LabDefinitionSaveResult,
    LabDefinitionUpdate,
    LabListItem,
    LabStatus,
    LabType,
    PaginatedLabList,
    SessionCreate,
    SessionMode,
    SessionResponse,
    SubjectLab,
    normalize_lab_definition_dict,
)
from app.services import lab_service
from app.services.lab.lab_service import (
    apply_reflection_report_to_definition,
    apply_save_payload_to_lab,
    build_session_messages,
    normalize_drive_commands_for_frontend,
    parse_assistant_raw_response,
    parse_drive_response,
    enforce_generate_base_definition,
    signature_from_orm_lab,
    signature_from_save_payload,
    stream_ohmygpt,
    validate_render_code_with_agent,
    LabService,
    ReflectionReport,
    LayoutPlan,
)

router = APIRouter(prefix="/labs", tags=["labs"])


async def _sqlite_alloc_id(db: AsyncSession, model_cls: Any) -> int:
    """SQLite 下 BigInteger 主键不会自动自增；测试环境需要手动分配递增 id。"""
    r = await db.execute(select(func.coalesce(func.max(model_cls.id), 0)))
    return int(r.scalar_one() or 0) + 1


def _is_sqlite(db: AsyncSession) -> bool:
    bind = getattr(db, "bind", None)
    if bind is None:
        return False
    return getattr(getattr(bind, "dialect", None), "name", "") == "sqlite"


# ---------------------------------------------------------------------------
# A. Lab 目录浏览
# ---------------------------------------------------------------------------

LabStatusEnum = LabStatus
LabTypeEnum = LabType
SubjectLabEnum = SubjectLab
DimensionEnum = Dimension


@router.get("/", response_model=PaginatedLabList)
async def list_labs(
    subject: SubjectLabEnum | None = None,
    type: LabTypeEnum | None = None,
    dimension: DimensionEnum | None = None,
    status: LabStatusEnum | None = None,
    statuses: Annotated[list[LabStatusEnum] | None, Query()] = None,
    search: str | None = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
) -> PaginatedLabList:
    """获取 Lab 列表，支持多维过滤与全文搜索。
    若传 `statuses`（可重复 query，如 statuses=published&statuses=draft），则按状态集合筛选，并忽略单字段 `status`。
    """
    stmt = select(LabDefinition)
    count_stmt = select(func.count(LabDefinition.id))

    if subject:
        stmt = stmt.where(LabDefinition.subject_lab == subject)
        count_stmt = count_stmt.where(LabDefinition.subject_lab == subject)
    if type:
        stmt = stmt.where(LabDefinition.lab_type == type)
        count_stmt = count_stmt.where(LabDefinition.lab_type == type)
    if dimension:
        stmt = stmt.where(LabDefinition.dimension == dimension)
        count_stmt = count_stmt.where(LabDefinition.dimension == dimension)
    if statuses:
        stmt = stmt.where(LabDefinition.status.in_(tuple(statuses)))
        count_stmt = count_stmt.where(LabDefinition.status.in_(tuple(statuses)))
    elif status:
        stmt = stmt.where(LabDefinition.status == status)
        count_stmt = count_stmt.where(LabDefinition.status == status)
    if search:
        search_pattern = f"%{search}%"
        stmt = stmt.where(LabDefinition.title.ilike(search_pattern))
        count_stmt = count_stmt.where(LabDefinition.title.ilike(search_pattern))

    # Total count
    total_result = await db.execute(count_stmt)
    total = total_result.scalar() or 0

    # Paginated results
    offset = (page - 1) * page_size
    stmt = stmt.order_by(LabDefinition.updated_at.desc()).offset(offset).limit(page_size)
    result = await db.execute(stmt)
    items = result.scalars().all()

    return PaginatedLabList(total=total, page=page, page_size=page_size, items=items)


@router.get("/{registry_key}", response_model=LabDefinitionResponse)
async def get_lab_by_registry_key(
    registry_key: str,
    db: AsyncSession = Depends(get_db),
) -> LabDefinition:
    """获取单个 Lab 详情，按 registry_key 精确查找。"""
    result = await db.execute(
        select(LabDefinition).where(LabDefinition.registry_key == registry_key)
    )
    lab = result.scalar_one_or_none()
    if lab is None:
        raise HTTPException(status_code=404, detail=f"Lab '{registry_key}' not found")
    return lab


# ---------------------------------------------------------------------------
# B. Session 管理
# ---------------------------------------------------------------------------

@router.post("/sessions", response_model=SessionResponse, status_code=201)
async def create_session(
    payload: SessionCreate,
    db: AsyncSession = Depends(get_db),
    teacher_id: int = Query(1),  # TODO: 从 JWT token 中提取用户 ID
) -> LabGenerationSession:
    """
    创建新的 AI Lab 对话会话。
    - drive 模式：需要提供 registry_key（关联现有 Lab）
    - generate 模式：registry_key 可选；若提供且库中存在该 Lab，则进入「基于当前实验迭代」上下文
    """
    lab_definition_id: int | None = None

    if payload.mode == SessionMode.DRIVE:
        if not payload.registry_key:
            raise HTTPException(
                status_code=400,
                detail="registry_key is required in drive mode",
            )
        result = await db.execute(
            select(LabDefinition).where(LabDefinition.registry_key == payload.registry_key)
        )
        lab = result.scalar_one_or_none()
        if lab is None:
            raise HTTPException(status_code=404, detail=f"Lab '{payload.registry_key}' not found")
        lab_definition_id = lab.id
    elif payload.mode == SessionMode.GENERATE and payload.registry_key:
        result = await db.execute(
            select(LabDefinition).where(LabDefinition.registry_key == payload.registry_key)
        )
        lab = result.scalar_one_or_none()
        if lab is not None:
            lab_definition_id = lab.id

    session = LabGenerationSession(
        teacher_id=teacher_id,
        lab_definition_id=lab_definition_id,
        mode=payload.mode,
    )
    # Some DB/proxy setups may not populate server_default immediately.
    # Ensure response_model fields are always present to avoid 500 ResponseValidationError.
    if getattr(session, "created_at", None) is None:
        session.created_at = datetime.utcnow()
    if _is_sqlite(db):
        session.id = await _sqlite_alloc_id(db, LabGenerationSession)
    db.add(session)
    await db.commit()
    await db.refresh(session)
    return session


@router.get("/sessions/{session_id}/messages", response_model=list[ChatMessageResponse])
async def get_session_messages(
    session_id: int,
    db: AsyncSession = Depends(get_db),
) -> list[LabChatMessage]:
    """获取指定会话的所有历史消息。"""
    result = await db.execute(
        select(LabChatMessage)
        .where(LabChatMessage.session_id == session_id)
        .order_by(LabChatMessage.created_at)
    )
    return list(result.scalars().all())


# ---------------------------------------------------------------------------
# 诊断日志工具
# ---------------------------------------------------------------------------

def _build_diagnostic_log(
    session_id: int,
    session_mode: str,
    user_message: str,
    full_text: str,
    parsed_text: str,
    commands: list[dict] | None,
    definitions: list[dict] | None,
    reflection_results: list[dict | None],
    final_definitions: list[dict],
    saved_message_id: int | None,
) -> str:
    """
    构建完整的诊断日志，涵盖 parsing → reflection → finalizing 三阶段。

    Returns:
        多行字符串，可直接写入 .txt 文件
    """
    from datetime import datetime
    import json

    lines: list[str] = []
    WIDTH = 80

    def section(title: str) -> None:
        lines.append("")
        lines.append(f"{'═' * WIDTH}")
        lines.append(f"  {title}")
        lines.append(f"{'═' * WIDTH}")

    def kv(key: str, value: str) -> None:
        lines.append(f"  {key:<24} {value}")

    # ── 元数据 ──────────────────────────────────────────────────────────────
    section("SESSION METADATA")
    kv("session_id", str(session_id))
    kv("mode", session_mode)
    kv("timestamp", datetime.now().isoformat(timespec="seconds"))
    kv("user_message", user_message[:200] + ("..." if len(user_message) > 200 else ""))

    # ── Stage 1: LLM Raw Output ─────────────────────────────────────────────
    section("STAGE 1 — LLM RAW OUTPUT (LLM Streaming Complete)")
    kv("raw_length", f"{len(full_text)} chars")
    kv("preview_first_500", full_text[:500])
    if len(full_text) > 500:
        lines.append(f"\n  [... middle {len(full_text) - 1000} chars omitted ...]\n")
        lines.append(f"  preview_last_500:")
        lines.append(f"  {full_text[-500:]}")

    # ── Stage 2: Parsing ────────────────────────────────────────────────────
    section("STAGE 2 — PARSING (parse_assistant_raw_response)")
    kv("parsed_text_length", f"{len(parsed_text)} chars")
    kv("commands_extracted", str(len(commands) if commands else 0))
    kv("definitions_extracted", str(len(definitions) if definitions else 0))

    if definitions:
        for di, d in enumerate(definitions):
            lines.append(f"\n  definition[{di}] registry_key: {d.get('registry_key', '(none)')}")
            for k in ["title", "subject_lab", "renderer_profile", "dimension"]:
                v = d.get(k)
                if v is not None:
                    lines.append(f"    {k}: {v}")

    if commands:
        lines.append(f"\n  commands preview:")
        for ci, cmd in enumerate(commands[:5]):
            lines.append(f"    [{ci}] {json.dumps(cmd, ensure_ascii=False)[:120]}")
        if len(commands) > 5:
            lines.append(f"    ... and {len(commands) - 5} more")

    lines.append(f"\n  parsed_text (narrative, after stripping JSON):")
    for ln in parsed_text.splitlines()[:30]:
        lines.append(f"  {ln}")
    if len(parsed_text.splitlines()) > 30:
        lines.append(f"  ... ({len(parsed_text.splitlines()) - 30} more lines)")

    # ── Stage 3: Reflection ─────────────────────────────────────────────────
    section("STAGE 3 — REFLECTION (RenderCodeAgent Validation)")
    for ri, result in enumerate(reflection_results):
        lines.append(f"\n  definition[{ri}] reflection result:")
        if result is None:
            lines.append("    (no reflection needed — render_code was already valid)")
        else:
            for k, v in result.items():
                if k == "reflection_report" and isinstance(v, dict):
                    lines.append(f"    reflection_report:")
                    for rk, rv in v.items():
                        lines.append(f"      {rk}: {str(rv)[:200]}")
                elif k == "corrected_render_code":
                    preview = str(v)[:200] if v else "(none)"
                    lines.append(f"    corrected_render_code: {preview}...")
                elif k == "issues_detected":
                    lines.append(f"    issues_detected: {json.dumps(v, ensure_ascii=False)[:300]}")
                else:
                    lines.append(f"    {k}: {str(v)[:200]}")

    # ── Stage 4: Finalizing ────────────────────────────────────────────────
    section("STAGE 4 — FINALIZING (SSE Output Ready)")
    kv("final_definitions_count", str(len(final_definitions)))
    kv("text_event_length", f"{len(parsed_text)} chars")
    kv("saved_message_id", str(saved_message_id) if saved_message_id else "(not saved)")

    for fi, fd in enumerate(final_definitions):
        lines.append(f"\n  final_definition[{fi}]:")
        lines.append(f"    registry_key:   {fd.get('registry_key', '(none)')}")
        lines.append(f"    title:          {fd.get('title', '(none)')}")
        lines.append(f"    subject_lab:    {fd.get('subject_lab', '(none)')}")
        lines.append(f"    renderer_profile: {fd.get('renderer_profile', '(none)')}")
        rc = fd.get("render_code")
        if rc:
            lines.append(f"    render_code:    {str(rc)[:150]}...")
        else:
            lines.append(f"    render_code:    (none)")
        vh = fd.get("visual_hint")
        if vh:
            lines.append(f"    visual_hint:    {json.dumps(vh, ensure_ascii=False)[:200]}...")

    # ── Summary ─────────────────────────────────────────────────────────────
    section("SUMMARY")
    lines.append(f"  stages_completed: 4")
    lines.append(f"  stages: [LLM_RAW, PARSING, REFLECTION, FINALIZING]")
    lines.append(f"  total_definitions: {len(final_definitions)}")
    lines.append(f"  has_commands: {str(commands is not None and len(commands) > 0)}")
    lines.append(f"  reflection_needed_count: {sum(1 for r in reflection_results if r is not None)}")
    lines.append("")
    lines.append(f"{'═' * WIDTH}")
    lines.append(f"  END OF DIAGNOSTIC LOG — session_id={session_id}")
    lines.append(f"{'═' * WIDTH}")

    return "\n".join(lines)


# ---------------------------------------------------------------------------
# C. SSE 流式对话（核心）
# ---------------------------------------------------------------------------

@router.get("/sessions/{session_id}/stream")
async def stream_chat(
    session_id: int,
    message: str = Query(..., min_length=1),
    teacher_id: int = Query(1),  # TODO: 从 JWT token 提取
) -> StreamingResponse:
    """
    SSE 流式对话接口。

    事件类型：
    - generating: 后端开始处理
    - chunk: 大模型原始输出片段（实时流式）
    - status: 工作流状态更新（实时）
    - thinking: AI 思考/反思过程（实时）
    - command: 驱动命令
    - definition: 实验定义
    - definitions: 所有候选定义
    - text: 面向用户的说明文字
    - done: 完成
    - lab_error: 错误

    完整接收 LLM 流后由后端解析；`text` 仅为面向用户的说明文字（已剔除 lab_definition 等 JSON 围栏）。
    使用独立的 session 管理，避免 StreamingResponse 生命周期导致的连接泄漏。
    """
    # 仅做存在性校验：须在本函数内 raise HTTPException，勿在 return StreamingResponse 之后再关库。
    # 若把 AsyncSession 放在「async with 包住 return」的外层，会在客户端读流之前就 close，
    # 导致生成器里 _db.add/commit 使用已关闭会话 → 第二轮对话失败或连接被重置（前端见「连接中断」/500）。
    async with SessionLocal() as _pre_db:
        result = await _pre_db.execute(
            select(LabGenerationSession).where(LabGenerationSession.id == session_id)
        )
        _pre_session = result.scalar_one_or_none()
        if _pre_session is None:
            raise HTTPException(status_code=404, detail="Session not found")
        if _pre_session.teacher_id != teacher_id:
            raise HTTPException(status_code=403, detail="Forbidden")

    async def event_generator() -> AsyncGenerator[bytes, None]:
        full_content: list[str] = []
        async with SessionLocal() as db:
            try:
                result = await db.execute(
                    select(LabGenerationSession).where(LabGenerationSession.id == session_id)
                )
                session = result.scalar_one_or_none()
                if session is None:
                    yield _sse_event("lab_error", "Session not found")
                    return
                if session.teacher_id != teacher_id:
                    yield _sse_event("lab_error", "Forbidden")
                    return

                user_msg = LabChatMessage(
                    session_id=session_id,
                    role=MessageRole.USER,
                    content=message,
                )
                # Some DB schemas enforce NOT NULL but may not have defaults/triggers.
                if getattr(user_msg, "created_at", None) is None:
                    user_msg.created_at = datetime.utcnow()
                if _is_sqlite(db):
                    user_msg.id = await _sqlite_alloc_id(db, LabChatMessage)
                db.add(user_msg)
                await db.commit()

                try:
                    messages_for_api, _, _ = await build_session_messages(db, session, message)
                except ValueError as e:
                    yield _sse_event("lab_error", str(e))
                    return

                initial_for_norm: dict[str, Any] = {}
                if session.lab_definition_id is not None:
                    lr = await db.execute(
                        select(LabDefinition).where(LabDefinition.id == session.lab_definition_id)
                    )
                    lab_row = lr.scalar_one_or_none()
                    if lab_row is not None and isinstance(lab_row.initial_state, dict):
                        initial_for_norm = lab_row.initial_state

                # 前端立即显示"正在生成…"占位，不再流原始 chunk
                yield _sse_event("generating", "")

                # 实时流式输出大模型原始内容
                async for chunk in stream_ohmygpt(messages_for_api):
                    full_content.append(chunk)
                    # 实时 yield 原始 chunk
                    yield _sse_event("chunk", json.dumps({
                        "content": chunk,
                        "accumulated": "".join(full_content)[-500:] if full_content else "",
                    }))

                full_text = "".join(full_content)

                session_mode_str = session.mode if isinstance(session.mode, str) else session.mode.value

                # Drive 与 Generate 分流：Drive 只解析控制命令，不把输出当作实验定义
                if session_mode_str == "drive":
                    parsed_text, commands = parse_drive_response(full_text)
                    definitions = None
                else:
                    parsed_text, commands, definitions = parse_assistant_raw_response(
                        full_text
                    )

                # ── Stage 2: Parsing ────────────────────────────────────────
                yield _sse_event("status", json.dumps({
                    "stage": "parsing",
                    "message": (
                        "解析驱动命令完成"
                        if session_mode_str == "drive"
                        else f"解析完成，发现 {len(definitions) if definitions else 0} 个实验定义"
                    ),
                    "progress": 30,
                }))
                logger.info(
                    "[SSE] Parsed stream session_id=%s mode=%s definitions_count=%s "
                    "registry_keys=%s narrative_len=%d raw_len=%d",
                    session_id,
                    session_mode_str,
                    len(definitions) if definitions else 0,
                    [d.get("registry_key") for d in (definitions or [])],
                    len(parsed_text),
                    len(full_text),
                )

                commands_to_persist: list[dict[str, Any]] | None = None
                if commands:
                    normalized = normalize_drive_commands_for_frontend(
                        commands, initial_for_norm
                    )
                    commands_to_persist = normalized if normalized else commands
                    yield _sse_event(
                        "command",
                        json.dumps(commands_to_persist, ensure_ascii=False),
                    )

                # ── Stage 3: Reflection（仅 Generate：Drive 不跑 render_code 反思） ──
                reflection_results: list[dict | None] = []

                if definitions and session_mode_str != "drive":
                    for _d in definitions:
                        normalize_lab_definition_dict(_d)

                    # Generate + 选中基准实验：强制本轮输出围绕该实验“同 key 覆盖式迭代”，
                    # 避免 LLM 重新生成新的 registry_key 导致前端出现“新实验”。
                    base_lab: LabDefinition | None = None
                    if (
                        session_mode_str == "generate"
                        and session.lab_definition_id is not None
                    ):
                        br = await db.execute(
                            select(LabDefinition).where(
                                LabDefinition.id == session.lab_definition_id
                            )
                        )
                        base_lab = br.scalar_one_or_none()
                        if base_lab is not None:
                            definitions = [
                                enforce_generate_base_definition(d, base_lab=base_lab)
                                for d in definitions
                            ]

                    # 创建用于 RenderCodeAgent 的 stream_fn（包装为可 await 的函数）
                    async def reflection_stream_fn(messages: list[dict[str, str]]) -> str:
                        """用于反思验证的 LLM 调用（非流式，返回完整响应）"""
                        chunks: list[str] = []
                        try:
                            async for chunk in stream_ohmygpt(messages):
                                if chunk:
                                    chunks.append(chunk)
                        except Exception as e:
                            logger.warning("[reflection_stream_fn] Error: %s", str(e))
                        result = "".join(chunks)
                        return result

                    for def_i, definition in enumerate(definitions):
                        # 实时输出正在处理的定义
                        yield _sse_event("status", json.dumps({
                            "stage": "reflection",
                            "message": f"正在验证实验定义 {def_i + 1}/{len(definitions)}...",
                            "progress": 40 + def_i * 15,
                            "definition_index": def_i,
                            "registry_key": definition.get("registry_key"),
                        }))

                        # 调用 RenderCodeAgent 进行反思验证和字段更新
                        rc = definition.get("render_code")
                        is_valid_rc = LabService.is_valid_render_code(
                            rc,
                            definition.get("initial_state"),
                            definition.get("visual_hint"),
                        )
                        issues_before = LabService.detect_render_code_issues(
                            rc,
                            definition.get("initial_state"),
                            definition.get("visual_hint"),
                        )

                        if not is_valid_rc or issues_before:
                            # 需要验证和修正
                            subject = str(definition.get("subject_lab", "general"))
                            renderer_profile = definition.get("renderer_profile")

                            # 实时输出反思过程
                            yield _sse_event("thinking", json.dumps({
                                "stage": "layout_analysis",
                                "message": "正在分析布局方案...",
                                "definition_index": def_i,
                            }))

                            corrected_rc, reflection_report, layout_plan = await validate_render_code_with_agent(
                                render_code=rc,
                                initial_state=definition.get("initial_state"),
                                visual_hint=definition.get("visual_hint"),
                                subject=subject,
                                renderer_profile=renderer_profile,
                                stream_fn=reflection_stream_fn,
                                definition_id=definition.get("registry_key"),
                                teacher_message=message,
                            )

                            # 实时输出反思结果
                            yield _sse_event("thinking", json.dumps({
                                "stage": "reflection_complete",
                                "message": f"反思验证完成 (尝试 {reflection_report.attempt_count} 次)",
                                "definition_index": def_i,
                                "attempt_count": reflection_report.attempt_count,
                                "used_fallback": reflection_report.used_fallback,
                                "summary": reflection_report.summary,
                            }))

                            # 更新 definition 中的 render_code
                            if corrected_rc:
                                definition["render_code"] = corrected_rc
                                yield _sse_event("thinking", json.dumps({
                                    "stage": "render_code_generated",
                                    "message": "render_code 生成成功",
                                    "definition_index": def_i,
                                }))

                            # Generate+基准实验迭代：若校验后仍无法渲染（或走了 fallback），自动回滚到基准实验版本，
                            # 避免一次错误迭代把基准实验“刷坏”导致前端预览失败。
                            if (
                                session_mode_str == "generate"
                                and base_lab is not None
                                and base_lab.render_code
                            ):
                                # 1) 若 agent 标记 used_fallback（通常表示多轮仍失败），直接回滚
                                _used_fallback = bool(getattr(reflection_report, "used_fallback", False))
                                # 2) 或者最终 render_code 仍不满足硬约束，也回滚
                                _final_rc = definition.get("render_code")
                                _still_invalid = not LabService.is_valid_render_code(
                                    _final_rc,
                                    definition.get("initial_state"),
                                    definition.get("visual_hint"),
                                )
                                if _used_fallback or _still_invalid:
                                    definition["render_code"] = base_lab.render_code
                                    # visual_hint 若被改坏，也回滚（尽量保持可预览）
                                    if base_lab.visual_hint is not None and not isinstance(definition.get("visual_hint"), dict):
                                        definition["visual_hint"] = base_lab.visual_hint
                                    # 记录一次回滚元信息，便于排查
                                    meta = definition.get("lab_metadata") or {}
                                    meta["_autoRollback"] = {
                                        "reason": "render_failed_or_fallback",
                                        "at": datetime.now().isoformat(timespec="seconds"),
                                    }
                                    definition["lab_metadata"] = meta
                                    yield _sse_event("thinking", json.dumps({
                                        "stage": "auto_rollback",
                                        "message": "检测到渲染失败/回退模板：已自动回滚到基准实验 render_code",
                                        "definition_index": def_i,
                                        "registry_key": definition.get("registry_key"),
                                    }, ensure_ascii=False))

                            # 根据反思报告更新其他字段
                            definition = apply_reflection_report_to_definition(
                                definition, reflection_report
                            )

                            logger.info(
                                "[SSE] definition[%d] reflection: registry_key=%s, "
                                "attempt_count=%d, used_fallback=%s, summary=%s",
                                def_i,
                                definition.get("registry_key"),
                                reflection_report.attempt_count,
                                reflection_report.used_fallback,
                                reflection_report.summary,
                            )

                            # 收集 reflection 结果供诊断日志使用
                            reflection_results.append({
                                "definition_index": def_i,
                                "registry_key": definition.get("registry_key"),
                                "was_valid_before": is_valid_rc,
                                "issues_before": [{"code": i.get("code", ""), "description": i.get("description", "")} for i in issues_before],
                                "reflection_report": {
                                    "attempt_count": reflection_report.attempt_count,
                                    "used_fallback": reflection_report.used_fallback,
                                    "summary": reflection_report.summary,
                                    "issues_detected": [
                                        {"code": i.code, "description": i.description}
                                        for i in (reflection_report.issues_detected or [])
                                    ],
                                } if reflection_report else None,
                                "corrected_render_code": corrected_rc,
                                "layout_plan": {
                                    "canvas_size": layout_plan.canvas_size if layout_plan else None,
                                    "layout_strategy": layout_plan.layout_strategy if layout_plan else None,
                                    "components": layout_plan.components if layout_plan else None,
                                } if layout_plan else None,
                            })
                            definitions[def_i] = definition
                        else:
                            # render_code 已有效，无需反思
                            reflection_results.append(None)
                            logger.info(
                                "[SSE] definition[%d]: registry_key=%s, has_render_code=%s, "
                                "reflection skipped (already valid)",
                                def_i,
                                definition.get("registry_key"),
                                definition.get("render_code") is not None,
                            )

                        _rc = definition.get("render_code")
                        _rc_preview = (
                            f"render_code: {_rc[:200]}..." if _rc and len(str(_rc)) > 200
                            else f"render_code: {_rc}"
                        )
                        logger.info(
                            "[SSE] definition[%d]: registry_key=%s, has_render_code=%s, %s",
                            def_i,
                            definition.get("registry_key"),
                            definition.get("render_code") is not None,
                            _rc_preview,
                        )

                    # Always emit a single "definition" event for backward compatibility (first def)
                    yield _sse_event("definition", json.dumps(definitions[0], ensure_ascii=False))
                    # Emit "definitions" (plural) with all candidates for the selector UI
                    yield _sse_event("definitions", json.dumps(definitions, ensure_ascii=False))

                    # 实时输出所有定义已就绪
                    yield _sse_event("status", json.dumps({
                        "stage": "definitions_ready",
                        "message": f"已生成 {len(definitions)} 个实验定义",
                        "progress": 80,
                    }))
                    logger.info(
                        "[SSE] Sent definition events: count=%d, registry_keys=%s",
                        len(definitions),
                        [d.get("registry_key") for d in definitions],
                    )
                else:
                    reflection_results = []
                    if session_mode_str != "drive":
                        _has_rc = "render_code" in full_text
                        _rc_start = full_text.index("render_code") if _has_rc else -1
                        _rc_snippet = full_text[_rc_start : _rc_start + 300] if _has_rc else ""
                        logger.warning(
                            "[SSE] No definition extracted from AI response for session %s. "
                            "Full response length=%d, commands=%s, has_render_code=%s, rc_snippet=%s",
                            session_id,
                            len(full_text),
                            commands_to_persist is not None,
                            _has_rc,
                            _rc_snippet[:200],
                        )
                    else:
                        logger.info(
                            "[SSE] Drive session %s: skipped definition/reflection; commands=%s",
                            session_id,
                            commands_to_persist is not None,
                        )

                # ── Stage 4: Finalizing ────────────────────────────────────
                yield _sse_event("status", json.dumps({
                    "stage": "finalizing",
                    "message": "正在完成...",
                    "progress": 90,
                }))
                yield _sse_event("text", parsed_text)

                msg = LabChatMessage(
                    session_id=session_id,
                    role=MessageRole.ASSISTANT,
                    content=parsed_text,
                    commands=commands_to_persist,
                    definition=definitions[0] if definitions else None,
                )
                # Some DB schemas enforce NOT NULL but may not have defaults/triggers.
                if getattr(msg, "created_at", None) is None:
                    msg.created_at = datetime.utcnow()
                if _is_sqlite(db):
                    msg.id = await _sqlite_alloc_id(db, LabChatMessage)
                db.add(msg)
                await db.commit()
                await db.refresh(msg)

                # ── 写入完整诊断日志（可配置，默认关闭） ───────────────────────
                if settings.dump_llm_raw_sessions:
                    import os as _diag_os
                    _diag_dir = _diag_os.path.dirname(_diag_os.path.abspath(__file__))
                    _diag_path = _diag_os.path.join(_diag_dir, f"llm_raw_session_{session_id}.txt")
                    _diag_log = _build_diagnostic_log(
                        session_id=session_id,
                        session_mode=session_mode_str,
                        user_message=message,
                        full_text=full_text,
                        parsed_text=parsed_text,
                        commands=commands_to_persist,
                        definitions=definitions,
                        reflection_results=reflection_results,
                        final_definitions=definitions if definitions else [],
                        saved_message_id=msg.id,
                    )
                    with open(_diag_path, "w", encoding="utf-8") as _f:
                        _f.write(_diag_log)
                    logger.info("[SSE] Dumped diagnostic log to %s (%d chars)", _diag_path, len(_diag_log))

                yield _sse_event("status", json.dumps({
                    "stage": "done",
                    "message": "生成完成",
                    "progress": 100,
                }))
                yield _sse_event("done", json.dumps({
                    "session_mode": session_mode_str,
                    "message_id": msg.id,
                    "definitions_count": len(definitions) if definitions else 0,
                }))

            except Exception as e:
                import traceback
                tb = traceback.format_exc()
                logger.error("[SSE] Error in stream: %s\n%s", str(e), tb)
                yield _sse_event("lab_error", str(e))

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


def _sse_event(event: str, data: str) -> bytes:
    """Build one SSE event.

    Per the HTML SSE standard, each payload line must be prefixed with ``data: ``.
    Embedding raw ``\\n`` in ``data`` would insert blank lines that terminate the
    event early in browsers, so multi-line markdown (e.g. ``text``) would arrive
    truncated to the first paragraph.
    """
    lines: list[str] = [f"event: {event}"]
    if data == "":
        lines.append("data: ")
    else:
        for line in data.splitlines():
            lines.append(f"data: {line}")
    lines.append("")
    return ("\n".join(lines) + "\n").encode("utf-8")


def _sse_response(events: list[bytes]) -> StreamingResponse:
    """一次性 SSE 响应（同步 bytes 列表）。"""
    return StreamingResponse(
        iter(events),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        },
    )


# ---------------------------------------------------------------------------
# D. Lab 定义管理（CRUD）
# ---------------------------------------------------------------------------

@router.post("/definitions", response_model=LabDefinitionResponse, status_code=201)
async def create_lab_definition(
    payload: LabDefinitionCreate,
    db: AsyncSession = Depends(get_db),
    teacher_id: int = Query(1),  # TODO: 从 JWT 提取
) -> LabDefinition:
    """保存 AI 生成的 Lab 定义。"""
    lab = LabDefinition(
        registry_key=payload.registry_key,
        title=payload.title,
        description=payload.description,
        subject_lab=payload.subject_lab,
        renderer_profile=payload.renderer_profile,
        dimension=payload.dimension,
        initial_state=payload.initial_state,
        reducer_spec=payload.reducer_spec,
        lab_metadata=payload.lab_metadata,
        lab_type=payload.lab_type,
        status=payload.status,
        visual_profile=payload.visual_profile,
        teacher_id=teacher_id,
    )
    db.add(lab)
    try:
        await db.commit()
        await db.refresh(lab)
    except Exception:
        await db.rollback()
        raise HTTPException(status_code=409, detail="registry_key already exists")
    return lab


@router.patch("/definitions/{lab_id}", response_model=LabDefinitionResponse)
async def update_lab_definition(
    lab_id: int,
    payload: LabDefinitionUpdate,
    db: AsyncSession = Depends(get_db),
) -> LabDefinition:
    """更新 Lab 定义（状态/元数据）。"""
    result = await db.execute(
        select(LabDefinition).where(LabDefinition.id == lab_id)
    )
    lab = result.scalar_one_or_none()
    if lab is None:
        raise HTTPException(status_code=404, detail="Lab definition not found")

    update_data = payload.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(lab, field, value)

    await db.commit()
    await db.refresh(lab)
    return lab


@router.delete("/definitions/{lab_id}", status_code=204)
async def delete_lab_definition(
    lab_id: int,
    db: AsyncSession = Depends(get_db),
) -> None:
    """删除 AI 生成的 Lab 定义。"""
    result = await db.execute(
        select(LabDefinition).where(LabDefinition.id == lab_id)
    )
    lab = result.scalar_one_or_none()
    if lab is None:
        raise HTTPException(status_code=404, detail="Lab definition not found")

    await db.delete(lab)
    await db.commit()


@router.post("/definitions/confirm", response_model=LabDefinitionResponse, status_code=201)
async def confirm_and_save_lab_definition(
    payload: LabDefinitionCreate,
    db: AsyncSession = Depends(get_db),
    teacher_id: int = Query(1),  # TODO: 从 JWT 提取
) -> LabDefinition:
    """用户确认 AI 生成的 Lab 定义后，保存到数据库（upsert 语义：key 冲突返回已有记录）。"""
    # 先查是否已存在
    result = await db.execute(
        select(LabDefinition).where(LabDefinition.registry_key == payload.registry_key)
    )
    existing = result.scalar_one_or_none()
    if existing is not None:
        return existing

    lab = LabDefinition(
        registry_key=payload.registry_key,
        title=payload.title,
        description=payload.description,
        subject_lab=payload.subject_lab,
        renderer_profile=payload.renderer_profile,
        dimension=payload.dimension,
        initial_state=payload.initial_state,
        reducer_spec=payload.reducer_spec,
        lab_metadata=payload.lab_metadata,
        lab_type=payload.lab_type,
        status=payload.status,
        visual_profile=payload.visual_profile,
        teacher_id=teacher_id,
    )
    db.add(lab)
    await db.commit()
    await db.refresh(lab)
    return lab


@router.post("/definitions/save", response_model=LabDefinitionSaveResult)
async def save_or_publish_lab_definition(
    payload: LabDefinitionSaveRequest,
    db: AsyncSession = Depends(get_db),
    teacher_id: int = Query(1),  # TODO: 从 JWT 提取
) -> LabDefinitionSaveResult:
    """
    保存草稿或发布：按 registry_key upsert。
    - save_draft：若正文与库中一致则 content_unchanged=true 且不写库；否则更新并置为 draft。
    - publish：更新正文并置为 published。
    """
    result = await db.execute(
        select(LabDefinition).where(LabDefinition.registry_key == payload.registry_key)
    )
    existing = result.scalar_one_or_none()

    def _wrap(lab: LabDefinition, *, content_unchanged: bool) -> LabDefinitionSaveResult:
        base = LabDefinitionResponse.model_validate(lab)
        return LabDefinitionSaveResult(**base.model_dump(), content_unchanged=content_unchanged)

    if existing is None:
        target_status = (
            OrmLabStatus.PUBLISHED if payload.action == "publish" else OrmLabStatus.DRAFT
        )
        lab = LabDefinition(registry_key=payload.registry_key, teacher_id=teacher_id)
        apply_save_payload_to_lab(lab, payload, target_status=target_status)
        db.add(lab)
        await db.commit()
        await db.refresh(lab)
        return _wrap(lab, content_unchanged=False)

    if payload.action == "save_draft":
        if signature_from_save_payload(
            payload
        ) == signature_from_orm_lab(existing):
            return _wrap(existing, content_unchanged=True)
        apply_save_payload_to_lab(existing, payload, target_status=OrmLabStatus.DRAFT)
        await db.commit()
        await db.refresh(existing)
        return _wrap(existing, content_unchanged=False)

    apply_save_payload_to_lab(existing, payload, target_status=OrmLabStatus.PUBLISHED)
    await db.commit()
    await db.refresh(existing)
    return _wrap(existing, content_unchanged=False)
