import { useState, useEffect, useTransition, useMemo } from 'react';
import TeacherLayout from '../../components/teacher/TeacherLayout';
import LabHost from '../../components/labs/LabHost';
import AIChatPanel, { type LabGeneratedOptions } from '../../components/labs/AIChatPanel';
import { useChat } from '../../components/labs/ChatContext';
import { useLabs } from '../../components/labs/LabsContext';
import type { LabEntry } from '../../components/labs/LabsContext';
import type { LabComponentDefinition } from '../../components/labs/types';
import { parseLabDefinitionJson } from '../../components/labs/parseLabDefinition';
import {
  FlaskConical, Upload, Sparkles, FileJson,
  Trash2, Send, Search, X, Eye, Tag, Cpu, Layers, ChevronRight,
} from 'lucide-react';

const SOURCE_META: Record<string, { emoji: string; label: string; color: string; bg: string }> = {
  uploaded: { emoji: '📤', label: 'Upload', color: '#0369a1', bg: '#e0f2fe' },
  ai:      { emoji: '✨', label: 'AI',    color: '#7c3aed', bg: '#fdf4ff' },
  builtin: { emoji: '⚙️',  label: 'Built-in', color: '#374151', bg: '#f3f4f6' },
};

const SUBJ: Record<string, { bg: string; color: string; dot: string; emoji: string }> = {
  Math:      { bg: '#eff6ff', color: '#1e40af', dot: '#3b5bdb', emoji: '📐' },
  Physics:   { bg: '#fef3c7', color: '#92400e', dot: '#f59e0b', emoji: '⚡' },
  Chemistry: { bg: '#fdf4ff', color: '#6b21a8', dot: '#a855f7', emoji: '⚗️' },
  Biology:   { bg: '#f0fdf4', color: '#166534', dot: '#22c55e', emoji: '🔬' },
  Dynamic:   { bg: '#f3f4f6', color: '#374151', dot: '#6b7280', emoji: '⚙️' },
};
function ss(subj: string) { return SUBJ[subj] ?? SUBJ.Dynamic; }

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

function DeleteModal({
  entry,
  onConfirm,
  onCancel,
}: {
  entry: LabEntry;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 80,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}
      onClick={onCancel}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: '#fff', borderRadius: '14px', padding: '28px',
          maxWidth: '360px', width: '90%', textAlign: 'center',
          boxShadow: '0 20px 60px rgba(0,0,0,0.15)',
        }}
      >
        <div
          style={{
            width: '48px', height: '48px', borderRadius: '14px', background: '#fef2f2',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            margin: '0 auto 14px', fontSize: '22px',
          }}
        >
          🗑️
        </div>
        <div style={{ fontSize: '16px', fontWeight: 700, color: '#0f0f23', marginBottom: '8px' }}>
          Delete draft?
        </div>
        <div style={{ fontSize: '13px', color: '#6b7280', marginBottom: '22px', lineHeight: 1.6 }}>
          <strong style={{ color: '#374151' }}>{entry.def.title}</strong> will be removed from this workspace and the catalog (if saved on the server).
        </div>
        <div style={{ display: 'flex', gap: '10px', justifyContent: 'center' }}>
          <button
            onClick={onCancel}
            style={{
              padding: '8px 22px', border: '1px solid #e8eaed', borderRadius: '8px',
              background: '#fff', fontSize: '13px', cursor: 'pointer', color: '#374151',
            }}
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            style={{
              padding: '8px 22px', border: 'none', borderRadius: '8px',
              background: '#ef4444', color: '#fff', fontSize: '13px', fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Delete
          </button>
        </div>
      </div>
    </div>
  );
}

