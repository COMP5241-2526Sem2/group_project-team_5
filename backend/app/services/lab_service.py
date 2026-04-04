import json
import re
from typing import Any, AsyncGenerator

import httpx
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.models.lab import (
    Dimension as OrmDimension,
    LabChatMessage,
    LabDefinition,
    LabGenerationSession,
    LabStatus as OrmLabStatus,
    LabType as OrmLabType,
    MessageRole,
    SubjectLab as OrmSubjectLab,
)
from app.schemas.lab import LabDefinitionSaveRequest, SessionMode


def _coerce_enum_str(v: Any) -> str:
    """String-backed ORM columns often load as plain str, not Python Enum."""
    if isinstance(v, str):
        return v
    return getattr(v, "value", str(v))


# ---------------------------------------------------------------------------
# System Prompts
# ---------------------------------------------------------------------------

_DRIVE_PROMPT_TEMPLATE = """\
You are an AI Lab Assistant helping a teacher interact with a dynamic lab simulation.

## Lab Info
- Title: {title}
- Registry Key: {registry_key}
- Subject: {subject}
- Renderer: {renderer_profile}
- Dimension: {dimension}

## Current Lab State (JSON)
```json
{initial_state}
```

## Lab Reducer Spec
```json
{reducer_spec}
```

## Instructions
- Respond to the teacher in natural language (Chinese or English as appropriate).
- When they ask to **change a parameter**, you MUST emit a JSON code block containing a **JSON array** of commands in the **exact wire format** below. Keys in `SET_PARAM` must match keys that already exist in **Current Lab State** (e.g. `n1`, `n2`, `theta1`, `ph`, …).

### Frontend command wire format (only these are applied)
```json
[{{"type": "SET_PARAM", "payload": {{"key": "n2", "value": 1.33}}}}]
```
- **SET_PARAM** (preferred): `payload.key` = state field name, `payload.value` = new value (number/string/bool as appropriate).
- **SET_STATE**: merge a flat object, e.g. `{{"type": "SET_STATE", "payload": {{"n2": 1.33, "theta1": 45}}}}`.
- **RESET**: `{{"type": "RESET"}}` — resets to initial state.

Do **not** use `{{"type":"command"}}`, `CHANGE_MATERIAL`, `SET_PROPERTY`, or other invented verbs — the UI ignores them.

### Examples (Snell / refraction style)
- Second medium refractive index → water (1.33): `[{{"type": "SET_PARAM", "payload": {{"key": "n2", "value": 1.33}}}}]`
- Incident angle 45°: `[{{"type": "SET_PARAM", "payload": {{"key": "theta1", "value": 45}}}}]`

If the teacher only asks a conceptual question, answer without a command block.
"""

_GENERATE_PROMPT_TEMPLATE = """\
You are an AI Lab Designer helping a teacher create interactive lab simulations.

## Context
Teacher wants to generate a new lab for: {subject}

## Available Renderer Profiles (use exactly one string)
- circuit_2d: Circuit simulation with wires and components
- function_2d: 2D function plotter with axes and curves
- geometry_3d: 3D geometry construction tool
- molecule_3d: Molecular structure viewer
- cell_3d: Biological cell simulation
- mechanics_3d: Mechanics / dynamics (springs, pendulums, projectiles)
- generic_2d: General 2D interactive panels (sliders, pH/color, custom UI)

## Your Task
1. Ask clarifying questions about the lab goal (topic, grade level, key concepts).
2. Once you have enough information, generate a complete LabComponentDefinition JSON object.
3. Output the JSON in a code block with the label "lab_definition":
```json
{{"type": "lab_definition", "definition": {{...full LabComponentDefinition...}}}}
```

## LabComponentDefinition Schema
```json
{{
  "registry_key": "subject.name_001",
  "title": "Lab Title",
  "description": "Brief description",
  "subject_lab": "physics|math|chemistry|biology|dynamic",
  "renderer_profile": "circuit_2d|function_2d|geometry_3d|molecule_3d|cell_3d|mechanics_3d|generic_2d",
  "dimension": "2d|3d",
  "initial_state": {{ ...component tree... }},
  "reducer_spec": {{
    "allowedCommands": ["SET_PROPERTY", "ADD_COMPONENT", ...],
    "maxNodes": 50,
    "maxConnections": 100
  }},
  "metadata": {{
    "grade": "Grade 10",
    "topic": "Ohm's Law",
    "version": "1.0"
  }}
}}
```

Ask questions first, then generate the definition when ready.
"""

