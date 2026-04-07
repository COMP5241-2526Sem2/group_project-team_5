from __future__ import annotations

"""试卷 CRUD / 导入导出 / 发布状态；不提供 Paper 在线作答与阅卷 API（请使用 quizzes 模块）。"""

from typing import Literal
from urllib.parse import quote

from fastapi import APIRouter, Depends, File, Form, Header, HTTPException, Query, UploadFile
from fastapi.responses import Response
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.schemas.paper import (
    PaperCreateRequest,
    PaperCreateResponse,
    PaperDetailResponse,
    PaperListResponse,
    PaperPdfParseResponse,
    PaperStatusMutationResponse,
    PaperUpdateRequest,
    PaperUpdateResponse,
)
from app.services.paper.paper_pdf_import_service import PaperPdfImportService
from app.services.paper.paper_service import PaperService

router = APIRouter(tags=["papers"])


def _require_user_id(x_user_id: int | None) -> int:
    if x_user_id is None:
        raise HTTPException(status_code=400, detail="X-User-Id header is required")
    return x_user_id


@router.get("/papers", response_model=PaperListResponse)
async def list_papers(
    status: Literal["draft", "published", "closed"] | None = Query(default=None),
    subject: str | None = Query(default=None),
    grade: str | None = Query(default=None),
    semester: str | None = Query(default=None),
    exam_type: str | None = Query(default=None),
    q: str | None = Query(default=None),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    x_user_id: int | None = Header(default=None, alias="X-User-Id"),
) -> PaperListResponse:
    actor_id = _require_user_id(x_user_id)
    return await PaperService.list_papers(
        db=db,
        actor_id=actor_id,
        status=status,
        subject=subject,
        grade=grade,
        semester=semester,
        exam_type=exam_type,
        q=q,
        page=page,
        page_size=page_size,
    )


@router.post("/papers", response_model=PaperCreateResponse)
async def create_paper(
    payload: PaperCreateRequest,
    db: AsyncSession = Depends(get_db),
    x_user_id: int | None = Header(default=None, alias="X-User-Id"),
) -> PaperCreateResponse:
    actor_id = _require_user_id(x_user_id)
    return await PaperService.create_paper(db=db, actor_id=actor_id, payload=payload)


@router.post("/papers/parse-pdf", response_model=PaperPdfParseResponse)
async def parse_paper_pdf(
    file: UploadFile = File(...),
    title: str | None = Form(default=None),
    grade: str | None = Form(default=None),
    subject: str | None = Form(default=None),
    semester: str | None = Form(default=None),
    exam_type: str | None = Form(default=None),
    duration_min: int | None = Form(default=None),
    total_score: int | None = Form(default=None),
    course_id: int | None = Form(default=None),
    x_user_id: int | None = Header(default=None, alias="X-User-Id"),
) -> PaperPdfParseResponse:
    _require_user_id(x_user_id)
    data = await file.read()
    result = PaperPdfImportService.parse_pdf_to_paper_draft(
        file_name=file.filename or "paper.pdf",
        content_type=file.content_type,
        data=data,
        title=title,
        grade=grade,
        subject=subject,
        semester=semester,
        exam_type=exam_type,
        duration_min=duration_min,
        total_score=total_score,
        course_id=course_id,
    )
    return PaperPdfParseResponse(
        paper_draft=result.paper_draft,
        warnings=result.warnings,
        extracted_text_preview=result.extracted_text_preview,
    )


@router.get("/papers/{paper_id}", response_model=PaperDetailResponse)
async def get_paper_detail(
    paper_id: int,
    db: AsyncSession = Depends(get_db),
    x_user_id: int | None = Header(default=None, alias="X-User-Id"),
) -> PaperDetailResponse:
    actor_id = _require_user_id(x_user_id)
    return await PaperService.get_paper_detail(db=db, actor_id=actor_id, paper_id=paper_id)


@router.put("/papers/{paper_id}", response_model=PaperUpdateResponse)
async def update_draft_paper(
    paper_id: int,
    payload: PaperUpdateRequest,
    db: AsyncSession = Depends(get_db),
    x_user_id: int | None = Header(default=None, alias="X-User-Id"),
) -> PaperUpdateResponse:
    actor_id = _require_user_id(x_user_id)
    return await PaperService.update_draft_paper(db=db, actor_id=actor_id, paper_id=paper_id, payload=payload)


