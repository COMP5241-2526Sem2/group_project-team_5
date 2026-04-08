import { useState, useTransition, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router';
import TeacherLayout from '../../components/teacher/TeacherLayout';
import LabHost, { STATIC_WIDGETS } from '../../components/labs/LabHost';
import AIChatPanel, { type LabGeneratedOptions } from '../../components/labs/AIChatPanel';
import { useLabs } from '../../components/labs/LabsContext';
import { useChat, hasGenerateLabProgress } from '../../components/labs/ChatContext';
import { ConfirmGenerateResetModal } from '../../components/labs/ConfirmGenerateResetModal';
import type { LabEntry } from '../../components/labs/LabsContext';
import type { LabComponentDefinition } from '../../components/labs/types';
import {
  Search, Sparkles, FlaskConical, Eye, Trash2,
  CheckCircle2, Tag, Cpu, BookOpen, ChevronRight,
  X, Layers, Box, FileJson,
} from 'lucide-react';
import { CustomSelect } from '../../components/teacher/CustomSelect';

// ── Subject palette ──────────────────────────────────────────────────────────
const SUBJ: Record<string, { bg: string; color: string; dot: string; emoji: string }> = {
  Math:      { bg: '#eff6ff', color: '#1e40af', dot: '#3b5bdb', emoji: '📐' },
  Physics:   { bg: '#fef3c7', color: '#92400e', dot: '#f59e0b', emoji: '⚡' },
  Chemistry: { bg: '#fdf4ff', color: '#6b21a8', dot: '#a855f7', emoji: '⚗️' },
  Biology:   { bg: '#f0fdf4', color: '#166534', dot: '#22c55e', emoji: '🔬' },
  Dynamic:   { bg: '#f3f4f6', color: '#374151', dot: '#6b7280', emoji: '⚙️' },
};
function ss(subj: string) { return SUBJ[subj] ?? SUBJ.Dynamic; }

// ── Dimension map for static widgets ─────────────────────────────────────────
const STATIC_DIMENSION: Record<string, '2d' | '3d'> = {
  'math.function_graph': '2d',
  'math.geometry_3d':    '3d',
  'physics.circuit':     '2d',
  'physics.mechanics':   '3d',
  'chem.molecule':      '3d',
  'bio.cell':           '3d',
};

function dynSubject(def: LabComponentDefinition) {
  const m: Record<string, string> = {
    math: 'Math', physics: 'Physics', chemistry: 'Chemistry', biology: 'Biology',
  };
  return m[def.subjectLab] ?? 'Dynamic';
}

function dynDimension(def: LabComponentDefinition): '2d' | '3d' {
  const t = (def.title + ' ' + (def.description ?? '')).toLowerCase();
  return t.includes('3d') || t.includes('three') || t.includes('surface') ? '3d' : '2d';
}

// ── Unified lab descriptor ───────────────────────────────────────────────────
interface LabItem {
  id: string;
  label: string;
  subject: string;
  emoji: string;
  type: 'builtin' | 'uploaded' | 'ai';
  widgetType: string;
  description?: string;
  status: 'published' | 'draft' | 'deprecated';
  grade?: string;
  topic?: string;
  dimension: '2d' | '3d';
}

function buildCatalog(allEntries: LabEntry[]): LabItem[] {
  const builtin: LabItem[] = STATIC_WIDGETS.map(w => ({
    id: w.widgetType,
    label: w.label,
    subject: w.subject,
    emoji: w.emoji,
    type: 'builtin' as const,
    widgetType: w.widgetType,
    description: `Built-in ${w.subject} interactive lab component.`,
    status: 'published' as const,
    dimension: STATIC_DIMENSION[w.widgetType] ?? '3d',
  }));

  const external: LabItem[] = allEntries.map(e => ({
    id: e.def.registryKey,
    label: e.def.title,
    subject: dynSubject(e.def),
    emoji: e.source === 'uploaded' ? '📤' : '✨',
    type: e.source as 'uploaded' | 'ai',
    widgetType: e.def.registryKey,
    description: e.def.description,
    status: e.def.status,
    grade: e.def.metadata?.grade,
    topic: e.def.metadata?.topic,
    dimension: dynDimension(e.def),
  }));

  return [...builtin, ...external];
}

// ── Delete confirm modal ─────────────────────────────────────────────────────
function DeleteModal({ lab, onConfirm, onCancel }: {
  lab: LabItem;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const sty = ss(lab.subject);
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 80, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
      onClick={onCancel}>
      <div onClick={e => e.stopPropagation()} style={{ background: '#fff', borderRadius: '14px', padding: '28px', maxWidth: '360px', width: '90%', textAlign: 'center', boxShadow: '0 20px 60px rgba(0,0,0,0.15)' }}>
        <div style={{ width: '48px', height: '48px', borderRadius: '14px', background: '#fef2f2', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 14px', fontSize: '22px' }}>
          🗑️
        </div>
        <div style={{ fontSize: '16px', fontWeight: 700, color: '#0f0f23', marginBottom: '8px' }}>Delete Lab?</div>
        <div style={{ fontSize: '13px', color: '#6b7280', marginBottom: '22px', lineHeight: 1.6 }}>
          <strong style={{ color: '#374151' }}>{lab.label}</strong> will be permanently removed from the catalog.
          Any slides using this lab will need to be updated.
        </div>
        <div style={{ display: 'flex', gap: '10px', justifyContent: 'center' }}>
          <button onClick={onCancel} style={{ padding: '8px 22px', border: '1px solid #e8eaed', borderRadius: '8px', background: '#fff', fontSize: '13px', cursor: 'pointer', color: '#374151' }}>
            Cancel
          </button>
          <button onClick={onConfirm} style={{ padding: '8px 22px', border: 'none', borderRadius: '8px', background: '#ef4444', color: '#fff', fontSize: '13px', fontWeight: 600, cursor: 'pointer' }}>
            Delete
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main page ────────────────────────────────────────────────────────────────
export default function LabsManagement() {
  const navigate = useNavigate();
  const [, startTransition] = useTransition();
  const { allLabs, deleteLab, saveDraft, publishLab } = useLabs();
  const {
    setWidgetType, setMode, pendingCommands, consumeCommands, setGenerateBaseRegistryKey,
    messages, mode: chatMode, loading: chatLoading, clearLabChatBinding,
  } = useChat();

  const [search, setSearch] = useState('');
  const [filterSubject, setFilterSubject] = useState('');
  const [filterType, setFilterType] = useState<'all' | 'builtin' | 'uploaded' | 'ai'>('all');
  const [filterDimension, setFilterDimension] = useState<'' | '2d' | '3d'>('');
  const [selectedId, setSelectedId] = useState<string>('');
  const [deleteTarget, setDeleteTarget] = useState<LabItem | null>(null);
  const [showChat, setShowChat] = useState(true);
  const [pendingCatalogSelect, setPendingCatalogSelect] = useState<LabItem | null>(null);
  /** Generate 有进度时，重复点击已选实验需确认后再取消选择 */
  const [pendingCatalogDeselect, setPendingCatalogDeselect] = useState(false);

  const allEntries = Array.from(allLabs.values());
  const catalog = buildCatalog(allEntries);

  // Catalog page: only published labs; drafts live under Drafts
  const publishedCatalog = catalog.filter(l => l.status === 'published');
  const visibleCatalog =
    filterType === 'all'
      ? publishedCatalog
      : publishedCatalog.filter(l => {
          if (filterType === 'builtin') return l.type === 'builtin';
          if (filterType === 'uploaded') return l.type === 'uploaded';
          if (filterType === 'ai') return l.type === 'ai';
          return true;
        });

  const filtered = visibleCatalog.filter(lab =>
    (!search ||
      lab.label.toLowerCase().includes(search.toLowerCase()) ||
      (lab.description ?? '').toLowerCase().includes(search.toLowerCase())) &&
    (!filterSubject || lab.subject === filterSubject) &&
    (!filterDimension || lab.dimension === filterDimension)
  );

  const selected = useMemo(() => {
    if (!selectedId) return null;
    return filtered.find(l => l.id === selectedId) ?? null;
  }, [filtered, selectedId]);
  const selectedSty = selected ? ss(selected.subject) : ss('Dynamic');

  useEffect(() => {
    if (filtered.length === 0) {
      if (selectedId) startTransition(() => setSelectedId(''));
      return;
    }
    if (selectedId && !filtered.some(l => l.id === selectedId)) {
      startTransition(() => setSelectedId(''));
    }
  }, [filtered, selectedId, startTransition]);

  /** Generate 模式：当前目录选中的实验作为迭代基准（与 Drive 的 widgetType 对齐） */
  useEffect(() => {
    setGenerateBaseRegistryKey(selected?.widgetType, selected?.label);
  }, [selected?.widgetType, selected?.label, setGenerateBaseRegistryKey]);

  function applyCatalogSelection(lab: LabItem) {
    startTransition(() => setSelectedId(lab.id));
    setWidgetType(lab.widgetType);
    setMode('drive_lab');
  }

  /** 取消列表选择，并解除 Chat 中 Drive / Generate 对该实验的绑定 */
  function clearCatalogSelection() {
    startTransition(() => setSelectedId(''));
    clearLabChatBinding();
  }

  function selectLab(lab: LabItem) {
    if (lab.id === selectedId) {
      if (hasGenerateLabProgress(chatMode, messages, chatLoading)) {
        setPendingCatalogDeselect(true);
        return;
      }
      clearCatalogSelection();
      return;
    }
    if (
      hasGenerateLabProgress(chatMode, messages, chatLoading)
    ) {
      setPendingCatalogSelect(lab);
      return;
    }
    applyCatalogSelection(lab);
  }

  async function handleDelete(lab: LabItem) {
    if (lab.type === 'builtin') return;
    await deleteLab(lab.widgetType);
    if (selectedId === lab.id) {
      startTransition(() => setSelectedId(''));
    }
    setDeleteTarget(null);
  }

  async function handleLabCommit(def: LabComponentDefinition, options?: LabGeneratedOptions) {
    saveDraft(def, 'ai');
    if (options?.status === 'published') {
      await publishLab(def.registryKey);
    }
  }

  const publishedCount = publishedCatalog.length;
  const builtinCount   = publishedCatalog.filter(l => l.type === 'builtin').length;
  const uploadedCount  = publishedCatalog.filter(l => l.type === 'uploaded').length;
  const aiCount        = publishedCatalog.filter(l => l.type === 'ai').length;
  const draftCount     = allLabs.size - catalog.filter(l => l.status === 'published').length;

  const ALL_SUBJECTS = ['Math', 'Physics', 'Chemistry', 'Biology'];

  const SOURCE_FILTER_LABEL: Record<typeof filterType, string> = {
    all: 'All sources',
    builtin: 'Built-in',
    uploaded: 'Uploaded',
    ai: 'AI generated',
  };

  const SOURCE_FILTER_OPTIONS = [
    SOURCE_FILTER_LABEL.all,
    SOURCE_FILTER_LABEL.builtin,
    SOURCE_FILTER_LABEL.uploaded,
    SOURCE_FILTER_LABEL.ai,
  ] as const;

  function sourceLabelToFilter(label: string): typeof filterType {
    const entry = (Object.entries(SOURCE_FILTER_LABEL) as [typeof filterType, string][]).find(
      ([, v]) => v === label
    );
    return entry?.[0] ?? 'all';
  }

  return (
    <TeacherLayout>
      <div style={{ display: 'flex', height: 'calc(100vh - 48px)', overflow: 'hidden', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' }}>

        {/* ── Left: Lab Catalog ── */}
        <div style={{ width: '272px', borderRight: '1px solid #e8eaed', display: 'flex', flexDirection: 'column', flexShrink: 0, background: '#fafafa' }}>

          {/* Catalog header */}
          <div style={{ padding: '14px 14px 12px', borderBottom: '1px solid #e8eaed', flexShrink: 0 }}>

            {/* Title row */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '7px' }}>
                <FlaskConical size={15} style={{ color: '#3b5bdb' }} />
                <span style={{ fontSize: '14px', fontWeight: 700, color: '#0f0f23' }}>Lab Catalog</span>
              </div>
              <span style={{ fontSize: '10px', padding: '2px 7px', borderRadius: '5px', background: '#eff6ff', color: '#3b5bdb', fontWeight: 600 }}>
                {filtered.length} / {visibleCatalog.length}
              </span>
            </div>

            {/* Search */}
            <div style={{ position: 'relative', marginBottom: '10px' }}>
              <Search size={12} style={{ position: 'absolute', left: '9px', top: '50%', transform: 'translateY(-50%)', color: '#9ca3af' }} />
              <input value={search} onChange={e => setSearch(e.target.value)}
                placeholder="Search labs…"
                style={{ width: '100%', padding: '7px 8px 7px 28px', border: '1px solid #e8eaed', borderRadius: '7px', fontSize: '12px', outline: 'none', boxSizing: 'border-box', background: '#fff' }} />
            </div>

            {/* ── Source filter (dropdown) — catalog is published-only ── */}
            <div style={{ marginBottom: '10px' }}>
              <div style={{ fontSize: '10px', fontWeight: 600, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '6px' }}>
                Source
              </div>
              <CustomSelect
                options={[...SOURCE_FILTER_OPTIONS]}
                value={SOURCE_FILTER_LABEL[filterType]}
                onChange={v => setFilterType(sourceLabelToFilter(v))}
                minWidth={0}
                width="100%"
              />
              <div style={{ marginTop: '6px', fontSize: '10px', color: '#9ca3af', lineHeight: 1.4 }}>
                All {publishedCount} · Built-in {builtinCount} · Upload {uploadedCount} · AI {aiCount}
              </div>
            </div>

            {/* Go to Drafts */}
            {draftCount > 0 && (
              <button
                onClick={() => navigate('/teacher/labs/drafts')}
                style={{
                  width: '100%', marginBottom: '10px', padding: '8px 10px',
                  borderRadius: '8px', border: '1.5px dashed #fbbf24',
                  background: '#fffbea', cursor: 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
                  fontSize: '11px', fontWeight: 600, color: '#92400e',
                }}
              >
                <FileJson size={13} style={{ color: '#f59e0b' }} />
                Drafts
                <span style={{ background: '#fef3c7', color: '#92400e', padding: '1px 6px', borderRadius: '5px', fontWeight: 700 }}>
                  {draftCount}
                </span>
              </button>
            )}

            {/* ── Dimension filter ── */}
            <div style={{ marginBottom: '10px' }}>
              <div style={{ fontSize: '10px', fontWeight: 600, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '6px' }}>
                Dimension
              </div>
              <div style={{ display: 'flex', gap: '5px' }}>
                {([
                  ['',   'All', null],
                  ['2d', '2D',  '#6b7280'],
                  ['3d', '3D',  '#3b5bdb'],
                ] as [string, string, string | null][]).map(([val, label, accent]) => {
                  const isActive = filterDimension === val;
                  return (
                    <button key={val} onClick={() => setFilterDimension(val as '' | '2d' | '3d')}
                      style={{
                        flex: 1, padding: '6px 0', borderRadius: '7px',
                        border: `1.5px solid ${isActive ? (accent ?? '#3b5bdb') : '#e8eaed'}`,
                        background: isActive ? (accent ? accent + '12' : '#f3f4f6') : '#fff',
                        color: isActive ? (accent ?? '#374151') : '#9ca3af',
                        fontSize: '11px', fontWeight: isActive ? 700 : 400, cursor: 'pointer',
                        transition: 'all 0.12s', display: 'flex', alignItems: 'center',
                        justifyContent: 'center', gap: '4px',
                      }}>
                      {val === '3d' && <Box size={10} />}
                      {label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* ── Subject filter dropdown ── */}
            <div>
              <div style={{ fontSize: '10px', fontWeight: 600, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '6px' }}>
                Subject
              </div>
              <CustomSelect
                options={['All subjects', ...ALL_SUBJECTS]}
                value={filterSubject === '' ? 'All subjects' : filterSubject}
                onChange={v => setFilterSubject(v === 'All subjects' ? '' : v)}
                minWidth={0}
                width="100%"
              />
            </div>
          </div>

          {/* Lab list */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '8px' }}>
            {filtered.length === 0 ? (
              <div style={{ padding: '40px 16px', textAlign: 'center', color: '#9ca3af' }}>
                <FlaskConical size={28} style={{ color: '#e5e7eb', marginBottom: '8px' }} />
                <div style={{ fontSize: '12px' }}>No labs match your filters.</div>
              </div>
            ) : (
              filtered.map(lab => {
                const sty = ss(lab.subject);
                const isActive = lab.id === selectedId;
                return (
                  <button key={lab.id} onClick={() => selectLab(lab)}
                    style={{ width: '100%', display: 'flex', alignItems: 'center', gap: '10px', padding: '9px 10px', borderRadius: '8px', border: `1px solid ${isActive ? '#3b5bdb' : 'transparent'}`, background: isActive ? '#eff6ff' : 'transparent', cursor: 'pointer', textAlign: 'left', marginBottom: '3px', transition: 'all 0.12s' }}
                    onMouseEnter={e => { if (!isActive) (e.currentTarget as HTMLElement).style.background = '#f3f4f6'; }}
                    onMouseLeave={e => { if (!isActive) (e.currentTarget as HTMLElement).style.background = 'transparent'; }}>

                    <div style={{ width: '34px', height: '34px', borderRadius: '9px', background: sty.bg, border: `1.5px solid ${isActive ? sty.dot : 'transparent'}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '17px', flexShrink: 0 }}>
                      {lab.emoji}
                    </div>

                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: '12px', fontWeight: 600, color: isActive ? '#1e40af' : '#1f2937', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', marginBottom: '2px' }}>
                        {lab.label}
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                        <span style={{ fontSize: '10px', color: sty.color, background: sty.bg, padding: '1px 5px', borderRadius: '4px', fontWeight: 600 }}>
                          {lab.subject}
                        </span>
                        {lab.type === 'uploaded' && (
                          <span style={{ fontSize: '9px', color: '#0369a1', background: '#e0f2fe', padding: '1px 5px', borderRadius: '4px', fontWeight: 600 }}>
                            Upload
                          </span>
                        )}
                        {lab.type === 'ai' && (
                          <span style={{ fontSize: '9px', color: '#7c3aed', background: '#fdf4ff', padding: '1px 5px', borderRadius: '4px', fontWeight: 600 }}>
                            AI
                          </span>
                        )}
                      </div>
                    </div>

                    {isActive && <ChevronRight size={12} style={{ color: '#3b5bdb', flexShrink: 0 }} />}
                  </button>
                );
              })
            )}
          </div>

          {/* Bottom: stats */}
          <div style={{ padding: '10px 14px', borderTop: '1px solid #e8eaed', flexShrink: 0, background: '#fff' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px 8px', fontSize: '10px', color: '#9ca3af' }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                <Cpu size={11} /> {builtinCount} built-in
              </span>
              <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                <Sparkles size={11} /> {aiCount} AI
              </span>
              <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                <CheckCircle2 size={11} style={{ color: '#059669' }} /> {publishedCount} published
              </span>
              <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                <FileJson size={11} style={{ color: '#f59e0b' }} />
                <button
                  onClick={() => navigate('/teacher/labs/drafts')}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '10px', color: '#f59e0b', fontWeight: 600, padding: 0 }}
                >
                  {draftCount} drafts
                </button>
              </span>
            </div>
          </div>
        </div>

        {/* ── Center: Preview + Details ── */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minWidth: 0 }}>

          {/* Toolbar */}
          <div style={{ height: '48px', borderBottom: '1px solid #e8eaed', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 18px', flexShrink: 0, background: '#fff' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <FlaskConical size={15} style={{ color: '#3b5bdb' }} />
              <span style={{ fontSize: '14px', fontWeight: 700, color: '#0f0f23' }}>Lab Catalog</span>
            </div>
            <div style={{ display: 'flex', gap: '7px', alignItems: 'center' }}>
              {selected && (
                <button onClick={() => navigate(`/teacher/lesson-editor/new`)}
                  style={{ display: 'flex', alignItems: 'center', gap: '5px', padding: '5px 12px', border: '1px solid #e8eaed', borderRadius: '7px', background: '#fff', color: '#374151', fontSize: '12px', cursor: 'pointer' }}>
                  <BookOpen size={13} /> Use in lesson
                </button>
              )}
              <button onClick={() => setShowChat(v => !v)}
                style={{ display: 'flex', alignItems: 'center', gap: '5px', padding: '5px 12px', border: `1px solid ${showChat ? '#3b5bdb' : '#e8eaed'}`, borderRadius: '7px', background: showChat ? '#eff6ff' : '#fff', color: showChat ? '#3b5bdb' : '#6b7280', fontSize: '12px', cursor: 'pointer' }}>
                <Sparkles size={13} /> AI Generate
              </button>
            </div>
          </div>

          {/* Preview area */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '24px', background: '#f8fafc' }}>
            {selected ? (
              <>
                <div style={{ background: '#fff', border: '1px solid #e8eaed', borderRadius: '12px', padding: '18px 20px', marginBottom: '16px', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '16px' }}>
                  <div style={{ display: 'flex', gap: '14px', alignItems: 'flex-start', flex: 1, minWidth: 0 }}>
                    <div style={{ width: '50px', height: '50px', borderRadius: '13px', background: selectedSty.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '24px', flexShrink: 0 }}>
                      {selected.emoji}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '5px', flexWrap: 'wrap' }}>
                        <span style={{ fontSize: '16px', fontWeight: 700, color: '#0f0f23' }}>{selected.label}</span>
                        <span style={{ fontSize: '11px', fontWeight: 600, color: selectedSty.color, background: selectedSty.bg, padding: '2px 8px', borderRadius: '5px' }}>
                          {selected.subject}
                        </span>
                        {selected.type === 'uploaded' && (
                          <span style={{ fontSize: '10px', fontWeight: 600, color: '#0369a1', background: '#e0f2fe', padding: '2px 8px', borderRadius: '5px', display: 'flex', alignItems: 'center', gap: '3px' }}>
                            <FileJson size={9} /> Uploaded
                          </span>
                        )}
                        {selected.type === 'ai' && (
                          <span style={{ fontSize: '10px', fontWeight: 600, color: '#7c3aed', background: '#fdf4ff', padding: '2px 8px', borderRadius: '5px', display: 'flex', alignItems: 'center', gap: '3px' }}>
                            <Sparkles size={9} /> AI generated
                          </span>
                        )}
                        <span style={{ fontSize: '10px', fontWeight: 600, padding: '2px 8px', borderRadius: '5px', background: selected.status === 'published' ? '#d1fae5' : '#fef3c7', color: selected.status === 'published' ? '#065f46' : '#92400e' }}>
                          {selected.status === 'published' ? '✓ Published' : '✎ Draft'}
                        </span>
                      </div>
                      <div style={{ fontSize: '12px', color: '#6b7280', lineHeight: 1.6, marginBottom: '8px' }}>
                        {selected.description ?? 'Interactive lab component.'}
                      </div>
                      <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                        {selected.grade && (
                          <span style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '11px', color: '#9ca3af' }}>
                            <Layers size={11} /> {selected.grade}
                          </span>
                        )}
                        {selected.topic && (
                          <span style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '11px', color: '#9ca3af' }}>
                            <Tag size={11} /> {selected.topic}
                          </span>
                        )}
                        <span style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '11px', color: '#9ca3af' }}>
                          <Cpu size={11} /> {selected.widgetType}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Actions */}
                  <div style={{ display: 'flex', gap: '6px', flexShrink: 0 }}>
                    {(selected.type === 'ai' || selected.type === 'uploaded') && (
                      <button onClick={() => setDeleteTarget(selected)}
                        style={{ display: 'flex', alignItems: 'center', gap: '5px', padding: '6px 12px', border: '1px solid #fecaca', borderRadius: '7px', background: '#fff', color: '#ef4444', fontSize: '12px', cursor: 'pointer' }}
                        onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = '#fef2f2'; }}
                        onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = '#fff'; }}>
                        <Trash2 size={12} /> Delete
                      </button>
                    )}
                  </div>
                </div>

                {/* Live preview */}
                <div style={{ marginBottom: '12px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '7px', marginBottom: '10px' }}>
                    <Eye size={13} style={{ color: '#6b7280' }} />
                    <span style={{ fontSize: '12px', fontWeight: 600, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Live preview</span>
                    <div style={{ flex: 1, height: '1px', background: '#e8eaed' }} />
                  </div>
                  <LabHost
                    widgetType={selected.widgetType}
                    readonly={false}
                    pendingCommands={pendingCommands}
                    onConsumeCommands={consumeCommands}
                  />
                </div>
              </>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#9ca3af' }}>
                <FlaskConical size={48} style={{ color: '#e5e7eb', marginBottom: '14px' }} />
                <div style={{ fontSize: '15px', fontWeight: 600, color: '#6b7280' }}>Select a lab to preview</div>
              </div>
            )}
          </div>
        </div>

        {/* ── Right: AI Chat ── */}
        {showChat && (
          <div style={{ width: '360px', borderLeft: '1px solid #e8eaed', display: 'flex', flexDirection: 'column', flexShrink: 0, position: 'relative' }}>
            <div style={{ padding: '10px 14px', borderBottom: '1px solid #e8eaed', background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <div style={{ width: '26px', height: '26px', borderRadius: '7px', background: 'linear-gradient(135deg,#3b5bdb,#7c3aed)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Sparkles size={13} style={{ color: '#fff' }} />
                </div>
                <div>
                  <div style={{ fontSize: '13px', fontWeight: 700, color: '#0f0f23', lineHeight: 1 }}>AI Lab Builder</div>
                  <div style={{ fontSize: '10px', color: '#9ca3af', marginTop: '1px' }}>Drive catalog lab or generate → Drafts</div>
                </div>
              </div>
              <button onClick={() => setShowChat(false)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9ca3af', display: 'flex', alignItems: 'center', padding: '4px' }}
                onMouseEnter={e => (e.currentTarget as HTMLElement).style.color = '#374151'}
                onMouseLeave={e => (e.currentTarget as HTMLElement).style.color = '#9ca3af'}>
                <X size={15} />
              </button>
            </div>

            <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
              <AIChatPanel
                variant="full"
                onLabGenerated={handleLabCommit}
              />
            </div>
          </div>
        )}
      </div>

      {deleteTarget && (
        <DeleteModal
          lab={deleteTarget}
          onConfirm={() => handleDelete(deleteTarget)}
          onCancel={() => setDeleteTarget(null)}
        />
      )}

      <ConfirmGenerateResetModal
        open={pendingCatalogSelect !== null || pendingCatalogDeselect}
        intent={pendingCatalogDeselect ? 'deselect' : 'switch_lab'}
        targetTitle={
          pendingCatalogDeselect
            ? (selected?.label ?? 'Current Lab')
            : (pendingCatalogSelect?.label ?? '')
        }
        onCancel={() => {
          setPendingCatalogSelect(null);
          setPendingCatalogDeselect(false);
        }}
        onConfirm={() => {
          if (pendingCatalogDeselect) {
            setPendingCatalogDeselect(false);
            clearCatalogSelection();
            setPendingCatalogSelect(null);
            return;
          }
          const lab = pendingCatalogSelect;
          setPendingCatalogSelect(null);
          if (lab) applyCatalogSelection(lab);
        }}
      />
    </TeacherLayout>
  );
}
