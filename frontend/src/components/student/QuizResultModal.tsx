import { useRef } from 'react';
import { X, CheckCircle2 } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { Quiz } from '../../pages/student/QuizList';

interface QuizResultModalProps {
  quiz: Quiz;
  onClose: () => void;
  onReview: () => void;
}

export function QuizResultModal({ quiz, onClose, onReview }: QuizResultModalProps) {
  const modalRef = useRef<HTMLDivElement>(null);

  function formatSubmitDate(isoDate: string): string {
    const date = new Date(isoDate);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  }

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}
        onClick={onClose}
      >
        <motion.div
          ref={modalRef}
          initial={{ scale: 0.95, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.95, opacity: 0 }}
          transition={{ duration: 0.15 }}
          onClick={e => e.stopPropagation()}
          style={{ background: '#fff', borderRadius: '16px', maxWidth: '540px', width: '100%', boxShadow: '0 20px 60px rgba(0,0,0,0.2)', overflow: 'hidden' }}
        >
          {/* Header */}
          <div style={{ padding: '20px 24px', borderBottom: '1px solid #e8eaed', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <h2 style={{ fontSize: '18px', fontWeight: 600, color: '#0f0f23', margin: 0 }}>Quiz result</h2>
            <button
              onClick={onClose}
              style={{ width: '32px', height: '32px', borderRadius: '8px', border: '1px solid #e8eaed', background: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#6b7280', transition: 'all 0.15s' }}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = '#f3f4f6'; }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = '#fff'; }}
            >
              <X size={18} />
            </button>
          </div>

          {/* Content */}
          <div style={{ padding: '24px' }}>
            <div style={{ marginBottom: '20px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
                <div style={{ fontSize: '17px', fontWeight: 600, color: '#0f0f23' }}>{quiz.title}</div>
                <CheckCircle2 size={18} style={{ color: '#10b981' }} />
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <span style={{ fontSize: '14px', color: '#9ca3af', minWidth: '100px' }}>Course:</span>
                  <span style={{ fontSize: '14px', color: '#374151', fontWeight: 500 }}>{quiz.courseName}</span>
                </div>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <span style={{ fontSize: '14px', color: '#9ca3af', minWidth: '100px' }}>Submitted:</span>
                  <span style={{ fontSize: '14px', color: '#374151', fontWeight: 500 }}>
                    {quiz.submittedAt && formatSubmitDate(quiz.submittedAt)}
                  </span>
                </div>
              </div>
            </div>

            {/* Results */}
            <div style={{ padding: '20px', background: '#f0fdf4', borderRadius: '12px', border: '1px solid #d1fae5', marginBottom: '16px' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: '14px', color: '#065f46', fontWeight: 500 }}>Correct:</span>
                  <span style={{ fontSize: '16px', color: '#10b981', fontWeight: 600 }}>
                    {quiz.mcqCorrect} / 5 (MCQ)
                  </span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: '14px', color: '#065f46', fontWeight: 500 }}>Score:</span>
                  <span style={{ fontSize: '20px', color: '#10b981', fontWeight: 700 }}>
                    {quiz.score} / {quiz.totalScore}
                  </span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: '14px', color: '#065f46', fontWeight: 500 }}>Short answer:</span>
                  <span style={{ fontSize: '13px', padding: '3px 10px', borderRadius: '20px', background: '#d1fae5', color: '#065f46', fontWeight: 500 }}>
                    Graded
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Footer */}
          <div style={{ padding: '16px 24px', borderTop: '1px solid #e8eaed', display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
            <button
              onClick={onClose}
              style={{ padding: '10px 20px', background: '#fff', color: '#6b7280', border: '1px solid #e8eaed', borderRadius: '8px', fontSize: '15px', fontWeight: 500, cursor: 'pointer', transition: 'all 0.15s' }}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = '#f3f4f6'; }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = '#fff'; }}
            >
              Close
            </button>
            <button
              onClick={onReview}
              style={{ padding: '10px 24px', background: '#0f0f23', color: '#fff', border: 'none', borderRadius: '8px', fontSize: '15px', fontWeight: 500, cursor: 'pointer', transition: 'all 0.15s' }}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = '#1a1a2e'; }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = '#0f0f23'; }}
            >
              Review answers
            </button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}