import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Filter, Search, Eye, Download, FileText, Clock,
  Star, Calendar, BookOpen, ChevronDown, X, Target, BarChart2,
  Upload, Send, Pencil, MoreHorizontal, Trash2, RotateCcw,
} from 'lucide-react';
import { CustomSelect } from '../../../components/teacher/CustomSelect';
import {
  downloadPaperExportApi,
  fetchPaperListApi,
  fetchPaperDetailApi,
  publishPaperApi,
  unpublishPaperApi,
  deletePaperApi,
  type BlobProgress,
  type PaperDetailDto,
  type PaperExportFormat,
  type PaperListItemDto,
} from '../../../utils/paperApi';
import { teacherKeys } from '../../../query/teacherKeys';

/* ─── Types ────────────────────────────────────────────────────── */
interface Paper {
  id: string;
  title: string;
  publisher: string;
  grade: string;
  subject: string;
  semester: string;
  type: string;
  totalScore: number;
  durationMin: number;
  questionCount: number;
  quality: number;   // 0-100
  status: 'published' | 'draft' | 'closed';
  isOwner: boolean;
  ownerKnown: boolean;
  createdAt: string;
  textbook: string;
  /** True when DB stores an imported source PDF (optional download format). */
  hasSourcePdf: boolean;
  sections: Section[];
}

interface Section {
  title: string;
  type: string;
  count: number;
  scoreEach: number;
  questions: Question[];
}

interface Question {
  n: number;
  text: string;
  options?: string[];
  answer?: string;
}

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString('en-US');
}

function mapListItemToPaper(item: PaperListItemDto): Paper {
  return {
    id: String(item.paper_id),
    title: item.title,
    publisher: item.course_name,
    grade: item.grade,
    subject: item.subject,
    semester: item.semester || '-',
    type: item.exam_type,
    totalScore: item.total_score,
    durationMin: item.duration_min,
    questionCount: item.question_count,
    quality: item.quality_score ?? 0,
    status: item.status,
    isOwner: item.is_owner === true,
    ownerKnown: item.is_owner !== undefined,
    createdAt: formatDate(item.created_at),
    textbook: '-',
    hasSourcePdf: item.has_source_pdf ?? false,
    sections: [],
  };
}

function mapDetailToPaper(detail: PaperDetailDto): Paper {
  return {
    id: String(detail.paper_id),
    title: detail.title,
    publisher: detail.course_name,
    grade: detail.grade,
    subject: detail.subject,
    semester: detail.semester || '-',
    type: detail.exam_type,
    totalScore: detail.total_score,
    durationMin: detail.duration_min,
    questionCount: detail.question_count,
    quality: detail.quality_score ?? 0,
    status: detail.status,
    isOwner: detail.is_owner === true,
    ownerKnown: true,
    createdAt: formatDate(detail.created_at),
    textbook: '-',
    hasSourcePdf: detail.has_source_pdf ?? false,
    sections: detail.sections.map((sec) => ({
      title: sec.title,
      type: sec.question_type,
      count: sec.question_count,
      scoreEach: sec.score_each,
      questions: sec.questions.map((q) => ({
        n: q.order,
        text: q.prompt,
        options: q.options?.map((o) => `${o.key}. ${o.text}`),
      })),
    })),
  };
}

/* ─── Sub-components ─────────────────────────────────────────────── */
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

function QualityBar({ score }: { score: number }) {
  const color = score >= 90 ? '#16a34a' : score >= 80 ? '#3b5bdb' : score >= 70 ? '#d97706' : '#dc2626';
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
      <div style={{ flex: 1, height: '5px', background: '#f0f0f0', borderRadius: '99px', overflow: 'hidden' }}>
        <div style={{ width: `${score}%`, height: '100%', background: color, borderRadius: '99px', transition: 'width 0.3s' }} />
      </div>
      <span style={{ fontSize: '13px', fontWeight: 700, color, minWidth: '28px', textAlign: 'right' }}>{score}</span>
    </div>
  );
}

const EXPORT_OPTIONS: { id: PaperExportFormat; title: string; desc: string }[] = [
  { id: 'html', title: 'HTML 试卷', desc: '可在浏览器中打开、打印（版式与页面一致）' },
  { id: 'pdf', title: 'PDF', desc: '无原始PDF时将按HTML样式渲染生成（可能为图片型PDF）' },
  { id: 'txt', title: '纯文本 (.txt)', desc: '便于复制或二次编辑' },
];

