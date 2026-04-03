import { useState, useCallback, startTransition } from 'react';
import { useParams, useNavigate } from 'react-router';
import LabHost from '../../components/labs/LabHost';
import AIChatPanel from '../../components/labs/AIChatPanel';
import { ChevronLeft, ChevronRight, X, PanelRightOpen, PanelRightClose, Maximize2, Minimize2, Sparkles } from 'lucide-react';
import type { LabComponentDefinition, LabCommand } from '../../components/labs/types';
import { MOCK_DYNAMIC_DEFS } from '../../components/labs/LabRegistry';

// ── Mock slides matching the editor ──────────────────────────────────────────
interface PSlide {
  id: string;
  title: string;
  text: string;
  widgetType?: string;
  notes?: string;
}

const PRESENT_SLIDES: PSlide[] = [
  { id: 's1', title: 'Introduction — Newton\'s Laws', text: 'An object at rest stays at rest, and an object in motion stays in motion unless acted on by an external force.' },
  { id: 's2', title: 'Force Analysis on Incline', text: 'When a block rests on an inclined plane, three forces act upon it: gravity, normal force, and friction.', widgetType: 'physics.mechanics', notes: 'Demo: increase the angle and observe when the block starts to slide.' },
  { id: 's3', title: 'Electrical Circuit Demo', text: 'In a series circuit, the same current flows through each component.', widgetType: 'physics.circuit', notes: 'Ask: what happens if we add more resistors in series?' },
  { id: 's4', title: 'Function Visualisation', text: 'Explore how parameters a, b, c, d affect the shape of f(x) = a·sin(bx+c)+d.', widgetType: 'math.function_graph' },
  { id: 's5', title: 'Molecular Structure', text: 'The geometry of molecules is determined by their bonding pairs and lone pairs (VSEPR theory).', widgetType: 'chem.molecule' },
  { id: 's6', title: 'Animal Cell Structure', text: 'Each organelle has a specific function. Click any organelle to learn more.', widgetType: 'bio.cell' },
  { id: 's7', title: 'Summary & Review', text: 'Key takeaways:\n• F = ma (Newton\'s Second Law)\n• Series circuit: I is constant\n• Molecular geometry follows VSEPR\n• Cell organelles are specialised structures' },
];

