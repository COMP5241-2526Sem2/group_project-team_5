import { useEffect, useState, useRef } from 'react';
import { X, Mic, MicOff, Volume2 } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { Quiz } from '../../pages/student/QuizList';
import { useTTS } from '../../utils/speech';

interface QuizPreviewModalProps {
  quiz: Quiz;
  onClose: () => void;
  onStart: (blindMode: boolean) => void;  // mic is managed lazily inside QuizTaking
}

function formatDueDate(isoDate: string): string {
  const date = new Date(isoDate);
  return date.toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

export function QuizPreviewModal({ quiz, onClose, onStart }: QuizPreviewModalProps) {
  const [blindMode, setBlindMode] = useState(false);
  const [showConsent, setShowConsent] = useState(false);
  const [hasConsented, setHasConsented] = useState(false);
  const [showTooltip, setShowTooltip] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  // micAvailable removed — mic permission is requested lazily in QuizTaking

  const modalRef = useRef<HTMLDivElement>(null);
  const { speak, stop: stopSpeaking, isSpeaking } = useTTS();

  // Track isSpeaking for the animated indicator
  useEffect(() => { setSpeaking(isSpeaking); }, [isSpeaking]);

  // ── Esc key: close modal (or cancel consent dialog) ──
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        if (showConsent) { handleConsentCancel(); }
        else { handleClose(); }
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showConsent]);

  // ── On modal open: auto-read summary if blind profile is set ──
  useEffect(() => {
    const userProfile = { accessibility: { blind: false } }; // mock
    if (userProfile.accessibility.blind) {
      setBlindMode(true);
      setHasConsented(true);
      readModalSummary();
    }
    return () => stopSpeaking();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function readModalSummary() {
    // Matches blueprint Frame 2 announcement — full quiz structure + all keyboard controls
    const text =
      `Quiz preview. ${quiz.title}. ` +
      `Course: ${quiz.courseName}. ` +
      `Due: ${formatDueDate(quiz.dueAt)}. ` +
      `Status: ${quiz.status || 'Not started'}. ` +
      `This quiz contains 5 multiple choice questions and 1 short answer question. ` +
      `Keyboard controls: ` +
      `Press 1 to 4 to select answers. ` +
      `Press Enter to confirm. ` +
      `Press Control A to analyze charts or diagrams with AI Vision. ` +
      `For the short answer question, hold Space to record your voice answer. ` +
      `To start the quiz press the Start quiz button. ` +
      `To close press Escape.`;
    speak(text);
  }

  // ── Toggle: show consent on first enable (for recording notice only, not mic permission) ──
  const handleBlindModeToggle = () => {
    stopSpeaking();
    if (!blindMode) {
      if (!hasConsented) {
        // Show recording-consent notice before enabling
        speak(
          'Accessibility blind mode. ' +
          'In this mode your voice may be recorded for grading review. ' +
          'Please read the notice and confirm.'
        );
        setShowConsent(true);
      } else {
        // Already consented before — enable immediately
        setBlindMode(true);
        speak('Blind mode enabled. TTS active.');
      }
    } else {
      setBlindMode(false);
      speak('Blind mode disabled.');
    }
  };

  // ── Consent dialog: read notice text after a short delay ──
  useEffect(() => {
    if (!showConsent) return;
    const timer = setTimeout(() => {
      speak(
        'Accessibility and recording notice. ' +
        'In blind mode, your voice will be recorded and stored until the end of the term for grading review. ' +
        'Only the course teacher and administrators can replay it online. Downloads are disabled. ' +
        'Press I agree to continue, or Cancel to go back.'
      );
    }, 300);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showConsent]);

  const handleConsent = () => {
    // Consent is only about the recording policy — no mic permission here.
    // Mic is requested lazily when the user first presses Space in QuizTaking.
    setHasConsented(true);
    setShowConsent(false);
    setBlindMode(true);
    // Blueprint Frame 2: exact announcement after blind mode is enabled
    speak(
      'Blind mode enabled. ' +
      'This quiz contains 5 multiple choice questions and 1 short answer question. ' +
      'Keyboard controls: ' +
      'Press 1 to 4 to select answers. ' +
      'Press Enter to confirm. ' +
      'Press Control A to analyze charts or diagrams. ' +
      'For the short answer question, hold Space to record your voice answer.'
    );
  };

  const handleConsentCancel = () => {
    stopSpeaking();
    setShowConsent(false);
    setBlindMode(false);
    speak('Cancelled. Blind mode remains off.');
  };

  const handleClose = () => {
    stopSpeaking();
    onClose();
  };

  const handleStart = () => {
    stopSpeaking();
    onStart(blindMode);
  };

  const isQuizNotStarted = quiz.status === 'Not started';

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)',
          zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px',
        }}
        onClick={handleClose}
      >
        <motion.div
          ref={modalRef}
          initial={{ scale: 0.95, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.95, opacity: 0 }}
          transition={{ duration: 0.15 }}
          onClick={e => e.stopPropagation()}
          style={{
            background: '#fff', borderRadius: '16px', maxWidth: '540px', width: '100%',
            boxShadow: '0 20px 60px rgba(0,0,0,0.2)', overflow: 'hidden',
          }}
        >
          {/* ── Header ── */}
          <div style={{ padding: '20px 24px', borderBottom: '1px solid #e8eaed', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <h2 style={{ fontSize: '18px', fontWeight: 600, color: '#0f0f23', margin: 0 }}>Quiz preview</h2>
              {/* Speaking indicator */}
              <AnimatePresence>
                {speaking && (
                  <motion.div
                    initial={{ opacity: 0, scale: 0.8 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.8 }}
                    style={{ display: 'flex', alignItems: 'center', gap: '5px', padding: '3px 9px', background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: '20px' }}
                  >
                    <Volume2 size={12} style={{ color: '#3b5bdb' }} />
                    <span style={{ fontSize: '11px', color: '#3b5bdb', fontWeight: 500 }}>Speaking…</span>
                    <SoundWave />
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
            <button
              onClick={handleClose}
              style={{ width: '32px', height: '32px', borderRadius: '8px', border: '1px solid #e8eaed', background: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#6b7280', transition: 'all 0.15s' }}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = '#f3f4f6'; }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = '#fff'; }}
            >
              <X size={18} />
            </button>
          </div>

          {/* ── Content ── */}
          <div style={{ padding: '24px' }}>
            <div style={{ marginBottom: '20px' }}>
              <div style={{ fontSize: '17px', fontWeight: 600, color: '#0f0f23', marginBottom: '16px' }}>{quiz.title}</div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                <InfoRow label="Course" value={quiz.courseName} />
                <InfoRow label="Due" value={formatDueDate(quiz.dueAt)} />
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                  <span style={{ fontSize: '14px', color: '#9ca3af', minWidth: '80px' }}>Status:</span>
                  <span style={{
                    fontSize: '13px', padding: '2px 10px', borderRadius: '20px', fontWeight: 500,
                    background: quiz.status === 'In progress' ? '#dbeafe' : '#f3f4f6',
                    color: quiz.status === 'In progress' ? '#3b82f6' : '#6b7280',
                  }}>
                    {quiz.status || 'Not started'}
                  </span>
                </div>
                <InfoRow label="Questions" value={`${quiz.questionCount} (${quiz.mcqCount} MCQ + ${quiz.saCount} Short answer)`} />
              </div>
            </div>

            {/* ── Accessibility toggle card ── */}
            <div style={{
              padding: '16px', borderRadius: '12px',
              border: `1.5px solid ${blindMode ? '#bbf7d0' : '#e8eaed'}`,
              background: blindMode ? '#f0fdf4' : '#fafafa',
              transition: 'all 0.2s',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  {blindMode
                    ? <Mic size={15} style={{ color: '#10b981' }} />
                    : <MicOff size={15} style={{ color: '#9ca3af' }} />
                  }
                  <span style={{ fontSize: '14px', fontWeight: 500, color: '#0f0f23' }}>
                    Accessibility (Blind mode)
                  </span>
                  {blindMode && (
                    <span style={{ fontSize: '11px', color: '#10b981', background: '#dcfce7', padding: '1px 8px', borderRadius: '10px', fontWeight: 500 }}>
                      ON
                    </span>
                  )}
                </div>

                {/* Toggle */}
                <button
                  onClick={handleBlindModeToggle}
                  aria-label={blindMode ? 'Disable blind mode' : 'Enable blind mode'}
                  style={{
                    position: 'relative', width: '44px', height: '24px', borderRadius: '12px',
                    border: 'none', cursor: 'pointer', transition: 'background 0.2s',
                    background: blindMode ? '#10b981' : '#d1d5db', flexShrink: 0,
                  }}
                >
                  <div style={{
                    position: 'absolute', top: '2px', left: blindMode ? '22px' : '2px',
                    width: '20px', height: '20px', borderRadius: '50%', background: '#fff',
                    transition: 'left 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
                  }} />
                </button>
              </div>

              <p style={{ fontSize: '12px', color: blindMode ? '#065f46' : '#6b7280', margin: 0, lineHeight: 1.5 }}>
                {blindMode
                  ? 'TTS active — questions will be read aloud.'
                  : 'Enable to activate screen-reader friendly layout and voice-assisted features.'}
              </p>

              {/* Read aloud button when blind mode is ON */}
              {blindMode && (
                <button
                  onClick={() => { stopSpeaking(); setTimeout(readModalSummary, 100); }}
                  style={{
                    marginTop: '12px', display: 'flex', alignItems: 'center', gap: '6px',
                    padding: '7px 14px', background: '#fff', border: '1px solid #bbf7d0',
                    borderRadius: '8px', fontSize: '13px', color: '#065f46', cursor: 'pointer',
                    fontWeight: 500, transition: 'all 0.15s',
                  }}
                  onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = '#dcfce7'; }}
                  onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = '#fff'; }}
                >
                  <Volume2 size={13} />
                  {speaking ? 'Stop reading' : 'Read page aloud'}
                </button>
              )}
            </div>
          </div>

          {/* ── Footer ── */}
          <div style={{ padding: '16px 24px', borderTop: '1px solid #e8eaed', display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
            <button
              onClick={handleClose}
              style={{ padding: '10px 20px', background: '#fff', color: '#6b7280', border: '1px solid #e8eaed', borderRadius: '8px', fontSize: '15px', fontWeight: 500, cursor: 'pointer', transition: 'all 0.15s' }}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = '#f3f4f6'; }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = '#fff'; }}
            >
              Close
            </button>
            <div style={{ position: 'relative', display: 'inline-block' }}>
              <button
                onClick={isQuizNotStarted ? undefined : handleStart}
                disabled={isQuizNotStarted}
                style={{
                  padding: '10px 24px',
                  background: isQuizNotStarted ? '#d1d5db' : '#0f0f23',
                  color: isQuizNotStarted ? '#9ca3af' : '#fff',
                  border: 'none', borderRadius: '8px', fontSize: '15px', fontWeight: 500,
                  cursor: isQuizNotStarted ? 'not-allowed' : 'pointer',
                  transition: 'all 0.15s', opacity: isQuizNotStarted ? 0.6 : 1,
                }}
                onMouseEnter={e => { if (!isQuizNotStarted) (e.currentTarget as HTMLElement).style.background = '#1a1a2e'; }}
                onMouseLeave={e => { if (!isQuizNotStarted) (e.currentTarget as HTMLElement).style.background = '#0f0f23'; }}
                onMouseOver={() => setShowTooltip(true)}
                onMouseOut={() => setShowTooltip(false)}
              >
                Start quiz
              </button>
              {isQuizNotStarted && showTooltip && (
                <div style={{
                  position: 'absolute', bottom: '100%', right: 0, marginBottom: '8px',
                  padding: '8px 12px', background: '#1f2937', color: '#fff',
                  fontSize: '12px', borderRadius: '6px', whiteSpace: 'nowrap',
                  boxShadow: '0 2px 8px rgba(0,0,0,0.2)',
                }}>
                  Quiz not yet opened by teacher
                </div>
              )}
            </div>
          </div>
        </motion.div>

        {/* ── Consent Dialog ── */}
        <AnimatePresence>
          {showConsent && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              style={{
                position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.55)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                padding: '20px', zIndex: 10,
              }}
              onClick={handleConsentCancel}
            >
              <motion.div
                initial={{ scale: 0.92, opacity: 0, y: 8 }}
                animate={{ scale: 1, opacity: 1, y: 0 }}
                exit={{ scale: 0.92, opacity: 0, y: 8 }}
                transition={{ duration: 0.18 }}
                onClick={e => e.stopPropagation()}
                style={{
                  background: '#fff', borderRadius: '16px', maxWidth: '460px', width: '100%',
                  boxShadow: '0 24px 64px rgba(0,0,0,0.3)', overflow: 'hidden',
                }}
              >
                {/* Consent header */}
                <div style={{ padding: '20px 24px 0', display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <div style={{ width: '36px', height: '36px', borderRadius: '10px', background: '#eff6ff', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <Mic size={18} style={{ color: '#3b5bdb' }} />
                  </div>
                  <div>
                    <h3 style={{ fontSize: '16px', fontWeight: 600, color: '#0f0f23', margin: 0 }}>
                      Accessibility & recording notice
                    </h3>
                    {/* Speaking indicator inside consent */}
                    <AnimatePresence>
                      {speaking && (
                        <motion.div
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          exit={{ opacity: 0 }}
                          style={{ display: 'flex', alignItems: 'center', gap: '4px', marginTop: '2px' }}
                        >
                          <Volume2 size={11} style={{ color: '#3b5bdb' }} />
                          <span style={{ fontSize: '11px', color: '#3b5bdb' }}>Reading aloud…</span>
                          <SoundWave />
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                </div>

                <div style={{ padding: '16px 24px 20px' }}>
                  <p style={{ fontSize: '14px', color: '#374151', lineHeight: 1.7, margin: '0 0 12px' }}>
                    In Blind mode, your voice will be recorded and stored until the end of the term for grading review.
                  </p>
                  <ul style={{ margin: 0, padding: '0 0 0 18px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    {[
                      'Only the course teacher and administrators can replay recordings online.',
                      'Downloads are disabled for all parties.',
                      'Recordings are automatically deleted after the term ends.',
                    ].map((item, i) => (
                      <li key={i} style={{ fontSize: '13px', color: '#6b7280', lineHeight: 1.5 }}>{item}</li>
                    ))}
                  </ul>
                </div>

                <div style={{ padding: '14px 24px', borderTop: '1px solid #e8eaed', display: 'flex', gap: '10px', justifyContent: 'flex-end', background: '#fafafa' }}>
                  <button
                    onClick={handleConsentCancel}
                    style={{ padding: '9px 20px', background: '#fff', color: '#6b7280', border: '1px solid #e8eaed', borderRadius: '8px', fontSize: '14px', fontWeight: 500, cursor: 'pointer', transition: 'all 0.15s' }}
                    onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = '#f3f4f6'; }}
                    onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = '#fff'; }}
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleConsent}
                    style={{ padding: '9px 22px', background: '#0f0f23', color: '#fff', border: 'none', borderRadius: '8px', fontSize: '14px', fontWeight: 500, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', transition: 'all 0.15s' }}
                    onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = '#1f1f3a'; }}
                    onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = '#0f0f23'; }}
                  >
                    <Mic size={14} /> I agree
                  </button>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </AnimatePresence>
  );
}

// ── Helpers ──

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: 'flex', gap: '8px' }}>
      <span style={{ fontSize: '14px', color: '#9ca3af', minWidth: '80px' }}>{label}:</span>
      <span style={{ fontSize: '14px', color: '#374151', fontWeight: 500 }}>{value}</span>
    </div>
  );
}

/** Animated sound-wave bars shown while TTS is speaking */
function SoundWave() {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '2px', height: '12px' }}>
      {[1, 2, 3].map(i => (
        <motion.span
          key={i}
          style={{ display: 'block', width: '2px', borderRadius: '2px', background: '#3b5bdb' }}
          animate={{ height: ['4px', '10px', '4px'] }}
          transition={{ duration: 0.7, repeat: Infinity, delay: i * 0.15, ease: 'easeInOut' }}
        />
      ))}
    </span>
  );
}