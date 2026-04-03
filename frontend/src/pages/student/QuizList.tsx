import { useState, useEffect } from 'react';
import StudentLayout from '../../components/student/StudentLayout';
import { FileText, Clock, AlertCircle, CheckCircle2 } from 'lucide-react';
import { useNavigate } from 'react-router';
import { QuizPreviewModal } from '../../components/student/QuizPreviewModal';
import { QuizResultModal } from '../../components/student/QuizResultModal';

// Mock data types
export interface Quiz {
  quizId: string;
  title: string;
  courseId: string;
  courseName: string;
  dueAt: string;
  questionCount: number;
  mcqCount: number;
  saCount: number;
  status?: 'Not started' | 'In progress';
  submittedAt?: string;
  score?: number;
  totalScore?: number;
  mcqCorrect?: number;
}

// Mock API functions
const mockTodoQuizzes: Quiz[] = [
  {
    quizId: 'q1',
    title: 'Data Structures Quiz 1',
    courseId: 'c1',
    courseName: 'Data Structures',
    dueAt: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(), // 2 hours from now
    questionCount: 6,
    mcqCount: 5,
    saCount: 1,
    status: 'In progress',
  },
  {
    quizId: 'q2',
    title: 'Algorithm Design Quiz 2',
    courseId: 'c2',
    courseName: 'Algorithm Design',
    dueAt: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString(), // 3 days
    questionCount: 6,
    mcqCount: 5,
    saCount: 1,
    status: 'Not started',
  },
  {
    quizId: 'q3',
    title: 'Machine Learning Quiz 3',
    courseId: 'c3',
    courseName: 'Machine Learning Fundamentals',
    dueAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(), // 7 days
    questionCount: 6,
    mcqCount: 5,
    saCount: 1,
    status: 'In progress',
  },
];

const mockCompletedQuizzes: Quiz[] = [
  {
    quizId: 'q4',
    title: 'Database Systems Quiz 1',
    courseId: 'c4',
    courseName: 'Database Systems',
    dueAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
    questionCount: 6,
    mcqCount: 5,
    saCount: 1,
    submittedAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000 - 60 * 60 * 1000).toISOString(),
    score: 85,
    totalScore: 100,
    mcqCorrect: 4,
  },
  {
    quizId: 'q5',
    title: 'Software Engineering Quiz 1',
    courseId: 'c5',
    courseName: 'Software Engineering',
    dueAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(),
    questionCount: 6,
    mcqCount: 5,
    saCount: 1,
    submittedAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000 - 3 * 60 * 60 * 1000).toISOString(),
    score: 92,
    totalScore: 100,
    mcqCorrect: 5,
  },
];

async function fetchTodoQuizzes(): Promise<Quiz[]> {
  // Mock API call
  return new Promise(resolve => setTimeout(() => resolve(mockTodoQuizzes), 500));
}

async function fetchCompletedQuizzes(): Promise<Quiz[]> {
  // Mock API call
  return new Promise(resolve => setTimeout(() => resolve(mockCompletedQuizzes), 500));
}

function formatDueDate(isoDate: string): string {
  const date = new Date(isoDate);
  const now = new Date();
  const diff = date.getTime() - now.getTime();
  const hours = Math.floor(diff / (1000 * 60 * 60));
  const days = Math.floor(hours / 24);

  if (hours < 24) return `Due in ${hours}h`;
  if (days === 1) return 'Due tomorrow';
  return `Due in ${days} days`;
}

