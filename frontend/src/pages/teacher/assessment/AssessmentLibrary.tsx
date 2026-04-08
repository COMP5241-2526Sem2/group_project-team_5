import React, { useEffect, useState, useMemo } from 'react';
import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { AlertTriangle, Filter, Search, Check, Plus, Eye, X, FileText, Trash2 } from 'lucide-react';
import { CustomSelect } from '../../../components/teacher/CustomSelect';
import { BankRichText } from '../../../components/teacher/BankRichText';
import {
  createManualQuestionBankSetApi,
  deleteQuestionBankSetByKeyApi,
  listQuestionBankSetsApi,
  type DeleteSetByKeyPayload,
  type ManualQuestionPayload,
  type ManualSetCreatedDto,
  type ManualSetCreatePayload,
  type QuestionBankSetDto,
  type QuestionBankSetQuestionDto,
  type QuestionBankSetsResponseDto,
} from '../../../utils/questionBankApi';
import { teacherKeys } from '../../../query/teacherKeys';

function FilterSelect({
  label, options, value, onChange,
}: { label: string; options: string[]; value: string; onChange: (v: string) => void }) {
  return (
    <div style={{ marginBottom: '18px' }}>
      <div style={{ fontSize: '13px', fontWeight: 600, color: '#374151', marginBottom: '8px' }}>{label}</div>
      <CustomSelect options={options} value={value} onChange={onChange} width="100%" />
    </div>
  );
}

// ── Types ─────────────────────────────────────────────────────────────────────
type Difficulty = 'easy' | 'medium' | 'hard';
type QType = 'MCQ' | 'True/False' | 'Fill-blank' | 'Short Answer' | 'Essay';

interface Question {
  id: string;
  prompt: string;
  imageUrl?: string;
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
  canDelete: boolean;
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

const EDIT_SUBJECT_OPTS = ['Biology', 'Physics', 'Math', 'Chemistry', 'English', 'History'];
const EDIT_GRADE_OPTS   = ['Grade 7', 'Grade 8', 'Grade 9', 'Grade 10', 'Grade 11', 'Grade 12'];
const EDIT_TYPE_OPTS: QType[] = ['MCQ', 'True/False', 'Fill-blank', 'Short Answer', 'Essay'];
const EDIT_SEM_OPTS     = ['(unspecified)', 'Vol.1', 'Vol.2'];
const MAX_CHOICE_OPTIONS = 10;
const MIN_CHOICE_OPTIONS = 2;

function newLocalId(): string {
  return typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : String(Math.random());
}

interface DraftOptionLine {
  localId: string;
  text: string;
}

interface DraftQuestionRow {
  id: string;
  prompt: string;
  difficulty: Difficulty;
  /** MCQ (2–10) and True/False (2); empty for text-only types */
  choiceLines: DraftOptionLine[];
  correctLetter: string;
  textAnswer: string;
}

function emptyChoiceLine(): DraftOptionLine {
  return { localId: newLocalId(), text: '' };
}

function emptyDraftRowForType(qt: QType): DraftQuestionRow {
  const base: DraftQuestionRow = {
    id: newLocalId(),
    prompt: '',
    difficulty: 'medium',
    choiceLines: [],
    correctLetter: 'A',
    textAnswer: '',
  };
  if (qt === 'MCQ') {
    return {
      ...base,
      choiceLines: [
        emptyChoiceLine(),
        emptyChoiceLine(),
        emptyChoiceLine(),
        emptyChoiceLine(),
      ],
    };
  }
  if (qt === 'True/False') {
    return {
      ...base,
      choiceLines: [
        { localId: newLocalId(), text: 'True' },
        { localId: newLocalId(), text: 'False' },
      ],
    };
  }
  return base;
}

function buildManualPayload(
  questionType: QType,
  subject: string,
  grade: string,
  semesterSel: string,
  chapter: string,
  publisher: string,
  rows: DraftQuestionRow[],
): ManualSetCreatePayload {
  const semester =
    semesterSel === '(unspecified)' || semesterSel === '' ? undefined : semesterSel;

  const questions: ManualQuestionPayload[] = [];
  for (const r of rows) {
    const p = r.prompt.trim();
    if (!p) continue;

    if (questionType === 'MCQ') {
      const texts = r.choiceLines.map((o) => o.text.trim()).filter((t) => t.length > 0);
      if (texts.length < MIN_CHOICE_OPTIONS) {
        throw new Error(
          `Multiple choice: each question needs at least ${MIN_CHOICE_OPTIONS} non-empty options.`,
        );
      }
      if (texts.length > MAX_CHOICE_OPTIONS) {
        throw new Error(`Multiple choice: at most ${MAX_CHOICE_OPTIONS} options.`);
      }
      const letters = texts.map((_, i) => String.fromCharCode(65 + i));
      if (!letters.includes(r.correctLetter)) {
        throw new Error('For each question, select which option is correct (Answer).');
      }
      questions.push({
        prompt: p,
        difficulty: r.difficulty,
        answer: r.correctLetter,
        options: texts.map((text, i) => ({
          option_key: String.fromCharCode(65 + i),
          option_text: text,
        })),
      });
    } else if (questionType === 'True/False') {
      const t0 = (r.choiceLines[0]?.text ?? '').trim();
      const t1 = (r.choiceLines[1]?.text ?? '').trim();
      if (!t0 || !t1) {
        throw new Error('True/False: enter text for both options (e.g. True and False).');
      }
      if (r.correctLetter !== 'A' && r.correctLetter !== 'B') {
        throw new Error('True/False: mark the correct option with the radio button.');
      }
      questions.push({
        prompt: p,
        difficulty: r.difficulty,
        answer: r.correctLetter,
        options: [
          { option_key: 'A', option_text: t0 },
          { option_key: 'B', option_text: t1 },
        ],
      });
    } else {
      const ans = r.textAnswer.trim();
      if (!ans) {
        throw new Error('Fill in the Answer for each question you add.');
      }
      questions.push({
        prompt: p,
        difficulty: r.difficulty,
        answer: ans,
      });
    }
  }

  if (questions.length === 0) {
    throw new Error('Add at least one question with a non-empty prompt.');
  }

  const ch = chapter.trim();
  if (!ch) {
    throw new Error('Set title / chapter is required (shown on the card).');
  }

  return {
    question_type: questionType,
    subject,
    grade,
    semester,
    chapter: ch,
    publisher: publisher.trim() || undefined,
    questions,
  };
}

/** Same matching rules as DELETE /question-bank/sets/delete-by-key (semester "—" ↔ omitted). */
function questionBankMetaMatchesDelete(
  subject: string,
  grade: string,
  semesterDisplay: string,
  chapter: string,
  typeUi: string,
  p: DeleteSetByKeyPayload,
): boolean {
  if (subject !== p.subject || grade !== p.grade || chapter !== p.chapter || typeUi !== p.question_type) {
    return false;
  }
  const pSem = (p.semester ?? '').trim();
  const sSem = semesterDisplay === '—' ? '' : semesterDisplay.trim();
  return pSem === sSem;
}

function bankSetMatchesDeletePayload(s: QuestionBankSetDto, p: DeleteSetByKeyPayload): boolean {
  return questionBankMetaMatchesDelete(s.subject, s.grade, s.semester, s.chapter, s.type, p);
}

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
    canDelete: Boolean(d.can_delete),
    questions: d.questions.map((q) => ({
      id: q.id,
      type: q.type as QType,
      prompt: q.prompt,
      imageUrl: q.image_url ?? undefined,
      options: q.options && q.options.length > 0 ? q.options : undefined,
      answer: q.answer ?? undefined,
      difficulty: q.difficulty as Difficulty,
    })),
  };
}

