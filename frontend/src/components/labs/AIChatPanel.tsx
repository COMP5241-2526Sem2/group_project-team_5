import { useState, useRef, useEffect, useCallback } from 'react';
import { Send, Sparkles, Bot, User, Zap, Plus, ChevronDown, ChevronUp, RefreshCw, Terminal, X, ArrowUp } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import type { ChatMessage, LabCommand, LabComponentDefinition } from './types';
import { MOCK_DYNAMIC_DEFS, WidgetRegistry } from './LabRegistry';

// ── Mock AI response engine ───────────────────────────────────────────────────
// In production, replace with SSE/WebSocket to actual LLM backend.

interface MockResponse {
  text: string;
  commands?: LabCommand[];
  definition?: LabComponentDefinition;
  delay?: number; // simulated streaming delay ms per char
}

function getMockDriveResponse(input: string, widgetType: string): MockResponse {
  const lower = input.toLowerCase();

  // Circuit
  if (widgetType === 'physics.circuit') {
    if (lower.includes('close') || lower.includes('on') || lower.includes('switch'))
      return { text: 'Closing switch S₁ — circuit is now complete. Current will begin flowing through all components.', commands: [{ type: 'TOGGLE_SWITCH', payload: { id: 'sw1', closed: true }, description: 'Close switch S₁' }] };
    if (lower.includes('open') || lower.includes('off'))
      return { text: 'Opening switch S₁ — circuit is now interrupted. No current flows.', commands: [{ type: 'TOGGLE_SWITCH', payload: { id: 'sw1', closed: false }, description: 'Open switch S₁' }] };
    if (lower.includes('voltage') || lower.includes('battery'))
      return { text: 'Setting battery EMF to 12V. You can observe how this affects the current through each resistor.', commands: [{ type: 'SET_PARAM', payload: { key: 'voltage', value: 12 }, description: 'Set voltage to 12V' }] };
    if (lower.includes('current'))
      return { text: 'Enabling current flow animation so you can see the direction of conventional current in the circuit.', commands: [{ type: 'SET_PARAM', payload: { key: 'showCurrentFlow', value: true }, description: 'Show current animation' }] };
    return { text: 'I can control this circuit. Try: "close the switch", "set voltage to 12V", or "show current flow".', commands: [] };
  }

  // Function graph
  if (widgetType === 'math.function_graph') {
    if (lower.includes('sin') || lower.includes('cosine') || lower.includes('wave'))
      return { text: 'Displaying f(x) = 2·sin(x). The amplitude is 2, so the wave peaks at y = 2 and y = −2.', commands: [{ type: 'SET_PARAM', payload: { key: 'a', value: 2 }, description: 'Set amplitude a=2' }, { type: 'SET_PARAM', payload: { key: 'b', value: 1 }, description: 'Set frequency b=1' }] };
    if (lower.includes('steep') || lower.includes('frequen'))
      return { text: 'Increasing frequency (b parameter) to show the function completing more cycles over the same x range.', commands: [{ type: 'SET_PARAM', payload: { key: 'b', value: 3 }, description: 'Increase frequency b=3' }] };
    if (lower.includes('tangent'))
      return { text: 'Enabling the tangent line at x=0. The slope shown is the derivative f\'(x₀), a key concept in differentiation.', commands: [{ type: 'SET_PARAM', payload: { key: 'showTangent', value: true }, description: 'Show tangent line' }] };
    return { text: 'I can modify this function graph. Try: "make it steeper", "show the tangent line", or "set amplitude to 2".', commands: [] };
  }

  // Mechanics
  if (widgetType === 'physics.mechanics') {
    if (lower.includes('steep') || lower.includes('angle') || lower.includes('45'))
      return { text: 'Increasing the incline angle to 45°. Notice how the component of gravity along the slope (F∥) increases significantly.', commands: [{ type: 'SET_PARAM', payload: { key: 'angle', value: 45 }, description: 'Set angle to 45°' }] };
    if (lower.includes('friction') || lower.includes('smooth') || lower.includes('icy'))
      return { text: 'Reducing friction coefficient to 0.05 — approximating a nearly frictionless icy surface. The block will accelerate rapidly down the slope.', commands: [{ type: 'SET_PARAM', payload: { key: 'friction', value: 0.05 }, description: 'Reduce friction μ=0.05' }] };
    if (lower.includes('moon'))
      return { text: 'Switching to lunar gravity (g = 1.6 m/s²). On the Moon, everything feels about 6× lighter!', commands: [{ type: 'SET_PARAM', payload: { key: 'gravity', value: 1.6 }, description: 'Set lunar gravity g=1.6' }] };
    return { text: 'I can adjust this mechanics scenario. Try: "make it steeper", "add ice (no friction)", or "change to moon gravity".', commands: [] };
  }

  // Molecule
  if (widgetType === 'chem.molecule') {
    if (lower.includes('water') || lower.includes('h2o'))
      return { text: 'Loading water (H₂O) — a bent molecule with bond angle ~104.5°, making it polar. This polarity is key to water\'s unique properties.', commands: [{ type: 'SET_PARAM', payload: { key: 'moleculeKey', value: 'water' }, description: 'Show H₂O' }] };
    if (lower.includes('methane') || lower.includes('ch4'))
      return { text: 'Loading methane (CH₄) — a tetrahedral molecule. Each H-C-H angle is approximately 109.5°, the ideal tetrahedral angle.', commands: [{ type: 'SET_PARAM', payload: { key: 'moleculeKey', value: 'methane' }, description: 'Show CH₄' }] };
    if (lower.includes('co2') || lower.includes('carbon'))
      return { text: 'Loading CO₂ — a linear molecule with two C=O double bonds. Despite having polar bonds, the molecule is nonpolar due to its symmetry.', commands: [{ type: 'SET_PARAM', payload: { key: 'moleculeKey', value: 'co2' }, description: 'Show CO₂' }] };
    return { text: 'I can switch molecules. Try: "show water", "load methane", or "display CO₂".', commands: [] };
  }

  // Cell
  if (widgetType === 'bio.cell') {
    if (lower.includes('nucleus') || lower.includes('dna'))
      return { text: 'Highlighting the nucleus — this organelle contains the cell\'s DNA and controls all cellular activities through gene expression.', commands: [{ type: 'HIGHLIGHT_ORGANELLE', payload: { id: 'nucleus' }, description: 'Highlight nucleus' }] };
    if (lower.includes('mitochondr') || lower.includes('atp') || lower.includes('energy'))
      return { text: 'Highlighting the mitochondria. These are the "powerhouses" of the cell, producing ATP through cellular respiration (oxidative phosphorylation).', commands: [{ type: 'HIGHLIGHT_ORGANELLE', payload: { id: 'mitochondria1' }, description: 'Highlight mitochondria' }] };
    return { text: 'I can highlight organelles. Try: "show the nucleus", "highlight mitochondria", or "explain the Golgi apparatus".', commands: [] };
  }

  return { text: 'I understand your request. For this lab, try asking me to adjust specific parameters or explain concepts.', commands: [] };
}

