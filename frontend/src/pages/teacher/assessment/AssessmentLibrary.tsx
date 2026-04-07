import React, { useState, useRef, useEffect } from 'react';
import { Filter, Search, ChevronDown, Check, Plus, Eye, X, FileText } from 'lucide-react';
import { listQuestionBankSetsApi, type QuestionBankSetDto } from '../../../utils/questionBankApi';
import { prefetchQuestionBankSets, readCachedQuestionBankSets } from '../../../utils/assessmentDataCache';

// ── Types ─────────────────────────────────────────────────────────────────────
type Difficulty = 'easy' | 'medium' | 'hard';
type QType = 'MCQ' | 'True/False' | 'Fill-blank' | 'Short Answer' | 'Essay';

interface Question {
  id: string;
  prompt: string;
  options?: string[];      // MCQ only
  answer?: string;
  difficulty: Difficulty;
  type: QType;
}

interface QuestionSet {
  id: string;
  type: QType;
  subject: string;
  grade: string;
  semester: string;
  difficulty: Difficulty;
  chapter: string;
  source: string;
  aiGenerated: boolean;
  questions: Question[];
}

// ── Config ────────────────────────────────────────────────────────────────────
const TYPE_CONFIG: Record<QType, { bg: string; iconBg: string; label: string }> = {
  'MCQ':          { bg: '#dbeafe', iconBg: '#bfdbfe', label: 'Multiple Choice'   },
  'True/False':   { bg: '#ede9fe', iconBg: '#ddd6fe', label: 'True / False'      },
  'Fill-blank':   { bg: '#fed7aa', iconBg: '#fdba74', label: 'Fill in the Blank' },
  'Short Answer': { bg: '#d1fae5', iconBg: '#a7f3d0', label: 'Short Answer'      },
  'Essay':        { bg: '#fce7f3', iconBg: '#fbcfe8', label: 'Essay'             },
};

const DIFF_CONFIG: Record<Difficulty, { bg: string; color: string; label: string }> = {
  easy:   { bg: '#dcfce7', color: '#16a34a', label: 'Easy'   },
  medium: { bg: '#fef9c3', color: '#ca8a04', label: 'Medium' },
  hard:   { bg: '#ff6b35', color: '#ffffff', label: 'Hard'   },
};

/** Subtle accent for subject text — kept minimal for a cleaner layout */
const SUBJECT_CONFIG: Record<string, { color: string }> = {
  Biology:   { color: '#15803d' },
  Physics:   { color: '#a16207' },
  Math:      { color: '#1d4ed8' },
  Chemistry: { color: '#7e22ce' },
  English:   { color: '#c2410c' },
  History:   { color: '#475569' },
};

const SUBJECT_OPTIONS  = ['All Subjects',    'Biology', 'Physics', 'Math', 'Chemistry', 'English', 'History'];
const GRADE_OPTIONS    = ['All Grades',      'Grade 7', 'Grade 8', 'Grade 9', 'Grade 10', 'Grade 11', 'Grade 12'];
const SEMESTER_OPTIONS = ['All Semesters',   'Vol.1', 'Vol.2'];
const DIFF_OPTIONS     = ['All Difficulties','Easy', 'Medium', 'Hard'];
const TYPE_OPTIONS     = ['All Types',       'MCQ', 'True/False', 'Fill-blank', 'Short Answer', 'Essay'];

function mapQuestionBankDtoToSet(d: QuestionBankSetDto): QuestionSet {
  return {
    id: d.id,
    type: d.type as QType,
    subject: d.subject,
    grade: d.grade,
    semester: d.semester,
    difficulty: d.difficulty as Difficulty,
    chapter: d.chapter,
    source: d.source,
    aiGenerated: d.ai_generated,
    questions: d.questions.map((q) => ({
      id: q.id,
      type: q.type as QType,
      prompt: q.prompt,
      options: q.options && q.options.length > 0 ? q.options : undefined,
      answer: q.answer ?? undefined,
      difficulty: q.difficulty as Difficulty,
    })),
  };
}

