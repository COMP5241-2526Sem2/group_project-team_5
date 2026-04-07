import { useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router";
import { FileText, Loader2, Upload, Save, Send, AlertTriangle } from "lucide-react";
import {
  createPaperApi,
  parsePaperPdfApi,
  publishPaperApi,
  uploadPaperSourcePdfApi,
  type PaperCreateQuestionDto,
  type PaperCreateRequestDto,
} from "../../../utils/paperApi";

type ParseState =
  | { status: "idle" }
  | { status: "parsing" }
  | { status: "parsed"; draft: PaperCreateRequestDto; warnings: string[]; preview: string }
  | { status: "error"; message: string };

export default function AssessmentPaperImport() {
  const navigate = useNavigate();
  const inputRef = useRef<HTMLInputElement | null>(null);

  const [file, setFile] = useState<File | null>(null);
  const [parseState, setParseState] = useState<ParseState>({ status: "idle" });
  const [saving, setSaving] = useState<"none" | "draft" | "published">("none");

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

  async function handleParse(selected: File) {
    setFile(selected);
    setParseState({ status: "parsing" });
    try {
      const res = await parsePaperPdfApi(selected);
      const d = res.paper_draft;
      // Defensive: backend guarantees >=1, but keep UI stable.
      const safeQuestions = (d.questions || []).length
        ? d.questions
        : [{ type: "Short Answer", prompt: "[占位] 请编辑题目内容", options: [] } as PaperCreateQuestionDto];
      setParseState({
        status: "parsed",
        draft: { ...d, questions: safeQuestions },
        warnings: res.warnings || [],
        preview: res.extracted_text_preview || "",
      });
    } catch (e) {
      setParseState({ status: "error", message: e instanceof Error ? e.message : "解析失败" });
    }
  }

  async function handleSave(target: "draft" | "published") {
    if (!file || !draft) return;
    if (!draft.title?.trim()) {
      window.alert("请填写试卷标题。");
      return;
    }
    if (!draft.grade?.trim() || !draft.subject?.trim()) {
      window.alert("请填写年级与学科。");
      return;
    }
    if (!draft.questions?.length) {
      window.alert("请至少保留一道题目。");
      return;
    }

    setSaving(target);
    try {
      // 1) create as draft (backend always creates draft)
      const created = await createPaperApi({
        ...draft,
        title: draft.title.trim(),
        grade: draft.grade.trim(),
        subject: draft.subject.trim(),
      });

      // 2) upload original PDF (best-effort)
      try {
        await uploadPaperSourcePdfApi(created.paper_id, file);
      } catch {
        // non-blocking
      }

      // 3) optional publish
      if (target === "published") {
        await publishPaperApi(created.paper_id);
      }

      navigate("/teacher/assessment/papers");
    } catch (e) {
      window.alert(e instanceof Error ? e.message : "保存失败");
    } finally {
      setSaving("none");
    }
  }

  return (
    <div style={{ height: "calc(100vh - 48px)", background: "#fafafa", overflow: "hidden", display: "flex", flexDirection: "column" }}>
      <div style={{ flexShrink: 0, padding: "18px 22px", borderBottom: "1px solid #e8eaed", background: "#fff", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 16, fontWeight: 800, color: "#0f0f23" }}>上传试卷 PDF 并解析</div>
          <div style={{ fontSize: 12, color: "#9ca3af", marginTop: 2 }}>解析后可编辑草稿，并保存为 draft / published</div>
        </div>
        <div style={{ display: "flex", gap: 10, flexShrink: 0 }}>
          <button
            type="button"
            onClick={() => navigate("/teacher/assessment/papers")}
            style={{ padding: "9px 12px", borderRadius: 10, border: "1px solid #e8eaed", background: "#fff", cursor: "pointer", fontSize: 13, color: "#374151" }}
          >
            返回试卷库
          </button>
          <button
            type="button"
            disabled={!draft || saving !== "none"}
            onClick={() => handleSave("draft")}
            style={{ padding: "9px 14px", borderRadius: 10, border: "1px solid #e8eaed", background: !draft || saving !== "none" ? "#f3f4f6" : "#fff", cursor: !draft || saving !== "none" ? "not-allowed" : "pointer", fontSize: 13, color: "#374151", display: "inline-flex", alignItems: "center", gap: 8 }}
          >
            {saving === "draft" ? <Loader2 size={14} style={{ animation: "spin 0.8s linear infinite" }} /> : <Save size={14} />}
            保存为 Draft
          </button>
          <button
            type="button"
            disabled={!draft || saving !== "none"}
            onClick={() => handleSave("published")}
            style={{ padding: "9px 14px", borderRadius: 10, border: "none", background: !draft || saving !== "none" ? "#93a6e8" : "#3b5bdb", cursor: !draft || saving !== "none" ? "not-allowed" : "pointer", fontSize: 13, fontWeight: 700, color: "#fff", display: "inline-flex", alignItems: "center", gap: 8 }}
          >
            {saving === "published" ? <Loader2 size={14} style={{ animation: "spin 0.8s linear infinite" }} /> : <Send size={14} />}
            保存并发布
          </button>
        </div>
      </div>

      <div style={{ flex: 1, minHeight: 0, overflow: "auto", padding: "18px 22px" }}>
        <div style={{ maxWidth: 980, margin: "0 auto" }}>
          <div style={{ display: "grid", gridTemplateColumns: "1.1fr 0.9fr", gap: 12, alignItems: "start" }}>
            <div style={{ background: "#fff", border: "1px solid #e8eaed", borderRadius: 12, padding: 16 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, marginBottom: 12 }}>
                <div style={{ fontSize: 13, fontWeight: 800, color: "#0f0f23" }}>1) 上传 PDF</div>
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
                  选择文件
                </button>
              </div>

              {!file && parseState.status === "idle" && (
                <div style={{ padding: "18px 12px", borderRadius: 10, border: "1px dashed #d1d5db", background: "#fafafa", color: "#6b7280", fontSize: 13, lineHeight: 1.6 }}>
                  支持 PDF（非扫描件效果更好）。上传后将尝试解析题目结构，结果可在右侧预览并编辑。
                </div>
              )}

              {file && (
                <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", borderRadius: 10, border: "1px solid #f0f2f5", background: "#fafafa" }}>
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
                  正在解析 PDF…
                </div>
              )}

              {parseState.status === "error" && (
                <div style={{ marginTop: 12, padding: "10px 12px", borderRadius: 10, border: "1px solid #fecaca", background: "#fef2f2", color: "#b91c1c", fontSize: 13 }}>
                  解析失败：{parseState.message}
                </div>
              )}

              {parseState.status === "parsed" && (
                <>
                  {parseState.warnings.length > 0 && (
                    <div style={{ marginTop: 12, padding: "10px 12px", borderRadius: 10, border: "1px solid #fde68a", background: "#fffbeb" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, fontWeight: 800, color: "#92400e", marginBottom: 6 }}>
                        <AlertTriangle size={14} />
                        解析提示
                      </div>
                      <ul style={{ margin: 0, paddingLeft: 18, color: "#92400e", fontSize: 12, lineHeight: 1.7 }}>
                        {parseState.warnings.map((w, i) => <li key={i}>{w}</li>)}
                      </ul>
                    </div>
                  )}

                  <div style={{ marginTop: 14 }}>
                    <div style={{ fontSize: 13, fontWeight: 800, color: "#0f0f23", marginBottom: 8 }}>2) 基本信息</div>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                      <label style={{ gridColumn: "1 / -1" }}>
                        <div style={{ fontSize: 12, fontWeight: 700, color: "#374151", marginBottom: 6 }}>标题</div>
                        <input
                          value={draft?.title ?? ""}
                          onChange={(e) => setDraftPatch({ title: e.target.value })}
                          style={{ width: "100%", padding: "10px 12px", borderRadius: 10, border: "1px solid #e8eaed", fontSize: 13 }}
                        />
                      </label>
                      <label>
                        <div style={{ fontSize: 12, fontWeight: 700, color: "#374151", marginBottom: 6 }}>年级</div>
                        <input
                          value={draft?.grade ?? ""}
                          onChange={(e) => setDraftPatch({ grade: e.target.value })}
                          style={{ width: "100%", padding: "10px 12px", borderRadius: 10, border: "1px solid #e8eaed", fontSize: 13 }}
                        />
                      </label>
                      <label>
                        <div style={{ fontSize: 12, fontWeight: 700, color: "#374151", marginBottom: 6 }}>学科</div>
                        <input
                          value={draft?.subject ?? ""}
                          onChange={(e) => setDraftPatch({ subject: e.target.value })}
                          style={{ width: "100%", padding: "10px 12px", borderRadius: 10, border: "1px solid #e8eaed", fontSize: 13 }}
                        />
                      </label>
                    </div>
                  </div>
                </>
              )}
            </div>

            <div style={{ background: "#fff", border: "1px solid #e8eaed", borderRadius: 12, padding: 16 }}>
              <div style={{ fontSize: 13, fontWeight: 800, color: "#0f0f23", marginBottom: 10 }}>抽取文本预览（用于排错）</div>
              {parseState.status === "parsed" ? (
                <pre style={{ margin: 0, whiteSpace: "pre-wrap", wordBreak: "break-word", fontSize: 12, color: "#374151", lineHeight: 1.6, maxHeight: 220, overflow: "auto", background: "#fafafa", border: "1px solid #f0f2f5", borderRadius: 10, padding: 10 }}>
                  {parseState.preview || "[空] 未抽取到足够文本（可能是扫描件）"}
                </pre>
              ) : (
                <div style={{ padding: "14px 12px", borderRadius: 10, border: "1px solid #f0f2f5", background: "#fafafa", color: "#9ca3af", fontSize: 12 }}>
                  上传并解析后显示
                </div>
              )}
            </div>
          </div>

          {parseState.status === "parsed" && (
            <div style={{ marginTop: 12, background: "#fff", border: "1px solid #e8eaed", borderRadius: 12, padding: 16 }}>
              <div style={{ fontSize: 13, fontWeight: 800, color: "#0f0f23", marginBottom: 12 }}>
                3) 题目预览与编辑（{draft?.questions.length ?? 0}）
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {draft!.questions.map((q, i) => (
                  <div key={i} style={{ padding: 12, borderRadius: 12, border: "1px solid #f0f2f5", background: "#fafafa" }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, marginBottom: 8 }}>
                      <div style={{ fontSize: 11, fontWeight: 800, color: "#6b7280", textTransform: "uppercase" }}>
                        #{i + 1} · {q.type}
                      </div>
                      <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "#374151" }}>
                        分值
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
                        <div style={{ fontSize: 12, fontWeight: 800, color: "#374151", marginBottom: 6 }}>选项</div>
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
                提示：本次解析为启发式规则，扫描版 PDF 可能抽不到文本；你仍可在此直接编辑后保存。
              </div>
            </div>
          )}
        </div>
      </div>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