function getMockGenerateResponse(input: string): MockResponse {
  const lower = input.toLowerCase();

  if (lower.includes('ph') || lower.includes('acid') || lower.includes('base')) {
    return {
      text: `Great choice! I'll generate a **pH Indicator Lab** for you.

This dynamic lab will feature:
- Real-time pH scale (0–14) with color gradient
- Interactive pH slider driving indicator color change
- Labels for acidic, neutral, and basic regions

Generating definition...`,
      definition: MOCK_DYNAMIC_DEFS[0],
    };
  }

  if (lower.includes('snell') || lower.includes('refract') || lower.includes('optic') || lower.includes('light')) {
    return {
      text: `Excellent! Generating a **Snell's Law — Refraction Lab**.

This lab will visualise:
- Incident and refracted ray diagrams
- Real-time angle updates as you drag θ₁
- n₁ and n₂ sliders for different media
- Total internal reflection when the critical angle is exceeded

Building component definition...`,
      definition: MOCK_DYNAMIC_DEFS[1],
    };
  }

  return {
    text: `I can generate a custom lab for you! Here are some ideas:
    
- **pH Indicator** — "Generate a pH indicator lab"
- **Snell's Law** — "Create a refraction lab"
- **Ohm's Law** — "Make an Ohm's law slider"
- **Pendulum** — "Build a simple pendulum lab"

What topic would you like me to create a lab for?`,
    definition: undefined,
  };
}

// ── Quick Idea definitions ────────────────────────────────────────────────────
interface QuickIdea {
  emoji: string;
  label: string;
  subject: 'Physics' | 'Chemistry' | 'Biology' | 'Math';
  prompt: string;
}

const SUBJECT_COLORS: Record<string, { bg: string; color: string }> = {
  Physics:   { bg: '#fef3c7', color: '#92400e' },
  Chemistry: { bg: '#fdf4ff', color: '#6b21a8' },
  Biology:   { bg: '#f0fdf4', color: '#166534' },
  Math:      { bg: '#eff6ff', color: '#1e40af' },
};