_REFINE_GENERATE_PROMPT_TEMPLATE = """\
You are an AI Lab Designer. The teacher is **refining an existing lab** (not starting from empty).

## Subject context
Primary subject area: **{subject}**

## Current Lab Definition (JSON) — treat this as the source of truth; update it in response to the teacher
```json
{lab_json}
```

## Available Renderer Profiles (use exactly one string in output)
- circuit_2d, function_2d, geometry_3d, molecule_3d, cell_3d, mechanics_3d, generic_2d

## Instructions
1. Read the teacher's message. If they ask for concrete changes (e.g. more sliders, extra parameters, richer initial_state, description updates), **implement them directly** in an updated LabComponentDefinition. Do **not** re-ask generic intake questions (topic, grade) when the request is already specific.
2. Output the **full** updated definition in a fenced JSON block:
```json
{{"type": "lab_definition", "definition": {{ ...complete LabComponentDefinition... }}}}
```
3. **Preserve `registry_key`** unless the teacher explicitly asks to rename the lab. Keep `subject_lab` and `renderer_profile` stable unless a change is clearly requested.
4. **Merge `initial_state`**: keep existing keys unless removal is requested; add new keys for new controls (e.g. refractive index ranges, extra toggles).
5. You may reply briefly in natural language (Chinese or English) before or after the JSON block explaining what changed.

If the teacher truly gives no usable spec, you may ask one short clarifying question — otherwise ship the updated JSON.
"""


def _lab_to_prompt_json(lab: LabDefinition) -> str:
    """Serialise lab fields the model needs to refine (no ORM internals)."""
    payload = {
        "registry_key": lab.registry_key,
        "title": lab.title,
        "description": lab.description,
        "subject_lab": _coerce_enum_str(lab.subject_lab),
        "renderer_profile": lab.renderer_profile,
        "dimension": _coerce_enum_str(lab.dimension),
        "initial_state": lab.initial_state,
        "reducer_spec": lab.reducer_spec,
        "lab_metadata": lab.lab_metadata,
        "visual_profile": lab.visual_profile,
    }
    return json.dumps(payload, ensure_ascii=False, indent=2)


def _build_refine_generate_prompt(lab: LabDefinition) -> str:
    return _REFINE_GENERATE_PROMPT_TEMPLATE.format(
        subject=_coerce_enum_str(lab.subject_lab),
        lab_json=_lab_to_prompt_json(lab),
    )


def _build_drive_system_prompt(lab: LabDefinition) -> str:
    return _DRIVE_PROMPT_TEMPLATE.format(
        title=lab.title,
        registry_key=lab.registry_key,
        subject=_coerce_enum_str(lab.subject_lab),
        renderer_profile=lab.renderer_profile,
        dimension=_coerce_enum_str(lab.dimension),
        initial_state=json.dumps(lab.initial_state, ensure_ascii=False, indent=2),
        reducer_spec=json.dumps(lab.reducer_spec or {}, ensure_ascii=False, indent=2),
    )


def _build_generate_system_prompt(subject: str) -> str:
    return _GENERATE_PROMPT_TEMPLATE.format(subject=subject)


# ---------------------------------------------------------------------------
# OhMyGPT Client
# ---------------------------------------------------------------------------

OHMYGPT_MODEL = "gpt-4o"


async def stream_ohmygpt(
    messages: list[dict[str, str]],
) -> AsyncGenerator[str, None]:
    """Yield streamed response chunks from OhMyGPT API."""
    headers = {
        "Authorization": f"Bearer {settings.ohmygpt_api_key}",
        "Content-Type": "application/json",
    }
    payload = {
        "model": OHMYGPT_MODEL,
        "messages": messages,
        "stream": True,
    }

    async with httpx.AsyncClient(timeout=120.0) as client:
        async with client.stream(
            "POST",
            f"{settings.ohmygpt_base_url}/chat/completions",
            headers=headers,
            json=payload,
        ) as resp:
            resp.raise_for_status()
            async for line in resp.aiter_lines():
                if not line.startswith("data: "):
                    continue
                data = line[6:].strip()
                if data == "[DONE]":
                    break
                try:
                    chunk = json.loads(data)
                except json.JSONDecodeError:
                    continue
                choices = chunk.get("choices")
                if not choices:
                    continue
                delta = (choices[0].get("delta") or {}).get("content") or ""
                if delta:
                    yield delta


# ---------------------------------------------------------------------------
# Lab Service
# ---------------------------------------------------------------------------