const isDefault = (val: string) =>
  ['All Subjects','All Grades','All Semesters','All Difficulties','All Types'].includes(val);

const DIFF_LABEL_FOR: Record<Difficulty, string> = {
  easy: 'Easy',
  medium: 'Medium',
  hard: 'Hard',
};
const DIFF_FROM_LABEL: Record<string, Difficulty> = {
  Easy: 'easy',
  Medium: 'medium',
  Hard: 'hard',
};

/** Decode `teacherKeys.questionBankSets` 第四段 stableParamKey → GET 查询参数。 */
function parseQuestionBankListKeyParams(queryKey: readonly unknown[]): Record<string, string | undefined> {
  const raw = queryKey[3];
  if (raw == null || raw === '') return {};
  if (typeof raw !== 'string') return {};
  const out: Record<string, string | undefined> = {};
  for (const pair of raw.split('&')) {
    if (!pair) continue;
    const eq = pair.indexOf('=');
    if (eq < 0) continue;
    try {
      const k = decodeURIComponent(pair.slice(0, eq));
      const v = decodeURIComponent(pair.slice(eq + 1));
      out[k] = v;
    } catch {
      /* ignore */
    }
  }
  return out;
}

function aggregateDifficultyForQuestions(qs: { difficulty: string }[]): string {
  const norm = qs.map((q) => (q.difficulty || 'medium').toLowerCase());
  if (norm.length && new Set(norm).size === 1) return norm[0];
  return 'medium';
}

function bankSetDtoMatchesQueryParams(set: QuestionBankSetDto, params: Record<string, string | undefined>): boolean {
  if (params.subject != null && params.subject !== '' && set.subject !== params.subject) return false;
  if (params.grade != null && params.grade !== '' && set.grade !== params.grade) return false;
  if (params.semester != null && params.semester !== '') {
    const sSem = set.semester === '—' ? '' : set.semester;
    if (sSem !== params.semester) return false;
  }
  if (params.difficulty != null && params.difficulty !== '') {
    if (set.difficulty !== params.difficulty.trim().toLowerCase()) return false;
  }
  if (params.question_type != null && params.question_type !== '' && set.type !== params.question_type) return false;
  if (params.q != null && params.q.trim() !== '') {
    const term = params.q.trim().toLowerCase();
    const hay = [
      set.chapter,
      set.subject,
      set.source,
      set.type,
      ...set.questions.flatMap((q) => [q.prompt, q.answer ?? '', ...(q.options ?? [])]),
    ]
      .join('\n')
      .toLowerCase();
    if (!hay.includes(term)) return false;
  }
  return true;
}

function buildOptimisticBankSetDto(created: ManualSetCreatedDto, payload: ManualSetCreatePayload): QuestionBankSetDto {
  const semester = payload.semester?.trim() ? payload.semester : '—';
  const source = payload.publisher?.trim() ? payload.publisher.trim() : 'manual';
  const questions: QuestionBankSetQuestionDto[] = payload.questions.map((q, i) => ({
    id: `local-${created.set_id}-${i}`,
    type: payload.question_type,
    prompt: q.prompt,
    image_url: null,
    options:
      q.options && q.options.length > 0
        ? q.options.map((o) => `${o.option_key}. ${o.option_text}`)
        : null,
    answer: q.answer ?? null,
    difficulty: q.difficulty,
  }));
  return {
    id: created.set_id,
    type: payload.question_type,
    subject: payload.subject,
    grade: payload.grade,
    semester,
    difficulty: aggregateDifficultyForQuestions(questions),
    chapter: payload.chapter,
    source,
    ai_generated: false,
    can_delete: true,
    questions,
  };
}