// ── Drive mode Quick Ideas ────────────────────────────────────────────────────
const DRIVE_IDEAS: QuickIdea[] = [
  { emoji: '⚡', label: 'Close Switch',     subject: 'Physics',   prompt: 'Close the switch in the circuit to complete it' },
  { emoji: '🔋', label: 'Set Voltage 12V',  subject: 'Physics',   prompt: 'Set the battery voltage to 12V' },
  { emoji: '📐', label: 'Angle → 45°',      subject: 'Physics',   prompt: 'Set the incline angle to 45 degrees' },
  { emoji: '🧊', label: 'No Friction',      subject: 'Physics',   prompt: 'Make the surface frictionless (μ = 0)' },
  { emoji: '🌕', label: 'Moon Gravity',     subject: 'Physics',   prompt: 'Switch to lunar gravity at 1.6 m/s²' },
  { emoji: '💧', label: 'Show H₂O',         subject: 'Chemistry', prompt: 'Display the water molecule structure' },
  { emoji: '🔴', label: 'Highlight Nucleus',subject: 'Biology',   prompt: 'Highlight the nucleus organelle and explain its role' },
  { emoji: '📈', label: 'Show Tangent',     subject: 'Math',      prompt: 'Show the tangent line at x = 0 on the function graph' },
  { emoji: '🌊', label: 'Amplitude × 2',   subject: 'Math',      prompt: 'Set the wave amplitude to 2' },
  { emoji: '⚗️', label: 'Show CH₄',         subject: 'Chemistry', prompt: 'Load the methane molecule model' },
  { emoji: '⚙️', label: 'Show Current Flow',subject: 'Physics',   prompt: 'Enable the current flow animation in the circuit' },
  { emoji: '🔬', label: 'Highlight Mito.',  subject: 'Biology',   prompt: 'Highlight the mitochondria and explain ATP production' },
  { emoji: '📡', label: 'High Frequency',   subject: 'Physics',   prompt: 'Increase the frequency parameter to b = 3' },
  { emoji: '🌍', label: 'Earth Gravity',    subject: 'Physics',   prompt: 'Reset gravity to Earth standard 9.8 m/s²' },
  { emoji: '🌡️', label: 'Show CO₂',         subject: 'Chemistry', prompt: 'Display the carbon dioxide molecule structure' },
  { emoji: '↺',  label: 'Reset Params',     subject: 'Physics',   prompt: 'Reset all parameters to their default values' },
  { emoji: '💡', label: 'Explain Concept',  subject: 'Physics',   prompt: 'Explain the key physics concept behind this lab' },
  { emoji: '🚀', label: 'Max Force',        subject: 'Physics',   prompt: 'Set the applied force to its maximum value' },
];

// ── Generate mode Quick Ideas ────────────────────────────────────────────────
const QUICK_IDEAS: QuickIdea[] = [
  { emoji: '🌡️', label: 'pH Indicator',       subject: 'Chemistry', prompt: 'Generate a pH indicator lab with a real-time color gradient scale from 0–14 and an interactive slider' },
  { emoji: '💡', label: "Snell's Law",          subject: 'Physics',   prompt: "Generate a Snell's Law refraction lab with draggable incident angle and adjustable refractive indices" },
  { emoji: '📡', label: 'Wave Interference',   subject: 'Physics',   prompt: 'Generate a wave interference lab showing constructive and destructive interference patterns in 2D' },
  { emoji: '⚖️', label: "Ohm's Law",           subject: 'Physics',   prompt: "Generate an Ohm's Law lab with voltage, current, and resistance sliders and a live I-V graph" },
  { emoji: '🔭', label: 'Pendulum',            subject: 'Physics',   prompt: 'Generate a simple pendulum simulation with adjustable length, gravity, and damping coefficient' },
  { emoji: '🧬', label: 'DNA Replication',     subject: 'Biology',   prompt: 'Generate a step-by-step DNA replication animation lab showing helicase, polymerase, and base pairing' },
  { emoji: '🌊', label: 'Doppler Effect',      subject: 'Physics',   prompt: 'Generate a Doppler effect lab visualising sound wave compression as a source moves toward/away from an observer' },
  { emoji: '🚀', label: 'Projectile Motion',   subject: 'Physics',   prompt: 'Generate a projectile motion lab with adjustable launch angle, initial speed, and gravity, showing trajectory arc' },
  { emoji: '💧', label: 'Osmosis',             subject: 'Biology',   prompt: 'Generate an osmosis lab showing water movement across a semi-permeable membrane based on solute concentration' },
  { emoji: '🔋', label: 'Electromagnetic Field', subject: 'Physics', prompt: 'Generate an electromagnetic field lab showing field lines around bar magnets and current-carrying wires' },
  { emoji: '🔬', label: 'Lens Optics',         subject: 'Physics',   prompt: 'Generate a convex/concave lens optics lab with draggable object position and real-time image formation' },
  { emoji: '☢️', label: 'Half-Life Decay',     subject: 'Chemistry', prompt: 'Generate a radioactive half-life decay lab with animated particle decay and an exponential decay graph' },
  { emoji: '🫧', label: 'Gas Laws',            subject: 'Chemistry', prompt: 'Generate a gas laws lab (Boyle, Charles, Gay-Lussac) with pressure, volume, and temperature sliders' },
  { emoji: '🪐', label: "Kepler's Laws",       subject: 'Physics',   prompt: "Generate a Kepler's orbital mechanics lab showing planet orbits with adjustable eccentricity and period" },
  { emoji: '⚗️', label: 'Titration',           subject: 'Chemistry', prompt: 'Generate a titration lab with a burette, flask with indicator, and equivalence point detection' },
  { emoji: '🌿', label: 'Photosynthesis',      subject: 'Biology',   prompt: 'Generate a photosynthesis rate lab showing the effect of light intensity and CO₂ concentration on oxygen output' },
  { emoji: '📐', label: 'Fourier Series',      subject: 'Math',      prompt: 'Generate a Fourier series lab that builds complex waveforms from harmonic components with interactive amplitude sliders' },
  { emoji: '🧲', label: 'Diffusion',           subject: 'Biology',   prompt: 'Generate a particle diffusion lab showing Brownian motion and concentration gradient equalisation over time' },
];

