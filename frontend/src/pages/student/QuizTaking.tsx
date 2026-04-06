import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router';
import { ChevronLeft, ChevronRight, Mic, MicOff, Check, Volume2 } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useTTS, useAudioRecorder } from '../../utils/speech';
import { toast } from 'sonner@2.0.3';
import StudentLayout from '../../components/student/StudentLayout';
import { AIVisionSidebar } from '../../components/student/AIVisionSidebar';
import treeImage from 'figma:asset/b0a6cbbe3eabb8bf3e2e753c39d530fc9a0838da.png';
import {
  createOrGetAttemptApi,
  fetchQuizDetailApi,
  saveAttemptAnswersApi,
  submitAttemptApi,
} from '../../utils/quizApi';

// ─── Types ───────────────────────────────────────────────────────────────────

interface Question {
  questionId: string;
  quizId: string;
  order: number;
  type: 'MCQ_SINGLE' | 'SHORT_ANSWER';
  prompt: string;
  image?: string;
  options?: { key: 'A' | 'B' | 'C' | 'D'; text: string }[];
  score?: number;
}

interface Answer {
  questionId: string;
  mcqChoice?: 'A' | 'B' | 'C' | 'D';
  saText?: string;
}

type QuizHeader = {
  title: string;
  courseName: string;
  dueAt: string | null;
};

const KEY_TO_OPTION: Record<string, 'A' | 'B' | 'C' | 'D'> = { '1': 'A', '2': 'B', '3': 'C', '4': 'D' };
const OPTION_TO_NUM: Record<string, number> = { A: 1, B: 2, C: 3, D: 4 };

// ─── Mic state: momentary tool ────────────────────────────────────────────────
//
//  'idle'       — getUserMedia never called. No stream, no permission prompt.
//  'requesting' — getUserMedia in flight (browser permission dialog shown).
//  'recording'  — stream active, MediaRecorder running.
//  'denied'     — user denied permission; TTS-only mode.
//
// The mic is ONLY activated on the Short Answer page when the user holds Space.
// It is NEVER activated on MCQ pages.
// The stream is destroyed immediately when Space is released.
//
type MicState = 'idle' | 'requesting' | 'recording' | 'denied';

// ─── Component ───────────────────────────────────────────────────────────────

