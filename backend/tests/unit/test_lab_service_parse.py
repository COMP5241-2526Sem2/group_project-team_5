"""Unit tests for lab assistant response parsing."""

import pytest

from app.services.lab_service import parse_assistant_raw_response


@pytest.mark.unit
@pytest.mark.asyncio
async def test_parse_lab_definition_fenced_wrapper() -> None:
    """Extract definition from ```json block with type lab_definition."""
    raw = '''Sure.
```json
{"type": "lab_definition", "definition": {"registry_key": "chemistry.ph_1", "title": "pH", "subject_lab": "chemistry", "renderer_profile": "generic_2d", "dimension": "2d", "initial_state": {"ph": 7}}}
```
'''
    text, cmds, definition = await parse_assistant_raw_response(raw)
    assert definition is not None
    assert definition.get("registry_key") == "chemistry.ph_1"
    assert cmds is None


@pytest.mark.unit
@pytest.mark.asyncio
async def test_parse_lab_definition_plain_shape_in_fence() -> None:
    """Extract when model omits wrapper but JSON matches LabComponentDefinition."""
    raw = """```json
{"registry_key": "physics.x", "title": "X", "subject_lab": "physics", "renderer_profile": "mechanics_3d", "dimension": "3d", "initial_state": {"angle": 0}}
```
"""
    _text, cmds, definition = await parse_assistant_raw_response(raw)
    assert definition is not None
    assert definition["registry_key"] == "physics.x"
    assert cmds is None


@pytest.mark.unit
@pytest.mark.asyncio
async def test_parse_inline_json_without_fence() -> None:
    """Fallback scan finds raw JSON object in narrative."""
    raw = (
        "Here is the configuration: "
        '{"registry_key":"bio.z","title":"Z","subject_lab":"biology",'
        '"renderer_profile":"cell_3d","dimension":"3d","initial_state":{}}'
        " — let me know if you need changes."
    )
    _text, _cmds, definition = await parse_assistant_raw_response(raw)
    assert definition is not None
    assert definition.get("registry_key") == "bio.z"


@pytest.mark.unit
@pytest.mark.asyncio
async def test_parse_commands_list_in_fence() -> None:
    raw = """Applied:
```json
[{"type": "SET_PARAM", "payload": {"k": 1}}]
```
"""
    _text, cmds, definition = await parse_assistant_raw_response(raw)
    assert definition is None
    assert cmds is not None
    assert len(cmds) == 1
    assert cmds[0]["type"] == "SET_PARAM"
