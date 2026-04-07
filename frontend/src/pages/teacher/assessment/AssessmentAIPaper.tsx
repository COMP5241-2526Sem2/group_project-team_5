import React, { useState, useEffect, useRef } from 'react';
import type { LucideIcon } from 'lucide-react';
import { fetchPaperMetaOptionsApi } from '../../../utils/paperApi';
import {
  ChevronRight, ChevronLeft, Check, Sparkles, Loader2,
  FileText, Clock, Award, BookOpen, Target, Layers,
  Download, Printer, Save, RotateCcw, ChevronDown,
  Plus, Minus, GripVertical, Trash2, Edit3, Send,
  FilePen, AlertCircle, ClipboardList, Trophy, Medal, RefreshCw,
} from 'lucide-react';

// ── Types ─────────────────────────────────────────────────────────────────────
type ExamType = 'midterm' | 'final' | 'unit' | 'special' | 'review' | 'contest';
type Difficulty = 'easy' | 'medium' | 'hard' | 'mixed';
type PageView = 'wizard' | 'drafts';

interface SectionCfg {
  key: string;
  label: string;
  type: string;
  count: number;
  scoreEach: number;
}

interface GeneratedSection {
  title: string;
  description: string;
  questions: GeneratedQ[];
}

interface GeneratedQ {
  id: string;
  prompt: string;
  options?: { key: string; text: string; correct: boolean }[];
  answer?: string;
  score: number;
  difficulty: 'easy' | 'medium' | 'hard';
}

interface DraftPaper {
  id: string;
  title: string;
  grade: string;
  subject: string;
  examType: ExamType;
  totalScore: number;
  duration: number;
  questionCount: number;
  savedAt: string;          // ISO string
  sections: GeneratedSection[];
  note?: string;
}

// ── Config ────────────────────────────────────────────────────────────────────
const EXAM_TYPES: { id: ExamType; Icon: LucideIcon; label: string; desc: string }[] = [
  { id: 'midterm', Icon: ClipboardList, label: 'Midterm Exam',     desc: 'Mid-semester comprehensive test' },
  { id: 'final',   Icon: Trophy,        label: 'Final Exam',       desc: 'End-of-semester comprehensive test' },
  { id: 'unit',    Icon: BookOpen,      label: 'Unit Test',        desc: 'Targeted chapter/unit assessment' },
  { id: 'special', Icon: Target,        label: 'Special Practice', desc: 'Focused knowledge point drills' },
  { id: 'review',  Icon: RefreshCw,     label: 'Review Test',      desc: 'Multi-chapter comprehensive review' },
  { id: 'contest', Icon: Medal,         label: 'Contest Mock',     desc: 'Competition-level simulation exam' },
];

const DEFAULT_GRADES = ['Grade 7', 'Grade 8', 'Grade 9', 'Grade 10', 'Grade 11', 'Grade 12'];
const DEFAULT_SUBJECTS = ['Mathematics', 'Physics', 'Chemistry', 'Biology', 'English', 'History', 'Geography', 'Political Science'];
const DEFAULT_PUBLISHERS = ["PEP (People's Education Press)", 'Beijing Normal University Press', 'Oxford University Press', 'Jiangsu Education Press'];

const CHAPTERS_BY_SUBJECT: Record<string, string[]> = {
  Biology:     ['Ch.1 Cell Structure', 'Ch.2 Cell Function', 'Ch.3 Photosynthesis', 'Ch.4 Cellular Respiration', 'Ch.5 Genetics'],
  Physics:     ["Ch.1 Kinematics", "Ch.2 Newton's Laws", 'Ch.3 Work & Energy', 'Ch.4 Momentum', 'Ch.5 Waves'],
  Chemistry:   ['Ch.1 Atoms & Molecules', 'Ch.2 Chemical Reactions', 'Ch.3 Acids & Bases', 'Ch.4 Electrochemistry', 'Ch.5 Organic Chemistry'],
  Mathematics: ['Ch.1 Functions', 'Ch.2 Trigonometry', 'Ch.3 Sequences', 'Ch.4 Derivatives', 'Ch.5 Statistics'],
  English:     ['Unit 1 Reading', 'Unit 2 Grammar', 'Unit 3 Writing', 'Unit 4 Listening', 'Unit 5 Speaking'],
  default:     ['Chapter 1', 'Chapter 2', 'Chapter 3', 'Chapter 4', 'Chapter 5'],
};

const DEFAULT_SECTIONS: SectionCfg[] = [
  { key: 'mcq',    label: 'Section I  — Multiple Choice',  type: 'MCQ',          count: 15, scoreEach: 3 },
  { key: 'tf',     label: 'Section II — True / False',     type: 'True/False',   count: 5,  scoreEach: 2 },
  { key: 'fill',   label: 'Section III — Fill in Blank',   type: 'Fill-blank',   count: 5,  scoreEach: 3 },
  { key: 'sa',     label: 'Section IV — Short Answer',     type: 'Short Answer', count: 3,  scoreEach: 6 },
  { key: 'essay',  label: 'Section V  — Essay',            type: 'Essay',        count: 1,  scoreEach: 15 },
];

// 当前页面只展示真实数据/真实生成结果；不再内置 mock 试卷与 mock 草稿，避免无效加载与包体膨胀。

const DIFF_CFG = {
  easy:   { bg: '#dcfce7', color: '#15803d' },
  medium: { bg: '#fef9c3', color: '#a16207' },
  hard:   { bg: '#fee2e2', color: '#b91c1c' },
};

function fmtDate(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) +
    ' · ' + d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
}

