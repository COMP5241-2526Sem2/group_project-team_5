"""Lab 保存接口内容指纹（与库比较）单元测试。"""
import pytest

from app.models.lab import (
    Dimension as OrmDimension,
    LabDefinition,
    LabStatus as OrmLabStatus,
    LabType as OrmLabType,
    SubjectLab as OrmSubjectLab,
)
from app.schemas.lab import (
    Dimension,
    LabDefinitionSaveRequest,
    LabStatus,
    LabType,
    SubjectLab,
)
from app.services import lab_service


def _save_request(**overrides: object) -> LabDefinitionSaveRequest:
    base = {
        "registry_key": "physics.test_sig",
        "title": "T",
        "description": "d",
        "subject_lab": SubjectLab.PHYSICS,
        "renderer_profile": "generic_2d",
        "dimension": Dimension.DIM_2D,
        "initial_state": {"n": 1},
        "reducer_spec": {"allowedCommands": ["SET_PARAM"]},
        "lab_metadata": {"topic": "x"},
        "lab_type": LabType.AI_GENERATED,
        "status": LabStatus.DRAFT,
        "visual_profile": "snells_law",
        "action": "save_draft",
    }
    base.update(overrides)
    return LabDefinitionSaveRequest.model_validate(base)


@pytest.mark.unit
def test_signature_payload_matches_orm_when_equivalent() -> None:
    """请求体与 ORM 行字段等价时指纹一致。"""
    payload = _save_request()
    lab = LabDefinition(
        registry_key="physics.test_sig",
        teacher_id=1,
        title="T",
        description="d",
        subject_lab=OrmSubjectLab.PHYSICS,
        renderer_profile="generic_2d",
        dimension=OrmDimension.DIM_2D,
        initial_state={"n": 1},
        reducer_spec={"allowedCommands": ["SET_PARAM"]},
        lab_metadata={"topic": "x"},
        lab_type=OrmLabType.AI_GENERATED,
        status=OrmLabStatus.DRAFT,
        visual_profile="snells_law",
    )
    assert lab_service.signature_from_save_payload(
        payload
    ) == lab_service.signature_from_orm_lab(lab)


@pytest.mark.unit
def test_signature_differs_when_initial_state_changes() -> None:
    a = _save_request()
    b = _save_request(initial_state={"n": 2})
    assert lab_service.signature_from_save_payload(a) != lab_service.signature_from_save_payload(b)


@pytest.mark.unit
def test_signature_treats_missing_reducer_like_empty_dict() -> None:
    """None reducer_spec 与 ORM 空 JSON 对齐为 {}。"""
    p_none = _save_request(reducer_spec=None)
    lab = LabDefinition(
        registry_key="physics.test_sig",
        teacher_id=1,
        title="T",
        description="d",
        subject_lab=OrmSubjectLab.PHYSICS,
        renderer_profile="generic_2d",
        dimension=OrmDimension.DIM_2D,
        initial_state={"n": 1},
        reducer_spec=None,
        lab_metadata={"topic": "x"},
        lab_type=OrmLabType.AI_GENERATED,
        status=OrmLabStatus.DRAFT,
        visual_profile="snells_law",
    )
    assert lab_service.signature_from_save_payload(p_none) == lab_service.signature_from_orm_lab(lab)
