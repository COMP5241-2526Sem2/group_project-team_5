import { useState, useEffect, useLayoutEffect, useTransition, startTransition, useRef, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router';
import TeacherLayout from '../../components/teacher/TeacherLayout';
import LabHost, { STATIC_WIDGETS } from '../../components/labs/LabHost';
import AIChatPanel from '../../components/labs/AIChatPanel';
import { useChat } from '../../components/labs/ChatContext';
import { WidgetRegistry } from '../../components/labs/LabRegistry';
import { labsApi, fromBackend, labDefinitionToEmbeddedSnapshot, builtinLabEmbeddedSnapshot } from '../../api/labs';
import { lessonsApi, type LessonDetailApi } from '../../api/lessons';
import {
  Plus, Eye, Maximize2, ChevronRight, ChevronLeft,
  Sparkles, Save, ArrowLeft, FileText,
  LayoutGrid, Zap, X, Check, Loader2, ImagePlus,
} from 'lucide-react';
import type { LabComponentDefinition, LabCommand, LabState } from '../../components/labs/types';
import SlideContentCanvas from '../../components/teacher/SlideContentCanvas';
import type { WhiteboardLayout } from './whiteboardLayout';
import { syncWhiteboardLayout, addTextBox, flattenTextForBackend, parseSlideLayoutPayload } from './whiteboardLayout';

const MAX_SLIDE_IMAGE_BYTES = 2.5 * 1024 * 1024;

function subjectLabelToLabKey(subj: string): 'math' | 'physics' | 'chemistry' | 'biology' | 'dynamic' {
  const m: Record<string, 'math' | 'physics' | 'chemistry' | 'biology' | 'dynamic'> = {
    Math: 'math',
    Physics: 'physics',
    Chemistry: 'chemistry',
    Biology: 'biology',
    Dynamic: 'dynamic',
  };
  return m[subj] ?? 'dynamic';
}

interface EditorSlide {
  id: string;
  title: string;
  text: string;
  /** 展示用 URL 或 data URL（保存至后端 slide_blocks.image） */
  imageUrls?: string[];
  widgetType?: string;
  labState?: LabState;
  notes?: string;
  /** 白板布局；未编辑时可为空，保存时用 sync 合并 */
  slideLayout?: WhiteboardLayout | null;
  /** 嵌入的实验定义快照（API 形状），labs 中删除后仍凭此渲染 */
  labSnapshot?: Record<string, unknown> | null;
}

function mapLessonDetailToEditorSlides(data: LessonDetailApi): EditorSlide[] {
  if (!data.slides.length) {
    return [{ id: 'local1', title: 'New Slide', text: '', notes: '', imageUrls: [], slideLayout: null }];
  }
  return data.slides.map(s => ({
    id: `slide-${s.id}`,
    title: s.title,
    text: s.text,
    notes: s.notes ?? '',
    imageUrls: s.image_urls ?? [],
    widgetType: s.lab_registry_key ?? undefined,
    slideLayout: parseSlideLayoutPayload(s.slide_layout),
    labSnapshot: s.lab_snapshot ?? undefined,
  }));
}

/**
 * PUT 成功后合并服务端与本地：优先保留本次点击保存前内存里的 slideLayout/text，
 * 避免响应里 slide_layout 缺失时 setState 把白板打回默认几何（表现为「保存后立刻复原」）。
 */
function mergeEditorSlidesAfterSave(data: LessonDetailApi, previous: EditorSlide[]): EditorSlide[] {
  if (!data.slides.length) {
    return [{ id: 'local1', title: 'New Slide', text: '', notes: '', imageUrls: [], slideLayout: null }];
  }
  return data.slides.map((s, i) => {
    const local = previous[i];
    const parsed = parseSlideLayoutPayload(s.slide_layout);
    return {
      id: `slide-${s.id}`,
      title: s.title,
      text: local?.text ?? s.text,
      notes: s.notes ?? '',
      imageUrls: s.image_urls ?? [],
      widgetType: s.lab_registry_key ?? undefined,
      slideLayout: local?.slideLayout ?? parsed ?? null,
      labSnapshot: local?.labSnapshot ?? s.lab_snapshot ?? undefined,
    };
  });
}

const SUBJECT_STYLE: Record<string, { color: string; bg: string; dot: string }> = {
  Math:     { color: '#1e40af', bg: '#eff6ff', dot: '#3b5bdb' },
  Physics:  { color: '#92400e', bg: '#fef3c7', dot: '#f59e0b' },
  Chemistry:{ color: '#6b21a8', bg: '#fdf4ff', dot: '#a855f7' },
  Biology:  { color: '#166534', bg: '#f0fdf4', dot: '#22c55e' },
  Dynamic:  { color: '#374151', bg: '#f3f4f6', dot: '#6b7280' },
};

const BUILTIN_BADGE = { color: '#1d4ed8', bg: '#dbeafe' };
const REGISTERED_BADGE = { color: '#475569', bg: '#e2e8f0' };

type CatalogRow = { registry_key: string; title: string; subject_lab: string; status?: string };

function LabPickerModal({ onSelect, onClose, dynamicDefs }: {
  onSelect: (widgetType: string, def?: LabComponentDefinition) => void;
  onClose: () => void;
  dynamicDefs: LabComponentDefinition[];
}) {
  const [catalog, setCatalog] = useState<CatalogRow[]>([]);
  const [catLoading, setCatLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await labsApi.list({ statuses: ['published', 'draft'], page_size: 100 });
        const items = (res as { items?: (CatalogRow & { status?: string })[] }).items ?? [];
        if (alive) {
          setCatalog(
            items.map(i => ({
              registry_key: i.registry_key,
              title: i.title,
              subject_lab: i.subject_lab,
              status: typeof i.status === 'string' ? i.status : undefined,
            })),
          );
        }
      } catch {
        if (alive) setCatalog([]);
      } finally {
        if (alive) setCatLoading(false);
      }
    })();
    return () => { alive = false; };
  }, []);

  const builtInRows = STATIC_WIDGETS.map(w => ({
    kind: 'builtin' as const,
    widgetType: w.widgetType,
    label: w.label,
    discipline: w.subject,
    emoji: w.emoji,
  }));
  const registeredRows = dynamicDefs.map(d => ({
    kind: 'registered' as const,
    widgetType: d.registryKey,
    label: d.title,
    emoji: '✨' as const,
  }));

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 60, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px' }}
      onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{ background: '#fff', borderRadius: '14px', width: '100%', maxWidth: '580px', maxHeight: '85vh', overflow: 'hidden', boxShadow: '0 24px 80px rgba(0,0,0,0.2)', display: 'flex', flexDirection: 'column' }}>
        <div style={{ padding: '18px 20px', borderBottom: '1px solid #e8eaed', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <LayoutGrid size={16} style={{ color: '#3b5bdb' }} />
            <span style={{ fontSize: '15px', fontWeight: 700, color: '#0f0f23' }}>Insert Lab Component</span>
          </div>
          <button type="button" onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9ca3af' }}><X size={16} /></button>
        </div>
        <div style={{ padding: '16px', overflowY: 'auto', flex: 1 }}>
          <div style={{ fontSize: '11px', fontWeight: 700, color: '#6b7280', marginBottom: '8px', letterSpacing: '0.04em' }}>Lab library (Published · Drafts)</div>
          {catLoading ? (
            <div style={{ padding: '20px', textAlign: 'center', color: '#9ca3af', fontSize: '13px' }}><Loader2 size={18} style={{ animation: 'spin 1s linear infinite' }} /></div>
          ) : catalog.length === 0 ? (
            <div style={{ fontSize: '12px', color: '#9ca3af', marginBottom: '14px' }}>No labs match.</div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '18px' }}>
              {catalog.map(row => {
                const k = (row.subject_lab ?? 'dynamic').toLowerCase();
                const subj =
                  k === 'math' ? 'Math' :
                  k === 'physics' ? 'Physics' :
                  k === 'chemistry' ? 'Chemistry' :
                  k === 'biology' ? 'Biology' : 'Dynamic';
                const sty = SUBJECT_STYLE[subj] ?? SUBJECT_STYLE.Dynamic;
                const st = (row.status ?? '').toLowerCase();
                const statusLabel = st === 'draft' ? 'Draft' : st === 'published' ? 'Published' : row.status ?? '';
                return (
                  <button
                    key={row.registry_key}
                    type="button"
                    onClick={async () => {
                      try {
                        const raw = await labsApi.get(row.registry_key);
                        const def = fromBackend(raw as Parameters<typeof fromBackend>[0]);
                        WidgetRegistry.registerDynamic(def);
                        onSelect(row.registry_key, def);
                        onClose();
                      } catch {
                        onSelect(row.registry_key);
                        onClose();
                      }
                    }}
                    style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '14px', border: '1px solid #e8eaed', borderRadius: '10px', background: '#fff', cursor: 'pointer', textAlign: 'left' }}
                  >
                    <div style={{ width: '38px', height: '38px', borderRadius: '9px', background: sty.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '18px', flexShrink: 0 }}>🧪</div>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: '13px', fontWeight: 600, color: '#0f0f23', marginBottom: '2px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{row.title}</div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', alignItems: 'center' }}>
                        <span style={{ fontSize: '11px', color: sty.color, background: sty.bg, padding: '1px 6px', borderRadius: '4px', fontWeight: 600 }}>{subj}</span>
                        {statusLabel ? (
                          <span style={{ fontSize: '10px', color: '#64748b', background: '#f1f5f9', padding: '1px 5px', borderRadius: '4px', fontWeight: 600 }}>{statusLabel}</span>
                        ) : null}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}

          <div style={{ fontSize: '11px', fontWeight: 700, color: '#6b7280', marginBottom: '8px', letterSpacing: '0.04em' }}>Built-in templates · Registered</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
            {[...builtInRows, ...registeredRows].map(w => {
              const isReg = w.kind === 'registered';
              const sty = isReg
                ? REGISTERED_BADGE
                : (SUBJECT_STYLE[w.discipline] ?? SUBJECT_STYLE.Dynamic);
              const badge = isReg ? 'Registered' : 'Built-in';
              const badgeSt = isReg ? REGISTERED_BADGE : BUILTIN_BADGE;
              return (
                <button
                  key={`${w.kind}-${w.widgetType}`}
                  type="button"
                  onClick={() => { onSelect(w.widgetType); onClose(); }}
                  style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '14px', border: '1px solid #e8eaed', borderRadius: '10px', background: '#fff', cursor: 'pointer', textAlign: 'left' }}
                >
                  <div style={{ width: '38px', height: '38px', borderRadius: '9px', background: sty.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '20px', flexShrink: 0 }}>{w.emoji}</div>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: '13px', fontWeight: 600, color: '#0f0f23', marginBottom: '2px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{w.label}</div>
                    <div style={{ fontSize: '11px', color: badgeSt.color, background: badgeSt.bg, padding: '1px 6px', borderRadius: '4px', display: 'inline-block', fontWeight: 600 }}>{badge}</div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </div>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

export default function LessonEditor() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const isNew = id === 'new';

  const [deckTitle, setDeckTitle] = useState('Untitled lesson');
  const [subject, setSubject] = useState('physics');
  const [deckStatus, setDeckStatus] = useState<'draft' | 'published'>('draft');
  const [slides, setSlides] = useState<EditorSlide[]>([{ id: 'local1', title: 'New Slide', text: '', notes: '', imageUrls: [], slideLayout: null }]);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [showLabPicker, setShowLabPicker] = useState(false);
  const [showNotes, setShowNotes] = useState(false);
  const [showChat, setShowChat] = useState(true);
  const [dynamicDefs, setDynamicDefs] = useState<LabComponentDefinition[]>([]);
  const [saved, setSaved] = useState(false);
  const [loading, setLoading] = useState(!isNew);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [deckNumericId, setDeckNumericId] = useState<number | null>(() => (id && id !== 'new' ? Number(id) : null));

  const { setWidgetType, setGenerateBaseRegistryKey, pendingCommands, consumeCommands } = useChat();
  const imageFileInputRef = useRef<HTMLInputElement>(null);

  /** 当前编辑页与 AI 侧栏的 Drive/Generate 基准对齐（props 传入 AIChatPanel 无效，必须写回 ChatContext） */
  const slideForChat = slides[currentIdx];
  useEffect(() => {
    if (!slideForChat) return;
    setWidgetType(slideForChat.widgetType, slideForChat.title);
    setGenerateBaseRegistryKey(slideForChat.widgetType, slideForChat.title);
  }, [currentIdx, slideForChat?.id, slideForChat?.widgetType, slideForChat?.title, setWidgetType, setGenerateBaseRegistryKey]);

  useEffect(() => {
    if (!isNew) return;
    let cancelled = false;
    (async () => {
      try {
        const created = await lessonsApi.create({ title: 'Untitled lesson', subject: 'physics' });
        if (!cancelled) navigate(`/teacher/lesson-editor/${created.id}`, { replace: true });
      } catch (e) {
        if (!cancelled) setLoadError(e instanceof Error ? e.message : 'Failed to create lesson');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [isNew, navigate]);

  useEffect(() => {
    if (isNew || !id) return;
    const n = Number(id);
    if (!Number.isFinite(n)) {
      setLoadError('Invalid lesson id');
      setLoading(false);
      return;
    }
    setDeckNumericId(n);
    let cancelled = false;
    (async () => {
      setLoading(true);
      setLoadError(null);
      try {
        const data = await lessonsApi.get(n);
        if (cancelled) return;
        setDeckTitle(data.title);
        setSubject(data.subject);
        setDeckStatus(data.status);
        setSlides(mapLessonDetailToEditorSlides(data));
        setCurrentIdx(0);

        for (const s of data.slides) {
          if (!s.lab_registry_key) continue;
          try {
            const raw = await labsApi.get(s.lab_registry_key);
            const def = fromBackend(raw as Parameters<typeof fromBackend>[0]);
            WidgetRegistry.registerDynamic(def);
            if (!cancelled) {
              setDynamicDefs(prev => (prev.some(d => d.registryKey === def.registryKey) ? prev : [...prev, def]));
            }
          } catch {
            if (!cancelled && s.lab_snapshot) {
              try {
                const def = fromBackend(s.lab_snapshot as Parameters<typeof fromBackend>[0]);
                WidgetRegistry.registerDynamic(def);
                setDynamicDefs(prev => (prev.some(d => d.registryKey === def.registryKey) ? prev : [...prev, def]));
              } catch { /* corrupt snapshot */ }
            }
          }
        }
      } catch (e) {
        if (!cancelled) setLoadError(e instanceof Error ? e.message : 'Failed to load');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [id, isNew]);

  const current = slides[currentIdx];

  const embeddedLabFromSnapshot = useMemo(() => {
    const snap = current?.labSnapshot;
    if (!snap) return undefined;
    try {
      return fromBackend(snap as Parameters<typeof fromBackend>[0]);
    } catch {
      return undefined;
    }
  }, [current?.labSnapshot]);

  /** 保存时必须读最新 slides，避免刚改完白板尺寸就点保存仍用上一次的闭包 */
  const slidesRef = useRef(slides);
  slidesRef.current = slides;

  /** 插入实验后若 slideLayout 里还没有 lab 项，仅从 sync 渲染在画布上，保存会落默认几何；此处立刻写入 state */
  useLayoutEffect(() => {
    const sl = slides[currentIdx];
    if (!sl?.widgetType) return;
    if (sl.slideLayout?.items?.some(i => i.kind === 'lab')) return;
    const merged = syncWhiteboardLayout(
      { text: sl.text, imageUrls: sl.imageUrls, widgetType: sl.widgetType },
      sl.slideLayout ?? null,
      sl.id,
    );
    setSlides(prev =>
      prev.map((s, i) =>
        i === currentIdx ? { ...s, slideLayout: merged, text: flattenTextForBackend(merged) } : s,
      ),
    );
  }, [currentIdx, slides[currentIdx]?.widgetType, slides[currentIdx]?.id]);

  function updateCurrent(patch: Partial<EditorSlide>) {
    setSlides(prev => prev.map((s, i) => i === currentIdx ? { ...s, ...patch } : s));
  }

  function addSlide() {
    setSlides(prev => {
      const newSlide: EditorSlide = { id: `slide_${Date.now()}`, title: 'New Slide', text: '', notes: '', imageUrls: [], slideLayout: null };
      const next = [...prev, newSlide];
      startTransition(() => setCurrentIdx(next.length - 1));
      return next;
    });
  }

  function removeSlide() {
    if (slides.length <= 1) return;
    setSlides(prev => {
      const next = prev.filter((_, i) => i !== currentIdx);
      startTransition(() => setCurrentIdx(i => Math.min(i, next.length - 1)));
      return next;
    });
  }

  function goToSlide(idx: number | ((prev: number) => number)) {
    startTransition(() => setCurrentIdx(idx));
  }

  function removeWidget() {
    const cur = slides[currentIdx];
    if (!cur) return;
    const merged = syncWhiteboardLayout(
      { text: cur.text, imageUrls: cur.imageUrls, widgetType: undefined },
      cur.slideLayout ?? null,
      cur.id,
    );
    updateCurrent({
      widgetType: undefined,
      labSnapshot: undefined,
      slideLayout: merged,
      text: flattenTextForBackend(merged),
    });
  }

  async function handleSave() {
    const n = deckNumericId ?? (id ? Number(id) : NaN);
    if (!Number.isFinite(n)) {
      setLoadError('Cannot save: invalid id');
      return;
    }
    setSaving(true);
    try {
      const snapshotBeforeSave = slidesRef.current.map(s => ({ ...s }));
      const savedDeck = await lessonsApi.put(n, {
        title: deckTitle,
        subject,
        grade: null,
        status: deckStatus,
        slides: slidesRef.current.map(s => {
          const merged = syncWhiteboardLayout(
            { text: s.text, imageUrls: s.imageUrls, widgetType: s.widgetType },
            s.slideLayout ?? null,
            s.id,
          );
          return {
            title: s.title,
            text: flattenTextForBackend(merged),
            notes: s.notes || null,
            lab_registry_key: s.widgetType ?? null,
            lab_snapshot: s.labSnapshot
              ? (JSON.parse(JSON.stringify(s.labSnapshot)) as Record<string, unknown>)
              : null,
            image_urls: s.imageUrls ?? [],
            slide_layout: JSON.parse(JSON.stringify(merged)) as Record<string, unknown>,
          };
        }),
      });
      setDeckTitle(savedDeck.title);
      setSubject(savedDeck.subject);
      setDeckStatus(savedDeck.status);
      setSlides(mergeEditorSlidesAfterSave(savedDeck, snapshotBeforeSave));
      setCurrentIdx(prev => Math.min(prev, Math.max(0, savedDeck.slides.length - 1)));
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  function handleLabGenerated(def: LabComponentDefinition) {
    WidgetRegistry.registerDynamic(def);
    setDynamicDefs(prev => prev.some(d => d.registryKey === def.registryKey) ? prev : [...prev, def]);
    updateCurrent({
      widgetType: def.registryKey,
      labSnapshot: labDefinitionToEmbeddedSnapshot(def),
    });
  }

  function handleApplyCommands(cmds: LabCommand[]) {
    console.log('Commands to apply:', cmds);
  }

  function onLabPicked(widgetType: string, def?: LabComponentDefinition) {
    if (def) {
      WidgetRegistry.registerDynamic(def);
      setDynamicDefs(prev => prev.some(d => d.registryKey === def.registryKey) ? prev : [...prev, def]);
      updateCurrent({
        widgetType,
        labSnapshot: labDefinitionToEmbeddedSnapshot(def),
      });
      return;
    }
    const meta = STATIC_WIDGETS.find(w => w.widgetType === widgetType);
    updateCurrent({
      widgetType,
      labSnapshot: meta
        ? builtinLabEmbeddedSnapshot(
            meta.widgetType,
            meta.label,
            subjectLabelToLabKey(meta.subject),
            meta.defaultState as Record<string, unknown>,
          )
        : undefined,
    });
  }

  function addImagesFromFiles(files: FileList | null) {
    if (!files?.length) return;
    const slideIndex = currentIdx;
    for (const file of Array.from(files)) {
      if (!file.type.startsWith('image/')) continue;
      if (file.size > MAX_SLIDE_IMAGE_BYTES) {
        alert('Each image must be under 2.5MB.');
        continue;
      }
      const reader = new FileReader();
      reader.onload = () => {
        const data = reader.result;
        if (typeof data !== 'string') return;
        setSlides(prev =>
          prev.map((s, i) =>
            i === slideIndex ? { ...s, imageUrls: [...(s.imageUrls ?? []), data] } : s
          )
        );
      };
      reader.readAsDataURL(file);
    }
    if (imageFileInputRef.current) imageFileInputRef.current.value = '';
  }

  function removeImageAt(imageIndex: number) {
    updateCurrent({ imageUrls: (current?.imageUrls ?? []).filter((_, j) => j !== imageIndex) });
  }

  const presentId = deckNumericId ?? (id && id !== 'new' ? Number(id) : null);
  const hasLabOnSlide = !!current?.widgetType;
  const showChatPanel = hasLabOnSlide && showChat;

  const wbLayout = useMemo(
    () =>
      current
        ? syncWhiteboardLayout(
            { text: current.text, imageUrls: current.imageUrls, widgetType: current.widgetType },
            current.slideLayout ?? null,
            current.id,
          )
        : null,
    [current?.id, current?.text, current?.imageUrls, current?.widgetType, current?.slideLayout],
  );

  if (loadError && !isNew) {
    return (
      <TeacherLayout>
        <div style={{ padding: 24 }}>
          <p style={{ color: '#b91c1c' }}>{loadError}</p>
          <button type="button" onClick={() => navigate('/teacher/lessons')}>Back to list</button>
        </div>
      </TeacherLayout>
    );
  }

  if (loading || isNew) {
    return (
      <TeacherLayout>
        <div style={{ padding: 48, textAlign: 'center', color: '#6b7280' }}>
          <Loader2 size={24} style={{ animation: 'spin 1s linear infinite', display: 'inline-block' }} />
          <p style={{ marginTop: 12 }}>{isNew ? 'Creating lesson…' : 'Loading…'}</p>
          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </div>
      </TeacherLayout>
    );
  }

  return (
    <TeacherLayout>
      <div style={{ display: 'flex', height: 'calc(100vh - 48px)', overflow: 'hidden', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' }}>

        <div style={{ width: '220px', borderRight: '1px solid #e8eaed', display: 'flex', flexDirection: 'column', flexShrink: 0, background: '#fafafa' }}>
          <div style={{ padding: '10px 12px', borderBottom: '1px solid #e8eaed' }}>
            <button type="button" onClick={() => navigate('/teacher/lessons')} style={{ display: 'flex', alignItems: 'center', gap: '4px', background: 'none', border: 'none', cursor: 'pointer', color: '#6b7280', fontSize: '12px', marginBottom: 10 }}>
              <ArrowLeft size={13} /> Back
            </button>
            <label style={{ fontSize: '10px', color: '#9ca3af', display: 'block', marginBottom: 4 }}>Lesson title</label>
            <input value={deckTitle} onChange={e => setDeckTitle(e.target.value)}
              style={{ width: '100%', boxSizing: 'border-box', padding: '6px 8px', border: '1px solid #e8eaed', borderRadius: '6px', fontSize: '12px', marginBottom: 8 }} />
            <label style={{ fontSize: '10px', color: '#9ca3af', display: 'block', marginBottom: 4 }}>Subject</label>
            <input value={subject} onChange={e => setSubject(e.target.value)}
              style={{ width: '100%', boxSizing: 'border-box', padding: '6px 8px', border: '1px solid #e8eaed', borderRadius: '6px', fontSize: '12px' }} />
          </div>
          <div style={{ padding: '8px 12px', borderBottom: '1px solid #e8eaed', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: '12px', color: '#9ca3af' }}>{slides.length} slides</span>
            {slides.length > 1 && (
              <button type="button" onClick={removeSlide} style={{ fontSize: '11px', color: '#ef4444', background: 'none', border: 'none', cursor: 'pointer' }}>Remove slide</button>
            )}
          </div>
          <div style={{ flex: 1, overflowY: 'auto', padding: '8px' }}>
            {slides.map((s, i) => (
              <button key={s.id} type="button" onClick={() => goToSlide(i)}
                style={{ width: '100%', display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 10px', borderRadius: '7px', border: `1px solid ${i === currentIdx ? '#3b5bdb' : 'transparent'}`, background: i === currentIdx ? '#eff6ff' : 'transparent', cursor: 'pointer', textAlign: 'left', marginBottom: '3px' }}>
                <div style={{ width: '24px', height: '24px', borderRadius: '5px', background: i === currentIdx ? '#3b5bdb' : '#e5e7eb', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '10px', color: i === currentIdx ? '#fff' : '#6b7280', fontWeight: 700, flexShrink: 0 }}>{i + 1}</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: '11px', fontWeight: 600, color: i === currentIdx ? '#1e40af' : '#374151', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{s.title}</div>
                  {s.widgetType && (
                    <div style={{ fontSize: '9px', color: '#3b5bdb', display: 'flex', alignItems: 'center', gap: '2px', marginTop: '1px' }}>
                      <Zap size={8} /> Lab
                    </div>
                  )}
                </div>
              </button>
            ))}
          </div>
          <div style={{ padding: '10px 8px', borderTop: '1px solid #e8eaed' }}>
            <button type="button" onClick={addSlide}
              style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '5px', padding: '7px', border: '1px dashed #d1d5db', borderRadius: '7px', background: 'transparent', color: '#9ca3af', cursor: 'pointer', fontSize: '12px' }}>
              <Plus size={13} /> Add Slide
            </button>
          </div>
        </div>

        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <div style={{ minHeight: '52px', borderBottom: '1px solid #e8eaed', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 16px', flexShrink: 0, background: '#fff', flexWrap: 'wrap', gap: 8 }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4, flex: 1, minWidth: 200 }}>
              <span style={{ fontSize: '10px', color: '#9ca3af' }}>Slide title</span>
              <input value={current?.title ?? ''} onChange={e => updateCurrent({ title: e.target.value })}
                style={{ fontSize: '14px', fontWeight: 600, color: '#0f0f23', border: 'none', outline: 'none', background: 'transparent', width: '100%' }} />
            </div>
            <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
              <button type="button" onClick={() => setShowNotes(!showNotes)}
                style={{ display: 'flex', alignItems: 'center', gap: '5px', padding: '5px 10px', border: '1px solid #e8eaed', borderRadius: '6px', background: showNotes ? '#f3f4f6' : '#fff', color: '#6b7280', fontSize: '12px', cursor: 'pointer' }}>
                <FileText size={13} /> Notes
              </button>
              {hasLabOnSlide && (
                <button type="button" onClick={() => setShowChat(!showChat)}
                  style={{ display: 'flex', alignItems: 'center', gap: '5px', padding: '5px 10px', border: `1px solid ${showChat ? '#3b5bdb' : '#e8eaed'}`, borderRadius: '6px', background: showChat ? '#eff6ff' : '#fff', color: showChat ? '#3b5bdb' : '#6b7280', fontSize: '12px', cursor: 'pointer' }}>
                  <Sparkles size={13} /> AI
                </button>
              )}
              <button type="button" onClick={() => presentId != null && navigate(`/teacher/lesson-present/${presentId}`)}
                disabled={presentId == null}
                style={{ display: 'flex', alignItems: 'center', gap: '5px', padding: '5px 10px', border: '1px solid #e8eaed', borderRadius: '6px', background: '#fff', color: '#374151', fontSize: '12px', cursor: presentId == null ? 'not-allowed' : 'pointer', opacity: presentId == null ? 0.5 : 1 }}>
                <Maximize2 size={13} /> Present
              </button>
              <button type="button" onClick={handleSave} disabled={saving}
                style={{ display: 'flex', alignItems: 'center', gap: '5px', padding: '5px 14px', border: 'none', borderRadius: '6px', background: saved ? '#059669' : '#3b5bdb', color: '#fff', fontSize: '12px', fontWeight: 600, cursor: saving ? 'wait' : 'pointer', opacity: saving ? 0.8 : 1 }}>
                {saved ? <><Check size={13} /> Saved</> : saving ? <><Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} /> Saving</> : <><Save size={13} /> Save</>}
              </button>
            </div>
          </div>

          <div style={{ flex: 1, overflowY: 'auto', padding: '24px' }}>
            {wbLayout && current && (
              <div style={{ background: '#fff', border: '1px solid #e8eaed', borderRadius: '10px', padding: '16px', marginBottom: '12px' }}>
                <SlideContentCanvas
                  slideKey={current.id}
                  layout={wbLayout}
                  onLayoutChange={next =>
                    updateCurrent({
                      slideLayout: next,
                      text: flattenTextForBackend(next),
                    })
                  }
                  imageUrls={current.imageUrls ?? []}
                  onRemoveImage={removeImageAt}
                  widgetType={current.widgetType}
                  onRemoveLab={next =>
                    updateCurrent({
                      widgetType: undefined,
                      labSnapshot: undefined,
                      slideLayout: next,
                      text: flattenTextForBackend(next),
                    })
                  }
                  onAddTextBox={() => {
                    const next = addTextBox(wbLayout, current.id);
                    updateCurrent({ slideLayout: next, text: flattenTextForBackend(next) });
                  }}
                  labSlot={
                    current.widgetType ? (
                      <LabHost
                        widgetType={current.widgetType}
                        embeddedDefinition={embeddedLabFromSnapshot}
                        pendingCommands={pendingCommands}
                        onConsumeCommands={consumeCommands}
                      />
                    ) : null
                  }
                  toolbar={(
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
                      <span style={{ fontSize: '12px', fontWeight: 600, color: '#374151', display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <ImagePlus size={14} color="#3b5bdb" /> Whiteboard
                      </span>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        {current.widgetType && (
                          <>
                            <button type="button" onClick={() => setShowLabPicker(true)}
                              style={{ padding: '4px 10px', border: '1px solid #e8eaed', borderRadius: '6px', background: '#fafafa', color: '#374151', fontSize: '11px', cursor: 'pointer' }}>
                              Change lab
                            </button>
                            <button type="button" onClick={removeWidget}
                              style={{ width: '26px', height: '26px', border: '1px solid #e8eaed', borderRadius: '6px', background: '#fafafa', color: '#64748b', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                              <X size={12} />
                            </button>
                          </>
                        )}
                        <button type="button" onClick={() => imageFileInputRef.current?.click()}
                          style={{ display: 'flex', alignItems: 'center', gap: '5px', padding: '5px 10px', border: '1px solid #e8eaed', borderRadius: '6px', background: '#fafafa', color: '#374151', fontSize: '12px', cursor: 'pointer' }}>
                          <Plus size={13} /> Upload images
                        </button>
                        <input ref={imageFileInputRef} type="file" accept="image/*" multiple style={{ display: 'none' }}
                          onChange={e => addImagesFromFiles(e.target.files)} />
                      </div>
                    </div>
                  )}
                />
                <p style={{ fontSize: '11px', color: '#9ca3af', margin: '10px 0 0' }}>Multi-select supported; max 2.5MB per image. Images are saved with the lesson.</p>
              </div>
            )}

            {current && !current.widgetType && (
              <button type="button" onClick={() => setShowLabPicker(true)}
                style={{ width: '100%', padding: '24px', border: '2px dashed #e0e0e0', borderRadius: '12px', background: '#fafafa', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px', color: '#9ca3af', marginBottom: '12px' }}>
                <div style={{ width: '44px', height: '44px', borderRadius: '12px', background: '#f3f4f6', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '20px' }}>🧪</div>
                <div>
                  <div style={{ fontSize: '14px', fontWeight: 600, marginBottom: '2px' }}>Insert lab component</div>
                  <div style={{ fontSize: '12px' }}>Built-in templates or labs from your library</div>
                </div>
              </button>
            )}

            {showNotes && (
              <div style={{ marginTop: '16px', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: '10px', padding: '14px' }}>
                <div style={{ fontSize: '12px', fontWeight: 600, color: '#92400e', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '5px' }}>
                  <FileText size={12} /> Speaker Notes
                </div>
                <textarea value={current?.notes ?? ''} onChange={e => updateCurrent({ notes: e.target.value })}
                  placeholder="Add speaker notes for this slide…"
                  rows={3}
                  style={{ width: '100%', border: 'none', outline: 'none', fontSize: '13px', color: '#78350f', background: 'transparent', resize: 'vertical', lineHeight: 1.6, fontFamily: 'inherit', boxSizing: 'border-box' }} />
              </div>
            )}
          </div>

          <div style={{ height: '44px', borderTop: '1px solid #e8eaed', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '12px', flexShrink: 0, background: '#fff' }}>
            <button type="button" onClick={() => goToSlide(i => Math.max(0, i - 1))} disabled={currentIdx === 0}
              style={{ width: '28px', height: '28px', border: '1px solid #e8eaed', borderRadius: '6px', background: '#fff', cursor: currentIdx === 0 ? 'not-allowed' : 'pointer', opacity: currentIdx === 0 ? 0.4 : 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#374151' }}>
              <ChevronLeft size={14} />
            </button>
            <span style={{ fontSize: '12px', color: '#6b7280', fontFamily: 'monospace' }}>{currentIdx + 1} / {slides.length}</span>
            <button type="button" onClick={() => goToSlide(i => Math.min(slides.length - 1, i + 1))} disabled={currentIdx === slides.length - 1}
              style={{ width: '28px', height: '28px', border: '1px solid #e8eaed', borderRadius: '6px', background: '#fff', cursor: currentIdx === slides.length - 1 ? 'not-allowed' : 'pointer', opacity: currentIdx === slides.length - 1 ? 0.4 : 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#374151' }}>
              <ChevronRight size={14} />
            </button>
          </div>
        </div>

        {showChatPanel && (
          <div style={{ width: '320px', borderLeft: '1px solid #e8eaed', display: 'flex', flexDirection: 'column', flexShrink: 0, minHeight: 0, alignSelf: 'stretch' }}>
            <AIChatPanel
              onApplyCommands={handleApplyCommands}
              onLabGenerated={handleLabGenerated}
            />
          </div>
        )}
      </div>

      {showLabPicker && (
        <LabPickerModal
          onSelect={onLabPicked}
          onClose={() => setShowLabPicker(false)}
          dynamicDefs={dynamicDefs}
        />
      )}
    </TeacherLayout>
  );
}
