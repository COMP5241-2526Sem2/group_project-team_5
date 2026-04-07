from __future__ import annotations

import io
import re
import zipfile
from xml.etree import ElementTree as ET

from fastapi import HTTPException
from pypdf import PdfReader


class SourceTextExtractionService:
    _max_bytes = 25 * 1024 * 1024
    max_upload_bytes = _max_bytes  # public alias for callers (e.g. paper import)

    @staticmethod
    def extract_text(file_name: str, content_type: str | None, data: bytes) -> str:
        if not data:
            raise HTTPException(status_code=400, detail="uploaded file is empty")
        if len(data) > SourceTextExtractionService._max_bytes:
            raise HTTPException(status_code=400, detail="file too large for extraction")

        name = (file_name or "").lower()
        ctype = (content_type or "").lower()

        if name.endswith(".pdf") or "pdf" in ctype:
            text = SourceTextExtractionService._extract_pdf(data)
        elif name.endswith(".txt") or name.endswith(".md") or "text/" in ctype:
            text = SourceTextExtractionService._extract_text_like(data)
        elif name.endswith(".docx") or "wordprocessingml" in ctype:
            text = SourceTextExtractionService._extract_docx(data)
        else:
            raise HTTPException(status_code=400, detail="unsupported file type for text extraction (supported: pdf, txt, md, docx)")

        normalized = re.sub(r"\s+", " ", text).strip()
        if not normalized:
            raise HTTPException(
                status_code=422,
                detail="No extractable text from file (may be scanned/image-only or empty).",
            )
        return normalized

    @staticmethod
    def _extract_pdf_pypdf(data: bytes) -> str:
        reader = PdfReader(io.BytesIO(data))
        chunks: list[str] = []
        for page in reader.pages:
            try:
                chunks.append(page.extract_text() or "")
            except Exception:
                continue
        return "\n".join(chunks)

    @staticmethod
    def _extract_pdf_pymupdf(data: bytes) -> str:
        import fitz  # pymupdf

        doc = fitz.open(stream=data, filetype="pdf")
        try:
            chunks: list[str] = []
            for page in doc:
                try:
                    chunks.append(page.get_text() or "")
                except Exception:
                    continue
            return "\n".join(chunks)
        finally:
            doc.close()

    @staticmethod
    def _extract_pdf(data: bytes) -> str:
        raw = SourceTextExtractionService._extract_pdf_pypdf(data)
        if re.sub(r"\s+", " ", raw).strip():
            return raw
        try:
            raw2 = SourceTextExtractionService._extract_pdf_pymupdf(data)
        except ImportError:
            return raw
        except Exception:
            return raw
        return raw2 if re.sub(r"\s+", " ", raw2).strip() else raw

    @staticmethod
    def extract_normalized_pdf_text(data: bytes) -> str:
        """Best-effort PDF text; returns empty string if no text layer (e.g. scanned). Does not raise."""
        raw = SourceTextExtractionService._extract_pdf(data)
        return re.sub(r"\s+", " ", raw).strip()

    @staticmethod
    def _extract_text_like(data: bytes) -> str:
        for encoding in ("utf-8", "utf-8-sig", "gb18030", "latin-1"):
            try:
                return data.decode(encoding)
            except Exception:
                continue
        raise HTTPException(status_code=400, detail="failed to decode text file")

    @staticmethod
    def _extract_docx(data: bytes) -> str:
        try:
            with zipfile.ZipFile(io.BytesIO(data)) as zf:
                xml = zf.read("word/document.xml")
        except Exception as exc:
            raise HTTPException(status_code=400, detail="invalid docx file") from exc

        try:
            root = ET.fromstring(xml)
        except Exception as exc:
            raise HTTPException(status_code=400, detail="failed to parse docx xml") from exc

        ns = {"w": "http://schemas.openxmlformats.org/wordprocessingml/2006/main"}
        texts: list[str] = []
        for node in root.findall(".//w:t", ns):
            if node.text:
                texts.append(node.text)
        return "\n".join(texts)
