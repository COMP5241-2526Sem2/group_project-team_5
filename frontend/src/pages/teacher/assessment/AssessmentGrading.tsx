import React, { useState, useRef, useEffect, useMemo } from 'react';
import { useQuery, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import { toast } from 'sonner@2.0.3';
import {
  fetchPaperListApi,
  fetchPaperDetailApi,
  type PaperDetailDto,
  type PaperListItemDto,
} from '../../../utils/paperApi';
import {
  fetchTaskListApi,
  fetchTaskDetailApi,
  createTaskApi,
  updateTaskApi,
  deleteTaskApi,
  publishTaskApi,
  unpublishTaskApi,
  type TaskListItemDto,
  type TaskDetailDto,
  type TaskCreateRequestDto,
  type TaskItemPayloadDto,
  type TaskSourceKind,
} from '../../../utils/taskApi';
import { listQuestionBankSetsApi, type QuestionBankSetDto } from '../../../utils/questionBankApi';
import { teacherKeys } from '../../../query/teacherKeys';
import { TEACHER_STALE_MS } from '../../../query/queryClient';
import {
  Search, Plus, X, Check, ChevronDown, ChevronLeft, ChevronRight,
  FileText, Clock, Award, AlertCircle, CheckCircle2,
  Send, Edit3, Trash2, Save, Users, Calendar,
  MessageSquare, Zap, Layers, Star, BookOpen,
  Eye, ArrowLeftRight, RotateCcw, Pencil, Loader2,
} from 'lucide-react';

/* ═══════════════════════════════════════════════════════════════════════════
   TYPES
═══════════════════════════════════════════════════════════════════════════ */
type StudioTab   = 'assemble' | 'publish';
type AssembleMode = 'bank' | 'papers';
type QType       = 'MCQ' | 'True/False' | 'Fill-blank' | 'Short Answer' | 'Essay';
type Diff        = 'easy' | 'medium' | 'hard';
type PaperKind   = 'exam' | 'quiz' | 'homework';
type PaperStatus = 'draft' | 'published' | 'closed';
type AssignKind  = 'exam' | 'quiz' | 'homework';
type SubStatus   = 'pending_sa' | 'ai_graded' | 'fully_graded';

interface LibQ {
  id: string; type: QType; diff: Diff;
  subject: string; grade: string; chapter: string;
  prompt: string; options?: string[]; answer?: string;
  imageUrl?: string;
  source?: string;
}
interface SectionQ {
  uid: string; libId: string; prompt: string;
  type: QType; diff: Diff; pts: number;
  options?: string[]; answer?: string; imageUrl?: string;
  importId?: string;
  sourcePaperId?: string;
  sourcePaperTitle?: string;
}
interface Section {
  id: string;
  label: string;
  type: QType;
  ptsEach: number;
  qs: SectionQ[];
  /** One import batch from Exam Papers; sections sharing this id clear together. */
  importId?: string;
  sourcePaperId?: string;
  sourcePaperTitle?: string;
}
interface Paper {
  id: string; title: string; kind: PaperKind;
  grade: string; subject: string; status: PaperStatus;
  duration: number; totalPts: number; qCount: number;
  sections: Section[]; createdAt: string;
  publishCfg?: PublishCfg; note?: string;
}
interface PublishCfg {
  assignKind: AssignKind; classes: string[];
  startDate: string; endDate: string;
  timeLimit: number; showResults: boolean; allowLate: boolean;
}
interface QResp {
  qId: string; prompt: string; type: QType; maxPts: number;
  studentAns: string; isCorrect?: boolean;
  aiPts?: number; aiNote?: string;
  teacherPts?: number; teacherNote?: string;
}
interface StudentSub {
  id: string; name: string; studentId: string; avatar: string;
  paperId: string; submittedAt: string; status: SubStatus;
  aiTotal: number; teacherTotal: number | null; maxPts: number;
  responses: QResp[];
}
interface ExamPaperEntry {
  id: string; title: string; grade: string; subject: string;
  totalScore: number; durationMin: number; questions: LibQ[];
}

function detailTypeToQType(t: string): QType {
  const raw = (t || '').trim().toUpperCase().replace(/[\s/-]/g, '_');
  if (raw === 'MCQ_SINGLE' || raw === 'MCQ_MULTI') return 'MCQ';
  if (raw === 'TRUE_FALSE') return 'True/False';
  if (raw === 'FILL_BLANK') return 'Fill-blank';
  if (raw === 'SHORT_ANSWER') return 'Short Answer';
  if (raw === 'ESSAY') return 'Essay';
  return 'Short Answer';
}

function normDiffFromApi(d: string | null | undefined): Diff {
  const v = (d || 'medium').toLowerCase();
  if (v === 'easy' || v === 'medium' || v === 'hard') return v;
  return 'medium';
}

function mapDetailToExamPaperEntry(detail: PaperDetailDto): ExamPaperEntry {
  const questions: LibQ[] = [];
  const sections = [...detail.sections].sort((a, b) => a.order - b.order);
  for (const sec of sections) {
    const qs = [...sec.questions].sort((a, b) => a.order - b.order);
    for (const q of qs) {
      const qt = detailTypeToQType(q.type);
      const options =
        q.options && q.options.length > 0 ? q.options.map((o) => `${o.key}. ${o.text}`) : undefined;
      questions.push({
        id: `pq_${detail.paper_id}_${q.paper_question_id}`,
        type: qt,
        diff: normDiffFromApi(q.difficulty),
        subject: detail.subject,
        grade: detail.grade,
        chapter: sec.title,
        prompt: q.prompt,
        options,
        answer: q.answer ?? undefined,
        source: String(detail.paper_id),
      });
    }
  }
  return {
    id: String(detail.paper_id),
    title: detail.title,
    grade: detail.grade,
    subject: detail.subject,
    totalScore: detail.total_score,
    durationMin: detail.duration_min,
    questions,
  };
}

function flattenQuestionBankSetsToLibQ(sets: QuestionBankSetDto[]): LibQ[] {
  const out: LibQ[] = [];
  for (const s of sets) {
    for (const q of s.questions) {
      out.push({
        id: q.id,
        type: q.type as QType,
        diff: normDiffFromApi(q.difficulty),
        subject: s.subject,
        grade: s.grade,
        chapter: s.chapter,
        prompt: q.prompt,
        imageUrl: q.image_url ?? undefined,
        options: q.options && q.options.length > 0 ? q.options : undefined,
        answer: q.answer ?? undefined,
        source: s.source,
      });
    }
  }
  return out;
}

/* ═══════════════════════════════════════════════════════════════════════════
   CONSTANTS
═══════════════════════════════════════════════════════════════════════════ */
const TYPE_C: Record<QType, { emoji: string; color: string; bg: string; short: string }> = {
  'MCQ':          { emoji: '📋', color: '#1d4ed8', bg: '#dbeafe', short: 'MCQ'   },
  'True/False':   { emoji: '✅', color: '#7c3aed', bg: '#ede9fe', short: 'T/F'   },
  'Fill-blank':   { emoji: '✏️', color: '#b45309', bg: '#fef3c7', short: 'Fill'  },
  'Short Answer': { emoji: '📝', color: '#15803d', bg: '#dcfce7', short: 'SA'    },
  'Essay':        { emoji: '✍️', color: '#be185d', bg: '#fce7f3', short: 'Essay' },
};
const DIFF_C: Record<Diff, { bg: string; color: string; label: string }> = {
  easy:   { bg: '#dcfce7', color: '#15803d', label: 'Easy'   },
  medium: { bg: '#fef9c3', color: '#a16207', label: 'Medium' },
  hard:   { bg: '#fee2e2', color: '#b91c1c', label: 'Hard'   },
};
const STATUS_C: Record<PaperStatus, { label: string; bg: string; color: string; dot: string }> = {
  draft:     { label: 'Draft',     bg: '#fef9c3', color: '#a16207', dot: '#f59e0b' },
  published: { label: 'Published', bg: '#dcfce7', color: '#15803d', dot: '#10b981' },
  closed:    { label: 'Closed',    bg: '#f3f4f6', color: '#6b7280', dot: '#9ca3af' },
};
const SUBJ_EMOJI: Record<string, string> = {
  Biology: '🔬', Physics: '⚡', Math: '📐', Chemistry: '⚗️', English: '📖', History: '🏛️',
};
const ALL_CLASSES = ['Grade 9-A','Grade 9-B','Grade 10-A','Grade 10-B','Grade 10-C','Grade 11-A','Grade 11-B'];
const GRADES   = ['Grade 7','Grade 8','Grade 9','Grade 10','Grade 11','Grade 12'];
const SUBJECTS = ['Biology','Physics','Chemistry','Math','English','History'];
const Q_TYPES: QType[] = ['MCQ','True/False','Fill-blank','Short Answer','Essay'];
const EXAM_PAPER_LIST_PAGE_SIZE = 8;
const QUESTION_BANK_PAGE_SIZE = 12;
const ROMAN = ['I','II','III','IV','V','VI','VII','VIII'];

function snapshotToQType(snap: Record<string, unknown>): QType | null {
  const u = snap.uiType;
  if (typeof u === 'string' && (Q_TYPES as readonly string[]).includes(u)) return u as QType;
  return null;
}

function taskKindStringToPaperKind(k: string): PaperKind {
  const x = (k || 'exam').toLowerCase();
  if (x.includes('homework')) return 'homework';
  if (x.includes('quiz')) return 'quiz';
  return 'exam';
}

function mapTaskListItemToPaper(item: TaskListItemDto): Paper {
  return {
    id: String(item.task_id),
    title: item.title,
    kind: taskKindStringToPaperKind(item.task_kind),
    grade: item.grade,
    subject: item.subject,
    status: item.status,
    duration: item.duration_min,
    totalPts: item.total_score,
    qCount: item.question_count,
    sections: [],
    createdAt: item.created_at,
  };
}

function taskDetailToCanvas(detail: TaskDetailDto): {
  sections: Section[];
  grade: string;
  subject: string;
  title: string;
  kind: PaperKind;
  dur: number;
  taskId: number;
} {
  const sorted = [...detail.items].sort((a, b) => a.order - b.order);
  const sectionOrder: string[] = [];
  const sectionByLabel = new Map<string, Section>();

  for (const it of sorted) {
    const label = (it.section_label || 'Section').trim() || 'Section';
    if (!sectionByLabel.has(label)) {
      const snap0 = it.snapshot || {};
      const qType = snapshotToQType(snap0) ?? detailTypeToQType(it.question_type);
      sectionByLabel.set(label, {
        id: nid(),
        label,
        type: qType,
        ptsEach: Math.max(1, Math.round(it.score)),
        qs: [],
      });
      sectionOrder.push(label);
    }
    const sec = sectionByLabel.get(label)!;
    const snap = it.snapshot || {};
    const qType = snapshotToQType(snap) ?? detailTypeToQType(it.question_type);
    let libId: string;
    if (it.source_kind === 'paper_snapshot' && it.ref_paper_id != null && it.ref_paper_question_id != null) {
      libId = `pq_${it.ref_paper_id}_${it.ref_paper_question_id}`;
    } else if (it.bank_question_id != null) {
      libId = String(it.bank_question_id);
    } else {
      libId = nid();
    }
    sec.qs.push({
      uid: nid(),
      libId,
      type: qType,
      diff: normDiffFromApi(typeof snap.difficulty === 'string' ? snap.difficulty : null),
      pts: Math.max(1, Math.round(it.score)),
      prompt: typeof snap.prompt === 'string' ? snap.prompt : '',
      imageUrl: typeof snap.image_url === 'string' ? snap.image_url : undefined,
      options: Array.isArray(snap.options) ? (snap.options as string[]) : undefined,
      answer: typeof snap.answer === 'string' ? snap.answer : undefined,
    });
  }

  return {
    sections: sectionOrder.map((l) => sectionByLabel.get(l)!),
    grade: detail.grade,
    subject: detail.subject,
    title: detail.title,
    kind: taskKindStringToPaperKind(detail.task_kind),
    dur: detail.duration_min,
    taskId: detail.task_id,
  };
}

function buildTaskPayload(
  sections: Section[],
  opts: { title: string; grade: string; subject: string; kind: PaperKind; dur: number },
): TaskCreateRequestDto {
  const items: TaskItemPayloadDto[] = [];
  let order = 0;
  for (const sec of sections) {
    for (const q of sec.qs) {
      order += 1;
      const snap: Record<string, unknown> = {
        prompt: q.prompt,
        difficulty: q.diff,
        uiType: q.type,
      };
      if (q.imageUrl) snap.image_url = q.imageUrl;
      if (q.options && q.options.length > 0) snap.options = q.options;
      if (q.answer) snap.answer = q.answer;

      let source_kind: TaskSourceKind = 'bank';
      let bank_question_id: number | null = null;
      let ref_paper_id: number | null = null;
      let ref_paper_question_id: number | null = null;
      if (q.libId.startsWith('pq_')) {
        source_kind = 'paper_snapshot';
        const m = q.libId.match(/^pq_(\d+)_(\d+)$/);
        if (m) {
          ref_paper_id = Number(m[1]);
          ref_paper_question_id = Number(m[2]);
        }
      } else if (/^\d+$/.test(q.libId)) {
        bank_question_id = Number(q.libId);
      }

      items.push({
        order,
        section_label: sec.label,
        question_type: q.type,
        score: q.pts,
        source_kind,
        bank_question_id,
        ref_paper_id,
        ref_paper_question_id,
        snapshot: snap,
      });
    }
  }
  const totalPts = sections.reduce((n, s) => n + s.qs.length * s.ptsEach, 0);
  const title =
    opts.title.trim() ||
    `${opts.grade} ${opts.subject} ${opts.kind === 'exam' ? 'Exam' : opts.kind === 'quiz' ? 'Quiz' : 'Homework'}`;
  return {
    title,
    grade: opts.grade,
    subject: opts.subject,
    semester: null,
    task_kind: opts.kind,
    duration_min: opts.dur,
    total_score: totalPts,
    course_id: null,
    items,
  };
}

/* ═══════════════════════════════════════════════════════════════════════════
   HELPERS
═══════════════════════════════════════════════════════════════════════════ */
function nid() { return Math.random().toString(36).slice(2,9); }
function fmtDate(iso: string) { return new Date(iso).toLocaleDateString('en-US',{ month:'short', day:'numeric', year:'numeric' }); }
function clamp(s: string, n: number) { return s.length > n ? s.slice(0,n)+'…' : s; }
function defaultPts(t: QType) { return t==='Essay' ? 15 : t==='Short Answer' ? 6 : t==='Fill-blank' ? 3 : 2; }

function sectionLabelAt(index: number, type: QType): string {
  return `Section ${ROMAN[index] ?? index + 1}: ${type}`;
}

function dedupQuestionKey(type: QType, prompt: string): string {
  return `${type}::${prompt.replace(/\s+/g, ' ').trim().toLowerCase()}`;
}

function normalizeCanvasSections(input: Section[]): Section[] {
  const merged = new Map<QType, Section>();

  for (const sec of input) {
    const existing = merged.get(sec.type);
    if (!existing) {
      merged.set(sec.type, {
        id: sec.id,
        label: sec.label,
        type: sec.type,
        ptsEach: Math.max(1, sec.ptsEach || defaultPts(sec.type)),
        qs: [],
      });
    }
    const target = merged.get(sec.type)!;
    for (const q of sec.qs) {
      target.qs.push({
        ...q,
        type: sec.type,
        pts: target.ptsEach,
      });
    }
  }

  const ordered: Section[] = [];
  for (const t of Q_TYPES) {
    const sec = merged.get(t);
    if (!sec) continue;
    const seen = new Set<string>();
    const qs: SectionQ[] = [];
    for (const q of sec.qs) {
      const key = dedupQuestionKey(q.type, q.prompt);
      if (seen.has(key)) continue;
      seen.add(key);
      qs.push({ ...q, uid: q.uid || nid(), type: t, pts: sec.ptsEach });
    }
    ordered.push({ ...sec, qs });
  }

  return ordered.map((sec, idx) => ({
    ...sec,
    label: sectionLabelAt(idx, sec.type),
  }));
}

/* ═══════════════════════════════════════════════════════════════════════════
   SHARED UI
═══════════════════════════════════════════════════════════════════════════ */
function DiffBadge({ d }: { d: Diff }) {
  const c = DIFF_C[d];
  return <span style={{ fontSize:'10px', fontWeight:700, padding:'2px 7px', borderRadius:'20px', background:c.bg, color:c.color, flexShrink:0 }}>{c.label}</span>;
}
function TypeBadge({ t }: { t: QType }) {
  const tc = TYPE_C[t];
  return <span style={{ fontSize:'10px', fontWeight:700, padding:'2px 8px', borderRadius:'20px', background:tc.bg, color:tc.color, flexShrink:0 }}>{tc.emoji} {tc.short}</span>;
}
function Pill({ label, active, onClick }: { label:string; active:boolean; onClick:()=>void }) {
  return (
    <button onClick={onClick} style={{ padding:'5px 13px', borderRadius:'6px', border:'none', cursor:'pointer', fontSize:'12px', background:active?'#fff':'transparent', color:active?'#0f0f23':'#6b7280', fontWeight:active?600:400, boxShadow:active?'0 1px 3px rgba(0,0,0,0.08)':'none', whiteSpace:'nowrap' }}>
      {label}
    </button>
  );
}
function MiniSelect({ label, value, onChange, options, disabled }: { label:string; value:string; onChange:(v:string)=>void; options:string[]; disabled?: boolean }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    function h(e: MouseEvent) { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); }
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);
  return (
    <div ref={ref} style={{ position:'relative', flexShrink:0, opacity:disabled?0.55:1, pointerEvents:disabled?'none':'auto' }}>
      <button type="button" disabled={disabled} onClick={()=>{ if(!disabled) setOpen(o=>!o); }} style={{ display:'flex', alignItems:'center', gap:'5px', padding:'6px 11px', borderRadius:'8px', border:`1.5px solid ${open?'#3b5bdb':'#e8eaed'}`, background:'#fff', cursor:disabled?'default':'pointer', fontSize:'12px', color:'#374151', fontWeight:500, whiteSpace:'nowrap' }}>
        <span style={{ color:'#9ca3af', fontSize:'11px' }}>{label}</span>
        <span style={{ color:'#0f0f23' }}>{value}</span>
        <ChevronDown size={11} style={{ color:'#9ca3af', transform:open?'rotate(180deg)':'none', transition:'transform 0.15s' }}/>
      </button>
      {open && (
        <div style={{ position:'absolute', top:'calc(100% + 4px)', left:0, zIndex:300, background:'#fff', border:'1.5px solid #e8eaed', borderRadius:'10px', boxShadow:'0 8px 24px rgba(0,0,0,0.10)', padding:'4px', minWidth:'130px' }}>
          {options.map(o=>(
            <button key={o} onClick={()=>{ onChange(o); setOpen(false); }}
              style={{ width:'100%', padding:'7px 10px', borderRadius:'7px', border:'none', cursor:'pointer', background:value===o?'#eff6ff':'transparent', color:value===o?'#3b5bdb':'#374151', fontSize:'12px', fontWeight:value===o?600:400, textAlign:'left', display:'flex', alignItems:'center', justifyContent:'space-between' }}
              onMouseEnter={e=>{ if(value!==o)(e.currentTarget as HTMLElement).style.background='#f9fafb'; }}
              onMouseLeave={e=>{ if(value!==o)(e.currentTarget as HTMLElement).style.background='transparent'; }}>
              {o} {value===o && <Check size={10} style={{ color:'#3b5bdb' }}/>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   TAB BAR
═══════════════════════════════════════════════════════════════════════════ */
function StudioTabBar({ tab, setTab, draftCount }: {
  tab:StudioTab; setTab:(t:StudioTab)=>void; draftCount:number;
}) {
  const tabs: { id:StudioTab; label:string; emoji:string; badge?:number }[] = [
    { id:'assemble', label:'Assemble', emoji:'🔨' },
    { id:'publish',  label:'Publish',  emoji:'📤', badge:draftCount  },
  ];
  return (
    <div style={{ display:'flex', alignItems:'stretch', borderBottom:'1px solid #e8eaed', background:'#fff', padding:'0 24px', flexShrink:0 }}>
      {tabs.map(t=>(
        <button key={t.id} onClick={()=>setTab(t.id)}
          style={{ display:'flex', alignItems:'center', gap:'7px', padding:'13px 18px', borderTop:'none', borderLeft:'none', borderRight:'none', borderBottom:`2.5px solid ${tab===t.id?'#3b5bdb':'transparent'}`, background:'transparent', color:tab===t.id?'#3b5bdb':'#6b7280', fontSize:'13px', fontWeight:tab===t.id?700:400, cursor:'pointer', transition:'color 0.15s', whiteSpace:'nowrap' }}>
          <span>{t.emoji}</span>
          {t.label}
          {t.badge != null && t.badge > 0 && (
            <span style={{ fontSize:'10px', fontWeight:700, padding:'1px 6px', borderRadius:'9px', background:tab===t.id?'#3b5bdb':'#e8eaed', color:tab===t.id?'#fff':'#6b7280' }}>{t.badge}</span>
          )}
        </button>
      ))}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   MODE 1 — QUESTION BANK BROWSER
═══════════════════════════════════════════════════════════════════════════ */
interface BrowserProps {
  grade: string;
  subject: string;
  addedIds: Set<string>;
  replaceMode: boolean;
  replaceTargetType: QType | null;
  onAdd: (q: LibQ) => void;
  onReplace: (q: LibQ) => void;
}
function QuestionBankBrowser({
  grade,
  subject,
  addedIds,
  replaceMode,
  replaceTargetType,
  onAdd,
  onReplace,
}: BrowserProps) {
  const [qSearch, setQSearch] = useState('');
  const [debouncedQ, setDebouncedQ] = useState('');
  const [typeFilters, setTypeFilters] = useState<QType[]>([]);
  const [typeDropOpen, setTypeDropOpen] = useState(false);
  const [bankListPage, setBankListPage] = useState(1);
  const typeRef = useRef<HTMLDivElement>(null);

  const qbParams = useMemo(
    () => ({
      grade,
      subject,
      ...(debouncedQ ? { q: debouncedQ } : {}),
    }),
    [grade, subject, debouncedQ],
  );
  const {
    data: qbRes,
    isPending: loading,
    isError: qbErrFlag,
    error: qbErr,
  } = useQuery({
    queryKey: teacherKeys.questionBankSets(qbParams),
    queryFn: () =>
      listQuestionBankSetsApi({
        grade,
        subject,
        q: debouncedQ || undefined,
      }),
    placeholderData: keepPreviousData,
  });
  const bankRows = useMemo(
    () => (qbRes ? flattenQuestionBankSetsToLibQ(qbRes.sets) : []),
    [qbRes],
  );
  const loadError = qbErrFlag
    ? (qbErr instanceof Error ? qbErr.message : 'Failed to load question bank')
    : null;

  useEffect(() => {
    const t = window.setTimeout(() => setDebouncedQ(qSearch.trim()), 300);
    return () => window.clearTimeout(t);
  }, [qSearch]);

  useEffect(() => {
    function h(e: MouseEvent) { if (typeRef.current && !typeRef.current.contains(e.target as Node)) setTypeDropOpen(false); }
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  useEffect(() => {
    if (replaceMode && replaceTargetType) setTypeFilters([replaceTargetType]);
    else if (!replaceMode) setTypeFilters([]);
  }, [replaceMode, replaceTargetType]);

  const filtered = useMemo(
    () => bankRows.filter(
      (q) => (typeFilters.length === 0 || typeFilters.includes(q.type)),
    ),
    [bankRows, typeFilters],
  );
  const filteredTotal = filtered.length;
  const bankTotalPages = Math.max(1, Math.ceil(filteredTotal / QUESTION_BANK_PAGE_SIZE));
  const pagedQuestions = useMemo(() => {
    const start = (bankListPage - 1) * QUESTION_BANK_PAGE_SIZE;
    return filtered.slice(start, start + QUESTION_BANK_PAGE_SIZE);
  }, [filtered, bankListPage]);
  const byType: Partial<Record<QType, LibQ[]>> = {};
  pagedQuestions.forEach((q) => { (byType[q.type] ??= []).push(q); });

  useEffect(() => {
    setBankListPage(1);
  }, [grade, subject, debouncedQ, typeFilters]);

  useEffect(() => {
    setBankListPage((p) => Math.min(p, bankTotalPages));
  }, [bankTotalPages]);

  function toggleType(t: QType) { setTypeFilters(prev=>prev.includes(t)?prev.filter(x=>x!==t):[...prev,t]); }
  const typeLabel = typeFilters.length===0 ? 'All Types'
    : typeFilters.length===1 ? `${TYPE_C[typeFilters[0]].emoji} ${typeFilters[0]}`
    : `${typeFilters.length} types selected`;

  return (
    <div style={{ flex:1, display:'flex', flexDirection:'column', overflow:'hidden' }}>
      {replaceMode && (
        <div style={{ padding:'7px 11px', background:'#fef3c7', borderBottom:'1px solid #fde68a', display:'flex', alignItems:'center', gap:'6px', flexShrink:0 }}>
          <ArrowLeftRight size={11} style={{ color:'#d97706', flexShrink:0 }}/>
          <span style={{ fontSize:'11px', color:'#92400e', fontWeight:600, flex:1 }}>Replace mode{replaceTargetType?` — ${replaceTargetType}`:''}</span>
          <span style={{ fontSize:'10px', color:'#b45309' }}>Click to swap</span>
        </div>
      )}
      <div style={{ padding:'10px 11px 0', flexShrink:0 }}>
        {/* Search */}
        <div style={{ position:'relative', marginBottom:'8px' }}>
          <Search size={11} style={{ position:'absolute', left:'9px', top:'50%', transform:'translateY(-50%)', color:'#9ca3af', pointerEvents:'none' }}/>
          <input value={qSearch} onChange={e=>setQSearch(e.target.value)} placeholder="Search questions…"
            style={{ width:'100%', boxSizing:'border-box', padding:'6px 8px 6px 25px', border:'1.5px solid #e8eaed', borderRadius:'7px', fontSize:'12px', outline:'none', color:'#374151' }}
            onFocus={e=>{e.currentTarget.style.borderColor='#3b5bdb';}} onBlur={e=>{e.currentTarget.style.borderColor='#e8eaed';}}/>
        </div>
        {/* Type multi-select dropdown */}
        <div style={{ marginBottom:'10px' }}>
          <div style={{ fontSize:'11px', fontWeight:600, color:'#374151', marginBottom:'5px' }}>Question Type</div>
          <div ref={typeRef} style={{ position:'relative' }}>
            <button onClick={()=>setTypeDropOpen(o=>!o)}
              style={{ width:'100%', display:'flex', alignItems:'center', gap:'6px', padding:'7px 11px', borderRadius:'8px', border:`1.5px solid ${typeDropOpen?'#3b5bdb':'#e8eaed'}`, background:'#fff', cursor:'pointer', textAlign:'left', boxSizing:'border-box' }}>
              <span style={{ flex:1, fontSize:'12px', color:typeFilters.length===0?'#9ca3af':'#0f0f23', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{typeLabel}</span>
              <div style={{ display:'flex', alignItems:'center', gap:'5px', flexShrink:0 }}>
                {typeFilters.length>0 && (
                  <span role="button" onClick={e=>{ e.stopPropagation(); setTypeFilters([]); }}
                    style={{ width:'15px', height:'15px', borderRadius:'50%', cursor:'pointer', background:'#d1d5db', color:'#fff', display:'flex', alignItems:'center', justifyContent:'center' }}>
                    <X size={8}/>
                  </span>
                )}
                <ChevronDown size={12} style={{ color:'#9ca3af', transform:typeDropOpen?'rotate(180deg)':'none', transition:'transform 0.15s' }}/>
              </div>
            </button>
            {typeDropOpen && (
              <div style={{ position:'absolute', top:'calc(100% + 4px)', left:0, right:0, zIndex:500, background:'#fff', border:'1.5px solid #e8eaed', borderRadius:'10px', boxShadow:'0 8px 24px rgba(0,0,0,0.12)', padding:'4px' }}>
                <button onClick={()=>setTypeFilters([])}
                  style={{ width:'100%', display:'flex', alignItems:'center', gap:'9px', padding:'7px 10px', borderRadius:'7px', border:'none', cursor:'pointer', background:typeFilters.length===0?'#eff6ff':'transparent', textAlign:'left', marginBottom:'2px' }}
                  onMouseEnter={e=>{ if(typeFilters.length!==0)(e.currentTarget as HTMLElement).style.background='#f9fafb'; }}
                  onMouseLeave={e=>{ if(typeFilters.length!==0)(e.currentTarget as HTMLElement).style.background='transparent'; }}>
                  <div style={{ width:'15px', height:'15px', borderRadius:'4px', border:`2px solid ${typeFilters.length===0?'#3b5bdb':'#d1d5db'}`, background:typeFilters.length===0?'#3b5bdb':'#fff', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
                    {typeFilters.length===0 && <Check size={9} style={{ color:'#fff' }}/>}
                  </div>
                  <span style={{ fontSize:'12px', fontWeight:typeFilters.length===0?600:400, color:typeFilters.length===0?'#1d4ed8':'#374151' }}>All Types</span>
                </button>
                <div style={{ height:'1px', background:'#f3f4f6', margin:'2px 6px 4px' }}/>
                {Q_TYPES.map(t=>{
                  const tc=TYPE_C[t]; const checked=typeFilters.includes(t);
                  return (
                    <button key={t} onClick={()=>toggleType(t)}
                      style={{ width:'100%', display:'flex', alignItems:'center', gap:'9px', padding:'7px 10px', borderRadius:'7px', border:'none', cursor:'pointer', background:checked?'#eff6ff':'transparent', textAlign:'left', marginBottom:'1px' }}
                      onMouseEnter={e=>{ if(!checked)(e.currentTarget as HTMLElement).style.background='#f9fafb'; }}
                      onMouseLeave={e=>{ if(!checked)(e.currentTarget as HTMLElement).style.background='transparent'; }}>
                      <div style={{ width:'15px', height:'15px', borderRadius:'4px', border:`2px solid ${checked?'#3b5bdb':'#d1d5db'}`, background:checked?'#3b5bdb':'#fff', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
                        {checked && <Check size={9} style={{ color:'#fff' }}/>}
                      </div>
                      <span style={{ fontSize:'13px', flexShrink:0 }}>{tc.emoji}</span>
                      <span style={{ flex:1, fontSize:'12px', fontWeight:checked?600:400, color:checked?'#1d4ed8':'#374151' }}>{t}</span>
                      <span style={{ fontSize:'10px', color:'#9ca3af', flexShrink:0 }}>{bankRows.filter(q=>q.type===t).length}</span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
      {/* Question list */}
      <div style={{ flex:1, overflowY:'auto', padding:'0 8px 8px' }}>
        {loadError && (
          <div style={{ padding:'12px 10px', marginBottom:'8px', borderRadius:'8px', background:'#fef2f2', color:'#b91c1c', fontSize:'11px', lineHeight:1.45 }}>
            {loadError}
          </div>
        )}
        {loading ? (
          <div style={{ textAlign:'center', padding:'36px 12px', color:'#9ca3af', display:'flex', flexDirection:'column', alignItems:'center', gap:8 }}>
            <Loader2 size={22} style={{ animation:'spin 0.8s linear infinite' }} />
            <span style={{ fontSize:'12px' }}>Loading question bank…</span>
          </div>
        ) : filtered.length===0 ? (
          loadError ? null : (
            <div style={{ textAlign:'center', padding:'36px 12px', color:'#9ca3af' }}>
              <BookOpen size={26} style={{ opacity:0.18, display:'block', margin:'0 auto 8px' }}/>
              <div style={{ fontSize:'12px' }}>No questions for this grade and subject</div>
            </div>
          )
        ) : (
          <>
            {Q_TYPES.map(t=>{
              const qs=byType[t]; if(!qs?.length) return null;
              const tc=TYPE_C[t];
              return (
                <div key={t} style={{ marginBottom:'11px' }}>
                  <div style={{ fontSize:'10px', fontWeight:700, color:'#374151', marginBottom:'5px', display:'flex', alignItems:'center', gap:'5px' }}>
                    <span>{tc.emoji}</span><span>{t}</span><span style={{ color:'#9ca3af', fontWeight:400 }}>({qs.length})</span>
                  </div>
                  {qs.map(q=>{
                    const already=addedIds.has(q.id);
                    const isReplace=replaceMode && replaceTargetType===q.type;
                    return (
                      <div key={q.id} onClick={()=>{ if(isReplace&&!already) onReplace(q); }}
                        style={{ display:'flex', alignItems:'flex-start', gap:'7px', padding:'7px 8px', borderRadius:'8px', marginBottom:'3px',
                          background:already?'#f0fdf4':isReplace?'#fffbeb':'#f9fafb',
                          border:`1px solid ${already?'#bbf7d0':isReplace?'#fde68a':'transparent'}`,
                          cursor:isReplace&&!already?'pointer':'default' }}>
                        <div style={{ flex:1 }}>
                          <div style={{ fontSize:'11px', color:'#374151', lineHeight:1.5, marginBottom:'3px' }}>{clamp(q.prompt,70)}</div>
                          <DiffBadge d={q.diff}/>
                        </div>
                        {isReplace ? (
                          <div style={{ flexShrink:0, width:'22px', height:'22px', borderRadius:'6px', background:'#fef9c3', border:'1px solid #fde68a', display:'flex', alignItems:'center', justifyContent:'center' }}>
                            <ArrowLeftRight size={11} style={{ color:'#d97706' }}/>
                          </div>
                        ) : (
                          <button onClick={e=>{ e.stopPropagation(); if(!already) onAdd(q); }}
                            style={{ flexShrink:0, width:'22px', height:'22px', borderRadius:'6px', border:'none', cursor:already?'default':'pointer', background:already?'#d1fae5':'#3b5bdb', color:already?'#15803d':'#fff', display:'flex', alignItems:'center', justifyContent:'center' }}>
                            {already ? <Check size={11}/> : <Plus size={11}/>}
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              );
            })}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '10px',
                padding: '6px 4px 2px',
                flexShrink: 0,
              }}
            >
              <button
                type="button"
                aria-label="Previous page"
                disabled={bankListPage <= 1 || loading}
                onClick={(e) => {
                  e.stopPropagation();
                  setBankListPage((p) => Math.max(1, p - 1));
                }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: '30px',
                  height: '30px',
                  borderRadius: '8px',
                  border: '1px solid #e8eaed',
                  background: bankListPage <= 1 ? '#f3f4f6' : '#fff',
                  color: bankListPage <= 1 ? '#d1d5db' : '#374151',
                  cursor: bankListPage <= 1 ? 'not-allowed' : 'pointer',
                }}
              >
                <ChevronLeft size={16} />
              </button>
              <span style={{ fontSize: '11px', color: '#6b7280', fontWeight: 600, minWidth: '120px', textAlign: 'center' }}>
                Page {bankListPage} / {bankTotalPages}
                <span style={{ display: 'block', fontWeight: 400, color: '#9ca3af', marginTop: '2px' }}>
                  {filteredTotal} question{filteredTotal === 1 ? '' : 's'} total
                </span>
              </span>
              <button
                type="button"
                aria-label="Next page"
                disabled={bankListPage >= bankTotalPages || loading}
                onClick={(e) => {
                  e.stopPropagation();
                  setBankListPage((p) => Math.min(bankTotalPages, p + 1));
                }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: '30px',
                  height: '30px',
                  borderRadius: '8px',
                  border: '1px solid #e8eaed',
                  background: bankListPage >= bankTotalPages ? '#f3f4f6' : '#fff',
                  color: bankListPage >= bankTotalPages ? '#d1d5db' : '#374151',
                  cursor: bankListPage >= bankTotalPages ? 'not-allowed' : 'pointer',
                }}
              >
                <ChevronRight size={16} />
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   MODE 2 — EXAM PAPER PICKER
═══════════════════════════════════════════════════════════════════════════ */
interface PaperPickerProps {
  grade: string;
  subject: string;
  onLoad: (ep: ExamPaperEntry) => void;
  /** Distinct imports on canvas (same paper may appear more than once). */
  canvasPaperBatches: { importId: string; paperId: string }[];
}

function ExamPaperPicker({ grade, subject, onLoad, canvasPaperBatches }: PaperPickerProps) {
  const queryClient = useQueryClient();
  const [expandId, setExpandId] = useState<string | null>(null);
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);
  const [listPage, setListPage] = useState(1);

  const listParams = useMemo(
    () => ({ grade, subject, page: listPage, page_size: EXAM_PAPER_LIST_PAGE_SIZE }),
    [grade, subject, listPage],
  );
  const {
    data: listRes,
    isPending: listLoading,
    isError: listErrFlag,
    error: listErr,
  } = useQuery({
    queryKey: teacherKeys.paperList(listParams),
    queryFn: () =>
      fetchPaperListApi({ grade, subject, page: listPage, page_size: EXAM_PAPER_LIST_PAGE_SIZE }),
    placeholderData: keepPreviousData,
  });
  const papers = listRes?.items ?? [];
  const listTotal = listRes?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(listTotal / EXAM_PAPER_LIST_PAGE_SIZE));
  const listError = listErrFlag
    ? (listErr instanceof Error ? listErr.message : 'Failed to load papers')
    : null;

  const expandNum = expandId ? Number(expandId) : NaN;
  const { data: detailDto, isPending: detailLoadingExpand } = useQuery({
    queryKey: teacherKeys.paperDetail(expandNum),
    queryFn: () => fetchPaperDetailApi(expandNum),
    enabled: Number.isFinite(expandNum) && expandNum > 0,
  });
  const epExpanded = detailDto ? mapDetailToExamPaperEntry(detailDto) : undefined;

  useEffect(() => {
    setExpandId(null);
    setListPage(1);
  }, [grade, subject]);

  useEffect(() => {
    setExpandId(null);
  }, [listPage]);

  function qByType(ep: ExamPaperEntry) {
    const m: Partial<Record<QType, number>> = {};
    ep.questions.forEach((q) => { m[q.type] = (m[q.type] ?? 0) + 1; });
    return m;
  }

  async function tryLoad(meta: PaperListItemDto) {
    const sid = String(meta.paper_id);
    setActionLoadingId(sid);
    try {
      const d = await queryClient.ensureQueryData({
        queryKey: teacherKeys.paperDetail(meta.paper_id),
        queryFn: () => fetchPaperDetailApi(meta.paper_id),
        staleTime: TEACHER_STALE_MS,
      });
      const ep = mapDetailToExamPaperEntry(d);
      onLoad(ep);
      setExpandId(sid);
    } finally {
      setActionLoadingId(null);
    }
  }

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <div style={{ padding: '10px 11px 8px', flexShrink: 0 }}>
        <p style={{ margin: 0, fontSize: '11px', color: '#6b7280', lineHeight: 1.6, padding: '9px 11px', background: '#f8f9fb', borderRadius: '8px', border: '1px solid #f0f2f5' }}>
          Import an exam paper into the canvas, then edit, reorder, or swap questions. Imported papers are marked below; remove them from the Task Canvas header if needed. List is scoped to Grade / Subject above (all statuses).
        </p>
      </div>
      {listError && (
        <div style={{ padding: '8px 12px', margin: '0 8px 8px', borderRadius: '8px', background: '#fef2f2', color: '#b91c1c', fontSize: '11px' }}>
          {listError}
        </div>
      )}
      <div style={{ flex: 1, overflowY: 'auto', padding: '0 8px 12px', display: 'flex', flexDirection: 'column', gap: '7px' }}>
        {listLoading ? (
          <div style={{ textAlign: 'center', padding: '36px 12px', color: '#9ca3af', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
            <Loader2 size={22} style={{ animation: 'spin 0.8s linear infinite' }} />
            <span style={{ fontSize: '12px' }}>Loading papers…</span>
          </div>
        ) : papers.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '28px 12px', color: '#9ca3af', fontSize: '12px' }}>
            {listError ? '' : 'No exam papers for this grade and subject'}
          </div>
        ) : (
          <>
          {papers.map((meta) => {
            const sid = String(meta.paper_id);
            const isLoaded = canvasPaperBatches.some((b) => b.paperId === sid);
            const isExpanded = expandId === sid;
            const ep = isExpanded ? epExpanded : undefined;
            const qmap = ep ? qByType(ep) : {};
            const loadingDetail = isExpanded && detailLoadingExpand && !ep;
            return (
              <div
                key={sid}
                onClick={() => setExpandId((v) => (v === sid ? null : sid))}
                style={{
                  borderRadius: '10px',
                  border: `1.5px solid ${isLoaded ? '#3b5bdb' : '#e8eaed'}`,
                  background: isLoaded ? '#f0f4ff' : '#fff',
                  overflow: isExpanded ? 'visible' : 'hidden',
                  cursor: 'pointer',
                  boxShadow: isLoaded ? '0 0 0 3px rgba(59,91,219,0.09)' : 'none',
                  transition: 'border-color 0.15s, box-shadow 0.15s',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '9px', padding: '10px 11px' }}>
                  <span style={{ fontSize: '18px', flexShrink: 0 }}>{SUBJ_EMOJI[meta.subject] ?? '📄'}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div
                      style={{
                        fontSize: '11px',
                        fontWeight: 700,
                        color: isLoaded ? '#1d4ed8' : '#0f0f23',
                        lineHeight: 1.35,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {meta.title}
                    </div>
                    <div style={{ fontSize: '9px', color: '#9ca3af', marginTop: '2px' }}>
                      {meta.grade} · {meta.subject} · {meta.question_count}q · {meta.total_score}pts · {meta.duration_min}min
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '5px', flexShrink: 0 }}>
                    {isLoaded && (
                      <span style={{ fontSize: '9px', fontWeight: 700, padding: '2px 7px', borderRadius: '20px', background: '#3b5bdb', color: '#fff' }}>
                        Imported
                      </span>
                    )}
                    <ChevronDown size={13} style={{ color: '#9ca3af', transform: isExpanded ? 'rotate(180deg)' : 'none', transition: 'transform 0.18s' }} />
                  </div>
                </div>
                {isExpanded && (
                  <div
                    style={{
                      borderTop: '1px solid #e8eaed',
                      padding: '9px 11px 11px',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '9px',
                      minHeight: 0,
                    }}
                    onClick={(e) => e.stopPropagation()}
                  >
                    {loadingDetail ? (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '12px 0', color: '#9ca3af', fontSize: '11px' }}>
                        <Loader2 size={16} style={{ animation: 'spin 0.8s linear infinite' }} />
                        Loading preview…
                      </div>
                    ) : ep ? (
                      <>
                        <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                          {Q_TYPES.map((t) => {
                            const c = qmap[t];
                            if (!c) return null;
                            const tc = TYPE_C[t];
                            return (
                              <span
                                key={t}
                                style={{ fontSize: '10px', padding: '2px 8px', borderRadius: '20px', background: tc.bg, color: tc.color, fontWeight: 600 }}
                              >
                                {tc.emoji} {t} ×{c}
                              </span>
                            );
                          })}
                        </div>
                        {ep.questions.length > 0 ? (
                          <div
                            style={{
                              display: 'flex',
                              flexDirection: 'column',
                              gap: '3px',
                              maxHeight: '130px',
                              overflowY: 'auto',
                              flexShrink: 1,
                              minHeight: 0,
                            }}
                          >
                            {ep.questions.map((q, i) => {
                              const tc = TYPE_C[q.type];
                              return (
                                <div key={q.id} style={{ display: 'flex', alignItems: 'flex-start', gap: '6px', padding: '4px 7px', borderRadius: '6px', background: '#f9fafb' }}>
                                  <span style={{ fontSize: '9px', fontWeight: 700, color: '#9ca3af', flexShrink: 0, marginTop: '1px' }}>Q{i + 1}</span>
                                  <span style={{ fontSize: '10px', padding: '1px 5px', borderRadius: '4px', background: tc.bg, color: tc.color, fontWeight: 600, flexShrink: 0 }}>{tc.short}</span>
                                  <span style={{ fontSize: '10px', color: '#374151', lineHeight: 1.4, flex: 1 }}>{clamp(q.prompt, 55)}</span>
                                </div>
                              );
                            })}
                          </div>
                        ) : (
                          <div style={{ fontSize: '11px', color: '#9ca3af', lineHeight: 1.4 }}>No questions in this paper.</div>
                        )}
                      </>
                    ) : (
                      <div style={{ fontSize: '11px', color: '#9ca3af', padding: '8px 0' }}>Could not load preview.</div>
                    )}
                    {actionLoadingId === sid ? (
                      <div
                        style={{
                          width: '100%',
                          padding: '9px',
                          borderRadius: '8px',
                          background: '#f3f4f6',
                          color: '#6b7280',
                          fontSize: '12px',
                          fontWeight: 700,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: '7px',
                          flexShrink: 0,
                          boxSizing: 'border-box',
                        }}
                      >
                        <Loader2 size={13} style={{ animation: 'spin 0.8s linear infinite' }} /> Loading…
                      </div>
                    ) : isLoaded ? (
                      <div
                        style={{
                          width: '100%',
                          padding: '9px',
                          borderRadius: '8px',
                          border: '1px solid #bbf7d0',
                          background: '#f0fdf4',
                          color: '#15803d',
                          fontSize: '12px',
                          fontWeight: 700,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: '7px',
                          flexShrink: 0,
                          boxSizing: 'border-box',
                        }}
                      >
                        <CheckCircle2 size={13} /> Imported
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => void tryLoad(meta)}
                        style={{
                          width: '100%',
                          padding: '9px',
                          borderRadius: '8px',
                          border: 'none',
                          cursor: 'pointer',
                          background: '#3b5bdb',
                          color: '#fff',
                          fontSize: '12px',
                          fontWeight: 700,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: '7px',
                          flexShrink: 0,
                          boxSizing: 'border-box',
                        }}
                      >
                        <RotateCcw size={13} /> Import into canvas
                      </button>
                    )}
                  </div>
                )}
              </div>
            );
          })}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '10px',
              padding: '6px 4px 2px',
              flexShrink: 0,
            }}
          >
            <button
              type="button"
              aria-label="Previous page"
              disabled={listPage <= 1 || listLoading}
              onClick={(e) => {
                e.stopPropagation();
                setListPage((p) => Math.max(1, p - 1));
              }}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: '30px',
                height: '30px',
                borderRadius: '8px',
                border: '1px solid #e8eaed',
                background: listPage <= 1 ? '#f3f4f6' : '#fff',
                color: listPage <= 1 ? '#d1d5db' : '#374151',
                cursor: listPage <= 1 ? 'not-allowed' : 'pointer',
              }}
            >
              <ChevronLeft size={16} />
            </button>
            <span style={{ fontSize: '11px', color: '#6b7280', fontWeight: 600, minWidth: '120px', textAlign: 'center' }}>
              Page {listPage} / {totalPages}
              <span style={{ display: 'block', fontWeight: 400, color: '#9ca3af', marginTop: '2px' }}>
                {listTotal} paper{listTotal === 1 ? '' : 's'} total
              </span>
            </span>
            <button
              type="button"
              aria-label="Next page"
              disabled={listPage >= totalPages || listLoading}
              onClick={(e) => {
                e.stopPropagation();
                setListPage((p) => Math.min(totalPages, p + 1));
              }}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: '30px',
                height: '30px',
                borderRadius: '8px',
                border: '1px solid #e8eaed',
                background: listPage >= totalPages ? '#f3f4f6' : '#fff',
                color: listPage >= totalPages ? '#d1d5db' : '#374151',
                cursor: listPage >= totalPages ? 'not-allowed' : 'pointer',
              }}
            >
              <ChevronRight size={16} />
            </button>
          </div>
          </>
        )}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   CANVAS QUESTION CARD
═══════════════════════════════════════════════════════════════════════════ */
interface CanvasQCardProps {
  q: SectionQ; globalIdx: number; secId: string;
  isEditing: boolean; isReplaceTarget: boolean;
  readOnly?: boolean;
  onEdit: () => void; onCancelEdit: () => void;
  onSaveEdit: (newPrompt: string) => void;
  onReplace: () => void; onRemove: () => void;
}
function CanvasQCard({ q, globalIdx, isEditing, isReplaceTarget, readOnly, onEdit, onCancelEdit, onSaveEdit, onReplace, onRemove }: CanvasQCardProps) {
  const [editText, setEditText] = useState(q.prompt);
  useEffect(()=>{ setEditText(q.prompt); }, [q.prompt, isEditing]);

  return (
    <div style={{ borderRadius:'8px', border:`1.5px solid ${isEditing?'#93c5fd':isReplaceTarget?'#fde68a':'#f0f2f5'}`, background:isEditing?'#f0f7ff':isReplaceTarget?'#fffbeb':'#fafafa', overflow:'hidden', transition:'border-color 0.15s, background 0.15s' }}>
      <div style={{ display:'flex', alignItems:'center', gap:'7px', padding:'5px 8px', borderBottom:isEditing?'1px solid #bfdbfe':'none' }}>
        <span style={{ fontSize:'10px', fontWeight:700, color:'#3b5bdb', flexShrink:0 }}>Q{globalIdx}</span>
        <TypeBadge t={q.type}/>
        <DiffBadge d={q.diff}/>
        <span style={{ fontSize:'10px', fontWeight:600, color:'#6b7280', marginLeft:'auto', flexShrink:0 }}>{q.pts}pt</span>
        <div style={{ display:'flex', gap:'2px', marginLeft:'4px' }}>
          {!readOnly && !isEditing && (
            <>
              <button title="Edit" onClick={onEdit}
                style={{ width:'20px', height:'20px', borderRadius:'5px', border:'none', cursor:'pointer', background:'transparent', color:'#9ca3af', display:'flex', alignItems:'center', justifyContent:'center' }}
                onMouseEnter={e=>{ (e.currentTarget as HTMLElement).style.background='#eff6ff'; (e.currentTarget as HTMLElement).style.color='#3b5bdb'; }}
                onMouseLeave={e=>{ (e.currentTarget as HTMLElement).style.background='transparent'; (e.currentTarget as HTMLElement).style.color='#9ca3af'; }}>
                <Pencil size={10}/>
              </button>
              <button title="Replace" onClick={onReplace}
                style={{ width:'20px', height:'20px', borderRadius:'5px', border:'none', cursor:'pointer', background:isReplaceTarget?'#fef9c3':'transparent', color:isReplaceTarget?'#d97706':'#9ca3af', display:'flex', alignItems:'center', justifyContent:'center' }}
                onMouseEnter={e=>{ (e.currentTarget as HTMLElement).style.background='#fef3c7'; (e.currentTarget as HTMLElement).style.color='#d97706'; }}
                onMouseLeave={e=>{ (e.currentTarget as HTMLElement).style.background=isReplaceTarget?'#fef9c3':'transparent'; (e.currentTarget as HTMLElement).style.color=isReplaceTarget?'#d97706':'#9ca3af'; }}>
                <ArrowLeftRight size={10}/>
              </button>
            </>
          )}
          {!readOnly && (
          <button title="Remove" onClick={onRemove}
            style={{ width:'20px', height:'20px', borderRadius:'5px', border:'none', cursor:'pointer', background:'transparent', color:'#d1d5db', display:'flex', alignItems:'center', justifyContent:'center' }}
            onMouseEnter={e=>{ (e.currentTarget as HTMLElement).style.background='#fee2e2'; (e.currentTarget as HTMLElement).style.color='#b91c1c'; }}
            onMouseLeave={e=>{ (e.currentTarget as HTMLElement).style.background='transparent'; (e.currentTarget as HTMLElement).style.color='#d1d5db'; }}>
            <X size={10}/>
          </button>
          )}
        </div>
      </div>
      <div style={{ padding:'5px 8px 7px' }}>
        {isEditing ? (
          <>
            <textarea value={editText} onChange={e=>setEditText(e.target.value)} rows={3} autoFocus
              style={{ width:'100%', boxSizing:'border-box', padding:'6px 9px', borderRadius:'6px', border:'1.5px solid #93c5fd', fontSize:'11px', color:'#0f0f23', outline:'none', resize:'vertical', fontFamily:'inherit', lineHeight:1.55 }}/>
            {q.options && (
              <div style={{ marginTop:'5px', display:'flex', flexDirection:'column', gap:'2px' }}>
                {q.options.map(opt=>(
                  <div key={opt} style={{ fontSize:'10px', color:'#6b7280', padding:'2px 6px', borderRadius:'4px', background:'#fff', border:'1px solid #e8eaed' }}>{opt}</div>
                ))}
              </div>
            )}
            <div style={{ display:'flex', gap:'5px', marginTop:'7px' }}>
              <button onClick={()=>onSaveEdit(editText)} style={{ padding:'4px 12px', borderRadius:'6px', border:'none', cursor:'pointer', background:'#3b5bdb', color:'#fff', fontSize:'11px', fontWeight:600, display:'flex', alignItems:'center', gap:'4px' }}>
                <Check size={9}/> Save
              </button>
              <button onClick={onCancelEdit} style={{ padding:'4px 10px', borderRadius:'6px', border:'1px solid #e8eaed', cursor:'pointer', background:'#fff', color:'#6b7280', fontSize:'11px' }}>Cancel</button>
            </div>
          </>
        ) : (
          <div style={{ display:'flex', flexDirection:'column', gap:'6px' }}>
            <span style={{ fontSize:'11px', color:'#374151', lineHeight:1.55 }}>{q.prompt || 'No prompt content.'}</span>
            {q.imageUrl && (
              <div style={{ border:'1px solid #e8eaed', borderRadius:'8px', overflow:'hidden', background:'#fff' }}>
                <img
                  src={q.imageUrl}
                  alt="question illustration"
                  style={{ width:'100%', maxHeight:'300px', objectFit:'contain', display:'block', background:'#f8fafc' }}
                />
              </div>
            )}
            {q.options && q.options.length > 0 && (
              <div style={{ display:'flex', flexDirection:'column', gap:'3px' }}>
                {q.options.map(opt=>(
                  <div key={opt} style={{ fontSize:'10px', color:'#4b5563', padding:'3px 7px', borderRadius:'5px', border:'1px solid #e8eaed', background:'#fff' }}>
                    {opt}
                  </div>
                ))}
              </div>
            )}
            {q.answer && (
              <div style={{ fontSize:'10px', color:'#065f46', background:'#ecfdf5', border:'1px solid #a7f3d0', borderRadius:'5px', padding:'3px 7px' }}>
                Answer: {q.answer}
              </div>
            )}
          </div>
        )}
      </div>
      {isReplaceTarget && !isEditing && (
        <div style={{ padding:'4px 8px', background:'#fef3c7', borderTop:'1px solid #fde68a', fontSize:'10px', color:'#92400e', display:'flex', alignItems:'center', gap:'4px' }}>
          <ArrowLeftRight size={9}/> Switch to Question Bank tab and click a question to replace
        </div>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   ASSEMBLE VIEW
═══════════════════════════════════════════════════════════════════════════ */
function AssembleView({
  editingTaskId,
  readOnly = false,
  onExitReadOnly,
  onSaved,
  onTaskCreated,
}: {
  editingTaskId: number | null;
  readOnly?: boolean;
  onExitReadOnly?: () => void;
  onSaved: () => void;
  onTaskCreated: (taskId: number) => void;
}) {
  const [mode,    setMode]    = useState<AssembleMode>('bank');
  const [grade,   setGrade]   = useState('Grade 10');
  const [subject, setSubject] = useState('Biology');
  const [title,   setTitle]   = useState('');
  const [kind,    setKind]    = useState<PaperKind>('exam');
  const [dur,     setDur]     = useState(90);

  // Canvas starts empty: only shows content after importing questions or loading an existing paper.
  const [sections, setSections] = useState<Section[]>([]);
  const sectionsRef = useRef<Section[]>([]);
  sectionsRef.current = sections;

  const [addSecOpen,    setAddSecOpen]    = useState(false);
  const [newSecType,    setNewSecType]    = useState<QType>('MCQ');
  const [saved,         setSaved]         = useState(false);
  const [saving,        setSaving]        = useState(false);
  const [editingId,     setEditingId]     = useState<string|null>(null);
  const [replaceTarget, setReplaceTarget] = useState<{ secId:string; uid:string; type:QType }|null>(null);

  useEffect(() => {
    if (editingTaskId == null) return;
    let cancelled = false;
    (async () => {
      try {
        const d = await fetchTaskDetailApi(editingTaskId);
        if (cancelled) return;
        const c = taskDetailToCanvas(d);
        setSections(normalizeCanvasSections(c.sections));
        setGrade(c.grade);
        setSubject(c.subject);
        setTitle(c.title);
        setKind(c.kind);
        setDur(c.dur);
        setEditingId(null);
        setReplaceTarget(null);
      } catch (e) {
        if (!cancelled) window.alert(e instanceof Error ? e.message : 'Failed to load task');
      }
    })();
    return () => { cancelled = true; };
  }, [editingTaskId]);

  useEffect(() => {
    if (editingTaskId !== null) return;
    setSections([]);
    setTitle('');
    setEditingId(null);
    setReplaceTarget(null);
  }, [editingTaskId]);

  const addedIds = new Set<string>(sections.flatMap(s => s.qs.map(q => q.libId)));
  const canvasHasContent = sections.some(s=>s.qs.length>0);

  const paperImportBatches = useMemo(() => {
    const m = new Map<string, { importId: string; paperId: string; title: string }>();
    for (const s of sections) {
      for (const q of s.qs) {
        if (q.importId && q.sourcePaperId && !m.has(q.importId)) {
          m.set(q.importId, {
            importId: q.importId,
            paperId: q.sourcePaperId,
            title: q.sourcePaperTitle ?? '',
          });
        }
      }
    }
    return [...m.values()];
  }, [sections]);

  const canvasPaperBatchesForPicker = useMemo(
    () => paperImportBatches.map(({ importId, paperId }) => ({ importId, paperId })),
    [paperImportBatches],
  );

  // Append one exam paper; questions are merged into existing same-type sections.
  function loadPaper(ep: ExamPaperEntry) {
    if (sectionsRef.current.some((s) => s.qs.some((q) => q.sourcePaperId === ep.id))) return;
    const importId = nid();
    if (!sectionsRef.current.some((s) => s.qs.length > 0)) {
      setGrade(ep.grade);
      setSubject(ep.subject);
      setDur(ep.durationMin);
      setTitle(`${ep.title} (edited)`);
    }
    setSections((prev) => {
      if (ep.questions.length === 0) {
        return prev;
      }
      const next = prev.map((s) => ({ ...s, qs: [...s.qs] }));
      let importedCount = 0;
      let skippedDupCount = 0;
      ep.questions.forEach((q) => {
        const dupKey = dedupQuestionKey(q.type, q.prompt);
        const exists = next.some(
          (sec) => sec.type === q.type && sec.qs.some((item) => dedupQuestionKey(item.type, item.prompt) === dupKey),
        );
        if (exists) {
          skippedDupCount += 1;
          return;
        }

        let target = next.find((sec) => sec.type === q.type);
        if (!target) {
          target = {
            id: nid(),
            label: '',
            type: q.type,
            ptsEach: defaultPts(q.type),
            qs: [],
          };
          next.push(target);
        }

        target.qs.push({
          uid: nid(),
          libId: q.id,
          type: q.type,
          diff: q.diff,
          pts: target.ptsEach,
          prompt: q.prompt,
          imageUrl: q.imageUrl,
          options: q.options,
          answer: q.answer,
          importId,
          sourcePaperId: ep.id,
          sourcePaperTitle: ep.title,
        });
        importedCount += 1;
      });

      if (skippedDupCount > 0) {
        toast.info(`Skipped ${skippedDupCount} duplicate question${skippedDupCount > 1 ? 's' : ''} from ${ep.title}`);
      }
      if (importedCount === 0) {
        toast.info(`No new questions imported from ${ep.title}`);
        return prev;
      }
      return normalizeCanvasSections(next);
    });
    setEditingId(null);
    setReplaceTarget(null);
  }

  function clearImport(importId: string) {
    if (readOnly) return;
    if (!window.confirm('Remove all sections from this paper import?')) return;
    setSections((prev) => {
      const removedUids = new Set(
        prev.flatMap((s) => s.qs.filter((q) => q.importId === importId).map((q) => q.uid)),
      );
      setEditingId((eid) => (eid && removedUids.has(eid) ? null : eid));
      setReplaceTarget((rt) => (rt && removedUids.has(rt.uid) ? null : rt));
      const next = prev.map((s) => ({
        ...s,
        qs: s.qs.filter((q) => q.importId !== importId),
      }));
      return normalizeCanvasSections(next);
    });
  }

  function clearCanvas() {
    if (readOnly) return;
    if (sections.length === 0) return;
    if (!window.confirm('Clear the task canvas? All sections and questions will be removed.')) return;
    setSections([]);
    setTitle('');
    setEditingId(null);
    setReplaceTarget(null);
    setAddSecOpen(false);
  }

  function addQ(lq: LibQ) {
    let skipped = false;
    setSections((prev) => {
      const key = dedupQuestionKey(lq.type, lq.prompt);
      const duplicate = prev.some(
        (s) => s.type === lq.type && s.qs.some((q) => dedupQuestionKey(q.type, q.prompt) === key),
      );
      if (duplicate) {
        skipped = true;
        return prev;
      }

      const next = prev.map((s) => ({ ...s, qs: [...s.qs] }));
      let target = next.find((s) => s.type === lq.type);
      if (!target) {
        target = {
          id: nid(),
          label: '',
          type: lq.type,
          ptsEach: defaultPts(lq.type),
          qs: [],
        };
        next.push(target);
      }
      target.qs.push({
        uid: nid(),
        libId: lq.id,
        type: lq.type,
        diff: lq.diff,
        pts: target.ptsEach,
        prompt: lq.prompt,
        imageUrl: lq.imageUrl,
        options: lq.options,
        answer: lq.answer,
      });
      return normalizeCanvasSections(next);
    });
    if (skipped) {
      toast.info('Duplicate question skipped in canvas');
    }
  }
  function replaceQ(lq: LibQ) {
    if (!replaceTarget) return;
    setSections(prev=>normalizeCanvasSections(prev.map(s=>s.id===replaceTarget.secId
      ? {...s, qs:s.qs.map(q=>q.uid===replaceTarget.uid ? {...q, libId:lq.id, prompt:lq.prompt, imageUrl:lq.imageUrl, options:lq.options, answer:lq.answer, diff:lq.diff} : q)}
      : s)));
    setReplaceTarget(null);
  }
  function saveEdit(secId: string, uid: string, newPrompt: string) {
    setSections(prev=>normalizeCanvasSections(prev.map(s=>s.id===secId ? {...s, qs:s.qs.map(q=>q.uid===uid ? {...q, prompt:newPrompt} : q)} : s)));
    setEditingId(null);
  }
  function removeQ(secId: string, uid: string) {
    if (editingId===uid) setEditingId(null);
    if (replaceTarget?.uid===uid) setReplaceTarget(null);
    setSections(prev=>normalizeCanvasSections(prev.map(s=>s.id===secId ? {...s, qs:s.qs.filter(q=>q.uid!==uid)} : s)));
  }
  function removeSec(id: string) { setSections(prev=>normalizeCanvasSections(prev.filter(s=>s.id!==id))); }
  function updatePtsEach(secId: string, v: number) {
    setSections(prev=>normalizeCanvasSections(prev.map(s=>s.id===secId ? {...s, ptsEach:v, qs:s.qs.map(q=>({...q, pts:v}))} : s)));
  }
  function addSection() {
    setSections(prev=>normalizeCanvasSections([...prev, { id:nid(), label:'', type:newSecType, ptsEach:defaultPts(newSecType), qs:[] }]));
    setAddSecOpen(false);
  }

  const totalQ   = sections.reduce((n,s)=>n+s.qs.length, 0);
  const totalPts = sections.reduce((n,s)=>n+s.qs.length*s.ptsEach, 0);

  async function handleSave() {
    if (readOnly) return;
    if (totalQ === 0 || saving) return;
    setSaving(true);
    try {
      const payload: TaskCreateRequestDto = buildTaskPayload(sections, {
        title,
        grade,
        subject,
        kind,
        dur,
      });
      if (editingTaskId != null) {
        await updateTaskApi(editingTaskId, payload);
        onSaved();
      } else {
        const res = await createTaskApi(payload);
        onTaskCreated(res.task_id);
        onSaved();
      }
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (e) {
      window.alert(e instanceof Error ? e.message : 'Failed to save task');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{ display:'flex', flexDirection:'column', height:'100%', overflow:'hidden' }}>
      {readOnly && (
        <div style={{ padding:'8px 18px', background:'#fffbeb', borderBottom:'1px solid #fde68a', flexShrink:0, display:'flex', alignItems:'center', justifyContent:'space-between', gap:'12px', flexWrap:'wrap' }}>
          <span style={{ fontSize:'12px', color:'#92400e', fontWeight:600 }}>已发布 · 仅可查看题目与分值</span>
          <button
            type="button"
            onClick={() => onExitReadOnly?.()}
            style={{ padding:'5px 12px', borderRadius:'7px', border:'1px solid #fde68a', background:'#fff', color:'#92400e', fontSize:'11px', fontWeight:600, cursor:'pointer' }}
          >
            返回发布列表
          </button>
        </div>
      )}
      {/* Config bar */}
      <div style={{ padding:'9px 18px', borderBottom:'1px solid #e8eaed', background:'#fafafa', display:'flex', alignItems:'center', gap:'10px', flexShrink:0, flexWrap:'wrap', opacity:readOnly?0.88:1, pointerEvents:readOnly?'none':'auto', userSelect:readOnly?'none':'auto' }}>
        <div style={{ display:'flex', background:'#f3f4f6', borderRadius:'8px', padding:'2px' }}>
          {(['exam','quiz','homework'] as PaperKind[]).map(k=>(
            <button key={k} type="button" disabled={readOnly} onClick={()=>setKind(k)} style={{ padding:'5px 12px', borderRadius:'6px', border:'none', cursor:readOnly?'default':'pointer', fontSize:'12px', background:kind===k?'#fff':'transparent', color:kind===k?'#0f0f23':'#6b7280', fontWeight:kind===k?600:400, boxShadow:kind===k?'0 1px 3px rgba(0,0,0,0.08)':'none' }}>
              {k==='exam'?'📋 Exam':k==='quiz'?'⚡ Quiz':'📚 Homework'}
            </button>
          ))}
        </div>
        <MiniSelect label="Grade "   value={grade}   onChange={setGrade}   options={GRADES} disabled={readOnly}/>
        <MiniSelect label="Subject " value={subject} onChange={setSubject} options={SUBJECTS} disabled={readOnly}/>
        <input value={title} onChange={e=>setTitle(e.target.value)} disabled={readOnly}
          placeholder={`e.g. ${grade} ${subject} Midterm 2026`}
          style={{ flex:1, minWidth:'180px', padding:'7px 12px', borderRadius:'8px', border:'1.5px solid #e8eaed', fontSize:'12px', color:'#0f0f23', outline:'none', background:readOnly?'#f9fafb':'#fff' }}
          onFocus={e=>{e.currentTarget.style.borderColor='#3b5bdb';}} onBlur={e=>{e.currentTarget.style.borderColor='#e8eaed';}}/>
        <div style={{ display:'flex', alignItems:'center', gap:'5px' }}>
          <Clock size={12} style={{ color:'#9ca3af' }}/>
          <input type="number" value={dur} min={5} max={360} onChange={e=>setDur(+e.target.value)} disabled={readOnly}
            style={{ width:'50px', padding:'6px 8px', borderRadius:'8px', border:'1.5px solid #e8eaed', fontSize:'12px', textAlign:'center', outline:'none', background:readOnly?'#f9fafb':'#fff' }}/>
          <span style={{ fontSize:'11px', color:'#6b7280' }}>min</span>
        </div>
      </div>

      {/* Body */}
      <div style={{ flex:1, display:'flex', overflow:'hidden' }}>
        {/* LEFT PANEL */}
        {!readOnly && (
        <div style={{ width:'272px', flexShrink:0, borderRight:'1px solid #e8eaed', display:'flex', flexDirection:'column', overflow:'hidden', background:'#fff' }}>
          {/* Mode switcher */}
          <div style={{ padding:'10px 11px 0', flexShrink:0 }}>
            <div style={{ display:'flex', background:'#f3f4f6', borderRadius:'8px', padding:'2px', marginBottom:'10px' }}>
              {([
                { id:'bank'   as AssembleMode, label:'Question Bank', icon:<BookOpen size={11}/> },
                { id:'papers' as AssembleMode, label:'Exam Papers',   icon:<FileText size={11}/> },
              ]).map(m=>(
                <button key={m.id} onClick={()=>{ setMode(m.id); if(replaceTarget) setReplaceTarget(null); }}
                  style={{ flex:1, padding:'6px 4px', borderRadius:'6px', border:'none', cursor:'pointer', fontSize:'11px', fontWeight:mode===m.id?700:400, background:mode===m.id?'#fff':'transparent', color:mode===m.id?'#0f0f23':'#6b7280', boxShadow:mode===m.id?'0 1px 3px rgba(0,0,0,0.08)':'none', display:'flex', alignItems:'center', justifyContent:'center', gap:'5px', transition:'all 0.15s' }}>
                  {m.icon}{m.label}
                </button>
              ))}
            </div>
          </div>
          {/* Panel content：双面板常驻 + display 切换，避免 Bank/Papers 互切时卸载导致重复请求与滚动丢失（数据由 React Query 缓存） */}
          <div style={{ flex: 1, minHeight: 0, display: mode === 'bank' ? 'flex' : 'none', flexDirection: 'column', overflow: 'hidden' }}>
            <QuestionBankBrowser
              grade={grade}
              subject={subject}
              addedIds={addedIds}
              replaceMode={!!replaceTarget}
              replaceTargetType={replaceTarget?.type??null}
              onAdd={addQ}
              onReplace={replaceQ}
            />
          </div>
          <div style={{ flex: 1, minHeight: 0, display: mode === 'papers' ? 'flex' : 'none', flexDirection: 'column', overflow: 'hidden' }}>
            <ExamPaperPicker
              grade={grade}
              subject={subject}
              onLoad={loadPaper}
              canvasPaperBatches={canvasPaperBatchesForPicker}
            />
          </div>
        </div>
        )}

        {/* RIGHT — Canvas */}
        <div style={{ flex:1, display:'flex', flexDirection:'column', overflow:'hidden', background:'#f7f8fb', minWidth:0 }}>
          <div style={{ padding:'8px 18px', borderBottom:'1px solid #e8eaed', background:'#fff', display:'flex', alignItems:'center', gap:'10px', flexShrink:0, flexWrap:'wrap' }}>
            <span style={{ fontSize:'12px', fontWeight:700, color:'#0f0f23' }}>Task Canvas</span>
            <span style={{ fontSize:'11px', color:'#9ca3af' }}>{totalQ}q · {totalPts}pts · {dur}min</span>
            {paperImportBatches.length > 0 && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap', maxWidth: '100%' }}>
                {paperImportBatches.map((b, bi) => (
                  <span
                    key={b.importId}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '5px',
                      fontSize: '10px',
                      padding: '2px 4px 2px 8px',
                      borderRadius: '20px',
                      background: '#f0f4ff',
                      color: '#3b5bdb',
                      fontWeight: 600,
                      maxWidth: '220px',
                    }}
                    title={b.title}
                  >
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      Paper{paperImportBatches.length > 1 ? ` ${bi + 1}: ` : ': '}
                      {b.title.split('—')[0].trim().slice(0, 36)}
                      {b.title.length > 36 ? '…' : ''}
                    </span>
                    {!readOnly && (
                      <button
                        type="button"
                        aria-label="Remove this import"
                        onClick={() => clearImport(b.importId)}
                        style={{
                          width: '20px',
                          height: '20px',
                          borderRadius: '50%',
                          border: 'none',
                          cursor: 'pointer',
                          background: '#e0e7ff',
                          color: '#4338ca',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          flexShrink: 0,
                        }}
                      >
                        <X size={11} />
                      </button>
                    )}
                  </span>
                ))}
              </div>
            )}
            <div style={{ flex: 1, minWidth: 8 }} />
            {!readOnly && sections.length > 0 && (
              <button
                type="button"
                onClick={clearCanvas}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '5px',
                  padding: '4px 11px',
                  borderRadius: '6px',
                  border: '1px solid #fecaca',
                  background: '#fff',
                  color: '#b91c1c',
                  fontSize: '11px',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                <Trash2 size={11} /> Clear canvas
              </button>
            )}
            {replaceTarget && !readOnly && (
              <button onClick={()=>setReplaceTarget(null)}
                style={{ display:'flex', alignItems:'center', gap:'5px', padding:'4px 11px', borderRadius:'6px', border:'1px solid #fde68a', background:'#fef9c3', color:'#92400e', fontSize:'11px', cursor:'pointer' }}>
                <X size={10}/> Cancel Replace
              </button>
            )}
          </div>

          <div style={{ flex:1, overflowY:'auto', padding:'14px 18px', display:'flex', flexDirection:'column', gap:'12px' }}>
            {sections.length===0 ? (
              <div style={{ textAlign:'center', padding:'60px 20px', border:'2px dashed #e8eaed', borderRadius:'16px', color:'#9ca3af', background:'#fff' }}>
                <Layers size={30} style={{ opacity:0.18, display:'block', margin:'0 auto 10px' }}/>
                <div style={{ fontSize:'13px', fontWeight:600, color:'#374151', marginBottom:'4px' }}>Task canvas is empty</div>
                <div style={{ fontSize:'12px' }}>Browse the Question Bank to add questions, or load an Exam Paper as a starting point.</div>
              </div>
            ) : sections.map((sec,si)=>{
              const tc=TYPE_C[sec.type]; const secTotal=sec.qs.length*sec.ptsEach;
              return (
                <div key={sec.id} style={{ background:'#fff', border:'1px solid #e8eaed', borderRadius:'12px', overflow:'hidden', flexShrink:0 }}>
                  <div style={{ display:'flex', alignItems:'center', gap:'9px', padding:'9px 12px', background:'#f8f9fb', borderBottom:'1px solid #f0f2f5' }}>
                    <div style={{ width:'6px', height:'6px', borderRadius:'50%', background:tc.color, flexShrink:0 }}/>
                    <span style={{ fontSize:'12px', fontWeight:700, color:'#0f0f23', flex:1 }}>{sec.label}</span>
                    <TypeBadge t={sec.type}/>
                    <div style={{ display:'flex', alignItems:'center', gap:'4px', fontSize:'11px', color:'#6b7280' }}>
                      <span>{sec.qs.length}q ·</span>
                      {readOnly ? (
                        <span style={{ fontWeight:600, color:'#3b5bdb' }}>{sec.ptsEach}</span>
                      ) : (
                        <input type="number" value={sec.ptsEach} min={1} max={50} onChange={e=>updatePtsEach(sec.id,+e.target.value)}
                          style={{ width:'34px', textAlign:'center', padding:'2px 4px', borderRadius:'5px', border:'1px solid #e8eaed', fontSize:'11px', fontWeight:600, color:'#3b5bdb' }}/>
                      )}
                      <span>pt/q =</span>
                      <span style={{ color:'#0f0f23', fontWeight:700 }}>{secTotal}pt</span>
                    </div>
                    {!readOnly && (
                    <button onClick={()=>removeSec(sec.id)} style={{ width:'20px', height:'20px', borderRadius:'5px', border:'none', cursor:'pointer', background:'#fee2e2', color:'#b91c1c', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
                      <X size={10}/>
                    </button>
                    )}
                  </div>
                  <div style={{ padding:'8px 12px', display:'flex', flexDirection:'column', gap:'5px' }}>
                    {sec.qs.length===0 ? (
                      <div style={{ fontSize:'11px', color:'#9ca3af', padding:'6px 0', fontStyle:'italic' }}>No questions — add {sec.type} questions from the Question Bank.</div>
                    ) : sec.qs.map((q,qi)=>{
                      const globalIdx=sections.slice(0,si).reduce((n,s)=>n+s.qs.length,0)+qi+1;
                      return (
                        <React.Fragment key={q.uid}>
                          <CanvasQCard
                            q={q} globalIdx={globalIdx} secId={sec.id}
                            isEditing={editingId===q.uid}
                            isReplaceTarget={replaceTarget?.uid===q.uid}
                            readOnly={readOnly}
                            onEdit={()=>{ setReplaceTarget(null); setEditingId(q.uid); }}
                            onCancelEdit={()=>setEditingId(null)}
                            onSaveEdit={(p)=>saveEdit(sec.id,q.uid,p)}
                            onReplace={()=>{ setEditingId(null); setMode('bank'); setReplaceTarget(rt=>rt?.uid===q.uid?null:{secId:sec.id,uid:q.uid,type:q.type}); }}
                            onRemove={()=>removeQ(sec.id,q.uid)}
                          />
                        </React.Fragment>
                      );
                    })}
                  </div>
                </div>
              );
            })}
            {/* Add section */}
            {!readOnly && (
            <div>
              {addSecOpen ? (
                <div style={{ display:'flex', alignItems:'center', gap:'8px', padding:'10px 14px', border:'1.5px solid #3b5bdb', borderRadius:'10px', background:'#f0f4ff', flexWrap:'wrap' }}>
                  <span style={{ fontSize:'12px', fontWeight:600, color:'#374151' }}>Type:</span>
                  {Q_TYPES.map(t=>(
                    <button key={t} onClick={()=>setNewSecType(t)} style={{ padding:'4px 9px', borderRadius:'6px', border:'none', cursor:'pointer', fontSize:'11px', background:newSecType===t?TYPE_C[t].bg:'#f3f4f6', color:newSecType===t?TYPE_C[t].color:'#6b7280', fontWeight:newSecType===t?700:400 }}>
                      {TYPE_C[t].emoji} {TYPE_C[t].short}
                    </button>
                  ))}
                  <button onClick={addSection} style={{ marginLeft:'auto', padding:'5px 14px', borderRadius:'7px', border:'none', cursor:'pointer', background:'#3b5bdb', color:'#fff', fontSize:'12px', fontWeight:600 }}>Add</button>
                  <button onClick={()=>setAddSecOpen(false)} style={{ padding:'5px 9px', borderRadius:'7px', border:'1px solid #e8eaed', cursor:'pointer', background:'#fff', color:'#6b7280', fontSize:'12px' }}>Cancel</button>
                </div>
              ) : (
                <button onClick={()=>setAddSecOpen(true)}
                  style={{ display:'flex', alignItems:'center', gap:'6px', padding:'8px', borderRadius:'9px', border:'1.5px dashed #d1d5db', background:'transparent', color:'#9ca3af', fontSize:'12px', cursor:'pointer', width:'100%', justifyContent:'center' }}
                  onMouseEnter={e=>{ (e.currentTarget as HTMLElement).style.borderColor='#3b5bdb'; (e.currentTarget as HTMLElement).style.color='#3b5bdb'; }}
                  onMouseLeave={e=>{ (e.currentTarget as HTMLElement).style.borderColor='#d1d5db'; (e.currentTarget as HTMLElement).style.color='#9ca3af'; }}>
                  <Plus size={12}/> Add Section
                </button>
              )}
            </div>
            )}
          </div>

          {/* Footer */}
          <div style={{ borderTop:'1px solid #e8eaed', padding:'10px 18px', display:'flex', alignItems:'center', justifyContent:'space-between', background:'#fff', flexShrink:0 }}>
            <div style={{ display:'flex', gap:'16px' }}>
              {[{ icon:<FileText size={12}/>, label:`${totalQ} question${totalQ!==1?'s':''}` },{ icon:<Award size={12}/>, label:`${totalPts} pts` },{ icon:<Clock size={12}/>, label:`${dur} min` }].map(item=>(
                <div key={item.label} style={{ display:'flex', alignItems:'center', gap:'4px', fontSize:'12px', color:'#6b7280' }}><span style={{ color:'#9ca3af' }}>{item.icon}</span>{item.label}</div>
              ))}
            </div>
            {!readOnly && (
            <div style={{ display:'flex', gap:'8px', alignItems:'center' }}>
              {saved && <span style={{ fontSize:'11px', color:'#15803d', display:'flex', alignItems:'center', gap:'4px' }}><CheckCircle2 size={12}/> Saved</span>}
              <button onClick={() => void handleSave()} disabled={totalQ===0||saving}
                style={{ display:'flex', alignItems:'center', gap:'6px', padding:'8px 18px', borderRadius:'9px', border:'none', cursor:totalQ>0&&!saving?'pointer':'not-allowed', background:totalQ>0&&!saving?'#3b5bdb':'#e8eaed', color:totalQ>0&&!saving?'#fff':'#9ca3af', fontSize:'13px', fontWeight:600 }}>
                {saving ? <Loader2 size={12} style={{ animation:'spin 0.7s linear infinite' }}/> : <Save size={12}/>} Save Draft
              </button>
            </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   PUBLISH VIEW
═══════════════════════════════════════════════════════════════════════════ */
function PublishCard({ paper, onDelete, onSelectPublish, onEditTask, onViewTask, onRollback, isSelected }: {
  paper:Paper; onDelete:(id:string)=>void; onSelectPublish:()=>void; onEditTask?:(taskId:number)=>void;
  onViewTask?:(taskId:number)=>void; onRollback?:(id:string)=>Promise<boolean>; isSelected:boolean;
}) {
  const [confirmDel, setConfirmDel] = useState(false);
  const [confirmRollback, setConfirmRollback] = useState(false);
  const sc=STATUS_C[paper.status]; const se=SUBJ_EMOJI[paper.subject]??'📄';

  function handleEdit() {
    if (!/^\d+$/.test(paper.id)) {
      window.alert('Invalid task id.');
      return;
    }
    onEditTask?.(Number(paper.id));
  }
  function handleView() {
    if (!/^\d+$/.test(paper.id)) {
      window.alert('Invalid task id.');
      return;
    }
    onViewTask?.(Number(paper.id));
  }
  return (
    <div style={{ background:'#fff', border:`1.5px solid ${isSelected?'#93c5fd':'#e8eaed'}`, borderRadius:'12px', overflow:'hidden', boxShadow:isSelected?'0 0 0 3px rgba(59,91,219,0.10)':'none', transition:'all 0.15s' }}>
      <div style={{ display:'flex', alignItems:'center', gap:'12px', padding:'13px 15px' }}>
        <div style={{ width:'3px', height:'38px', borderRadius:'2px', background:sc.dot, flexShrink:0 }}/>
        <div style={{ fontSize:'20px', flexShrink:0 }}>{se}</div>
        <div style={{ flex:1, minWidth:0 }}>
          <div style={{ display:'flex', alignItems:'center', gap:'7px', marginBottom:'3px', flexWrap:'wrap' }}>
            <span style={{ fontSize:'13px', fontWeight:700, color:'#0f0f23', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', maxWidth:'300px' }}>{paper.title}</span>
            <span style={{ fontSize:'9px', fontWeight:700, padding:'2px 7px', borderRadius:'20px', background:sc.bg, color:sc.color, flexShrink:0 }}>{sc.label.toUpperCase()}</span>
            <span style={{ fontSize:'9px', fontWeight:600, padding:'2px 6px', borderRadius:'20px', background:'#f3f4f6', color:'#6b7280', flexShrink:0, textTransform:'uppercase' }}>{paper.kind}</span>
          </div>
          <div style={{ display:'flex', gap:'12px', flexWrap:'wrap' }}>
            {[{ icon:<FileText size={9}/>, v:`${paper.qCount}q` },{ icon:<Award size={9}/>, v:`${paper.totalPts}pts` },{ icon:<Clock size={9}/>, v:`${paper.duration}min` },{ icon:<Calendar size={9}/>, v:fmtDate(paper.createdAt) }].map(s=>(
              <span key={s.v} style={{ display:'flex', alignItems:'center', gap:'3px', fontSize:'10px', color:'#9ca3af' }}>{s.icon}{s.v}</span>
            ))}
            {paper.publishCfg && <span style={{ display:'flex', alignItems:'center', gap:'3px', fontSize:'10px', color:'#9ca3af' }}><Users size={9}/>{paper.publishCfg.classes.join(', ')}</span>}
          </div>
          {paper.note && <div style={{ fontSize:'10px', color:'#92400e', marginTop:'3px', display:'flex', alignItems:'center', gap:'3px' }}><AlertCircle size={9} style={{ color:'#f59e0b' }}/>{paper.note}</div>}
        </div>
        <div style={{ display:'flex', gap:'5px', flexShrink:0 }}>
          {confirmDel ? (
            <>
              <span style={{ fontSize:'11px', color:'#ef4444', alignSelf:'center' }}>Delete?</span>
              <button onClick={()=>setConfirmDel(false)} style={{ padding:'4px 9px', borderRadius:'6px', border:'1px solid #e8eaed', background:'#fff', color:'#374151', fontSize:'11px', cursor:'pointer' }}>Cancel</button>
              <button onClick={()=>onDelete(paper.id)} style={{ padding:'4px 9px', borderRadius:'6px', border:'none', background:'#fee2e2', color:'#b91c1c', fontSize:'11px', fontWeight:600, cursor:'pointer' }}>Delete</button>
            </>
          ) : confirmRollback ? (
            <>
              <span style={{ fontSize:'11px', color:'#92400e', alignSelf:'center' }}>Revert to draft?</span>
              <button type="button" onClick={()=>setConfirmRollback(false)} style={{ padding:'4px 9px', borderRadius:'6px', border:'1px solid #e8eaed', background:'#fff', color:'#374151', fontSize:'11px', cursor:'pointer' }}>Cancel</button>
              <button
                type="button"
                onClick={async () => {
                  if (!onRollback) return;
                  const ok = await onRollback(paper.id);
                  if (ok) setConfirmRollback(false);
                }}
                style={{ padding:'4px 9px', borderRadius:'6px', border:'none', background:'#fef3c7', color:'#92400e', fontSize:'11px', fontWeight:600, cursor:'pointer' }}
              >
                Confirm
              </button>
            </>
          ) : (
            <>
              <button type="button" onClick={()=>setConfirmDel(true)} style={{ display:'flex', alignItems:'center', padding:'6px 9px', borderRadius:'7px', border:'1px solid #fecaca', background:'#fff', color:'#ef4444', fontSize:'11px', cursor:'pointer' }}><Trash2 size={11}/></button>
              {paper.status==='draft' && (
                <>
                  <button type="button" onClick={handleEdit} style={{ display:'flex', alignItems:'center', gap:'3px', padding:'6px 10px', borderRadius:'7px', border:'1px solid #e8eaed', background:'#fff', color:'#374151', fontSize:'11px', cursor:'pointer' }}><Edit3 size={11}/> Edit</button>
                  <button type="button" onClick={onSelectPublish} style={{ display:'flex', alignItems:'center', gap:'4px', padding:'6px 13px', borderRadius:'7px', border:'none', background:isSelected?'#eff6ff':'#3b5bdb', color:isSelected?'#3b5bdb':'#fff', fontSize:'11px', fontWeight:600, cursor:'pointer' }}>
                    <Send size={11}/> {isSelected?'Cancel':'Publish'}
                  </button>
                </>
              )}
              {paper.status==='published' && (
                <>
                  <button type="button" onClick={handleView} style={{ display:'flex', alignItems:'center', gap:'3px', padding:'6px 12px', borderRadius:'7px', border:'1px solid #e8eaed', background:'#fff', color:'#374151', fontSize:'11px', cursor:'pointer' }}><Eye size={11}/> View</button>
                  <button type="button" onClick={()=>setConfirmRollback(true)} style={{ display:'flex', alignItems:'center', gap:'3px', padding:'6px 10px', borderRadius:'7px', border:'1px solid #fde68a', background:'#fffbeb', color:'#92400e', fontSize:'11px', fontWeight:600, cursor:'pointer' }}><RotateCcw size={11}/> Revert</button>
                </>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function PublishPanel({ paper, onClose, onPublish }: { paper:Paper; onClose:()=>void; onPublish:(cfg:PublishCfg)=>Promise<void> | void }) {
  const [assignKind,  setAssignKind]  = useState<AssignKind>('exam');
  const [classes,     setClasses]     = useState<string[]>([]);
  const [startDate,   setStartDate]   = useState('2026-04-10');
  const [endDate,     setEndDate]     = useState('2026-04-10');
  const [timeLimit,   setTimeLimit]   = useState(paper.duration);
  const [showResults, setShowResults] = useState(true);
  const [allowLate,   setAllowLate]   = useState(false);
  const [publishing,  setPublishing]  = useState(false);
  const [done,        setDone]        = useState(false);

  const ASSIGN_OPTS: Record<AssignKind,{ label:string; desc:string; emoji:string }> = {
    exam:     { label:'Exam',     emoji:'📝', desc:'One attempt, strict time limit' },
    quiz:     { label:'Quiz',     emoji:'⚡', desc:'Timed, may allow multiple attempts' },
    homework: { label:'Homework', emoji:'📚', desc:'Untimed, flexible submission window' },
  };
  function toggleClass(c: string) { setClasses(prev=>prev.includes(c)?prev.filter(x=>x!==c):[...prev,c]); }
  async function doPublish() {
    if (!classes.length) return;
    setPublishing(true);
    setDone(false);
    try {
      await onPublish({ assignKind, classes, startDate, endDate, timeLimit, showResults, allowLate });
      setDone(true);
      setTimeout(onClose, 900);
    } catch (e) {
      window.alert(e instanceof Error ? e.message : 'Publish failed');
    } finally {
      setPublishing(false);
    }
  }

  return (
    <div style={{ width:'320px', flexShrink:0, borderLeft:'1px solid #e8eaed', display:'flex', flexDirection:'column', background:'#fff', overflow:'hidden', height:'100%' }}>
      <div style={{ padding:'14px 16px', borderBottom:'1px solid #e8eaed', display:'flex', alignItems:'center', gap:'9px', flexShrink:0 }}>
        <div style={{ width:'32px', height:'32px', borderRadius:'8px', background:'#eff6ff', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
          <Send size={15} style={{ color:'#3b5bdb' }}/>
        </div>
        <div style={{ flex:1, minWidth:0 }}>
          <div style={{ fontSize:'13px', fontWeight:700, color:'#0f0f23' }}>Publish Task</div>
          <div style={{ fontSize:'10px', color:'#6b7280', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{paper.title}</div>
        </div>
        <button onClick={onClose} style={{ width:'24px', height:'24px', borderRadius:'6px', border:'none', cursor:'pointer', background:'transparent', color:'#9ca3af', display:'flex', alignItems:'center', justifyContent:'center' }}
          onMouseEnter={e=>{(e.currentTarget as HTMLElement).style.background='#f3f4f6';}}
          onMouseLeave={e=>{(e.currentTarget as HTMLElement).style.background='transparent';}}>
          <X size={13}/>
        </button>
      </div>
      <div style={{ flex:1, overflowY:'auto', padding:'14px 16px', display:'flex', flexDirection:'column', gap:'16px' }}>
        <div>
          <div style={{ fontSize:'10px', fontWeight:700, color:'#9ca3af', textTransform:'uppercase', letterSpacing:'0.07em', marginBottom:'7px' }}>Assignment Type</div>
          <div style={{ display:'flex', flexDirection:'column', gap:'5px' }}>
            {(Object.entries(ASSIGN_OPTS) as [AssignKind,typeof ASSIGN_OPTS[AssignKind]][]).map(([k,v])=>(
              <button key={k} onClick={()=>setAssignKind(k)} style={{ display:'flex', alignItems:'center', gap:'9px', padding:'8px 10px', borderRadius:'8px', border:`1.5px solid ${assignKind===k?'#3b5bdb':'#e8eaed'}`, background:assignKind===k?'#f0f4ff':'#fff', cursor:'pointer', textAlign:'left' }}>
                <span style={{ fontSize:'15px' }}>{v.emoji}</span>
                <div style={{ flex:1 }}>
                  <div style={{ fontSize:'12px', fontWeight:assignKind===k?700:500, color:assignKind===k?'#3b5bdb':'#374151' }}>{v.label}</div>
                  <div style={{ fontSize:'10px', color:'#9ca3af' }}>{v.desc}</div>
                </div>
                {assignKind===k && <Check size={13} style={{ color:'#3b5bdb' }}/>}
              </button>
            ))}
          </div>
        </div>
        <div>
          <div style={{ fontSize:'10px', fontWeight:700, color:'#9ca3af', textTransform:'uppercase', letterSpacing:'0.07em', marginBottom:'7px' }}>Assign to Classes</div>
          <div style={{ display:'flex', flexDirection:'column', gap:'3px' }}>
            {ALL_CLASSES.map(c=>(
              <button key={c} onClick={()=>toggleClass(c)} style={{ display:'flex', alignItems:'center', gap:'8px', padding:'6px 9px', borderRadius:'7px', border:`1px solid ${classes.includes(c)?'#bfdbfe':'#f3f4f6'}`, background:classes.includes(c)?'#eff6ff':'#fafafa', cursor:'pointer', textAlign:'left' }}>
                <div style={{ width:'15px', height:'15px', borderRadius:'4px', border:`2px solid ${classes.includes(c)?'#3b5bdb':'#d1d5db'}`, background:classes.includes(c)?'#3b5bdb':'#fff', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
                  {classes.includes(c) && <Check size={9} style={{ color:'#fff' }}/>}
                </div>
                <span style={{ fontSize:'12px', fontWeight:classes.includes(c)?600:400, color:classes.includes(c)?'#1d4ed8':'#374151' }}>{c}</span>
              </button>
            ))}
          </div>
          {classes.length===0 && <div style={{ fontSize:'10px', color:'#ef4444', marginTop:'4px' }}>Select at least one class.</div>}
        </div>
        <div>
          <div style={{ fontSize:'10px', fontWeight:700, color:'#9ca3af', textTransform:'uppercase', letterSpacing:'0.07em', marginBottom:'7px' }}>Schedule</div>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'7px' }}>
            {[{label:'Start Date',value:startDate,set:setStartDate},{label:'End Date',value:endDate,set:setEndDate}].map(f=>(
              <div key={f.label}>
                <div style={{ fontSize:'10px', color:'#6b7280', marginBottom:'3px' }}>{f.label}</div>
                <input type="date" value={f.value} onChange={e=>f.set(e.target.value)} style={{ width:'100%', boxSizing:'border-box', padding:'6px 9px', borderRadius:'7px', border:'1.5px solid #e8eaed', fontSize:'11px', outline:'none' }}/>
              </div>
            ))}
          </div>
        </div>
        {assignKind!=='homework' && (
          <div>
            <div style={{ fontSize:'10px', fontWeight:700, color:'#9ca3af', textTransform:'uppercase', letterSpacing:'0.07em', marginBottom:'7px' }}>Time Limit</div>
            <div style={{ display:'flex', alignItems:'center', gap:'7px' }}>
              <input type="number" value={timeLimit} min={5} max={360} onChange={e=>setTimeLimit(+e.target.value)} style={{ width:'64px', padding:'6px 9px', borderRadius:'7px', border:'1.5px solid #e8eaed', fontSize:'13px', textAlign:'center', outline:'none' }}/>
              <span style={{ fontSize:'12px', color:'#6b7280' }}>minutes</span>
            </div>
          </div>
        )}
        <div>
          <div style={{ fontSize:'10px', fontWeight:700, color:'#9ca3af', textTransform:'uppercase', letterSpacing:'0.07em', marginBottom:'7px' }}>Options</div>
          {[{ label:'Show results to students after submission', val:showResults, set:setShowResults },{ label:'Allow late submission', val:allowLate, set:setAllowLate }].map(opt=>(
            <button key={opt.label} onClick={()=>opt.set(!opt.val)} style={{ display:'flex', alignItems:'center', gap:'8px', padding:'6px 0', border:'none', background:'transparent', cursor:'pointer', width:'100%', textAlign:'left', marginBottom:'2px' }}>
              <div style={{ width:'16px', height:'16px', borderRadius:'4px', border:`2px solid ${opt.val?'#3b5bdb':'#d1d5db'}`, background:opt.val?'#3b5bdb':'#fff', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
                {opt.val && <Check size={10} style={{ color:'#fff' }}/>}
              </div>
              <span style={{ fontSize:'12px', color:'#374151' }}>{opt.label}</span>
            </button>
          ))}
        </div>
      </div>
      <div style={{ padding:'12px 16px', borderTop:'1px solid #e8eaed', flexShrink:0 }}>
        <button onClick={doPublish} disabled={!classes.length||publishing||done}
          style={{ width:'100%', padding:'11px', borderRadius:'9px', border:'none', cursor:classes.length&&!publishing?'pointer':'not-allowed', background:done?'#dcfce7':!classes.length?'#e8eaed':'#3b5bdb', color:done?'#15803d':!classes.length?'#9ca3af':'#fff', fontSize:'13px', fontWeight:700, display:'flex', alignItems:'center', justifyContent:'center', gap:'7px', transition:'background 0.2s' }}>
          {done ? <><CheckCircle2 size={15}/> Published!</> : publishing ? <><span style={{ width:'13px', height:'13px', borderRadius:'50%', border:'2px solid rgba(255,255,255,0.3)', borderTopColor:'#fff', display:'inline-block', animation:'spin 0.7s linear infinite' }}/> Publishing…</> : <><Send size={14}/> Publish Now</>}
        </button>
      </div>
    </div>
  );
}

function PublishView({ papers, onDelete, onPublish, onNewPaper, onEditTask, onViewTask, onRollback }: { papers:Paper[]; onDelete:(id:string)=>void; onPublish:(id:string,cfg:PublishCfg)=>void; onNewPaper:()=>void; onEditTask:(taskId:number)=>void; onViewTask:(taskId:number)=>void; onRollback:(id:string)=>Promise<boolean> }) {
  /** Publish tab lists Draft / Published only; Closed is omitted */
  const publishPapers = papers.filter((p) => p.status === 'draft' || p.status === 'published');
  const [filter,   setFilter]   = useState<'all' | 'draft' | 'published'>('all');
  const [selPaper, setSelPaper] = useState<Paper|null>(null);

  const displayed = filter === 'all' ? publishPapers : publishPapers.filter((p) => p.status === filter);
  const cnt = {
    all: publishPapers.length,
    draft: publishPapers.filter((p) => p.status === 'draft').length,
    published: publishPapers.filter((p) => p.status === 'published').length,
  };

  return (
    <div style={{ display:'flex', height:'100%', overflow:'hidden' }}>
      <div style={{ flex:1, display:'flex', flexDirection:'column', overflow:'hidden' }}>
        <div style={{ padding:'12px 20px', borderBottom:'1px solid #e8eaed', display:'flex', alignItems:'center', gap:'10px', flexShrink:0, background:'#fafafa' }}>
          <div style={{ display:'flex', background:'#f3f4f6', borderRadius:'8px', padding:'2px' }}>
            {([['all', `All (${cnt.all})`], ['draft', `Drafts (${cnt.draft})`], ['published', `Published (${cnt.published})`]] as [string, string][]).map(([k, l]) => (
              <React.Fragment key={k}>
                <Pill label={l} active={filter === k} onClick={() => setFilter(k as typeof filter)}/>
              </React.Fragment>
            ))}
          </div>
          <button onClick={onNewPaper} style={{ marginLeft:'auto', display:'flex', alignItems:'center', gap:'5px', padding:'7px 15px', borderRadius:'8px', border:'none', cursor:'pointer', background:'#3b5bdb', color:'#fff', fontSize:'12px', fontWeight:600 }}>
            <ChevronLeft size={12}/> Back to Assemble
          </button>
        </div>
        <div style={{ flex:1, overflowY:'auto', padding:'14px 20px', display:'flex', flexDirection:'column', gap:'8px' }}>
          {displayed.length===0 ? (
            <div style={{ textAlign:'center', padding:'60px 20px', color:'#9ca3af' }}>
              <FileText size={32} style={{ opacity:0.18, display:'block', margin:'0 auto 10px' }}/>
              <div style={{ fontSize:'13px' }}>No papers in this category</div>
            </div>
          ) : displayed.map(paper=>(
            <React.Fragment key={paper.id}>
              <PublishCard paper={paper} isSelected={selPaper?.id===paper.id} onDelete={onDelete} onEditTask={onEditTask} onViewTask={onViewTask} onRollback={onRollback} onSelectPublish={()=>setSelPaper(p=>p?.id===paper.id?null:paper)}/>
            </React.Fragment>
          ))}
        </div>
      </div>
      {selPaper && <PublishPanel paper={selPaper} onClose={()=>setSelPaper(null)} onPublish={async (cfg)=>{ await onPublish(selPaper.id,cfg); setSelPaper(null); }}/>}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   GRADE VIEW
═══════════════════════════════════════════════════════════════════════════ */
function GradeView({ papers, subs, onUpdateSub }: { papers:Paper[]; subs:StudentSub[]; onUpdateSub:(s:StudentSub)=>void }) {
  const gradable = papers.filter(p=>p.status==='published'||p.status==='closed');
  const [selPaperId, setSelPaperId] = useState<string>(gradable[0]?.id??'');
  const [selSubId,   setSelSubId]   = useState<string|null>(null);
  const [saIdx,      setSaIdx]      = useState(0);
  const [overrides,  setOverrides]  = useState<Record<string,{ pts:string; note:string }>>({});

  const paperSubs = subs.filter(s=>s.paperId===selPaperId);
  const selSub    = paperSubs.find(s=>s.id===selSubId)??null;
  const saResps   = selSub ? selSub.responses.filter(r=>r.type==='Short Answer'||r.type==='Essay') : [];
  const curSA     = saResps[saIdx]??null;
  const overKey   = curSA ? `${selSubId}_${curSA.qId}` : '';

  const pending   = paperSubs.filter(s=>s.status==='pending_sa').length;
  const aiDone    = paperSubs.filter(s=>s.status==='ai_graded').length;
  const completed = paperSubs.filter(s=>s.status==='fully_graded').length;
  const allGraded = saResps.length>0 && saResps.every((_,i)=>!!overrides[`${selSubId}_${saResps[i].qId}`]);

  const SUB_STATUS_C: Record<SubStatus,{ label:string; bg:string; color:string; Icon:typeof AlertCircle }> = {
    pending_sa:   { label:'SA Pending', bg:'#fef3c7', color:'#d97706', Icon:AlertCircle },
    ai_graded:    { label:'AI Graded',  bg:'#dbeafe', color:'#1d4ed8', Icon:Zap },
    fully_graded: { label:'Completed',  bg:'#dcfce7', color:'#15803d', Icon:CheckCircle2 },
  };

  function acceptAI() {
    if (!curSA) return;
    setOverrides(prev=>({...prev,[overKey]:{ pts:String(curSA.aiPts??0), note:'' }}));
    if (saIdx<saResps.length-1) setSaIdx(i=>i+1); else finishGrading();
  }
  function saveNext() { if (saIdx<saResps.length-1) setSaIdx(i=>i+1); else finishGrading(); }
  function finishGrading() {
    if (!selSub) return;
    onUpdateSub({...selSub, status:'fully_graded', teacherTotal:selSub.aiTotal});
  }

  return (
    <div style={{ display:'flex', height:'100%', overflow:'hidden' }}>
      {/* Panel 1: Papers */}
      <div style={{ width:'230px', flexShrink:0, borderRight:'1px solid #e8eaed', display:'flex', flexDirection:'column', overflow:'hidden', background:'#fff' }}>
        <div style={{ padding:'12px 12px 10px', borderBottom:'1px solid #f3f4f6', flexShrink:0 }}>
          <div style={{ fontSize:'10px', fontWeight:700, color:'#9ca3af', textTransform:'uppercase', letterSpacing:'0.07em', marginBottom:'9px' }}>Grading Center</div>
          {[{ label:'SA Pending', val:subs.filter(s=>s.status==='pending_sa').length, color:'#d97706', bg:'#fffbeb', Icon:AlertCircle },
            { label:'AI Graded',  val:subs.filter(s=>s.status!=='pending_sa').length, color:'#3b5bdb', bg:'#eff6ff', Icon:Zap },
            { label:'Completed',  val:subs.filter(s=>s.status==='fully_graded').length, color:'#059669', bg:'#ecfdf5', Icon:CheckCircle2 }].map(s=>{
            const I=s.Icon;
            return (
              <div key={s.label} style={{ display:'flex', alignItems:'center', gap:'7px', padding:'5px 7px', borderRadius:'7px', background:s.bg, marginBottom:'4px' }}>
                <I size={12} style={{ color:s.color, flexShrink:0 }}/>
                <div><div style={{ fontSize:'14px', fontWeight:700, color:s.color, lineHeight:1 }}>{s.val}</div><div style={{ fontSize:'9px', color:'#6b7280' }}>{s.label}</div></div>
              </div>
            );
          })}
        </div>
        <div style={{ flex:1, overflowY:'auto', padding:'7px' }}>
          {gradable.length===0 ? (
            <div style={{ fontSize:'11px', color:'#9ca3af', textAlign:'center', padding:'24px 8px' }}>No published papers</div>
          ) : gradable.map(p=>{
            const psubs=subs.filter(s=>s.paperId===p.id);
            const pend=psubs.filter(s=>s.status==='pending_sa').length;
            const done=psubs.filter(s=>s.status==='fully_graded').length;
            const pct=psubs.length>0?Math.round(done/psubs.length*100):0;
            const sel=selPaperId===p.id;
            return (
              <button key={p.id} onClick={()=>{ setSelPaperId(p.id); setSelSubId(null); setSaIdx(0); }}
                style={{ width:'100%', padding:'9px', borderRadius:'8px', border:`1px solid ${sel?'#bfdbfe':'transparent'}`, background:sel?'#f0f4ff':'transparent', cursor:'pointer', textAlign:'left', marginBottom:'3px' }}
                onMouseEnter={e=>{ if(!sel)(e.currentTarget as HTMLElement).style.background='#f9fafb'; }}
                onMouseLeave={e=>{ if(!sel)(e.currentTarget as HTMLElement).style.background='transparent'; }}>
                <div style={{ display:'flex', alignItems:'center', gap:'6px', marginBottom:'5px' }}>
                  <span style={{ fontSize:'15px' }}>{SUBJ_EMOJI[p.subject]??'📄'}</span>
                  <span style={{ fontSize:'11px', fontWeight:700, color:sel?'#3b5bdb':'#0f0f23', flex:1, lineHeight:1.3 }}>{clamp(p.title,32)}</span>
                  {pend>0 && <span style={{ fontSize:'9px', fontWeight:700, padding:'2px 5px', borderRadius:'4px', background:'#fef3c7', color:'#d97706', flexShrink:0 }}>{pend} SA</span>}
                </div>
                <div style={{ fontSize:'10px', color:'#9ca3af', marginBottom:'5px' }}>{psubs.length} students · {done}/{psubs.length} graded</div>
                <div style={{ height:'3px', borderRadius:'2px', background:'#e8eaed', overflow:'hidden' }}>
                  <div style={{ height:'100%', width:`${pct}%`, background:pct===100?'#10b981':'#3b5bdb', borderRadius:'2px', transition:'width 0.4s' }}/>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Panel 2: Students */}
      <div style={{ width:'238px', flexShrink:0, borderRight:'1px solid #e8eaed', display:'flex', flexDirection:'column', overflow:'hidden', background:'#fff' }}>
        <div style={{ padding:'9px 12px', borderBottom:'1px solid #f3f4f6', flexShrink:0, display:'flex', alignItems:'center', gap:'6px' }}>
          <Users size={12} style={{ color:'#374151' }}/>
          <span style={{ fontSize:'12px', fontWeight:700, color:'#0f0f23' }}>Students</span>
          <span style={{ fontSize:'10px', color:'#9ca3af', marginLeft:'auto' }}>{paperSubs.length} submitted</span>
        </div>
        <div style={{ display:'flex', padding:'7px 9px', gap:'5px', borderBottom:'1px solid #f3f4f6', flexShrink:0 }}>
          {[{ l:'SA Pend',v:pending,c:'#d97706',bg:'#fef9c3' },{ l:'AI Done',v:aiDone,c:'#3b5bdb',bg:'#dbeafe' },{ l:'Done',v:completed,c:'#059669',bg:'#dcfce7' }].map(s=>(
            <div key={s.l} style={{ flex:1, textAlign:'center', padding:'4px', borderRadius:'6px', background:s.bg }}>
              <div style={{ fontSize:'13px', fontWeight:700, color:s.c }}>{s.v}</div>
              <div style={{ fontSize:'9px', color:'#6b7280' }}>{s.l}</div>
            </div>
          ))}
        </div>
        <div style={{ flex:1, overflowY:'auto', padding:'5px' }}>
          {paperSubs.length===0 ? (
            <div style={{ fontSize:'11px', color:'#9ca3af', textAlign:'center', padding:'24px 8px' }}>No submissions yet</div>
          ) : paperSubs.map(sub=>{
            const sel=selSubId===sub.id;
            const sc=SUB_STATUS_C[sub.status]; const I=sc.Icon;
            return (
              <button key={sub.id} onClick={()=>{ setSelSubId(sub.id); setSaIdx(0); }}
                style={{ width:'100%', padding:'8px 9px', borderRadius:'8px', border:`1px solid ${sel?'#bfdbfe':'transparent'}`, background:sel?'#f0f4ff':'transparent', cursor:'pointer', textAlign:'left', marginBottom:'2px' }}
                onMouseEnter={e=>{ if(!sel)(e.currentTarget as HTMLElement).style.background='#f9fafb'; }}
                onMouseLeave={e=>{ if(!sel)(e.currentTarget as HTMLElement).style.background='transparent'; }}>
                <div style={{ display:'flex', alignItems:'center', gap:'7px' }}>
                  <span style={{ fontSize:'17px' }}>{sub.avatar}</span>
                  <div style={{ flex:1, minWidth:0 }}>
                    <div style={{ fontSize:'12px', fontWeight:sel?700:500, color:sel?'#3b5bdb':'#0f0f23' }}>{sub.name}</div>
                    <div style={{ fontSize:'9px', color:'#9ca3af' }}>#{sub.studentId}</div>
                  </div>
                  <div style={{ textAlign:'right', flexShrink:0 }}>
                    <div style={{ fontSize:'11px', fontWeight:700, color:sub.teacherTotal!=null?'#15803d':'#374151' }}>
                      {sub.teacherTotal??sub.aiTotal}<span style={{ fontSize:'9px', color:'#9ca3af', fontWeight:400 }}>/{sub.maxPts}</span>
                    </div>
                    <div style={{ display:'flex', alignItems:'center', gap:'2px', justifyContent:'flex-end', padding:'1px 5px', borderRadius:'4px', background:sc.bg, color:sc.color, fontSize:'9px', fontWeight:600 }}>
                      <I size={8}/> {sc.label}
                    </div>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Panel 3: Response Reviewer */}
      <div style={{ flex:1, display:'flex', flexDirection:'column', overflow:'hidden', background:'#f7f8fb' }}>
        {!selSub ? (
          <div style={{ flex:1, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', color:'#9ca3af', gap:'10px' }}>
            <MessageSquare size={36} style={{ opacity:0.14 }}/>
            <div style={{ fontSize:'13px', fontWeight:600, color:'#6b7280' }}>Select a student to begin review</div>
            <div style={{ fontSize:'11px', maxWidth:'240px', textAlign:'center' }}>AI grades MCQ, T/F, and Fill-blank automatically. SA and Essay require your review.</div>
          </div>
        ) : (
          <>
            <div style={{ padding:'11px 18px', borderBottom:'1px solid #e8eaed', display:'flex', alignItems:'center', gap:'10px', flexShrink:0, background:'#fff' }}>
              <span style={{ fontSize:'20px' }}>{selSub.avatar}</span>
              <div style={{ flex:1 }}>
                <div style={{ fontSize:'13px', fontWeight:700, color:'#0f0f23' }}>{selSub.name} <span style={{ fontSize:'11px', color:'#9ca3af', fontWeight:400 }}>#{selSub.studentId}</span></div>
                <div style={{ fontSize:'11px', color:'#6b7280' }}>Submitted {fmtDate(selSub.submittedAt)} · AI Total: {selSub.aiTotal}/{selSub.maxPts}</div>
              </div>
              {selSub.status==='pending_sa' && <span style={{ fontSize:'10px', fontWeight:600, padding:'4px 9px', borderRadius:'7px', background:'#fef3c7', color:'#d97706', display:'flex', alignItems:'center', gap:'4px' }}><AlertCircle size={10}/> {saResps.length}q pending</span>}
              {selSub.status==='fully_graded' && <span style={{ fontSize:'10px', fontWeight:600, padding:'4px 9px', borderRadius:'7px', background:'#dcfce7', color:'#15803d', display:'flex', alignItems:'center', gap:'4px' }}><CheckCircle2 size={10}/> Fully Reviewed</span>}
            </div>
            <div style={{ flex:1, overflowY:'auto', padding:'14px 18px', display:'flex', flexDirection:'column', gap:'12px' }}>
              <div style={{ background:'#fff', borderRadius:'12px', border:'1px solid #e8eaed', padding:'13px 15px' }}>
                <div style={{ fontSize:'11px', fontWeight:700, color:'#374151', marginBottom:'9px', display:'flex', alignItems:'center', gap:'5px' }}><Zap size={12} style={{ color:'#3b5bdb' }}/> Auto-graded by AI</div>
                <div style={{ display:'flex', flexDirection:'column', gap:'4px' }}>
                  {selSub.responses.filter(r=>r.type==='MCQ'||r.type==='True/False'||r.type==='Fill-blank').map((r,i)=>{
                    const tc=TYPE_C[r.type];
                    return (
                      <div key={r.qId} style={{ display:'flex', alignItems:'center', gap:'9px', padding:'5px 9px', borderRadius:'7px', background:r.isCorrect?'#f0fdf4':'#fef2f2' }}>
                        <span style={{ fontSize:'9px', fontWeight:700, padding:'1px 6px', borderRadius:'4px', background:tc.bg, color:tc.color, flexShrink:0 }}>Q{i+1}</span>
                        <span style={{ flex:1, fontSize:'11px', color:'#374151' }}>{clamp(r.prompt,62)}</span>
                        <span style={{ fontSize:'10px', fontWeight:600, color:'#6b7280', flexShrink:0 }}>"{clamp(r.studentAns,16)}"</span>
                        <span style={{ fontSize:'11px', fontWeight:700, color:r.isCorrect?'#15803d':'#b91c1c', flexShrink:0 }}>{r.aiPts}/{r.maxPts}</span>
                        {r.isCorrect ? <CheckCircle2 size={11} style={{ color:'#10b981', flexShrink:0 }}/> : <X size={11} style={{ color:'#ef4444', flexShrink:0 }}/>}
                      </div>
                    );
                  })}
                </div>
              </div>

              {saResps.length>0 && (
                <div style={{ background:'#fff', borderRadius:'12px', border:'1px solid #e8eaed', overflow:'hidden' }}>
                  <div style={{ padding:'10px 15px', borderBottom:'1px solid #f3f4f6', display:'flex', alignItems:'center', gap:'9px', background:'#f8f9fb' }}>
                    <MessageSquare size={13} style={{ color:'#374151' }}/>
                    <span style={{ fontSize:'12px', fontWeight:700, color:'#0f0f23', flex:1 }}>{curSA?.type==='Essay'?'Essay':'Short Answer'} Review</span>
                    <span style={{ fontSize:'11px', color:'#6b7280' }}>{saIdx+1}/{saResps.length}</span>
                    <button onClick={()=>setSaIdx(i=>Math.max(0,i-1))} disabled={saIdx===0} style={{ width:'24px', height:'24px', borderRadius:'6px', border:'1px solid #e8eaed', background:'#fff', cursor:saIdx>0?'pointer':'not-allowed', display:'flex', alignItems:'center', justifyContent:'center', color:'#6b7280', opacity:saIdx===0?0.4:1 }}><ChevronLeft size={12}/></button>
                    <button onClick={()=>setSaIdx(i=>Math.min(saResps.length-1,i+1))} disabled={saIdx>=saResps.length-1} style={{ width:'24px', height:'24px', borderRadius:'6px', border:'1px solid #e8eaed', background:'#fff', cursor:saIdx<saResps.length-1?'pointer':'not-allowed', display:'flex', alignItems:'center', justifyContent:'center', color:'#6b7280', opacity:saIdx>=saResps.length-1?0.4:1 }}><ChevronRight size={12}/></button>
                  </div>
                  {curSA && (
                    <div style={{ padding:'14px 15px' }}>
                      <div style={{ marginBottom:'12px' }}>
                        <div style={{ fontSize:'10px', fontWeight:700, color:'#9ca3af', textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:'5px' }}>Question</div>
                        <div style={{ fontSize:'12px', color:'#0f0f23', lineHeight:1.65, padding:'9px 12px', background:'#f8f9fb', borderRadius:'8px', borderLeft:'3px solid #3b5bdb' }}>{curSA.prompt}</div>
                        <div style={{ display:'flex', gap:'5px', marginTop:'5px' }}><TypeBadge t={curSA.type}/><span style={{ fontSize:'10px', color:'#6b7280', padding:'2px 7px', borderRadius:'20px', background:'#f3f4f6' }}>Max {curSA.maxPts} pts</span></div>
                      </div>
                      <div style={{ marginBottom:'12px' }}>
                        <div style={{ fontSize:'10px', fontWeight:700, color:'#9ca3af', textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:'5px' }}>Student's Answer</div>
                        <div style={{ fontSize:'12px', color:'#374151', lineHeight:1.7, padding:'10px 13px', background:'#f9fafb', borderRadius:'8px', border:'1px solid #f0f2f5', maxHeight:'130px', overflowY:'auto' }}>{curSA.studentAns}</div>
                      </div>
                      <div style={{ marginBottom:'14px', padding:'11px 13px', background:'#eff6ff', borderRadius:'10px', border:'1px solid #bfdbfe' }}>
                        <div style={{ display:'flex', alignItems:'center', gap:'6px', marginBottom:'6px' }}>
                          <Zap size={12} style={{ color:'#3b5bdb' }}/>
                          <span style={{ fontSize:'11px', fontWeight:700, color:'#1d4ed8' }}>AI Suggestion</span>
                          <span style={{ marginLeft:'auto', fontSize:'15px', fontWeight:700, color:'#1d4ed8' }}>{curSA.aiPts}<span style={{ fontSize:'10px', color:'#6b7280', fontWeight:400 }}>/{curSA.maxPts} pts</span></span>
                        </div>
                        <p style={{ margin:0, fontSize:'11px', color:'#374151', lineHeight:1.65, fontStyle:'italic' }}>{curSA.aiNote}</p>
                      </div>
                      <div>
                        <div style={{ fontSize:'10px', fontWeight:700, color:'#9ca3af', textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:'7px' }}>Your Review</div>
                        <div style={{ display:'flex', gap:'9px', marginBottom:'8px' }}>
                          <div>
                            <div style={{ fontSize:'11px', color:'#6b7280', marginBottom:'3px' }}>Score Override</div>
                            <div style={{ display:'flex', alignItems:'center', gap:'5px' }}>
                              <input type="number" min={0} max={curSA.maxPts}
                                value={overrides[overKey]?.pts ?? curSA.aiPts ?? ''}
                                onChange={e=>setOverrides(prev=>({...prev,[overKey]:{ pts:e.target.value, note:prev[overKey]?.note??'' }}))}
                                placeholder={String(curSA.aiPts??0)}
                                style={{ width:'52px', padding:'6px 8px', borderRadius:'7px', border:'1.5px solid #e8eaed', fontSize:'13px', textAlign:'center', outline:'none' }}/>
                              <span style={{ fontSize:'11px', color:'#6b7280' }}>/{curSA.maxPts}</span>
                            </div>
                          </div>
                          <div style={{ flex:1 }}>
                            <div style={{ fontSize:'11px', color:'#6b7280', marginBottom:'3px' }}>Feedback (optional)</div>
                            <textarea
                              value={overrides[overKey]?.note??''}
                              onChange={e=>setOverrides(prev=>({...prev,[overKey]:{ pts:prev[overKey]?.pts??String(curSA.aiPts??0), note:e.target.value }}))}
                              placeholder="Write feedback for student…" rows={2}
                              style={{ width:'100%', boxSizing:'border-box', padding:'6px 9px', borderRadius:'7px', border:'1.5px solid #e8eaed', fontSize:'11px', outline:'none', resize:'none', fontFamily:'inherit' }}/>
                          </div>
                        </div>
                        <div style={{ display:'flex', gap:'7px' }}>
                          <button onClick={acceptAI} style={{ display:'flex', alignItems:'center', gap:'5px', padding:'7px 14px', borderRadius:'8px', border:'none', cursor:'pointer', background:'#dcfce7', color:'#15803d', fontSize:'12px', fontWeight:600 }}><CheckCircle2 size={12}/> Accept AI Score</button>
                          <button onClick={saveNext} style={{ display:'flex', alignItems:'center', gap:'5px', padding:'7px 16px', borderRadius:'8px', border:'none', cursor:'pointer', background:'#3b5bdb', color:'#fff', fontSize:'12px', fontWeight:600 }}><Save size={12}/> {saIdx<saResps.length-1?'Save & Next':'Finish Review'}</button>
                        </div>
                        {saResps.length>1 && (
                          <div style={{ display:'flex', gap:'5px', marginTop:'11px', justifyContent:'center' }}>
                            {saResps.map((r,i)=>{ const rev=!!overrides[`${selSubId}_${r.qId}`]; return <div key={r.qId} onClick={()=>setSaIdx(i)} style={{ width:'7px', height:'7px', borderRadius:'50%', cursor:'pointer', background:i===saIdx?'#3b5bdb':rev?'#10b981':'#d1d5db', transition:'background 0.15s' }}/>; })}
                          </div>
                        )}
                        {allGraded && selSub.status!=='fully_graded' && (
                          <button onClick={finishGrading} style={{ width:'100%', marginTop:'12px', padding:'9px', borderRadius:'9px', border:'none', cursor:'pointer', background:'#059669', color:'#fff', fontSize:'12px', fontWeight:700, display:'flex', alignItems:'center', justifyContent:'center', gap:'7px' }}>
                            <Star size={13}/> Mark as Fully Graded
                          </button>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )}
              {saResps.length===0 && (
                <div style={{ background:'#fff', borderRadius:'12px', border:'1px solid #e8eaed', padding:'22px', textAlign:'center' }}>
                  <CheckCircle2 size={26} style={{ color:'#10b981', display:'block', margin:'0 auto 8px' }}/>
                  <div style={{ fontSize:'12px', fontWeight:600, color:'#374151' }}>All responses auto-graded by AI</div>
                  <div style={{ fontSize:'11px', color:'#9ca3af', marginTop:'2px' }}>No short-answer or essay questions.</div>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   ROOT
═══════════════════════════════════════════════════════════════════════════ */
export default function AssessmentGrading() {
  const queryClient = useQueryClient();
  const [tab,    setTab]    = useState<StudioTab>('assemble');
  const [editingTaskId, setEditingTaskId] = useState<number | null>(null);
  /** 查看已发布任务：仅浏览 Assemble 内容，不可改题、不可保存 */
  const [assembleReadOnly, setAssembleReadOnly] = useState(false);

  const {
    data: tasksRes,
    isPending: tasksPending,
    isError: tasksIsError,
  } = useQuery({
    queryKey: teacherKeys.tasksList(1, 100),
    queryFn: () => fetchTaskListApi({ page: 1, page_size: 100 }),
  });

  const papers = useMemo(
    () => (tasksRes?.items ?? []).map(mapTaskListItemToPaper),
    [tasksRes],
  );

  /** loading: 尚无数据 · api: 有任务 · api_empty: 成功但 0 条 · error: 请求失败 */
  const papersListSource: 'loading' | 'api' | 'api_empty' | 'error' = tasksIsError
    ? 'error'
    : tasksPending
      ? 'loading'
      : papers.length > 0
        ? 'api'
        : 'api_empty';

  const reloadTasks = React.useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: ['teacher', 'tasks'] });
  }, [queryClient]);

  const draftCount   = papers.filter(p=>p.status==='draft').length;

  async function deletePaper(id: string) {
    const n = Number(id);
    if (!Number.isFinite(n)) return;
    try {
      await deleteTaskApi(n);
      await reloadTasks();
    } catch (e) {
      window.alert(e instanceof Error ? e.message : 'Delete failed');
    }
  }

  async function publishPaper(id: string, cfg: PublishCfg) {
    const n = Number(id);
    if (!Number.isFinite(n)) return;
    try {
      await publishTaskApi(n);
      await reloadTasks();
    } catch (e) {
      window.alert(e instanceof Error ? e.message : 'Publish failed');
      throw e;
    }
  }

  async function rollbackTask(id: string): Promise<boolean> {
    const n = Number(id);
    if (!Number.isFinite(n)) return false;
    try {
      await unpublishTaskApi(n);
      await reloadTasks();
      toast.success('已恢复为草稿，可在列表中点击 Edit 继续编辑');
      return true;
    } catch (e) {
      const raw = e instanceof Error ? e.message : 'Revert failed';
      const msg =
        raw === 'Not Found' || raw.includes('Not Found')
          ? '无法回滚：接口返回 404。若刚更新过代码，请重启后端 API（uvicorn）后再试。'
          : raw;
      toast.error(msg);
      return false;
    }
  }

  return (
    <div style={{ display:'flex', flexDirection:'column', height:'calc(100vh - 48px)', overflow:'hidden', fontFamily:'-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif', background:'#fff' }}>
      <div style={{ background:'#fff', borderBottom:'1px solid #e8eaed', flexShrink:0 }}>
        <div style={{ padding:'14px 24px 0', display:'flex', alignItems:'flex-end', gap:'20px' }}>
          <div style={{ paddingBottom:'12px' }}>
            <div style={{ fontSize:'16px', fontWeight:700, color:'#0f0f23', marginBottom:'2px' }}>Task Publishing</div>
            <div style={{ fontSize:'11px', color:'#9ca3af' }}>
              Assemble tasks · Publish to students · Separate from the exam paper library
              {papersListSource === 'loading' && (
                <span style={{ marginLeft: '8px', color: '#6b7280' }}>Loading…</span>
              )}
              {papersListSource === 'error' && (
                <span style={{ marginLeft: '8px', color: '#b91c1c' }}>Failed to load</span>
              )}
              {papersListSource === 'api' && (
                <span style={{ marginLeft: '8px', color: '#15803d' }}>Loaded</span>
              )}
            </div>
          </div>
          <StudioTabBar tab={tab} setTab={setTab} draftCount={draftCount}/>
        </div>
      </div>
      <div style={{ flex:1, overflow:'hidden', display:'flex', flexDirection:'column', minHeight:0 }}>
        {/* Assemble / Publish 双面板常驻，仅用 display 切换，避免每次点 Publish 卸载再挂载导致重绘与重复请求感知 */}
        <div style={{ flex:1, overflow:'hidden', display:tab==='assemble'?'flex':'none', flexDirection:'column', minHeight:0 }}>
          <AssembleView
            editingTaskId={editingTaskId}
            readOnly={assembleReadOnly}
            onExitReadOnly={() => { setAssembleReadOnly(false); setEditingTaskId(null); setTab('publish'); }}
            onSaved={() => { void reloadTasks(); }}
            onTaskCreated={(taskId) => { setEditingTaskId(taskId); setAssembleReadOnly(false); }}
          />
        </div>
        <div style={{ flex:1, overflow:'hidden', display:tab==='publish'?'flex':'none', flexDirection:'column', minHeight:0 }}>
          <PublishView
            papers={papers}
            onDelete={deletePaper}
            onPublish={publishPaper}
            onNewPaper={() => { setEditingTaskId(null); setAssembleReadOnly(false); setTab('assemble'); }}
            onEditTask={(taskId) => { setEditingTaskId(taskId); setAssembleReadOnly(false); setTab('assemble'); }}
            onViewTask={(taskId) => { setEditingTaskId(taskId); setAssembleReadOnly(true); setTab('assemble'); }}
            onRollback={rollbackTask}
          />
        </div>
      </div>
      <style>{`@keyframes spin { to { transform:rotate(360deg); } }`}</style>
    </div>
  );
}