function mergeOptimisticBankSet(
  old: QuestionBankSetsResponseDto | undefined,
  optimistic: QuestionBankSetDto,
): QuestionBankSetsResponseDto | undefined {
  if (!old?.sets) return old;
  const idx = old.sets.findIndex((s) => s.id === optimistic.id);
  if (idx >= 0) {
    const prev = old.sets[idx];
    const mergedQuestions = [...prev.questions, ...optimistic.questions];
    const next: QuestionBankSetDto = {
      ...prev,
      questions: mergedQuestions,
      difficulty: aggregateDifficultyForQuestions(mergedQuestions),
    };
    const sets = [...old.sets];
    sets[idx] = next;
    return { ...old, sets };
  }
  return { ...old, sets: [optimistic, ...old.sets] };
}

function patchAllBankCachesAfterCreate(qc: QueryClient, created: ManualSetCreatedDto, payload: ManualSetCreatePayload) {
  const optimistic = buildOptimisticBankSetDto(created, payload);
  const cached = qc.getQueryCache().findAll({ queryKey: ['teacher', 'questionBank', 'sets'] });
  for (const entry of cached) {
    const key = entry.queryKey;
    if (!Array.isArray(key) || key.length < 4) continue;
    const params = parseQuestionBankListKeyParams(key);
    if (!bankSetDtoMatchesQueryParams(optimistic, params)) continue;
    qc.setQueryData(key, (prev) => mergeOptimisticBankSet(prev as QuestionBankSetsResponseDto | undefined, optimistic));
  }
}

function CreateSetModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const qc = useQueryClient();
  const [questionType, setQuestionType] = useState<QType>('MCQ');
  const [subject, setSubject] = useState('Biology');
  const [grade, setGrade] = useState('Grade 10');
  const [semester, setSemester] = useState('(unspecified)');
  const [chapter, setChapter] = useState('');
  const [publisher, setPublisher] = useState('');
  const [rows, setRows] = useState<DraftQuestionRow[]>([emptyDraftRowForType('MCQ')]);
  const [localError, setLocalError] = useState<string | null>(null);

  const createMut = useMutation({
    mutationFn: createManualQuestionBankSetApi,
    onSuccess: (data, variables) => {
      patchAllBankCachesAfterCreate(qc, data, variables);
      void qc.invalidateQueries({ queryKey: ['teacher', 'questionBank', 'sets'], refetchType: 'none' });
      onClose();
    },
  });

  useEffect(() => {
    if (!open) return;
    createMut.reset();
    setQuestionType('MCQ');
    setSubject('Biology');
    setGrade('Grade 10');
    setSemester('(unspecified)');
    setChapter('');
    setPublisher('');
    setRows([emptyDraftRowForType('MCQ')]);
    setLocalError(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reset form when modal opens only
  }, [open]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    if (open) {
      document.addEventListener('keydown', onKey);
      return () => document.removeEventListener('keydown', onKey);
    }
  }, [open, onClose]);

  const patchRow = (rowId: string, patch: Partial<DraftQuestionRow>) => {
    setRows((prev) => prev.map((r) => (r.id === rowId ? { ...r, ...patch } : r)));
  };

  const updateChoiceText = (rowId: string, localId: string, text: string) => {
    setRows((prev) =>
      prev.map((r) => {
        if (r.id !== rowId) return r;
        return {
          ...r,
          choiceLines: r.choiceLines.map((o) => (o.localId === localId ? { ...o, text } : o)),
        };
      }),
    );
  };

  const addChoiceLine = (rowId: string) => {
    setRows((prev) =>
      prev.map((r) => {
        if (r.id !== rowId || r.choiceLines.length >= MAX_CHOICE_OPTIONS) return r;
        return { ...r, choiceLines: [...r.choiceLines, emptyChoiceLine()] };
      }),
    );
  };

  const removeChoiceLine = (rowId: string, localId: string) => {
    setRows((prev) =>
      prev.map((r) => {
        if (r.id !== rowId || r.choiceLines.length <= MIN_CHOICE_OPTIONS) return r;
        const next = r.choiceLines.filter((o) => o.localId !== localId);
        const letters = next.map((_, i) => String.fromCharCode(65 + i));
        let correct = r.correctLetter;
        if (!letters.includes(correct)) correct = letters[0] ?? 'A';
        return { ...r, choiceLines: next, correctLetter: correct };
      }),
    );
  };

  const addRow = () => setRows((prev) => [...prev, emptyDraftRowForType(questionType)]);
  const removeRow = (rowId: string) => {
    setRows((prev) => (prev.length <= 1 ? prev : prev.filter((r) => r.id !== rowId)));
  };

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setLocalError(null);
    try {
      const payload = buildManualPayload(questionType, subject, grade, semester, chapter, publisher, rows);
      createMut.mutate(payload);
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : 'Invalid form');
    }
  };

  if (!open) return null;

  const inputStyle: React.CSSProperties = {
    width: '100%',
    boxSizing: 'border-box',
    padding: '8px 10px',
    border: '1px solid #e8eaed',
    borderRadius: '8px',
    fontSize: '13px',
    color: '#374151',
    outline: 'none',
    background: '#fff',
  };

  const errMsg = localError || (createMut.error instanceof Error ? createMut.error.message : createMut.error ? String(createMut.error) : null);

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 210,
        background: 'rgba(17,24,39,0.35)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '24px',
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <form
        onSubmit={onSubmit}
        style={{
          background: '#fff',
          borderRadius: '8px',
          width: '100%',
          maxWidth: '640px',
          maxHeight: '90vh',
          display: 'flex',
          flexDirection: 'column',
          border: '1px solid #e5e7eb',
          boxShadow: '0 10px 40px rgba(0,0,0,0.08)',
          overflow: 'hidden',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ padding: '16px 18px', borderBottom: '1px solid #f3f4f6', flexShrink: 0, display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '12px' }}>
          <div>
            <div style={{ fontSize: '11px', color: '#9ca3af', marginBottom: '4px' }}>Question Bank</div>
            <div style={{ fontSize: '16px', fontWeight: 600, color: '#111827' }}>Create question set</div>
            <div style={{ fontSize: '12px', color: '#6b7280', marginTop: '6px', lineHeight: 1.45 }}>
              Same subject, grade, semester, type, and set title form one card. Use a unique title to keep sets separate.
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{
              width: '30px',
              height: '30px',
              borderRadius: '6px',
              border: '1px solid #e5e7eb',
              background: '#fff',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              color: '#6b7280',
              flexShrink: 0,
            }}
          >
            <X size={15} />
          </button>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '16px 18px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '14px' }}>
            <div>
              <div style={{ fontSize: '12px', fontWeight: 600, color: '#374151', marginBottom: '6px' }}>Question type</div>
              <CustomSelect
                options={[...EDIT_TYPE_OPTS]}
                value={questionType}
                onChange={(v) => {
                  const qt = v as QType;
                  setQuestionType(qt);
                  setRows([emptyDraftRowForType(qt)]);
                }}
                width="100%"
              />
            </div>
            <div>
              <div style={{ fontSize: '12px', fontWeight: 600, color: '#374151', marginBottom: '6px' }}>Subject</div>
              <CustomSelect options={EDIT_SUBJECT_OPTS} value={subject} onChange={setSubject} width="100%" />
            </div>
            <div>
              <div style={{ fontSize: '12px', fontWeight: 600, color: '#374151', marginBottom: '6px' }}>Grade</div>
              <CustomSelect options={EDIT_GRADE_OPTS} value={grade} onChange={setGrade} width="100%" />
            </div>
            <div>
              <div style={{ fontSize: '12px', fontWeight: 600, color: '#374151', marginBottom: '6px' }}>Semester</div>
              <CustomSelect options={EDIT_SEM_OPTS} value={semester} onChange={setSemester} width="100%" />
            </div>
          </div>

          <div style={{ marginBottom: '12px' }}>
            <div style={{ fontSize: '12px', fontWeight: 600, color: '#374151', marginBottom: '6px' }}>Set title / chapter</div>
            <input
              value={chapter}
              onChange={(e) => setChapter(e.target.value)}
              placeholder="e.g. Cell structure · practice"
              style={inputStyle}
            />
          </div>
          <div style={{ marginBottom: '16px' }}>
            <div style={{ fontSize: '12px', fontWeight: 600, color: '#374151', marginBottom: '6px' }}>Source / tag</div>
            <input
              value={publisher}
              onChange={(e) => setPublisher(e.target.value)}
              placeholder="e.g. Supplement, SciQ"
              style={inputStyle}
            />
          </div>

          <div style={{ fontSize: '12px', fontWeight: 600, color: '#374151', marginBottom: '10px' }}>Questions</div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            {rows.map((r, idx) => (
              <div
                key={r.id}
                style={{
                  background: '#fafafa',
                  borderRadius: '8px',
                  border: '1px solid #e5e7eb',
                  padding: '12px',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
                  <span style={{ fontSize: '12px', fontWeight: 600, color: '#111827' }}>Question {idx + 1}</span>
                  {rows.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeRow(r.id)}
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '4px',
                        fontSize: '11px',
                        color: '#b91c1c',
                        background: 'transparent',
                        border: 'none',
                        cursor: 'pointer',
                        padding: '4px 6px',
                      }}
                    >
                      <Trash2 size={12} /> Remove
                    </button>
                  )}
                </div>
                <div style={{ marginBottom: '8px' }}>
                  <div style={{ fontSize: '12px', fontWeight: 600, color: '#374151', marginBottom: '6px' }}>Question</div>
                  <textarea
                    value={r.prompt}
                    onChange={(e) => patchRow(r.id, { prompt: e.target.value })}
                    placeholder="Enter the question (supports **bold**, figures like existing bank items)"
                    rows={3}
                    style={{ ...inputStyle, resize: 'vertical', minHeight: '72px', fontFamily: 'inherit' }}
                  />
                </div>
                <div style={{ marginBottom: '10px', maxWidth: '200px' }}>
                  <div style={{ fontSize: '11px', color: '#6b7280', marginBottom: '4px' }}>Difficulty</div>
                  <CustomSelect
                    options={['Easy', 'Medium', 'Hard']}
                    value={DIFF_LABEL_FOR[r.difficulty]}
                    onChange={(v) => {
                      const d = DIFF_FROM_LABEL[v];
                      if (d) patchRow(r.id, { difficulty: d });
                    }}
                    width="100%"
                  />
                </div>

                {(questionType === 'MCQ' || questionType === 'True/False') && (
                  <>
                    <div style={{ fontSize: '12px', fontWeight: 600, color: '#374151', marginBottom: '6px' }}>Answer</div>
                    <div style={{ fontSize: '11px', color: '#6b7280', marginBottom: '8px', lineHeight: 1.45 }}>
                      {questionType === 'MCQ'
                        ? 'Add options below, then select the correct one.'
                        : 'Edit the two statements if needed, then select the correct one.'}
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '10px' }}>
                      {r.choiceLines.map((opt, oi) => {
                        const L = String.fromCharCode(65 + oi);
                        return (
                          <div
                            key={opt.localId}
                            style={{
                              display: 'flex',
                              alignItems: 'flex-start',
                              gap: '10px',
                              padding: '8px 10px',
                              borderRadius: '8px',
                              border: '1px solid #e8eaed',
                              background: r.correctLetter === L ? '#f0f4ff' : '#fff',
                            }}
                          >
                            <label style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', flex: 1, cursor: 'pointer', margin: 0 }}>
                              <input
                                type="radio"
                                name={`correct-${r.id}`}
                                checked={r.correctLetter === L}
                                onChange={() => patchRow(r.id, { correctLetter: L })}
                                style={{ marginTop: '3px', flexShrink: 0, accentColor: '#3b5bdb' }}
                              />
                              <span style={{ width: '20px', fontSize: '12px', fontWeight: 700, color: '#3b5bdb', flexShrink: 0 }}>{L}</span>
                              <input
                                value={opt.text}
                                onChange={(e) => updateChoiceText(r.id, opt.localId, e.target.value)}
                                placeholder={`Option ${L}`}
                                style={{ ...inputStyle, flex: 1, border: 'none', padding: '4px 0', background: 'transparent' }}
                              />
                            </label>
                            {questionType === 'MCQ' && r.choiceLines.length > MIN_CHOICE_OPTIONS && (
                              <button
                                type="button"
                                onClick={() => removeChoiceLine(r.id, opt.localId)}
                                style={{
                                  border: 'none',
                                  background: 'transparent',
                                  color: '#9ca3af',
                                  cursor: 'pointer',
                                  padding: '4px',
                                  flexShrink: 0,
                                }}
                                title="Remove option"
                              >
                                <Trash2 size={14} />
                              </button>
                            )}
                          </div>
                        );
                      })}
                    </div>
                    {questionType === 'MCQ' && r.choiceLines.length < MAX_CHOICE_OPTIONS && (
                      <button
                        type="button"
                        onClick={() => addChoiceLine(r.id)}
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '6px',
                          padding: '6px 10px',
                          marginBottom: '8px',
                          borderRadius: '8px',
                          border: '1px dashed #c7d2fe',
                          background: '#fff',
                          fontSize: '12px',
                          color: '#3b5bdb',
                          cursor: 'pointer',
                        }}
                      >
                        <Plus size={14} /> Add option
                      </button>
                    )}
                  </>
                )}

                {(questionType === 'Fill-blank' || questionType === 'Short Answer' || questionType === 'Essay') && (
                  <div>
                    <div style={{ fontSize: '12px', fontWeight: 600, color: '#374151', marginBottom: '6px' }}>Answer</div>
                    <textarea
                      value={r.textAnswer}
                      onChange={(e) => patchRow(r.id, { textAnswer: e.target.value })}
                      placeholder="Expected answer or scoring key"
                      rows={2}
                      style={{ ...inputStyle, resize: 'vertical', minHeight: '52px', fontFamily: 'inherit' }}
                    />
                  </div>
                )}
              </div>
            ))}
          </div>

          <button
            type="button"
            onClick={addRow}
            style={{
              marginTop: '12px',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              padding: '8px 12px',
              borderRadius: '8px',
              border: '1px dashed #d1d5db',
              background: '#fff',
              fontSize: '12px',
              color: '#374151',
              cursor: 'pointer',
            }}
          >
            <Plus size={14} /> Add another question
          </button>

          {errMsg && (
            <div
              style={{
                marginTop: '14px',
                padding: '10px 12px',
                borderRadius: '8px',
                background: '#fef2f2',
                border: '1px solid #fecaca',
                color: '#b91c1c',
                fontSize: '12px',
              }}
            >
              {errMsg}
            </div>
          )}
        </div>

        <div
          style={{
            padding: '12px 18px',
            borderTop: '1px solid #f3f4f6',
            display: 'flex',
            justifyContent: 'flex-end',
            gap: '10px',
            flexShrink: 0,
            background: '#fff',
          }}
        >
          <button
            type="button"
            onClick={onClose}
            style={{
              padding: '8px 14px',
              borderRadius: '8px',
              border: '1px solid #e5e7eb',
              background: '#fff',
              fontSize: '13px',
              color: '#374151',
              cursor: 'pointer',
            }}
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={createMut.isPending}
            style={{
              padding: '8px 16px',
              borderRadius: '8px',
              border: 'none',
              background: createMut.isPending ? '#9ca3af' : '#111827',
              fontSize: '13px',
              fontWeight: 500,
              color: '#fff',
              cursor: createMut.isPending ? 'not-allowed' : 'pointer',
            }}
          >
            {createMut.isPending ? 'Saving…' : 'Save to bank'}
          </button>
        </div>
      </form>
    </div>
  );
}

