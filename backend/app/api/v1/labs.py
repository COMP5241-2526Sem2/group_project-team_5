import json
from datetime import datetime
from typing import Any, AsyncGenerator

from fastapi import APIRouter, Depends, HTTPException, Query, Response
from starlette.responses import StreamingResponse
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

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
)
from app.services import lab_service

router = APIRouter(prefix="/labs", tags=["labs"])


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
    search: str | None = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
) -> PaginatedLabList:
    """获取 Lab 列表，支持多维过滤与全文搜索。"""
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
    if status:
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
# C. SSE 流式对话（核心）
# ---------------------------------------------------------------------------

@router.get("/sessions/{session_id}/stream")
async def stream_chat(
    session_id: int,
    message: str = Query(..., min_length=1),
    teacher_id: int = Query(1),  # TODO: 从 JWT token 提取
) -> Response:
    """
    SSE 流式对话接口。
    事件类型：text | command | definition | done | lab_error（勿用 event:error，会与 EventSource 连接错误混淆）
    使用独立的 session 管理，避免 StreamingResponse 生命周期导致的连接泄漏。
    """
    # 创建独立 session，event_generator 结束时确保 close
    async with SessionLocal() as _db:
        # Load session
        result = await _db.execute(
            select(LabGenerationSession).where(LabGenerationSession.id == session_id)
        )
        session = result.scalar_one_or_none()
        if session is None:
            raise HTTPException(status_code=404, detail="Session not found")
        if session.teacher_id != teacher_id:
            raise HTTPException(status_code=403, detail="Forbidden")

        # Persist user message
        user_msg = LabChatMessage(
            session_id=session_id,
            role=MessageRole.USER,
            content=message,
        )
        _db.add(user_msg)
        await _db.commit()

        # Build messages for API
        try:
            messages_for_api, _, _ = await lab_service.build_session_messages(_db, session, message)
        except ValueError as e:
            return _sse_response([_sse_event("lab_error", str(e))])

        async def event_generator() -> AsyncGenerator[bytes, None]:
            full_content: list[str] = []
            try:
                initial_for_norm: dict[str, Any] = {}
                if session.lab_definition_id is not None:
                    lr = await _db.execute(
                        select(LabDefinition).where(LabDefinition.id == session.lab_definition_id)
                    )
                    lab_row = lr.scalar_one_or_none()
                    if lab_row is not None and isinstance(lab_row.initial_state, dict):
                        initial_for_norm = lab_row.initial_state

                async for chunk in lab_service.stream_ohmygpt(messages_for_api):
                    full_content.append(chunk)
                    yield _sse_event("text", chunk)

                full_text = "".join(full_content)
                parsed_text, commands, definition = await lab_service.parse_assistant_raw_response(
                    full_text
                )

                commands_to_persist: list[dict[str, Any]] | None = None
                if commands:
                    normalized = lab_service.normalize_drive_commands_for_frontend(
                        commands, initial_for_norm
                    )
                    # 规范化成功则用 wire 格式；否则仍下发原文由前端兜底解析
                    commands_to_persist = normalized if normalized else commands
                    yield _sse_event(
                        "command",
                        json.dumps(commands_to_persist, ensure_ascii=False),
                    )
                if definition:
                    yield _sse_event("definition", json.dumps(definition, ensure_ascii=False))

                msg = LabChatMessage(
                    session_id=session_id,
                    role=MessageRole.ASSISTANT,
                    content=parsed_text,
                    commands=commands_to_persist,
                    definition=definition,
                )
                _db.add(msg)
                await _db.commit()
                await _db.refresh(msg)

                mode_str = session.mode if isinstance(session.mode, str) else session.mode.value
                yield _sse_event("done", json.dumps({
                    "session_mode": mode_str,
                    "message_id": msg.id,
                }))

            except Exception as e:
                yield _sse_event("lab_error", str(e))
            finally:
                await _db.close()

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
    return f"event: {event}\ndata: {data}\n\n".encode("utf-8")


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
        lab_service.apply_save_payload_to_lab(lab, payload, target_status=target_status)
        db.add(lab)
        await db.commit()
        await db.refresh(lab)
        return _wrap(lab, content_unchanged=False)

    if payload.action == "save_draft":
        if lab_service.signature_from_save_payload(
            payload
        ) == lab_service.signature_from_orm_lab(existing):
            return _wrap(existing, content_unchanged=True)
        lab_service.apply_save_payload_to_lab(existing, payload, target_status=OrmLabStatus.DRAFT)
        await db.commit()
        await db.refresh(existing)
        return _wrap(existing, content_unchanged=False)

    lab_service.apply_save_payload_to_lab(existing, payload, target_status=OrmLabStatus.PUBLISHED)
    await db.commit()
    await db.refresh(existing)
    return _wrap(existing, content_unchanged=False)
