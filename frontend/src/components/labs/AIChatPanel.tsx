/**
 * AIChatPanel — reads chat state from ChatContext and sends messages through it.
 * Two render modes:
 *   full  — show the full panel (LabsManagement right panel)
 *   locked — locked to generate_lab mode, compact (LabsDrafts sidebar)
 */
import React from 'react';
import { useState, useRef, useEffect, useCallback, useImperativeHandle, forwardRef } from 'react';
import {
  Send, Sparkles, Bot, User, Zap, Plus, ChevronDown, ChevronUp,
  RefreshCw, Terminal, X, ArrowUp,
} from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import type { ChatMessage, LabCommand, LabComponentDefinition } from './types';
import { fromBackend, labsApi } from '../../api/labs';
import { parseLabDefinitionJson } from './parseLabDefinition';
import { useChat, type ChatMode, type LabGeneratedOptions } from './ChatContext';

// ── Quick Idea definitions ───────────────────────────────────────────────────
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
    chipSelBdr:     '#7d28d9',
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

// ── Props ─────────────────────────────────────────────────────────────────────
export interface AIChatPanelProps {
  /** 'full' = LabsManagement right panel, 'locked' = LabsDrafts sidebar (generate-only, compact) */
  variant?: 'full' | 'locked';
  /** Called when user commits a generated lab (draft / publish) */
  onLabGenerated?: (def: LabComponentDefinition, options?: LabGeneratedOptions) => void;
  /** Called when AI emits commands (drive mode) — parent applies them to the active lab */
  onApplyCommands?: (cmds: LabCommand[]) => void;
}

let _msgId = 0;
function mkId() { return `msg_${++_msgId}`; }

