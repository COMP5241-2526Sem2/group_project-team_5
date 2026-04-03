/**
 * AIVisionSidebar — AI Vision Assistant for blind/low-vision students
 *
 * KEY CHANGES vs previous version:
 *  - useTTS({ rate: 0.72 }) — slower, more stable speech for AI descriptions
 *  - "Please wait, AI is generating…" spoken during analyzing phase
 *  - Streaming slowed to 35ms/char for the initial description (closer to TTS pace)
 *  - Q key fix: handler refs always point to latest handleMicPress/Release
 *  - Esc key closes the sidebar (with spoken confirmation)
 *  - Final announcement: "Hold Q to ask a follow-up. Press Escape to close."
 *  - ScreenshotPreview: shows diagram only, NO options mini-grid
 *  - getAIDescription (preorder): describes tree structure only, no options listing
 */

import { useState, useEffect, useRef } from 'react';
import { motion } from 'motion/react';
import { X, Mic, MicOff, Volume2, RotateCcw } from 'lucide-react';
import { useTTS, useSTT } from '../../utils/speech';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface AIVisionQuestion {
  questionId: string;
  order: number;
  type: 'MCQ_SINGLE' | 'SHORT_ANSWER';
  prompt: string;
  image?: string;
  options?: { key: 'A' | 'B' | 'C' | 'D'; text: string }[];
}

interface ConversationTurn {
  id: string;
  role: 'ai' | 'user';
  text: string;
}

type SidebarPhase = 'capturing' | 'analyzing' | 'streaming' | 'ready';
type FollowUpMicState = 'idle' | 'requesting' | 'listening' | 'denied';

interface AIVisionSidebarProps {
  isOpen: boolean;
  onClose: () => void;
  currentQuestion: AIVisionQuestion | null;
  questionIndex: number;
  blindMode: boolean;
}

// ─── Mock AI descriptions ─────────────────────────────────────────────────────

function getAIDescription(q: AIVisionQuestion): string {
  if (q.type === 'SHORT_ANSWER') {
    return (
      `I can see a short answer question on screen. ` +
      `The question reads: "${q.prompt}". ` +
      `A good answer typically has three parts: clear definitions of both concepts, the key differences between them, and one concrete real-world example for each. ` +
      `You can type your response in the text area below, or hold Space to dictate your answer.`
    );
  }

  // Preorder traversal question — rich tree description (blueprint format, NO answer leak, NO options)
  if (q.prompt.toLowerCase().includes('preorder')) {
    return (
      // ── Blueprint Page 4: "AI MUST NOT reveal answer" ──────────────────────
      // Describe the diagram faithfully. Walk through the traversal RULE.
      // Do NOT state the result sequence or list answer options — the student's task is to find it.
      // ────────────────────────────────────────────────────────────────────────
      `I can see a binary tree diagram with 7 nodes. ` +
      `Node A is at the root. ` +
      `A has two children: B on the left and C on the right. ` +
      `B has one child: D, placed to the left. ` +
      `C has two children: E on the left and F on the right. ` +
      `E has one child: G, placed below it. ` +
      `D, G, and F are leaf nodes — they have no children. ` +
      `The question asks you to determine the preorder traversal sequence of this tree. ` +
      `Remember: preorder visits the root first, then recursively traverses the left subtree, then the right subtree. ` +
      `Starting from node A, trace through each subtree in that order and write down the sequence of nodes you visit. ` +
      `Once you have your sequence, press 1 through 4 to select the matching option, then press Enter to confirm.`
    );
  }

  // Generic MCQ — describe question only, not options
  return (
    `I can see a multiple choice question. ` +
    `The question reads: "${q.prompt}". ` +
    `Think carefully about which core concept is being tested. ` +
    `Press 1 through 4 to select your answer, then press Enter to confirm.`
  );
}