function formatSubmitDate(isoDate: string): string {
  const date = new Date(isoDate);
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export default function QuizList() {
  const navigate = useNavigate();
  const [todoQuizzes, setTodoQuizzes] = useState<Quiz[]>([]);
  const [completedQuizzes, setCompletedQuizzes] = useState<Quiz[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [selectedQuiz, setSelectedQuiz] = useState<Quiz | null>(null);
  const [showPreviewModal, setShowPreviewModal] = useState(false);
  const [showResultModal, setShowResultModal] = useState(false);

  useEffect(() => {
    loadQuizzes();
  }, []);

  const loadQuizzes = async () => {
    setLoading(true);
    setError(false);
    try {
      const [todo, completed] = await Promise.all([fetchTodoQuizzes(), fetchCompletedQuizzes()]);
      setTodoQuizzes(todo);
      setCompletedQuizzes(completed);
    } catch (err) {
      setError(true);
    } finally {
      setLoading(false);
    }
  };

  const handlePreviewClick = (quiz: Quiz) => {
    setSelectedQuiz(quiz);
    setShowPreviewModal(true);
  };

  const handleResultClick = (quiz: Quiz) => {
    setSelectedQuiz(quiz);
    setShowResultModal(true);
  };

  const handleStartQuiz = (quizId: string, blindMode: boolean) => {
    navigate(`/student/quiz/${quizId}/take`, { state: { blindMode } });
  };

  const handleReviewQuiz = (quizId: string) => {
    navigate(`/student/quiz/${quizId}/review`);
  };

  if (loading) {
    return (
      <StudentLayout>
        <div style={{ padding: '32px', display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '400px' }}>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '14px', color: '#9ca3af' }}>Loading quizzes...</div>
          </div>
        </div>
      </StudentLayout>
    );
  }

  if (error) {
    return (
      <StudentLayout>
        <div style={{ padding: '32px' }}>
          <div style={{ maxWidth: '800px', margin: '0 auto', textAlign: 'center', padding: '48px 24px' }}>
            <AlertCircle size={48} style={{ color: '#ef4444', margin: '0 auto 16px' }} />
            <div style={{ fontSize: '18px', fontWeight: 600, color: '#0f0f23', marginBottom: '8px' }}>Failed to load quizzes. Please try again.</div>
            <button
              onClick={loadQuizzes}
              style={{ marginTop: '16px', padding: '10px 24px', background: '#0f0f23', color: '#fff', border: 'none', borderRadius: '8px', fontSize: '15px', fontWeight: 500, cursor: 'pointer' }}
            >
              Retry
            </button>
          </div>
        </div>
      </StudentLayout>
    );
  }

  return (
    <StudentLayout>
      <div style={{ padding: '28px 32px', maxWidth: '1200px', margin: '0 auto' }}>
        {/* Header */}
        <div style={{ marginBottom: '24px' }}>
          <h1 style={{ fontSize: '24px', fontWeight: 700, color: '#0f0f23', margin: '0 0 6px' }}>Quiz</h1>
          <p style={{ fontSize: '14px', color: '#9ca3af', margin: 0 }}>Only quizzes from your enrolled courses are shown.</p>
        </div>

        {/* To Do Section */}
        <div style={{ marginBottom: '32px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
            <h2 style={{ fontSize: '16px', fontWeight: 600, color: '#0f0f23', margin: 0 }}>
              To Do ({todoQuizzes.length})
            </h2>
            <span style={{ fontSize: '12px', color: '#9ca3af' }}>Sorted by due date: soonest first</span>
          </div>

          {todoQuizzes.length === 0 ? (
            <div style={{ border: '1px solid #e8eaed', borderRadius: '12px', padding: '48px 24px', textAlign: 'center', background: '#fafafa' }}>
              <FileText size={40} style={{ color: '#d1d5db', margin: '0 auto 12px' }} />
              <p style={{ fontSize: '14px', color: '#9ca3af', margin: 0 }}>No quizzes to do right now.</p>
            </div>
          ) : (
            <div style={{ display: 'grid', gap: '12px' }}>
              {todoQuizzes.map(quiz => (
                <div
                  key={quiz.quizId}
                  onClick={() => handlePreviewClick(quiz)}
                  style={{ border: '1px solid #e8eaed', borderRadius: '12px', padding: '18px 20px', background: '#fff', cursor: 'pointer', transition: 'all 0.15s' }}
                  onMouseEnter={e => { (e.currentTarget as HTMLElement).style.boxShadow = '0 2px 8px rgba(0,0,0,0.08)'; (e.currentTarget as HTMLElement).style.borderColor = '#d1d5db'; }}
                  onMouseLeave={e => { (e.currentTarget as HTMLElement).style.boxShadow = 'none'; (e.currentTarget as HTMLElement).style.borderColor = '#e8eaed'; }}
                >
                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '16px' }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                        <h3 style={{ fontSize: '15px', fontWeight: 600, color: '#0f0f23', margin: 0 }}>{quiz.title}</h3>
                        {quiz.status && (
                          <span style={{
                            fontSize: '11px',
                            padding: '2px 8px',
                            borderRadius: '20px',
                            fontWeight: 500,
                            background: quiz.status === 'In progress' ? '#dbeafe' : '#f3f4f6',
                            color: quiz.status === 'In progress' ? '#3b82f6' : '#6b7280',
                          }}>
                            {quiz.status}
                          </span>
                        )}
                      </div>
                      <div style={{ fontSize: '13px', color: '#6b7280', marginBottom: '8px' }}>{quiz.courseName}</div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '13px', color: '#9ca3af' }}>
                          <Clock size={13} />
                          <span>{formatDueDate(quiz.dueAt)}</span>
                        </div>
                        <div style={{ fontSize: '13px', color: '#9ca3af' }}>
                          {quiz.questionCount} questions ({quiz.mcqCount} MCQ + {quiz.saCount} Short answer)
                        </div>
                      </div>
                    </div>
                    <button
                      onClick={(e) => { e.stopPropagation(); handlePreviewClick(quiz); }}
                      style={{ padding: '8px 16px', background: '#f9fafb', color: '#374151', border: '1px solid #e8eaed', borderRadius: '8px', fontSize: '13px', fontWeight: 500, cursor: 'pointer', whiteSpace: 'nowrap', transition: 'all 0.15s' }}
                      onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = '#f3f4f6'; }}
                      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = '#f9fafb'; }}
                    >
                      Preview
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Completed Section */}
        <div>
          <div style={{ marginBottom: '12px' }}>
            <h2 style={{ fontSize: '16px', fontWeight: 600, color: '#0f0f23', margin: 0 }}>
              Completed ({completedQuizzes.length})
            </h2>
          </div>

          {completedQuizzes.length === 0 ? (
            <div style={{ border: '1px solid #e8eaed', borderRadius: '12px', padding: '48px 24px', textAlign: 'center', background: '#fafafa' }}>
              <CheckCircle2 size={40} style={{ color: '#d1d5db', margin: '0 auto 12px' }} />
              <p style={{ fontSize: '14px', color: '#9ca3af', margin: 0 }}>You haven't completed any quizzes yet.</p>
            </div>
          ) : (
            <div style={{ display: 'grid', gap: '12px' }}>
              {completedQuizzes.map(quiz => (
                <div
                  key={quiz.quizId}
                  onClick={() => handleResultClick(quiz)}
                  style={{ border: '1px solid #e8eaed', borderRadius: '12px', padding: '18px 20px', background: '#fff', cursor: 'pointer', transition: 'all 0.15s' }}
                  onMouseEnter={e => { (e.currentTarget as HTMLElement).style.boxShadow = '0 2px 8px rgba(0,0,0,0.08)'; (e.currentTarget as HTMLElement).style.borderColor = '#d1d5db'; }}
                  onMouseLeave={e => { (e.currentTarget as HTMLElement).style.boxShadow = 'none'; (e.currentTarget as HTMLElement).style.borderColor = '#e8eaed'; }}
                >
                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '16px' }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                        <h3 style={{ fontSize: '15px', fontWeight: 600, color: '#0f0f23', margin: 0 }}>{quiz.title}</h3>
                        <CheckCircle2 size={16} style={{ color: '#10b981' }} />
                      </div>
                      <div style={{ fontSize: '13px', color: '#6b7280', marginBottom: '8px' }}>{quiz.courseName}</div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <div style={{ fontSize: '13px', color: '#9ca3af' }}>
                          Submitted {formatSubmitDate(quiz.submittedAt!)}
                        </div>
                        <div style={{ fontSize: '13px', color: '#10b981', fontWeight: 500 }}>
                          Score: {quiz.score}/{quiz.totalScore}
                        </div>
                        <div style={{ fontSize: '13px', color: '#6b7280' }}>
                          Correct: {quiz.mcqCorrect}/5 (MCQ)
                        </div>
                      </div>
                    </div>
                    <button
                      onClick={(e) => { e.stopPropagation(); handleResultClick(quiz); }}
                      style={{ padding: '8px 16px', background: '#f9fafb', color: '#374151', border: '1px solid #e8eaed', borderRadius: '8px', fontSize: '13px', fontWeight: 500, cursor: 'pointer', whiteSpace: 'nowrap', transition: 'all 0.15s' }}
                      onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = '#f3f4f6'; }}
                      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = '#f9fafb'; }}
                    >
                      Preview result
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Modals */}
      {showPreviewModal && selectedQuiz && (
        <QuizPreviewModal
          quiz={selectedQuiz}
          onClose={() => setShowPreviewModal(false)}
          onStart={(blindMode) => handleStartQuiz(selectedQuiz.quizId, blindMode)}
        />
      )}

      {showResultModal && selectedQuiz && (
        <QuizResultModal
          quiz={selectedQuiz}
          onClose={() => setShowResultModal(false)}
          onReview={() => handleReviewQuiz(selectedQuiz.quizId)}
        />
      )}
    </StudentLayout>
  );
}