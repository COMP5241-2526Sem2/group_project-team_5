import { useEffect, useState, useCallback } from 'react';
import { useNavigate, useParams } from 'react-router';
import { ChevronLeft, Loader2, Save } from 'lucide-react';
import {
  fetchPaperDetailApi,
  updatePaperApi,
  type PaperCreateQuestionDto,
  type PaperCreateRequestDto,
  type PaperDetailDto,
} from '../../../utils/paperApi';

function detailQuestionTypeToCreateType(t: string): string {
  const raw = (t || '').trim().toUpperCase().replace(/[\s/-]/g, '_');
  if (raw === 'MCQ_SINGLE' || raw === 'MCQ_MULTI') return 'MCQ';
  if (raw === 'TRUE_FALSE') return 'True/False';
  if (raw === 'FILL_BLANK') return 'Fill-blank';
  if (raw === 'SHORT_ANSWER') return 'Short Answer';
  if (raw === 'ESSAY') return 'Essay';
  return 'Short Answer';
}

function flattenDetailToQuestions(detail: PaperDetailDto): PaperCreateQuestionDto[] {
  const out: PaperCreateQuestionDto[] = [];
  const sections = [...detail.sections].sort((a, b) => a.order - b.order);
  for (const sec of sections) {
    const qs = [...sec.questions].sort((a, b) => a.order - b.order);
    for (const q of qs) {
      out.push({
        type: detailQuestionTypeToCreateType(q.type),
        prompt: q.prompt,
        difficulty: q.difficulty ?? undefined,
        explanation: q.explanation ?? undefined,
        answer: q.answer ?? undefined,
        score: q.score,
        options: (q.options || []).map((o) => ({
          key: o.key,
          text: o.text,
          is_correct: o.is_correct === true,
        })),
      });
    }
  }
  return out;
}