// ── Per-mode colour palette ───────────────────────────────────────────────────
const MODE_THEME = {
  drive_lab: {
    panelBg:        '#04101f',
    headerBg:       '#060e24',
    msgAreaBg:      '#04101f',
    inputAreaBg:    '#060e24',
    quickIdeasBg:   '#060e24',
    divider:        '#0f2040',
    activeBg:       '#1e3a8a',
    activeText:     '#60a5fa',
    userBubbleBg:   '#1e3a8a',
    userBubbleBdr:  '#1d4ed8',
    userAvatarBg:   '#1e3a8a',
    hintBg:         '#0d1f3c',
    hintText:       '#3b82f6',
    chipSelBg:      '#1e3a8a',
    chipSelBdr:     '#3b5bdb',
    chipSelText:    '#93c5fd',
    sendBg:         '#1e3a8a',
    sendHover:      '#1d4ed8',
    selectedRowBg:  '#0d1a30',
    selectedRowBdr: '#1e3a8a',
    ideaIcon:       '#3b82f6',
    selectedBadgeBg:'#1e3a8a',
    selectedBadgeText:'#93c5fd',
  },
  generate_lab: {
    panelBg:        '#07041a',
    headerBg:       '#0c0820',
    msgAreaBg:      '#07041a',
    inputAreaBg:    '#0c0820',
    quickIdeasBg:   '#0c0820',
    divider:        '#1a1040',
    activeBg:       '#2d1b69',
    activeText:     '#a78bfa',
    userBubbleBg:   '#2d1b69',
    userBubbleBdr:  '#6d28d9',
    userAvatarBg:   '#2d1b69',
    hintBg:         '#1a1040',
    hintText:       '#7c3aed',
    chipSelBg:      '#2d1b69',
    chipSelBdr:     '#7c3aed',
    chipSelText:    '#c4b5fd',
    sendBg:         '#5b21b6',
    sendHover:      '#6d28d9',
    selectedRowBg:  '#0d0a1f',
    selectedRowBdr: '#2d1f6e',
    ideaIcon:       '#7c3aed',
    selectedBadgeBg:'#2d1b69',
    selectedBadgeText:'#c4b5fd',
  },
} as const;

const COLLAPSED_COUNT = 6;

// ── Chat Panel ────────────────────────────────────────────────────────────────
interface AIChatPanelProps {
  widgetType?: string;
  onApplyCommands?: (cmds: LabCommand[]) => void;
  onLabGenerated?: (def: LabComponentDefinition) => void;
  compact?: boolean;
}

let _msgId = 0;
function mkId() { return `msg_${++_msgId}`; }