function DownloadFormatModal({
  paper,
  onClose,
}: {
  paper: Paper;
  onClose: () => void;
}) {
  const [format, setFormat] = useState<PaperExportFormat>('html');
  const [progress, setProgress] = useState<BlobProgress | null>(null);
  const [busy, setBusy] = useState(false);
  const startAtRef = useRef<number>(0);
  const rafRef = useRef<number | null>(null);
  const lastPercentRef = useRef<number | null>(null);

  useEffect(() => {
    setFormat('html');
    setProgress(null);
    setBusy(false);
    startAtRef.current = 0;
    lastPercentRef.current = null;
    if (rafRef.current != null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
  }, [paper.id]);

  async function handleConfirm() {
    setBusy(true);
    setProgress({ loaded: 0, total: null, percent: 0 });
    try {
      startAtRef.current = performance.now();
      await downloadPaperExportApi(Number(paper.id), format, (p) => {
        // Throttle to animation frames, and only update when percent changes,
        // to keep the width transition visually smooth.
        const nextPercent = p.percent ?? null;
        if (nextPercent === lastPercentRef.current) return;
        lastPercentRef.current = nextPercent;
        if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
        rafRef.current = requestAnimationFrame(() => setProgress(p));
      });

      const elapsed = performance.now() - startAtRef.current;
      const minVisibleMs = 650; // ensures user can see the bar moving
      if (elapsed < minVisibleMs) {
        await new Promise((r) => setTimeout(r, minVisibleMs - elapsed));
      }
      onClose();
    } catch (e) {
      alert(e instanceof Error ? e.message : '下载失败');
    } finally {
      setBusy(false);
      setProgress(null);
    }
  }

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 200,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'rgba(15, 15, 35, 0.45)', backdropFilter: 'blur(3px)',
      }}
      onClick={busy ? undefined : onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="export-dialog-title"
        onClick={e => e.stopPropagation()}
        style={{
          width: 'min(400px, calc(100vw - 32px))',
          background: '#fff',
          borderRadius: '12px',
          boxShadow: '0 20px 50px rgba(0,0,0,0.18)',
          padding: '22px 22px 18px',
          border: '1px solid #e8eaed',
        }}
      >
        <h3 id="export-dialog-title" style={{ margin: '0 0 6px', fontSize: '17px', fontWeight: 700, color: '#0f0f23' }}>
          选择下载格式
        </h3>
        <p style={{ margin: '0 0 16px', fontSize: '13px', color: '#6b7280', lineHeight: 1.5 }}>
          {paper.title}
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {EXPORT_OPTIONS.map(opt => {
            const selected = format === opt.id;
            return (
              <label
                key={opt.id}
                style={{
                  display: 'flex', alignItems: 'flex-start', gap: '10px',
                  padding: '12px 12px',
                  borderRadius: '8px',
                  border: `1px solid ${selected ? '#3b5bdb' : '#e5e7eb'}`,
                  background: selected ? '#f5f7ff' : '#fafafa',
                  cursor: busy ? 'not-allowed' : 'pointer',
                  opacity: busy ? 0.85 : 1,
                }}
              >
                <input
                  type="radio"
                  name="export-format"
                  checked={selected}
                  disabled={busy}
                  onChange={() => { setFormat(opt.id); }}
                  style={{ marginTop: '3px' }}
                />
                <span>
                  <span style={{ fontSize: '14px', fontWeight: 600, color: '#111827' }}>{opt.title}</span>
                  <span style={{ display: 'block', fontSize: '12px', color: '#6b7280', marginTop: '2px' }}>{opt.desc}</span>
                </span>
              </label>
            );
          })}
        </div>

        {busy && progress && (
          <div style={{ marginTop: '16px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
              <span style={{ fontSize: '12px', color: '#6b7280' }}>
                {progress.percent != null
                  ? (format === 'pdf' && !paper.hasSourcePdf && progress.percent >= 100 ? '生成 PDF…' : `下载中 ${progress.percent}%`)
                  : '下载中…'}
              </span>
              <span style={{ fontSize: '12px', color: '#9ca3af' }}>
                {(progress.loaded / 1024).toFixed(1)} KB
              </span>
            </div>
            <div style={{ height: '8px', background: '#e5e7eb', borderRadius: '99px', overflow: 'hidden' }}>
              <div
                style={{
                  height: '100%',
                  width: progress.percent != null ? `${progress.percent}%` : '36%',
                  background: 'linear-gradient(90deg, #3b5bdb, #5b7cfa)',
                  borderRadius: '99px',
                  transition: 'width 0.35s ease-out',
                }}
              />
            </div>
          </div>
        )}

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '20px' }}>
          <button
            type="button"
            disabled={busy}
            onClick={onClose}
            style={{
              padding: '8px 16px', borderRadius: '8px', border: '1px solid #e5e7eb',
              background: '#fff', fontSize: '13px', color: '#374151', cursor: busy ? 'not-allowed' : 'pointer',
            }}
          >
            取消
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={handleConfirm}
            style={{
              padding: '8px 18px', borderRadius: '8px', border: 'none',
              background: busy ? '#93a6e8' : '#3b5bdb', fontSize: '13px', fontWeight: 600,
              color: '#fff', cursor: busy ? 'wait' : 'pointer',
            }}
          >
            {busy ? '下载中…' : '下载'}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ─── Detail Panel ───────────────────────────────────────────────── */
function PaperDetailPanel({
  paper,
  onClose,
  onDownload,
}: {
  paper: Paper;
  onClose: () => void;
  onDownload: () => void;
}) {
  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 100,
      display: 'flex', alignItems: 'stretch',
    }}>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{ flex: 1, background: 'rgba(0,0,0,0.35)', backdropFilter: 'blur(2px)' }}
      />

      {/* Panel */}
      <div style={{
        width: '720px', background: '#f5f6fa', display: 'flex', flexDirection: 'column',
        boxShadow: '-4px 0 40px rgba(0,0,0,0.18)', overflow: 'hidden', position: 'relative',
      }}>

        {/* Floating action buttons */}
        <div style={{ position: 'absolute', right: '16px', top: '140px', display: 'flex', flexDirection: 'column', gap: '8px', zIndex: 10 }}>
          <button type="button" title="Preview"
            style={{ width: '42px', height: '42px', borderRadius: '50%', border: '1px solid #e8eaed', background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#374151', cursor: 'default', boxShadow: '0 2px 8px rgba(0,0,0,0.08)' }}
          >
            <Eye size={16} />
          </button>
          <button type="button" title="Download"
            onClick={onDownload}
            style={{
              width: '42px', height: '42px', borderRadius: '50%', border: '1px solid #e8eaed', background: '#fff',
              display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#374151',
              cursor: 'pointer',
              boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
            }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = '#f3f4f6'; }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = '#fff'; }}
          >
            <Download size={16} />
          </button>
        </div>

        {/* Header */}
        <div style={{ background: '#fff', borderBottom: '1px solid #e8eaed', padding: '20px 56px 20px 28px', flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px' }}>
            <h2 style={{ fontSize: '18px', fontWeight: 700, color: '#0f0f23', margin: 0, flex: 1, lineHeight: 1.3 }}>{paper.title}</h2>
            <span style={{
              fontSize: '11px', fontWeight: 600, padding: '3px 10px', borderRadius: '20px', flexShrink: 0,
              background: paper.status === 'published' ? '#eff6ff' : paper.status === 'closed' ? '#fef2f2' : '#f3f4f6',
              color: paper.status === 'published' ? '#1d4ed8' : paper.status === 'closed' ? '#dc2626' : '#6b7280',
            }}>
              {paper.status === 'published' ? 'Published' : paper.status === 'closed' ? 'Closed' : 'Draft'}
            </span>
            <button onClick={onClose}
              style={{ width: '28px', height: '28px', borderRadius: '7px', border: '1px solid #e8eaed', background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#6b7280', cursor: 'pointer', flexShrink: 0 }}>
              <X size={14} />
            </button>
          </div>
          {/* Meta bar */}
          <div style={{ display: 'flex', gap: '18px', flexWrap: 'wrap' }}>
            {[
              { icon: <FileText size={12} />, text: `${paper.subject} · ${paper.grade}` },
              { icon: <BookOpen size={12} />, text: `Textbook: ${paper.textbook}` },
              { icon: <Target size={12} />, text: `Score: ${paper.totalScore} pts` },
              { icon: <Clock size={12} />, text: `${paper.durationMin} min` },
              { icon: <BarChart2 size={12} />, text: paper.type },
            ].map((m, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '12px', color: '#6b7280' }}>
                <span style={{ color: '#9ca3af' }}>{m.icon}</span>
                {m.text}
              </div>
            ))}
          </div>
        </div>

        {/* Paper preview body */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '24px 28px' }}>
          {/* Paper header band */}
          <div style={{ background: '#2d5be3', borderRadius: '10px 10px 0 0', padding: '28px 40px', textAlign: 'center', color: '#fff', marginBottom: '0' }}>
            <div style={{ fontSize: '20px', fontWeight: 700, marginBottom: '18px' }}>{paper.title}</div>
            <div style={{ display: 'flex', justifyContent: 'center', gap: '40px', fontSize: '14px' }}>
              {['Name: _______________', 'Class: _______________', 'Student ID: _______________'].map(f => (
                <span key={f}>{f}</span>
              ))}
            </div>
          </div>

          {/* Instructions */}
          <div style={{ background: '#fefce8', border: '1px solid #fde68a', borderTop: 'none', padding: '16px 40px', marginBottom: '20px', borderRadius: '0 0 0 0' }}>
            <div style={{ fontSize: '13px', fontWeight: 700, color: '#374151', marginBottom: '6px' }}>Exam Instructions:</div>
            <div style={{ fontSize: '13px', color: '#4b5563', lineHeight: 1.7 }}>
              1. This exam contains {paper.questionCount} questions, total score {paper.totalScore} pts, duration {paper.durationMin} minutes.<br />
              2. Please write your name, class, and student ID in the designated fields before starting.<br />
              3. Read each question carefully before answering.
            </div>
          </div>

          {/* Sections */}
          {paper.sections.map((sec, si) => (
            <div key={si} style={{ background: '#fff', border: '1px solid #e8eaed', borderRadius: '10px', marginBottom: '16px', overflow: 'hidden' }}>
              {/* Section header */}
              <div style={{ padding: '14px 20px', borderBottom: '1px solid #f0f2f5', display: 'flex', alignItems: 'baseline', gap: '8px' }}>
                <span style={{ fontSize: '15px', fontWeight: 700, color: '#1e40af' }}>
                  {toRoman(si + 1)}. {sec.title}
                </span>
                <span style={{ fontSize: '12px', color: '#6b7280' }}>
                  ({sec.count} questions · {sec.scoreEach} pts each · Total {sec.count * sec.scoreEach} pts)
                </span>
              </div>

              {/* Questions */}
              <div style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
                {sec.questions.map(q => (
                  <div key={q.n}>
                    <div style={{ fontSize: '14px', color: '#0f0f23', marginBottom: '8px', lineHeight: 1.6 }}>
                      <span style={{ fontWeight: 600, marginRight: '4px' }}>{q.n}.</span> {q.text}
                    </div>
                    {/* MCQ options */}
                    {q.options && (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '5px', paddingLeft: '18px' }}>
                        {q.options.map((opt, oi) => (
                          <div key={oi} style={{ fontSize: '13px', color: opt.startsWith(q.answer + '.') ? '#1d4ed8' : '#4b5563', fontWeight: opt.startsWith(q.answer + '.') ? 600 : 400 }}>
                            {opt}
                          </div>
                        ))}
                      </div>
                    )}
                    {/* TF answer */}
                    {sec.type === 'tf' && q.answer && (
                      <div style={{ paddingLeft: '18px', fontSize: '13px', color: '#9ca3af' }}>
                        ( True &nbsp;/&nbsp; False )
                      </div>
                    )}
                    {/* Fill blank */}
                    {sec.type === 'fill' && (
                      <div style={{ paddingLeft: '18px', marginTop: '4px' }}>
                        <div style={{ display: 'inline-block', width: '200px', borderBottom: '1px solid #9ca3af', height: '20px' }} />
                      </div>
                    )}
                    {/* SA answer area */}
                    {sec.type === 'sa' && (
                      <div style={{ paddingLeft: '18px', marginTop: '8px' }}>
                        <div style={{ height: '60px', border: '1px dashed #d1d5db', borderRadius: '6px', background: '#f9fafb' }} />
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function toRoman(n: number) {
  return ['I', 'II', 'III', 'IV', 'V', 'VI'][n - 1] ?? n;
}

/* ─── Main Component ─────────────────────────────────────────────── */
export default function AssessmentPapers() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [search, setSearch]       = useState('');
  const [subject, setSubject]     = useState('All Subjects');
  const [grade, setGrade]         = useState('All Grades');
  const [semester, setSemester]   = useState('All Semesters');
  const [type, setType]           = useState('All Types');
  const [previewPaper, setPreviewPaper] = useState<Paper | null>(null);
  const [exportModalPaper, setExportModalPaper] = useState<Paper | null>(null);
  const [publishingId, setPublishingId] = useState<string | null>(null);
  const [managePaper, setManagePaper] = useState<Paper | null>(null);
  const [confirmDeletePaper, setConfirmDeletePaper] = useState<Paper | null>(null);
  const [busyManage, setBusyManage] = useState(false);

  const {
    data: listRes,
    isPending: loading,
    isError,
    error: listQueryError,
  } = useQuery({
    queryKey: teacherKeys.paperList({ page: 1, page_size: 100 }),
    queryFn: () => fetchPaperListApi({ page: 1, page_size: 100 }),
  });
  const papers = useMemo(() => listRes?.items.map(mapListItemToPaper) ?? [], [listRes]);
  const loadError = isError
    ? (listQueryError instanceof Error ? listQueryError.message : 'Failed to load papers')
    : null;

  async function refreshList() {
    await queryClient.invalidateQueries({ queryKey: ['teacher', 'papers'] });
  }

  const allSubjects = useMemo(
    () => ['All Subjects', ...Array.from(new Set(papers.map(p => p.subject)))],
    [papers],
  );
  const allGrades = useMemo(
    () => ['All Grades', ...Array.from(new Set(papers.map(p => p.grade)))],
    [papers],
  );
  const allSemesters = useMemo(
    () => ['All Semesters', ...Array.from(new Set(papers.map(p => p.semester))).filter(Boolean)],
    [papers],
  );
  const allTypes = useMemo(
    () => ['All Types', ...Array.from(new Set(papers.map(p => p.type)))],
    [papers],
  );

  const filtered = useMemo(() => {
    return papers.filter(p => {
      if (search && !p.title.toLowerCase().includes(search.toLowerCase())) return false;
      if (subject  !== 'All Subjects'  && p.subject  !== subject)  return false;
      if (grade    !== 'All Grades'    && p.grade    !== grade)    return false;
      if (semester !== 'All Semesters' && p.semester !== semester) return false;
      if (type     !== 'All Types'     && p.type     !== type)     return false;
      return true;
    });
  }, [papers, search, subject, grade, semester, type]);

  async function handleView(paper: Paper) {
    try {
      const detail = await fetchPaperDetailApi(Number(paper.id));
      setPreviewPaper(mapDetailToPaper(detail));
    } catch {
      setPreviewPaper(paper);
    }
  }

  async function handlePublish(paper: Paper) {
    if (paper.status !== 'draft') return;
    setPublishingId(paper.id);
    try {
      await publishPaperApi(Number(paper.id));
      await refreshList();
    } catch (e) {
      alert(e instanceof Error ? e.message : '发布失败');
    } finally {
      setPublishingId(null);
    }
  }

  async function handlePublishFromModal(paper: Paper) {
    if (paper.status !== 'draft') return;
    setBusyManage(true);
    try {
      await publishPaperApi(Number(paper.id));
      await refreshList();
      setManagePaper(null);
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Publish failed');
    } finally {
      setBusyManage(false);
    }
  }

  async function handleUnpublish(paper: Paper) {
    if (paper.status !== 'published' || !paper.isOwner) return;
    setBusyManage(true);
    try {
      await unpublishPaperApi(Number(paper.id));
      await refreshList();
      setManagePaper(null);
    } catch (e) {
      alert(e instanceof Error ? e.message : '回滚失败');
    } finally {
      setBusyManage(false);
    }
  }

  async function handleDelete(paper: Paper) {
    if (!paper.isOwner) return;
    setBusyManage(true);
    try {
      await deletePaperApi(Number(paper.id));
      await refreshList();
      setConfirmDeletePaper(null);
      setManagePaper(null);
    } catch (e) {
      alert(e instanceof Error ? e.message : '删除失败');
    } finally {
      setBusyManage(false);
    }
  }

  function openManage(paper: Paper) {
    setManagePaper(paper);
    // If list payload came from an older cache without is_owner,
    // refresh ownership by fetching detail on open.
    if (!paper.ownerKnown) {
      (async () => {
        try {
          const detail = await fetchPaperDetailApi(Number(paper.id));
          const resolved = mapDetailToPaper(detail);
          setManagePaper((prev) => (prev && prev.id === paper.id ? { ...prev, isOwner: resolved.isOwner, ownerKnown: true } : prev));
        } catch {
          setManagePaper((prev) => (prev && prev.id === paper.id ? { ...prev, ownerKnown: true } : prev));
        }
      })();
    }
  }

  return (
    <div style={{ display: 'flex', height: 'calc(100vh - 48px)', overflow: 'hidden', background: '#fafafa' }}>

      {/* ── Left Filter Panel ───────────────────────────────────── */}
      <div style={{
        width: '200px', flexShrink: 0, background: '#fff',
        borderRight: '1px solid #e5e7eb', overflowY: 'auto',
        padding: '16px 14px',
      }}>
        {/* Panel title */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '8px' }}>
          <Filter size={14} style={{ color: '#6b7280' }} />
          <span style={{ fontSize: '13px', fontWeight: 600, color: '#111827' }}>Filter</span>
        </div>

        {/* Found count */}
        <div style={{ fontSize: '11px', color: '#9ca3af', marginBottom: '14px' }}>
          {filtered.length} papers
        </div>

        {/* Search */}
        <div style={{ marginBottom: '20px' }}>
          <div style={{ fontSize: '13px', fontWeight: 600, color: '#374151', marginBottom: '8px' }}>Search</div>
          <div style={{ position: 'relative' }}>
            <Search size={13} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: '#9ca3af' }} />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Enter keyword…"
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

        {/* Dropdowns */}
        <FilterSelect label="Subject"  options={allSubjects}  value={subject}  onChange={setSubject} />
        <FilterSelect label="Grade"    options={allGrades}    value={grade}    onChange={setGrade} />
        <FilterSelect label="Semester" options={allSemesters} value={semester} onChange={setSemester} />
        <FilterSelect label="Type"     options={allTypes}     value={type}     onChange={setType} />

        {/* Reset */}
        {(search || subject !== 'All Subjects' || grade !== 'All Grades' || semester !== 'All Semesters' || type !== 'All Types') && (
          <button
            onClick={() => { setSearch(''); setSubject('All Subjects'); setGrade('All Grades'); setSemester('All Semesters'); setType('All Types'); }}
            style={{ width: '100%', padding: '8px', borderRadius: '8px', border: '1px dashed #d1d5db', background: 'transparent', fontSize: '13px', color: '#6b7280', cursor: 'pointer', marginTop: '4px' }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = '#9ca3af'; (e.currentTarget as HTMLElement).style.color = '#374151'; }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = '#d1d5db'; (e.currentTarget as HTMLElement).style.color = '#6b7280'; }}
          >
            Reset Filters
          </button>
        )}
      </div>

      {/* ── Right Content ────────────────────────────────────────── */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '22px 24px' }}>
        {/* Top bar */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 14 }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: '16px', fontWeight: 800, color: '#0f0f23' }}>Exam Papers</div>
            <div style={{ fontSize: '12px', color: '#9ca3af' }}>Upload a PDF and parse it into an editable draft.</div>
          </div>
          <button
            type="button"
            onClick={() => navigate('/teacher/assessment/papers/import')}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
              padding: '10px 14px',
              borderRadius: 10,
              border: '1px solid #e8eaed',
              background: '#fff',
              color: '#374151',
              fontSize: 13,
              cursor: 'pointer',
              flexShrink: 0,
            }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = '#f9fafb'; }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = '#fff'; }}
          >
            <Upload size={14} style={{ color: '#6b7280' }} />
            Import PDF
          </button>
        </div>

        {loading ? (
          <div style={{ textAlign: 'center', padding: '80px 0', color: '#9ca3af' }}>Loading papers...</div>
        ) : loadError ? (
          <div style={{ textAlign: 'center', padding: '80px 0', color: '#dc2626' }}>
            Failed to load papers: {loadError}
          </div>
        ) : filtered.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '80px 0' }}>
            <FileText size={40} style={{ color: '#d1d5db', marginBottom: '12px' }} />
            <p style={{ fontSize: '15px', color: '#9ca3af' }}>No papers match your filters.</p>
          </div>
        ) : (
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
            gap: '12px',
          }}>
            {filtered.map(paper => (
              <PaperCard
                key={paper.id}
                paper={paper}
                onView={() => handleView(paper)}
                onDownload={() => setExportModalPaper(paper)}
                onEdit={() => navigate(`/teacher/assessment/papers/${paper.id}/edit`)}
                onPublish={() => handlePublish(paper)}
                publishing={publishingId === paper.id}
                onManage={() => openManage(paper)}
              />
            ))}
          </div>
        )}
      </div>

      {/* ── Detail Panel ─────────────────────────────────────────── */}
      {previewPaper && (
        <PaperDetailPanel
          paper={previewPaper}
          onClose={() => setPreviewPaper(null)}
          onDownload={() => setExportModalPaper(previewPaper)}
        />
      )}

      {exportModalPaper && (
        <DownloadFormatModal
          paper={exportModalPaper}
          onClose={() => setExportModalPaper(null)}
        />
      )}

      {managePaper && (
        <ManagePaperModal
          paper={managePaper}
          busy={busyManage}
          onClose={() => setManagePaper(null)}
          onEdit={() => { setManagePaper(null); navigate(`/teacher/assessment/papers/${managePaper.id}/edit`); }}
          onPublish={() => void handlePublishFromModal(managePaper)}
          onUnpublish={() => void handleUnpublish(managePaper)}
          onDelete={() => setConfirmDeletePaper(managePaper)}
        />
      )}

      {confirmDeletePaper && (
        <ConfirmDeleteModal
          paper={confirmDeletePaper}
          busy={busyManage}
          onCancel={() => setConfirmDeletePaper(null)}
          onConfirm={() => void handleDelete(confirmDeletePaper)}
        />
      )}
    </div>
  );
}