function DeleteQuestionSetModal({
  target,
  onClose,
  onConfirm,
  isDeleting,
  error,
}: {
  target: QuestionSet | null;
  onClose: () => void;
  onConfirm: () => void;
  isDeleting: boolean;
  error: string | null;
}) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape' && !isDeleting) onClose();
    }
    if (target) {
      document.addEventListener('keydown', onKey);
      return () => document.removeEventListener('keydown', onKey);
    }
  }, [target, isDeleting, onClose]);

  if (!target) return null;

  const tc = TYPE_CONFIG[target.type];
  const dc = DIFF_CONFIG[target.difficulty];
  const chapterLabel = target.chapter === '—' ? 'Untitled set' : target.chapter;

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 220,
        background: 'rgba(17,24,39,0.45)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '24px',
        backdropFilter: 'blur(2px)',
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget && !isDeleting) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="delete-set-title"
        style={{
          background: '#fff',
          borderRadius: '12px',
          width: '100%',
          maxWidth: '400px',
          border: '1px solid #e5e7eb',
          boxShadow: '0 25px 50px -12px rgba(0,0,0,0.18)',
          overflow: 'hidden',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ padding: '22px 22px 16px', textAlign: 'center' }}>
          <div
            style={{
              width: '52px',
              height: '52px',
              margin: '0 auto 14px',
              borderRadius: '50%',
              background: 'linear-gradient(145deg, #fef2f2 0%, #fee2e2 100%)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              border: '1px solid #fecaca',
            }}
          >
            <Trash2 size={24} style={{ color: '#dc2626' }} strokeWidth={2} />
          </div>
          <h2 id="delete-set-title" style={{ margin: 0, fontSize: '17px', fontWeight: 700, color: '#111827', letterSpacing: '-0.02em' }}>
            Delete this question set?
          </h2>
          <p style={{ margin: '10px 0 0', fontSize: '13px', color: '#6b7280', lineHeight: 1.5 }}>
            Removed sets cannot be recovered. If any question is used in a paper or quiz, deletion will be blocked.
          </p>
        </div>

        <div
          style={{
            margin: '0 18px 16px',
            padding: '12px 14px',
            borderRadius: '10px',
            background: '#f9fafb',
            border: '1px solid #e5e7eb',
            textAlign: 'left',
          }}
        >
          <div style={{ fontSize: '11px', fontWeight: 600, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '8px' }}>
            Set summary
          </div>
          <div style={{ fontSize: '14px', fontWeight: 600, color: '#111827', marginBottom: '4px' }}>{tc.label}</div>
          <div style={{ fontSize: '13px', color: '#374151', lineHeight: 1.45, marginBottom: '8px' }}>{chapterLabel}</div>
          <div style={{ fontSize: '12px', color: '#6b7280' }}>
            {target.subject} · {target.grade} · {target.semester}
          </div>
          <div style={{ marginTop: '10px', display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
            <span
              style={{
                fontSize: '11px',
                fontWeight: 600,
                padding: '3px 8px',
                borderRadius: '6px',
                background: dc.bg,
                color: dc.color,
              }}
            >
              {dc.label}
            </span>
            <span style={{ fontSize: '12px', color: '#6b7280' }}>
              {target.questions.length} question{target.questions.length === 1 ? '' : 's'}
            </span>
          </div>
        </div>

        <div
          style={{
            margin: '0 18px 18px',
            padding: '10px 12px',
            borderRadius: '8px',
            background: '#fffbeb',
            border: '1px solid #fde68a',
            display: 'flex',
            gap: '10px',
            alignItems: 'flex-start',
          }}
        >
          <AlertTriangle size={18} style={{ color: '#d97706', flexShrink: 0, marginTop: '1px' }} />
          <span style={{ fontSize: '12px', color: '#92400e', lineHeight: 1.5 }}>
            This removes every question in this card that belongs to the same set title and filters.
          </span>
        </div>

        {error && (
          <div
            style={{
              margin: '0 18px 14px',
              padding: '10px 12px',
              borderRadius: '8px',
              background: '#fef2f2',
              border: '1px solid #fecaca',
              fontSize: '12px',
              color: '#b91c1c',
              lineHeight: 1.45,
            }}
          >
            {error}
          </div>
        )}

        <div
          style={{
            display: 'flex',
            gap: '10px',
            padding: '14px 18px 18px',
            borderTop: '1px solid #f3f4f6',
            background: '#fafafa',
          }}
        >
          <button
            type="button"
            disabled={isDeleting}
            onClick={onClose}
            style={{
              flex: 1,
              padding: '10px 14px',
              borderRadius: '8px',
              border: '1px solid #e5e7eb',
              background: '#fff',
              fontSize: '13px',
              fontWeight: 500,
              color: '#374151',
              cursor: isDeleting ? 'not-allowed' : 'pointer',
              opacity: isDeleting ? 0.7 : 1,
            }}
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={isDeleting}
            onClick={onConfirm}
            style={{
              flex: 1,
              padding: '10px 14px',
              borderRadius: '8px',
              border: 'none',
              background: isDeleting ? '#fca5a5' : 'linear-gradient(180deg, #ef4444 0%, #dc2626 100%)',
              fontSize: '13px',
              fontWeight: 600,
              color: '#fff',
              cursor: isDeleting ? 'not-allowed' : 'pointer',
              boxShadow: isDeleting ? 'none' : '0 1px 2px rgba(220,38,38,0.25)',
            }}
          >
            {isDeleting ? 'Deleting…' : 'Delete set'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main Component ─────────────────────────────────────────────────────────────
export default function AssessmentLibrary() {
  const qc = useQueryClient();
  const [search,        setSearch]        = useState('');
  const [filterSubject, setFilterSubject] = useState('All Subjects');
  const [filterGrade,   setFilterGrade]   = useState('All Grades');
  const [filterSem,     setFilterSem]     = useState('All Semesters');
  const [filterDiff,    setFilterDiff]    = useState('All Difficulties');
  const [filterType,    setFilterType]    = useState('All Types');
  const [activeSet,     setActiveSet]     = useState<QuestionSet | null>(null);
  const [showAddModal,  setShowAddModal]  = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<QuestionSet | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [debouncedQ, setDebouncedQ] = useState('');

  useEffect(() => {
    const t = window.setTimeout(() => setDebouncedQ(search.trim()), 350);
    return () => window.clearTimeout(t);
  }, [search]);

  const listParams = useMemo(
    () => ({
      subject: isDefault(filterSubject) ? undefined : filterSubject,
      grade: isDefault(filterGrade) ? undefined : filterGrade,
      semester: isDefault(filterSem) ? undefined : filterSem,
      difficulty: isDefault(filterDiff) ? undefined : filterDiff,
      question_type: isDefault(filterType) ? undefined : filterType,
      q: debouncedQ || undefined,
    }),
    [filterSubject, filterGrade, filterSem, filterDiff, filterType, debouncedQ],
  );

  const {
    data: qbRes,
    isPending: loading,
    isFetching,
    isError,
    error: qbError,
  } = useQuery({
    queryKey: teacherKeys.questionBankSets(listParams),
    queryFn: () => listQuestionBankSetsApi(listParams),
  });
  const loadError = isError ? (qbError instanceof Error ? qbError.message : 'Failed to load question bank') : null;
  const sets = useMemo(
    () => (qbRes?.sets ?? []).map(mapQuestionBankDtoToSet),
    [qbRes],
  );

  const deleteMut = useMutation({
    mutationFn: deleteQuestionBankSetByKeyApi,
    onSuccess: (_data, variables) => {
      qc.setQueriesData(
        { queryKey: ['teacher', 'questionBank', 'sets'] },
        (old: QuestionBankSetsResponseDto | undefined) => {
          if (!old?.sets) return old;
          return {
            ...old,
            sets: old.sets.filter((s) => !bankSetMatchesDeletePayload(s, variables)),
          };
        },
      );
      setActiveSet((prev) => {
        if (!prev) return null;
        return questionBankMetaMatchesDelete(
          prev.subject,
          prev.grade,
          prev.semester,
          prev.chapter,
          prev.type,
          variables,
        )
          ? null
          : prev;
      });
      void qc.invalidateQueries({
        queryKey: ['teacher', 'questionBank', 'sets'],
        refetchType: 'none',
      });
      setDeleteTarget(null);
      setDeleteError(null);
    },
    onError: (err) => {
      setDeleteError(err instanceof Error ? err.message : String(err));
    },
  });

  const openDeleteConfirm = (set: QuestionSet) => {
    setDeleteError(null);
    setDeleteTarget(set);
  };

  const closeDeleteConfirm = () => {
    if (deleteMut.isPending) return;
    setDeleteTarget(null);
    setDeleteError(null);
  };

  const confirmDeleteSet = () => {
    if (!deleteTarget) return;
    setDeleteError(null);
    deleteMut.mutate({
      subject: deleteTarget.subject,
      grade: deleteTarget.grade,
      semester: deleteTarget.semester !== '—' ? deleteTarget.semester : undefined,
      chapter: deleteTarget.chapter,
      question_type: deleteTarget.type,
    });
  };

  const searchPending = search.trim() !== debouncedQ;
  const totalQuestions = sets.reduce((a, s) => a + s.questions.length, 0);
  const uniqueTypes    = new Set(sets.map(s => s.type)).size;

  const hasActiveFilters =
    !isDefault(filterSubject) || !isDefault(filterGrade) ||
    !isDefault(filterSem)     || !isDefault(filterDiff)  ||
    !isDefault(filterType)    || search !== '';

  return (
    <div style={{ display: 'flex', height: 'calc(100vh - 48px)', overflow: 'hidden', position: 'relative', background: '#fafafa' }}>

      {/* ── Filter sidebar（与 Exam Papers 左栏一致）──────────────── */}
      <aside style={{
        width: '200px', flexShrink: 0, borderRight: '1px solid #e5e7eb',
        background: '#fff', overflowY: 'auto', padding: '16px 14px',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '8px' }}>
          <Filter size={14} style={{ color: '#6b7280' }} />
          <span style={{ fontSize: '13px', fontWeight: 600, color: '#111827' }}>Filter</span>
        </div>

        <div style={{ fontSize: '11px', color: '#9ca3af', marginBottom: '14px' }}>
          {totalQuestions} questions · {uniqueTypes} types
          {searchPending && isFetching && (
            <span style={{ display: 'block', marginTop: '4px', color: '#3b5bdb' }}>Updating search…</span>
          )}
        </div>

        <div style={{ marginBottom: '20px' }}>
          <div style={{ fontSize: '13px', fontWeight: 600, color: '#374151', marginBottom: '8px' }}>Search</div>
          <div style={{ position: 'relative' }}>
            <Search size={13} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: '#9ca3af', pointerEvents: 'none' }} />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Title, prompt, answer, source…"
              style={{
                width: '100%', boxSizing: 'border-box', padding: '8px 10px 8px 32px',
                border: '1px solid #e8eaed', borderRadius: '8px', fontSize: '13px',
                color: '#374151', outline: 'none', background: '#fff',
              }}
              onFocus={e => { e.currentTarget.style.borderColor = '#3b5bdb'; }}
              onBlur={e => { e.currentTarget.style.borderColor = '#e8eaed'; }}
            />
          </div>
        </div>

        <FilterSelect label="Subject"       options={SUBJECT_OPTIONS}  value={filterSubject} onChange={setFilterSubject} />
        <FilterSelect label="Grade"         options={GRADE_OPTIONS}    value={filterGrade}   onChange={setFilterGrade} />
        <FilterSelect label="Semester"      options={SEMESTER_OPTIONS} value={filterSem}     onChange={setFilterSem} />
        <FilterSelect label="Difficulty"    options={DIFF_OPTIONS}     value={filterDiff}    onChange={setFilterDiff} />
        <FilterSelect label="Question Type" options={TYPE_OPTIONS}     value={filterType}    onChange={setFilterType} />

        {hasActiveFilters && (
          <button
            type="button"
            onClick={() => { setSearch(''); setFilterSubject('All Subjects'); setFilterGrade('All Grades'); setFilterSem('All Semesters'); setFilterDiff('All Difficulties'); setFilterType('All Types'); }}
            style={{ width: '100%', padding: '8px', borderRadius: '8px', border: '1px dashed #d1d5db', background: 'transparent', fontSize: '13px', color: '#6b7280', cursor: 'pointer', marginTop: '4px' }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = '#9ca3af'; (e.currentTarget as HTMLElement).style.color = '#374151'; }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = '#d1d5db'; (e.currentTarget as HTMLElement).style.color = '#6b7280'; }}
          >
            Reset Filters
          </button>
        )}
      </aside>

      {/* ── Card Grid ────────────────────────────────────────── */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minWidth: 0 }}>
        {/* Top bar */}
        <div style={{ padding: '10px 14px', borderBottom: '1px solid #e5e7eb', background: '#fff', flexShrink: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontSize: '12px', color: '#6b7280' }}>
            {sets.length} sets · {totalQuestions} questions
          </span>
          <button
            type="button"
            onClick={() => setShowAddModal(true)}
            style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', padding: '6px 12px', borderRadius: '6px', border: '1px solid #e5e7eb', background: '#111827', color: '#fff', fontSize: '12px', fontWeight: 500, cursor: 'pointer', marginLeft: 'auto' }}
          >
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
          ) : sets.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '64px 16px', color: '#9ca3af' }}>
              <Search size={28} style={{ opacity: 0.35, display: 'block', margin: '0 auto 10px' }} />
              <div style={{ fontSize: '13px' }}>{loadError ? 'Could not load data' : 'No matches'}</div>
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '12px' }}>
              {sets.map(set => (
                <React.Fragment key={set.id}>
                  <QuestionSetCard
                    set={set}
                    onView={() => setActiveSet(set)}
                    onDelete={set.canDelete ? () => openDeleteConfirm(set) : undefined}
                    deleteBusy={deleteMut.isPending}
                  />
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

      <CreateSetModal open={showAddModal} onClose={() => setShowAddModal(false)} />

      <DeleteQuestionSetModal
        target={deleteTarget}
        onClose={closeDeleteConfirm}
        onConfirm={confirmDeleteSet}
        isDeleting={deleteMut.isPending}
        error={deleteError}
      />
    </div>
  );
}

// ── Question Set Card ─────────────────────────────────────────────────────────
function QuestionSetCard({
  set,
  onView,
  onDelete,
  deleteBusy,
}: {
  set: QuestionSet;
  onView: () => void;
  onDelete?: () => void;
  deleteBusy?: boolean;
}) {
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
              <span style={{ color: sc.color, fontWeight: 500 }}>{set.subject}</span>
              {' · '}{set.grade} · {set.semester}
              {' · '}{dc.label}
              {set.source ? (
                <>
                  {' · '}
                  <span style={{ color: '#6b7280' }}>{set.source}</span>
                </>
              ) : null}
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

      <div
        style={{
          display: 'flex',
          borderTop: '1px solid #f3f4f6',
          background: hovered ? '#f9fafb' : '#fff',
          transition: 'background 0.12s',
        }}
      >
        <button
          type="button"
          onClick={onView}
          style={{
            flex: 1,
            padding: '9px 10px',
            border: 'none',
            borderRight: onDelete ? '1px solid #f3f4f6' : 'none',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '6px',
            background: 'transparent',
            color: '#374151',
            fontSize: '12px',
            fontWeight: 500,
            cursor: 'pointer',
          }}
        >
          <Eye size={13} style={{ color: '#9ca3af' }} />
          View
        </button>
        {onDelete && (
          <button
            type="button"
            disabled={deleteBusy}
            onClick={(e) => {
              e.stopPropagation();
              onDelete();
            }}
            style={{
              flex: onDelete ? 0.85 : 1,
              minWidth: '72px',
              padding: '9px 10px',
              border: 'none',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '5px',
              background: 'transparent',
              color: deleteBusy ? '#9ca3af' : '#b91c1c',
              fontSize: '12px',
              fontWeight: 500,
              cursor: deleteBusy ? 'not-allowed' : 'pointer',
            }}
          >
            <Trash2 size={13} />
            Delete
          </button>
        )}
      </div>
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
                    <div style={{ margin: '0 0 10px', fontSize: '13px', color: '#374151', lineHeight: 1.65 }}>
                      <BankRichText text={q.prompt} />
                    </div>
                    {/* MCQ options */}
                    {q.options && (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                        {q.options.map(opt => {
                          const letter = opt[0];
                          const isCorrect = q.answer === letter;
                          return (
                            <div key={opt} style={{
                              display: 'flex', alignItems: 'flex-start', gap: '10px',
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
                              <div style={{
                                flex: 1,
                                minWidth: 0,
                                fontSize: '13px',
                                color: isCorrect ? '#15803d' : '#374151',
                                fontWeight: isCorrect ? 500 : 400,
                              }}>
                                <BankRichText text={opt.slice(3)} />
                              </div>
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
                        <span style={{ fontWeight: 600 }}>Answer: </span>
                        <BankRichText text={q.answer} />
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
