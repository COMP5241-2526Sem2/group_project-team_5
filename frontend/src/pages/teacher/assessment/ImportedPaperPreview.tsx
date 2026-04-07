import { useMemo } from "react";
import type { PaperCreateQuestionDto, PaperCreateRequestDto } from "../../../utils/paperApi";

const SECTION_LABELS: Record<string, string> = {
  MCQ: "Multiple Choice",
  "True/False": "True / False",
  "Fill-blank": "Fill in the blank",
  "Short Answer": "Short Answer",
};

const SECTION_ORDER = ["MCQ", "True/False", "Fill-blank", "Short Answer"];

type SectionGroup = { key: string; label: string; questions: PaperCreateQuestionDto[] };

function groupBySection(questions: PaperCreateQuestionDto[]): SectionGroup[] {
  const buckets = new Map<string, PaperCreateQuestionDto[]>();
  for (const q of questions) {
    const k = (q.type || "Short Answer").trim();
    if (!buckets.has(k)) buckets.set(k, []);
    buckets.get(k)!.push(q);
  }
  const out: SectionGroup[] = [];
  for (const key of SECTION_ORDER) {
    const qs = buckets.get(key);
    if (qs?.length) {
      out.push({
        key,
        label: SECTION_LABELS[key] ?? key,
        questions: qs,
      });
    }
  }
  for (const [key, qs] of buckets) {
    if (SECTION_ORDER.includes(key)) continue;
    if (qs.length) {
      out.push({ key, label: SECTION_LABELS[key] ?? key, questions: qs });
    }
  }
  return out;
}

function defaultScorePerQuestion(draft: PaperCreateRequestDto): number {
  const n = draft.questions?.length ?? 0;
  if (n <= 0) return 0;
  return Math.round((draft.total_score ?? 100) / n);
}

export default function ImportedPaperPreview({ draft }: { draft: PaperCreateRequestDto }) {
  const sections = useMemo(() => groupBySection(draft.questions || []), [draft.questions]);
  const fallbackPts = useMemo(() => defaultScorePerQuestion(draft), [draft]);

  return (
    <div
      style={{
        background: "#e8ecf2",
        borderRadius: 12,
        padding: 12,
        border: "1px solid #e2e8f0",
      }}
    >
      <div
        style={{
          maxWidth: 520,
          margin: "0 auto",
          background: "#fff",
          boxShadow: "0 4px 24px rgba(15, 23, 42, 0.08)",
          borderRadius: 4,
          overflow: "hidden",
          fontFamily: '"Georgia", "Times New Roman", serif',
        }}
      >
        {/* Blue header */}
        <div
          style={{
            background: "linear-gradient(180deg, #1e4db8 0%, #1a3f99 100%)",
            color: "#fff",
            padding: "20px 22px 18px",
            textAlign: "center",
          }}
        >
          <div style={{ fontSize: 17, fontWeight: 700, letterSpacing: 0.2, lineHeight: 1.35 }}>
            {draft.title || "Untitled paper"}
          </div>
          <div
            style={{
              marginTop: 14,
              display: "flex",
              justifyContent: "center",
              gap: 28,
              flexWrap: "wrap",
              fontSize: 13,
              fontFamily: "system-ui, -apple-system, sans-serif",
              opacity: 0.95,
            }}
          >
            <span>Name: ________________</span>
            <span>Class: ________________</span>
            <span>Student ID: ________________</span>
          </div>
        </div>

        {/* Instructions */}
        <div
          style={{
            background: "#fffbeb",
            borderLeft: "4px solid #f59e0b",
            margin: 0,
            padding: "14px 18px",
            fontFamily: "system-ui, -apple-system, sans-serif",
            fontSize: 12.5,
            color: "#1f2937",
            lineHeight: 1.55,
          }}
        >
          <div style={{ fontWeight: 800, marginBottom: 8, color: "#111827" }}>Instructions</div>
          <ol style={{ margin: 0, paddingLeft: 18 }}>
            <li>Read all questions carefully before answering.</li>
            <li>
              Total points: <strong>{draft.total_score ?? 100}</strong>. Time allowed:{" "}
              <strong>{draft.duration_min ?? 45}</strong> minutes.
            </li>
            <li>For multiple choice, select the best answer unless stated otherwise.</li>
          </ol>
        </div>

        {/* Metadata line */}
        <div
          style={{
            textAlign: "center",
            fontSize: 11,
            color: "#9ca3af",
            padding: "10px 16px",
            fontFamily: "system-ui, -apple-system, sans-serif",
            borderBottom: "1px solid #f1f5f9",
          }}
        >
          {draft.subject || "—"} · {draft.grade || "—"} · {draft.exam_type || "imported"}
        </div>

        {/* Sections */}
        <div style={{ padding: "16px 18px 28px" }}>
          {sections.map((sec, secIdx) => {
            const sectionPts = sec.questions.reduce((s, q) => s + (q.score ?? fallbackPts), 0);
            const priorCount = sections.slice(0, secIdx).reduce((n, s) => n + s.questions.length, 0);
            return (
              <div key={sec.key} style={{ marginBottom: 22 }}>
                <div
                  style={{
                    background: "#f1f5f9",
                    borderRadius: "8px 8px 0 0",
                    padding: "10px 12px",
                    fontSize: 13,
                    fontWeight: 800,
                    color: "#1e4db8",
                    fontFamily: "system-ui, -apple-system, sans-serif",
                  }}
                >
                  {sec.label} ({sec.questions.length} question{sec.questions.length === 1 ? "" : "s"} · section total{" "}
                  {sectionPts} pts)
                </div>
                <div style={{ border: "1px solid #e2e8f0", borderTop: "none", borderRadius: "0 0 8px 8px" }}>
                  {sec.questions.map((q, j) => {
                    const idx = priorCount + j + 1;
                    const pts = q.score ?? fallbackPts;
                    return (
                      <div
                        key={`${sec.key}-${idx}`}
                        style={{
                          padding: "14px 14px 16px",
                          borderBottom: "1px solid #f1f5f9",
                          fontFamily: "system-ui, -apple-system, sans-serif",
                        }}
                      >
                        <div style={{ fontSize: 13, color: "#111827", lineHeight: 1.55 }}>
                          <span style={{ fontWeight: 700 }}>{idx}.</span> {q.prompt}
                          <span style={{ color: "#9ca3af", fontWeight: 500, marginLeft: 6 }}>
                            ({pts} pts)
                          </span>
                        </div>
                        {(q.options?.length ?? 0) > 0 && (
                          <div style={{ marginTop: 10, paddingLeft: 4 }}>
                            {(q.options || []).map((opt) => (
                              <div
                                key={opt.key}
                                style={{
                                  fontSize: 12.5,
                                  color: "#374151",
                                  lineHeight: 1.5,
                                  marginBottom: 6,
                                  paddingLeft: 8,
                                }}
                              >
                                <span style={{ fontWeight: 700, color: "#6b7280", marginRight: 8 }}>
                                  {opt.key}.
                                </span>
                                {opt.text}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