/* ─── Paper Card ─────────────────────────────────────────────────── */
function PaperCard({
  paper,
  onView,
  onDownload,
  onEdit,
  onPublish,
  publishing,
  onManage,
}: {
  paper: Paper;
  onView: () => void;
  onDownload: () => void;
  onEdit: () => void;
  onPublish: () => void;
  publishing: boolean;
  onManage: () => void;
}) {
  const rows: { label: string; value: string | number }[] = [
    { label: 'Total Score',  value: `${paper.totalScore} pts` },
    { label: 'Duration',     value: `${paper.durationMin} min` },
    { label: 'Questions',    value: paper.questionCount },
    { label: 'Quality',      value: '' }, // rendered separately
    { label: 'Created',      value: paper.createdAt },
  ];

  return (
    <div
      style={{
        background: '#fff', border: '1px solid #e5e7eb', borderRadius: '8px',
        overflow: 'hidden', display: 'flex', flexDirection: 'column',
        transition: 'box-shadow 0.15s',
      }}
      onMouseEnter={e => { (e.currentTarget as HTMLElement).style.boxShadow = '0 1px 3px rgba(0,0,0,0.06)'; }}
      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.boxShadow = 'none'; }}
    >
      {/* Card body */}
      <div style={{ padding: '14px' }}>
        {/* Title + status badge */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '10px', marginBottom: '6px' }}>
          <h3 style={{ fontSize: '15px', fontWeight: 700, color: '#0f0f23', margin: 0, lineHeight: 1.4 }}>{paper.title}</h3>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0, marginTop: 2 }}>
            <span style={{
              fontSize: '10px',
              fontWeight: 600,
              padding: '2px 8px',
              borderRadius: '20px',
              background: paper.status === 'published' ? '#eff6ff' : paper.status === 'closed' ? '#fef2f2' : '#f3f4f6',
              color: paper.status === 'published' ? '#1d4ed8' : paper.status === 'closed' ? '#dc2626' : '#6b7280',
              flexShrink: 0,
            }}>
              {paper.status === 'published' ? 'Published' : paper.status === 'closed' ? 'Closed' : 'Draft'}
            </span>

            <button
              type="button"
              onClick={onManage}
              title="Manage"
              style={{
                width: 28,
                height: 28,
                borderRadius: 8,
                border: '1px solid #e8eaed',
                background: '#fff',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#6b7280',
                cursor: 'pointer',
              }}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = '#f9fafb'; }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = '#fff'; }}
            >
              <MoreHorizontal size={14} />
            </button>
          </div>
        </div>

        {/* Subtitle breadcrumb */}
        <div style={{ fontSize: '11px', color: '#6b7280', marginBottom: '12px', lineHeight: 1.5 }}>
          {paper.publisher}&nbsp;·&nbsp;{paper.grade}&nbsp;{paper.subject}&nbsp;·&nbsp;{paper.type}
        </div>

        {/* Stats table */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0' }}>
          {rows.map((row, i) => (
            <div key={i} style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '7px 0',
              borderTop: i === 0 ? '1px solid #f3f4f6' : 'none',
              borderBottom: '1px solid #f3f4f6',
            }}>
              <span style={{ fontSize: '12px', color: '#9ca3af' }}>{row.label}:</span>
              {row.label === 'Quality' ? (
                <div style={{ width: '140px' }}>
                  <QualityBar score={paper.quality} />
                </div>
              ) : (
                <span style={{ fontSize: '12px', fontWeight: 500, color: '#111827' }}>{row.value}</span>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Action buttons */}
      <div style={{ display: 'flex', borderTop: '1px solid #f3f4f6' }}>
        <button
          type="button"
          onClick={onView}
          style={{
            flex: 1,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '7px',
            padding: '12px',
            border: 'none',
            borderRight: '1px solid #f0f2f5',
            background: '#fff', color: '#374151', fontSize: '13px', cursor: 'pointer',
            transition: 'background 0.12s',
          }}
          onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = '#f9fafb'; }}
          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = '#fff'; }}
        >
          <Eye size={14} style={{ color: '#6b7280' }} /> View
        </button>

        <button
          type="button"
          onClick={onDownload}
          style={{
            flex: 1,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '7px',
            padding: '12px',
            border: 'none',
            borderRight: 'none',
            background: '#fff', color: '#374151', fontSize: '13px', cursor: 'pointer',
            transition: 'background 0.12s',
          }}
          onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = '#f9fafb'; }}
          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = '#fff'; }}
        >
          <Download size={14} style={{ color: '#6b7280' }} /> Download
        </button>
      </div>
    </div>
  );
}