export default function AssessmentPaperEdit() {
  const navigate = useNavigate();
  const { paperId: paperIdParam } = useParams<{ paperId: string }>();
  const paperId = paperIdParam ? Number(paperIdParam) : NaN;

  const [detail, setDetail] = useState<PaperDetailDto | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [title, setTitle] = useState('');
  const [grade, setGrade] = useState('');
  const [subject, setSubject] = useState('');
  const [semester, setSemester] = useState<string | null>(null);
  const [examType, setExamType] = useState('');
  const [durationMin, setDurationMin] = useState(45);
  const [totalScore, setTotalScore] = useState(100);
  const [courseId, setCourseId] = useState<number | undefined>(undefined);
  const [questions, setQuestions] = useState<PaperCreateQuestionDto[]>([]);

  const goBack = useCallback(() => {
    navigate('/teacher/assessment/papers');
  }, [navigate]);

  useEffect(() => {
    if (!Number.isFinite(paperId) || paperId <= 0) {
      setLoadError('Invalid paper ID');
      setLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      setLoading(true);
      setLoadError(null);
      try {
        const d = await fetchPaperDetailApi(paperId);
        if (cancelled) return;
        setDetail(d);
        setTitle(d.title);
        setGrade(d.grade);
        setSubject(d.subject);
        setSemester(d.semester);
        setExamType(d.exam_type || 'ai_generated');
        setDurationMin(d.duration_min);
        setTotalScore(d.total_score);
        setCourseId(d.course_id);
        setQuestions(flattenDetailToQuestions(d));
      } catch (e) {
        if (!cancelled) {
          setLoadError(e instanceof Error ? e.message : 'Failed to load paper');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [paperId]);

  const isDraft = detail?.status === 'draft';

  async function handleSave() {
    if (!detail || !isDraft) return;
    if (!title.trim()) {
      window.alert('Please enter a title.');
      return;
    }
    if (questions.length === 0) {
      window.alert('Please add at least one question.');
      return;
    }
    setSaving(true);
    try {
      const payload: PaperCreateRequestDto = {
        title: title.trim(),
        grade: grade.trim(),
        subject: subject.trim(),
        semester: semester || null,
        exam_type: examType || 'ai_generated',
        duration_min: durationMin,
        total_score: totalScore,
        course_id: courseId,
        questions,
      };
      await updatePaperApi(paperId, payload);
      navigate('/teacher/assessment/papers');
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Failed to save';
      window.alert(msg);
    } finally {
      setSaving(false);
    }
  }

  function updateQuestion(i: number, patch: Partial<PaperCreateQuestionDto>) {
    setQuestions((prev) => prev.map((q, j) => (j === i ? { ...q, ...patch } : q)));
  }

  function updateQuestionPrompt(i: number, prompt: string) {
    updateQuestion(i, { prompt });
  }

  function updateQuestionScore(i: number, score: number) {
    if (!Number.isFinite(score) || score < 0) return;
    updateQuestion(i, { score });
  }

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 320, gap: 10, color: '#6b7280', fontSize: 14 }}>
        <Loader2 size={22} style={{ animation: 'spin 0.8s linear infinite' }} />
        Loading paper…
      </div>
    );
  }

  if (loadError || !detail) {
    return (
      <div style={{ padding: 24 }}>
        <button type="button" onClick={goBack} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 16, border: 'none', background: 'none', cursor: 'pointer', color: '#3b5bdb', fontSize: 13 }}>
          <ChevronLeft size={18} /> Back
        </button>
        <div style={{ color: '#b91c1c', fontSize: 14 }}>{loadError || 'Paper not found'}</div>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 48px)', overflow: 'hidden', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif', background: '#fff' }}>
      <div style={{ flexShrink: 0, padding: '14px 20px', borderBottom: '1px solid #e8eaed', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
          <button type="button" onClick={goBack} style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '6px 10px', borderRadius: 8, border: '1px solid #e8eaed', background: '#fff', cursor: 'pointer', fontSize: 13, color: '#374151' }}>
            <ChevronLeft size={16} /> Back
          </button>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: '#0f0f23' }}>Edit draft paper</div>
            <div style={{ fontSize: 11, color: '#9ca3af' }}>ID {detail.paper_id} · {detail.course_name}</div>
          </div>
        </div>
        <button
          type="button"
          onClick={handleSave}
          disabled={!isDraft || saving}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            padding: '8px 18px',
            borderRadius: 9,
            border: 'none',
            cursor: !isDraft || saving ? 'not-allowed' : 'pointer',
            background: !isDraft || saving ? '#e8eaed' : '#3b5bdb',
            color: !isDraft || saving ? '#9ca3af' : '#fff',
            fontSize: 13,
            fontWeight: 600,
          }}
        >
          {saving ? <Loader2 size={14} style={{ animation: 'spin 0.8s linear infinite' }} /> : <Save size={14} />}
          Save
        </button>
      </div>

      {!isDraft && (
        <div style={{ margin: '12px 20px 0', padding: '10px 14px', borderRadius: 8, background: '#fef9c3', color: '#a16207', fontSize: 12 }}>
          Only draft papers can be edited and saved. Current status: {detail.status}. Please go back to the list.
        </div>
      )}

      <div style={{ flex: 1, overflow: 'auto', padding: '0 20px 24px' }}>
        <div style={{ maxWidth: 880, margin: '0 auto', paddingTop: 16 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
            <label style={{ gridColumn: '1 / -1' }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 6 }}>Title</div>
              <input value={title} onChange={(e) => setTitle(e.target.value)} disabled={!isDraft} style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid #e8eaed', fontSize: 14 }} />
            </label>
            <label>
              <div style={{ fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 6 }}>Grade</div>
              <input value={grade} onChange={(e) => setGrade(e.target.value)} disabled={!isDraft} style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid #e8eaed', fontSize: 14 }} />
            </label>
            <label>
              <div style={{ fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 6 }}>Subject</div>
              <input value={subject} onChange={(e) => setSubject(e.target.value)} disabled={!isDraft} style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid #e8eaed', fontSize: 14 }} />
            </label>
            <label>
              <div style={{ fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 6 }}>Semester (optional)</div>
              <input value={semester ?? ''} onChange={(e) => setSemester(e.target.value || null)} disabled={!isDraft} style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid #e8eaed', fontSize: 14 }} />
            </label>
            <label>
              <div style={{ fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 6 }}>Exam type</div>
              <input value={examType} onChange={(e) => setExamType(e.target.value)} disabled={!isDraft} style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid #e8eaed', fontSize: 14 }} />
            </label>
            <label>
              <div style={{ fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 6 }}>Duration (min)</div>
              <input type="number" min={1} value={durationMin} onChange={(e) => setDurationMin(Number(e.target.value))} disabled={!isDraft} style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid #e8eaed', fontSize: 14 }} />
            </label>
            <label>
              <div style={{ fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 6 }}>Total score</div>
              <input type="number" min={1} value={totalScore} onChange={(e) => setTotalScore(Number(e.target.value))} disabled={!isDraft} style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid #e8eaed', fontSize: 14 }} />
            </label>
          </div>

          <div style={{ fontSize: 13, fontWeight: 700, color: '#0f0f23', marginBottom: 10 }}>Questions ({questions.length})</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {questions.map((q, i) => (
              <div key={i} style={{ padding: 14, borderRadius: 12, border: '1px solid #e8eaed', background: '#fafafa' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, gap: 8 }}>
                  <span style={{ fontSize: 11, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase' }}>#{i + 1} · {q.type}</span>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#374151' }}>
                    Score
                    <input type="number" min={0} step={0.5} value={q.score ?? 0} onChange={(e) => updateQuestionScore(i, Number(e.target.value))} disabled={!isDraft} style={{ width: 72, padding: '4px 8px', borderRadius: 6, border: '1px solid #e8eaed' }} />
                  </label>
                </div>
                <textarea
                  value={q.prompt}
                  onChange={(e) => updateQuestionPrompt(i, e.target.value)}
                  disabled={!isDraft}
                  rows={3}
                  style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid #e8eaed', fontSize: 13, resize: 'vertical', marginBottom: 8 }}
                />
                {(q.type === 'True/False' || q.type === 'Fill-blank' || q.type === 'Short Answer' || q.type === 'Essay') && (
                  <label style={{ display: 'block', fontSize: 12 }}>
                    <span style={{ fontWeight: 600, color: '#374151' }}>Answer key</span>
                    <input
                      value={q.answer ?? ''}
                      onChange={(e) => updateQuestion(i, { answer: e.target.value || undefined })}
                      disabled={!isDraft}
                      style={{ width: '100%', marginTop: 6, padding: '8px 10px', borderRadius: 8, border: '1px solid #e8eaed', fontSize: 13 }}
                    />
                  </label>
                )}
                {q.options && q.options.length > 0 && (
                  <div style={{ marginTop: 8 }}>
                    <div style={{ fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 6 }}>Options</div>
                    {(() => {
                      const correctN = q.options!.filter((o) => o.is_correct).length;
                      const multiCorrect = q.type === 'MCQ' && correctN > 1;
                      return q.options!.map((opt, j) => (
                        <div key={j} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                          {q.type === 'MCQ' ? (
                            <input
                              type={multiCorrect ? 'checkbox' : 'radio'}
                              name={multiCorrect ? undefined : `correct-${i}`}
                              checked={opt.is_correct === true}
                              onChange={() => {
                                setQuestions((prev) => prev.map((q2, ii) => {
                                  if (ii !== i || !q2.options || q2.type !== 'MCQ') return q2;
                                  if (multiCorrect) {
                                    return {
                                      ...q2,
                                      options: q2.options!.map((o, jj) =>
                                        jj === j ? { ...o, is_correct: !o.is_correct } : o,
                                      ),
                                    };
                                  }
                                  return {
                                    ...q2,
                                    options: q2.options!.map((o, jj) => ({
                                      ...o,
                                      is_correct: jj === j,
                                    })),
                                  };
                                }));
                              }}
                              disabled={!isDraft}
                              style={{ flexShrink: 0 }}
                            />
                          ) : (
                            <span style={{ width: 18 }} />
                          )}
                          <span style={{ fontSize: 12, fontWeight: 600, color: '#6b7280', width: 28 }}>{opt.key}</span>
                          <input
                            value={opt.text}
                            onChange={(e) => {
                              const text = e.target.value;
                              setQuestions((prev) => prev.map((q2, ii) => {
                                if (ii !== i || !q2.options) return q2;
                                return {
                                  ...q2,
                                  options: q2.options!.map((o, jj) => (jj === j ? { ...o, text } : o)),
                                };
                              }));
                            }}
                            disabled={!isDraft}
                            style={{ flex: 1, padding: '6px 10px', borderRadius: 6, border: '1px solid #e8eaed', fontSize: 13 }}
                          />
                        </div>
                      ));
                    })()}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