// ── Custom select ─────────────────────────────────────────────────────────────
function SimpleSelect({ label, options, value, onChange, placeholder, required }: {
  label: string; options: string[]; value: string; onChange: (v: string) => void;
  placeholder?: string; required?: boolean;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ position: 'relative' }}>
      <div style={{ fontSize: '13px', fontWeight: 500, color: '#374151', marginBottom: '6px' }}>
        {label}{required && <span style={{ color: '#ef4444', marginLeft: '2px' }}>*</span>}
      </div>
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '9px 12px', borderRadius: '8px', cursor: 'pointer',
          border: `1.5px solid ${open ? '#3b5bdb' : '#e8eaed'}`,
          background: '#fff', outline: 'none', transition: 'border-color 0.15s',
        }}
      >
        <span style={{ fontSize: '13px', color: value ? '#0f0f23' : '#9ca3af', fontWeight: value ? 500 : 400 }}>
          {value || placeholder || 'Select…'}
        </span>
        <ChevronDown size={13} style={{ color: open ? '#3b5bdb' : '#9ca3af', transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.18s' }} />
      </button>
      {open && (
        <div
          style={{ position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0, zIndex: 50, background: '#fff', border: '1.5px solid #e8eaed', borderRadius: '10px', boxShadow: '0 8px 24px rgba(0,0,0,0.10)', padding: '4px' }}
          onMouseLeave={() => setOpen(false)}
        >
          {options.map(opt => (
            <button key={opt} onClick={() => { onChange(opt); setOpen(false); }}
              style={{
                width: '100%', padding: '8px 10px', borderRadius: '7px',
                borderTop: 'none', borderRight: 'none', borderBottom: 'none', borderLeft: 'none',
                cursor: 'pointer',
                background: value === opt ? '#eff6ff' : 'transparent',
                color: value === opt ? '#3b5bdb' : '#374151',
                fontSize: '13px', fontWeight: value === opt ? 600 : 400, textAlign: 'left',
              }}
              onMouseEnter={e => { if (value !== opt) (e.currentTarget as HTMLElement).style.background = '#f9fafb'; }}
              onMouseLeave={e => { if (value !== opt) (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
            >
              {opt}
              {value === opt && <Check size={11} style={{ float: 'right', color: '#3b5bdb', marginTop: '2px' }} />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function CountStepper({ value, onChange, min = 0, max = 30 }: { value: number; onChange: (v: number) => void; min?: number; max?: number }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', border: '1px solid #e8eaed', borderRadius: '8px', overflow: 'hidden' }}>
      <button onClick={() => onChange(Math.max(min, value - 1))}
        style={{ width: '32px', height: '32px', borderTop: 'none', borderRight: 'none', borderBottom: 'none', borderLeft: 'none', background: '#f9fafb', color: '#374151', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Minus size={12} />
      </button>
      <div style={{ width: '40px', textAlign: 'center', fontSize: '13px', fontWeight: 600, color: '#0f0f23', borderLeft: '1px solid #e8eaed', borderRight: '1px solid #e8eaed', height: '32px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        {value}
      </div>
      <button onClick={() => onChange(Math.min(max, value + 1))}
        style={{ width: '32px', height: '32px', borderTop: 'none', borderRight: 'none', borderBottom: 'none', borderLeft: 'none', background: '#f9fafb', color: '#374151', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Plus size={12} />
      </button>
    </div>
  );
}

// ── Draft Card ────────────────────────────────────────────────────────────────
function DraftCard({
  draft,
  onDelete,
  onPublish,
}: {
  draft: DraftPaper;
  onDelete: (id: string) => void;
  onPublish: (id: string) => void;
}) {
  const examCfg = EXAM_TYPES.find(e => e.id === draft.examType);
  const EtIcon = examCfg?.Icon;
  const [confirmDelete, setConfirmDelete] = useState(false);

  return (
    <div style={{
      background: '#fff',
      border: '1px solid #e8eaed',
      borderRadius: '14px',
      padding: '20px 22px',
      display: 'flex',
      flexDirection: 'column',
      gap: '12px',
      transition: 'box-shadow 0.15s, border-color 0.15s',
      position: 'relative',
      overflow: 'hidden',
    }}
      onMouseEnter={e => {
        (e.currentTarget as HTMLElement).style.boxShadow = '0 4px 16px rgba(59,91,219,0.10)';
        (e.currentTarget as HTMLElement).style.borderColor = '#c7d2fe';
      }}
      onMouseLeave={e => {
        (e.currentTarget as HTMLElement).style.boxShadow = 'none';
        (e.currentTarget as HTMLElement).style.borderColor = '#e8eaed';
      }}
    >
      {/* Left accent */}
      <div style={{ position: 'absolute', top: 0, left: 0, width: '3px', height: '100%', background: '#e5e7eb', borderRadius: '14px 0 0 14px' }} />

      {/* Top row */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '12px', paddingLeft: '8px' }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
            <span style={{ fontSize: '10px', fontWeight: 700, padding: '2px 8px', borderRadius: '20px', background: '#f3f4f6', color: '#374151', letterSpacing: '0.03em', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
              {EtIcon && <EtIcon size={11} style={{ color: '#9ca3af' }} />}
              {examCfg?.label}
            </span>
            <span style={{ fontSize: '10px', fontWeight: 600, padding: '2px 8px', borderRadius: '20px', background: '#fef9c3', color: '#a16207' }}>
              DRAFT
            </span>
          </div>
          <div style={{ fontSize: '15px', fontWeight: 700, color: '#0f0f23', lineHeight: 1.4, marginBottom: '2px' }}>
            {draft.title}
          </div>
          <div style={{ fontSize: '12px', color: '#6b7280' }}>
            {draft.grade} · {draft.subject}
          </div>
        </div>
      </div>

      {/* Stats row */}
      <div style={{ display: 'flex', gap: '16px', paddingLeft: '8px' }}>
        {[
          { icon: <FileText size={11} />, label: `${draft.questionCount} questions` },
          { icon: <Award size={11} />,    label: `${draft.totalScore} pts` },
          { icon: <Clock size={11} />,    label: `${draft.duration} min` },
        ].map(item => (
          <div key={item.label} style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '12px', color: '#6b7280' }}>
            <span style={{ color: '#9ca3af' }}>{item.icon}</span>
            {item.label}
          </div>
        ))}
      </div>

      {/* Note */}
      {draft.note && (
        <div style={{ paddingLeft: '8px', display: 'flex', alignItems: 'flex-start', gap: '6px' }}>
          <AlertCircle size={12} style={{ color: '#f59e0b', flexShrink: 0, marginTop: '1px' }} />
          <span style={{ fontSize: '12px', color: '#92400e', lineHeight: 1.5 }}>{draft.note}</span>
        </div>
      )}

      {/* Footer row */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingLeft: '8px', paddingTop: '4px', borderTop: '1px solid #f3f4f6' }}>
        <span style={{ fontSize: '11px', color: '#9ca3af' }}>
          Saved {fmtDate(draft.savedAt)}
        </span>

        <div style={{ display: 'flex', gap: '6px' }}>
          {confirmDelete ? (
            <>
              <span style={{ fontSize: '12px', color: '#ef4444', display: 'flex', alignItems: 'center', gap: '4px', marginRight: '4px' }}>
                Delete?
              </span>
              <button
                onClick={() => setConfirmDelete(false)}
                style={{ padding: '5px 12px', borderRadius: '7px', border: '1px solid #e8eaed', background: '#fff', color: '#374151', fontSize: '12px', cursor: 'pointer' }}>
                Cancel
              </button>
              <button
                onClick={() => onDelete(draft.id)}
                style={{ padding: '5px 12px', borderRadius: '7px', border: 'none', background: '#fee2e2', color: '#b91c1c', fontSize: '12px', fontWeight: 600, cursor: 'pointer' }}>
                Confirm
              </button>
            </>
          ) : (
            <>
              <button
                onClick={() => setConfirmDelete(true)}
                style={{ display: 'flex', alignItems: 'center', gap: '4px', padding: '5px 10px', borderRadius: '7px', border: '1px solid #fecaca', background: '#fff', color: '#ef4444', fontSize: '12px', cursor: 'pointer' }}>
                <Trash2 size={11} /> Delete
              </button>
              <button
                style={{ display: 'flex', alignItems: 'center', gap: '4px', padding: '5px 12px', borderRadius: '7px', border: '1px solid #e8eaed', background: '#fff', color: '#374151', fontSize: '12px', cursor: 'pointer' }}>
                <Edit3 size={11} /> Edit
              </button>
              <button
                onClick={() => onPublish(draft.id)}
                style={{ display: 'flex', alignItems: 'center', gap: '4px', padding: '5px 14px', borderRadius: '7px', border: 'none', background: '#3b5bdb', color: '#fff', fontSize: '12px', fontWeight: 600, cursor: 'pointer' }}>
                <Send size={11} /> Publish
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Drafts view ───────────────────────────────────────────────────────────────
function DraftsView({
  drafts,
  onDelete,
  onPublish,
}: {
  drafts: DraftPaper[];
  onDelete: (id: string) => void;
  onPublish: (id: string) => void;
}) {
  return (
    <div style={{ width: '100%' }}>
      {/* Header */}
      <div style={{ marginBottom: '24px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <h2 style={{ fontSize: '20px', fontWeight: 700, color: '#0f0f23', margin: '0 0 4px' }}>
              Draft Papers
            </h2>
            <p style={{ fontSize: '13px', color: '#6b7280', margin: 0 }}>
              {drafts.length} paper{drafts.length !== 1 ? 's' : ''} waiting to be reviewed and published
            </p>
          </div>
        </div>
      </div>

      {drafts.length === 0 ? (
        /* Empty state */
        <div style={{
          textAlign: 'center', padding: '72px 40px',
          background: '#fafafa', border: '1.5px dashed #d1d5db',
          borderRadius: '16px',
        }}>
          <div style={{ width: '56px', height: '56px', borderRadius: '16px', background: '#eef2ff', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
            <FilePen size={26} style={{ color: '#3b5bdb' }} />
          </div>
          <div style={{ fontSize: '16px', fontWeight: 700, color: '#374151', marginBottom: '6px' }}>No drafts yet</div>
          <div style={{ fontSize: '13px', color: '#9ca3af' }}>
            Generated papers saved as drafts will appear here for further editing before publishing.
          </div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {drafts.map(d => (
            <React.Fragment key={d.id}>
              <DraftCard draft={d} onDelete={onDelete} onPublish={onPublish} />
            </React.Fragment>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────
export default function AssessmentAIPaper() {
  const [pageView, setPageView] = useState<PageView>('wizard');
  const [drafts, setDrafts] = useState<DraftPaper[]>([]);
  const [publishedIds, setPublishedIds] = useState<string[]>([]);

  const [step, setStep] = useState(1);

  // Step 1
  const [examType, setExamType] = useState<ExamType | null>(null);

  // Step 2
  const [grade,     setGrade]     = useState('');
  const [subject,   setSubject]   = useState('');
  const [semester,  setSemester]  = useState<'Vol.1' | 'Vol.2'>('Vol.1');
  const [publisher, setPublisher] = useState('');
  const [title,     setTitle]     = useState('');
  const [totalScore, setTotalScore] = useState(120);
  const [duration,  setDuration]  = useState(90);

  // Step 3
  const [selectedChapters, setSelectedChapters] = useState<string[]>([]);
  const [difficulty, setDifficulty] = useState<Difficulty>('mixed');
  const [sections, setSections] = useState<SectionCfg[]>(DEFAULT_SECTIONS);

  // Step 4
  const [generating, setGenerating]   = useState(false);
  const [genProgress, setGenProgress] = useState(0);
  const [genDone,    setGenDone]      = useState(false);
  const [paper,      setPaper]        = useState<GeneratedSection[]>([]);
  const [draftSaved, setDraftSaved]   = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [gradeOptions, setGradeOptions] = useState<string[]>(DEFAULT_GRADES);
  const [subjectOptions, setSubjectOptions] = useState<string[]>(DEFAULT_SUBJECTS);
  const [publisherOptions, setPublisherOptions] = useState<string[]>(DEFAULT_PUBLISHERS);
  const [publisherSourceNote, setPublisherSourceNote] = useState('');

  const chapters = CHAPTERS_BY_SUBJECT[subject] || CHAPTERS_BY_SUBJECT['default'];

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const meta = await fetchPaperMetaOptionsApi();
        if (cancelled) return;
        if (meta.grades?.length) setGradeOptions(meta.grades);
        if (meta.subjects?.length) setSubjectOptions(meta.subjects);
        if (meta.publishers?.length) setPublisherOptions(meta.publishers);
      } catch {
        // Keep default local options if backend metadata is unavailable.
      }
    })();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const semesterValue = semester === 'Vol.1' ? 'vol1' : 'vol2';
        const meta = await fetchPaperMetaOptionsApi({ grade, subject, semester: semesterValue });
        if (cancelled) return;
        if (meta.publishers?.length) setPublisherOptions(meta.publishers);
        setPublisherSourceNote(
          meta.publisher_source === 'ai_generated'
            ? 'Publisher list is AI-recommended (no exact database match).'
            : meta.publisher_source === 'fallback_default'
              ? 'Showing default publisher list (no database/AI result).'
              : ''
        );
        if (publisher && meta.publishers?.length && !meta.publishers.includes(publisher)) {
          setPublisher('');
        }
      } catch {
        if (!cancelled) setPublisherSourceNote('');
      }
    })();
    return () => { cancelled = true; };
  }, [grade, subject, semester]);

  function toggleChapter(ch: string) {
    setSelectedChapters(prev =>
      prev.includes(ch) ? prev.filter(c => c !== ch) : [...prev, ch]
    );
  }

  function totalQ() { return sections.reduce((s, t) => s + t.count, 0); }
  function calcTotal() { return sections.reduce((s, t) => s + t.count * t.scoreEach, 0); }

  function setSectionCount(key: string, val: number) {
    setSections(prev => prev.map(s => s.key === key ? { ...s, count: val } : s));
  }
  function setSectionScore(key: string, val: number) {
    setSections(prev => prev.map(s => s.key === key ? { ...s, scoreEach: val } : s));
  }

  async function handleGenerate() {
    setErrorMsg(null);
    setGenerating(true); setGenProgress(0); setGenDone(false); setPaper([]); setDraftSaved(false);
    const steps = [8, 20, 35, 52, 68, 82, 93, 100];
    for (const p of steps) {
      await new Promise(r => setTimeout(r, 380));
      setGenProgress(p);
    }
    await new Promise(r => setTimeout(r, 300));
    // 后端生成尚未接入时，保持为空并提示
    setPaper([]);
    setGenerating(false);
    setGenDone(true);
    setErrorMsg('暂未接入试卷生成接口，请使用“Generate”页生成并保存为试卷。');
  }

  function handleSaveDraft() {
    if (!paper.length) return;
    const newDraft: DraftPaper = {
      id: `d${Date.now()}`,
      title: title || `${grade} ${subject} ${EXAM_TYPES.find(e => e.id === examType)?.label ?? 'Exam'}`,
      grade,
      subject,
      examType: examType!,
      totalScore,
      duration,
      questionCount: paper.reduce((n, s) => n + s.questions.length, 0),
      savedAt: new Date().toISOString(),
      sections: paper,
    };
    setDrafts(prev => [newDraft, ...prev]);
    setDraftSaved(true);
  }

  function handleDeleteDraft(id: string) {
    setDrafts(prev => prev.filter(d => d.id !== id));
  }

  function handlePublishDraft(id: string) {
    setPublishedIds(prev => [...prev, id]);
    setTimeout(() => setDrafts(prev => prev.filter(d => d.id !== id)), 900);
  }

  const examTypeCfg = EXAM_TYPES.find(e => e.id === examType);
  const mainScrollRef = useRef<HTMLDivElement>(null);

  const WIZARD_STEPS = [
    { n: 1, label: 'Exam Type' },
    { n: 2, label: 'Basic Info' },
    { n: 3, label: 'Content & Structure' },
    { n: 4, label: 'Generate & Preview' },
  ] as const;

  useEffect(() => {
    if (mainScrollRef.current) {
      mainScrollRef.current.scrollTo({ top: 0, behavior: 'auto' });
    }
  }, [step, pageView]);

  const contentMaxWidth = step === 4 && pageView === 'wizard' ? '800px' : '680px';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 48px)', overflow: 'hidden', background: '#fafafa' }}>

      {/* Top: Paper Generator — flat horizontal stepper (wizard only) */}
      {pageView === 'wizard' && (
        <div style={{ borderBottom: '1px solid #e5e7eb', background: '#fff', padding: '12px 20px 10px' }}>
          <div style={{ width: '100%', maxWidth: '980px', margin: '0 auto', overflowX: 'auto' }}>
            <div style={{ fontSize: '11px', fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: '10px' }}>Paper Generator</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'nowrap' }}>
              {WIZARD_STEPS.map((s, idx, arr) => (
                <React.Fragment key={s.n}>
                  <button
                    type="button"
                    onClick={step > s.n ? () => setStep(s.n) : undefined}
                    style={{
                      display: 'inline-flex', alignItems: 'center', gap: '6px',
                      padding: '6px 4px 8px',
                      border: 'none',
                      background: 'transparent',
                      borderBottom: step === s.n ? '2px solid #111827' : '2px solid transparent',
                      color: step === s.n ? '#111827' : step > s.n ? '#4b5563' : '#9ca3af',
                      cursor: step > s.n ? 'pointer' : 'default',
                      fontSize: '12px', fontWeight: step === s.n ? 600 : 500,
                      whiteSpace: 'nowrap',
                    }}
                  >
                    <span style={{
                      width: '20px', height: '20px', borderRadius: '50%',
                      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                      border: `1px solid ${step === s.n ? '#111827' : step > s.n ? '#d1d5db' : '#e5e7eb'}`,
                      background: step > s.n ? '#f9fafb' : '#fff',
                      color: step === s.n ? '#111827' : step > s.n ? '#374151' : '#9ca3af',
                      fontSize: '10px', fontWeight: 700,
                    }}>
                      {step > s.n ? <Check size={11} strokeWidth={2.5} /> : s.n}
                    </span>
                    {s.label}
                  </button>
                  {idx < arr.length - 1 && (
                    <ChevronRight size={14} style={{ color: '#d1d5db', flexShrink: 0 }} aria-hidden />
                  )}
                </React.Fragment>
              ))}
            </div>
          </div>
        </div>
      )}

      {pageView === 'drafts' && (
        <div style={{ borderBottom: '1px solid #e5e7eb', background: '#fff', padding: '12px 20px 10px' }}>
          <div style={{ width: '100%', maxWidth: '980px', margin: '0 auto' }}>
            <div style={{ fontSize: '11px', fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: '4px' }}>Paper Generator</div>
            <div style={{ fontSize: '13px', color: '#6b7280' }}>Draft papers — review and publish when ready</div>
          </div>
        </div>
      )}

      {/* Main content */}
      <div ref={mainScrollRef} style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden', padding: '16px 20px', minWidth: 0, display: 'flex', justifyContent: 'center' }}>

        <div style={{ width: '100%', maxWidth: contentMaxWidth }}>

        {/* ── Tab bar ── */}
        <div style={{ display: 'flex', gap: '4px', marginBottom: '16px', borderBottom: '1px solid #e5e7eb', paddingBottom: '0' }}>
          {([
            { id: 'wizard' as PageView, label: 'New Paper' },
            { id: 'drafts' as PageView, label: `Drafts${drafts.length > 0 ? ` (${drafts.length})` : ''}` },
          ]).map(tab => {
            const active = pageView === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setPageView(tab.id)}
                style={{
                  padding: '8px 12px', cursor: 'pointer',
                  borderTop: 'none', borderRight: 'none', borderLeft: 'none',
                  borderBottom: `2px solid ${active ? '#111827' : 'transparent'}`,
                  background: 'transparent',
                  color: active ? '#111827' : '#6b7280',
                  fontSize: '12px', fontWeight: active ? 600 : 500,
                  transition: 'all 0.15s',
                  marginBottom: '-1px',
                }}>
                {tab.label}
              </button>
            );
          })}
        </div>

        {/* ── Drafts view ── */}
        {pageView === 'drafts' && (
          <DraftsView
            drafts={drafts}
            onDelete={handleDeleteDraft}
            onPublish={handlePublishDraft}
          />
        )}

        {/* ── Wizard ── */}
        {pageView === 'wizard' && (
          <>
            {/* ══ STEP 1: Exam Type ══ */}
            {step === 1 && (
              <div>
                <div style={{ marginBottom: '24px' }}>
                  <h2 style={{ fontSize: '20px', fontWeight: 700, color: '#0f0f23', margin: '0 0 6px' }}>Select Exam Type</h2>
                  <p style={{ fontSize: '13px', color: '#6b7280', margin: 0 }}>
                    Choose the type and purpose of the exam paper you want to generate.
                  </p>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '32px' }}>
                  {EXAM_TYPES.map(et => {
                    const isSelected = examType === et.id;
                    const EtIcon = et.Icon;
                    return (
                      <button
                        key={et.id}
                        onClick={() => setExamType(et.id)}
                        style={{
                          display: 'flex', alignItems: 'flex-start', gap: '14px',
                          padding: '16px 18px', borderRadius: '12px', cursor: 'pointer', textAlign: 'left',
                          border: `1px solid ${isSelected ? '#111827' : '#e5e7eb'}`,
                          background: '#fff',
                          transition: 'all 0.15s',
                          position: 'relative', overflow: 'hidden',
                          boxShadow: isSelected ? 'none' : '0 1px 2px rgba(0,0,0,0.04)',
                        }}
                        onMouseEnter={e => { if (!isSelected) { (e.currentTarget as HTMLElement).style.borderColor = '#d1d5db'; (e.currentTarget as HTMLElement).style.background = '#f9fafb'; } }}
                        onMouseLeave={e => { if (!isSelected) { (e.currentTarget as HTMLElement).style.borderColor = '#e5e7eb'; (e.currentTarget as HTMLElement).style.background = '#fff'; } }}
                      >
                        <div style={{
                          width: '40px', height: '40px', borderRadius: '10px',
                          border: `1px solid ${isSelected ? '#111827' : '#e5e7eb'}`,
                          background: isSelected ? '#f9fafb' : '#fff',
                          display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                        }}>
                          <EtIcon size={20} style={{ color: isSelected ? '#111827' : '#6b7280' }} strokeWidth={1.75} />
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: '15px', fontWeight: 700, color: '#0f0f23', marginBottom: '4px' }}>
                            {et.label}
                          </div>
                          <div style={{ fontSize: '12px', color: '#6b7280', lineHeight: 1.5 }}>
                            {et.desc}
                          </div>
                        </div>
                        {isSelected && (
                          <div style={{ position: 'absolute', top: '12px', right: '12px', width: '20px', height: '20px', borderRadius: '50%', background: '#111827', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <Check size={11} style={{ color: '#fff' }} strokeWidth={2.5} />
                          </div>
                        )}
                      </button>
                    );
                  })}
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                  <button
                    onClick={() => setStep(2)}
                    disabled={!examType}
                    style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '10px 24px', borderRadius: '9px', border: 'none', background: examType ? '#3b5bdb' : '#e8eaed', color: examType ? '#fff' : '#9ca3af', fontSize: '14px', fontWeight: 600, cursor: examType ? 'pointer' : 'not-allowed' }}
                  >
                    Next <ChevronRight size={15} />
                  </button>
                </div>
              </div>
            )}

            {/* ══ STEP 2: Basic Info ══ */}
            {step === 2 && (
              <div>
                <div style={{ marginBottom: '24px' }}>
                  <h2 style={{ fontSize: '20px', fontWeight: 700, color: '#0f0f23', margin: '0 0 6px' }}>Basic Information</h2>
                  <p style={{ fontSize: '13px', color: '#6b7280', margin: 0 }}>
                    Set the grade, subject, and exam parameters.
                  </p>
                </div>

                <div style={{ background: '#fff', border: '1px solid #e8eaed', borderRadius: '14px', padding: '22px 24px', marginBottom: '16px' }}>
                  <div style={{ fontSize: '13px', fontWeight: 600, color: '#374151', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <BookOpen size={14} style={{ color: '#3b5bdb' }} /> Scope
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px', marginBottom: '14px' }}>
                    <SimpleSelect label="Grade" options={gradeOptions} value={grade} onChange={setGrade} placeholder="Select grade" required />
                    <SimpleSelect label="Subject" options={subjectOptions} value={subject} onChange={setSubject} placeholder="Select subject" required />
                  </div>
                  <div style={{ display: 'flex', gap: '10px', alignItems: 'center', marginBottom: '14px' }}>
                    <span style={{ fontSize: '13px', fontWeight: 500, color: '#374151' }}>Semester</span>
                    {(['Vol.1', 'Vol.2'] as const).map(s => (
                      <button key={s} onClick={() => setSemester(s)}
                        style={{ padding: '5px 16px', borderRadius: '7px', border: `1.5px solid ${semester === s ? '#3b5bdb' : '#e8eaed'}`, background: semester === s ? '#eff6ff' : '#fff', color: semester === s ? '#3b5bdb' : '#6b7280', fontSize: '12px', fontWeight: semester === s ? 600 : 400, cursor: 'pointer', transition: 'all 0.12s' }}>
                        {s}
                      </button>
                    ))}
                  </div>
                  <SimpleSelect label="Textbook Publisher" options={publisherOptions} value={publisher} onChange={setPublisher} placeholder="Select publisher (optional)" />
                  {publisherSourceNote && (
                    <div style={{ marginTop: '6px', fontSize: '11px', color: '#9ca3af' }}>
                      {publisherSourceNote}
                    </div>
                  )}
                </div>

                <div style={{ background: '#fff', border: '1px solid #e8eaed', borderRadius: '14px', padding: '22px 24px', marginBottom: '16px' }}>
                  <div style={{ fontSize: '13px', fontWeight: 600, color: '#374151', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <FileText size={14} style={{ color: '#3b5bdb' }} /> Paper Details
                  </div>
                  <div style={{ marginBottom: '14px' }}>
                    <div style={{ fontSize: '13px', fontWeight: 500, color: '#374151', marginBottom: '6px' }}>
                      Exam Title <span style={{ color: '#ef4444' }}>*</span>
                    </div>
                    <input
                      value={title}
                      onChange={e => setTitle(e.target.value)}
                      placeholder={grade && subject ? `${grade} ${subject} ${examTypeCfg?.label ?? 'Exam'} — Spring 2026` : 'Enter exam title…'}
                      style={{ width: '100%', boxSizing: 'border-box', padding: '9px 13px', border: '1.5px solid #e8eaed', borderRadius: '9px', fontSize: '13px', color: '#374151', outline: 'none', fontFamily: 'inherit' }}
                      onFocus={e => { e.currentTarget.style.borderColor = '#3b5bdb'; }}
                      onBlur={e =>  { e.currentTarget.style.borderColor = '#e8eaed'; }}
                    />
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
                    <div>
                      <div style={{ fontSize: '13px', fontWeight: 500, color: '#374151', marginBottom: '6px', display: 'flex', alignItems: 'center', gap: '5px' }}>
                        <Award size={12} style={{ color: '#9ca3af' }} /> Total Score <span style={{ color: '#ef4444' }}>*</span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <input
                          type="number" value={totalScore} onChange={e => setTotalScore(Number(e.target.value))}
                          style={{ width: '80px', padding: '9px 12px', border: '1.5px solid #e8eaed', borderRadius: '9px', fontSize: '13px', color: '#374151', outline: 'none', textAlign: 'center', fontFamily: 'inherit' }}
                          onFocus={e => { e.currentTarget.style.borderColor = '#3b5bdb'; }}
                          onBlur={e =>  { e.currentTarget.style.borderColor = '#e8eaed'; }}
                        />
                        <span style={{ fontSize: '13px', color: '#6b7280' }}>points</span>
                      </div>
                    </div>
                    <div>
                      <div style={{ fontSize: '13px', fontWeight: 500, color: '#374151', marginBottom: '6px', display: 'flex', alignItems: 'center', gap: '5px' }}>
                        <Clock size={12} style={{ color: '#9ca3af' }} /> Duration <span style={{ color: '#ef4444' }}>*</span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <input
                          type="number" value={duration} onChange={e => setDuration(Number(e.target.value))}
                          style={{ width: '80px', padding: '9px 12px', border: '1.5px solid #e8eaed', borderRadius: '9px', fontSize: '13px', color: '#374151', outline: 'none', textAlign: 'center', fontFamily: 'inherit' }}
                          onFocus={e => { e.currentTarget.style.borderColor = '#3b5bdb'; }}
                          onBlur={e =>  { e.currentTarget.style.borderColor = '#e8eaed'; }}
                        />
                        <span style={{ fontSize: '13px', color: '#6b7280' }}>minutes</span>
                      </div>
                    </div>
                  </div>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <button onClick={() => setStep(1)}
                    style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '10px 22px', borderRadius: '9px', border: '1px solid #e8eaed', background: '#fff', color: '#374151', fontSize: '14px', cursor: 'pointer' }}>
                    <ChevronLeft size={15} /> Back
                  </button>
                  <button
                    onClick={() => setStep(3)}
                    disabled={!grade || !subject || !title}
                    style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '10px 24px', borderRadius: '9px', border: 'none', background: (grade && subject && title) ? '#3b5bdb' : '#e8eaed', color: (grade && subject && title) ? '#fff' : '#9ca3af', fontSize: '14px', fontWeight: 600, cursor: (grade && subject && title) ? 'pointer' : 'not-allowed' }}>
                    Next <ChevronRight size={15} />
                  </button>
                </div>
              </div>
            )}

            {/* ══ STEP 3: Content & Structure ══ */}
            {step === 3 && (
              <div>
                <div style={{ marginBottom: '24px' }}>
                  <h2 style={{ fontSize: '20px', fontWeight: 700, color: '#0f0f23', margin: '0 0 6px' }}>Content & Structure</h2>
                  <p style={{ fontSize: '13px', color: '#6b7280', margin: 0 }}>
                    Choose the chapters covered and define the section structure.
                  </p>
                </div>

                {/* Chapter selection */}
                <div style={{ background: '#fff', border: '1px solid #e8eaed', borderRadius: '14px', padding: '22px 24px', marginBottom: '16px' }}>
                  <div style={{ fontSize: '13px', fontWeight: 600, color: '#374151', marginBottom: '4px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <Layers size={14} style={{ color: '#3b5bdb' }} /> Chapter Coverage
                  </div>
                  <div style={{ fontSize: '12px', color: '#9ca3af', marginBottom: '14px' }}>
                    {selectedChapters.length === 0 ? 'All chapters will be included if none selected' : `${selectedChapters.length} chapter(s) selected`}
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                    {chapters.map(ch => {
                      const sel = selectedChapters.includes(ch);
                      return (
                        <button key={ch} onClick={() => toggleChapter(ch)}
                          type="button"
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: '5px',
                            padding: '6px 14px', borderRadius: '20px', cursor: 'pointer', fontSize: '12px',
                            border: `1.5px solid ${sel ? '#3b5bdb' : '#e8eaed'}`,
                            background: sel ? '#eff6ff' : '#fff',
                            color: sel ? '#3b5bdb' : '#374151',
                            fontWeight: sel ? 600 : 400, transition: 'all 0.12s',
                          }}>
                          {sel && <Check size={12} strokeWidth={2.5} style={{ flexShrink: 0 }} aria-hidden />}
                          <span style={{ lineHeight: 1.25 }}>{ch}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Difficulty */}
                <div style={{ background: '#fff', border: '1px solid #e8eaed', borderRadius: '14px', padding: '22px 24px', marginBottom: '16px' }}>
                  <div style={{ fontSize: '13px', fontWeight: 600, color: '#374151', marginBottom: '14px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <Target size={14} style={{ color: '#3b5bdb' }} /> Overall Difficulty
                  </div>
                  <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                    {([
                      { id: 'easy' as const,   label: 'Easy',   dot: '#22c55e', bg: '#f0fdf4', color: '#166534', border: '#d1d5db' },
                      { id: 'medium' as const, label: 'Medium', dot: '#f59e0b', bg: '#fffbeb', color: '#92400e', border: '#d1d5db' },
                      { id: 'hard' as const,   label: 'Hard',   dot: '#ef4444', bg: '#fef2f2', color: '#991b1b', border: '#d1d5db' },
                      { id: 'mixed' as const,  label: 'Mixed',  dot: '#8b5cf6', bg: '#f5f3ff', color: '#5b21b6', border: '#d1d5db' },
                    ]).map(d => (
                      <button key={d.id} onClick={() => setDifficulty(d.id as Difficulty)}
                        style={{
                          flex: '1 1 calc(25% - 8px)', minWidth: '120px', padding: '10px 10px', borderRadius: '8px', cursor: 'pointer',
                          border: `1px solid ${difficulty === d.id ? '#111827' : d.border}`,
                          background: difficulty === d.id ? d.bg : '#fff',
                          color: difficulty === d.id ? d.color : '#6b7280',
                          fontSize: '12px', fontWeight: difficulty === d.id ? 600 : 500,
                          transition: 'all 0.12s', display: 'flex', flexDirection: 'row',
                          alignItems: 'center', justifyContent: 'center', gap: '8px',
                        }}>
                        <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: d.dot, flexShrink: 0 }} />
                        {d.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Section structure */}
                <div style={{ background: '#fff', border: '1px solid #e8eaed', borderRadius: '14px', padding: '22px 24px', marginBottom: '28px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
                    <div style={{ fontSize: '13px', fontWeight: 600, color: '#374151', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <FileText size={14} style={{ color: '#3b5bdb' }} /> Section Structure
                    </div>
                    <div style={{ fontSize: '12px', color: '#6b7280' }}>
                      Total: <span style={{ color: calcTotal() === totalScore ? '#16a34a' : '#ef4444', fontWeight: 600 }}>{calcTotal()}</span>
                      <span style={{ color: '#9ca3af' }}> / {totalScore} pts</span>
                    </div>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 100px 100px 80px', gap: '8px', padding: '6px 8px', marginBottom: '4px' }}>
                    {['Section', 'Questions', 'Pts / Q', 'Subtotal'].map(h => (
                      <div key={h} style={{ fontSize: '11px', fontWeight: 600, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{h}</div>
                    ))}
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    {sections.map(sec => (
                      <div key={sec.key} style={{ display: 'grid', gridTemplateColumns: '1fr 100px 100px 80px', gap: '8px', alignItems: 'center', padding: '10px 8px', borderRadius: '8px', background: '#f9fafb', border: '1px solid #f0f2f5' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <GripVertical size={12} style={{ color: '#d1d5db' }} />
                          <span style={{ fontSize: '12px', color: '#374151' }}>{sec.type}</span>
                        </div>
                        <CountStepper value={sec.count} onChange={v => setSectionCount(sec.key, v)} max={30} />
                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                          <input
                            type="number" value={sec.scoreEach}
                            onChange={e => setSectionScore(sec.key, Math.max(1, Number(e.target.value)))}
                            style={{ width: '52px', padding: '4px 8px', border: '1px solid #e8eaed', borderRadius: '6px', fontSize: '12px', textAlign: 'center', fontFamily: 'inherit', outline: 'none' }}
                            onFocus={e => { e.currentTarget.style.borderColor = '#3b5bdb'; }}
                            onBlur={e  => { e.currentTarget.style.borderColor = '#e8eaed'; }}
                          />
                          <span style={{ fontSize: '11px', color: '#9ca3af' }}>pts</span>
                        </div>
                        <div style={{ fontSize: '13px', fontWeight: 600, color: '#0f0f23' }}>
                          {sec.count * sec.scoreEach} pts
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <button onClick={() => setStep(2)}
                    style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '10px 22px', borderRadius: '9px', border: '1px solid #e8eaed', background: '#fff', color: '#374151', fontSize: '14px', cursor: 'pointer' }}>
                    <ChevronLeft size={15} /> Back
                  </button>
                  <button onClick={() => { setStep(4); handleGenerate(); }}
                    style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '10px 24px', borderRadius: '9px', border: 'none', background: '#3b5bdb', color: '#fff', fontSize: '14px', fontWeight: 600, cursor: 'pointer' }}>
                    <Sparkles size={15} /> Generate Paper
                  </button>
                </div>
              </div>
            )}

            {/* ══ STEP 4: Generate & Preview ══ */}
            {step === 4 && (
              <div>

                {/* Generating state */}
                {generating && (
                  <div style={{ textAlign: 'center', padding: '80px 40px' }}>
                    <div style={{ width: '64px', height: '64px', borderRadius: '20px', background: '#eff6ff', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px' }}>
                      <Sparkles size={30} style={{ color: '#3b5bdb' }} />
                    </div>
                    <div style={{ fontSize: '18px', fontWeight: 700, color: '#0f0f23', marginBottom: '6px' }}>
                      Generating Your Exam Paper…
                    </div>
                    <div style={{ fontSize: '13px', color: '#6b7280', marginBottom: '32px' }}>
                      AI is structuring questions based on your configuration
                    </div>
                    <div style={{ width: '360px', margin: '0 auto', background: '#e8eaed', borderRadius: '999px', height: '8px', overflow: 'hidden' }}>
                      <div style={{ width: `${genProgress}%`, height: '100%', background: 'linear-gradient(90deg, #3b5bdb, #7c3aed)', borderRadius: '999px', transition: 'width 0.35s ease' }} />
                    </div>
                    <div style={{ marginTop: '10px', fontSize: '13px', color: '#9ca3af' }}>{genProgress}%</div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginTop: '28px', maxWidth: '320px', margin: '28px auto 0' }}>
                      {[
                        { threshold: 20,  label: 'Analysing exam configuration' },
                        { threshold: 45,  label: 'Selecting questions from pool' },
                        { threshold: 70,  label: 'Balancing difficulty distribution' },
                        { threshold: 90,  label: 'Formatting paper structure' },
                        { threshold: 100, label: 'Finalising & proofreading' },
                      ].map(item => (
                        <div key={item.label} style={{ display: 'flex', alignItems: 'center', gap: '8px', opacity: genProgress >= item.threshold ? 1 : 0.35, transition: 'opacity 0.3s' }}>
                          {genProgress >= item.threshold
                            ? <Check size={13} style={{ color: '#3b5bdb', flexShrink: 0 }} />
                            : <Loader2 size={13} style={{ color: '#3b5bdb', flexShrink: 0, animation: genProgress >= item.threshold - 20 ? 'spin 1s linear infinite' : 'none' }} />
                          }
                          <span style={{ fontSize: '12px', color: genProgress >= item.threshold ? '#374151' : '#9ca3af' }}>{item.label}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Done — paper preview */}
                {genDone && (
                  <div>
                    {errorMsg && (
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'flex-start',
                          gap: '10px',
                          padding: '12px 14px',
                          borderRadius: '10px',
                          background: '#fffbeb',
                          border: '1px solid #fde68a',
                          color: '#92400e',
                          fontSize: '12px',
                          marginBottom: '14px',
                        }}
                      >
                        <AlertCircle size={14} style={{ flexShrink: 0, marginTop: '1px' }} />
                        <div style={{ lineHeight: 1.6 }}>
                          {errorMsg}
                        </div>
                      </div>
                    )}
                    {/* Toolbar */}
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '24px' }}>
                      <div>
                        <h2 style={{ fontSize: '20px', fontWeight: 700, color: '#0f0f23', margin: '0 0 4px' }}>Preview Generated Paper</h2>
                        <p style={{ fontSize: '13px', color: '#6b7280', margin: 0 }}>{paper.reduce((n, s) => n + s.questions.length, 0)} questions · {calcTotal()} points · {duration} min</p>
                      </div>
                      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                        <button
                          onClick={() => { setStep(3); setGenDone(false); setPaper([]); setDraftSaved(false); }}
                          style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 14px', borderRadius: '8px', border: '1px solid #e8eaed', background: '#fff', color: '#374151', fontSize: '12px', cursor: 'pointer' }}>
                          <RotateCcw size={12} /> Regenerate
                        </button>
                        <button style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 14px', borderRadius: '8px', border: '1px solid #e8eaed', background: '#fff', color: '#374151', fontSize: '12px', cursor: 'pointer' }}>
                          <Printer size={12} /> Print
                        </button>
                        <button style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 14px', borderRadius: '8px', border: '1px solid #e8eaed', background: '#fff', color: '#374151', fontSize: '12px', cursor: 'pointer' }}>
                          <Download size={12} /> Export
                        </button>
                        {/* Save to Drafts */}
                        <button
                          onClick={handleSaveDraft}
                          disabled={draftSaved}
                          style={{
                            display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 14px', borderRadius: '8px',
                            border: `1px solid ${draftSaved ? '#86efac' : '#fde68a'}`,
                            background: draftSaved ? '#f0fdf4' : '#fffbeb',
                            color: draftSaved ? '#16a34a' : '#b45309',
                            fontSize: '12px', fontWeight: 600, cursor: draftSaved ? 'default' : 'pointer',
                            transition: 'all 0.2s',
                          }}>
                          {draftSaved ? <Check size={12} /> : <FilePen size={12} />}
                          {draftSaved ? 'Saved to Drafts' : 'Save to Drafts'}
                        </button>
                        <button style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 16px', borderRadius: '8px', border: 'none', background: '#3b5bdb', color: '#fff', fontSize: '12px', fontWeight: 600, cursor: 'pointer' }}>
                          <Save size={12} /> Save to Library
                        </button>
                      </div>
                    </div>

                    {/* Draft saved banner */}
                    {draftSaved && (
                      <div style={{
                        display: 'flex', alignItems: 'center', gap: '10px',
                        padding: '12px 16px', borderRadius: '10px', marginBottom: '16px',
                        background: '#f0fdf4', border: '1px solid #bbf7d0',
                      }}>
                        <Check size={15} style={{ color: '#16a34a', flexShrink: 0 }} />
                        <span style={{ fontSize: '13px', color: '#15803d' }}>
                          Paper saved to Drafts. You can review and publish it from the{' '}
                          <button
                            onClick={() => setPageView('drafts')}
                            style={{ color: '#15803d', fontWeight: 700, textDecoration: 'underline', background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontSize: '13px' }}>
                            Drafts tab
                          </button>.
                        </span>
                      </div>
                    )}

                    {/* Paper document */}
                    <div style={{ background: '#fff', border: '1px solid #e8eaed', borderRadius: '16px', overflow: 'hidden', boxShadow: '0 4px 24px rgba(0,0,0,0.06)' }}>
                      {/* Paper header */}
                      <div style={{ padding: '28px 32px', borderBottom: '2px solid #0f0f23', textAlign: 'center', background: '#fafafa' }}>
                        {examTypeCfg && (
                          <div style={{ fontSize: '11px', color: '#9ca3af', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.08em' }}>{examTypeCfg.label}</div>
                        )}
                        <div style={{ fontSize: '22px', fontWeight: 700, color: '#0f0f23', marginBottom: '8px' }}>
                          {title || `${grade} ${subject} Examination`}
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '24px', fontSize: '12px', color: '#6b7280' }}>
                          <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                            <Award size={12} style={{ color: '#3b5bdb' }} /> Total: {totalScore} points
                          </span>
                          <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                            <Clock size={12} style={{ color: '#3b5bdb' }} /> Duration: {duration} minutes
                          </span>
                          <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                            <BookOpen size={12} style={{ color: '#3b5bdb' }} /> {grade} · {subject}
                          </span>
                        </div>
                        <div style={{ marginTop: '14px', display: 'flex', gap: '20px', justifyContent: 'center', fontSize: '12px', color: '#374151' }}>
                          <span>Name: __________________________</span>
                          <span>Class: __________________________</span>
                          <span>Score: __________</span>
                        </div>
                      </div>

                      {/* Sections */}
                      <div style={{ padding: '24px 32px', display: 'flex', flexDirection: 'column', gap: '28px' }}>
                        {paper.map((sec, si) => (
                          <div key={si}>
                            <div style={{ display: 'flex', alignItems: 'baseline', gap: '10px', marginBottom: '6px' }}>
                              <div style={{ fontSize: '15px', fontWeight: 700, color: '#0f0f23' }}>{sec.title}</div>
                            </div>
                            <div style={{ fontSize: '12px', color: '#6b7280', marginBottom: '14px', paddingLeft: '2px' }}>{sec.description}</div>
                            <div style={{ height: '1px', background: '#e8eaed', marginBottom: '16px' }} />

                            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                              {sec.questions.map((q, qi) => {
                                const dc = DIFF_CFG[q.difficulty];
                                return (
                                  <div key={q.id} style={{ display: 'flex', gap: '12px' }}>
                                    <div style={{ width: '24px', height: '24px', borderRadius: '50%', background: '#f3f4f6', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '11px', fontWeight: 700, color: '#374151', marginTop: '1px' }}>
                                      {qi + 1}
                                    </div>
                                    <div style={{ flex: 1 }}>
                                      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '8px', marginBottom: '8px' }}>
                                        <p style={{ margin: 0, fontSize: '14px', color: '#1f2937', lineHeight: 1.7 }}>{q.prompt}</p>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}>
                                          <span style={{ fontSize: '10px', fontWeight: 600, padding: '2px 8px', borderRadius: '20px', background: dc.bg, color: dc.color }}>{q.difficulty}</span>
                                          <span style={{ fontSize: '10px', color: '#9ca3af' }}>{q.score} pts</span>
                                        </div>
                                      </div>
                                      {q.options && (
                                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px' }}>
                                          {q.options.map(opt => (
                                            <div key={opt.key} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '7px 10px', borderRadius: '7px', background: opt.correct ? '#f0fdf4' : '#f9fafb', border: `1px solid ${opt.correct ? '#bbf7d0' : '#e8eaed'}` }}>
                                              <span style={{ width: '18px', height: '18px', borderRadius: '50%', background: opt.correct ? '#16a34a' : '#e8eaed', color: opt.correct ? '#fff' : '#6b7280', fontSize: '10px', fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                                                {opt.key}
                                              </span>
                                              <span style={{ fontSize: '12px', color: opt.correct ? '#15803d' : '#374151', fontWeight: opt.correct ? 500 : 400 }}>{opt.text}</span>
                                            </div>
                                          ))}
                                        </div>
                                      )}
                                      {!q.options && q.answer && (
                                        <div style={{ padding: '7px 12px', borderRadius: '7px', background: '#f0fdf4', border: '1px solid #bbf7d0', fontSize: '12px', color: '#15803d' }}>
                                          <span style={{ fontWeight: 600 }}>Answer: </span>{q.answer}
                                        </div>
                                      )}
                                      {!q.options && !q.answer && (
                                        <div style={{ height: '48px', borderBottom: '1px dashed #e8eaed', marginTop: '4px' }} />
                                      )}
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div style={{ marginTop: '24px', display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                      <button onClick={() => { setStep(1); setGenDone(false); setPaper([]); setDraftSaved(false); setExamType(null); setGrade(''); setSubject(''); setTitle(''); }}
                        style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '10px 20px', borderRadius: '9px', border: '1px solid #e8eaed', background: '#fff', color: '#374151', fontSize: '13px', cursor: 'pointer' }}>
                        Start Over
                      </button>
                      <button style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '10px 22px', borderRadius: '9px', border: 'none', background: '#3b5bdb', color: '#fff', fontSize: '13px', fontWeight: 600, cursor: 'pointer' }}>
                        <Send size={14} /> Publish Now
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </>
        )}
        </div>
      </div>

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}
