"""Unit tests: drive-mode command normalization for the frontend wire format."""

import pytest

from app.services.lab_service import normalize_drive_commands_for_frontend


@pytest.mark.unit
def test_normalize_legacy_change_material_snell() -> None:
    """LLM-style command with type/command/target maps to SET_PARAM n2."""
    initial = {"n1": 1.0, "n2": 1.5, "theta1": 30}
    raw = [
        {
            "type": "command",
            "command": "CHANGE_MATERIAL",
            "target": "介质2折射率",
            "value": 1.33,
        }
    ]
    out = normalize_drive_commands_for_frontend(raw, initial)
    assert len(out) == 1
    assert out[0]["type"] == "SET_PARAM"
    assert out[0]["payload"]["key"] == "n2"
    assert out[0]["payload"]["value"] == 1.33


@pytest.mark.unit
def test_normalize_set_param_passthrough() -> None:
    raw = [{"type": "SET_PARAM", "payload": {"key": "n2", "value": 1.0}}]
    initial = {"n1": 1.0, "n2": 1.5}
    out = normalize_drive_commands_for_frontend(raw, initial)
    assert out == raw


@pytest.mark.unit
def test_normalize_set_state_and_reset() -> None:
    initial = {"a": 1}
    out = normalize_drive_commands_for_frontend(
        [
            {"type": "SET_STATE", "payload": {"b": 2}},
            {"type": "RESET"},
        ],
        initial,
    )
    assert out[0]["type"] == "SET_STATE"
    assert out[1]["type"] == "RESET"


@pytest.mark.unit
def test_normalize_water_hint_second_medium() -> None:
    initial = {"n1": 1.0, "n2": 1.5}
    raw = [{"type": "command", "target": "水为介质2", "value": 1.33}]
    out = normalize_drive_commands_for_frontend(raw, initial)
    assert len(out) == 1
    assert out[0]["payload"]["key"] == "n2"