function UploadZone({
  onParsed,
  compact,
}: {
  onParsed: (def: LabComponentDefinition) => void;
  compact?: boolean;
}) {
  const [hover, setHover] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function handleFile(file: File) {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const raw = JSON.parse(String(reader.result ?? '')) as unknown;
        const res = parseLabDefinitionJson(raw);
        if (!res.ok) { setError(res.error); return; }
        onParsed(res.definition);
        setError(null);
      } catch {
        setError('Could not parse JSON. Check that the file is valid UTF-8 text.');
      }
    };
    reader.onerror = () => setError('Failed to read file');
    reader.readAsText(file, 'UTF-8');
  }

  const pad = compact ? '10px 8px' : '14px 16px';
  const fs = compact ? '10px' : '12px';

  return (
    <div>
      <div
        onDragOver={e => { e.preventDefault(); setHover(true); }}
        onDragLeave={() => setHover(false)}
        onDrop={e => {
          e.preventDefault();
          setHover(false);
          const f = e.dataTransfer.files?.[0];
          if (f && (f.type === 'application/json' || f.name.toLowerCase().endsWith('.json'))) {
            handleFile(f);
          } else {
            setError('Please drop a .json file');
          }
        }}
        onClick={() => {
          const i = document.createElement('input');
          i.type = 'file';
          i.accept = '.json,application/json';
          i.onchange = () => { const f = i.files?.[0]; if (f) handleFile(f); };
          i.click();
        }}
        style={{
          display: 'flex', flexDirection: compact ? 'column' : 'row',
          alignItems: 'center', justifyContent: 'center', gap: compact ? '6px' : '8px',
          padding: pad, borderRadius: '10px',
          border: `1.5px dashed ${hover ? '#3b5bdb' : '#d1d5db'}`,
          background: hover ? '#eff6ff' : '#fafafa',
          cursor: 'pointer', fontSize: fs, fontWeight: 600, color: '#374151',
          transition: 'all 0.15s', textAlign: 'center',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <Upload size={compact ? 13 : 15} style={{ color: '#3b5bdb' }} />
          <FileJson size={compact ? 13 : 15} style={{ color: '#6366f1' }} />
        </div>
        <span>{compact ? 'Upload lab JSON (draft)' : 'Upload lab JSON (save as draft)'}</span>
      </div>
      {error && (
        <div style={{
          marginTop: '6px', fontSize: '10px', color: '#b91c1c',
          display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '6px',
        }}>
          <span>{error}</span>
          <button
            type="button"
            onClick={() => setError(null)}
            style={{
              background: 'none', border: 'none', color: '#6b7280', cursor: 'pointer',
              fontSize: '10px', flexShrink: 0,
            }}
          >
            Clear
          </button>
        </div>
      )}
    </div>
  );
}

export default function LabsDrafts() {
  const { workspaceLabs, publishLab, deleteLab, saveDraft, mergeLab } = useLabs();
  const { setWidgetType, mode: chatMode, pendingCommands, consumeCommands, setGenerateBaseRegistryKey } = useChat();
  const [, startTransition] = useTransition();

  const [search, setSearch] = useState('');
  const [filterSource, setFilterSource] = useState<'' | 'uploaded' | 'ai'>('');
  const [deleteTarget, setDeleteTarget] = useState<LabEntry | null>(null);
  const [showChat, setShowChat] = useState(true);
  const [selectedKey, setSelectedKey] = useState<string>('');

  const filtered = useMemo(() => workspaceLabs.filter(e => {
    const q = search.toLowerCase();
    return (
      (!q ||
        e.def.title.toLowerCase().includes(q) ||
        (e.def.description ?? '').toLowerCase().includes(q) ||
        e.def.registryKey.toLowerCase().includes(q)) &&
      (!filterSource || e.source === filterSource)
    );
  }), [workspaceLabs, search, filterSource]);

  const workspaceDraftCount = useMemo(
    () => workspaceLabs.filter(e => e.def.status === 'draft').length,
    [workspaceLabs],
  );
  const workspacePublishedCount = useMemo(
    () => workspaceLabs.filter(e => e.def.status === 'published').length,
    [workspaceLabs],
  );

  const selectedEntry = useMemo(() => {
    if (filtered.length === 0) return null;
    const byKey = filtered.find(e => e.def.registryKey === selectedKey);
    return byKey ?? filtered[0];
  }, [filtered, selectedKey]);

  useEffect(() => {
    if (filtered.length === 0) {
      startTransition(() => setSelectedKey(''));
      return;
    }
    if (!filtered.some(e => e.def.registryKey === selectedKey)) {
      startTransition(() => setSelectedKey(filtered[0].def.registryKey));
    }
  }, [filtered, selectedKey, startTransition]);

  /** 仅在 Drive 模式下同步当前草稿 → 后端会话目标；Generate 下切换列表不清空聊天 */
  useEffect(() => {
    if (chatMode !== 'drive_lab') return;
    if (selectedEntry) {
      setWidgetType(selectedEntry.def.registryKey);
    } else {
      setWidgetType(undefined);
    }
  }, [chatMode, selectedEntry?.def.registryKey, setWidgetType]);

  /** Generate 模式：把左侧选中的草稿 registry_key 传给后端，用于基于该实验迭代 */
  useEffect(() => {
    setGenerateBaseRegistryKey(selectedEntry?.def.registryKey);
    return () => setGenerateBaseRegistryKey(undefined);
  }, [selectedEntry?.def.registryKey, setGenerateBaseRegistryKey]);

  function selectDraft(registryKey: string) {
    startTransition(() => setSelectedKey(registryKey));
  }

  async function handlePublish(registryKey: string) {
    await publishLab(registryKey);
  }

  async function handleDelete(entry: LabEntry) {
    const key = entry.def.registryKey;
    await deleteLab(key);
    setDeleteTarget(null);
    if (selectedKey === key) {
      startTransition(() => setSelectedKey(''));
    }
  }

  async function handleLabCommit(def: LabComponentDefinition, options?: LabGeneratedOptions) {
    mergeLab(def, 'ai');
    startTransition(() => setSelectedKey(def.registryKey));
    if (options?.status === 'published') {
      await publishLab(def.registryKey);
    }
  }

  function handleUploadParsed(def: LabComponentDefinition) {
    saveDraft(def, 'uploaded');
    startTransition(() => setSelectedKey(def.registryKey));
  }

  const selectedSty = selectedEntry ? ss(dynSubject(selectedEntry.def)) : ss('Dynamic');
  const dim = selectedEntry ? dynDimension(selectedEntry.def) : '2d';
  const srcMeta = selectedEntry ? (SOURCE_META[selectedEntry.source] ?? SOURCE_META.builtin) : null;

  return (
    <TeacherLayout>
      <div style={{
        display: 'flex', height: 'calc(100vh - 48px)', overflow: 'hidden',
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      }}>

        {/* Left: draft list + upload */}
        <div style={{
          width: '272px', borderRight: '1px solid #e8eaed',
          display: 'flex', flexDirection: 'column', flexShrink: 0, background: '#fafafa',
        }}>
          <div style={{ padding: '14px', borderBottom: '1px solid #e8eaed', flexShrink: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
              <div style={{
                width: '28px', height: '28px', borderRadius: '8px',
                background: 'linear-gradient(135deg,#fbbf24,#f59e0b)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <FileJson size={14} style={{ color: '#fff' }} />
              </div>
              <div>
                <div style={{ fontSize: '14px', fontWeight: 700, color: '#0f0f23' }}>Drafts</div>
                <div style={{ fontSize: '10px', color: '#9ca3af', lineHeight: 1.35 }}>
                  {workspaceLabs.length} {workspaceLabs.length === 1 ? 'lab' : 'labs'}
                  {workspaceLabs.length > 0 && (
                    <span style={{ display: 'block', marginTop: '2px' }}>
                      {workspaceDraftCount} draft · {workspacePublishedCount} published
                    </span>
                  )}
                </div>
              </div>
              <span style={{
                marginLeft: 'auto', fontSize: '10px', padding: '2px 7px',
                borderRadius: '5px', background: '#fef3c7', color: '#92400e', fontWeight: 600,
              }}>
                Workspace
              </span>
            </div>

            <div style={{ position: 'relative', marginBottom: '10px' }}>
              <Search size={12} style={{ position: 'absolute', left: '9px', top: '50%', transform: 'translateY(-50%)', color: '#9ca3af' }} />
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search drafts…"
                style={{
                  width: '100%', padding: '7px 8px 7px 28px', border: '1px solid #e8eaed',
                  borderRadius: '7px', fontSize: '12px', outline: 'none', boxSizing: 'border-box',
                  background: '#fff',
                }}
              />
            </div>

            <div style={{ display: 'flex', gap: '4px' }}>
              {([
                ['',         'All'],
                ['uploaded', 'Upload'],
                ['ai',       'AI'],
              ] as const).map(([val, label]) => (
                <button
                  key={val}
                  type="button"
                  onClick={() => setFilterSource(val)}
                  style={{
                    flex: 1, padding: '5px 0', borderRadius: '6px', border: 'none',
                    background: filterSource === val ? '#fff' : 'transparent',
                    color: filterSource === val ? '#0f0f23' : '#6b7280',
                    fontSize: '10px', cursor: 'pointer', fontWeight: filterSource === val ? 700 : 400,
                    boxShadow: filterSource === val ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
                    transition: 'all 0.12s',
                  }}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div style={{ flex: 1, overflowY: 'auto', padding: '8px', minHeight: 0 }}>
            {filtered.length === 0 ? (
              <div style={{ padding: '24px 12px', textAlign: 'center', color: '#9ca3af' }}>
                <FileJson size={28} style={{ color: '#e5e7eb', marginBottom: '8px' }} />
                <div style={{ fontSize: '12px' }}>
                  {workspaceLabs.length === 0 ? 'No labs yet' : 'No matching labs'}
                </div>
              </div>
            ) : (
              filtered.map(entry => {
                const src = SOURCE_META[entry.source] ?? SOURCE_META.builtin;
                const active = selectedEntry?.def.registryKey === entry.def.registryKey;
                const isPub = entry.def.status === 'published';
                return (
                  <div
                    key={entry.def.registryKey}
                    role="button"
                    tabIndex={0}
                    onClick={() => selectDraft(entry.def.registryKey)}
                    onKeyDown={e => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        selectDraft(entry.def.registryKey);
                      }
                    }}
                    style={{
                      width: '100%', display: 'flex', alignItems: 'stretch', gap: '6px',
                      padding: '7px 8px', borderRadius: '8px',
                      border: `1px solid ${active ? '#3b5bdb' : '#e8eaed'}`,
                      background: active ? '#eff6ff' : '#fff', marginBottom: '4px',
                      boxShadow: '0 1px 3px rgba(0,0,0,0.04)', cursor: 'pointer', textAlign: 'left',
                    }}
                  >
                    <div
                      style={{
                        flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: '10px',
                      }}
                    >
                      <div style={{
                        width: '36px', height: '36px', borderRadius: '9px',
                        background: src.bg, display: 'flex', alignItems: 'center',
                        justifyContent: 'center', fontSize: '18px', flexShrink: 0,
                      }}>
                        {src.emoji}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{
                          fontSize: '12px', fontWeight: 600, color: active ? '#1e40af' : '#1f2937',
                          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                          marginBottom: '3px',
                        }}>
                          {entry.def.title}
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '5px', flexWrap: 'wrap' }}>
                          <span style={{
                            fontSize: '9px', color: src.color, background: src.bg,
                            padding: '1px 5px', borderRadius: '4px', fontWeight: 600,
                          }}>
                            {src.label}
                          </span>
                          <span style={{
                            fontSize: '9px', fontWeight: 600, padding: '1px 5px', borderRadius: '4px',
                            ...(isPub
                              ? { color: '#065f46', background: '#d1fae5' }
                              : { color: '#92400e', background: '#fffbeb' }),
                          }}>
                            {isPub ? 'Published' : 'Draft'}
                          </span>
                        </div>
                      </div>
                      {active && <ChevronRight size={12} style={{ color: '#3b5bdb', flexShrink: 0, alignSelf: 'center' }} />}
                    </div>
                    <div
                      style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: '4px', flexShrink: 0 }}
                      onClick={e => e.stopPropagation()}
                      onKeyDown={e => e.stopPropagation()}
                      role="presentation"
                    >
                      <button
                        type="button"
                        title="Delete"
                        onClick={e => { e.stopPropagation(); setDeleteTarget(entry); }}
                        style={{
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          width: '28px', height: '26px', padding: 0, borderRadius: '6px',
                          border: '1px solid #fecaca', background: '#fff', color: '#ef4444', cursor: 'pointer',
                        }}
                      >
                        <Trash2 size={12} />
                      </button>
                      {!isPub && (
                        <button
                          type="button"
                          title="Publish"
                          onClick={e => {
                            e.stopPropagation();
                            void handlePublish(entry.def.registryKey);
                          }}
                          style={{
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            width: '28px', height: '26px', padding: 0, borderRadius: '6px',
                            border: 'none', background: '#16a34a', color: '#fff', cursor: 'pointer',
                          }}
                        >
                          <Send size={11} />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Upload below draft list */}
          <div style={{
            padding: '10px 12px', borderTop: '1px solid #e8eaed',
            flexShrink: 0, background: '#fff',
          }}>
            <div style={{ fontSize: '10px', fontWeight: 600, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '8px' }}>
              Add draft
            </div>
            <UploadZone compact onParsed={handleUploadParsed} />
          </div>

          <div style={{
            padding: '8px 12px 10px', borderTop: '1px solid #e8eaed',
            flexShrink: 0, background: '#fafafa',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px', color: '#9ca3af' }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                <Upload size={11} />                 Upload {workspaceLabs.filter(e => e.source === 'uploaded').length}
              </span>
              <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                <Sparkles size={11} /> AI {workspaceLabs.filter(e => e.source === 'ai').length}
              </span>
            </div>
          </div>
        </div>

        {/* Center: metadata + live lab preview */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minWidth: 0 }}>
          <div style={{
            height: '48px', borderBottom: '1px solid #e8eaed', display: 'flex',
            alignItems: 'center', justifyContent: 'space-between', padding: '0 18px',
            flexShrink: 0, background: '#fff',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <FlaskConical size={15} style={{ color: '#f59e0b' }} />
              <span style={{ fontSize: '14px', fontWeight: 700, color: '#0f0f23' }}>Lab Drafts</span>
            </div>
            <button
              type="button"
              onClick={() => setShowChat(v => !v)}
              style={{
                display: 'flex', alignItems: 'center', gap: '5px', padding: '5px 12px',
                border: `1px solid ${showChat ? '#3b5bdb' : '#e8eaed'}`, borderRadius: '7px',
                background: showChat ? '#eff6ff' : '#fff', color: showChat ? '#3b5bdb' : '#6b7280',
                fontSize: '12px', cursor: 'pointer',
              }}
            >
              <Sparkles size={13} /> AI Chat
            </button>
          </div>

          <div style={{ flex: 1, overflowY: 'auto', padding: '24px', background: '#f8fafc' }}>
            {!selectedEntry ? (
              <div style={{
                display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                minHeight: '280px', color: '#9ca3af',
              }}>
                <FlaskConical size={48} style={{ color: '#e5e7eb', marginBottom: '14px' }} />
                <div style={{ fontSize: '15px', fontWeight: 600, color: '#6b7280' }}>
                  {workspaceLabs.length === 0 ? 'No labs to preview' : 'Select a lab to preview'}
                </div>
                <div style={{ fontSize: '12px', marginTop: '8px', textAlign: 'center', maxWidth: '320px' }}>
                  {workspaceLabs.length === 0
                    ? 'Upload JSON from the sidebar or generate with AI.'
                    : 'Choose a lab on the left to run the interactive preview here.'}
                </div>
              </div>
            ) : (
              <>
                <div style={{
                  background: '#fff', border: '1px solid #e8eaed', borderRadius: '12px',
                  padding: '18px 20px', marginBottom: '16px', display: 'flex',
                  alignItems: 'flex-start', justifyContent: 'space-between', gap: '16px',
                }}>
                  <div style={{ display: 'flex', gap: '14px', alignItems: 'flex-start', flex: 1, minWidth: 0 }}>
                    <div style={{
                      width: '50px', height: '50px', borderRadius: '13px', background: selectedSty.bg,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: '24px', flexShrink: 0,
                    }}>
                      {srcMeta?.emoji ?? '✨'}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '5px', flexWrap: 'wrap' }}>
                        <span style={{ fontSize: '16px', fontWeight: 700, color: '#0f0f23' }}>
                          {selectedEntry.def.title}
                        </span>
                        <span style={{
                          fontSize: '11px', fontWeight: 600, color: selectedSty.color,
                          background: selectedSty.bg, padding: '2px 8px', borderRadius: '5px',
                        }}>
                          {dynSubject(selectedEntry.def)}
                        </span>
                        {srcMeta && (
                          <span style={{
                            fontSize: '10px', fontWeight: 600, color: srcMeta.color, background: srcMeta.bg,
                            padding: '2px 8px', borderRadius: '5px',
                          }}>
                            {srcMeta.label}
                          </span>
                        )}
                        <span style={{
                          fontSize: '10px', fontWeight: 600, padding: '2px 8px', borderRadius: '5px',
                          ...(selectedEntry.def.status === 'published'
                            ? { background: '#d1fae5', color: '#065f46' }
                            : { background: '#fef3c7', color: '#92400e' }),
                        }}>
                          {selectedEntry.def.status === 'published' ? 'Published' : 'Draft'}
                        </span>
                      </div>
                      <div style={{ fontSize: '12px', color: '#6b7280', lineHeight: 1.6, marginBottom: '8px' }}>
                        {selectedEntry.def.description ?? 'No description'}
                      </div>
                      <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                        {selectedEntry.def.metadata?.grade && (
                          <span style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '11px', color: '#9ca3af' }}>
                            <Layers size={11} /> {selectedEntry.def.metadata.grade}
                          </span>
                        )}
                        {selectedEntry.def.metadata?.topic && (
                          <span style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '11px', color: '#9ca3af' }}>
                            <Tag size={11} /> {selectedEntry.def.metadata.topic}
                          </span>
                        )}
                        <span style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '11px', color: '#9ca3af' }}>
                          <Cpu size={11} /> {selectedEntry.def.registryKey}
                        </span>
                        <span style={{ fontSize: '11px', color: '#9ca3af' }}>{dim}</span>
                      </div>
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: '6px', flexShrink: 0, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                    <button
                      type="button"
                      onClick={() => setDeleteTarget(selectedEntry)}
                      style={{
                        display: 'flex', alignItems: 'center', gap: '5px', padding: '6px 12px',
                        border: '1px solid #fecaca', borderRadius: '7px', background: '#fff',
                        color: '#ef4444', fontSize: '12px', cursor: 'pointer',
                      }}
                    >
                      <Trash2 size={12} /> Delete
                    </button>
                    <button
                      type="button"
                      disabled={selectedEntry.def.status === 'published'}
                      onClick={() => void handlePublish(selectedEntry.def.registryKey)}
                      style={{
                        display: 'flex', alignItems: 'center', gap: '5px', padding: '6px 14px',
                        border: 'none', borderRadius: '7px',
                        background: selectedEntry.def.status === 'published' ? '#e5e7eb' : '#16a34a',
                        color: selectedEntry.def.status === 'published' ? '#9ca3af' : '#fff',
                        fontSize: '12px', fontWeight: 600,
                        cursor: selectedEntry.def.status === 'published' ? 'not-allowed' : 'pointer',
                      }}
                    >
                      <Send size={12} /> {selectedEntry.def.status === 'published' ? 'Published' : 'Publish'}
                    </button>
                  </div>
                </div>

                <div style={{ marginBottom: '12px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '7px', marginBottom: '10px' }}>
                    <Eye size={13} style={{ color: '#6b7280' }} />
                    <span style={{
                      fontSize: '12px', fontWeight: 600, color: '#6b7280',
                      textTransform: 'uppercase', letterSpacing: '0.05em',
                    }}>
                      Live preview
                    </span>
                    <div style={{ flex: 1, height: '1px', background: '#e8eaed' }} />
                  </div>
                  <LabHost
                    widgetType={selectedEntry.def.registryKey}
                    initialState={selectedEntry.def.initialState}
                    readonly={false}
                    pendingCommands={pendingCommands}
                    onConsumeCommands={consumeCommands}
                  />
                </div>
              </>
            )}
          </div>
        </div>

        {showChat && (
          <div style={{
            width: '360px', borderLeft: '1px solid #e8eaed', display: 'flex',
            flexDirection: 'column', flexShrink: 0, position: 'relative',
          }}>
            <div style={{
              padding: '10px 14px', borderBottom: '1px solid #e8eaed', background: '#fff',
              display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <div style={{
                  width: '26px', height: '26px', borderRadius: '7px',
                  background: 'linear-gradient(135deg,#3b5bdb,#7c3aed)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  <Sparkles size={13} style={{ color: '#fff' }} />
                </div>
                <div>
                  <div style={{ fontSize: '13px', fontWeight: 700, color: '#0f0f23', lineHeight: 1 }}>AI Lab Assistant</div>
                  <div style={{ fontSize: '10px', color: '#9ca3af', marginTop: '1px' }}>Drive preview or generate → Drafts</div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowChat(false)}
                style={{
                  background: 'none', border: 'none', cursor: 'pointer', color: '#9ca3af',
                  display: 'flex', alignItems: 'center', padding: '4px',
                }}
                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = '#374151'; }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = '#9ca3af'; }}
              >
                <X size={15} />
              </button>
            </div>

            <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
              <AIChatPanel variant="full" onLabGenerated={handleLabCommit} />
            </div>
          </div>
        )}
      </div>

      {deleteTarget && (
        <DeleteModal
          entry={deleteTarget}
          onConfirm={() => handleDelete(deleteTarget)}
          onCancel={() => setDeleteTarget(null)}
        />
      )}
    </TeacherLayout>
  );
}