function ManagePaperModal({
  paper,
  busy,
  onClose,
  onEdit,
  onPublish,
  onUnpublish,
  onDelete,
}: {
  paper: Paper;
  busy: boolean;
  onClose: () => void;
  onEdit: () => void;
  onPublish: () => void;
  onUnpublish: () => void;
  onDelete: () => void;
}) {
  const canManage = paper.isOwner;
  const isDraft = paper.status === 'draft';
  const isPublished = paper.status === 'published';

  const Btn = ({
    icon,
    label,
    danger,
    primary,
    onClick,
    disabled,
  }: {
    icon: React.ReactNode;
    label: string;
    danger?: boolean;
    primary?: boolean;
    disabled?: boolean;
    onClick?: () => void;
  }) => (
    <button
      type="button"
      onClick={disabled ? undefined : onClick}
      disabled={disabled}
      style={{
        width: '100%',
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        padding: '10px 12px',
        borderRadius: 10,
        border: primary ? 'none' : '1px solid #e8eaed',
        background: primary ? '#3b5bdb' : '#fff',
        color: primary ? '#fff' : danger ? '#b91c1c' : '#111827',
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.7 : 1,
        fontSize: 13,
        fontWeight: primary ? 700 : 600,
        textAlign: 'left',
      }}
    >
      <span style={{ color: primary ? '#fff' : danger ? '#ef4444' : '#6b7280' }}>{icon}</span>
      <span style={{ flex: 1 }}>{label}</span>
    </button>
  );

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 220,
        background: 'rgba(15, 15, 35, 0.45)',
        backdropFilter: 'blur(3px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16,
      }}
      onClick={busy ? undefined : onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 'min(420px, calc(100vw - 32px))',
          background: '#fff',
          borderRadius: 14,
          border: '1px solid #e8eaed',
          boxShadow: '0 20px 60px rgba(0,0,0,0.18)',
          overflow: 'hidden',
        }}
      >
        <div style={{ padding: '16px 16px 12px', borderBottom: '1px solid #f3f4f6' }}>
          <div style={{ fontSize: 15, fontWeight: 800, color: '#0f0f23', marginBottom: 4 }}>Manage paper</div>
          <div style={{ fontSize: 12, color: '#6b7280', lineHeight: 1.4 }}>{paper.title}</div>
          <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 6 }}>
            Status: {paper.status}{' '}
            {!paper.ownerKnown ? '· Loading permissions…' : canManage ? '· Manageable' : '· View/download only'}
          </div>
        </div>

        <div style={{ padding: 16, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          {isDraft && canManage && (
            <>
              <Btn icon={<Pencil size={16} />} label="Edit draft" onClick={onEdit} disabled={busy} />
              <Btn icon={<Send size={16} />} label={busy ? 'Publishing…' : 'Publish'} primary onClick={onPublish} disabled={busy} />
              <div style={{ gridColumn: '1 / -1' }}>
                <Btn icon={<Trash2 size={16} />} label="Delete paper" danger onClick={onDelete} disabled={busy} />
              </div>
            </>
          )}

          {isPublished && canManage && (
            <>
              <Btn icon={<RotateCcw size={16} />} label={busy ? 'Rolling back…' : 'Rollback to draft'} onClick={onUnpublish} disabled={busy} />
              <Btn icon={<Trash2 size={16} />} label="Delete paper" danger onClick={onDelete} disabled={busy} />
            </>
          )}

          {!canManage && (
            <div style={{ gridColumn: '1 / -1', padding: '8px 2px', fontSize: 12, color: '#6b7280', lineHeight: 1.6 }}>
              This paper is not owned by you. Use “View/Download” at the bottom of the card.
            </div>
          )}
        </div>

        <div style={{ padding: '0 16px 16px' }}>
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            style={{
              width: '100%',
              padding: '10px 12px',
              borderRadius: 10,
              border: '1px solid #e8eaed',
              background: '#fff',
              color: '#374151',
              fontSize: 13,
              cursor: busy ? 'not-allowed' : 'pointer',
            }}
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

function ConfirmDeleteModal({
  paper,
  busy,
  onCancel,
  onConfirm,
}: {
  paper: Paper;
  busy: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 230,
        background: 'rgba(15, 15, 35, 0.55)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16,
      }}
      onClick={busy ? undefined : onCancel}
    >
      <div
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 'min(420px, calc(100vw - 32px))',
          background: '#fff',
          borderRadius: 14,
          border: '1px solid #e8eaed',
          boxShadow: '0 20px 60px rgba(0,0,0,0.18)',
          padding: 18,
        }}
      >
        <div style={{ fontSize: 15, fontWeight: 900, color: '#0f0f23', marginBottom: 8 }}>Delete this paper?</div>
        <div style={{ fontSize: 12, color: '#6b7280', lineHeight: 1.55, marginBottom: 14 }}>
          This will permanently delete: <strong style={{ color: '#111827' }}>{paper.title}</strong>
          <br />
          If the paper has attempts or is referenced by quizzes, deletion will be rejected.
        </div>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            style={{
              padding: '9px 14px',
              borderRadius: 10,
              border: '1px solid #e8eaed',
              background: '#fff',
              color: '#374151',
              fontSize: 13,
              cursor: busy ? 'not-allowed' : 'pointer',
            }}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={busy}
            style={{
              padding: '9px 14px',
              borderRadius: 10,
              border: 'none',
              background: busy ? '#fca5a5' : '#ef4444',
              color: '#fff',
              fontSize: 13,
              fontWeight: 800,
              cursor: busy ? 'wait' : 'pointer',
            }}
          >
            {busy ? 'Deleting…' : 'Delete'}
          </button>
        </div>
      </div>
    </div>
  );
}