export default function AIChatPanel({ widgetType, onApplyCommands, onLabGenerated, compact }: AIChatPanelProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: mkId(), role: 'assistant',
      content: widgetType
        ? `Lab connected: **${widgetType}**. Ask me to adjust parameters, explain concepts, or generate a new Lab component.`
        : `Hello! I can help you:\n• **Drive existing labs** — control parameters via natural language\n• **Generate new Labs** — create custom interactive components`,
      timestamp: Date.now(),
    }
  ]);
  const [input, setInput] = useState('');
  const [mode, setMode] = useState<'drive_lab' | 'generate_lab'>(widgetType ? 'drive_lab' : 'generate_lab');
  const [loading, setLoading] = useState(false);
  const [showGenModal, setShowGenModal] = useState(false);
  const [pendingInput, setPendingInput] = useState('');
  const [selectedIdeas, setSelectedIdeas] = useState<QuickIdea[]>([]);
  const [ideasExpanded, setIdeasExpanded] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const streamText = useCallback((text: string, msgId: string) => {
    return new Promise<void>(resolve => {
      let i = 0;
      const chars = text.split('');
      const tick = () => {
        i += Math.floor(Math.random() * 3) + 1;
        const slice = chars.slice(0, Math.min(i, chars.length)).join('');
        setMessages(prev => prev.map(m => m.id === msgId ? { ...m, content: slice, streaming: i < chars.length } : m));
        if (i < chars.length) setTimeout(tick, 18);
        else resolve();
      };
      setTimeout(tick, 60);
    });
  }, []);

  const sendMessage = useCallback(async (text: string, isGenerate: boolean) => {
    if (!text.trim() || loading) return;
    setInput('');
    setSelectedIdeas([]);
    setLoading(true);

    const userMsg: ChatMessage = { id: mkId(), role: 'user', content: text, timestamp: Date.now() };
    const asstId = mkId();
    const asstMsg: ChatMessage = { id: asstId, role: 'assistant', content: '', timestamp: Date.now(), streaming: true };
    setMessages(prev => [...prev, userMsg, asstMsg]);

    // Simulate network delay
    await new Promise(r => setTimeout(r, 400));

    const response = isGenerate
      ? getMockGenerateResponse(text)
      : getMockDriveResponse(text, widgetType ?? '');

    await streamText(response.text, asstId);

    // Apply commands
    if (response.commands && response.commands.length > 0) {
      await new Promise(r => setTimeout(r, 200));
      onApplyCommands?.(response.commands);
      setMessages(prev => prev.map(m => m.id === asstId ? { ...m, commands: response.commands } : m));
    }

    // Register generated definition
    if (response.definition) {
      await new Promise(r => setTimeout(r, 600));
      WidgetRegistry.registerDynamic(response.definition);
      onLabGenerated?.(response.definition);
      setMessages(prev => prev.map(m => m.id === asstId ? { ...m, definition: response.definition } : m));
    }

    setLoading(false);
  }, [loading, streamText, onApplyCommands, onLabGenerated, widgetType]);

  function handleSend() {
    const ideaPrompts = selectedIdeas.map(i => i.prompt).join('. ');
    const userText = input.trim();
    const combined = ideaPrompts && userText
      ? `${ideaPrompts}. Additional details: ${userText}`
      : ideaPrompts || userText;
    if (!combined) return;
    if (mode === 'generate_lab') {
      setPendingInput(combined);
      setShowGenModal(true);
    } else {
      sendMessage(combined, false);
    }
  }

  function handleIdeaClick(idea: QuickIdea) {
    setSelectedIdeas(prev =>
      prev.some(i => i.label === idea.label)
        ? prev.filter(i => i.label !== idea.label)
        : [...prev, idea]
    );
    setTimeout(() => textareaRef.current?.focus(), 50);
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); }
  }

  function renderContent(text: string) {
    // Simple markdown-like rendering
    return text.split('\n').map((line, i) => {
      const rendered = line
        .replace(/\*\*(.+?)\*\*/g, '<strong style="color:#e2e8f0">$1</strong>')
        .replace(/`(.+?)`/g, '<code style="background:#1e293b;padding:1px 5px;border-radius:3px;font-size:11px;color:#93c5fd">$1</code>');
      return (
        <p key={i} style={{ margin: line.startsWith('•') || line.startsWith('-') ? '2px 0' : '4px 0', lineHeight: 1.6 }}
          dangerouslySetInnerHTML={{ __html: rendered || '&nbsp;' }} />
      );
    });
  }

  const visibleIdeas = (() => {
    const pool = mode === 'drive_lab' ? DRIVE_IDEAS : QUICK_IDEAS;
    return ideasExpanded ? pool : pool.slice(0, COLLAPSED_COUNT);
  })();
  const hasSelected = selectedIdeas.length > 0 || !!input.trim();
  const selectedCount = selectedIdeas.length;
  const th = MODE_THEME[mode];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: th.panelBg, borderRadius: compact ? '0' : '12px', border: compact ? 'none' : `1px solid ${th.divider}`, overflow: 'hidden', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif', transition: 'background 0.25s' }}>

      {/* Header */}
      <div style={{ padding: '12px 16px', background: th.headerBg, borderBottom: `1px solid ${th.divider}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0, transition: 'background 0.25s' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <div style={{ width: '26px', height: '26px', borderRadius: '7px', background: 'linear-gradient(135deg,#3b5bdb,#7c3aed)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Sparkles size={14} style={{ color: '#fff' }} />
          </div>
          <span style={{ fontSize: '14px', fontWeight: 700, color: '#e2e8f0' }}>AI Lab Assistant</span>
          {loading && (
            <div style={{ width: '7px', height: '7px', borderRadius: '50%', background: th.activeBg, animation: 'pulse 1s infinite' }}>
              <style>{`@keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.3} }`}</style>
            </div>
          )}
        </div>

        {/* Mode toggle */}
        <div style={{ display: 'flex', background: '#0f172a', borderRadius: '7px', padding: '2px', gap: '2px' }}>
          {(['drive_lab', 'generate_lab'] as const).map(m => (
            <button key={m} onClick={() => { setMode(m); setSelectedIdeas([]); }}
              style={{ padding: '4px 10px', borderRadius: '5px', border: 'none', background: mode === m ? MODE_THEME[m].activeBg : 'transparent', color: mode === m ? MODE_THEME[m].activeText : '#4b5563', fontSize: '11px', cursor: 'pointer', fontWeight: mode === m ? 600 : 400, display: 'flex', alignItems: 'center', gap: '4px', transition: 'all 0.15s' }}>
              {m === 'drive_lab' ? <><Zap size={11} /> Drive</> : <><Plus size={11} /> Generate</>}
            </button>
          ))}
        </div>
      </div>

      {/* Messages */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '12px', display: 'flex', flexDirection: 'column', gap: '10px', background: th.msgAreaBg, transition: 'background 0.25s' }}>
        {messages.map(msg => (
          <div key={msg.id} style={{ display: 'flex', gap: '8px', alignItems: 'flex-start', flexDirection: msg.role === 'user' ? 'row-reverse' : 'row' }}>
            {/* Avatar */}
            <div style={{ width: '26px', height: '26px', borderRadius: '7px', flexShrink: 0, background: msg.role === 'user' ? th.userAvatarBg : 'linear-gradient(135deg,#3b5bdb,#7c3aed)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              {msg.role === 'user' ? <User size={13} style={{ color: th.activeText }} /> : <Bot size={13} style={{ color: '#fff' }} />}
            </div>

            <div style={{ maxWidth: '82%', display: 'flex', flexDirection: 'column', gap: '5px', alignItems: msg.role === 'user' ? 'flex-end' : 'flex-start' }}>
              {/* Bubble */}
              <div style={{ padding: '9px 12px', borderRadius: msg.role === 'user' ? '12px 4px 12px 12px' : '4px 12px 12px 12px', background: msg.role === 'user' ? th.userBubbleBg : '#111827', border: `1px solid ${msg.role === 'user' ? th.userBubbleBdr : '#1f2937'}`, fontSize: '12px', color: '#d1d5db', lineHeight: 1.6 }}>
                {renderContent(msg.content)}
                {msg.streaming && <span style={{ display: 'inline-block', width: '8px', height: '12px', background: th.activeBg, marginLeft: '2px', animation: 'blink 0.7s steps(1) infinite' }} />}
                <style>{`@keyframes blink { 50%{opacity:0} }`}</style>
              </div>

              {/* Commands badge */}
              {msg.commands && msg.commands.length > 0 && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '4px', padding: '3px 8px', background: '#0f2a1a', border: '1px solid #1a4a2a', borderRadius: '5px', fontSize: '10px', color: '#4ade80' }}>
                  <Terminal size={10} />
                  {msg.commands.length} command{msg.commands.length > 1 ? 's' : ''} applied
                </div>
              )}

              {/* Definition badge */}
              {msg.definition && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '5px', padding: '4px 10px', background: '#1a1040', border: '1px solid #3b2a80', borderRadius: '6px', fontSize: '10px', color: '#a78bfa' }}>
                  <Sparkles size={10} />
                  Lab registered: <strong>{msg.definition.registryKey}</strong>
                </div>
              )}

              <span style={{ fontSize: '10px', color: '#374151' }}>{new Date(msg.timestamp).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}</span>
            </div>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      {/* Mode hint */}
      <div style={{ padding: '6px 14px', background: th.hintBg, fontSize: '10px', color: th.hintText, borderTop: `1px solid ${th.divider}`, display: 'flex', alignItems: 'center', gap: '5px', flexShrink: 0 }}>
        {mode === 'generate_lab'
          ? <><Sparkles size={10} /> Generate mode — AI will create a new Lab component (requires confirmation)</>
          : <><Zap size={10} /> Drive mode — AI will control the current Lab's state</>}
      </div>

      {/* ── Quick Ideas (expandable) ── */}
      <div style={{ borderTop: `1px solid ${th.divider}`, background: th.quickIdeasBg, flexShrink: 0, transition: 'background 0.25s' }}>
        {/* Header row */}
        <button
          onClick={() => setIdeasExpanded(v => !v)}
          style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px 6px', background: 'transparent', border: 'none', cursor: 'pointer' }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            {mode === 'drive_lab'
              ? <Zap size={10} style={{ color: th.ideaIcon }} />
              : <Sparkles size={10} style={{ color: th.ideaIcon }} />}
            <span style={{ fontSize: '10px', fontWeight: 700, color: th.ideaIcon, textTransform: 'uppercase', letterSpacing: '0.07em' }}>Quick Ideas</span>
            <span style={{ fontSize: '9px', padding: '1px 5px', borderRadius: '4px', background: '#0f172a', color: '#374151' }}>
              {(mode === 'drive_lab' ? DRIVE_IDEAS : QUICK_IDEAS).length}
            </span>
            {selectedCount > 0 && (
              <span style={{ fontSize: '9px', padding: '1px 6px', borderRadius: '4px', background: th.selectedBadgeBg, color: th.selectedBadgeText, fontWeight: 700 }}>
                {selectedCount} selected
              </span>
            )}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            {!ideasExpanded && (
              <span style={{ fontSize: '9px', color: '#374151' }}>+{(mode === 'drive_lab' ? DRIVE_IDEAS : QUICK_IDEAS).length - COLLAPSED_COUNT} more</span>
            )}
            {ideasExpanded
              ? <ChevronUp size={12} style={{ color: '#4b5563' }} />
              : <ChevronDown size={12} style={{ color: '#374151' }} />
            }
          </div>
        </button>

        {/* Chips */}
        <AnimatePresence initial={false}>
          <motion.div
            key={`${mode}-${ideasExpanded ? 'expanded' : 'collapsed'}`}
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: 'easeInOut' }}
            style={{ overflow: 'hidden' }}
          >
            <div style={{ padding: '2px 10px 10px', display: 'flex', flexWrap: 'wrap', gap: '5px' }}>
              {visibleIdeas.map(idea => {
                const isSelected = selectedIdeas.some(i => i.label === idea.label);
                return (
                  <button key={idea.label} onClick={() => handleIdeaClick(idea)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: '4px',
                      padding: '4px 9px', borderRadius: '20px', cursor: 'pointer',
                      border: `1px solid ${isSelected ? th.chipSelBdr : '#1e293b'}`,
                      background: isSelected ? th.chipSelBg : '#0f172a',
                      color: isSelected ? th.chipSelText : '#6b7280',
                      fontSize: '11px', fontWeight: isSelected ? 700 : 400,
                      transition: 'all 0.12s',
                    }}
                    onMouseEnter={e => { if (!isSelected) { (e.currentTarget as HTMLElement).style.background = '#111827'; (e.currentTarget as HTMLElement).style.color = '#9ca3af'; (e.currentTarget as HTMLElement).style.borderColor = '#374151'; } }}
                    onMouseLeave={e => { if (!isSelected) { (e.currentTarget as HTMLElement).style.background = '#0f172a'; (e.currentTarget as HTMLElement).style.color = '#6b7280'; (e.currentTarget as HTMLElement).style.borderColor = '#1e293b'; } }}
                  >
                    <span style={{ fontSize: '12px' }}>{idea.emoji}</span>
                    {idea.label}
                    {isSelected && <X size={9} style={{ marginLeft: '2px', color: th.chipSelText }} />}
                  </button>
                );
              })}
            </div>
          </motion.div>
        </AnimatePresence>
      </div>

      {/* ── Input area ── */}
      <div style={{ padding: '8px 12px 10px', background: th.inputAreaBg, borderTop: `1px solid ${th.divider}`, flexShrink: 0, transition: 'background 0.25s' }}>

        {/* Selected idea tags row */}
        <AnimatePresence>
          {selectedIdeas.length > 0 && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.15 }}
              style={{ overflow: 'hidden', marginBottom: '6px' }}
            >
              <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '4px', padding: '6px 8px', borderRadius: '8px', background: th.selectedRowBg, border: `1px solid ${th.selectedRowBdr}` }}>
                {mode === 'drive_lab'
                  ? <Zap size={9} style={{ color: th.ideaIcon, flexShrink: 0 }} />
                  : <Sparkles size={9} style={{ color: th.ideaIcon, flexShrink: 0 }} />}
                {selectedIdeas.map(idea => (
                  <span key={idea.label}
                    style={{ display: 'inline-flex', alignItems: 'center', gap: '3px', padding: '2px 7px 2px 5px', borderRadius: '20px', background: th.chipSelBg, border: `1px solid ${th.chipSelBdr}`, fontSize: '10px', color: th.chipSelText, fontWeight: 600 }}>
                    <span style={{ fontSize: '11px' }}>{idea.emoji}</span>
                    {idea.label}
                    <button onClick={() => handleIdeaClick(idea)}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: th.activeText, display: 'flex', padding: '0', marginLeft: '1px', lineHeight: 1 }}>
                      <X size={8} />
                    </button>
                  </span>
                ))}
                {selectedIdeas.length > 1 && (
                  <button onClick={() => setSelectedIdeas([])}
                    style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', fontSize: '9px', color: '#4b5563', display: 'flex', alignItems: 'center', gap: '2px' }}>
                    <X size={8} /> clear all
                  </button>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Textarea + arrow send button */}
        <div style={{ position: 'relative' }}>
          <textarea
            ref={textareaRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={
              selectedIdeas.length > 0
                ? `Add details… (or send ${selectedIdeas.length} idea${selectedIdeas.length > 1 ? 's' : ''} directly)`
                : mode === 'generate_lab' ? 'Describe the lab you want to create…' : 'Tell the lab what to do…'
            }
            rows={3}
            style={{
              width: '100%', boxSizing: 'border-box',
              background: '#0f172a', border: `1px solid ${hasSelected ? th.chipSelBdr + '88' : '#1e293b'}`,
              borderRadius: '10px', padding: '9px 44px 9px 11px',
              fontSize: '12px', color: '#e2e8f0', resize: 'none', outline: 'none',
              lineHeight: 1.5, fontFamily: 'inherit', transition: 'border-color 0.15s',
            }}
            onFocus={e => { e.currentTarget.style.borderColor = th.chipSelBdr; }}
            onBlur={e => { e.currentTarget.style.borderColor = hasSelected ? th.chipSelBdr + '88' : '#1e293b'; }}
          />

          {/* Arrow send button — positioned inside textarea bottom-right */}
          <button
            onClick={handleSend}
            disabled={!hasSelected || loading}
            title={loading ? 'Sending…' : hasSelected ? 'Send' : 'Type or select an idea first'}
            style={{
              position: 'absolute', right: '8px', bottom: '8px',
              width: '28px', height: '28px', borderRadius: '8px', border: 'none',
              background: hasSelected && !loading ? th.sendBg : '#1e293b',
              color: hasSelected && !loading ? '#fff' : '#374151',
              cursor: hasSelected && !loading ? 'pointer' : 'not-allowed',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              transition: 'all 0.15s', flexShrink: 0,
              boxShadow: hasSelected && !loading ? `0 2px 8px ${th.chipSelBg}88` : 'none',
            }}
          >
            {loading
              ? <RefreshCw size={13} style={{ animation: 'spin 1s linear infinite' }} />
              : <ArrowUp size={13} />
            }
          </button>
        </div>

        {/* Keyboard hint */}
        <div style={{ marginTop: '4px', fontSize: '9px', color: '#1f2937', textAlign: 'right' }}>
          Enter to send · Shift+Enter for new line
        </div>
      </div>

      {/* Generate Lab confirmation modal */}
      <AnimatePresence>
        {showGenModal && (
          <GenerateLabModalInline
            onConfirm={() => { setShowGenModal(false); sendMessage(pendingInput, true); }}
            onCancel={() => { setShowGenModal(false); setPendingInput(''); }}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

// ── Inline confirmation (avoids portal issues inside panels) ──────────────────
function GenerateLabModalInline({ onConfirm, onCancel }: { onConfirm: () => void; onCancel: () => void }) {
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.8)', zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px', borderRadius: '12px' }}>
      <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }}
        style={{ background: '#0f1117', border: '1px solid #1e293b', borderRadius: '12px', padding: '20px', maxWidth: '340px', width: '100%' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
          <Sparkles size={16} style={{ color: '#818cf8' }} />
          <span style={{ fontSize: '14px', fontWeight: 700, color: '#e2e8f0' }}>Generate New Lab?</span>
        </div>
        <p style={{ fontSize: '12px', color: '#9ca3af', marginBottom: '14px', lineHeight: 1.6 }}>
          This will call the AI API to create a new Lab component definition. The result will be saved as a draft and registered locally. <strong style={{ color: '#d1d5db' }}>Quota will be consumed.</strong>
        </p>
        <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
          <button onClick={onCancel} style={{ padding: '7px 16px', border: '1px solid #1e293b', borderRadius: '7px', background: 'transparent', color: '#6b7280', fontSize: '12px', cursor: 'pointer' }}>Cancel</button>
          <button onClick={onConfirm} style={{ padding: '7px 16px', border: 'none', borderRadius: '7px', background: '#3b5bdb', color: '#fff', fontSize: '12px', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '5px' }}>
            <Sparkles size={12} /> Confirm
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}