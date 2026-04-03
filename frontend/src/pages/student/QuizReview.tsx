import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router';
import StudentLayout from '../../components/student/StudentLayout';
import { ChevronLeft, ChevronRight, Check, X, Volume2, ArrowLeft } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useTTS } from '../../utils/speech';

interface ReviewItem {
  questionId: string;
  order: number;
  prompt: string;
  type: 'MCQ_SINGLE' | 'SHORT_ANSWER';
  myAnswer?: {
    mcqChoice?: 'A' | 'B' | 'C' | 'D';
    saText?: string;
  };
  correctAnswer?: {
    mcqChoice?: 'A' | 'B' | 'C' | 'D';
  };
  options?: { key: 'A' | 'B' | 'C' | 'D'; text: string }[];
  isCorrect?: boolean;
  teacherFeedback?: string;
}

interface ReviewData {
  attemptId: string;
  score: number;
  totalScore: number;
  mcqCorrect: number;
  mcqTotal: number;
  items: ReviewItem[];
}

// Mock data
const mockReview: ReviewData = {
  attemptId: 'a1',
  score: 85,
  totalScore: 100,
  mcqCorrect: 4,
  mcqTotal: 5,
  items: [
    {
      questionId: 'q1',
      order: 1,
      type: 'MCQ_SINGLE',
      prompt: 'What is the time complexity of binary search?',
      options: [
        { key: 'A', text: 'O(n)' },
        { key: 'B', text: 'O(log n)' },
        { key: 'C', text: 'O(n log n)' },
        { key: 'D', text: 'O(n²)' },
      ],
      myAnswer: { mcqChoice: 'B' },
      correctAnswer: { mcqChoice: 'B' },
      isCorrect: true,
    },
    {
      questionId: 'q2',
      order: 2,
      type: 'MCQ_SINGLE',
      prompt: 'Which data structure uses LIFO principle?',
      options: [
        { key: 'A', text: 'Queue' },
        { key: 'B', text: 'Stack' },
        { key: 'C', text: 'Tree' },
        { key: 'D', text: 'Graph' },
      ],
      myAnswer: { mcqChoice: 'B' },
      correctAnswer: { mcqChoice: 'B' },
      isCorrect: true,
    },
    {
      questionId: 'q3',
      order: 3,
      type: 'MCQ_SINGLE',
      prompt: 'What is the best case time complexity of quicksort?',
      options: [
        { key: 'A', text: 'O(n)' },
        { key: 'B', text: 'O(n log n)' },
        { key: 'C', text: 'O(n²)' },
        { key: 'D', text: 'O(log n)' },
      ],
      myAnswer: { mcqChoice: 'A' },
      correctAnswer: { mcqChoice: 'B' },
      isCorrect: false,
    },
    {
      questionId: 'q4',
      order: 4,
      type: 'MCQ_SINGLE',
      prompt: 'Which sorting algorithm is stable?',
      options: [
        { key: 'A', text: 'Quick sort' },
        { key: 'B', text: 'Heap sort' },
        { key: 'C', text: 'Merge sort' },
        { key: 'D', text: 'Selection sort' },
      ],
      myAnswer: { mcqChoice: 'C' },
      correctAnswer: { mcqChoice: 'C' },
      isCorrect: true,
    },
    {
      questionId: 'q5',
      order: 5,
      type: 'MCQ_SINGLE',
      prompt: 'What is the space complexity of DFS traversal?',
      options: [
        { key: 'A', text: 'O(1)' },
        { key: 'B', text: 'O(log n)' },
        { key: 'C', text: 'O(n)' },
        { key: 'D', text: 'O(n²)' },
      ],
      myAnswer: { mcqChoice: 'C' },
      correctAnswer: { mcqChoice: 'C' },
      isCorrect: true,
    },
    {
      questionId: 'q6',
      order: 6,
      type: 'SHORT_ANSWER',
      prompt: 'Explain the difference between a stack and a queue, and provide one real-world example for each.',
      myAnswer: {
        saText: 'A stack follows LIFO (Last In First Out) principle where the last element added is the first one removed. Example: undo operation in text editors. A queue follows FIFO (First In First Out) principle where the first element added is the first one removed. Example: printer job queue.',
      },
      teacherFeedback: 'Excellent answer! You correctly identified the key principles and provided relevant real-world examples. Your explanation is clear and demonstrates good understanding of both data structures.',
    },
  ],
};