export default function QuizTaking() {
  const { quizId } = useParams<{ quizId: string }>();
  const navigate = useNavigate();
  const location = useLocation();

  const navState = (location.state as { blindMode?: boolean } | null);
  const [blindMode] = useState<boolean>(!!navState?.blindMode);
  const [micState, setMicState] = useState<MicState>('idle');

  const [questions, setQuestions] = useState<Question[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [answers, setAnswers] = useState<Map<string, Answer>>(new Map());
  const [tempAnswer, setTempAnswer] = useState<string>('');
  const [confirmState, setConfirmState] = useState<'idle' | 'confirming'>('idle');
  const [showSubmitConfirm, setShowSubmitConfirm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [showAISidebar, setShowAISidebar] = useState(false);
  const [screenshotFlash, setScreenshotFlash] = useState(false);
  const [attemptId, setAttemptId] = useState<number | null>(null);
  const [header, setHeader] = useState<QuizHeader | null>(null);

  const { speak, stop: stopSpeaking, ttsStatus } = useTTS();
  const { recordings, startRecording, stopRecording } = useAudioRecorder();

  const hasReadQuestionRef = useRef(false);
  const questionContentRef = useRef<HTMLDivElement>(null);
  // Prevent duplicate Space keydown events from key-repeat
  const spaceActiveRef = useRef(false);
  // Track whether the SA answer on last question has been confirmed (for Enter-to-submit)
  const [saLastConfirmed, setSaLastConfirmed] = useState(false);
  // ── Per-question SA audio recording map ──
  const [saRecordingMap, setSaRecordingMap] = useState<Map<string, Blob>>(new Map());
  const recordingForQuestionRef = useRef<string | null>(null);
  const prevRecordingsLenRef = useRef(0);

  useEffect(() => {
    let active = true;
    if (!quizId) return;

    (async () => {
      try {
        const numericQuizId = Number(quizId);
        const [detail, attempt] = await Promise.all([
          fetchQuizDetailApi(numericQuizId),
          createOrGetAttemptApi(numericQuizId),
        ]);

        if (!active) return;
        setHeader({
          title: detail.title,
          courseName: detail.course_name,
          dueAt: detail.due_at,
        });
        setAttemptId(attempt.attempt_id);

        const mapped: Question[] = detail.items.map((item) => ({
          questionId: String(item.question_id),
          quizId: String(detail.quiz_id),
          order: item.order,
          type: item.type === 'SHORT_ANSWER' || item.type === 'ESSAY' ? 'SHORT_ANSWER' : 'MCQ_SINGLE',
          prompt: item.prompt,
          image: item.order === 1 ? treeImage : undefined,
          score: item.score,
          options: (item.options || []).map((opt, idx) => {
            const optionKey = String(opt.key || opt.option_key || ['A', 'B', 'C', 'D'][idx] || 'A') as 'A' | 'B' | 'C' | 'D';
            const optionText = String(opt.text || opt.option_text || '').trim();
            return { key: optionKey, text: optionText || optionKey };
          }),
        }));

        setQuestions(mapped);
      } catch {
        toast.error('Failed to load quiz.');
      }
    })();

    return () => {
      active = false;
    };
  }, [quizId]);

  async function saveDraft(_quizId: string, payload: Answer[]): Promise<void> {
    if (!attemptId) return;
    const answersPayload = payload.map((ans) => ({
      question_id: Number(ans.questionId),
      selected_option: ans.mcqChoice,
      text_answer: ans.saText,
    }));
    await saveAttemptAnswersApi(attemptId, answersPayload);
  }

  async function submitQuiz(_quizId: string, _answers: Answer[]): Promise<void> {
    if (!attemptId) {
      throw new Error('attempt not ready');
    }
    await submitAttemptApi(attemptId);
  }

  const currentQuestion = questions[currentIndex];
  const isSAPage = currentQuestion?.type === 'SHORT_ANSWER';
  const answeredQuestions = new Set(answers.keys());
  const isLastQuestion = currentIndex === questions.length - 1;
  const hasRecordingForCurrentQ = currentQuestion ? saRecordingMap.has(currentQuestion.questionId) : false;

  // ── Capture recording blob into per-question map when recording completes ──
  useEffect(() => {
    if (recordings.length > prevRecordingsLenRef.current && recordingForQuestionRef.current) {
      const latest = recordings[recordings.length - 1];
      const qId = recordingForQuestionRef.current;
      setSaRecordingMap(prev => new Map(prev).set(qId, latest.blob));
      // Also mark the answer as saved
      setAnswers(prev => new Map(prev).set(qId, { questionId: qId, saText: '[Audio recording]' }));
      saveDraft(quizId!, Array.from(answers.values()));
      // If last question, mark as confirmed for Enter-to-submit
      const lastQ = currentIndex === questions.length - 1;
      if (lastQ) setSaLastConfirmed(true);
      recordingForQuestionRef.current = null;
    }
    prevRecordingsLenRef.current = recordings.length;
  }, [recordings.length]);

  // ── Auto-read question (TTS only, zero mic side-effects) ──────────────────
  useEffect(() => {
    if (!currentQuestion || !blindMode || hasReadQuestionRef.current) return;
    speak(buildQuestionText(currentQuestion));
    hasReadQuestionRef.current = true;
    return () => { hasReadQuestionRef.current = false; };
  }, [currentQuestion, blindMode]);

  // ── Push-to-talk: Space keydown → start recording (SA only) ──────────────
  // ── Push-to-talk: Space keyup  → stop  recording, destroy stream ──────────
  useEffect(() => {
    if (!blindMode) return;

    const handleKeyDown = async (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target.tagName === 'TEXTAREA' || target.tagName === 'INPUT') return;

      // ── Space key: prevent ALL native button-click behavior in blind mode ──
      // Browser fires a native click on the focused <button> when Space is pressed.
      // We intercept it here unconditionally so we control the exact semantics.
      if (e.key === ' ' && !e.ctrlKey) {
        e.preventDefault(); // always stop native button activation

        if (isSAPage) {
          // SA page only: push-to-talk dictation
          if (spaceActiveRef.current) return;
          spaceActiveRef.current = true;

          if (micState === 'denied') {
            speak('Microphone access was denied. Please type your answer.');
            return;
          }
          if (micState === 'recording' || micState === 'requesting') return;

          // ── Overwrite logic: detect existing recording ──
          const hasExisting = currentQuestion ? saRecordingMap.has(currentQuestion.questionId) : false;

          setMicState('requesting');
          stopSpeaking();

          try {
            await navigator.mediaDevices.getUserMedia({ audio: true });
          } catch {
            setMicState('denied');
            speak('Microphone access denied. Please type your answer.');
            spaceActiveRef.current = false;
            return;
          }

          // Track which question this recording is for
          if (currentQuestion) {
            recordingForQuestionRef.current = currentQuestion.questionId;
            // Destroy old blob if overwriting
            if (hasExisting) {
              setSaRecordingMap(prev => {
                const next = new Map(prev);
                next.delete(currentQuestion.questionId);
                return next;
              });
            }
          }

          setMicState('recording');
          startRecording();
          // Announce recording state with overwrite feedback
          if (hasExisting) {
            speak('Previous recording detected. Overwriting. Recording started.');
          } else {
            speak('Recording started.');
          }
        }
        // MCQ page: Space is intentionally a no-op (just preventDefault above is enough)
        return;
      }

      // ── Ctrl+A: screenshot + AI sidebar ──
      if (e.ctrlKey && e.key === 'a') {
        e.preventDefault();
        triggerScreenshotAndSidebar();
        return;
      }

      // ── MCQ-only shortcuts ──
      if (!currentQuestion || currentQuestion.type !== 'MCQ_SINGLE') return;

      if (KEY_TO_OPTION[e.key]) {
        handleSelectOption(KEY_TO_OPTION[e.key]);
        return;
      }

      if (e.key === 'Enter' && tempAnswer && confirmState === 'confirming') {
        e.preventDefault();
        handleConfirm();
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target.tagName === 'TEXTAREA' || target.tagName === 'INPUT') return;

      if (e.key === ' ' && isSAPage && micState === 'recording') {
        spaceActiveRef.current = false;
        stopRecording();           // onstop → stream.getTracks().forEach(t => t.stop()) in useAudioRecorder
        setMicState('idle');       // stream destroyed, back to idle immediately
        // Blueprint Frame 5: "Recording stopped" then "Audio saved successfully"
        speak('Recording stopped. Audio saved successfully.');
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [blindMode, isSAPage, micState, currentQuestion, tempAnswer, confirmState, saRecordingMap]);

  // ── Reset mic state when navigating away from SA page ────────────────────
  useEffect(() => {
    if (!isSAPage && micState === 'recording') {
      stopRecording();
      setMicState('idle');
      spaceActiveRef.current = false;
    }
  }, [isSAPage, micState]);

  // ── Arrow key navigation (all users; disabled when AI sidebar is open) ────
  useEffect(() => {
    const handleArrowKeys = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target.tagName === 'TEXTAREA' || target.tagName === 'INPUT') return;
      if (showAISidebar) return; // let sidebar handle keyboard

      if (e.key === 'ArrowLeft' && currentIndex > 0) {
        e.preventDefault();
        goToQuestion(currentIndex - 1);
      } else if (e.key === 'ArrowRight' && currentIndex < questions.length - 1) {
        e.preventDefault();
        goToQuestion(currentIndex + 1);
      }
    };
    window.addEventListener('keydown', handleArrowKeys);
    return () => window.removeEventListener('keydown', handleArrowKeys);
  }, [currentIndex, questions.length, showAISidebar]);

  // ── Esc: close AI sidebar when open (blind mode) ──────────────────────────
  useEffect(() => {
    if (!blindMode) return;
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && showAISidebar) {
        e.preventDefault();
        setShowAISidebar(false);
        speak('AI Vision closed.');
      }
    };
    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, [blindMode, showAISidebar]);

  // ── Enter-to-submit on SA last question (blind mode) ──────────────────────
  // When the last question is SA and the answer has been confirmed,
  // pressing Enter opens the submit confirmation modal.
  useEffect(() => {
    if (!blindMode) return;
    const handleEnterSubmit = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target.tagName === 'TEXTAREA' || target.tagName === 'INPUT') return;
      if (e.key !== 'Enter') return;

      const lastQ = currentIndex === questions.length - 1;

      // If submit confirmation modal is open, Enter confirms submission
      if (showSubmitConfirm && !submitting) {
        e.preventDefault();
        doFinalSubmit();
        return;
      }

      // If on SA last question and answer is confirmed, Enter opens submit modal
      if (lastQ && isSAPage && saLastConfirmed && !showSubmitConfirm) {
        e.preventDefault();
        doOpenSubmitConfirm();
        return;
      }

      // If on MCQ last question and answer is already saved, Enter opens submit
      if (lastQ && !isSAPage && currentQuestion && answers.has(currentQuestion.questionId) && confirmState === 'idle' && !showSubmitConfirm) {
        e.preventDefault();
        doOpenSubmitConfirm();
        return;
      }
    };
    window.addEventListener('keydown', handleEnterSubmit);
    return () => window.removeEventListener('keydown', handleEnterSubmit);
  }, [blindMode, currentIndex, questions.length, isSAPage, saLastConfirmed, showSubmitConfirm, submitting, confirmState, currentQuestion, answers]);

  // ── Escape to cancel submit confirmation modal (blind mode) ───────────────
  useEffect(() => {
    if (!blindMode || !showSubmitConfirm) return;
    const handleEscSubmit = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        setShowSubmitConfirm(false);
        if (blindMode) speak('Submission cancelled.');
      }
    };
    window.addEventListener('keydown', handleEscSubmit);
    return () => window.removeEventListener('keydown', handleEscSubmit);
  }, [blindMode, showSubmitConfirm]);

  // ── Backspace / Delete: clear SA recording for current question ────────────
  useEffect(() => {
    if (!blindMode || !isSAPage) return;
    const handleClearAnswer = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target.tagName === 'TEXTAREA' || target.tagName === 'INPUT') return;
      if (e.key !== 'Backspace' && e.key !== 'Delete') return;
      if (!currentQuestion) return;
      // Only act if there's a recording or answer to clear
      const hasRec = saRecordingMap.has(currentQuestion.questionId);
      const hasAns = answers.has(currentQuestion.questionId);
      if (!hasRec && !hasAns) return;

      e.preventDefault();
      // Clear recording blob
      if (hasRec) {
        setSaRecordingMap(prev => {
          const next = new Map(prev);
          next.delete(currentQuestion.questionId);
          return next;
        });
      }
      // Clear answer entry
      if (hasAns) {
        setAnswers(prev => {
          const next = new Map(prev);
          next.delete(currentQuestion.questionId);
          return next;
        });
      }
      setSaLastConfirmed(false);
      speak('Answer cleared. The question is now empty.');
    };
    window.addEventListener('keydown', handleClearAnswer);
    return () => window.removeEventListener('keydown', handleClearAnswer);
  }, [blindMode, isSAPage, currentQuestion, saRecordingMap, answers]);

  // ─── Helpers ──────────────────────────────────────────────────────────────

  function buildQuestionText(q: Question): string {
    let text = `Question ${q.order} of ${questions.length}. ${q.prompt}. `;
    if (q.type === 'MCQ_SINGLE' && q.options) {
      // If the question has a diagram, alert the student upfront
      if (q.image) {
        text += 'This question includes a diagram. Press Control A to open AI Vision for a full description. ';
      }
      // Do NOT list options here — user presses 1-4 to hear each one on demand
      text += 'Press 1 through 4 to select an option. TTS will read the option aloud. Then press Enter to confirm.';
    } else {
      text += 'Short answer question. ';
      if (q.order === questions.length) {
        text += 'This is the last question. ';
      }
      text += 'Type your response, or hold Space to record your voice answer.';
      if (q.order === questions.length) {
        text += ' After confirming your answer, press Enter to submit the quiz.';
      }
    }
    return text;
  }

  function handleSelectOption(choice: 'A' | 'B' | 'C' | 'D') {
    if (!currentQuestion || currentQuestion.type !== 'MCQ_SINGLE') return;
    setTempAnswer(choice);
    setConfirmState('confirming');
    if (blindMode) {
      // Read the full option TEXT, then after a natural pause say "Press Enter to confirm."
      const optText = currentQuestion.options?.find(o => o.key === choice)?.text ?? '';
      speak(`Option ${OPTION_TO_NUM[choice]}: ${optText}.`, 'Press Enter to confirm.');
    }
  }

  function handleOptionClick(choice: 'A' | 'B' | 'C' | 'D') {
    if (confirmState === 'confirming' && tempAnswer === choice) handleConfirm();
    else handleSelectOption(choice);
  }

  function handleConfirm() {
    if (!currentQuestion || !tempAnswer) return;
    const answer: Answer = { questionId: currentQuestion.questionId };
    if (currentQuestion.type === 'MCQ_SINGLE') answer.mcqChoice = tempAnswer as 'A' | 'B' | 'C' | 'D';
    else answer.saText = tempAnswer;
    setAnswers(prev => new Map(prev).set(currentQuestion.questionId, answer));
    setConfirmState('idle');
    setTempAnswer('');
    saveDraft(quizId!, Array.from(answers.values()));
    if (currentIndex < questions.length - 1) {
      // Blueprint Frame 3: "Answer confirmed. Moving to next question."
      if (blindMode) speak('Answer confirmed. Moving to next question.');
      setTimeout(() => goToQuestion(currentIndex + 1), blindMode ? 800 : 400);
    } else {
      // Last question
      if (blindMode) speak('Answer confirmed. All questions answered. Press Enter to submit the quiz.');
      setSaLastConfirmed(true);
    }
  }

  function goToQuestion(index: number) {
    stopSpeaking();
    setCurrentIndex(index);
    setConfirmState('idle');
    setTempAnswer('');
    hasReadQuestionRef.current = false;
    spaceActiveRef.current = false;
  }

  function triggerScreenshotAndSidebar() {
    setScreenshotFlash(true);
    setTimeout(() => setScreenshotFlash(false), 300);
    // Stop quiz TTS — the AI sidebar will handle its own TTS from here
    stopSpeaking();
    setShowAISidebar(true);
  }

  function doOpenSubmitConfirm() {
    setShowSubmitConfirm(true);
    if (blindMode) {
      speak(
        `Confirm submission. You answered ${answers.size} of ${questions.length} questions. Press Enter to confirm, or Escape to cancel.`
      );
    }
  }

  async function doFinalSubmit() {
    setSubmitting(true);
    if (blindMode) speak('Submitting your quiz…');
    try {
      await submitQuiz(quizId!, Array.from(answers.values()));
      if (blindMode) speak('Quiz submitted successfully. Returning to quiz list.');
      toast.success('Submitted successfully.');
      navigate(`/student/quiz/${quizId}/review?attemptId=${attemptId ?? ''}`);
    } catch {
      if (blindMode) speak('Submission failed. Please try again.');
      toast.error('Submission failed. Please try again.');
      setSubmitting(false);
    }
  }

  // ─── Loading ──────────────────────────────────────────────────────────────

  if (questions.length === 0) {
    return (
      <StudentLayout>
        <div style={{ padding: '32px', display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '400px' }}>
          <div style={{ fontSize: '14px', color: '#9ca3af' }}>Loading quiz...</div>
        </div>
      </StudentLayout>
    );
  }

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <StudentLayout>
      <div style={{ minHeight: 'calc(100vh - 48px)', display: 'flex', flexDirection: 'column', background: '#f8f9fb' }}>

        {/* ── Header ── */}
        <div style={{ padding: '20px 32px', borderBottom: '1px solid #e8eaed', background: '#fff' }}>
          <div style={{ maxWidth: '960px', margin: '0 auto' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
              <div>
                <h1 style={{ fontSize: '20px', fontWeight: 600, color: '#0f0f23', margin: '0 0 4px' }}>
                  {header?.title || 'Quiz'}
                </h1>
                <p style={{ fontSize: '13px', color: '#9ca3af', margin: 0 }}>
                  {header?.courseName || '-'} · Due: {header?.dueAt ? new Date(header.dueAt).toLocaleString() : '-'}
                </p>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                {blindMode && (
                  <button
                    onClick={triggerScreenshotAndSidebar}
                    style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '7px 14px', border: '1px solid #e8eaed', borderRadius: '8px', background: '#fff', color: '#6b7280', fontSize: '13px', cursor: 'pointer', transition: 'all 0.15s' }}
                    onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = '#f3f4f6'; }}
                    onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = '#fff'; }}
                  >
                    Ctrl+A · AI
                  </button>
                )}
                <div style={{ fontSize: '15px', fontWeight: 600, color: '#3b5bdb' }}>
                  Q{currentIndex + 1} / {questions.length}
                </div>
              </div>
            </div>

            {/* Question nav pills */}
            <div style={{ display: 'flex', gap: '6px' }}>
              {questions.map((q, idx) => (
                <button
                  key={q.questionId}
                  onClick={() => goToQuestion(idx)}
                  style={{
                    width: '36px', height: '36px', borderRadius: '8px', cursor: 'pointer',
                    border: `1.5px solid ${idx === currentIndex ? '#3b5bdb' : answeredQuestions.has(q.questionId) ? '#10b981' : '#e8eaed'}`,
                    background: idx === currentIndex ? '#eef2ff' : answeredQuestions.has(q.questionId) ? '#f0fdf4' : '#fff',
                    color: idx === currentIndex ? '#3b5bdb' : answeredQuestions.has(q.questionId) ? '#10b981' : '#9ca3af',
                    fontSize: '14px', fontWeight: 600,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    position: 'relative', transition: 'all 0.15s',
                  }}
                >
                  {idx + 1}
                  {answeredQuestions.has(q.questionId) && (
                    <Check size={10} style={{ position: 'absolute', top: '2px', right: '2px', color: '#10b981' }} />
                  )}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* ── Body ── */}
        <div style={{ flex: 1, padding: '28px 32px', display: 'flex', gap: '0', alignItems: 'flex-start', overflow: 'hidden' }}>
          <div style={{
            flex: 1,
            minWidth: 0,
            maxWidth: showAISidebar ? '100%' : '960px',
            marginLeft: showAISidebar ? '0' : 'auto',
            marginRight: showAISidebar ? '0' : 'auto',
            transition: 'max-width 0.25s',
          }}>
            <AnimatePresence mode="wait">
              <motion.div
                key={currentQuestion?.questionId}
                ref={questionContentRef}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -12 }}
                transition={{ duration: 0.18 }}
                style={{ position: 'relative' }}
              >
                {/* Screenshot flash */}
                {screenshotFlash && (
                  <div style={{ position: 'absolute', inset: 0, background: 'rgba(59,91,219,0.1)', borderRadius: '16px', zIndex: 10, pointerEvents: 'none' }} />
                )}

                {/* ── MCQ Layout ── */}
                {currentQuestion?.type === 'MCQ_SINGLE' && currentQuestion.options && (
                  <>
                    {blindMode ? (
                      <>
                        {/* Stem + image panel (blind mode) */}
                        <div style={{ display: 'flex', gap: '14px', marginBottom: '14px' }}>
                          <div style={{ flex: 1, background: '#fff', border: '1px solid #e8eaed', borderRadius: '16px', padding: '32px 36px', minHeight: '200px', display: 'flex', alignItems: 'flex-start' }}>
                            <p style={{ fontSize: '16px', color: '#0f0f23', lineHeight: 1.75, margin: 0 }}>
                              {currentQuestion.prompt}
                            </p>
                          </div>
                          {/* Image panel — real image if available, placeholder otherwise */}
                          <div style={{ width: '280px', flexShrink: 0, background: '#f3f4f6', border: '1px solid #e8eaed', borderRadius: '16px', display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '200px', overflow: 'hidden' }}>
                            {currentQuestion.image ? (
                              <img
                                src={currentQuestion.image}
                                alt="Question diagram"
                                style={{ width: '100%', height: '100%', objectFit: 'contain', padding: '12px', boxSizing: 'border-box' }}
                              />
                            ) : (
                              <span style={{ fontSize: '13px', color: '#9ca3af' }}>No image</span>
                            )}
                          </div>
                        </div>
                        {/* 4-card grid */}
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px' }}>
                          {currentQuestion.options.map((option, idx) => {
                            const num = idx + 1;
                            const savedChoice = answers.get(currentQuestion.questionId)?.mcqChoice;
                            const isActive = tempAnswer === option.key;
                            const isSaved = !tempAnswer && savedChoice === option.key;
                            const isSelected = isActive || isSaved;
                            const isConfirming = isActive && confirmState === 'confirming';
                            return (
                              <button
                                key={option.key}
                                onClick={() => handleOptionClick(option.key)}
                                style={{ padding: '20px 16px 18px', borderRadius: '14px', border: `2px solid ${isSelected ? '#3b5bdb' : '#e8eaed'}`, background: isSelected ? 'rgba(59,91,219,0.05)' : '#fff', textAlign: 'left', cursor: 'pointer', transition: 'all 0.15s' }}
                                onMouseEnter={e => { if (!isSelected) { (e.currentTarget as HTMLElement).style.borderColor = '#d1d5db'; (e.currentTarget as HTMLElement).style.background = '#fafafa'; } }}
                                onMouseLeave={e => { if (!isSelected) { (e.currentTarget as HTMLElement).style.borderColor = '#e8eaed'; (e.currentTarget as HTMLElement).style.background = '#fff'; } }}
                              >
                                <div style={{ fontSize: '12px', color: isSelected ? '#3b5bdb' : '#9ca3af', marginBottom: '10px', fontWeight: 500 }}>[{num}]</div>
                                <div style={{ fontSize: '15px', fontWeight: 600, color: '#0f0f23', lineHeight: 1.35 }}>{option.text}</div>
                                {isConfirming && <div style={{ marginTop: '10px', fontSize: '12px', color: '#3b5bdb', fontWeight: 500 }}>Enter to confirm</div>}
                                {isSaved && <div style={{ marginTop: '10px', display: 'flex', alignItems: 'center', gap: '4px', fontSize: '12px', color: '#10b981' }}><Check size={11} /> Confirmed</div>}
                              </button>
                            );
                          })}
                        </div>
                      </>
                    ) : (
                      <>
                        {/* Non-blind: image above question if present */}
                        {currentQuestion.image && (
                          <div style={{ background: '#fff', border: '1px solid #e8eaed', borderRadius: '14px', padding: '20px', marginBottom: '20px', display: 'flex', justifyContent: 'center' }}>
                            <img
                              src={currentQuestion.image}
                              alt="Question diagram"
                              style={{ maxHeight: '260px', maxWidth: '100%', objectFit: 'contain' }}
                            />
                          </div>
                        )}
                        <div style={{ fontSize: '17px', fontWeight: 500, color: '#0f0f23', marginBottom: '24px', lineHeight: 1.6 }}>
                          {currentQuestion.prompt}
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                          {currentQuestion.options.map(option => {
                            const isSelected = tempAnswer === option.key || answers.get(currentQuestion.questionId)?.mcqChoice === option.key;
                            const isConfirming = confirmState === 'confirming' && tempAnswer === option.key;
                            return (
                              <button
                                key={option.key}
                                onClick={() => handleOptionClick(option.key)}
                                style={{ padding: '16px 20px', borderRadius: '12px', border: `2px solid ${isSelected ? '#3b5bdb' : '#e8eaed'}`, background: isSelected ? '#eef2ff' : '#fff', textAlign: 'left', cursor: 'pointer', transition: 'all 0.15s' }}
                                onMouseEnter={e => { if (!isSelected) (e.currentTarget as HTMLElement).style.borderColor = '#d1d5db'; }}
                                onMouseLeave={e => { if (!isSelected) (e.currentTarget as HTMLElement).style.borderColor = '#e8eaed'; }}
                              >
                                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                  <div style={{ width: '32px', height: '32px', borderRadius: '8px', background: isSelected ? '#3b5bdb' : '#f3f4f6', color: isSelected ? '#fff' : '#6b7280', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '15px', fontWeight: 600, flexShrink: 0 }}>
                                    {option.key}
                                  </div>
                                  <span style={{ fontSize: '15px', color: isSelected ? '#0f0f23' : '#374151', fontWeight: isSelected ? 500 : 400 }}>
                                    {option.text}
                                  </span>
                                </div>
                                {isConfirming && <div style={{ marginTop: '8px', fontSize: '12px', color: '#3b5bdb', fontWeight: 500 }}>Click again to confirm</div>}
                              </button>
                            );
                          })}
                        </div>
                      </>
                    )}
                  </>
                )}

                {/* ── Short Answer Layout ── */}
                {currentQuestion?.type === 'SHORT_ANSWER' && (
                  <>
                    {/* Question prompt card */}
                    <div style={{ background: '#f3f4f6', borderRadius: '14px', padding: '24px 28px', marginBottom: '20px' }}>
                      <p style={{ fontSize: '15px', color: '#374151', lineHeight: 1.7, margin: 0 }}>
                        {currentQuestion.prompt}
                      </p>
                    </div>

                    {/* Recording / answer area */}
                    <div style={{
                      borderRadius: '14px',
                      border: `2px solid ${micState === 'recording' ? '#ef4444' : hasRecordingForCurrentQ ? '#10b981' : '#3b5bdb'}`,
                      background: '#fff',
                      padding: '24px',
                      minHeight: '240px',
                      display: 'flex',
                      flexDirection: 'column',
                      position: 'relative',
                      overflow: 'hidden',
                      transition: 'border-color 0.2s',
                    }}>
                      {/* Placeholder / status text */}
                      <div style={{ fontSize: '14px', color: '#9ca3af', marginBottom: '8px' }}>
                        {micState === 'recording'
                          ? 'Recording… release Space to save'
                          : hasRecordingForCurrentQ
                          ? 'Recording saved — hold Space to re-record, or Backspace to clear'
                          : 'Type or hold Space to dictate...'}
                      </div>

                      {/* Centered mic button area */}
                      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative' }}>
                        {/* Red expanding ripple during recording */}
                        {micState === 'recording' && (
                          <>
                            <motion.div
                              animate={{ scale: [1, 2.5], opacity: [0.4, 0] }}
                              transition={{ duration: 1.5, repeat: Infinity, ease: 'easeOut' }}
                              style={{ position: 'absolute', width: '72px', height: '72px', borderRadius: '50%', background: 'rgba(239, 68, 68, 0.25)' }}
                            />
                            <motion.div
                              animate={{ scale: [1, 2], opacity: [0.3, 0] }}
                              transition={{ duration: 1.5, repeat: Infinity, ease: 'easeOut', delay: 0.3 }}
                              style={{ position: 'absolute', width: '72px', height: '72px', borderRadius: '50%', background: 'rgba(239, 68, 68, 0.2)' }}
                            />
                          </>
                        )}

                        {/* Saved checkmark ripple */}
                        {hasRecordingForCurrentQ && micState !== 'recording' && (
                          <motion.div
                            initial={{ scale: 0.8, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            style={{ position: 'absolute', width: '88px', height: '88px', borderRadius: '50%', background: 'rgba(16, 185, 129, 0.08)', border: '2px solid rgba(16, 185, 129, 0.2)' }}
                          />
                        )}

                        {/* Main mic circle */}
                        <motion.div
                          animate={micState === 'recording' ? { scale: [1, 1.08, 1] } : {}}
                          transition={micState === 'recording' ? { duration: 0.8, repeat: Infinity, ease: 'easeInOut' } : {}}
                          style={{
                            width: '72px', height: '72px', borderRadius: '50%',
                            background: micState === 'recording' ? '#ef4444'
                              : hasRecordingForCurrentQ ? '#10b981'
                              : micState === 'denied' ? '#d97706'
                              : '#7c3aed',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            boxShadow: micState === 'recording'
                              ? '0 0 0 4px rgba(239, 68, 68, 0.2)'
                              : hasRecordingForCurrentQ
                              ? '0 0 0 4px rgba(16, 185, 129, 0.15)'
                              : '0 4px 14px rgba(124, 58, 237, 0.3)',
                            position: 'relative', zIndex: 2,
                            transition: 'background 0.2s, box-shadow 0.2s',
                          }}
                        >
                          {hasRecordingForCurrentQ && micState !== 'recording' ? (
                            <Check size={28} style={{ color: '#fff' }} />
                          ) : micState === 'denied' ? (
                            <MicOff size={28} style={{ color: '#fff' }} />
                          ) : (
                            <Mic size={28} style={{ color: '#fff' }} />
                          )}
                        </motion.div>
                      </div>

                      {/* Status text below mic */}
                      <div style={{ textAlign: 'center', marginTop: '12px' }}>
                        {micState === 'recording' && (
                          <span style={{ fontSize: '13px', fontWeight: 500, color: '#ef4444' }}>
                            Release Space to save
                          </span>
                        )}
                        {micState === 'requesting' && (
                          <span style={{ fontSize: '13px', fontWeight: 500, color: '#7c3aed' }}>
                            Requesting microphone access…
                          </span>
                        )}
                        {micState === 'idle' && hasRecordingForCurrentQ && (
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
                            <Check size={14} style={{ color: '#10b981' }} />
                            <span style={{ fontSize: '13px', fontWeight: 500, color: '#10b981' }}>
                              Audio saved
                            </span>
                            <span style={{ fontSize: '12px', color: '#9ca3af', marginLeft: '8px' }}>
                              Space to re-record · Backspace to clear
                            </span>
                          </div>
                        )}
                        {micState === 'idle' && !hasRecordingForCurrentQ && (
                          <span style={{ fontSize: '13px', color: '#9ca3af' }}>
                            Hold <kbd style={{ padding: '1px 6px', background: '#f3f4f6', border: '1px solid #e8eaed', borderRadius: '4px', fontSize: '11px' }}>Space</kbd> to record
                          </span>
                        )}
                        {micState === 'denied' && (
                          <span style={{ fontSize: '13px', fontWeight: 500, color: '#d97706' }}>
                            Microphone denied — type below
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Fallback textarea for typing (shown when no recording and idle, or denied) */}
                    {(micState === 'denied' || (!hasRecordingForCurrentQ && micState === 'idle')) && (
                      <div style={{ marginTop: '16px' }}>
                        <textarea
                          value={tempAnswer || ''}
                          onChange={e => setTempAnswer(e.target.value)}
                          placeholder="Or type your answer here..."
                          style={{ width: '100%', minHeight: '100px', padding: '14px', borderRadius: '10px', border: '1.5px solid #e8eaed', fontSize: '14px', lineHeight: 1.7, color: '#374151', resize: 'vertical', outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box', transition: 'border-color 0.15s' }}
                          onFocus={e => { (e.currentTarget as HTMLElement).style.borderColor = '#3b5bdb'; }}
                          onBlur={e => { (e.currentTarget as HTMLElement).style.borderColor = '#e8eaed'; }}
                        />
                        {tempAnswer && (
                          <button
                            onClick={handleConfirm}
                            style={{ marginTop: '10px', padding: '10px 28px', background: '#0f0f23', color: '#fff', border: 'none', borderRadius: '8px', fontSize: '14px', fontWeight: 500, cursor: 'pointer' }}
                          >
                            Confirm answer
                          </button>
                        )}
                      </div>
                    )}
                  </>
                )}

                {/* ── Blind mode accessibility bar ──────────────────────────────────────
                 *
                 *  MCQ page:  TTS active · keyboard hints only. Mic not mentioned.
                 *  SA page:   Push-to-talk dictation. Mic state drives the UI.
                 *
                 * ────────────────────────────────────────────────────────────────────── */}
                {blindMode && (
                  <div style={{ marginTop: '16px', padding: '12px 16px', borderRadius: '12px', display: 'flex', alignItems: 'center', gap: '10px', border: '1px solid', ...(
                    !isSAPage                  ? { background: '#f0fdf4', borderColor: '#d1fae5' } :
                    micState === 'denied'      ? { background: '#fffbeb', borderColor: '#fde68a' } :
                    micState === 'recording'   ? { background: '#fff1f2', borderColor: '#fecdd3' } :
                                                 { background: '#f5f3ff', borderColor: '#ddd6fe' }
                  ) }}>

                    {/* ── MCQ: TTS active, no mic ── */}
                    {!isSAPage && (
                      <>
                        <Volume2 size={15} style={{ color: '#10b981', flexShrink: 0 }} />
                        <span style={{ fontSize: '13px', fontWeight: 500, color: '#065f46' }}>
                          {ttsStatus === 'speaking' ? 'Reading aloud…'
                            : ttsStatus === 'no-voices' ? 'Loading voices…'
                            : ttsStatus === 'unsupported' ? 'TTS not supported'
                            : 'TTS ready'}
                        </span>
                        <span style={{ fontSize: '12px', color: '#6b7280', marginLeft: 'auto', display: 'flex', gap: '8px', alignItems: 'center' }}>
                          {/* Manual re-read button — direct synchronous user-gesture trigger */}
                          <button
                            onClick={() => {
                              if (ttsStatus === 'speaking') {
                                stopSpeaking();
                              } else {
                                speak(buildQuestionText(currentQuestion!));
                              }
                            }}
                            style={{
                              display: 'flex', alignItems: 'center', gap: '4px',
                              padding: '2px 10px', background: ttsStatus === 'speaking' ? '#dcfce7' : '#fff',
                              border: `1px solid ${ttsStatus === 'unsupported' ? '#fca5a5' : '#d1fae5'}`,
                              borderRadius: '5px', fontSize: '11px',
                              color: ttsStatus === 'unsupported' ? '#dc2626' : '#065f46',
                              cursor: ttsStatus === 'unsupported' ? 'not-allowed' : 'pointer', fontWeight: 500
                            }}
                            disabled={ttsStatus === 'unsupported'}
                            title={ttsStatus === 'speaking' ? 'Stop reading' : 'Read this question aloud'}
                          >
                            <Volume2 size={10} /> {ttsStatus === 'speaking' ? 'Stop' : 'Read aloud'}
                          </button>
                          <kbd style={{ padding: '1px 5px', background: '#fff', border: '1px solid #d1d5db', borderRadius: '4px', fontSize: '11px' }}>1–4</kbd> select ·
                          <kbd style={{ padding: '1px 5px', background: '#fff', border: '1px solid #d1d5db', borderRadius: '4px', fontSize: '11px' }}>Enter</kbd> confirm ·
                          <kbd style={{ padding: '1px 5px', background: '#fff', border: '1px solid #d1d5db', borderRadius: '4px', fontSize: '11px' }}>←/→</kbd> prev/next ·
                          <kbd style={{ padding: '1px 5px', background: '#fff', border: '1px solid #d1d5db', borderRadius: '4px', fontSize: '11px' }}>Ctrl+A</kbd> AI
                        </span>
                      </>
                    )}

                    {/* ── SA idle: visual prompt only, mic not initialised ── */}
                    {isSAPage && micState === 'idle' && (
                      <>
                        <Mic size={15} style={{ color: '#7c3aed', flexShrink: 0 }} />
                        <span style={{ fontSize: '13px', fontWeight: 500, color: '#4c1d95' }}>
                          Hold{' '}
                          <kbd style={{ padding: '1px 6px', background: '#fff', border: '1px solid #c4b5fd', borderRadius: '4px', fontSize: '11px' }}>Space</kbd>
                          {' '}to dictate
                        </span>
                        <span style={{ fontSize: '12px', color: '#7c3aed', marginLeft: 'auto' }}>
                          Microphone not active
                        </span>
                      </>
                    )}

                    {/* ── SA requesting: browser permission dialog open ── */}
                    {isSAPage && micState === 'requesting' && (
                      <>
                        <div style={{ width: '14px', height: '14px', border: '2px solid #7c3aed', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.8s linear infinite', flexShrink: 0 }} />
                        <span style={{ fontSize: '13px', fontWeight: 500, color: '#4c1d95' }}>
                          Requesting microphone access…
                        </span>
                      </>
                    )}

                    {/* ── SA recording: mic is live, stream active, pulse ── */}
                    {isSAPage && micState === 'recording' && (
                      <>
                        <motion.div
                          animate={{ scale: [1, 1.3, 1] }}
                          transition={{ duration: 0.9, repeat: Infinity, ease: 'easeInOut' }}
                          style={{ width: '16px', height: '16px', borderRadius: '50%', background: '#ef4444', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                        >
                          <Mic size={10} style={{ color: '#fff' }} />
                        </motion.div>
                        <span style={{ fontSize: '13px', fontWeight: 500, color: '#be123c' }}>
                          Recording… release Space to save
                        </span>
                        <span style={{ fontSize: '12px', color: '#f43f5e', marginLeft: 'auto' }}>
                          TTS paused
                        </span>
                      </>
                    )}

                    {/* ── SA denied: amber fallback ── */}
                    {isSAPage && micState === 'denied' && (
                      <>
                        <MicOff size={15} style={{ color: '#d97706', flexShrink: 0 }} />
                        <span style={{ fontSize: '13px', fontWeight: 500, color: '#92400e' }}>
                          Microphone denied — type your answer manually
                        </span>
                        <span style={{ fontSize: '12px', color: '#b45309', marginLeft: 'auto' }}>
                          TTS still active
                        </span>
                      </>
                    )}
                  </div>
                )}
              </motion.div>
            </AnimatePresence>
          </div>

          {/* ── AI Sidebar ── */}
          <AnimatePresence>
            {blindMode && showAISidebar && (
              <motion.div
                initial={{ opacity: 0, x: 24, width: 0 }}
                animate={{ opacity: 1, x: 0, width: 328 }}
                exit={{ opacity: 0, x: 24, width: 0 }}
                transition={{ duration: 0.22 }}
                style={{ flexShrink: 0, marginLeft: '20px', overflow: 'hidden' }}
              >
                <AIVisionSidebar
                  isOpen={showAISidebar}
                  onClose={() => setShowAISidebar(false)}
                  currentQuestion={currentQuestion ?? null}
                  questionIndex={currentIndex}
                  blindMode={blindMode}
                />
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* ── Navigation footer ── */}
        <div style={{ padding: '16px 32px', borderTop: '1px solid #e8eaed', background: '#fff' }}>
          <div style={{ maxWidth: '960px', margin: '0 auto', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <button
              onClick={() => goToQuestion(currentIndex - 1)}
              disabled={currentIndex === 0}
              style={{ padding: '10px 20px', background: '#fff', color: currentIndex === 0 ? '#d1d5db' : '#374151', border: '1px solid #e8eaed', borderRadius: '8px', fontSize: '14px', fontWeight: 500, cursor: currentIndex === 0 ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', gap: '6px', opacity: currentIndex === 0 ? 0.5 : 1 }}
            >
              <ChevronLeft size={16} /> Previous
            </button>

            {isLastQuestion ? (
              <button
                onClick={() => doOpenSubmitConfirm()}
                style={{ padding: '10px 32px', background: '#0f0f23', color: '#fff', border: 'none', borderRadius: '8px', fontSize: '15px', fontWeight: 500, cursor: 'pointer' }}
              >
                Submit
              </button>
            ) : (
              <button
                onClick={() => goToQuestion(currentIndex + 1)}
                style={{ padding: '10px 20px', background: '#fff', color: '#374151', border: '1px solid #e8eaed', borderRadius: '8px', fontSize: '14px', fontWeight: 500, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}
              >
                Next <ChevronRight size={16} />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* ── Submit confirmation modal ── */}
      {showSubmitConfirm && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}
        >
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            style={{ background: '#fff', borderRadius: '16px', maxWidth: '480px', width: '100%', boxShadow: '0 20px 60px rgba(0,0,0,0.3)' }}
          >
            <div style={{ padding: '24px' }}>
              <h3 style={{ fontSize: '18px', fontWeight: 600, color: '#0f0f23', margin: '0 0 12px' }}>Confirm submission</h3>
              <p style={{ fontSize: '14px', color: '#6b7280', lineHeight: 1.6, margin: 0 }}>
                You are about to submit your quiz. You won't be able to change your answers after submission.
              </p>
              <div style={{ marginTop: '12px', fontSize: '13px', color: '#9ca3af' }}>
                Questions answered: {answers.size} / {questions.length}
              </div>
            </div>
            <div style={{ padding: '16px 24px', borderTop: '1px solid #e8eaed', display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
              <button
                onClick={() => setShowSubmitConfirm(false)}
                disabled={submitting}
                style={{ padding: '10px 20px', background: '#fff', color: '#6b7280', border: '1px solid #e8eaed', borderRadius: '8px', fontSize: '15px', fontWeight: 500, cursor: submitting ? 'not-allowed' : 'pointer' }}
              >
                Cancel
              </button>
              <button
                onClick={doFinalSubmit}
                disabled={submitting}
                style={{ padding: '10px 24px', background: '#0f0f23', color: '#fff', border: 'none', borderRadius: '8px', fontSize: '15px', fontWeight: 500, cursor: submitting ? 'not-allowed' : 'pointer', opacity: submitting ? 0.6 : 1 }}
              >
                {submitting ? 'Submitting...' : 'Confirm submit'}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </StudentLayout>
  );
}