async def build_session_messages(
    db: AsyncSession,
    session: LabGenerationSession,
    user_message: str,
) -> tuple[list[dict[str, str]], str | None, dict | None]:
    """
    Build the messages list for OhMyGPT from session history + new user message.

    Returns:
        (messages_for_api, extracted_definition_json, extracted_commands_json)
    """
    # Load session with messages
    result = await db.execute(
        select(LabGenerationSession).where(LabGenerationSession.id == session.id)
    )
    session = result.scalar_one()

    # System prompt
    if session.mode == SessionMode.DRIVE:
        if session.lab_definition_id is None:
            raise ValueError("Drive mode requires a lab_definition_id")
        lab_result = await db.execute(
            select(LabDefinition).where(LabDefinition.id == session.lab_definition_id)
        )
        lab = lab_result.scalar_one_or_none()
        if lab is None:
            raise ValueError(f"Lab definition {session.lab_definition_id} not found")
        system_content = _build_drive_system_prompt(lab)
    else:
        # generate mode — optional lab_definition_id = refine existing draft / lab in DB
        subject = "general"
        refine_lab: LabDefinition | None = None
        if session.lab_definition_id:
            lab_result = await db.execute(
                select(LabDefinition).where(LabDefinition.id == session.lab_definition_id)
            )
            refine_lab = lab_result.scalar_one_or_none()
            if refine_lab:
                subject = _coerce_enum_str(refine_lab.subject_lab)
        if refine_lab is not None:
            system_content = _build_refine_generate_prompt(refine_lab)
        else:
            system_content = _build_generate_system_prompt(subject)

    messages: list[dict[str, str]] = [{"role": "system", "content": system_content}]

    # Append history
    for msg in session.messages:
        messages.append({"role": _coerce_enum_str(msg.role), "content": msg.content})

    # Append new user message
    messages.append({"role": "user", "content": user_message})

    return messages, None, None


async def save_assistant_message(
    db: AsyncSession,
    session_id: int,
    content: str,
    commands: dict | None = None,
    definition: dict | None = None,
    token_used: int | None = None,
) -> LabChatMessage:
    """Persist an assistant message after streaming is complete."""
    msg = LabChatMessage(
        session_id=session_id,
        role=MessageRole.ASSISTANT,
        content=content,
        commands=commands,
        definition=definition,
        token_used=token_used,
    )
    db.add(msg)
    await db.commit()
    await db.refresh(msg)
    return msg


def _unwrap_lab_definition_dict(parsed: dict[str, Any]) -> dict[str, Any] | None:
    """Recognise LabComponentDefinition or {{type: lab_definition, definition: {{...}}}}."""
    if parsed.get("type") == "lab_definition" and isinstance(parsed.get("definition"), dict):
        return parsed["definition"]
    if "registry_key" in parsed or "registryKey" in parsed:
        if ("subject_lab" in parsed or "subjectLab" in parsed) and (
            "initial_state" in parsed or "initialState" in parsed
        ):
            return parsed
    return None


def _normalize_commands_obj(parsed: Any) -> list[dict[str, Any]] | None:
    """Turn assorted JSON command shapes into a list for the frontend."""
    if parsed is None:
        return None
    if isinstance(parsed, list) and parsed and all(isinstance(x, dict) for x in parsed):
        return parsed
    if isinstance(parsed, dict):
        inner = parsed.get("commands")
        if isinstance(inner, list) and all(isinstance(x, dict) for x in inner):
            return inner
        if "type" in parsed or "command" in parsed:
            return [parsed]
    return None


def _pick_state_key(candidates: list[str], state_keys: set[str]) -> str | None:
    for c in candidates:
        if c in state_keys:
            return c
    return None


def _resolve_param_key_from_llm(
    target: str,
    property_name: str,
    inner_command: str,
    state_keys: set[str],
) -> str | None:
    """Map free-form LLM target strings to an initial_state key (Snell, sliders, …)."""
    blob = f"{target} {property_name} {inner_command}".lower()

    # Second medium / n2 (Chinese + English)
    if any(
        x in target
        for x in (
            "介质2",
            "介质二",
            "第二介质",
            "下层",
        )
    ) or "second medium" in blob:
        k = _pick_state_key(["n2", "n2_medium", "refractive_index_2"], state_keys)
        if k:
            return k
    if re.search(r"\bn2\b|n₂|n_2", target, re.IGNORECASE):
        k = _pick_state_key(["n2", "n2_medium", "refractive_index_2"], state_keys)
        if k:
            return k

    # First medium / n1
    if any(x in target for x in ("介质1", "介质一", "第一介质", "上层")) or "first medium" in blob:
        k = _pick_state_key(["n1", "n1_medium", "refractive_index_1"], state_keys)
        if k:
            return k
    if target.strip().lower() in ("n1", "n₁"):
        k = _pick_state_key(["n1", "n1_medium", "refractive_index_1"], state_keys)
        if k:
            return k

    # Water / glass hints → usually second medium when n2 exists
    if "水" in target or "water" in blob:
        k = _pick_state_key(["n2", "n2_medium"], state_keys)
        if k:
            return k

    # Generic: exact key present in state
    for raw in (target.strip(), property_name.strip()):
        if raw and raw in state_keys:
            return raw

    inner_u = inner_command.upper()
    if "CHANGE_MATERIAL" in inner_u or "MATERIAL" in inner_u:
        k = _pick_state_key(["n2", "n2_medium"], state_keys)
        if k:
            return k

    return None