async function fetchReview(quizId: string): Promise<ReviewData> {
  return new Promise(resolve => setTimeout(() => resolve(mockReview), 300));
}

export default function QuizReview() {
  const { quizId } = useParams<{ quizId: string }>();
  const navigate = useNavigate();
  const [review, setReview] = useState<ReviewData | null>(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [blindMode] = useState(false);
  const { speak, stop: stopSpeaking } = useTTS();

  useEffect(() => {
    if (!quizId) return;
    fetchReview(quizId).then(setReview);
  }, [quizId]);

  const currentItem = review?.items[currentIndex];

  const readQuestion = useCallback(() => {
    if (!currentItem || !blindMode) return;

    let text = `Question ${currentItem.order} of 6. ${currentItem.prompt}. `;

    if (currentItem.type === 'MCQ_SINGLE') {
      text += `Your answer: ${currentItem.myAnswer?.mcqChoice}. `;
      const myOption = currentItem.options?.find(o => o.key === currentItem.myAnswer?.mcqChoice);
      if (myOption) text += `${myOption.text}. `;
      text += currentItem.isCorrect ? 'Correct. ' : 'Incorrect. ';
      text += `Correct answer: ${currentItem.correctAnswer?.mcqChoice}. `;
      const correctOption = currentItem.options?.find(o => o.key === currentItem.correctAnswer?.mcqChoice);
      if (correctOption) text += `${correctOption.text}. `;
    } else {
      text += `Your answer: ${currentItem.myAnswer?.saText}. `;
      if (currentItem.teacherFeedback) {
        text += `Teacher feedback: ${currentItem.teacherFeedback}`;
      }
    }

    speak(text);
  }, [currentItem, blindMode, speak]);

  const goToQuestion = (index: number) => {
    stopSpeaking();
    setCurrentIndex(index);
  };

  if (!review) {
    return (
      <StudentLayout>
        <div style={{ padding: '32px', display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '400px' }}>
          <div style={{ fontSize: '14px', color: '#9ca3af' }}>Loading review...</div>
        </div>
      </StudentLayout>
    );
  }

  return (
    <StudentLayout>
      <div style={{ minHeight: 'calc(100vh - 48px)', display: 'flex', flexDirection: 'column' }}>
        {/* Header */}
        <div style={{ padding: '20px 32px', borderBottom: '1px solid #e8eaed', background: '#fafafa' }}>
          <div style={{ maxWidth: '900px', margin: '0 auto' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
              <button
                onClick={() => navigate('/student/quiz')}
                style={{
                  width: '32px',
                  height: '32px',
                  borderRadius: '8px',
                  border: '1px solid #e8eaed',
                  background: '#fff',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#6b7280',
                }}
              >
                <ArrowLeft size={16} />
              </button>
              <div style={{ flex: 1 }}>
                <h1 style={{ fontSize: '20px', fontWeight: 600, color: '#0f0f23', margin: '0 0 4px' }}>
                  Quiz Review
                </h1>
                <p style={{ fontSize: '13px', color: '#9ca3af', margin: 0 }}>
                  Data Structures Quiz 1 • Score: {review.score}/{review.totalScore}
                </p>
              </div>
              {blindMode && (
                <button
                  onClick={readQuestion}
                  style={{
                    padding: '8px 16px',
                    background: '#f0fdf4',
                    color: '#065f46',
                    border: '1px solid #d1fae5',
                    borderRadius: '8px',
                    fontSize: '13px',
                    fontWeight: 500,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                  }}
                >
                  <Volume2 size={14} /> Read question
                </button>
              )}
            </div>

            {/* Summary */}
            <div style={{ display: 'flex', gap: '16px', marginBottom: '16px' }}>
              <div style={{ padding: '12px 16px', background: '#f0fdf4', borderRadius: '10px', border: '1px solid #d1fae5' }}>
                <div style={{ fontSize: '11px', color: '#065f46', marginBottom: '2px' }}>MCQ Correct</div>
                <div style={{ fontSize: '18px', fontWeight: 700, color: '#10b981' }}>
                  {review.mcqCorrect}/{review.mcqTotal}
                </div>
              </div>
              <div style={{ padding: '12px 16px', background: '#eef2ff', borderRadius: '10px', border: '1px solid #c7d2fe' }}>
                <div style={{ fontSize: '11px', color: '#3b5bdb', marginBottom: '2px' }}>Total Score</div>
                <div style={{ fontSize: '18px', fontWeight: 700, color: '#3b5bdb' }}>
                  {review.score}/{review.totalScore}
                </div>
              </div>
            </div>

            {/* Question navigation */}
            <div style={{ display: 'flex', gap: '6px' }}>
              {review.items.map((item, idx) => (
                <button
                  key={item.questionId}
                  onClick={() => goToQuestion(idx)}
                  style={{
                    width: '36px',
                    height: '36px',
                    borderRadius: '8px',
                    border: `1.5px solid ${idx === currentIndex ? '#3b5bdb' : item.isCorrect ? '#10b981' : item.type === 'SHORT_ANSWER' ? '#9ca3af' : '#ef4444'}`,
                    background: idx === currentIndex ? '#eef2ff' : item.isCorrect ? '#f0fdf4' : item.type === 'SHORT_ANSWER' ? '#f9fafb' : '#fef2f2',
                    color: idx === currentIndex ? '#3b5bdb' : item.isCorrect ? '#10b981' : item.type === 'SHORT_ANSWER' ? '#6b7280' : '#ef4444',
                    fontSize: '14px',
                    fontWeight: 600,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    position: 'relative',
                    transition: 'all 0.15s',
                  }}
                >
                  {idx + 1}
                  {item.type === 'MCQ_SINGLE' && (
                    item.isCorrect ? (
                      <Check size={10} style={{ position: 'absolute', top: '2px', right: '2px' }} />
                    ) : (
                      <X size={10} style={{ position: 'absolute', top: '2px', right: '2px' }} />
                    )
                  )}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Question content */}
        <div style={{ flex: 1, padding: '32px', background: '#fff' }}>
          <div style={{ maxWidth: '900px', margin: '0 auto' }}>
            <AnimatePresence mode="wait">
              <motion.div
                key={currentItem?.questionId}
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                transition={{ duration: 0.2 }}
              >
                <div style={{ fontSize: '17px', fontWeight: 500, color: '#0f0f23', marginBottom: '24px', lineHeight: 1.6 }}>
                  {currentItem?.prompt}
                </div>

                {currentItem?.type === 'MCQ_SINGLE' && currentItem.options && (
                  <div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '24px' }}>
                      {currentItem.options.map(option => {
                        const isMyAnswer = currentItem.myAnswer?.mcqChoice === option.key;
                        const isCorrect = currentItem.correctAnswer?.mcqChoice === option.key;
                        return (
                          <div
                            key={option.key}
                            style={{
                              padding: '16px 20px',
                              borderRadius: '12px',
                              border: `2px solid ${isMyAnswer && isCorrect ? '#10b981' : isMyAnswer ? '#ef4444' : isCorrect ? '#10b981' : '#e8eaed'}`,
                              background: isMyAnswer && isCorrect ? '#f0fdf4' : isMyAnswer ? '#fef2f2' : isCorrect ? '#f0fdf4' : '#fff',
                            }}
                          >
                            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                              <div style={{
                                width: '32px',
                                height: '32px',
                                borderRadius: '8px',
                                background: isMyAnswer && isCorrect ? '#10b981' : isMyAnswer ? '#ef4444' : isCorrect ? '#10b981' : '#f3f4f6',
                                color: isMyAnswer || isCorrect ? '#fff' : '#6b7280',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                fontSize: '15px',
                                fontWeight: 600,
                                flexShrink: 0,
                              }}>
                                {option.key}
                              </div>
                              <span style={{ fontSize: '15px', color: '#374151', flex: 1 }}>
                                {option.text}
                              </span>
                              {isMyAnswer && (
                                <span style={{ fontSize: '11px', padding: '3px 10px', borderRadius: '20px', background: isCorrect ? '#d1fae5' : '#fecaca', color: isCorrect ? '#065f46' : '#dc2626', fontWeight: 600 }}>
                                  Your answer
                                </span>
                              )}
                              {isCorrect && !isMyAnswer && (
                                <span style={{ fontSize: '11px', padding: '3px 10px', borderRadius: '20px', background: '#d1fae5', color: '#065f46', fontWeight: 600 }}>
                                  Correct answer
                                </span>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    <div style={{ padding: '16px', background: currentItem.isCorrect ? '#f0fdf4' : '#fef2f2', borderRadius: '10px', border: `1px solid ${currentItem.isCorrect ? '#d1fae5' : '#fecaca'}` }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                        {currentItem.isCorrect ? <Check size={16} style={{ color: '#10b981' }} /> : <X size={16} style={{ color: '#ef4444' }} />}
                        <span style={{ fontSize: '14px', fontWeight: 600, color: currentItem.isCorrect ? '#065f46' : '#dc2626' }}>
                          {currentItem.isCorrect ? 'Correct' : 'Incorrect'}
                        </span>
                      </div>
                      <p style={{ fontSize: '13px', color: currentItem.isCorrect ? '#065f46' : '#dc2626', margin: 0 }}>
                        {currentItem.isCorrect 
                          ? 'You answered this question correctly!'
                          : `The correct answer is ${currentItem.correctAnswer?.mcqChoice}.`
                        }
                      </p>
                    </div>
                  </div>
                )}

                {currentItem?.type === 'SHORT_ANSWER' && (
                  <div>
                    <div style={{ marginBottom: '20px' }}>
                      <div style={{ fontSize: '14px', fontWeight: 600, color: '#0f0f23', marginBottom: '8px' }}>
                        Your answer:
                      </div>
                      <div style={{ padding: '16px', background: '#f9fafb', borderRadius: '10px', border: '1px solid #e8eaed', fontSize: '14px', color: '#374151', lineHeight: 1.6 }}>
                        {currentItem.myAnswer?.saText || 'No answer provided'}
                      </div>
                    </div>

                    {currentItem.teacherFeedback && (
                      <div style={{ padding: '20px', background: '#eef2ff', borderRadius: '12px', border: '1px solid #c7d2fe' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                          <div style={{ fontSize: '14px', fontWeight: 600, color: '#3b5bdb' }}>
                            Teacher feedback:
                          </div>
                        </div>
                        <div style={{ fontSize: '14px', color: '#374151', lineHeight: 1.6 }}>
                          {currentItem.teacherFeedback}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </motion.div>
            </AnimatePresence>
          </div>
        </div>

        {/* Navigation footer */}
        <div style={{ padding: '16px 32px', borderTop: '1px solid #e8eaed', background: '#fafafa' }}>
          <div style={{ maxWidth: '900px', margin: '0 auto', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <button
              onClick={() => goToQuestion(currentIndex - 1)}
              disabled={currentIndex === 0}
              style={{
                padding: '10px 20px',
                background: '#fff',
                color: currentIndex === 0 ? '#d1d5db' : '#374151',
                border: '1px solid #e8eaed',
                borderRadius: '8px',
                fontSize: '14px',
                fontWeight: 500,
                cursor: currentIndex === 0 ? 'not-allowed' : 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                opacity: currentIndex === 0 ? 0.5 : 1,
              }}
            >
              <ChevronLeft size={16} /> Previous
            </button>

            <div style={{ fontSize: '13px', color: '#9ca3af' }}>
              Question {currentIndex + 1} of 6
            </div>

            <button
              onClick={() => currentIndex < review.items.length - 1 ? goToQuestion(currentIndex + 1) : navigate('/student/quiz')}
              style={{
                padding: '10px 20px',
                background: currentIndex === review.items.length - 1 ? '#0f0f23' : '#fff',
                color: currentIndex === review.items.length - 1 ? '#fff' : '#374151',
                border: currentIndex === review.items.length - 1 ? 'none' : '1px solid #e8eaed',
                borderRadius: '8px',
                fontSize: '14px',
                fontWeight: 500,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
              }}
            >
              {currentIndex === review.items.length - 1 ? 'Back to list' : 'Next'} {currentIndex < review.items.length - 1 && <ChevronRight size={16} />}
            </button>
          </div>
        </div>
      </div>
    </StudentLayout>
  );
}