function cleanMathDelimiters(s: string): string {
  if (!s) return s;
  return s.replace(/\$+/g, '').trim();
}

function parseOptionLine(opt: string): { letter: string; text: string } {
  const t = opt.trim();
  const m = t.match(/^([A-Za-z0-9]+)[\).\s]\s*(.*)$/s);
  if (m) {
    const letter = m[1].replace(/[^A-Za-z]/g, '').toUpperCase().slice(0, 1) || '?';
    return { letter, text: cleanMathDelimiters(m[2] ?? '') };
  }
  return { letter: (t[0] || '?').toUpperCase(), text: cleanMathDelimiters(t.slice(1).trim()) };
}

function parseAnswerKeySet(answer: string | undefined): Set<string> {
  const out = new Set<string>();
  if (!answer) return out;
  const u = answer.trim().toUpperCase();
  if (/^[A-D]+$/i.test(u) && u.length > 1 && !/[,\s;]/.test(answer)) {
    for (const c of u) {
      if ('ABCD'.includes(c)) out.add(c);
    }
    return out;
  }
  for (const part of u.split(/[\s,;/]+/)) {
    const tok = part.trim().replace(/[^A-DTFG]/gi, '');
    if (tok) out.add(tok[0]!);
  }
  return out;
}

const isDefault = (val: string) =>
  ['All Subjects','All Grades','All Semesters','All Difficulties','All Types'].includes(val);