def _coerce_one_drive_command_to_frontend(
    cmd: dict[str, Any],
    state_keys: set[str],
) -> dict[str, Any] | None:
    """Turn one model-produced command dict into {{type: SET_PARAM|SET_STATE|RESET}}."""
    t_raw = cmd.get("type")
    t = str(t_raw) if t_raw is not None else ""

    if t == "SET_PARAM":
        pl = cmd.get("payload")
        if isinstance(pl, dict):
            key = pl.get("key")
            val = pl.get("value")
            if key is not None and val is not None:
                return {"type": "SET_PARAM", "payload": {"key": str(key), "value": val}}
        if cmd.get("key") is not None and cmd.get("value") is not None:
            return {"type": "SET_PARAM", "payload": {"key": str(cmd["key"]), "value": cmd["value"]}}

    if t == "SET_STATE" and isinstance(cmd.get("payload"), dict):
        return {"type": "SET_STATE", "payload": dict(cmd["payload"])}

    if t == "RESET":
        return {"type": "RESET"}

    # Legacy / hallucinated shapes (CHANGE_MATERIAL, type:"command", SET_PROPERTY, …)
    value = cmd.get("value")
    target_raw = cmd.get("target")
    prop_raw = cmd.get("property")
    inner = cmd.get("command")
    key_flat = cmd.get("key")

    target = str(target_raw) if target_raw is not None else ""
    prop = str(prop_raw) if prop_raw is not None else ""
    inner_s = str(inner) if inner is not None else ""

    if value is None:
        return None

    if isinstance(key_flat, str) and key_flat in state_keys:
        return {"type": "SET_PARAM", "payload": {"key": key_flat, "value": value}}

    resolved = _resolve_param_key_from_llm(target, prop, inner_s, state_keys)
    if resolved:
        return {"type": "SET_PARAM", "payload": {"key": resolved, "value": value}}

    # SET_PROPERTY style: property field is the state key
    if prop and prop in state_keys:
        return {"type": "SET_PARAM", "payload": {"key": prop, "value": value}}

    return None


def normalize_drive_commands_for_frontend(
    commands: list[dict[str, Any]] | None,
    initial_state: dict[str, Any] | None,
) -> list[dict[str, Any]]:
    """
    Map LLM command JSON to the shapes LabHost applies: SET_PARAM, SET_STATE, RESET.
    """
    if not commands:
        return []
    keys: set[str] = set(initial_state.keys()) if isinstance(initial_state, dict) else set()
    out: list[dict[str, Any]] = []
    for raw in commands:
        if not isinstance(raw, dict):
            continue
        one = _coerce_one_drive_command_to_frontend(raw, keys)
        if one:
            out.append(one)
    return out


def _scan_json_objects_for_lab_definition(full_content: str) -> dict[str, Any] | None:
    """When model prints raw JSON (no fences), find the first object that looks like a lab def."""
    decoder = json.JSONDecoder()
    i = 0
    n = len(full_content)
    while i < n:
        if full_content[i] != "{":
            i += 1
            continue
        try:
            obj, end = decoder.raw_decode(full_content[i:])
        except json.JSONDecodeError:
            i += 1
            continue
        if isinstance(obj, dict):
            unwrapped = _unwrap_lab_definition_dict(obj)
            if unwrapped is not None:
                return unwrapped
        i += max(end, 1)
    return None


