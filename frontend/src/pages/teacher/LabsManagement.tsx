import { useState, useTransition, useCallback } from 'react';
import { useNavigate } from 'react-router';
import TeacherLayout from '../../components/teacher/TeacherLayout';
import LabHost, { STATIC_WIDGETS } from '../../components/labs/LabHost';
import AIChatPanel from '../../components/labs/AIChatPanel';
import { MOCK_DYNAMIC_DEFS, WidgetRegistry } from '../../components/labs/LabRegistry';
import type { LabComponentDefinition } from '../../components/labs/types';
import {
  Search, Sparkles, FlaskConical, Eye, Trash2,
  CheckCircle2, Tag, Cpu, BookOpen, ChevronRight,
  X, Layers, Box,
} from 'lucide-react';
import { CustomSelect } from '../../components/teacher/CustomSelect';

// ── Subject palette ──────────────────────────────────────────────────────────
const SUBJ: Record<string, { bg: string; color: string; dot: string; emoji: string }> = {
  Math:      { bg: '#eff6ff', color: '#1e40af', dot: '#3b5bdb', emoji: '📐' },
  Physics:   { bg: '#fef3c7', color: '#92400e', dot: '#f59e0b', emoji: '⚡' },
  Chemistry: { bg: '#fdf4ff', color: '#6b21a8', dot: '#a855f7', emoji: '⚗️' },
  Biology:   { bg: '#f0fdf4', color: '#166534', dot: '#22c55e', emoji: '🔬' },
  Dynamic:   { bg: '#f3f4f6', color: '#374151', dot: '#6b7280', emoji: '���' },
};
function ss(subj: string) { return SUBJ[subj] ?? SUBJ.Dynamic; }

// ── Dimension map for static widgets ─────────────────────────────────────────
const STATIC_DIMENSION: Record<string, '2d' | '3d'> = {
  'math.function_graph': '2d',
  'math.geometry_3d':    '3d',
  'physics.circuit':     '2d',
  'physics.mechanics':   '3d',
  'chem.molecule':       '3d',
  'bio.cell':            '3d',
};

function dynSubject(lab: LabComponentDefinition) {
  const m: Record<string, string> = {
    math: 'Math', physics: 'Physics', chemistry: 'Chemistry', biology: 'Biology',
  };
  return m[lab.subjectLab] ?? 'Dynamic';
}

function dynDimension(lab: LabComponentDefinition): '2d' | '3d' {
  const t = (lab.title + ' ' + (lab.description ?? '')).toLowerCase();
  return t.includes('3d') || t.includes('three') || t.includes('surface') ? '3d' : '2d';
}

// ── Unified lab descriptor ───────────────────────────────────────────────────
interface LabItem {
  id: string; label: string; subject: string; emoji: string;
  type: 'builtin' | 'dynamic'; widgetType: string; description?: string;
  status: 'published' | 'draft' | 'deprecated';
  grade?: string; topic?: string;
  dimension: '2d' | '3d';
}

