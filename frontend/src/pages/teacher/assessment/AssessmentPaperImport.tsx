import { useMemo, useRef, useState, type CSSProperties, type DragEvent } from "react";
import { useNavigate } from "react-router";
import { FileText, Loader2, Upload, Save, Send, AlertTriangle } from "lucide-react";
import ImportedPaperPreview from "./ImportedPaperPreview";
import {
  createPaperApi,
  parsePaperPdfApi,
  type PaperCreateQuestionDto,
  type PaperCreateRequestDto,
} from "../../../utils/paperApi";

type ParseState =
  | { status: "idle" }
  | { status: "parsing" }
  | { status: "parsed"; draft: PaperCreateRequestDto; warnings: string[] }
  | { status: "error"; message: string };

export default function AssessmentPaperImport() {
  const navigate = useNavigate();
  const inputRef = useRef<HTMLInputElement | null>(null);

  const [file, setFile] = useState<File | null>(null);
  const [parseState, setParseState] = useState<ParseState>({ status: "idle" });
  const [saving, setSaving] = useState<"none" | "draft" | "published">("none");
  const [dropHover, setDropHover] = useState(false);
  const draft: PaperCreateRequestDto | null = useMemo(() => {
    if (parseState.status !== "parsed") return null;
    return parseState.draft;
  }, [parseState]);

  function setDraftPatch(patch: Partial<PaperCreateRequestDto>) {
    setParseState((prev) => {
      if (prev.status !== "parsed") return prev;
      return { ...prev, draft: { ...prev.draft, ...patch } };
    });
  }

  function setQuestionPatch(i: number, patch: Partial<PaperCreateQuestionDto>) {
    setParseState((prev) => {
      if (prev.status !== "parsed") return prev;
      const qs = prev.draft.questions.map((q, j) => (j === i ? { ...q, ...patch } : q));
      return { ...prev, draft: { ...prev.draft, questions: qs } };
    });
  }

  function isPdfFile(f: File): boolean {
    return f.type === "application/pdf" || f.name.toLowerCase().endsWith(".pdf");
  }

  async function handleParse(selected: File) {
    setFile(selected);
    setParseState({ status: "parsing" });
    try {
      const res = await parsePaperPdfApi(selected);
      const d = res.paper_draft;
      setParseState({
        status: "parsed",
        draft: d,
        warnings: res.warnings || [],
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Failed to parse";
      setParseState({ status: "error", message: msg });
      window.alert(msg);
    }
  }

  async function handleSave(target: "draft" | "published") {
    if (!file || !draft) return;
    if (!draft.title?.trim()) {
      window.alert("Please enter a paper title.");
      return;
    }
    if (!draft.grade?.trim() || !draft.subject?.trim()) {
      window.alert("Please enter grade and subject.");
      return;
    }
    if (!draft.questions?.length) {
      window.alert("Please keep at least one question.");
      return;
    }

    setSaving(target);
    try {
      await createPaperApi({
        ...draft,
        title: draft.title.trim(),
        grade: draft.grade.trim(),
        subject: draft.subject.trim(),
        publish_after: target === "published",
      });

      navigate("/teacher/assessment/papers");
    } catch (e) {
      window.alert(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving("none");
    }
  }

  const parsing = parseState.status === "parsing";

  function handlePdfDropZoneDragOver(e: DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (parsing) return;
    e.dataTransfer.dropEffect = "copy";
  }

  function handlePdfDropZoneDragEnter(e: DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (parsing) return;
    setDropHover(true);
  }

  function handlePdfDropZoneDragLeave(e: DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    const next = e.relatedTarget as Node | null;
    if (next && e.currentTarget.contains(next)) return;
    setDropHover(false);
  }

  function handlePdfDropZoneDrop(e: DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    setDropHover(false);
    if (parsing) return;
    const dropped = Array.from(e.dataTransfer.files).find(isPdfFile);
    if (dropped) {
      void handleParse(dropped);
      return;
    }
    if (e.dataTransfer.files.length > 0) {
      window.alert("Please drop a PDF file.");
    }
  }

  const pdfDropZoneStyle = (base: CSSProperties): CSSProperties => ({
    ...base,
    ...(dropHover && !parsing
      ? {
          borderColor: "#3b5bdb",
          background: "#f0f4ff",
          boxShadow: "inset 0 0 0 1px rgba(59, 91, 219, 0.25)",
        }
      : {}),
  });

  return (
    <div style={{ height: "calc(100vh - 48px)", background: "#fafafa", overflow: "hidden", display: "flex", flexDirection: "column" }}>
      <div style={{ flexShrink: 0, padding: "18px 22px", borderBottom: "1px solid #e8eaed", background: "#fff", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 16, fontWeight: 800, color: "#0f0f23" }}>Import PDF exam paper</div>
          <div style={{ fontSize: 12, color: "#9ca3af", marginTop: 2 }}>
            Parse into an editable draft, then save as draft / published
          </div>
        </div>
        <div style={{ display: "flex", gap: 10, flexShrink: 0 }}>
          <button
            type="button"
            onClick={() => navigate("/teacher/assessment/papers")}
            style={{ padding: "9px 12px", borderRadius: 10, border: "1px solid #e8eaed", background: "#fff", cursor: "pointer", fontSize: 13, color: "#374151" }}
          >
            Back to library
          </button>
          <button
            type="button"
            disabled={!draft || saving !== "none"}
            onClick={() => handleSave("draft")}
            style={{ padding: "9px 14px", borderRadius: 10, border: "1px solid #e8eaed", background: !draft || saving !== "none" ? "#f3f4f6" : "#fff", cursor: !draft || saving !== "none" ? "not-allowed" : "pointer", fontSize: 13, color: "#374151", display: "inline-flex", alignItems: "center", gap: 8 }}
          >
            {saving === "draft" ? <Loader2 size={14} style={{ animation: "spin 0.8s linear infinite" }} /> : <Save size={14} />}
            Save as Draft
          </button>
          <button
            type="button"
            disabled={!draft || saving !== "none"}
            onClick={() => handleSave("published")}
            style={{ padding: "9px 14px", borderRadius: 10, border: "none", background: !draft || saving !== "none" ? "#93a6e8" : "#3b5bdb", cursor: !draft || saving !== "none" ? "not-allowed" : "pointer", fontSize: 13, fontWeight: 700, color: "#fff", display: "inline-flex", alignItems: "center", gap: 8 }}
          >
            {saving === "published" ? <Loader2 size={14} style={{ animation: "spin 0.8s linear infinite" }} /> : <Send size={14} />}
            Save & Publish
          </button>
        </div>
      </div>

      <div style={{ flex: 1, minHeight: 0, overflow: "auto", padding: "18px 22px", display: "flex", flexDirection: "column" }}>
        <div
          style={{
            maxWidth: 1320,
            margin: "0 auto",
            width: "100%",
            display: "flex",
            flexDirection: "row",
            alignItems: "flex-start",
            gap: 18,
          }}
        >
          {/* Left: grows with content; outer middle column scrolls (overflow:auto) */}
          <div style={{ flex: 1, minWidth: 0, paddingRight: 2 }}>
            <div style={{ background: "#fff", border: "1px solid #e8eaed", borderRadius: 12, padding: 16 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, marginBottom: 12 }}>
                <div style={{ fontSize: 13, fontWeight: 800, color: "#0f0f23" }}>1) Upload PDF</div>
                <input
                  ref={inputRef}
                  type="file"
                  accept="application/pdf,.pdf"
                  style={{ display: "none" }}
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) void handleParse(f);
                    if (inputRef.current) inputRef.current.value = "";
                  }}
                />
                <button
                  type="button"
                  onClick={() => inputRef.current?.click()}
                  style={{ padding: "8px 12px", borderRadius: 10, border: "1px solid #e8eaed", background: "#fff", cursor: "pointer", fontSize: 13, color: "#374151", display: "inline-flex", alignItems: "center", gap: 8 }}
                >
                  <Upload size={14} style={{ color: "#6b7280" }} />
                  Choose file
                </button>
              </div>

              {!file && parseState.status === "idle" && (
                <div
                  onDragEnter={handlePdfDropZoneDragEnter}
                  onDragLeave={handlePdfDropZoneDragLeave}
                  onDragOver={handlePdfDropZoneDragOver}
                  onDrop={handlePdfDropZoneDrop}
                  style={pdfDropZoneStyle({
                    padding: "18px 12px",
                    borderRadius: 10,
                    border: "1px dashed #d1d5db",
                    background: "#fafafa",
                    color: "#6b7280",
                    fontSize: 13,
                    lineHeight: 1.6,
                    transition: "border-color 0.15s ease, background 0.15s ease, box-shadow 0.15s ease",
                    cursor: parsing ? "default" : dropHover ? "copy" : "default",
                  })}
                >
                  Supports PDF (digital PDFs work best). After uploading, we will try to parse questions. You can preview and edit the result on the right.
                  <div style={{ marginTop: 8, fontSize: 12, color: "#9ca3af" }}>
                    Saving stores only the structured paper (title, questions, etc.); the PDF file is not kept in the database.
                  </div>
                  <div style={{ marginTop: 4, fontSize: 12, color: "#9ca3af" }}>Or drag and drop a PDF here.</div>
                </div>
              )}

              {file && (
                <div
                  onDragEnter={handlePdfDropZoneDragEnter}
                  onDragLeave={handlePdfDropZoneDragLeave}
                  onDragOver={handlePdfDropZoneDragOver}
                  onDrop={handlePdfDropZoneDrop}
                  style={pdfDropZoneStyle({
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    padding: "10px 12px",
                    borderRadius: 10,
                    border: "1px solid #f0f2f5",
                    background: "#fafafa",
                    transition: "border-color 0.15s ease, background 0.15s ease, box-shadow 0.15s ease",
                    cursor: parsing ? "default" : dropHover ? "copy" : "default",
                  })}
                  title={parsing ? undefined : "Drop another PDF to replace"}
                >
                  <FileText size={16} style={{ color: "#6b7280" }} />
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: "#111827", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{file.name}</div>
                    <div style={{ fontSize: 12, color: "#9ca3af" }}>{(file.size / 1024 / 1024).toFixed(2)} MB</div>
                  </div>
                </div>
              )}

              {parseState.status === "parsing" && (
                <div style={{ marginTop: 12, display: "flex", alignItems: "center", gap: 10, color: "#6b7280", fontSize: 13 }}>
                  <Loader2 size={16} style={{ animation: "spin 0.8s linear infinite" }} />
                  Parsing PDF…
                </div>
              )}

              {parseState.status === "error" && (
                <div style={{ marginTop: 12, padding: "10px 12px", borderRadius: 10, border: "1px solid #fecaca", background: "#fef2f2", color: "#b91c1c", fontSize: 13 }}>
                  Failed to parse: {parseState.message}
                </div>
              )}

              {parseState.status === "parsed" && (
                <>
                  {parseState.warnings.length > 0 && (
                    <div style={{ marginTop: 12, padding: "10px 12px", borderRadius: 10, border: "1px solid #fde68a", background: "#fffbeb" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, fontWeight: 800, color: "#92400e", marginBottom: 6 }}>
                        <AlertTriangle size={14} />
                        Parse warnings
                      </div>
                      <ul style={{ margin: 0, paddingLeft: 18, color: "#92400e", fontSize: 12, lineHeight: 1.7 }}>
                        {parseState.warnings.map((w, i) => <li key={i}>{w}</li>)}
                      </ul>
                    </div>
                  )}

                  <div style={{ marginTop: 14 }}>
                    <div style={{ fontSize: 13, fontWeight: 800, color: "#0f0f23", marginBottom: 8 }}>2) Paper info</div>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                      <label style={{ gridColumn: "1 / -1" }}>
                        <div style={{ fontSize: 12, fontWeight: 700, color: "#374151", marginBottom: 6 }}>Title</div>
                        <input
                          value={draft?.title ?? ""}
                          onChange={(e) => setDraftPatch({ title: e.target.value })}
                          style={{ width: "100%", padding: "10px 12px", borderRadius: 10, border: "1px solid #e8eaed", fontSize: 13 }}
                        />
                      </label>
                      <label>
                        <div style={{ fontSize: 12, fontWeight: 700, color: "#374151", marginBottom: 6 }}>Grade</div>
                        <input
                          value={draft?.grade ?? ""}
                          onChange={(e) => setDraftPatch({ grade: e.target.value })}
                          style={{ width: "100%", padding: "10px 12px", borderRadius: 10, border: "1px solid #e8eaed", fontSize: 13 }}
                        />
                      </label>
                      <label>
                        <div style={{ fontSize: 12, fontWeight: 700, color: "#374151", marginBottom: 6 }}>Subject</div>
                        <input
                          value={draft?.subject ?? ""}
                          onChange={(e) => setDraftPatch({ subject: e.target.value })}
                          style={{ width: "100%", padding: "10px 12px", borderRadius: 10, border: "1px solid #e8eaed", fontSize: 13 }}
                        />
                      </label>
                    </div>
                  </div>

                  <div style={{ marginTop: 20, paddingTop: 18, borderTop: "1px solid #f0f2f5" }}>
                    <div style={{ fontSize: 13, fontWeight: 800, color: "#0f0f23", marginBottom: 12 }}>
                      3) Questions (preview &amp; edit) ({draft?.questions.length ?? 0})
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                      {draft!.questions.map((q, i) => (
                        <div key={i} style={{ padding: 12, borderRadius: 12, border: "1px solid #f0f2f5", background: "#fafafa" }}>
                          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, marginBottom: 8 }}>
                            <div style={{ fontSize: 11, fontWeight: 800, color: "#6b7280", textTransform: "uppercase" }}>
                              #{i + 1} · {q.type}
                            </div>
                            <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "#374151" }}>
                              Score
                              <input
                                type="number"
                                min={0}
                                step={0.5}
                                value={q.score ?? ""}
                                onChange={(e) => setQuestionPatch(i, { score: e.target.value === "" ? undefined : Number(e.target.value) })}
                                style={{ width: 84, padding: "6px 8px", borderRadius: 8, border: "1px solid #e8eaed", fontSize: 12 }}
                              />
                            </label>
                          </div>
                          <textarea
                            value={q.prompt}
                            onChange={(e) => setQuestionPatch(i, { prompt: e.target.value })}
                            rows={3}
                            style={{ width: "100%", padding: "10px 12px", borderRadius: 10, border: "1px solid #e8eaed", fontSize: 13, resize: "vertical" }}
                          />
                          {(q.options || []).length > 0 && (
                            <div style={{ marginTop: 10 }}>
                              <div style={{ fontSize: 12, fontWeight: 800, color: "#374151", marginBottom: 6 }}>Options</div>
                              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                                {(q.options || []).map((opt, j) => (
                                  <div key={j} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                    <span style={{ width: 26, fontSize: 12, fontWeight: 800, color: "#6b7280" }}>{opt.key}</span>
                                    <input
                                      value={opt.text}
                                      onChange={(e) => {
                                        const text = e.target.value;
                                        setQuestionPatch(i, {
                                          options: (q.options || []).map((o, jj) => (jj === j ? { ...o, text } : o)),
                                        });
                                      }}
                                      style={{ flex: 1, padding: "8px 10px", borderRadius: 10, border: "1px solid #e8eaed", fontSize: 13 }}
                                    />
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                    <div style={{ marginTop: 10, fontSize: 12, color: "#9ca3af", lineHeight: 1.6 }}>
                      Tip: Parsed structure is heuristic; edit as needed. The preview on the right updates live.
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Right: sticky + max height so preview stays visible while page scrolls */}
          <div
            style={{
              flex: "0 0 42%",
              maxWidth: 520,
              minWidth: 280,
              position: "sticky",
              top: 0,
              alignSelf: "flex-start",
              maxHeight: "calc(100vh - 120px)",
              display: "flex",
              flexDirection: "column",
            }}
          >
            <div
              style={{
                background: "#fff",
                border: "1px solid #e8eaed",
                borderRadius: 12,
                padding: 16,
                flex: 1,
                minHeight: 0,
                display: "flex",
                flexDirection: "column",
                overflow: "hidden",
                maxHeight: "calc(100vh - 120px)",
              }}
            >
              <div style={{ fontSize: 13, fontWeight: 800, color: "#0f0f23", marginBottom: 6, flexShrink: 0 }}>
                Rendered paper preview
              </div>
              <div style={{ fontSize: 12, color: "#9ca3af", marginBottom: 12, lineHeight: 1.5, flexShrink: 0 }}>
                Live layout from the draft on the left. Edits apply immediately.
              </div>
              <div style={{ flex: 1, minHeight: 0, overflowY: "auto", overflowX: "hidden" }}>
                {parseState.status === "parsed" && draft ? (
                  <>
                    <ImportedPaperPreview draft={draft} />
                    <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 10, textAlign: "center", lineHeight: 1.5 }}>
                      Export: browser menu → Print → Save as PDF (optional).
                    </div>
                  </>
                ) : (
                  <div style={{ padding: "24px 12px", borderRadius: 10, border: "1px solid #f0f2f5", background: "#fafafa", color: "#9ca3af", fontSize: 12, textAlign: "center" }}>
                    Shown after upload &amp; parse
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

