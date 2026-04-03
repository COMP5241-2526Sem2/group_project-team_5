import { useState, useCallback, useTransition, startTransition } from 'react';
import { useParams, useNavigate } from 'react-router';
import TeacherLayout from '../../components/teacher/TeacherLayout';
import LabHost, { STATIC_WIDGETS } from '../../components/labs/LabHost';
import AIChatPanel from '../../components/labs/AIChatPanel';
import {
  Plus, Eye, Maximize2, ChevronRight, ChevronLeft,
  Sparkles, BookOpen, Save, ArrowLeft, FileText,
  LayoutGrid, Zap, X, Check,
} from 'lucide-react';
import type { LabComponentDefinition, LabCommand, LabState } from '../../components/labs/types';
import { MOCK_DYNAMIC_DEFS } from '../../components/labs/LabRegistry';

// ── Mock slide data ───────────────────────────────────────────────────────────
interface EditorSlide {
  id: string;
  title: string;
  text: string;
  widgetType?: string;
  labState?: LabState;
  notes?: string;
}

const DEMO_SLIDES: EditorSlide[] = [
  { id: 's1', title: 'Introduction — Newton\'s Laws', text: 'An object at rest stays at rest, and an object in motion stays in motion unless acted on by an external force.', notes: 'Remind students about the concept of inertia from last week.' },
  { id: 's2', title: 'Force Analysis on Incline', text: 'When a block rests on an inclined plane, three forces act upon it: gravity, normal force, and friction.', widgetType: 'physics.mechanics', notes: 'Demo: increase the angle and observe when the block starts to slide.' },
  { id: 's3', title: 'Electrical Circuit Demo', text: 'In a series circuit, the same current flows through each component. The total resistance is the sum of individual resistances.', widgetType: 'physics.circuit', notes: 'Ask: what happens if we add more resistors in series?' },
  { id: 's4', title: 'Summary & Questions', text: 'Newton\'s Second Law: F = ma. The net force on an object equals mass times acceleration.', notes: '' },
];

// ── Lab picker modal ──────────────────────────────────────────────────────────
const SUBJECT_STYLE: Record<string, { color: string; bg: string; dot: string }> = {
  Math:     { color: '#1e40af', bg: '#eff6ff', dot: '#3b5bdb' },
  Physics:  { color: '#92400e', bg: '#fef3c7', dot: '#f59e0b' },
  Chemistry:{ color: '#6b21a8', bg: '#fdf4ff', dot: '#a855f7' },
  Biology:  { color: '#166534', bg: '#f0fdf4', dot: '#22c55e' },
  Dynamic:  { color: '#374151', bg: '#f3f4f6', dot: '#6b7280' },
};