@router.post("/papers/{paper_id}/source-pdf", status_code=204)
async def upload_paper_source_pdf(
    paper_id: int,
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    x_user_id: int | None = Header(default=None, alias="X-User-Id"),
) -> None:
    actor_id = _require_user_id(x_user_id)
    paper = await PaperService._get_paper_for_write(db, actor_id, paper_id)

    data = await file.read()
    if not data:
        raise HTTPException(status_code=400, detail="uploaded file is empty")
    if len(data) > 25 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="file too large")

    paper.source_pdf = data
    paper.source_file_name = (file.filename or "").strip() or None
    await db.commit()
    return None


@router.get("/papers/{paper_id}/export")
async def export_paper(
    paper_id: int,
    export_format: Literal["html", "pdf", "txt"] | None = Query(default=None, alias="format"),
    db: AsyncSession = Depends(get_db),
    x_user_id: int | None = Header(default=None, alias="X-User-Id"),
) -> Response:
    """File download. Omit `format` for legacy behavior (PDF if stored, else HTML)."""
    actor_id = _require_user_id(x_user_id)
    body, media_type, filename = await PaperService.export_paper_file(
        db, actor_id, paper_id, export_format=export_format
    )
    if "pdf" in media_type:
        ext = ".pdf"
    elif "text/plain" in media_type:
        ext = ".txt"
    else:
        ext = ".html"
    ascii_fallback = f"paper_{paper_id}{ext}"
    encoded = quote(filename, safe="")
    disposition = f'attachment; filename="{ascii_fallback}"; filename*=UTF-8\'\'{encoded}'
    return Response(content=body, media_type=media_type, headers={"Content-Disposition": disposition})


@router.post("/papers/{paper_id}/publish", response_model=PaperStatusMutationResponse)
async def publish_paper(
    paper_id: int,
    db: AsyncSession = Depends(get_db),
    x_user_id: int | None = Header(default=None, alias="X-User-Id"),
) -> PaperStatusMutationResponse:
    actor_id = _require_user_id(x_user_id)
    return await PaperService.publish_paper(db=db, actor_id=actor_id, paper_id=paper_id)


@router.post("/papers/{paper_id}/close", response_model=PaperStatusMutationResponse)
async def close_paper(
    paper_id: int,
    db: AsyncSession = Depends(get_db),
    x_user_id: int | None = Header(default=None, alias="X-User-Id"),
) -> PaperStatusMutationResponse:
    actor_id = _require_user_id(x_user_id)
    return await PaperService.close_paper(db=db, actor_id=actor_id, paper_id=paper_id)


@router.post("/papers/{paper_id}/reopen", response_model=PaperStatusMutationResponse)
async def reopen_paper(
    paper_id: int,
    db: AsyncSession = Depends(get_db),
    x_user_id: int | None = Header(default=None, alias="X-User-Id"),
) -> PaperStatusMutationResponse:
    actor_id = _require_user_id(x_user_id)
    return await PaperService.reopen_paper(db=db, actor_id=actor_id, paper_id=paper_id)


@router.post("/papers/{paper_id}/unpublish", response_model=PaperStatusMutationResponse)
async def unpublish_paper(
    paper_id: int,
    db: AsyncSession = Depends(get_db),
    x_user_id: int | None = Header(default=None, alias="X-User-Id"),
) -> PaperStatusMutationResponse:
    actor_id = _require_user_id(x_user_id)
    return await PaperService.unpublish_paper(db=db, actor_id=actor_id, paper_id=paper_id)


@router.delete("/papers/{paper_id}", status_code=204)
async def delete_paper(
    paper_id: int,
    db: AsyncSession = Depends(get_db),
    x_user_id: int | None = Header(default=None, alias="X-User-Id"),
) -> None:
    actor_id = _require_user_id(x_user_id)
    await PaperService.delete_paper(db=db, actor_id=actor_id, paper_id=paper_id)
    return None
