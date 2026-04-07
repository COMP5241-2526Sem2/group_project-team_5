"""Render exam paper exports (HTML fallback when no source PDF is stored)."""

from __future__ import annotations

import html
import re

from app.schemas.paper import PaperDetailResponse


_ROMAN = ("I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X")


def sanitize_download_filename(name: str, default: str = "paper") -> str:
    base = (name or "").strip() or default
    base = re.sub(r'[<>:"/\\|?*\x00-\x1f]', "_", base)
    if len(base) > 200:
        base = base[:200]
    return base


def _section_roman(index_one_based: int) -> str:
    if 1 <= index_one_based <= len(_ROMAN):
        return _ROMAN[index_one_based - 1]
    return str(index_one_based)


def render_paper_html(detail: PaperDetailResponse) -> str:
    """Build a printable HTML document for teacher download."""
    title = html.escape(detail.title)
    meta_parts = [
        html.escape(detail.subject),
        html.escape(detail.grade),
        html.escape(detail.course_name),
        html.escape(detail.exam_type),
    ]
    meta_line = " · ".join(meta_parts)
    sem = html.escape(detail.semester) if detail.semester else "—"

    parts: list[str] = [
        "<!DOCTYPE html>",
        '<html lang="en">',
        "<head>",
        '<meta charset="utf-8"/>',
        f"<title>{title}</title>",
        "<style>",
        "body{font-family:Georgia,serif;max-width:800px;margin:24px auto;color:#111;line-height:1.5;}",
        "h1{font-size:22px;text-align:center;margin-bottom:8px;}",
        ".meta{font-size:13px;color:#555;text-align:center;margin-bottom:24px;}",
        ".band{background:#2d5be3;color:#fff;padding:20px 24px;text-align:center;border-radius:8px 8px 0 0;}",
        ".instructions{background:#fefce8;border:1px solid #fde68a;border-top:none;padding:14px 18px;font-size:13px;margin-bottom:20px;}",
        "section.block{border:1px solid #e5e7eb;border-radius:8px;margin-bottom:16px;overflow:hidden;}",
        ".sec-h{padding:12px 16px;background:#f9fafb;border-bottom:1px solid #e5e7eb;font-weight:700;color:#1e40af;}",
        ".q{padding:12px 16px;border-bottom:1px solid #f3f4f6;}",
        ".q:last-child{border-bottom:none;}",
        ".prompt{font-size:14px;margin-bottom:8px;}",
        ".opts{margin:0 0 0 18px;padding:0;}",
        ".opts li{font-size:13px;margin:4px 0;}",
        ".blank{display:inline-block;min-width:180px;border-bottom:1px solid #9ca3af;}",
        ".sa-box{min-height:56px;border:1px dashed #d1d5db;border-radius:6px;background:#f9fafb;margin-top:8px;}",
        "</style>",
        "</head>",
        "<body>",
        f'<div class="band"><h1 style="margin:0;font-size:20px;">{title}</h1>',
        "<p style=\"margin:12px 0 0;font-size:14px;\">"
        "Name: ________________ &nbsp; Class: ________________ &nbsp; Student ID: ________________</p>",
        "</div>",
        '<div class="instructions">',
        "<strong>Instructions</strong><br/>",
        f"1. This exam has {detail.question_count} question(s), total {detail.total_score} points, "
        f"{detail.duration_min} minutes.<br/>",
        f"2. Semester: {sem}<br/>",
        "3. Read each question carefully before answering.",
        "</div>",
        f'<p class="meta">{html.escape(meta_line)}</p>',
    ]

    for si, sec in enumerate(detail.sections, start=1):
        roman = _section_roman(si)
        sec_title = html.escape(sec.title)
        parts.append('<section class="block">')
        parts.append(
            f'<div class="sec-h">{roman}. {sec_title} '
            f"({sec.question_count} questions · {sec.score_each:g} pts each · "
            f"section total {sec.total_score:g} pts)</div>"
        )
        for q in sec.questions:
            parts.append('<div class="q">')
            parts.append(
                f'<div class="prompt"><strong>{q.order}.</strong> {html.escape(q.prompt)} '
                f'<span style="color:#6b7280;">({q.score:g} pts)</span></div>'
            )
            qt = (q.type or "").upper()
            if q.options:
                parts.append("<ol class=\"opts\">")
                for opt in q.options:
                    label = html.escape(f"{opt.key}. {opt.text}")
                    parts.append(f"<li>{label}</li>")
                parts.append("</ol>")
            elif qt in ("TRUE_FALSE", "TF"):
                parts.append('<p style="font-size:13px;color:#6b7280;">( True / False )</p>')
            elif "FILL" in qt:
                parts.append('<p><span class="blank">&nbsp;</span></p>')
            else:
                parts.append('<div class="sa-box"></div>')
            parts.append("</div>")
        parts.append("</section>")

    parts.append("</body></html>")
    return "\n".join(parts)


def render_paper_txt(detail: PaperDetailResponse) -> str:
    """Plain-text export for simple editing or printing."""
    lines: list[str] = [
        detail.title,
        "=" * min(len(detail.title), 72),
        f"{detail.subject} · {detail.grade} · {detail.course_name} · {detail.exam_type}",
        f"Total: {detail.total_score} pts · {detail.duration_min} min · {detail.question_count} questions",
        "",
    ]
    for si, sec in enumerate(detail.sections, start=1):
        roman = _section_roman(si)
        lines.append(
            f"{roman}. {sec.title} "
            f"({sec.question_count} questions, {sec.score_each:g} pts each, section {sec.total_score:g} pts)"
        )
        lines.append("-" * 48)
        for q in sec.questions:
            lines.append(f"{q.order}. ({q.score:g} pts) {q.prompt}")
            qt = (q.type or "").upper()
            if q.options:
                for opt in q.options:
                    lines.append(f"   {opt.key}. {opt.text}")
            elif qt in ("TRUE_FALSE", "TF"):
                lines.append("   ( True / False )")
            elif "FILL" in qt:
                lines.append("   _________________________________")
            else:
                lines.append("")
            lines.append("")
        lines.append("")
    return "\n".join(lines).rstrip() + "\n"