function getFollowUpResponse(question: string, ctx: AIVisionQuestion): string {
  const q = question.toLowerCase();
  if (q.includes('hint') || q.includes('help') || q.includes('clue')) {
    return `Here is a hint. Focus on the fundamental definition rather than surface-level examples. For this question, think about what distinguishing property makes one answer uniquely correct compared to the others.`;
  }
  if (q.includes('why') || q.includes('explain') || q.includes('reason')) {
    return `Great question. The reasoning comes down to first principles. Consider what operation or property the question is fundamentally testing, and trace through why each option either satisfies or violates that property.`;
  }
  if (q.includes('option') || q.includes('choice') || q.includes('answer')) {
    const opts = ctx.options
      ? ctx.options.map((o, i) => `Option ${i + 1}, ${o.text},`).join(' ')
      : 'no options available';
    return `Let me describe the options again. ${opts} Consider which one directly matches what the question is asking.`;
  }
  if (q.includes('repeat') || q.includes('again') || q.includes('read')) {
    return getAIDescription(ctx);
  }
  return `That is an interesting follow-up. Based on the question on screen, the most relevant thing to focus on is the core concept being tested. Does that help clarify things? You can ask me to hint, explain, or repeat the description at any time.`;
}

// ─── Waveform ─────────────────────────────────────────────────────────────────

const NUM_BARS = 28;

function Waveform({ active, analyzing }: { active: boolean; analyzing: boolean }) {
  const [heights, setHeights] = useState<number[]>(() =>
    Array.from({ length: NUM_BARS }, (_, i) => 3 + Math.sin(i * 0.5) * 1.5)
  );

  useEffect(() => {
    if (active) {
      const id = setInterval(() => {
        setHeights(Array.from({ length: NUM_BARS }, () => 4 + Math.random() * 26));
      }, 90);
      return () => clearInterval(id);
    }
    if (analyzing) {
      let offset = 0;
      const id = setInterval(() => {
        offset += 0.25;
        setHeights(Array.from({ length: NUM_BARS }, (_, i) => 4 + Math.sin(i * 0.35 + offset) * 10));
      }, 55);
      return () => clearInterval(id);
    }
    // Idle: gentle breathing
    let t = 0;
    const id = setInterval(() => {
      t += 0.035;
      setHeights(Array.from({ length: NUM_BARS }, (_, i) => 3 + Math.sin(i * 0.28 + t) * 1.8));
    }, 75);
    return () => clearInterval(id);
  }, [active, analyzing]);

  const color = active ? '#3b5bdb' : analyzing ? '#7c3aed' : '#d1d5db';

  return (
    <div
      role="img"
      aria-label={active ? 'Listening waveform' : analyzing ? 'Analyzing waveform' : 'Idle waveform'}
      style={{ display: 'flex', alignItems: 'center', gap: '2px', height: '36px', justifyContent: 'center' }}
    >
      {heights.map((h, i) => (
        <motion.div
          key={i}
          animate={{ height: `${h}px` }}
          transition={{ duration: active ? 0.09 : 0.28, ease: 'easeOut' }}
          style={{ width: '3px', borderRadius: '2px', background: color, flexShrink: 0 }}
        />
      ))}
    </div>
  );
}

// ─── Screenshot preview (diagram only — no options) ───────────────────────────