export default function PresentationMode() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [idx, setIdx]           = useState(0);
  const [showChat, setShowChat] = useState(true);
  const [fullLab, setFullLab]   = useState(false);
  const [dynamicDefs, setDynamic] = useState<LabComponentDefinition[]>(MOCK_DYNAMIC_DEFS);

  const slide = PRESENT_SLIDES[idx];
  const total = PRESENT_SLIDES.length;

  const prev = () => startTransition(() => setIdx(i => Math.max(0, i - 1)));
  const next = () => startTransition(() => setIdx(i => Math.min(total - 1, i + 1)));

  function handleGenerated(def: LabComponentDefinition) {
    setDynamic(prev => prev.some(d => d.registryKey === def.registryKey) ? prev : [...prev, def]);
  }

  // Keyboard nav
  const handleKey = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'ArrowRight' || e.key === ' ') next();
    if (e.key === 'ArrowLeft') prev();
    if (e.key === 'Escape') navigate(-1);
  }, [idx]);

  return (
    <div
      style={{ width: '100vw', height: '100vh', background: '#070810', display: 'flex', flexDirection: 'column', overflow: 'hidden', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' }}
      tabIndex={0} onKeyDown={handleKey}
    >
      {/* ── Top bar ── */}
      <div style={{ height: '44px', background: '#0b0f1a', borderBottom: '1px solid #1e293b', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 16px', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <button onClick={() => navigate(-1)}
            style={{ width: '28px', height: '28px', border: '1px solid #1e293b', borderRadius: '6px', background: 'transparent', color: '#6b7280', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <X size={14} />
          </button>
          <div style={{ width: '1px', height: '20px', background: '#1e293b' }} />
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            {PRESENT_SLIDES.map((_, i) => (
              <button key={i} onClick={() => startTransition(() => setIdx(i))}
                style={{ width: i === idx ? '20px' : '6px', height: '6px', borderRadius: '3px', border: 'none', background: i === idx ? '#3b5bdb' : '#1e293b', cursor: 'pointer', transition: 'all 0.2s', padding: 0 }} />
            ))}
          </div>
          <span style={{ fontSize: '12px', color: '#4b5563', fontFamily: 'monospace', marginLeft: '4px' }}>{idx + 1} / {total}</span>
        </div>

        <div style={{ fontSize: '13px', fontWeight: 600, color: '#9ca3af', maxWidth: '400px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', textAlign: 'center' }}>
          {slide.title}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {slide.widgetType && (
            <button onClick={() => setFullLab(!fullLab)}
              style={{ display: 'flex', alignItems: 'center', gap: '5px', padding: '5px 10px', border: '1px solid #1e293b', borderRadius: '6px', background: fullLab ? '#1e3a8a' : 'transparent', color: fullLab ? '#60a5fa' : '#6b7280', fontSize: '11px', cursor: 'pointer' }}>
              {fullLab ? <Minimize2 size={11} /> : <Maximize2 size={11} />} {fullLab ? 'Split View' : 'Full Lab'}
            </button>
          )}
          <button onClick={() => setShowChat(!showChat)}
            style={{ display: 'flex', alignItems: 'center', gap: '5px', padding: '5px 10px', border: `1px solid ${showChat ? '#3b5bdb' : '#1e293b'}`, borderRadius: '6px', background: showChat ? '#1e3a8a22' : 'transparent', color: showChat ? '#60a5fa' : '#6b7280', fontSize: '11px', cursor: 'pointer' }}>
            {showChat ? <PanelRightClose size={11} /> : <PanelRightOpen size={11} />}
            <Sparkles size={11} /> AI
          </button>
        </div>
      </div>

      {/* ── Main content ── */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>

        {/* Slide area */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

          {!fullLab && (
            <div style={{ padding: '28px 40px 16px', flexShrink: 0 }}>
              <h1 style={{ fontSize: '28px', fontWeight: 800, color: '#f1f5f9', margin: '0 0 12px', lineHeight: 1.25, letterSpacing: '-0.02em' }}>
                {slide.title}
              </h1>
              <p style={{ fontSize: '16px', color: '#94a3b8', margin: 0, lineHeight: 1.7, maxWidth: '720px', whiteSpace: 'pre-line' }}>
                {slide.text}
              </p>
            </div>
          )}

          {/* Lab */}
          {slide.widgetType && (
            <div style={{ flex: fullLab ? 1 : 'none', padding: fullLab ? '0' : '0 40px 16px', overflow: 'hidden' }}>
              <LabHost widgetType={slide.widgetType} readonly={false} />
            </div>
          )}

          {/* Speaker notes strip */}
          {slide.notes && !fullLab && (
            <div style={{ margin: '0 40px 16px', padding: '10px 14px', background: '#0f172a', border: '1px solid #1e293b', borderRadius: '8px', fontSize: '12px', color: '#64748b', fontStyle: 'italic' }}>
              📝 {slide.notes}
            </div>
          )}

          {/* No lab - center large text */}
          {!slide.widgetType && (
            <div style={{ flex: 1 }} />
          )}
        </div>

        {/* Chat sidebar */}
        {showChat && (
          <div style={{ width: '340px', borderLeft: '1px solid #1e293b', display: 'flex', flexDirection: 'column', flexShrink: 0 }}>
            <AIChatPanel
              widgetType={slide.widgetType}
              onLabGenerated={handleGenerated}
              onApplyCommands={(cmds) => console.log('Commands:', cmds)}
              compact
            />
          </div>
        )}
      </div>

      {/* ── Bottom nav ── */}
      <div style={{ height: '56px', background: '#0b0f1a', borderTop: '1px solid #1e293b', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '16px', flexShrink: 0 }}>
        <button onClick={prev} disabled={idx === 0}
          style={{ width: '38px', height: '38px', border: '1px solid #1e293b', borderRadius: '9px', background: '#0f172a', color: idx === 0 ? '#1e293b' : '#94a3b8', cursor: idx === 0 ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <ChevronLeft size={18} />
        </button>

        <div style={{ display: 'flex', gap: '6px' }}>
          {PRESENT_SLIDES.map((s, i) => (
            <button key={i} onClick={() => startTransition(() => setIdx(i))}
              style={{ padding: '5px 10px', borderRadius: '6px', border: `1px solid ${i === idx ? '#3b5bdb' : '#1e293b'}`, background: i === idx ? '#3b5bdb' : 'transparent', color: i === idx ? '#fff' : '#4b5563', fontSize: '11px', cursor: 'pointer', fontWeight: i === idx ? 700 : 400 }}>
              {i + 1}
            </button>
          ))}
        </div>

        <button onClick={next} disabled={idx === total - 1}
          style={{ width: '38px', height: '38px', border: '1px solid #1e293b', borderRadius: '9px', background: '#0f172a', color: idx === total - 1 ? '#1e293b' : '#94a3b8', cursor: idx === total - 1 ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <ChevronRight size={18} />
        </button>
      </div>
    </div>
  );
}