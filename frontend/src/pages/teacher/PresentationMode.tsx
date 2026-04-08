import { useState, useCallback, useEffect, startTransition, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router';
import LabHost from '../../components/labs/LabHost';
import AIChatPanel from '../../components/labs/AIChatPanel';
import { useChat } from '../../components/labs/ChatContext';
import { WidgetRegistry } from '../../components/labs/LabRegistry';
import { labsApi, fromBackend } from '../../api/labs';
import { lessonsApi } from '../../api/lessons';
import { ChevronLeft, ChevronRight, X, PanelRightOpen, PanelRightClose, Maximize2, Minimize2, Sparkles, Loader2 } from 'lucide-react';
import type { LabComponentDefinition, LabCommand } from '../../components/labs/types';
import SlideContentCanvas from '../../components/teacher/SlideContentCanvas';
import type { WhiteboardLayout } from './whiteboardLayout';
import { syncWhiteboardLayout, parseSlideLayoutPayload } from './whiteboardLayout';

interface PSlide {
  id: string;
  title: string;
  text: string;
  imageUrls?: string[];
  widgetType?: string;
  notes?: string;
  slideLayout?: WhiteboardLayout | null;
  labSnapshot?: Record<string, unknown> | null;
}

export default function PresentationMode() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [slides, setSlides] = useState<PSlide[]>([]);
  const [deckTitle, setDeckTitle] = useState('');
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [idx, setIdx]           = useState(0);
  const [showChat, setShowChat] = useState(true);
  const [fullLab, setFullLab]   = useState(false);

  const { setWidgetType, setGenerateBaseRegistryKey, pendingCommands, consumeCommands } = useChat();

  /** 仅在有嵌入实验的页与 Chat 绑定；纯文本页不展示侧栏并解除绑定 */
  const slideForChat = slides[idx];
  useEffect(() => {
    if (!slideForChat) return;
    setWidgetType(slideForChat.widgetType, slideForChat.title);
    setGenerateBaseRegistryKey(slideForChat.widgetType, slideForChat.title);
  }, [idx, slideForChat?.id, slideForChat?.widgetType, slideForChat?.title, setWidgetType, setGenerateBaseRegistryKey]);

  useEffect(() => {
    if (!slideForChat?.widgetType) startTransition(() => setFullLab(false));
  }, [slideForChat?.widgetType]);

  useEffect(() => {
    const n = id ? Number(id) : NaN;
    if (!Number.isFinite(n)) {
      setLoadError('Invalid lesson id');
      setLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      setLoading(true);
      setLoadError(null);
      try {
        const data = await lessonsApi.get(n);
        if (cancelled) return;
        setDeckTitle(data.title);
        const mapped: PSlide[] = data.slides.map(s => ({
          id: String(s.id),
          title: s.title,
          text: s.text,
          imageUrls: s.image_urls?.length ? s.image_urls : undefined,
          widgetType: s.lab_registry_key ?? undefined,
          notes: s.notes ?? undefined,
          slideLayout: parseSlideLayoutPayload(s.slide_layout),
          labSnapshot: s.lab_snapshot ?? undefined,
        }));
        setSlides(mapped.length ? mapped : [{ id: 'empty', title: 'Empty', text: '' }]);
        setIdx(0);

        for (const s of data.slides) {
          if (!s.lab_registry_key) continue;
          try {
            const raw = await labsApi.get(s.lab_registry_key);
            const def = fromBackend(raw as Parameters<typeof fromBackend>[0]);
            WidgetRegistry.registerDynamic(def);
          } catch {
            if (s.lab_snapshot) {
              try {
                const def = fromBackend(s.lab_snapshot as Parameters<typeof fromBackend>[0]);
                WidgetRegistry.registerDynamic(def);
              } catch { /* corrupt */ }
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
  }, [id]);

  const slide = slides[idx];
  const total = slides.length;
  const hasLabOnSlide = !!slide?.widgetType;
  const showChatPanel = hasLabOnSlide && showChat;

  const presentationBoard = useMemo(
    () =>
      slide
        ? syncWhiteboardLayout(
            { text: slide.text, imageUrls: slide.imageUrls, widgetType: slide.widgetType },
            slide.slideLayout ?? null,
            slide.id,
          )
        : null,
    [slide?.id, slide?.text, slide?.imageUrls, slide?.widgetType, slide?.slideLayout],
  );

  const embeddedLabPresent = useMemo(() => {
    const snap = slide?.labSnapshot;
    if (!snap) return undefined;
    try {
      return fromBackend(snap as Parameters<typeof fromBackend>[0]);
    } catch {
      return undefined;
    }
  }, [slide?.labSnapshot]);
  const useBoard = !!(
    slide?.text?.trim() ||
    (slide?.imageUrls?.length ?? 0) > 0 ||
    slide?.widgetType ||
    (slide?.slideLayout?.items?.length ?? 0) > 0
  );

  const prev = () => startTransition(() => setIdx(i => Math.max(0, i - 1)));
  const next = () => startTransition(() => setIdx(i => Math.min(total - 1, i + 1)));

  function handleGenerated(def: LabComponentDefinition) {
    WidgetRegistry.registerDynamic(def);
  }

  const handleKey = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'ArrowRight' || e.key === ' ') next();
    if (e.key === 'ArrowLeft') prev();
    if (e.key === 'Escape') navigate(-1);
  }, [total, navigate]);

  if (loading) {
    return (
      <div style={{ width: '100vw', height: '100vh', background: '#070810', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#94a3b8', flexDirection: 'column', gap: 12 }}>
        <Loader2 size={28} style={{ animation: 'spin 1s linear infinite' }} />
        <span style={{ fontSize: '14px' }}>Loading presentation…</span>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  if (loadError || !slide) {
    return (
      <div style={{ width: '100vw', height: '100vh', background: '#070810', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#f87171', flexDirection: 'column', gap: 12, padding: 24 }}>
        <span>{loadError ?? 'No slides'}</span>
        <button type="button" onClick={() => navigate('/teacher/lessons')} style={{ padding: '8px 16px', borderRadius: 8, border: '1px solid #334155', background: '#0f172a', color: '#e2e8f0', cursor: 'pointer' }}>Back</button>
      </div>
    );
  }

  return (
    <div
      style={{ width: '100vw', height: '100vh', background: '#070810', display: 'flex', flexDirection: 'column', overflow: 'hidden', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' }}
      tabIndex={0} onKeyDown={handleKey}
    >
      <div style={{ height: '44px', background: '#0b0f1a', borderBottom: '1px solid #1e293b', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 16px', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <button type="button" onClick={() => navigate(-1)}
            style={{ width: '28px', height: '28px', border: '1px solid #1e293b', borderRadius: '6px', background: 'transparent', color: '#6b7280', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <X size={14} />
          </button>
          <div style={{ width: '1px', height: '20px', background: '#1e293b' }} />
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            {slides.map((_, i) => (
              <button key={i} type="button" onClick={() => startTransition(() => setIdx(i))}
                style={{ width: i === idx ? '20px' : '6px', height: '6px', borderRadius: '3px', border: 'none', background: i === idx ? '#3b5bdb' : '#1e293b', cursor: 'pointer', transition: 'all 0.2s', padding: 0 }} />
            ))}
          </div>
          <span style={{ fontSize: '12px', color: '#4b5563', fontFamily: 'monospace', marginLeft: '4px' }}>{idx + 1} / {total}</span>
        </div>

        <div style={{ fontSize: '12px', color: '#64748b', maxWidth: '400px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', textAlign: 'center' }}>
          {deckTitle ? `${deckTitle} · ` : ''}{slide.title}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {hasLabOnSlide && (
            <button type="button" onClick={() => setFullLab(!fullLab)}
              style={{ display: 'flex', alignItems: 'center', gap: '5px', padding: '5px 10px', border: '1px solid #1e293b', borderRadius: '6px', background: fullLab ? '#1e3a8a' : 'transparent', color: fullLab ? '#60a5fa' : '#6b7280', fontSize: '11px', cursor: 'pointer' }}>
              {fullLab ? <Minimize2 size={11} /> : <Maximize2 size={11} />} {fullLab ? 'Split View' : 'Full Lab'}
            </button>
          )}
          {hasLabOnSlide && (
            <button type="button" onClick={() => setShowChat(!showChat)}
              style={{ display: 'flex', alignItems: 'center', gap: '5px', padding: '5px 10px', border: `1px solid ${showChat ? '#3b5bdb' : '#1e293b'}`, borderRadius: '6px', background: showChat ? '#1e3a8a22' : 'transparent', color: showChat ? '#60a5fa' : '#6b7280', fontSize: '11px', cursor: 'pointer' }}>
              {showChat ? <PanelRightClose size={11} /> : <PanelRightOpen size={11} />}
              <Sparkles size={11} /> AI
            </button>
          )}
        </div>
      </div>

      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>

        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

          {!fullLab && (
            <div style={{ padding: '28px 40px 16px', flexShrink: 0, flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
              <h1 style={{ fontSize: '28px', fontWeight: 800, color: '#f1f5f9', margin: '0 0 12px', lineHeight: 1.25, letterSpacing: '-0.02em' }}>
                {slide.title}
              </h1>
              {useBoard && presentationBoard && (
                <div style={{ flex: 1, minHeight: 0, marginTop: 4 }}>
                  <SlideContentCanvas
                    slideKey={slide.id}
                    layout={presentationBoard}
                    onLayoutChange={() => {}}
                    imageUrls={slide.imageUrls ?? []}
                    widgetType={slide.widgetType}
                    labSlot={
                      slide.widgetType ? (
                        <LabHost
                          widgetType={slide.widgetType}
                          embeddedDefinition={embeddedLabPresent}
                          readonly={false}
                          pendingCommands={pendingCommands}
                          onConsumeCommands={consumeCommands}
                        />
                      ) : null
                    }
                    readonly
                    theme="dark"
                  />
                </div>
              )}
              {(!useBoard || !presentationBoard) && (
                <>
                  <p style={{ fontSize: '16px', color: '#94a3b8', margin: 0, lineHeight: 1.7, maxWidth: '720px', whiteSpace: 'pre-line' }}>
                    {slide.text}
                  </p>
                  {slide.imageUrls && slide.imageUrls.length > 0 && (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', marginTop: '18px', maxWidth: '720px' }}>
                      {slide.imageUrls.map((url, i) => (
                        <img
                          key={`${i}-${url.slice(0, 24)}`}
                          src={url}
                          alt=""
                          style={{ maxWidth: '100%', maxHeight: 'min(360px, 42vh)', borderRadius: '10px', border: '1px solid #1e293b', objectFit: 'contain', background: '#0f172a' }}
                        />
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {slide.widgetType && fullLab && (
            <div style={{ flex: 1, padding: '0', overflow: 'hidden' }}>
              <LabHost
                widgetType={slide.widgetType}
                embeddedDefinition={embeddedLabPresent}
                readonly={false}
                pendingCommands={pendingCommands}
                onConsumeCommands={consumeCommands}
              />
            </div>
          )}

          {slide.notes && !fullLab && (
            <div style={{ margin: '0 40px 16px', padding: '10px 14px', background: '#0f172a', border: '1px solid #1e293b', borderRadius: '8px', fontSize: '12px', color: '#64748b', fontStyle: 'italic' }}>
              📝 {slide.notes}
            </div>
          )}

          {!slide.widgetType && (
            <div style={{ flex: 1 }} />
          )}
        </div>

        {showChatPanel && (
          <div style={{ width: '340px', borderLeft: '1px solid #1e293b', display: 'flex', flexDirection: 'column', flexShrink: 0, minHeight: 0, alignSelf: 'stretch' }}>
            <AIChatPanel
              onLabGenerated={handleGenerated}
              onApplyCommands={(cmds: LabCommand[]) => console.log('Commands:', cmds)}
            />
          </div>
        )}
      </div>

      <div style={{ height: '56px', background: '#0b0f1a', borderTop: '1px solid #1e293b', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '16px', flexShrink: 0 }}>
        <button type="button" onClick={prev} disabled={idx === 0}
          style={{ width: '38px', height: '38px', border: '1px solid #1e293b', borderRadius: '9px', background: '#0f172a', color: idx === 0 ? '#1e293b' : '#94a3b8', cursor: idx === 0 ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <ChevronLeft size={18} />
        </button>

        <div style={{ display: 'flex', gap: '6px' }}>
          {slides.map((s, i) => (
            <button key={s.id} type="button" onClick={() => startTransition(() => setIdx(i))}
              style={{ padding: '5px 10px', borderRadius: '6px', border: `1px solid ${i === idx ? '#3b5bdb' : '#1e293b'}`, background: i === idx ? '#3b5bdb' : 'transparent', color: i === idx ? '#fff' : '#4b5563', fontSize: '11px', cursor: 'pointer', fontWeight: i === idx ? 700 : 400 }}>
              {i + 1}
            </button>
          ))}
        </div>

        <button type="button" onClick={next} disabled={idx === total - 1}
          style={{ width: '38px', height: '38px', border: '1px solid #1e293b', borderRadius: '9px', background: '#0f172a', color: idx === total - 1 ? '#1e293b' : '#94a3b8', cursor: idx === total - 1 ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <ChevronRight size={18} />
        </button>
      </div>
    </div>
  );
}