function ScreenshotPreview({
  question,
  questionIndex,
  captureTime,
}: {
  question: AIVisionQuestion;
  questionIndex: number;
  captureTime: string;
}) {
  return (
    <div
      style={{
        background: '#f8f9fb',
        border: '1px solid #e8eaed',
        borderRadius: '10px',
        padding: '10px 12px',
        position: 'relative',
        overflow: 'hidden',
        flexShrink: 0,
      }}
    >
      {/* Scan sweep animation — plays once on mount */}
      <motion.div
        initial={{ top: '-60%' }}
        animate={{ top: '120%' }}
        transition={{ duration: 0.65, ease: 'linear' }}
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          height: '50%',
          background: 'linear-gradient(to bottom, transparent, rgba(59,91,219,0.07), transparent)',
          pointerEvents: 'none',
          zIndex: 2,
        }}
      />

      {/* Header row */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
        <span style={{ fontSize: '9px', color: '#9ca3af', fontWeight: 500 }}>
          Q{questionIndex + 1} · {question.type === 'MCQ_SINGLE' ? 'MCQ' : 'Short Answer'}
        </span>
        <span
          style={{
            fontSize: '8px',
            background: '#10b981',
            color: '#fff',
            borderRadius: '3px',
            padding: '1px 5px',
            fontWeight: 700,
            letterSpacing: '0.03em',
          }}
        >
          CAPTURED
        </span>
      </div>

      {/* Question text (truncated) */}
      <p
        style={{
          fontSize: '10px',
          color: '#374151',
          lineHeight: 1.5,
          margin: '0 0 6px',
          fontWeight: 500,
        }}
      >
        {question.prompt.length > 90 ? question.prompt.slice(0, 90) + '…' : question.prompt}
      </p>

      {/* Diagram image ONLY — options deliberately excluded from capture */}
      {question.image && (
        <div
          style={{
            background: '#fff',
            border: '1px solid #e8eaed',
            borderRadius: '6px',
            padding: '6px',
            marginBottom: '6px',
            display: 'flex',
            justifyContent: 'center',
          }}
        >
          <img
            src={question.image}
            alt="Question diagram"
            style={{ maxHeight: '90px', maxWidth: '100%', objectFit: 'contain' }}
          />
        </div>
      )}

      {/* Capture timestamp */}
      <div style={{ marginTop: '4px', fontSize: '8px', color: '#9ca3af' }}>{captureTime}</div>
    </div>
  );
}

// ─── Typing cursor ────────────────────────────────────────────────────────────

function BlinkCursor() {
  return (
    <motion.span
      animate={{ opacity: [1, 0, 1] }}
      transition={{ duration: 0.75, repeat: Infinity }}
      style={{
        display: 'inline-block',
        width: '2px',
        height: '13px',
        background: '#3b5bdb',
        borderRadius: '1px',
        verticalAlign: 'text-bottom',
        marginLeft: '2px',
      }}
    />
  );
}

// ─── Dot typing indicator ─────────────────────────────────────────────────────

