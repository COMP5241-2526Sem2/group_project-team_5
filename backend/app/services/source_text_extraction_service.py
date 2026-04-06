from __future__ import annotations

import io
import re
import zipfile
from xml.etree import ElementTree as ET

from fastapi import HTTPException
from pypdf import PdfReader


class SourceTextExtractionService:
    _max_bytes = 25 * 1024 * 1024

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
        if len(normalized) < 20:
            raise HTTPException(status_code=400, detail="insufficient extractable text from file")
        return normalized

    @staticmethod
    def _extract_pdf(data: bytes) -> str:
        reader = PdfReader(io.BytesIO(data))
        chunks: list[str] = []
        for page in reader.pages:
            try:
                chunks.append(page.extract_text() or "")
            except Exception:
                continue
        return "\n".join(chunks)

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