async def parse_assistant_raw_response(
    full_content: str,
) -> tuple[str, list[dict[str, Any]] | None, dict[str, Any] | None]:
    """
    Parse the raw assistant response string to extract:
    - plain text (narrative, excluding parsed JSON blocks where appropriate)
    - commands: list of command dicts (from ```json blocks or inline)
    - definition: LabComponentDefinition-shaped dict

    Returns (text, commands_list, definition).
    """
    command_list: list[dict[str, Any]] = []
    definition: dict[str, Any] | None = None
    text_parts: list[str] = []

    import re

    code_blocks = re.finditer(r"```(?:json)?\s*\n?(.*?)```", full_content, re.DOTALL)
    last_pos = 0
    for match in code_blocks:
        text_before = full_content[last_pos : match.start()]
        if text_before.strip():
            text_parts.append(text_before.strip())
        last_pos = match.end()

        block_content = match.group(1).strip()
        try:
            parsed: Any = json.loads(block_content)
        except json.JSONDecodeError:
            text_parts.append(block_content)
            continue

        if isinstance(parsed, dict):
            lab_inner = _unwrap_lab_definition_dict(parsed)
            if lab_inner is not None:
                definition = lab_inner
                continue

        cmds = _normalize_commands_obj(parsed)
        if cmds is not None:
            command_list.extend(cmds)
            continue

        if isinstance(parsed, dict):
            text_parts.append(block_content)

    if last_pos < len(full_content):
        remaining = full_content[last_pos:].strip()
        if remaining:
            text_parts.append(remaining)

    if definition is None:
        definition = _scan_json_objects_for_lab_definition(full_content)

    text = "\n\n".join(text_parts).strip() or full_content.strip()
    commands_out: list[dict[str, Any]] | None = command_list if command_list else None
    return text, commands_out, definition


# ---------------------------------------------------------------------------
# Lab definition persist / compare (save draft & publish)
# ---------------------------------------------------------------------------


def lab_content_signature_json(
    *,
    title: str,
    description: str | None,
    subject_lab: str,
    renderer_profile: str,
    dimension: str,
    initial_state: dict[str, Any],
    reducer_spec: dict[str, Any] | None,
    lab_metadata: dict[str, Any] | None,
    visual_profile: str | None,
    lab_type: str,
) -> str:
    """用于判断「当前编辑内容」是否与库中一致（与 status 无关）。"""
    blob: dict[str, Any] = {
        "title": title,
        "description": description,
        "subject_lab": subject_lab,
        "renderer_profile": renderer_profile,
        "dimension": dimension,
        "initial_state": initial_state,
        "reducer_spec": reducer_spec if reducer_spec is not None else {},
        "lab_metadata": lab_metadata if lab_metadata is not None else {},
        "visual_profile": visual_profile,
        "lab_type": lab_type,
    }
    return json.dumps(blob, sort_keys=True, ensure_ascii=False, separators=(",", ":"))


def signature_from_orm_lab(lab: LabDefinition) -> str:
    st = lab.initial_state if isinstance(lab.initial_state, dict) else {}
    rs = lab.reducer_spec if isinstance(lab.reducer_spec, dict) else (lab.reducer_spec or {})
    md = lab.lab_metadata if isinstance(lab.lab_metadata, dict) else (lab.lab_metadata or {})
    return lab_content_signature_json(
        title=lab.title,
        description=lab.description,
        subject_lab=_coerce_enum_str(lab.subject_lab),
        renderer_profile=lab.renderer_profile,
        dimension=_coerce_enum_str(lab.dimension),
        initial_state=st,
        reducer_spec=rs,
        lab_metadata=md,
        visual_profile=lab.visual_profile,
        lab_type=_coerce_enum_str(lab.lab_type),
    )


def signature_from_save_payload(payload: LabDefinitionSaveRequest) -> str:
    d = payload.model_dump(mode="json")
    return lab_content_signature_json(
        title=d["title"],
        description=d.get("description"),
        subject_lab=d["subject_lab"],
        renderer_profile=d["renderer_profile"],
        dimension=d["dimension"],
        initial_state=d.get("initial_state") or {},
        reducer_spec=d.get("reducer_spec"),
        lab_metadata=d.get("lab_metadata"),
        visual_profile=d.get("visual_profile"),
        lab_type=d["lab_type"],
    )


def apply_save_payload_to_lab(
    lab: LabDefinition,
    payload: LabDefinitionSaveRequest,
    *,
    target_status: OrmLabStatus,
) -> None:
    """将请求体中的定义字段写入 ORM 行（不含 registry_key）。"""
    lab.title = payload.title
    lab.description = payload.description
    lab.subject_lab = OrmSubjectLab(payload.subject_lab.value)
    lab.renderer_profile = payload.renderer_profile
    lab.dimension = OrmDimension(payload.dimension.value)
    lab.initial_state = dict(payload.initial_state)
    lab.reducer_spec = dict(payload.reducer_spec) if payload.reducer_spec is not None else None
    lab.lab_metadata = dict(payload.lab_metadata) if payload.lab_metadata is not None else None
    lab.lab_type = OrmLabType(payload.lab_type.value)
    lab.visual_profile = payload.visual_profile
    lab.status = target_status