// ── Inner component (reads ChatContext) ───────────────────────────────────────
function AIChatPanelInner({
  variant = 'full',
  onLabGenerated,
  onApplyCommands,
}: AIChatPanelProps) {
  const {
    messages, mode, loading,
    setMode, widgetType, applyCommands, setMessages,
    generateBaseRegistryKey,
    generateBaseTitle,
    isGenerating,
    registerActiveStream,
    unregisterActiveStream,
  } = useChat();

  const [input, setInput] = useState('');
  const [showGenModal, setShowGenModal] = useState(false);
  const [pendingInput, setPendingInput] = useState('');
  const [selectedIdeas, setSelectedIdeas] = useState<QuickIdea[]>([]);
  const [ideasExpanded, setIdeasExpanded] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Persist SSE session id across sends within the same chat
  const sessionIdRef = useRef<number | null>(null);
  const esRef = useRef<EventSource | null>(null);
  const busy = loading || isGenerating;

  // Locked variant forces generate_lab（仅当某页需要隐藏切换时使用）
  const effectiveMode: ChatMode = variant === 'locked' ? 'generate_lab' : mode;

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  /** Drive/Generate 或目标实验 / 迭代基准变化时重建后端会话 */
  useEffect(() => {
    sessionIdRef.current = null;
  }, [effectiveMode, widgetType, generateBaseRegistryKey]);

  // ── Send ────────────────────────────────────────────────────────────────────
  const sendMessage = useCallback(async (text: string) => {
    if (!text.trim() || busy) return;
    setInput('');
    setSelectedIdeas([]);

    const userMsg: ChatMessage = { id: mkId(), role: 'user', content: text, timestamp: Date.now() };
    const asstId = mkId();
    const asstMsg: ChatMessage = { id: asstId, role: 'assistant', content: '', timestamp: Date.now(), streaming: true };

    setMessages(prev => [...prev, userMsg, asstMsg]);
    // Ensure any previous stream is closed before opening a new one.
    if (esRef.current) {
      try { esRef.current.close(); } catch { /* ignore */ }
      esRef.current = null;
    }

    try {
      // Step 1: ensure session exists
      if (sessionIdRef.current === null) {
        const session = await labsApi.createSession(
          effectiveMode === 'generate_lab' ? 'generate' : 'drive',
          effectiveMode === 'drive_lab' ? widgetType : generateBaseRegistryKey,
        );
        sessionIdRef.current = session.id;
      }

      const sessionId = sessionIdRef.current;
      const es = labsApi.streamChat(sessionId, text);
      esRef.current = es;
      registerActiveStream(es, asstId);

      const anchorToSelectedDraft = (def: LabComponentDefinition): LabComponentDefinition => {
        // Draft 多轮 Generate：不创建新条目，强制覆盖当前选中实验 registry_key
        if (effectiveMode === 'generate_lab' && generateBaseRegistryKey) {
          return { ...def, registryKey: generateBaseRegistryKey };
        }
        return def;
      };

      let pendingDefinition: LabComponentDefinition | undefined;
      let pendingCommands: LabCommand[] = [];

      es.addEventListener('generating', () => {
        setMessages(prev =>
          prev.map(m => m.id === asstId ? { ...m, content: '正在生成…', streaming: true } : m)
        );
      });

      es.addEventListener('status', (e: MessageEvent) => {
        try {
          const s = JSON.parse(e.data || '{}') as { stage?: string; message?: string; progress?: number };
          const msg = (s.message || '处理中…').trim();
          const p = typeof s.progress === 'number' ? Math.max(0, Math.min(100, s.progress)) : undefined;
          const stage = (s.stage || '').trim();
          const line = `${msg}${p !== undefined ? `（${p}%）` : ''}${stage ? `\n${stage}` : ''}`;
          setMessages(prev =>
            prev.map(m => m.id === asstId ? { ...m, content: line, streaming: true } : m)
          );
        } catch {
          // ignore
        }
      });

      es.addEventListener('thinking', (e: MessageEvent) => {
        try {
          const t = JSON.parse(e.data || '{}') as { message?: string; stage?: string };
          const msg = (t.message || '推理中…').trim();
          const stage = (t.stage || '').trim();
          const line = `${msg}${stage ? `\n${stage}` : ''}`;
          setMessages(prev =>
            prev.map(m => m.id === asstId ? { ...m, content: line, streaming: true } : m)
          );
        } catch {
          // ignore
        }
      });

      es.addEventListener('text', (e: MessageEvent) => {
        const finalText = e.data || '处理完成。';
        setMessages(prev =>
          prev.map(m => m.id === asstId ? { ...m, content: finalText, streaming: false } : m)
        );
      });

      es.addEventListener('command', (e: MessageEvent) => {
        try {
          pendingCommands = JSON.parse(e.data);
          applyCommands(pendingCommands);
          setMessages(prev =>
            prev.map(m => m.id === asstId ? { ...m, commands: pendingCommands } : m)
          );
        } catch { /* ignore */ }
      });

      es.addEventListener('definition', (e: MessageEvent) => {
        try {
          const raw = JSON.parse(e.data);
          const res = parseLabDefinitionJson(raw);
          if (res.ok) {
            pendingDefinition = anchorToSelectedDraft(res.definition);
          } else {
            console.error('[AIChatPanel] definition event parse error:', res.error, '| raw data:', e.data);
          }
        } catch (err) {
          console.error('[AIChatPanel] definition event JSON.parse error:', err, '| e.data:', e.data);
        }
      });

      es.addEventListener('definitions', (e: MessageEvent) => {
        try {
          const raw = JSON.parse(e.data);
          if (Array.isArray(raw)) {
            const parsed = raw.map((item) => parseLabDefinitionJson(item));
            const valid = parsed.filter((r): r is { ok: true; definition: LabComponentDefinition } => r.ok);
            if (valid.length > 0) {
              const candidates = valid.map((r) => anchorToSelectedDraft(r.definition));
              pendingDefinition = candidates[0];
              setMessages(prev =>
                prev.map(m => m.id === asstId
                  ? {
                      ...m,
                      definitionCandidates: candidates,
                      selectedCandidateIndex: 0,
                      pendingDefinition: candidates[0],
                    }
                  : m
                )
              );
              return;
            }
          }
          // Fallback: single definition
          if (pendingDefinition) {
            setMessages(prev =>
              prev.map(m => m.id === asstId
                ? { ...m, pendingDefinition }
                : m
              )
            );
          }
        } catch (err) {
          console.error('[AIChatPanel] definitions event JSON.parse error:', err, '| e.data:', e.data);
        }
      });

      es.addEventListener('done', () => {
        es.close();
        if (esRef.current === es) esRef.current = null;
        unregisterActiveStream(es);
        const def = pendingDefinition;
        setMessages(prev => {
          const withDone = prev.map(m => (m.id === asstId ? { ...m, streaming: false } : m));
          if (!def) return withDone;
          return withDone.map(m =>
            m.id === asstId ? { ...m, pendingDefinition: def } : m,
          );
        });
        // 生成结束即合并到前端 Workspace / WidgetRegistry，便于 Drafts 中间区域立刻预览；
        // 同步数据库仅在用户点击「保存草稿 / 发布」或 Drafts 页「保存到服务器」。
        if (def && effectiveMode === 'generate_lab') {
          onLabGenerated?.(def, { status: 'draft' });
        } else if (def && effectiveMode === 'drive_lab') {
          onLabGenerated?.(def, undefined);
        }
      });

      es.addEventListener('lab_error', (e: MessageEvent) => {
        es.close();
        if (esRef.current === es) esRef.current = null;
        unregisterActiveStream(es);
        const detail = typeof e.data === 'string' && e.data.trim() ? e.data : 'Unknown error';
        setMessages(prev =>
          prev.map(m => m.id === asstId
            ? { ...m, content: (m.content || '') + `\n[AI 服务错误] ${detail}`, streaming: false }
            : m
          )
        );
      });

      es.addEventListener('error', () => {
        es.close();
        // EventSource error can fire on disconnect / CORS / proxy hiccups.
        if (esRef.current === es) esRef.current = null;
        unregisterActiveStream(es);
        setMessages(prev =>
          prev.map(m => m.id === asstId
            ? {
                ...m,
                content: (m.content || '') + '\n[连接中断] 请确认后端已启动（:8000），或稍后重试。',
                streaming: false,
              }
            : m
          )
        );
      });

    } catch (err) {
      unregisterActiveStream(undefined);
      setMessages(prev =>
        prev.map(m => m.id === asstId
          ? { ...m, content: `Error: ${err instanceof Error ? err.message : String(err)}`, streaming: false }
          : m
        )
      );
    }
  }, [busy, effectiveMode, generateBaseRegistryKey, widgetType, applyCommands, onLabGenerated, setMessages]);

  // When caller requests cancellation (e.g. nav guard), close this panel's SSE too.
  // cancelGeneration() will update shared chat state; we just ensure the transport is closed.
  useEffect(() => {
    return () => {
      if (esRef.current) {
        try { esRef.current.close(); } catch { /* ignore */ }
        unregisterActiveStream(esRef.current);
        esRef.current = null;
      }
    };
  }, []);

  const commitGeneratedLab = useCallback(
    async (msgId: string, def: LabComponentDefinition, status: 'draft' | 'published', candidateIndex?: number) => {
      const action = status === 'draft' ? 'save_draft' : 'publish';
      let contentUnchanged = false;
      let saved: LabComponentDefinition;
      try {
        // 若已选中基准实验：后续迭代必须覆盖同一 registry_key（避免生成“新实验”）
        const anchoredDef =
          effectiveMode === 'generate_lab' && generateBaseRegistryKey
            ? { ...def, registryKey: generateBaseRegistryKey }
            : def;
        const { contentUnchanged: unchanged, raw } = await labsApi.saveLabDefinition(anchoredDef, action);
        contentUnchanged = unchanged;
        const { content_unchanged: _c, ...row } = raw;
        saved = fromBackend(row as unknown as Parameters<typeof fromBackend>[0]);
      } catch (err) {
        alert(err instanceof Error ? err.message : String(err));
        return;
      }
      const commitNotice =
        status === 'draft'
          ? contentUnchanged
            ? '已保存'
            : '保存成功，版本更新'
          : '发布成功';
      setMessages(prev =>
        prev.map(m =>
          m.id === msgId
            ? {
                ...m,
                pendingDefinition: undefined,
                definitionCandidates: undefined,
                selectedCandidateIndex: undefined,
                definition: saved,
                commitNotice,
              }
            : m
        )
      );
      onLabGenerated?.(saved, { status });
    },
    [effectiveMode, generateBaseRegistryKey, onLabGenerated, setMessages]
  );

  function handleSend() {
    const ideaPrompts = selectedIdeas.map(i => i.prompt).join('. ');
    const userText = input.trim();
    const combined = ideaPrompts && userText
      ? `${ideaPrompts}. Additional details: ${userText}`
      : ideaPrompts || userText;
    if (!combined) return;
    if (effectiveMode === 'generate_lab') {
      setPendingInput(combined);
      setShowGenModal(true);
    } else {
      sendMessage(combined);
    }
  }

  function handleConfirmGenerate() {
    setShowGenModal(false);
    sendMessage(pendingInput);
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
    const pool = effectiveMode === 'drive_lab' ? DRIVE_IDEAS : QUICK_IDEAS;
    return ideasExpanded ? pool : pool.slice(0, COLLAPSED_COUNT);
  })();
  const hasSelected = selectedIdeas.length > 0 || !!input.trim();
  const selectedCount = selectedIdeas.length;
  const th = MODE_THEME[effectiveMode];



  return (
    <div style={{
      display: 'flex', flexDirection: 'column', height: '100%',
      background: th.panelBg,
      borderRadius: variant === 'locked' ? '0' : '12px',
      border: variant === 'locked' ? 'none' : `1px solid ${th.divider}`,
      overflow: 'hidden',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }}>

      {/* Header */}
      <div style={{
        padding: '12px 16px', background: th.headerBg,
        borderBottom: `1px solid ${th.divider}`,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        flexShrink: 0,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <div style={{
            width: '26px', height: '26px', borderRadius: '7px',
            background: 'linear-gradient(135deg,#3b5bdb,#7c3aed)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <Sparkles size={14} style={{ color: '#fff' }} />
          </div>
          <span style={{ fontSize: '14px', fontWeight: 700, color: '#e2e8f0' }}>AI Lab Assistant</span>
          {loading && (
            <div style={{ width: '7px', height: '7px', borderRadius: '50%', background: th.activeBg, animation: 'pulse 1s infinite' }}>
              <style>{`@keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.3} }`}</style>
            </div>
          )}
        </div>

        {/* Mode toggle — hidden in locked variant */}
        {variant === 'full' && (
          <div style={{ display: 'flex', background: '#0f172a', borderRadius: '7px', padding: '2px', gap: '2px' }}>
            {(['drive_lab', 'generate_lab'] as const).map(m => (
              <button key={m} onClick={() => setMode(m)}
                style={{
                  padding: '4px 10px', borderRadius: '5px', border: 'none',
                  background: effectiveMode === m ? MODE_THEME[m].activeBg : 'transparent',
                  color: effectiveMode === m ? MODE_THEME[m].activeText : '#4b5563',
                  fontSize: '11px', cursor: 'pointer',
                  fontWeight: effectiveMode === m ? 600 : 400,
                  display: 'flex', alignItems: 'center', gap: '4px',
                }}>
                {m === 'drive_lab' ? <><Zap size={11} /> Drive</> : <><Plus size={11} /> Generate</>}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Messages */}
      <div style={{
        flex: 1, overflowY: 'auto', padding: '12px',
        display: 'flex', flexDirection: 'column', gap: '10px',
        background: th.msgAreaBg,
      }}>
        {messages.map(msg => (
          <div key={msg.id} style={{ display: 'flex', gap: '8px', alignItems: 'flex-start', flexDirection: msg.role === 'user' ? 'row-reverse' : 'row' }}>
            {/* Avatar */}
            <div style={{
              width: '26px', height: '26px', borderRadius: '7px', flexShrink: 0,
              background: msg.role === 'user' ? th.userAvatarBg : 'linear-gradient(135deg,#3b5bdb,#7c3aed)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              {msg.role === 'user' ? <User size={13} style={{ color: th.activeText }} /> : <Bot size={13} style={{ color: '#fff' }} />}
            </div>

            <div style={{ maxWidth: '82%', display: 'flex', flexDirection: 'column', gap: '5px', alignItems: msg.role === 'user' ? 'flex-end' : 'flex-start' }}>
              {/* Bubble */}
              <div style={{
                padding: '9px 12px',
                borderRadius: msg.role === 'user' ? '12px 4px 12px 12px' : '4px 12px 12px 12px',
                background: msg.role === 'user' ? th.userBubbleBg : '#111827',
                border: `1px solid ${msg.role === 'user' ? th.userBubbleBdr : '#1f2937'}`,
                fontSize: '12px', color: '#d1d5db', lineHeight: 1.6,
              }}>
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

              {msg.pendingDefinition && (() => {
                const candidates = msg.definitionCandidates ?? [msg.pendingDefinition];
                const selectedIndex = msg.selectedCandidateIndex ?? 0;
                const selectedDef = candidates[selectedIndex] ?? msg.pendingDefinition;
                const hasMultiple = candidates.length > 1;

                function handleCandidateSelect(idx: number) {
                  const next = candidates[idx];
                  setMessages(prev =>
                    prev.map(m => m.id === msg.id
                      ? { ...m, selectedCandidateIndex: idx, pendingDefinition: next }
                      : m
                    )
                  );
                  onLabGenerated?.(next, { status: 'draft' });
                }

                return (
                <div style={{
                  display: 'flex', flexDirection: 'column', gap: '8px',
                  padding: '10px 12px', background: '#1a1040', border: '1px solid #5b21b6',
                  borderRadius: '8px', maxWidth: '100%',
                }}>
                  {/* Candidate selector tabs */}
                  {hasMultiple && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                      <span style={{ fontSize: '10px', color: '#a78bfa', fontWeight: 600 }}>方案:</span>
                      {candidates.map((cand, idx) => (
                        <button
                          key={idx}
                          type="button"
                          onClick={() => handleCandidateSelect(idx)}
                          style={{
                            padding: '3px 8px', borderRadius: '4px',
                            border: `1px solid ${idx === selectedIndex ? '#a78bfa' : '#3b2a80'}`,
                            background: idx === selectedIndex ? 'rgba(167,139,250,0.2)' : 'transparent',
                            color: idx === selectedIndex ? '#e9d5ff' : '#6b7280',
                            fontSize: '10px', fontWeight: idx === selectedIndex ? 700 : 400,
                            cursor: 'pointer',
                          }}>
                          {cand.title?.slice(0, 30) || cand.registryKey?.slice(0, 30) || `#${idx + 1}`}
                        </button>
                      ))}
                    </div>
                  )}

                  <div style={{ fontSize: '11px', color: '#e9d5ff', lineHeight: 1.5 }}>
                    Lab definition ready: <strong style={{ color: '#fff' }}>{selectedDef.registryKey}</strong>
                    {hasMultiple && <span style={{ color: '#6b7280' }}> ({selectedIndex + 1}/{candidates.length})</span>}
                    <br />
                    左侧 Drafts 预览已更新；你可以继续在对话中提出修改来<strong style={{ color: '#fcd34d' }}>迭代改进当前方案</strong>。需要持久化时，点击下方将当前方案同步到服务器：
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', alignItems: 'center' }}>
                    <button type="button"
                      onClick={() => commitGeneratedLab(msg.id, selectedDef, 'draft', selectedIndex)}
                      style={{ padding: '6px 12px', borderRadius: '6px', border: '1px solid #fbbf24', background: 'rgba(251,191,36,0.12)', color: '#fcd34d', fontSize: '11px', fontWeight: 600, cursor: 'pointer' }}>
                      保存草稿（同步服务器）
                    </button>
                    <button type="button"
                      onClick={() => commitGeneratedLab(msg.id, selectedDef, 'published', selectedIndex)}
                      style={{ padding: '6px 12px', borderRadius: '6px', border: '1px solid #34d399', background: 'rgba(52,211,153,0.15)', color: '#6ee7b7', fontSize: '11px', fontWeight: 600, cursor: 'pointer' }}>
                      Publish now
                    </button>
                  </div>
                </div>
                );
              })()}

              {msg.definition && !msg.pendingDefinition && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  {msg.commitNotice && (
                    <div style={{ fontSize: '11px', fontWeight: 600, color: '#6ee7b7' }}>
                      {msg.commitNotice}
                    </div>
                  )}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '5px', padding: '4px 10px', background: '#1a1040', border: '1px solid #3b2a80', borderRadius: '6px', fontSize: '10px', color: '#a78bfa' }}>
                    <Sparkles size={10} />
                    Saved ({msg.definition.status === 'published' ? 'published' : 'draft'}):
                    <strong>{msg.definition.registryKey}</strong>
                  </div>
                </div>
              )}

              <span style={{ fontSize: '10px', color: '#374151' }}>
                {new Date(msg.timestamp).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
              </span>
            </div>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      {/* Mode hint */}
      <div
        style={{
          padding: '10px 12px',
          background: th.hintBg,
          color: th.hintText,
          borderTop: `1px solid ${th.divider}`,
          display: 'flex',
          alignItems: 'flex-start',
          gap: '10px',
          flexShrink: 0,
          lineHeight: 1.3,
        }}
      >
        <div
          style={{
            width: '22px',
            height: '22px',
            borderRadius: '8px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
            background: effectiveMode === 'generate_lab' ? 'rgba(124,58,237,0.18)' : 'rgba(59,130,246,0.16)',
            border: effectiveMode === 'generate_lab' ? '1px solid rgba(167,139,250,0.32)' : '1px solid rgba(147,197,253,0.28)',
            boxShadow: '0 6px 16px rgba(0,0,0,0.25)',
          }}
        >
          {effectiveMode === 'generate_lab' ? <Sparkles size={12} /> : <Zap size={12} />}
        </div>

        <div style={{ minWidth: 0, flex: 1, display: 'flex', flexDirection: 'column', gap: '4px' }}>
          {effectiveMode === 'generate_lab' ? (
            generateBaseRegistryKey ? (
              <>
                <div style={{ fontSize: '11px', fontWeight: 800, color: '#f5f3ff' }}>
                  迭代基于已选实验
                </div>
                <div style={{ fontSize: '11px', color: 'rgba(233,213,255,0.86)' }}>
                  <span style={{ fontWeight: 700, color: '#ffffff' }}>「{generateBaseTitle?.trim() || generateBaseRegistryKey}」</span>
                  <span
                    style={{
                      marginLeft: '8px',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '6px',
                      padding: '2px 8px',
                      borderRadius: '999px',
                      background: 'rgba(255,255,255,0.08)',
                      border: '1px solid rgba(255,255,255,0.14)',
                      color: '#f5f3ff',
                      fontSize: '10px',
                      fontWeight: 700,
                      maxWidth: '100%',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      verticalAlign: 'middle',
                    }}
                    title={generateBaseRegistryKey}
                  >
                    <code
                      style={{
                        fontSize: '10px',
                        background: 'transparent',
                        padding: 0,
                        color: 'inherit',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {generateBaseRegistryKey}
                    </code>
                  </span>
                </div>
                <div style={{ fontSize: '10px', color: 'rgba(233,213,255,0.72)' }}>
                  生成后 Drafts 会立即预览；需要持久化时再点「保存草稿」或 Drafts 页「保存到服务器」。
                </div>
              </>
            ) : (
              <>
                <div style={{ fontSize: '11px', fontWeight: 800, color: '#f5f3ff' }}>
                  从零生成实验
                </div>
                <div style={{ fontSize: '10px', color: 'rgba(233,213,255,0.72)' }}>
                  选中左侧实验后，将围绕该实验迭代生成。
                </div>
              </>
            )
          ) : (
            <>
              <div style={{ fontSize: '11px', fontWeight: 800, color: '#eff6ff' }}>
                Drive mode
              </div>
              <div style={{ fontSize: '10px', color: 'rgba(219,234,254,0.78)' }}>
                AI 将控制当前实验的状态。
              </div>
            </>
          )}
        </div>
      </div>

      {/* Quick Ideas */}
      <div style={{ borderTop: `1px solid ${th.divider}`, background: th.quickIdeasBg, flexShrink: 0 }}>
        <button onClick={() => setIdeasExpanded(v => !v)}
          style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px 6px', background: 'transparent', border: 'none', cursor: 'pointer' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            {effectiveMode === 'drive_lab'
              ? <Zap size={10} style={{ color: th.ideaIcon }} />
              : <Sparkles size={10} style={{ color: th.ideaIcon }} />}
            <span style={{ fontSize: '10px', fontWeight: 700, color: th.ideaIcon, textTransform: 'uppercase', letterSpacing: '0.07em' }}>Quick Ideas</span>
            <span style={{ fontSize: '9px', padding: '1px 5px', borderRadius: '4px', background: '#0f172a', color: '#374151' }}>
              {(effectiveMode === 'drive_lab' ? DRIVE_IDEAS : QUICK_IDEAS).length}
            </span>
            {selectedCount > 0 && (
              <span style={{ fontSize: '9px', padding: '1px 6px', borderRadius: '4px', background: th.selectedBadgeBg, color: th.selectedBadgeText, fontWeight: 700 }}>
                {selectedCount} selected
              </span>
            )}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            {!ideasExpanded && (
              <span style={{ fontSize: '9px', color: '#374151' }}>+{(effectiveMode === 'drive_lab' ? DRIVE_IDEAS : QUICK_IDEAS).length - COLLAPSED_COUNT} more</span>
            )}
            {ideasExpanded
              ? <ChevronUp size={12} style={{ color: '#4b5563' }} />
              : <ChevronDown size={12} style={{ color: '#374151' }} />}
          </div>
        </button>

        <AnimatePresence initial={false}>
          <motion.div
            key={`${effectiveMode}-${ideasExpanded ? 'expanded' : 'collapsed'}`}
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: 'easeInOut' }}
            style={{ overflow: 'hidden' }}>
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
                    }}>
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

      {/* Input area */}
      <div style={{ padding: '8px 12px 10px', background: th.inputAreaBg, borderTop: `1px solid ${th.divider}`, flexShrink: 0 }}>

        {/* Selected idea tags */}
        <AnimatePresence>
          {selectedIdeas.length > 0 && (
            <motion.div
              initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }} transition={{ duration: 0.15 }}
              style={{ overflow: 'hidden', marginBottom: '6px' }}>
              <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '4px', padding: '6px 8px', borderRadius: '8px', background: th.selectedRowBg, border: `1px solid ${th.selectedRowBdr}` }}>
                {effectiveMode === 'drive_lab'
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

        {/* Textarea + send */}
        <div style={{ position: 'relative' }}>
          <textarea
            ref={textareaRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={
              selectedIdeas.length > 0
                ? `Add details… (or send ${selectedIdeas.length} idea${selectedIdeas.length > 1 ? 's' : ''} directly)`
                : effectiveMode === 'generate_lab' ? 'Describe the lab you want to create…' : 'Tell the lab what to do…'
            }
            rows={3}
            style={{
              width: '100%', boxSizing: 'border-box',
              background: '#0f172a', border: `1px solid ${hasSelected ? th.chipSelBdr + '88' : '#1e293b'}`,
              borderRadius: '10px', padding: '9px 44px 9px 11px',
              fontSize: '12px', color: '#e2e8f0', resize: 'none', outline: 'none',
              lineHeight: 1.5, fontFamily: 'inherit',
            }}
            onFocus={e => { e.currentTarget.style.borderColor = th.chipSelBdr; }}
            onBlur={e => { e.currentTarget.style.borderColor = hasSelected ? th.chipSelBdr + '88' : '#1e293b'; }}
          />
          <button
            onClick={handleSend}
            disabled={!hasSelected || loading}
            style={{
              position: 'absolute', right: '8px', bottom: '8px',
              width: '28px', height: '28px', borderRadius: '8px', border: 'none',
              background: hasSelected && !loading ? th.sendBg : '#1e293b',
              color: hasSelected && !loading ? '#fff' : '#374151',
              cursor: hasSelected && !loading ? 'pointer' : 'not-allowed',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              transition: 'all 0.15s', flexShrink: 0,
            }}>
            {loading
              ? <RefreshCw size={13} style={{ animation: 'spin 1s linear infinite' }} />
              : <ArrowUp size={13} />}
          </button>
        </div>

        <div style={{ marginTop: '4px', fontSize: '9px', color: '#1f2937', textAlign: 'right' }}>
          Enter to send · Shift+Enter for new line
        </div>
      </div>

      {/* Generate confirm modal */}
      <AnimatePresence>
        {showGenModal && (
          <GenerateLabModalInline
            onConfirm={handleConfirmGenerate}
            onCancel={() => { setShowGenModal(false); setPendingInput(''); }}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

// ── Public export: thin wrapper that provides ChatContext-backed panel ─────────
export default function AIChatPanel(props: AIChatPanelProps) {
  return <AIChatPanelInner {...props} />;
}

// ── Re-export types for consumers ─────────────────────────────────────────────
export type { LabGeneratedOptions };

// ── Inline confirmation modal ──────────────────────────────────────────────────
function GenerateLabModalInline({ onConfirm, onCancel }: { onConfirm: () => void; onCancel: () => void }) {
  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.8)', zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px', borderRadius: '12px' }}>
      <motion.div
        initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }}
        style={{ background: '#0f1117', border: '1px solid #1e293b', borderRadius: '12px', padding: '20px', maxWidth: '340px', width: '100%' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
          <Sparkles size={16} style={{ color: '#818cf8' }} />
          <span style={{ fontSize: '14px', fontWeight: 700, color: '#e2e8f0' }}>Generate New Lab?</span>
        </div>
        <p style={{ fontSize: '12px', color: '#9ca3af', marginBottom: '14px', lineHeight: 1.6 }}>
          The AI will build an interactive lab definition. When it finishes, pick <strong style={{ color: '#d1d5db' }}>Save as draft</strong> or <strong style={{ color: '#d1d5db' }}>Publish now</strong> in the chat to add it to your catalog.
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