// ── Main Component ─────────────────────────────────────────────────────────────
export default function AssessmentLibrary() {
  const [search,        setSearch]        = useState('');
  const [filterSubject, setFilterSubject] = useState('All Subjects');
  const [filterGrade,   setFilterGrade]   = useState('All Grades');
  const [filterSem,     setFilterSem]     = useState('All Semesters');
  const [filterDiff,    setFilterDiff]    = useState('All Difficulties');
  const [filterType,    setFilterType]    = useState('All Types');
  const [activeSet,     setActiveSet]     = useState<QuestionSet | null>(null);
  const [sets,          setSets]          = useState<QuestionSet[]>([]);
  const [loading,       setLoading]       = useState(true);
  const [loadError,     setLoadError]     = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const params = {
        subject: isDefault(filterSubject) ? undefined : filterSubject,
        grade: isDefault(filterGrade) ? undefined : filterGrade,
        semester: isDefault(filterSem) ? undefined : filterSem,
        difficulty: isDefault(filterDiff) ? undefined : filterDiff,
        question_type: isDefault(filterType) ? undefined : filterType,
      };

      // If we already prefetched (e.g. hover/click), render immediately.
      const cached = readCachedQuestionBankSets(params);
      if (cached && !cancelled) {
        setSets(cached.sets.map(mapQuestionBankDtoToSet));
        setLoading(false);
      } else {
        setLoading(true);
      }
      setLoadError(null);
      try {
        // Always refresh in background to ensure "DB 最新"。
        const res = await prefetchQuestionBankSets(params, { force: true });
        if (!cancelled) setSets(res.sets.map(mapQuestionBankDtoToSet));
      } catch (e) {
        if (!cancelled) {
          setSets([]);
          setLoadError(e instanceof Error ? e.message : 'Failed to load question bank');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [filterSubject, filterGrade, filterSem, filterDiff, filterType]);

  const filtered = sets.filter(s => {
    const q = search.toLowerCase();
    return (
      (!q || s.type.toLowerCase().includes(q) || s.subject.toLowerCase().includes(q) || s.chapter.toLowerCase().includes(q)) &&
      (isDefault(filterSubject) || s.subject   === filterSubject) &&
      (isDefault(filterGrade)   || s.grade     === filterGrade)   &&
      (isDefault(filterSem)     || s.semester  === filterSem)     &&
      (isDefault(filterDiff)    || s.difficulty === filterDiff.toLowerCase()) &&
      (isDefault(filterType)    || s.type      === filterType)
    );
  });

  const totalQuestions = filtered.reduce((a, s) => a + s.questions.length, 0);
  const uniqueTypes    = new Set(filtered.map(s => s.type)).size;

  const hasActiveFilters =
    !isDefault(filterSubject) || !isDefault(filterGrade) ||
    !isDefault(filterSem)     || !isDefault(filterDiff)  ||
    !isDefault(filterType)    || search !== '';

  return (
    <div style={{ display: 'flex', height: 'calc(100vh - 48px)', overflow: 'hidden', position: 'relative', background: '#fafafa' }}>

      {/* ── Filter sidebar ───────────────────────────────────── */}
      <aside style={{
        width: '200px', flexShrink: 0, borderRight: '1px solid #e5e7eb',
        background: '#fff', overflowY: 'auto', padding: '16px 14px',
        display: 'flex', flexDirection: 'column', gap: '14px',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <Filter size={14} style={{ color: '#6b7280' }} />
          <span style={{ fontSize: '13px', fontWeight: 600, color: '#111827' }}>Filter</span>
        </div>

        <p style={{ margin: 0, fontSize: '11px', color: '#9ca3af', lineHeight: 1.5 }}>
          {totalQuestions} questions · {uniqueTypes} types
        </p>

        <div>
          <div style={{ fontSize: '11px', fontWeight: 500, color: '#6b7280', marginBottom: '6px' }}>Search</div>
          <div style={{ position: 'relative' }}>
            <Search size={12} style={{ position: 'absolute', left: '9px', top: '50%', transform: 'translateY(-50%)', color: '#9ca3af', pointerEvents: 'none' }} />
            <input
              value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Keyword…"
              style={{ width: '100%', boxSizing: 'border-box', padding: '7px 9px 7px 26px', border: '1px solid #e5e7eb', borderRadius: '6px', fontSize: '12px', color: '#374151', outline: 'none', background: '#fff' }}
              onFocus={e => { e.currentTarget.style.borderColor = '#d1d5db'; }}
              onBlur={e =>  { e.currentTarget.style.borderColor = '#e5e7eb'; }}
            />
          </div>
        </div>

        <CustomSelect label="Subject"       value={filterSubject} onChange={setFilterSubject} options={SUBJECT_OPTIONS}  />
        <CustomSelect label="Grade"         value={filterGrade}   onChange={setFilterGrade}   options={GRADE_OPTIONS}    />
        <CustomSelect label="Semester"      value={filterSem}     onChange={setFilterSem}     options={SEMESTER_OPTIONS} />
        <CustomSelect label="Difficulty"    value={filterDiff}    onChange={setFilterDiff}    options={DIFF_OPTIONS}     />
        <CustomSelect label="Question Type" value={filterType}    onChange={setFilterType}    options={TYPE_OPTIONS}     />

        {hasActiveFilters && (
          <button
            type="button"
            onClick={() => { setSearch(''); setFilterSubject('All Subjects'); setFilterGrade('All Grades'); setFilterSem('All Semesters'); setFilterDiff('All Difficulties'); setFilterType('All Types'); }}
            style={{ padding: '7px 10px', borderRadius: '6px', border: '1px solid #e5e7eb', background: '#fff', color: '#6b7280', fontSize: '11px', cursor: 'pointer' }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = '#f9fafb'; }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = '#fff'; }}
          >
            Reset
          </button>
        )}
      </aside>

      {/* ── Card Grid ────────────────────────────────────────── */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minWidth: 0 }}>
        {/* Top bar */}
        <div style={{ padding: '10px 14px', borderBottom: '1px solid #e5e7eb', background: '#fff', flexShrink: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontSize: '12px', color: '#6b7280' }}>
            {filtered.length} sets · {totalQuestions} questions
          </span>
          <button type="button" style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', padding: '6px 12px', borderRadius: '6px', border: '1px solid #e5e7eb', background: '#111827', color: '#fff', fontSize: '12px', fontWeight: 500, cursor: 'pointer', marginLeft: 'auto' }}>
            <Plus size={13} /> Add
          </button>
        </div>

        {loadError && (
          <div style={{
            margin: '0 14px 10px', padding: '10px 12px', borderRadius: '8px',
            background: '#fef2f2', border: '1px solid #fecaca', color: '#b91c1c', fontSize: '12px', flexShrink: 0,
          }}>
            {loadError}
          </div>
        )}

        {/* Grid */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '14px' }}>
          {loading ? (
            <div style={{ textAlign: 'center', padding: '64px 16px', color: '#9ca3af' }}>
              <div style={{ fontSize: '13px' }}>Loading question bank…</div>
            </div>
          ) : filtered.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '64px 16px', color: '#9ca3af' }}>
              <Search size={28} style={{ opacity: 0.35, display: 'block', margin: '0 auto 10px' }} />
              <div style={{ fontSize: '13px' }}>{loadError ? 'Could not load data' : 'No matches'}</div>
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '12px' }}>
              {filtered.map(set => (
                <React.Fragment key={set.id}>
                  <QuestionSetCard set={set} onView={() => setActiveSet(set)} />
                </React.Fragment>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── Detail Modal ─────────────────────────────────────── */}
      {activeSet && (
        <DetailModal set={activeSet} onClose={() => setActiveSet(null)} />
      )}
    </div>
  );
}