function LabPickerModal({ onSelect, onClose, dynamicDefs }: {
  onSelect: (widgetType: string) => void;
  onClose: () => void;
  dynamicDefs: LabComponentDefinition[];
}) {
  const all = [
    ...STATIC_WIDGETS.map(w => ({ type: 'static', widgetType: w.widgetType, label: w.label, subject: w.subject, emoji: w.emoji })),
    ...dynamicDefs.map(d => ({ type: 'dynamic', widgetType: d.registryKey, label: d.title, subject: 'Dynamic', emoji: '✨' })),
  ];

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 60, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px' }}
      onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{ background: '#fff', borderRadius: '14px', width: '100%', maxWidth: '560px', maxHeight: '80vh', overflow: 'hidden', boxShadow: '0 24px 80px rgba(0,0,0,0.2)', display: 'flex', flexDirection: 'column' }}>
        <div style={{ padding: '18px 20px', borderBottom: '1px solid #e8eaed', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <LayoutGrid size={16} style={{ color: '#3b5bdb' }} />
            <span style={{ fontSize: '15px', fontWeight: 700, color: '#0f0f23' }}>Insert Lab Component</span>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9ca3af' }}><X size={16} /></button>
        </div>
        <div style={{ padding: '16px', overflowY: 'auto' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
            {all.map(w => {
              const sty = SUBJECT_STYLE[w.subject] ?? SUBJECT_STYLE.Dynamic;
              return (
                <button key={w.widgetType} onClick={() => { onSelect(w.widgetType); onClose(); }}
                  style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '14px', border: '1px solid #e8eaed', borderRadius: '10px', background: '#fff', cursor: 'pointer', textAlign: 'left', transition: 'all 0.15s' }}
                  onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = sty.bg; (e.currentTarget as HTMLElement).style.borderColor = sty.dot; }}
                  onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = '#fff'; (e.currentTarget as HTMLElement).style.borderColor = '#e8eaed'; }}>
                  <div style={{ width: '38px', height: '38px', borderRadius: '9px', background: sty.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '20px', flexShrink: 0 }}>{w.emoji}</div>
                  <div>
                    <div style={{ fontSize: '13px', fontWeight: 600, color: '#0f0f23', marginBottom: '2px' }}>{w.label}</div>
                    <div style={{ fontSize: '11px', color: sty.color, background: sty.bg, padding: '1px 6px', borderRadius: '4px', display: 'inline-block', fontWeight: 600 }}>{w.subject}</div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Main Editor ───────────────────────────────────────────────────────────────
export default function LessonEditor() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const isNew = id === 'new';

  const [slides, setSlides] = useState<EditorSlide[]>(isNew ? [{ id: 'new1', title: 'New Slide', text: '', notes: '' }] : DEMO_SLIDES);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [showLabPicker, setShowLabPicker] = useState(false);
  const [showNotes, setShowNotes] = useState(false);
  const [showChat, setShowChat] = useState(true);
  const [dynamicDefs, setDynamicDefs] = useState<LabComponentDefinition[]>(MOCK_DYNAMIC_DEFS);
  const [saved, setSaved] = useState(false);

  const current = slides[currentIdx];

  function updateCurrent(patch: Partial<EditorSlide>) {
    setSlides(prev => prev.map((s, i) => i === currentIdx ? { ...s, ...patch } : s));
  }

  function addSlide() {
    const newSlide: EditorSlide = { id: `slide_${Date.now()}`, title: 'New Slide', text: '' };
    setSlides(prev => [...prev, newSlide]);
    startTransition(() => setCurrentIdx(slides.length));
  }

  // Wrap slide index changes in startTransition so lazy lab components
  // don't suspend synchronously on click events
  function goToSlide(idx: number | ((prev: number) => number)) {
    startTransition(() => setCurrentIdx(idx));
  }

  function removeWidget() { updateCurrent({ widgetType: undefined }); }

  function handleSave() {
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  function handleLabGenerated(def: LabComponentDefinition) {
    setDynamicDefs(prev => prev.some(d => d.registryKey === def.registryKey) ? prev : [...prev, def]);
    startTransition(() => updateCurrent({ widgetType: def.registryKey }));
  }

  function handleApplyCommands(cmds: LabCommand[]) {
    console.log('Commands to apply:', cmds);
  }

  const SUBJECT_STYLE2: Record<string, { color: string; bg: string }> = {
    physics:   { color: '#92400e', bg: '#fef3c7' },
    math:      { color: '#1e40af', bg: '#eff6ff' },
    chemistry: { color: '#6b21a8', bg: '#fdf4ff' },
    biology:   { color: '#166534', bg: '#f0fdf4' },
  };

  return (
    <TeacherLayout>
      <div style={{ display: 'flex', height: 'calc(100vh - 48px)', overflow: 'hidden', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' }}>

        {/* ── Left: Slide List ── */}
        <div style={{ width: '200px', borderRight: '1px solid #e8eaed', display: 'flex', flexDirection: 'column', flexShrink: 0, background: '#fafafa' }}>
          <div style={{ padding: '10px 12px', borderBottom: '1px solid #e8eaed', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <button onClick={() => navigate('/teacher/lessons')} style={{ display: 'flex', alignItems: 'center', gap: '4px', background: 'none', border: 'none', cursor: 'pointer', color: '#6b7280', fontSize: '12px' }}>
              <ArrowLeft size={13} /> Back
            </button>
            <span style={{ fontSize: '12px', color: '#9ca3af' }}>{slides.length} slides</span>
          </div>
          <div style={{ flex: 1, overflowY: 'auto', padding: '8px' }}>
            {slides.map((s, i) => (
              <button key={s.id} onClick={() => goToSlide(i)}
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
            <button onClick={addSlide}
              style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '5px', padding: '7px', border: '1px dashed #d1d5db', borderRadius: '7px', background: 'transparent', color: '#9ca3af', cursor: 'pointer', fontSize: '12px' }}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = '#3b5bdb'; (e.currentTarget as HTMLElement).style.color = '#3b5bdb'; }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = '#d1d5db'; (e.currentTarget as HTMLElement).style.color = '#9ca3af'; }}>
              <Plus size={13} /> Add Slide
            </button>
          </div>
        </div>

        {/* ── Center: Slide Editor ── */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          {/* Toolbar */}
          <div style={{ height: '48px', borderBottom: '1px solid #e8eaed', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 16px', flexShrink: 0, background: '#fff' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <input value={current?.title ?? ''} onChange={e => updateCurrent({ title: e.target.value })}
                style={{ fontSize: '14px', fontWeight: 600, color: '#0f0f23', border: 'none', outline: 'none', background: 'transparent', minWidth: '200px' }} />
            </div>
            <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
              <button onClick={() => setShowNotes(!showNotes)}
                style={{ display: 'flex', alignItems: 'center', gap: '5px', padding: '5px 10px', border: '1px solid #e8eaed', borderRadius: '6px', background: showNotes ? '#f3f4f6' : '#fff', color: '#6b7280', fontSize: '12px', cursor: 'pointer' }}>
                <FileText size={13} /> Notes
              </button>
              <button onClick={() => setShowChat(!showChat)}
                style={{ display: 'flex', alignItems: 'center', gap: '5px', padding: '5px 10px', border: `1px solid ${showChat ? '#3b5bdb' : '#e8eaed'}`, borderRadius: '6px', background: showChat ? '#eff6ff' : '#fff', color: showChat ? '#3b5bdb' : '#6b7280', fontSize: '12px', cursor: 'pointer' }}>
                <Sparkles size={13} /> AI
              </button>
              <button onClick={() => navigate(`/teacher/lesson-present/${id ?? 'd1'}`)}
                style={{ display: 'flex', alignItems: 'center', gap: '5px', padding: '5px 10px', border: '1px solid #e8eaed', borderRadius: '6px', background: '#fff', color: '#374151', fontSize: '12px', cursor: 'pointer' }}>
                <Maximize2 size={13} /> Present
              </button>
              <button onClick={handleSave}
                style={{ display: 'flex', alignItems: 'center', gap: '5px', padding: '5px 14px', border: 'none', borderRadius: '6px', background: saved ? '#059669' : '#3b5bdb', color: '#fff', fontSize: '12px', fontWeight: 600, cursor: 'pointer', transition: 'background 0.2s' }}>
                {saved ? <><Check size={13} /> Saved</> : <><Save size={13} /> Save</>}
              </button>
            </div>
          </div>

          {/* Slide content */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '24px' }}>
            {/* Text content */}
            <div style={{ background: '#fff', border: '1px solid #e8eaed', borderRadius: '10px', padding: '16px', marginBottom: '16px' }}>
              <textarea value={current?.text ?? ''} onChange={e => updateCurrent({ text: e.target.value })}
                placeholder="Enter slide content…"
                rows={4}
                style={{ width: '100%', border: 'none', outline: 'none', fontSize: '14px', color: '#374151', resize: 'vertical', lineHeight: 1.6, fontFamily: 'inherit', boxSizing: 'border-box' }} />
            </div>

            {/* Lab component */}
            {current?.widgetType ? (
              <div style={{ position: 'relative' }}>
                <div style={{ position: 'absolute', top: '10px', right: '10px', zIndex: 10, display: 'flex', gap: '6px' }}>
                  <button onClick={() => setShowLabPicker(true)}
                    style={{ padding: '4px 10px', border: '1px solid rgba(255,255,255,0.2)', borderRadius: '6px', background: 'rgba(0,0,0,0.5)', color: '#e2e8f0', fontSize: '11px', cursor: 'pointer', backdropFilter: 'blur(4px)' }}>
                    Change Lab
                  </button>
                  <button onClick={removeWidget}
                    style={{ width: '26px', height: '26px', border: '1px solid rgba(255,255,255,0.2)', borderRadius: '6px', background: 'rgba(0,0,0,0.5)', color: '#e2e8f0', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(4px)' }}>
                    <X size={12} />
                  </button>
                </div>
                <LabHost widgetType={current.widgetType} />
              </div>
            ) : (
              <button onClick={() => setShowLabPicker(true)}
                style={{ width: '100%', padding: '32px', border: '2px dashed #e0e0e0', borderRadius: '12px', background: '#fafafa', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '10px', color: '#9ca3af', transition: 'all 0.15s' }}
                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = '#3b5bdb'; (e.currentTarget as HTMLElement).style.color = '#3b5bdb'; (e.currentTarget as HTMLElement).style.background = '#f8faff'; }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = '#e0e0e0'; (e.currentTarget as HTMLElement).style.color = '#9ca3af'; (e.currentTarget as HTMLElement).style.background = '#fafafa'; }}>
                <div style={{ width: '48px', height: '48px', borderRadius: '12px', background: '#f3f4f6', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '22px' }}>🧪</div>
                <div>
                  <div style={{ fontSize: '14px', fontWeight: 600, marginBottom: '4px' }}>Insert Lab Component</div>
                  <div style={{ fontSize: '12px' }}>Add an interactive Math, Physics, Chemistry or Biology lab</div>
                </div>
              </button>
            )}

            {/* Notes area */}
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

          {/* Slide navigation */}
          <div style={{ height: '44px', borderTop: '1px solid #e8eaed', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '12px', flexShrink: 0, background: '#fff' }}>
            <button onClick={() => goToSlide(i => Math.max(0, i - 1))} disabled={currentIdx === 0}
              style={{ width: '28px', height: '28px', border: '1px solid #e8eaed', borderRadius: '6px', background: '#fff', cursor: currentIdx === 0 ? 'not-allowed' : 'pointer', opacity: currentIdx === 0 ? 0.4 : 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#374151' }}>
              <ChevronLeft size={14} />
            </button>
            <span style={{ fontSize: '12px', color: '#6b7280', fontFamily: 'monospace' }}>{currentIdx + 1} / {slides.length}</span>
            <button onClick={() => goToSlide(i => Math.min(slides.length - 1, i + 1))} disabled={currentIdx === slides.length - 1}
              style={{ width: '28px', height: '28px', border: '1px solid #e8eaed', borderRadius: '6px', background: '#fff', cursor: currentIdx === slides.length - 1 ? 'not-allowed' : 'pointer', opacity: currentIdx === slides.length - 1 ? 0.4 : 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#374151' }}>
              <ChevronRight size={14} />
            </button>
          </div>
        </div>

        {/* ── Right: AI Chat Panel ── */}
        {showChat && (
          <div style={{ width: '320px', borderLeft: '1px solid #e8eaed', display: 'flex', flexDirection: 'column', flexShrink: 0 }}>
            <AIChatPanel
              widgetType={current?.widgetType}
              onApplyCommands={handleApplyCommands}
              onLabGenerated={handleLabGenerated}
              compact
            />
          </div>
        )}
      </div>

      {/* Lab Picker Modal */}
      {showLabPicker && (
        <LabPickerModal
          onSelect={wt => startTransition(() => updateCurrent({ widgetType: wt }))}
          onClose={() => setShowLabPicker(false)}
          dynamicDefs={dynamicDefs}
        />
      )}
    </TeacherLayout>
  );
}