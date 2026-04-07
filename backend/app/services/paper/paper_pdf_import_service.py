from __future__ import annotations

import os
import re
from dataclasses import dataclass

from fastapi import HTTPException

from app.config import settings
from app.schemas.paper import PaperCreateQuestion, PaperCreateQuestionOption, PaperCreateRequest
from app.services.paper.common.source_text_extraction_service import SourceTextExtractionService
from app.services.paper.paper_pdf_llm_parse_service import PaperPdfLlmParseService
from app.services.paper.paper_pdf_vision_parse_service import PaperPdfVisionParseService


@dataclass(slots=True)
class PaperPdfParseResult:
    paper_draft: PaperCreateRequest
    warnings: list[str]
    extracted_text_preview: str


class PaperPdfImportService:
    """Parse an uploaded PDF into PaperCreateRequest-compatible draft payload.

    Heuristic parsing first; optional text LLM when no questions but text exists;
    optional vision (page images) when PDF has no text layer.
    On total failure, raises HTTPException (422) — no placeholder questions.
    """

    _preview_chars = 1200

    @staticmethod
    async def parse_pdf_to_paper_draft(
        *,
        file_name: str,
        content_type: str | None,
        data: bytes,
        title: str | None = None,
        grade: str | None = None,
        subject: str | None = None,
        semester: str | None = None,
        exam_type: str | None = None,
        duration_min: int | None = None,
        total_score: int | None = None,
        course_id: int | None = None,
    ) -> PaperPdfParseResult:
        warnings: list[str] = []

        if not data:
            raise HTTPException(status_code=400, detail="uploaded file is empty")
        if len(data) > SourceTextExtractionService.max_upload_bytes:
            raise HTTPException(status_code=400, detail="file too large for extraction")

        extracted = SourceTextExtractionService.extract_normalized_pdf_text(data)

        if not extracted:
            if settings.paper_pdf_import_vision_enabled and settings.ohmygpt_api_key.strip():
                questions = await PaperPdfVisionParseService.parse_questions_from_pdf_bytes(data)
                preview = (questions[0].prompt if questions else "")[: PaperPdfImportService._preview_chars]
                return PaperPdfImportService._build_result(
                    questions=questions,
                    warnings=warnings,
                    extracted_text_preview=preview or "[Vision import — no text preview]",
                    file_name=file_name,
                    title=title,
                    grade=grade,
                    subject=subject,
                    semester=semester,
                    exam_type=exam_type,
                    duration_min=duration_min,
                    total_score=total_score,
                    course_id=course_id,
                )
            raise HTTPException(
                status_code=422,
                detail=(
                    "No extractable text from PDF (scanned/image-only). "
                    "Enable vision import (PAPER_PDF_IMPORT_VISION_ENABLED) and set OHMYGPT_API_KEY, "
                    "or use a PDF with embedded text."
                ),
            )

        extracted_preview = (extracted or "")[: PaperPdfImportService._preview_chars]

        inferred_title = (title or "").strip()
        if not inferred_title:
            stem = os.path.splitext(os.path.basename(file_name or "paper"))[0].strip()
            inferred_title = stem or "Imported Paper"

        resolved_grade = (grade or "").strip() or "Grade 7"
        resolved_subject = (subject or "").strip() or "Biology"
        resolved_exam_type = (exam_type or "").strip() or "imported_pdf"
        resolved_duration = int(duration_min) if duration_min is not None else 60
        resolved_total = int(total_score) if total_score is not None else 100

        questions = PaperPdfImportService._parse_questions(extracted, warnings=warnings)

        if not questions:
            if settings.paper_pdf_import_llm_enabled:
                questions = await PaperPdfLlmParseService.parse_questions_from_text(extracted)
            else:
                raise HTTPException(
                    status_code=422,
                    detail="Could not parse questions from PDF; enable paper PDF LLM import or use numbered questions (1. 2.).",
                )

        if total_score is None:
            resolved_total = max(1, len(questions))

        paper_draft = PaperCreateRequest(
            title=inferred_title,
            grade=resolved_grade,
            subject=resolved_subject,
            semester=(semester or None),
            exam_type=resolved_exam_type,
            duration_min=max(1, resolved_duration),
            total_score=max(1, resolved_total),
            course_id=course_id,
            questions=questions,
        )

        return PaperPdfParseResult(
            paper_draft=paper_draft,
            warnings=warnings,
            extracted_text_preview=extracted_preview,
        )

    @staticmethod
    def _build_result(
        *,
        questions: list[PaperCreateQuestion],
        warnings: list[str],
        extracted_text_preview: str,
        file_name: str | None,
        title: str | None,
        grade: str | None,
        subject: str | None,
        semester: str | None,
        exam_type: str | None,
        duration_min: int | None,
        total_score: int | None,
        course_id: int | None,
    ) -> PaperPdfParseResult:
        inferred_title = (title or "").strip()
        if not inferred_title:
            stem = os.path.splitext(os.path.basename(file_name or "paper"))[0].strip()
            inferred_title = stem or "Imported Paper"

        resolved_grade = (grade or "").strip() or "Grade 7"
        resolved_subject = (subject or "").strip() or "Biology"
        resolved_exam_type = (exam_type or "").strip() or "imported_pdf"
        resolved_duration = int(duration_min) if duration_min is not None else 60
        resolved_total = int(total_score) if total_score is not None else 100

        if total_score is None:
            resolved_total = max(1, len(questions))

        paper_draft = PaperCreateRequest(
            title=inferred_title,
            grade=resolved_grade,
            subject=resolved_subject,
            semester=(semester or None),
            exam_type=resolved_exam_type,
            duration_min=max(1, resolved_duration),
            total_score=max(1, resolved_total),
            course_id=course_id,
            questions=questions,
        )

        return PaperPdfParseResult(
            paper_draft=paper_draft,
            warnings=warnings,
            extracted_text_preview=extracted_text_preview,
        )

    @staticmethod
    def _parse_questions(text: str, *, warnings: list[str]) -> list[PaperCreateQuestion]:
        stripped = (text or "").strip()
        if not stripped:
            return []

        lines = [PaperPdfImportService._normalize_line(ln) for ln in text.splitlines()]
        lines = [ln for ln in lines if ln]

        blocks = PaperPdfImportService._split_question_blocks(lines)
        if not blocks:
            tlen = len(stripped)
            min_frag = 5 if tlen < 200 else 12
            frags = re.split(r"[。！？!?]", text)
            prompts = [f.strip() for f in frags if len(f.strip()) >= min_frag][:10]
            return [
                PaperCreateQuestion(
                    type="Short Answer",
                    prompt=p,
                    difficulty=None,
                    explanation=None,
                    answer=None,
                    options=[],
                    score=None,
                )
                for p in prompts
            ]

        out: list[PaperCreateQuestion] = []
        for _num, block_lines in blocks[:120]:
            prompt, options = PaperPdfImportService._parse_question_block(block_lines)
            if not prompt:
                continue
            qtype = PaperPdfImportService._infer_question_type(prompt, options)
            out.append(
                PaperCreateQuestion(
                    type=qtype,
                    prompt=prompt,
                    difficulty=None,
                    explanation=None,
                    answer=None,
                    options=[
                        PaperCreateQuestionOption(key=o.key, text=o.text, is_correct=False) for o in options
                    ],
                    score=None,
                )
            )
        return out

    @staticmethod
    def _normalize_line(line: str) -> str:
        ln = (line or "").strip()
        ln = re.sub(r"\s+", " ", ln)
        ln = ln.replace("\u00a0", " ")
        return ln.strip()

    @staticmethod
    def _split_question_blocks(lines: list[str]) -> list[tuple[int, list[str]]]:
        blocks: list[tuple[int, list[str]]] = []
        current_num: int | None = None
        current_lines: list[str] = []

        for line in lines:
            m = re.match(r"^(\d{1,3})\s*[\.\)\]）、】【:：]\s*(.*)$", line)
            if m:
                if current_num is not None and current_lines:
                    blocks.append((current_num, current_lines))
                current_num = int(m.group(1))
                rest = (m.group(2) or "").strip()
                current_lines = [rest] if rest else []
                continue

            if current_num is not None:
                current_lines.append(line)

        if current_num is not None and current_lines:
            blocks.append((current_num, current_lines))
        return blocks

    @dataclass(slots=True)
    class _Opt:
        key: str
        text: str

    @staticmethod
    def _parse_question_block(lines: list[str]) -> tuple[str, list[_Opt]]:
        stem_lines: list[str] = []
        opts: list[PaperPdfImportService._Opt] = []

        for line in lines:
            inline = PaperPdfImportService._split_inline_options(line)
            if inline:
                for k, t in inline:
                    opts.append(PaperPdfImportService._Opt(key=k, text=t))
                continue

            m = re.match(r"^([A-H])[\.\)）]\s*(.+)$", line)
            if m:
                opts.append(PaperPdfImportService._Opt(key=m.group(1), text=m.group(2).strip()))
                continue

            if opts:
                last = opts[-1]
                last.text = f"{last.text} {line}".strip()
                continue

            stem_lines.append(line)

        prompt = " ".join(stem_lines).strip()
        return prompt, opts

    @staticmethod
    def _split_inline_options(line: str) -> list[tuple[str, str]]:
        if not line:
            return []
        parts = re.split(r"(?=(?:^|\s)([A-H])[\.\)）]\s*)", f" {line}".strip())
        out: list[tuple[str, str]] = []
        key: str | None = None
        buf: list[str] = []
        for tok in parts:
            tok = (tok or "").strip()
            if not tok:
                continue
            if len(tok) == 1 and tok.isalpha() and tok.upper() in "ABCDEFGH":
                if key is not None and buf:
                    out.append((key, " ".join(buf).strip()))
                key = tok.upper()
                buf = []
            else:
                buf.append(tok)
        if key is not None and buf:
            out.append((key, " ".join(buf).strip()))
        return out if len(out) >= 2 else []

    @staticmethod
    def _infer_question_type(prompt: str, options: list[_Opt]) -> str:
        if options:
            return "MCQ"
        low = (prompt or "").lower()
        if "true/false" in low or "判断" in prompt or "对" in prompt and "错" in prompt:
            return "True/False"
        if "____" in prompt or "填空" in prompt:
            return "Fill-blank"
        return "Short Answer"