// ── Question Set Card ─────────────────────────────────────────────────────────
function QuestionSetCard({ set, onView }: { set: QuestionSet; onView: () => void }) {
  const tc  = TYPE_CONFIG[set.type];
  const dc  = DIFF_CONFIG[set.difficulty];
  const sc  = SUBJECT_CONFIG[set.subject] ?? { color: '#374151' };
  const [hovered, setHovered] = useState(false);

  return (
    <div
      style={{
        background: '#fff', borderRadius: '8px', overflow: 'hidden',
        border: '1px solid #e5e7eb',
        boxShadow: hovered ? '0 1px 3px rgba(0,0,0,0.06)' : 'none',
        transition: 'box-shadow 0.15s',
        cursor: 'default',
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <div style={{ padding: '14px 14px 12px' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '10px', marginBottom: '8px' }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: '14px', fontWeight: 600, color: '#111827', lineHeight: 1.35, marginBottom: '4px' }}>
              {tc.label}
            </div>
            <div style={{ fontSize: '11px', color: '#9ca3af', lineHeight: 1.45 }}>
              <span style={{ color: '#9ca3af' }}>{set.grade} · </span>
              <span style={{ color: sc.color, fontWeight: 500 }}>{set.subject}</span>
              {set.semester && set.semester !== '—' ? (
                <span style={{ color: '#9ca3af' }}>{' · '}{set.semester}</span>
              ) : null}
              {' · '}{dc.label}
              {set.aiGenerated && (
                <>
                  {' · '}
                  <span style={{ color: '#6b7280' }}>AI</span>
                </>
              )}
            </div>
          </div>
          <span style={{ flexShrink: 0, fontSize: '11px', color: '#6b7280', fontVariantNumeric: 'tabular-nums' }}>
            {set.questions.length} Q
          </span>
        </div>

        <div style={{ fontSize: '12px', color: '#6b7280', lineHeight: 1.5 }}>
          {set.chapter}
        </div>
      </div>

      <button
        type="button"
        onClick={onView}
        style={{
          width: '100%', padding: '9px 14px',
          border: 'none', borderTop: '1px solid #f3f4f6',
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
          background: hovered ? '#f9fafb' : '#fff',
          color: '#374151', fontSize: '12px', fontWeight: 500, cursor: 'pointer',
          transition: 'background 0.12s',
        }}
      >
        <Eye size={13} style={{ color: '#9ca3af' }} />
        View
      </button>
    </div>
  );
}

// ── Detail Modal ──────────────────────────────────────────────────────────────
function DetailModal({ set, onClose }: { set: QuestionSet; onClose: () => void }) {
  const tc = TYPE_CONFIG[set.type];
  const dc = DIFF_CONFIG[set.difficulty];

  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') onClose(); }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 200,
      background: 'rgba(17,24,39,0.35)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: '24px',
    }} onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={{
        background: '#fff', borderRadius: '8px', width: '100%', maxWidth: '560px',
        maxHeight: '85vh', display: 'flex', flexDirection: 'column',
        border: '1px solid #e5e7eb',
        boxShadow: '0 10px 40px rgba(0,0,0,0.08)',
        overflow: 'hidden',
      }}>
        {/* Modal header */}
        <div style={{ padding: '16px 18px 0', flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '20px' }}>
            <div>
              <div style={{ fontSize: '11px', color: '#9ca3af', marginBottom: '4px' }}>
                {set.grade} · {set.subject} · {set.semester}
              </div>
              <div style={{ fontSize: '16px', fontWeight: 600, color: '#111827' }}>
                {tc.label}
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              style={{
                width: '30px', height: '30px', borderRadius: '6px',
                border: '1px solid #e5e7eb', background: '#fff',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                cursor: 'pointer', color: '#6b7280', flexShrink: 0,
              }}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = '#f9fafb'; }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = '#fff'; }}
            >
              <X size={15} />
            </button>
          </div>

          {/* Basic Info */}
          <div style={{ marginBottom: '16px', paddingBottom: '14px', borderBottom: '1px solid #f3f4f6' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '6px' }}>
              <FileText size={13} style={{ color: '#9ca3af' }} />
              <span style={{ fontSize: '12px', fontWeight: 600, color: '#374151' }}>Details</span>
            </div>
            <div style={{ fontSize: '12px', color: '#6b7280', lineHeight: 1.6 }}>
              <div><span style={{ color: '#9ca3af' }}>Chapter:</span> {set.chapter}</div>
              <div style={{ marginTop: '4px' }}>
                <span style={{ color: '#9ca3af' }}>Difficulty:</span>{' '}
                <span style={{ fontSize: '11px', fontWeight: 600, padding: '2px 8px', borderRadius: '4px', background: dc.bg, color: dc.color }}>
                  {dc.label}
                </span>
                {' · '}
                <span style={{ color: '#9ca3af' }}>Count:</span> {set.questions.length}
              </div>
            </div>
          </div>

          {/* Section title */}
          <div style={{ fontSize: '12px', fontWeight: 600, color: '#374151', paddingBottom: '10px' }}>
            Questions
          </div>
        </div>

        {/* Scrollable questions */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '0 18px 18px' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {set.questions.map((q, idx) => {
              const qdc = DIFF_CONFIG[q.difficulty];
              const qtc = TYPE_CONFIG[q.type];
              return (
                <div key={q.id} style={{
                  background: '#fafafa', borderRadius: '6px',
                  border: '1px solid #e5e7eb', overflow: 'hidden',
                }}>
                  {/* Q header */}
                  <div style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    padding: '8px 12px', borderBottom: '1px solid #f3f4f6',
                    background: '#fff',
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <span style={{ fontSize: '12px', fontWeight: 600, color: '#111827' }}>Q{idx + 1}</span>
                      <span style={{ fontSize: '11px', color: '#9ca3af' }}>·</span>
                      <span style={{ fontSize: '11px', color: '#6b7280' }}>{qtc.label}</span>
                    </div>
                    <span style={{
                      fontSize: '10px', fontWeight: 600, padding: '2px 8px', borderRadius: '4px',
                      background: qdc.bg, color: qdc.color,
                    }}>
                      {qdc.label}
                    </span>
                  </div>

                  {/* Q body */}
                  <div style={{ padding: '12px' }}>
                    <p style={{ margin: '0 0 10px', fontSize: '13px', color: '#374151', lineHeight: 1.65 }}>
                      {cleanMathDelimiters(q.prompt)}
                    </p>
                    {/* MCQ options */}
                    {q.options && (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                        {(!q.answer || !String(q.answer).trim()) && (
                          <div style={{
                            marginBottom: '4px', padding: '6px 10px', borderRadius: '6px',
                            background: '#fffbeb', border: '1px solid #fde68a',
                            fontSize: '11px', color: '#92400e',
                          }}>
                            No answer key stored for this item.
                          </div>
                        )}
                        {q.options.map(opt => {
                          const { letter, text } = parseOptionLine(opt);
                          const correct = parseAnswerKeySet(q.answer);
                          const isCorrect =
                            correct.size > 0
                              ? correct.has(letter)
                              : (q.answer?.trim().toUpperCase() === letter);
                          return (
                            <div key={opt} style={{
                              display: 'flex', alignItems: 'center', gap: '10px',
                              padding: '6px 10px', borderRadius: '8px',
                              background: isCorrect ? '#f0fdf4' : '#fff',
                              border: `1px solid ${isCorrect ? '#bbf7d0' : '#e8eaed'}`,
                            }}>
                              <span style={{
                                width: '20px', height: '20px', borderRadius: '50%', flexShrink: 0,
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                fontSize: '11px', fontWeight: 700,
                                background: isCorrect ? '#16a34a' : '#f3f4f6',
                                color: isCorrect ? '#fff' : '#6b7280',
                              }}>
                                {letter}
                              </span>
                              <span style={{ fontSize: '13px', color: isCorrect ? '#15803d' : '#374151', fontWeight: isCorrect ? 500 : 400 }}>
                                {text}
                              </span>
                              {isCorrect && (
                                <Check size={12} style={{ color: '#16a34a', marginLeft: 'auto' }} />
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                    {/* Answer for non-MCQ */}
                    {!q.options && q.answer && (
                      <div style={{
                        marginTop: '6px', padding: '8px 12px', borderRadius: '8px',
                        background: '#f0fdf4', border: '1px solid #bbf7d0',
                        fontSize: '12px', color: '#15803d',
                      }}>
                        <span style={{ fontWeight: 600 }}>Answer: </span>{cleanMathDelimiters(q.answer)}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Custom Dropdown ───────────────────────────────────────────────────────────
function CustomSelect({ label, value, onChange, options }: {
  label: string; value: string; onChange: (v: string) => void; options: string[];
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const isPlaceholder = options[0] === value;

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <div style={{ fontSize: '11px', fontWeight: 500, color: '#6b7280', marginBottom: '5px' }}>{label}</div>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        style={{
          width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '6px 9px', borderRadius: '6px', cursor: 'pointer', textAlign: 'left',
          border: `1px solid ${open ? '#d1d5db' : '#e5e7eb'}`,
          background: '#fff', outline: 'none', transition: 'border-color 0.12s',
        }}
      >
        <span style={{ fontSize: '12px', color: isPlaceholder ? '#9ca3af' : '#111827', fontWeight: isPlaceholder ? 400 : 500 }}>
          {value}
        </span>
        <ChevronDown size={12} style={{ color: '#9ca3af', transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s', flexShrink: 0 }} />
      </button>

      {open && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0, zIndex: 100,
          background: '#fff', border: '1px solid #e5e7eb', borderRadius: '6px',
          boxShadow: '0 4px 12px rgba(0,0,0,0.06)',
          overflow: 'hidden', padding: '3px',
        }}>
          {options.map((opt, i) => {
            const isSel = opt === value;
            return (
              <button
                type="button"
                key={opt}
                onClick={() => { onChange(opt); setOpen(false); }}
                style={{
                  width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: '6px 8px', borderRadius: '4px', border: 'none', cursor: 'pointer',
                  background: isSel ? '#f3f4f6' : 'transparent',
                  color: i === 0 ? '#9ca3af' : '#374151',
                  fontSize: '12px', fontWeight: isSel ? 500 : 400, textAlign: 'left', transition: 'background 0.1s',
                }}
                onMouseEnter={e => { if (!isSel) (e.currentTarget as HTMLElement).style.background = '#f9fafb'; }}
                onMouseLeave={e => { if (!isSel) (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
              >
                <span>{opt}</span>
                {isSel && <Check size={11} style={{ color: '#6b7280', flexShrink: 0 }} />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}