function buildCatalog(dynDefs: LabComponentDefinition[]): LabItem[] {
  const builtin: LabItem[] = STATIC_WIDGETS.map(w => ({
    id: w.widgetType, label: w.label, subject: w.subject, emoji: w.emoji,
    type: 'builtin', widgetType: w.widgetType,
    description: `Built-in ${w.subject} interactive lab component.`,
    status: 'published', dimension: STATIC_DIMENSION[w.widgetType] ?? '3d',
  }));
  const dynamic: LabItem[] = dynDefs.map(d => ({
    id: d.registryKey, label: d.title, subject: dynSubject(d), emoji: '✨',
    type: 'dynamic', widgetType: d.registryKey, description: d.description,
    status: d.status, grade: d.metadata?.grade, topic: d.metadata?.topic,
    dimension: dynDimension(d),
  }));
  return [...builtin, ...dynamic];
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
          <strong style={{ color: '#374151' }}>{lab.label}</strong> will be permanently removed from the registry.
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

  const [dynDefs, setDynDefs] = useState<LabComponentDefinition[]>(MOCK_DYNAMIC_DEFS);
  const [search, setSearch] = useState('');
  const [filterSubject, setFilterSubject] = useState('');
  const [filterType, setFilterType] = useState<'all' | 'builtin' | 'dynamic'>('all');
  const [filterDimension, setFilterDimension] = useState<'' | '2d' | '3d'>('');
  const [selectedId, setSelectedId] = useState<string>(STATIC_WIDGETS[0]?.widgetType ?? '');
  const [deleteTarget, setDeleteTarget] = useState<LabItem | null>(null);
  const [showChat, setShowChat] = useState(true);

  const catalog = buildCatalog(dynDefs);

  const filtered = catalog.filter(lab =>
    (!search || lab.label.toLowerCase().includes(search.toLowerCase()) ||
      (lab.description ?? '').toLowerCase().includes(search.toLowerCase())) &&
    (!filterSubject || lab.subject === filterSubject) &&
    (!filterDimension || lab.dimension === filterDimension) &&
    (filterType === 'all' || lab.type === filterType)
  );

  const selected = catalog.find(l => l.id === selectedId) ?? catalog[0];
  const selectedSty = selected ? ss(selected.subject) : ss('Dynamic');

  function selectLab(id: string) {
    startTransition(() => setSelectedId(id));
  }

  function handleLabGenerated(def: LabComponentDefinition) {
    setDynDefs(prev =>
      prev.some(d => d.registryKey === def.registryKey) ? prev : [...prev, def]
    );
    WidgetRegistry.registerDynamic(def);
    startTransition(() => setSelectedId(def.registryKey));
  }

  function handleDelete(lab: LabItem) {
    setDynDefs(prev => prev.filter(d => d.registryKey !== lab.widgetType));
    if (selectedId === lab.id) {
      startTransition(() => setSelectedId(STATIC_WIDGETS[0]?.widgetType ?? ''));
    }
    setDeleteTarget(null);
  }

  const subjects = Array.from(new Set(catalog.map(l => l.subject)));
  const builtinCount = catalog.filter(l => l.type === 'builtin').length;
  const dynamicCount = catalog.filter(l => l.type === 'dynamic').length;
  const publishedCount = catalog.filter(l => l.status === 'published').length;

  const ALL_SUBJECTS = ['Math', 'Physics', 'Chemistry', 'Biology'];

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
                {filtered.length} / {catalog.length}
              </span>
            </div>

            {/* Search */}
            <div style={{ position: 'relative', marginBottom: '10px' }}>
              <Search size={12} style={{ position: 'absolute', left: '9px', top: '50%', transform: 'translateY(-50%)', color: '#9ca3af' }} />
              <input value={search} onChange={e => setSearch(e.target.value)}
                placeholder="Search labs…"
                style={{ width: '100%', padding: '7px 8px 7px 28px', border: '1px solid #e8eaed', borderRadius: '7px', fontSize: '12px', outline: 'none', boxSizing: 'border-box', background: '#fff' }} />
            </div>

            {/* ── Source tabs: All | User Uploaded | AI Generated ── */}
            <div style={{ display: 'flex', background: '#f3f4f6', borderRadius: '8px', padding: '2px', gap: '1px', marginBottom: '12px' }}>
              {([
                ['all',     'All'],
                ['builtin', 'Uploaded'],
                ['dynamic', 'AI Generated'],
              ] as const).map(([val, label]) => (
                <button key={val} onClick={() => setFilterType(val)}
                  style={{ flex: 1, padding: '5px 0', borderRadius: '6px', border: 'none', background: filterType === val ? '#fff' : 'transparent', color: filterType === val ? '#0f0f23' : '#6b7280', fontSize: '10px', cursor: 'pointer', fontWeight: filterType === val ? 700 : 400, boxShadow: filterType === val ? '0 1px 3px rgba(0,0,0,0.08)' : 'none', transition: 'all 0.12s', whiteSpace: 'nowrap' }}>
                  {label}
                </button>
              ))}
            </div>

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
                options={['All Subjects', ...ALL_SUBJECTS]}
                value={filterSubject === '' ? 'All Subjects' : filterSubject}
                onChange={v => setFilterSubject(v === 'All Subjects' ? '' : v)}
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
                  <button key={lab.id} onClick={() => selectLab(lab.id)}
                    style={{ width: '100%', display: 'flex', alignItems: 'center', gap: '10px', padding: '9px 10px', borderRadius: '8px', border: `1px solid ${isActive ? '#3b5bdb' : 'transparent'}`, background: isActive ? '#eff6ff' : 'transparent', cursor: 'pointer', textAlign: 'left', marginBottom: '3px', transition: 'all 0.12s' }}
                    onMouseEnter={e => { if (!isActive) (e.currentTarget as HTMLElement).style.background = '#f3f4f6'; }}
                    onMouseLeave={e => { if (!isActive) (e.currentTarget as HTMLElement).style.background = 'transparent'; }}>

                    {/* Subject dot + emoji */}
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
                        {lab.type === 'dynamic' && (
                          <span style={{ fontSize: '9px', color: '#7c3aed', background: '#fdf4ff', padding: '1px 5px', borderRadius: '4px', fontWeight: 600 }}>
                            AI
                          </span>
                        )}
                        {lab.status === 'draft' && (
                          <span style={{ fontSize: '9px', color: '#92400e', background: '#fffbeb', padding: '1px 5px', borderRadius: '4px', fontWeight: 600 }}>
                            Draft
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
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: '#9ca3af' }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                <Cpu size={11} /> {builtinCount} built-in
              </span>
              <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                <Sparkles size={11} /> {dynamicCount} AI
              </span>
              <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                <CheckCircle2 size={11} style={{ color: '#059669' }} /> {publishedCount} published
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
              <span style={{ fontSize: '14px', fontWeight: 700, color: '#0f0f23' }}>Lab Management</span>
            </div>
            <div style={{ display: 'flex', gap: '7px', alignItems: 'center' }}>
              {selected && (
                <button onClick={() => navigate(`/teacher/lesson-editor/new`)}
                  style={{ display: 'flex', alignItems: 'center', gap: '5px', padding: '5px 12px', border: '1px solid #e8eaed', borderRadius: '7px', background: '#fff', color: '#374151', fontSize: '12px', cursor: 'pointer' }}>
                  <BookOpen size={13} /> Use in Lesson
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
                {/* Lab info header */}
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
                        {selected.type === 'dynamic' && (
                          <span style={{ fontSize: '10px', fontWeight: 600, color: '#7c3aed', background: '#fdf4ff', padding: '2px 8px', borderRadius: '5px', display: 'flex', alignItems: 'center', gap: '3px' }}>
                            <Sparkles size={9} /> AI Generated
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
                    {selected.type === 'dynamic' && (
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
                    <span style={{ fontSize: '12px', fontWeight: 600, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Live Preview</span>
                    <div style={{ flex: 1, height: '1px', background: '#e8eaed' }} />
                  </div>
                  <LabHost widgetType={selected.widgetType} readonly={false} />
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
            {/* Chat panel header override */}
            <div style={{ padding: '10px 14px', borderBottom: '1px solid #e8eaed', background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <div style={{ width: '26px', height: '26px', borderRadius: '7px', background: 'linear-gradient(135deg,#3b5bdb,#7c3aed)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Sparkles size={13} style={{ color: '#fff' }} />
                </div>
                <div>
                  <div style={{ fontSize: '13px', fontWeight: 700, color: '#0f0f23', lineHeight: 1 }}>AI Lab Builder</div>
                  <div style={{ fontSize: '10px', color: '#9ca3af', marginTop: '1px' }}>Describe a lab to generate it</div>
                </div>
              </div>
              <button onClick={() => setShowChat(false)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9ca3af', display: 'flex', alignItems: 'center', padding: '4px' }}
                onMouseEnter={e => (e.currentTarget as HTMLElement).style.color = '#374151'}
                onMouseLeave={e => (e.currentTarget as HTMLElement).style.color = '#9ca3af'}>
                <X size={15} />
              </button>
            </div>

            {/* AI Chat panel (generate mode only) */}
            <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
              <AIChatPanelGenerateOnly onLabGenerated={handleLabGenerated} />
            </div>
          </div>
        )}
      </div>

      {/* Delete modal */}
      {deleteTarget && (
        <DeleteModal
          lab={deleteTarget}
          onConfirm={() => handleDelete(deleteTarget)}
          onCancel={() => setDeleteTarget(null)}
        />
      )}
    </TeacherLayout>
  );
}

// ── AIChatPanel locked to generate mode ─────────────────────────────────────
// We wrap the existing AIChatPanel but force it into generate mode
// by rendering it without a widgetType (which defaults to generate mode).
function AIChatPanelGenerateOnly({ onLabGenerated }: { onLabGenerated: (def: LabComponentDefinition) => void }) {
  return (
    <AIChatPanel
      onLabGenerated={onLabGenerated}
      onApplyCommands={() => {}}
      compact
    />
  );
}