function TypingDots() {
  return (
    <div style={{ display: 'flex', gap: '4px', alignItems: 'center', padding: '8px 12px' }}>
      {[0, 1, 2].map((i) => (
        <motion.div
          key={i}
          style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#9ca3af' }}
          animate={{ opacity: [0.3, 1, 0.3], y: [0, -3, 0] }}
          transition={{ duration: 0.8, repeat: Infinity, delay: i * 0.15 }}
        />
      ))}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function AIVisionSidebar({
  isOpen,
  onClose,
  currentQuestion,
  questionIndex,
  blindMode,
}: AIVisionSidebarProps) {
  // ── Sidebar TTS: rate 0.72 — slower and calmer than quiz TTS (0.82)
  // This gives the AI description a more measured, unhurried reading pace.
  const { speak, stop: stopSpeaking, isSpeaking, queue } = useTTS({ rate: 0.72 });

  // STT for follow-up questions (hold-to-speak)
  const {
    isListening,
    transcript,
    interimTranscript,
    micPermission,
    startListening,
    stopListening,
    resetTranscript,
  } = useSTT();

  const [phase, setPhase] = useState<SidebarPhase>('capturing');
  const [displayedText, setDisplayedText] = useState('');
  const [conversation, setConversation] = useState<ConversationTurn[]>([]);
  const [followUpMicState, setFollowUpMicState] = useState<FollowUpMicState>('idle');
  const [isProcessingFollowUp, setIsProcessingFollowUp] = useState(false);
  const [captureTime] = useState(() => new Date().toLocaleTimeString());

  // Internal refs
  const streamIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const sentenceBufferRef = useRef('');
  const scrollRef = useRef<HTMLDivElement>(null);
  const qKeyActiveRef = useRef(false);
  const waitingForFollowUpRef = useRef(false);
  const transcriptRef = useRef('');

  // Handler refs — always current, used by the keyboard listener to avoid stale closures
  const handleMicPressRef = useRef<() => void>(() => {});
  const handleMicReleaseRef = useRef<() => void>(() => {});

  // Keep transcriptRef in sync
  useEffect(() => { transcriptRef.current = transcript; }, [transcript]);

  // ── Cleanup on unmount ────────────────────────────────────────────────────
  useEffect(() => {
    return () => {
      if (streamIntervalRef.current) clearInterval(streamIntervalRef.current);
      stopSpeaking();
      stopListening();
    };
  }, []);

  // ── Run analysis when sidebar opens or question changes ───────────────────
  useEffect(() => {
    if (!isOpen || !currentQuestion) return;
    runAnalysis();
  }, [isOpen, currentQuestion?.questionId]);

  // ── Sync followUpMicState with STT state ──────────────────────────────────
  useEffect(() => {
    if (followUpMicState !== 'requesting' && followUpMicState !== 'listening') return;
    if (micPermission === 'denied' || micPermission === 'unsupported') {
      setFollowUpMicState('denied');
    } else if (isListening && followUpMicState === 'requesting') {
      setFollowUpMicState('listening');
    }
  }, [isListening, micPermission]);

  // ── Process follow-up when STT stops ─────────────────────────────────────
  useEffect(() => {
    if (!waitingForFollowUpRef.current || isListening) return;
    const q = transcriptRef.current.trim();
    if (!q) return;
    waitingForFollowUpRef.current = false;
    processFollowUp(q);
    resetTranscript();
  }, [isListening]);

  // ── Keep handler refs always up-to-date ──────────────────────────────────
  // We update refs every render so the Q key handler (set up once) always
  // calls the latest handleMicPress/Release without needing to re-register.
  useEffect(() => {
    handleMicPressRef.current = handleMicPress;
    handleMicReleaseRef.current = handleMicRelease;
  });

  // ── Keyboard: hold Q → follow-up mic, Esc → close (blind mode only) ───────
  useEffect(() => {
    if (!blindMode || !isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      // Esc: close sidebar
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
        return;
      }
      // Q: hold to ask follow-up
      if ((e.key === 'q' || e.key === 'Q') && !qKeyActiveRef.current) {
        e.preventDefault();
        qKeyActiveRef.current = true;
        handleMicPressRef.current();
      }
    };
    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.key === 'q' || e.key === 'Q') {
        qKeyActiveRef.current = false;
        handleMicReleaseRef.current();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [blindMode, isOpen, onClose]); // minimal deps; handlers always-current via refs

  // ── Auto-scroll to bottom ─────────────────────────────────────────────────
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [displayedText, conversation, isProcessingFollowUp]);

  // ─── Analysis phases ──────────────────────────────────────────────────────

  function runAnalysis() {
    if (!currentQuestion) return;

    // Reset
    if (streamIntervalRef.current) clearInterval(streamIntervalRef.current);
    stopSpeaking();
    setPhase('capturing');
    setDisplayedText('');
    setConversation([]);
    sentenceBufferRef.current = '';

    const t1 = setTimeout(() => {
      setPhase('analyzing');
      // Announce to blind users that AI is working — avoids silent confusion
      if (blindMode) {
        speak('Please wait. AI is generating the description.');
      }
    }, 350);

    const fullText = getAIDescription(currentQuestion);

    const t2 = setTimeout(() => {
      setPhase('streaming');
      startStreaming(fullText, () => {
        setPhase('ready');
        if (blindMode) {
          // Queue the ready announcement — plays after the last streamed sentence.
          // Announces Q for follow-up and Esc to close.
          queue('Description complete. Hold Q to ask a follow-up question, or press Escape to close the panel.');
        }
      });
    }, 1800);

    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }

  /**
   * Stream `text` char by char at 35ms/char.
   *
   * Slower streaming (vs previous 18ms) so visual text pacing is closer to
   * the TTS reading speed, giving a more stable, natural feel.
   *
   * TTS: queue() at every sentence boundary for seamless chained playback.
   */
  function startStreaming(text: string, onDone?: () => void) {
    let i = 0;
    sentenceBufferRef.current = '';

    streamIntervalRef.current = setInterval(() => {
      if (i >= text.length) {
        clearInterval(streamIntervalRef.current!);
        streamIntervalRef.current = null;
        if (sentenceBufferRef.current.trim().length > 0) {
          queue(sentenceBufferRef.current.trim());
          sentenceBufferRef.current = '';
        }
        onDone?.();
        return;
      }

      const char = text[i];
      setDisplayedText((prev) => prev + char);
      sentenceBufferRef.current += char;
      i++;

      if (
        (char === '.' || char === '?' || char === '!') &&
        sentenceBufferRef.current.trim().length > 12
      ) {
        queue(sentenceBufferRef.current.trim());
        sentenceBufferRef.current = '';
      }
    }, 35); // 35ms/char — calmer visual streaming pace
  }

  /**
   * Stream a follow-up AI response (18ms/char — follow-ups are shorter)
   */
  function streamFollowUpResponse(text: string, turnId: string, onDone?: () => void) {
    let i = 0;
    let responseText = '';
    sentenceBufferRef.current = '';

    const interval = setInterval(() => {
      if (i >= text.length) {
        clearInterval(interval);
        if (sentenceBufferRef.current.trim().length > 0) {
          queue(sentenceBufferRef.current.trim());
          sentenceBufferRef.current = '';
        }
        onDone?.();
        return;
      }

      const char = text[i];
      responseText += char;
      sentenceBufferRef.current += char;
      i++;

      setConversation((prev) =>
        prev.map((turn) =>
          turn.id === turnId ? { ...turn, text: responseText } : turn
        )
      );

      if (
        (char === '.' || char === '?' || char === '!') &&
        sentenceBufferRef.current.trim().length > 12
      ) {
        queue(sentenceBufferRef.current.trim());
        sentenceBufferRef.current = '';
      }
    }, 18);
  }

  function processFollowUp(question: string) {
    if (!currentQuestion) return;

    const userTurn: ConversationTurn = {
      id: `user-${Date.now()}`,
      role: 'user',
      text: question,
    };
    setConversation((prev) => [...prev, userTurn]);
    setIsProcessingFollowUp(true);
    stopSpeaking();

    setTimeout(() => {
      const response = getFollowUpResponse(question, currentQuestion);
      const aiTurnId = `ai-${Date.now()}`;
      setConversation((prev) => [...prev, { id: aiTurnId, role: 'ai', text: '' }]);
      setIsProcessingFollowUp(false);
      streamFollowUpResponse(response, aiTurnId, () => {
        if (blindMode) {
          queue('Response complete. Hold Q to ask another question, or press Escape to close.');
        }
      });
    }, 800);
  }

  // ─── Mic handlers ─────────────────────────────────────────────────────────

  function handleMicPress() {
    if (phase !== 'ready' || isProcessingFollowUp) return;
    if (followUpMicState === 'denied') {
      speak('Microphone access was denied. Check browser settings to enable it.');
      return;
    }
    if (micPermission === 'unsupported') {
      speak('Speech recognition is not supported in this browser.');
      return;
    }
    if (followUpMicState === 'listening' || followUpMicState === 'requesting') return;

    setFollowUpMicState('requesting');
    stopSpeaking();
    waitingForFollowUpRef.current = false;
    startListening();
  }

  function handleMicRelease() {
    if (followUpMicState !== 'listening' && followUpMicState !== 'requesting') return;
    stopListening();
    setFollowUpMicState('idle');
    waitingForFollowUpRef.current = true;
  }

  // ─────────────────────────────────────────────────────────────────────────

  if (!isOpen) return null;

  const isWaveformActive = followUpMicState === 'listening';
  const isWaveformAnalyzing = phase === 'analyzing' || isProcessingFollowUp;
  const turnCount = conversation.filter((t) => t.role === 'user').length;

  return (
    <div
      style={{
        width: '320px',
        flexShrink: 0,
        display: 'flex',
        flexDirection: 'column',
        background: '#fff',
        border: '1px solid #e8eaed',
        borderRadius: '16px',
        overflow: 'hidden',
        maxHeight: 'calc(100vh - 190px)',
        position: 'sticky',
        top: '20px',
      }}
    >
      {/* ── Header ── */}
      <div
        style={{
          padding: '13px 16px',
          borderBottom: '1px solid #e8eaed',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexShrink: 0,
          background: '#fff',
        }}
      >
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '7px' }}>
            {/* Status dot */}
            <motion.div
              animate={phase !== 'ready' ? { opacity: [1, 0.3, 1] } : { opacity: 1 }}
              transition={{ duration: 1, repeat: phase !== 'ready' ? Infinity : 0 }}
              style={{
                width: '8px',
                height: '8px',
                borderRadius: '50%',
                background: phase === 'ready' ? '#10b981' : '#f59e0b',
                flexShrink: 0,
              }}
            />
            <span style={{ fontSize: '14px', fontWeight: 600, color: '#0f0f23' }}>AI Vision</span>
            {isSpeaking && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '3px' }}>
                <Volume2 size={11} style={{ color: '#3b5bdb' }} />
                <span style={{ fontSize: '10px', color: '#3b5bdb', fontWeight: 500 }}>Reading</span>
              </div>
            )}
          </div>
          <div style={{ fontSize: '11px', color: '#9ca3af', marginTop: '1px' }}>
            Q{questionIndex + 1}
            {turnCount > 0 ? ` · ${turnCount} follow-up${turnCount > 1 ? 's' : ''}` : ' · Analyzing'}
          </div>
        </div>

        <div style={{ display: 'flex', gap: '5px' }}>
          <button
            onClick={runAnalysis}
            title="Re-analyze"
            style={{
              width: '28px',
              height: '28px',
              border: '1px solid #e8eaed',
              borderRadius: '7px',
              background: '#fff',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#6b7280',
            }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = '#f3f4f6'; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = '#fff'; }}
          >
            <RotateCcw size={12} />
          </button>
          <button
            onClick={onClose}
            title="Close (Esc)"
            style={{
              width: '28px',
              height: '28px',
              border: '1px solid #e8eaed',
              borderRadius: '7px',
              background: '#fff',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#6b7280',
            }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = '#f3f4f6'; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = '#fff'; }}
          >
            <X size={14} />
          </button>
        </div>
      </div>

      {/* ── Scrollable body ── */}
      <div
        ref={scrollRef}
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: '14px 16px',
          display: 'flex',
          flexDirection: 'column',
          gap: '12px',
        }}
      >
        {/* Screenshot preview — diagram only */}
        {currentQuestion && (
          <ScreenshotPreview
            question={currentQuestion}
            questionIndex={questionIndex}
            captureTime={captureTime}
          />
        )}

        {/* ── Capturing phase ── */}
        {phase === 'capturing' && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              padding: '10px 12px',
              background: '#f5f3ff',
              borderRadius: '10px',
              border: '1px solid #ddd6fe',
            }}
          >
            <div
              style={{
                width: '12px',
                height: '12px',
                border: '2px solid #7c3aed',
                borderTopColor: 'transparent',
                borderRadius: '50%',
                animation: 'spin 0.8s linear infinite',
                flexShrink: 0,
              }}
            />
            <span style={{ fontSize: '13px', color: '#4c1d95', fontWeight: 500 }}>
              Capturing screenshot…
            </span>
          </div>
        )}

        {/* ── Analyzing phase ── */}
        {phase === 'analyzing' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '10px 12px',
                background: '#f5f3ff',
                borderRadius: '10px',
                border: '1px solid #ddd6fe',
              }}
            >
              <div
                style={{
                  width: '12px',
                  height: '12px',
                  border: '2px solid #7c3aed',
                  borderTopColor: 'transparent',
                  borderRadius: '50%',
                  animation: 'spin 0.8s linear infinite',
                  flexShrink: 0,
                }}
              />
              <span style={{ fontSize: '13px', color: '#4c1d95', fontWeight: 500 }}>
                Analyzing with AI Vision… please wait
              </span>
            </div>
            <Waveform active={false} analyzing={true} />
          </div>
        )}

        {/* ── AI initial description (streaming → ready) ── */}
        {(phase === 'streaming' || phase === 'ready') && displayedText && (
          <div>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                marginBottom: '7px',
              }}
            >
              <div
                style={{
                  width: '20px',
                  height: '20px',
                  background: '#f3f4f6',
                  borderRadius: '5px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '12px',
                  flexShrink: 0,
                }}
              >
                🤖
              </div>
              <span style={{ fontSize: '12px', color: '#9ca3af', fontWeight: 500 }}>
                AI Vision Analysis
              </span>
            </div>
            <div
              style={{
                fontSize: '13px',
                color: '#374151',
                lineHeight: 1.75,
                background: '#f8f9fb',
                borderRadius: '4px 10px 10px 10px',
                padding: '12px 14px',
                border: '1px solid #e8eaed',
              }}
            >
              {displayedText}
              {phase === 'streaming' && <BlinkCursor />}
            </div>
          </div>
        )}

        {/* ── Follow-up conversation turns ── */}
        {conversation.map((turn) =>
          turn.role === 'user' ? (
            <div key={turn.id} style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <div
                style={{
                  maxWidth: '85%',
                  background: '#eef2ff',
                  borderRadius: '10px 10px 3px 10px',
                  padding: '8px 12px',
                  fontSize: '13px',
                  color: '#3b5bdb',
                  fontWeight: 500,
                  lineHeight: 1.55,
                }}
              >
                {turn.text}
              </div>
            </div>
          ) : (
            <div key={turn.id} style={{ display: 'flex', gap: '6px', alignItems: 'flex-start' }}>
              <div
                style={{
                  width: '20px',
                  height: '20px',
                  background: '#f3f4f6',
                  borderRadius: '5px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '12px',
                  flexShrink: 0,
                  marginTop: '1px',
                }}
              >
                🤖
              </div>
              <div
                style={{
                  flex: 1,
                  fontSize: '13px',
                  color: '#374151',
                  lineHeight: 1.75,
                  background: '#f8f9fb',
                  borderRadius: '4px 10px 10px 10px',
                  padding: '8px 12px',
                  border: '1px solid #e8eaed',
                }}
              >
                {turn.text || <BlinkCursor />}
              </div>
            </div>
          )
        )}

        {/* ── AI thinking dots ── */}
        {isProcessingFollowUp && (
          <div style={{ display: 'flex', gap: '6px', alignItems: 'flex-start' }}>
            <div
              style={{
                width: '20px',
                height: '20px',
                background: '#f3f4f6',
                borderRadius: '5px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '12px',
                flexShrink: 0,
              }}
            >
              🤖
            </div>
            <div
              style={{
                background: '#f8f9fb',
                borderRadius: '4px 10px 10px 10px',
                border: '1px solid #e8eaed',
              }}
            >
              <TypingDots />
            </div>
          </div>
        )}

        {/* ── Interim transcript bubble ── */}
        {isWaveformActive && interimTranscript && (
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <div
              style={{
                maxWidth: '85%',
                background: '#f3f4f6',
                borderRadius: '10px 10px 3px 10px',
                padding: '8px 12px',
                fontSize: '13px',
                color: '#9ca3af',
                fontStyle: 'italic',
              }}
            >
              {interimTranscript}…
            </div>
          </div>
        )}
      </div>

      {/* ── Bottom: waveform + mic button ── */}
      <div
        style={{
          padding: '12px 16px 14px',
          borderTop: '1px solid #e8eaed',
          display: 'flex',
          flexDirection: 'column',
          gap: '10px',
          flexShrink: 0,
          background: '#fafafa',
        }}
      >
        {/* Waveform */}
        <Waveform active={isWaveformActive} analyzing={isWaveformAnalyzing} />

        {/* ── Mic button (hold to speak) ── */}
        <button
          onPointerDown={handleMicPress}
          onPointerUp={handleMicRelease}
          onPointerLeave={handleMicRelease}
          disabled={phase !== 'ready' || isProcessingFollowUp}
          style={{
            padding: '10px 16px',
            borderRadius: '10px',
            border: `1.5px solid ${
              followUpMicState === 'denied'
                ? '#fde68a'
                : isWaveformActive
                ? '#ef4444'
                : '#e8eaed'
            }`,
            background: isWaveformActive ? '#fff1f2' : '#fff',
            color:
              followUpMicState === 'denied'
                ? '#92400e'
                : isWaveformActive
                ? '#ef4444'
                : '#374151',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '8px',
            fontSize: '13px',
            fontWeight: 500,
            cursor: phase !== 'ready' || isProcessingFollowUp ? 'not-allowed' : 'pointer',
            opacity: phase !== 'ready' || isProcessingFollowUp ? 0.5 : 1,
            userSelect: 'none',
            WebkitUserSelect: 'none',
            transition: 'border-color 0.15s, background 0.15s, color 0.15s',
          }}
        >
          {followUpMicState === 'requesting' ? (
            <>
              <div
                style={{
                  width: '12px',
                  height: '12px',
                  border: '2px solid #7c3aed',
                  borderTopColor: 'transparent',
                  borderRadius: '50%',
                  animation: 'spin 0.8s linear infinite',
                }}
              />
              Requesting mic access…
            </>
          ) : followUpMicState === 'denied' ? (
            <>
              <MicOff size={14} />
              Microphone denied
            </>
          ) : isWaveformActive ? (
            <>
              <motion.div
                animate={{ scale: [1, 1.25, 1] }}
                transition={{ duration: 0.55, repeat: Infinity }}
                style={{
                  width: '12px',
                  height: '12px',
                  borderRadius: '50%',
                  background: '#ef4444',
                  flexShrink: 0,
                }}
              />
              Listening… release to send
            </>
          ) : (
            <>
              <Mic size={14} />
              Hold to ask a follow-up
            </>
          )}
        </button>

        {/* Keyboard hints */}
        {phase === 'ready' && followUpMicState === 'idle' && (
          <div style={{ fontSize: '11px', color: '#9ca3af', textAlign: 'center' }}>
            {blindMode ? (
              <span style={{ lineHeight: 1.6 }}>
                <kbd
                  style={{
                    padding: '1px 5px',
                    background: '#fff',
                    border: '1px solid #d1d5db',
                    borderRadius: '3px',
                    fontSize: '10px',
                  }}
                >
                  Q
                </kbd>{' '}
                hold to ask ·{' '}
                <kbd
                  style={{
                    padding: '1px 5px',
                    background: '#fff',
                    border: '1px solid #d1d5db',
                    borderRadius: '3px',
                    fontSize: '10px',
                  }}
                >
                  Esc
                </kbd>{' '}
                close
              </span>
            ) : (
              'Hold the button above and speak your question'
            )}
          </div>
        )}

        {followUpMicState === 'denied' && (
          <div style={{ fontSize: '11px', color: '#d97706', textAlign: 'center', lineHeight: 1.5 }}>
            Enable microphone in browser settings to use voice follow-ups.
            <br />
            TTS reading is still fully active.
          </div>
        )}
      </div>
    </div>
  );
}

export default AIVisionSidebar;
