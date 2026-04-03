import { useState, useRef } from 'react';
import { Link, useParams } from 'react-router';
import { ChevronLeft, Download, FileText, Search, Filter, Mic, Bot, Play, Pause, CheckCircle, XCircle } from 'lucide-react';
import { CustomSelect } from '../../components/teacher/CustomSelect';

interface McqAnswer {
  question: number;
  selected: string;
  correct: string;
  isCorrect: boolean;
}

interface Submission {
  id: string;
  studentName: string;
  studentId: string;
  submittedAt: string;
  content: string;
  attachments: Array<{ name: string; size: string }>;
  score?: number;
  feedback?: string;
  isGraded: boolean;
  isAccessibility?: boolean;
  voiceAttachments?: Array<{ name: string; duration: string; size: string }>;
  // Quiz-specific fields
  mcqAnswers?: McqAnswer[];
  saAnswer?: string;
  aiTranscription?: string;
  aiScore?: number;
  aiFeedback?: string;
}

interface AssessmentData {
  id: string;
  title: string;
  course: string;
  description: string;
  dueDate: string;
  totalScore: number;
  submissions: Submission[];
}

const mockAssessments: Record<string, AssessmentData> = {
  '1': {
    id: '1',
    title: 'Chapter 1 Practice Problems',
    course: 'Advanced Math A',
    description: 'Complete exercises 1-10, requires detailed solution steps',
    dueDate: '2026-02-20',
    totalScore: 100,
    submissions: [
      {
        id: '1',
        studentName: 'Zhang San',
        studentId: '2024001',
        submittedAt: '2026-02-18 14:23',
        content: 'Completed all problems, detailed steps provided as per requirements.',
        attachments: [{ name: 'Chapter 1 Practice Problems.pdf', size: '1000.0 KB' }],
        score: 95,
        feedback: 'Detailed solution steps, correct answer.',
        isGraded: true,
      },
      {
        id: '2',
        studentName: 'Li Si',
        studentId: '2024002',
        submittedAt: '2026-02-19 10:15',
        content: 'Completed chapter 1-8, currently working on chapters 9-10.',
        attachments: [{ name: 'Assignment1.docx', size: '500.0 KB' }],
        score: undefined,
        feedback: undefined,
        isGraded: false,
      },
      {
        id: '3',
        studentName: 'Wang Wu',
        studentId: '2024003',
        submittedAt: '2026-02-18 16:45',
        content: 'All problems completed as required.',
        attachments: [{ name: 'Math_HW1.pdf', size: '850.5 KB' }],
        score: 88,
        feedback: 'Good work overall, minor calculation error in problem 7.',
        isGraded: true,
      },
      {
        id: '4',
        studentName: 'Zhao Liu',
        studentId: '2024004',
        submittedAt: '2026-02-19 09:30',
        content: 'Submission includes all required work with step-by-step explanations.',
        attachments: [{ name: 'Homework_Chapter1.pdf', size: '1200.0 KB' }],
        score: undefined,
        feedback: undefined,
        isGraded: false,
      },
      {
        id: '5',
        studentName: 'Chen Qi',
        studentId: '2024005',
        submittedAt: '2026-02-17 22:10',
        content: 'All exercises completed with detailed explanations.',
        attachments: [{ name: 'Math_Assignment.pdf', size: '920.0 KB' }],
        score: undefined,
        feedback: undefined,
        isGraded: false,
      },
      {
        id: '6',
        studentName: 'Liu Ba',
        studentId: '2024006',
        submittedAt: '2026-02-20 11:20',
        content: 'Problems 1-10 completed as instructed.',
        attachments: [{ name: 'HW1_Solutions.pdf', size: '780.0 KB' }],
        score: 92,
        feedback: 'Excellent work, all solutions are correct.',
        isGraded: true,
      },
    ],
  },
  '2': {
    id: '2',
    title: 'Conceptual Quiz',
    course: 'Advanced Concepts and Theory',
    description: 'Q1-Q5: Multiple choice (10 pts each, 50 pts total). Q6: Short answer (50 pts).',
    dueDate: '2026-02-16',
    totalScore: 100,
    submissions: [
      {
        id: '1',
        studentName: 'Zhang San',
        studentId: '2024001',
        submittedAt: '2026-02-15 09:12',
        content: '',
        attachments: [],
        score: undefined,
        feedback: undefined,
        isGraded: false,
        mcqAnswers: [
          { question: 1, selected: 'A', correct: 'A', isCorrect: true },
          { question: 2, selected: 'C', correct: 'C', isCorrect: true },
          { question: 3, selected: 'B', correct: 'B', isCorrect: true },
          { question: 4, selected: 'D', correct: 'D', isCorrect: true },
          { question: 5, selected: 'A', correct: 'A', isCorrect: true },
        ],
        saAnswer: 'The fundamental theorem establishes the relationship between differentiation and integration. Specifically, if F is an antiderivative of f on [a,b], then the definite integral of f from a to b equals F(b) - F(a). This bridges two seemingly different operations into a unified framework, enabling efficient computation of areas under curves.',
        aiScore: 95,
        aiFeedback: 'MCQ 50/50. SA: Thorough explanation covering the core relationship, correct formula, and practical significance. Minor: could mention continuity requirement.',
      },
      {
        id: '2',
        studentName: 'Li Si',
        studentId: '2024002',
        submittedAt: '2026-02-15 09:35',
        content: '',
        attachments: [],
        score: undefined,
        feedback: undefined,
        isGraded: false,
        mcqAnswers: [
          { question: 1, selected: 'A', correct: 'A', isCorrect: true },
          { question: 2, selected: 'C', correct: 'C', isCorrect: true },
          { question: 3, selected: 'D', correct: 'B', isCorrect: false },
          { question: 4, selected: 'D', correct: 'D', isCorrect: true },
          { question: 5, selected: 'A', correct: 'A', isCorrect: true },
        ],
        saAnswer: 'The theorem says integration and differentiation are inverse operations. You can calculate the integral using the antiderivative evaluated at the endpoints.',
        aiScore: 78,
        aiFeedback: 'MCQ 40/50 (Q3 incorrect). SA: Correct basic idea but lacks depth. Missing formal statement and practical implications.',
      },
      {
        id: '3',
        studentName: 'Wang Wu',
        studentId: '2024003',
        submittedAt: '2026-02-15 10:05',
        content: '',
        attachments: [],
        score: undefined,
        feedback: undefined,
        isGraded: false,
        mcqAnswers: [
          { question: 1, selected: 'A', correct: 'A', isCorrect: true },
          { question: 2, selected: 'C', correct: 'C', isCorrect: true },
          { question: 3, selected: 'B', correct: 'B', isCorrect: true },
          { question: 4, selected: 'D', correct: 'D', isCorrect: true },
          { question: 5, selected: 'A', correct: 'A', isCorrect: true },
        ],
        saAnswer: 'Let f be continuous on [a,b]. Part 1: If F(x) = integral from a to x of f(t)dt, then F\'(x) = f(x). Part 2: If G is any antiderivative of f, then integral from a to b of f(x)dx = G(b) - G(a). Example: integral of x^2 from 0 to 1 = [x^3/3] from 0 to 1 = 1/3.',
        aiScore: 92,
        aiFeedback: 'MCQ 50/50. SA: Excellent. Both parts stated correctly with continuity condition. Good concrete example provided.',
      },
      {
        id: '4',
        studentName: 'Zhao Liu',
        studentId: '2024004',
        submittedAt: '2026-02-15 09:48',
        content: '',
        attachments: [],
        score: undefined,
        feedback: undefined,
        isGraded: false,
        mcqAnswers: [
          { question: 1, selected: 'A', correct: 'A', isCorrect: true },
          { question: 2, selected: 'B', correct: 'C', isCorrect: false },
          { question: 3, selected: 'D', correct: 'B', isCorrect: false },
          { question: 4, selected: 'D', correct: 'D', isCorrect: true },
          { question: 5, selected: 'A', correct: 'A', isCorrect: true },
        ],
        saAnswer: 'The fundamental theorem connects derivatives and integrals. It allows us to evaluate definite integrals by finding antiderivatives.',
        aiScore: 62,
        aiFeedback: 'MCQ 30/50 (Q2, Q3 incorrect). SA: Too brief. Correct direction but missing formal statement, conditions, and any examples.',
      },
      {
        id: '5',
        studentName: 'Chen Qi',
        studentId: '2024005',
        submittedAt: '2026-02-15 10:20',
        content: '',
        attachments: [],
        score: undefined,
        feedback: undefined,
        isGraded: false,
        mcqAnswers: [
          { question: 1, selected: 'A', correct: 'A', isCorrect: true },
          { question: 2, selected: 'C', correct: 'C', isCorrect: true },
          { question: 3, selected: 'B', correct: 'B', isCorrect: true },
          { question: 4, selected: 'D', correct: 'D', isCorrect: true },
          { question: 5, selected: 'A', correct: 'A', isCorrect: true },
        ],
        saAnswer: 'The Fundamental Theorem of Calculus has two parts. Part I states that if f is continuous on [a,b], the function F(x) = integral(a to x) f(t)dt is differentiable and F\'(x) = f(x). Part II states integral(a to b) f(x)dx = F(b) - F(a) where F is any antiderivative. Real-world application: computing total displacement from a velocity function v(t) over time interval [t1, t2].',
        aiScore: 98,
        aiFeedback: 'MCQ 50/50. SA: Outstanding. Both parts correctly stated with precise conditions, formal notation, and a real-world application example.',
      },
      {
        id: '6',
        studentName: 'Liu Ba',
        studentId: '2024006',
        submittedAt: '2026-02-15 09:55',
        content: '',
        attachments: [],
        score: undefined,
        feedback: undefined,
        isGraded: false,
        mcqAnswers: [
          { question: 1, selected: 'A', correct: 'A', isCorrect: true },
          { question: 2, selected: 'C', correct: 'C', isCorrect: true },
          { question: 3, selected: 'A', correct: 'B', isCorrect: false },
          { question: 4, selected: 'D', correct: 'D', isCorrect: true },
          { question: 5, selected: 'A', correct: 'A', isCorrect: true },
        ],
        saAnswer: 'The theorem provides that integration and differentiation are inverse processes. If F\'(x) = f(x), then the integral of f from a to b is F(b) - F(a). This is important because it means we do not need to compute limits of Riemann sums directly.',
        aiScore: 83,
        aiFeedback: 'MCQ 40/50 (Q3 incorrect). SA: Good explanation with correct formula and practical insight about Riemann sums. Could include Part I statement.',
      },
      {
        id: '7',
        studentName: 'Wang Black',
        studentId: '2024007',
        submittedAt: '2026-02-15 10:38',
        content: '',
        attachments: [],
        score: undefined,
        feedback: undefined,
        isGraded: false,
        isAccessibility: true,
        voiceAttachments: [
          { name: 'Q6_Voice_Answer_WangBlack.mp3', duration: '2:58', size: '3.8 MB' },
        ],
        mcqAnswers: [
          { question: 1, selected: 'A', correct: 'A', isCorrect: true },
          { question: 2, selected: 'C', correct: 'C', isCorrect: true },
          { question: 3, selected: 'B', correct: 'B', isCorrect: true },
          { question: 4, selected: 'D', correct: 'D', isCorrect: true },
          { question: 5, selected: 'A', correct: 'A', isCorrect: true },
        ],
        aiTranscription: 'The fundamental theorem of calculus is really about connecting two big ideas: differentiation and integration. So the first part says if you have a continuous function f on an interval [a, b], and you define a new function F(x) as the integral from a to x of f(t) dt, then F is differentiable and its derivative equals f(x). The second part is what we use most in practice — it says if you can find any antiderivative G of f, then the definite integral from a to b equals G(b) minus G(a). For example, to find the integral of 2x from 0 to 3, we know the antiderivative is x squared, so the answer is 9 minus 0, which is 9. This theorem is fundamental because it transforms the problem of computing areas into finding antiderivatives, which is usually much simpler.',
        saAnswer: '',
        aiScore: 96,
        aiFeedback: 'MCQ 50/50. SA (voice): Excellent verbal explanation. Both parts clearly articulated with correct notation adapted for speech. Good concrete example. Strong conceptual understanding demonstrated.',
      },
    ],
  },
};

export default function TeacherAssessmentDetail() {
  const { id } = useParams();
  const mockAssessment = mockAssessments[id || '1'] || mockAssessments['1'];
  const isQuiz = id === '2';

  const [expandedSubmissions, setExpandedSubmissions] = useState<Set<string>>(new Set());
  const [scores, setScores] = useState<Record<string, string>>({});
  const [feedbacks, setFeedbacks] = useState<Record<string, string>>({});
  const [savedGrades, setSavedGrades] = useState<Record<string, { score: number; feedback: string }>>({});
  const [playingAudio, setPlayingAudio] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Filter states
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'graded' | 'ungraded'>('all');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [showFilters, setShowFilters] = useState(false);

  const toggleExpand = (submissionId: string) => {
    setExpandedSubmissions((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(submissionId)) {
        newSet.delete(submissionId);
      } else {
        newSet.add(submissionId);
      }
      return newSet;
    });
  };

  const handleScoreChange = (submissionId: string, value: string) => {
    setScores((prev) => ({ ...prev, [submissionId]: value }));
  };

  const handleFeedbackChange = (submissionId: string, value: string) => {
    setFeedbacks((prev) => ({ ...prev, [submissionId]: value }));
  };

  const handleSaveGrading = (submissionId: string) => {
    // Compute the displayed score using the same fallback chain as the render
    const submission = mockAssessment.submissions.find((s) => s.id === submissionId);
    const hasSaved = !!savedGrades[submissionId];
    const displayedScore =
      scores[submissionId] ??
      (hasSaved ? savedGrades[submissionId].score.toString() : submission?.score?.toString() ?? '');
    const displayedFeedback =
      feedbacks[submissionId] ??
      (hasSaved ? savedGrades[submissionId].feedback : submission?.feedback ?? '');

    if (!displayedScore || displayedScore.trim() === '') return;

    setSavedGrades((prev) => ({
      ...prev,
      [submissionId]: { score: Number(displayedScore), feedback: displayedFeedback },
    }));
    // Clear the local input state so it picks up from savedGrades on next render
    setScores((prev) => {
      const next = { ...prev };
      delete next[submissionId];
      return next;
    });
    setFeedbacks((prev) => {
      const next = { ...prev };
      delete next[submissionId];
      return next;
    });
    alert(`Grading saved! Teacher score: ${displayedScore}`);
  };

  const getEffectiveScore = (submission: Submission): number | undefined => {
    // Teacher saved score takes priority over AI score
    if (savedGrades[submission.id]) {
      return savedGrades[submission.id].score;
    }
    if (submission.score !== undefined) {
      return submission.score;
    }
    return submission.aiScore;
  };

  const toggleAudioPlayback = (attachmentName: string) => {
    if (playingAudio === attachmentName) {
      setPlayingAudio(null);
    } else {
      setPlayingAudio(attachmentName);
    }
  };

  // Filter and sort submissions
  const filteredAndSortedSubmissions = mockAssessment.submissions
    .filter((submission) => {
      const matchesSearch =
        searchQuery === '' ||
        submission.studentName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        submission.studentId.toLowerCase().includes(searchQuery.toLowerCase());

      const isEffectivelyGraded = submission.isGraded || !!savedGrades[submission.id];
      const matchesStatus =
        statusFilter === 'all' ||
        (statusFilter === 'graded' && isEffectivelyGraded) ||
        (statusFilter === 'ungraded' && !isEffectivelyGraded);

      let matchesDateRange = true;
      if (startDate || endDate) {
        const submissionDate = new Date(submission.submittedAt);
        if (startDate) {
          const start = new Date(startDate);
          start.setHours(0, 0, 0, 0);
          matchesDateRange = matchesDateRange && submissionDate >= start;
        }
        if (endDate) {
          const end = new Date(endDate);
          end.setHours(23, 59, 59, 999);
          matchesDateRange = matchesDateRange && submissionDate <= end;
        }
      }

      return matchesSearch && matchesStatus && matchesDateRange;
    })
    .sort((a, b) => {
      const aGraded = a.isGraded || !!savedGrades[a.id];
      const bGraded = b.isGraded || !!savedGrades[b.id];
      if (aGraded !== bGraded) {
        return aGraded ? 1 : -1;
      }
      return new Date(b.submittedAt).getTime() - new Date(a.submittedAt).getTime();
    });

  const gradedCount = mockAssessment.submissions.filter(
    (s) => s.isGraded || !!savedGrades[s.id]
  ).length;
  const totalSubmissions = mockAssessment.submissions.length;

  const scoredSubmissions = mockAssessment.submissions
    .map((s) => getEffectiveScore(s))
    .filter((s): s is number => s !== undefined);
  const averageScore =
    scoredSubmissions.length > 0
      ? scoredSubmissions.reduce((sum, s) => sum + s, 0) / scoredSubmissions.length
      : NaN;

  return (
    <div>
      <div style={{ padding: '28px 32px' }}>
        {/* Back Button */}
        <Link
          to="/teacher/assessment"
          className="inline-flex items-center gap-2 text-[15px] text-gray-600 hover:text-[#0f0f23] mb-6"
        >
          <ChevronLeft className="w-5 h-5" />
          Back to Assessment & Testing
        </Link>

        {/* Header */}
        <div className="mb-8">
          <h1 style={{ fontSize: '24px', fontWeight: 700, background: 'linear-gradient(135deg, #0f0f23 0%, #7c2d12 100%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text', marginBottom: '8px' }}>
            {mockAssessment.title}
            <span style={{ marginLeft: '16px', fontSize: '17px', fontWeight: 400, background: 'none', WebkitTextFillColor: '#6b7280', color: '#6b7280' }}>{mockAssessment.course}</span>
          </h1>
          <p className="text-[15px] text-gray-600 mb-4">{mockAssessment.description}</p>
          <div className="flex items-center gap-6 text-[14px] text-gray-600">
            <span>Due date: {mockAssessment.dueDate}</span>
            <span>Total score: {mockAssessment.totalScore}</span>
          </div>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-3 gap-6 mb-8">
          <div className="bg-gray-50 rounded-lg p-6">
            <div className="text-[14px] text-gray-600 mb-2">Submissions</div>
            <div className="text-[32px] font-semibold text-[#0f0f23]">{totalSubmissions}</div>
          </div>
          <div className="bg-gray-50 rounded-lg p-6">
            <div className="text-[14px] text-gray-600 mb-2">Graded</div>
            <div className="text-[32px] font-semibold text-[#0f0f23]">
              {gradedCount}/{totalSubmissions}
            </div>
          </div>
          <div className="bg-gray-50 rounded-lg p-6">
            <div className="text-[14px] text-gray-600 mb-2">Average Score</div>
            <div className="text-[32px] font-semibold text-[#0f0f23]">
              {isNaN(averageScore) ? '-' : averageScore.toFixed(1)}
            </div>
          </div>
        </div>

        {/* Student Submissions */}
        <div>
          <h2 className="text-[18px] font-semibold text-[#0f0f23] mb-4">Student Submissions</h2>
          
          {/* Filter Controls */}
          <div className="mb-6">
            <div className="flex gap-4 mb-4">
              <div className="flex-1 relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                <input
                  type="text"
                  placeholder="Search by student name or ID..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-10 pr-4 py-2.5 border border-[#e8eaed] rounded-lg text-[15px] focus:outline-none focus:ring-2 focus:ring-[#3b5bdb] focus:border-transparent"
                />
              </div>
              <CustomSelect
                options={['All Status', 'ungraded', 'graded']}
                value={statusFilter === 'all' ? 'All Status' : statusFilter}
                onChange={v => setStatusFilter((v === 'All Status' ? 'all' : v) as 'all' | 'graded' | 'ungraded')}
                minWidth={140}
              />
              <button
                onClick={() => setShowFilters(!showFilters)}
                className={`flex items-center gap-2 px-4 py-2.5 border rounded-lg text-[15px] font-medium transition-colors ${
                  showFilters
                    ? 'bg-[#3b5bdb] text-white border-[#3b5bdb]'
                    : 'bg-white text-gray-700 border-[#e8eaed] hover:bg-gray-50'
                }`}
              >
                <Filter className="w-4 h-4" />
                Date Range
              </button>
            </div>

            {showFilters && (
              <div className="bg-gray-50 border border-[#e8eaed] rounded-lg p-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[14px] font-medium text-[#0f0f23] mb-2">Start Date</label>
                    <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="w-full px-4 py-2.5 border border-[#e8eaed] rounded-lg text-[15px] focus:outline-none focus:ring-2 focus:ring-[#3b5bdb] focus:border-transparent bg-white" />
                  </div>
                  <div>
                    <label className="block text-[14px] font-medium text-[#0f0f23] mb-2">End Date</label>
                    <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="w-full px-4 py-2.5 border border-[#e8eaed] rounded-lg text-[15px] focus:outline-none focus:ring-2 focus:ring-[#3b5bdb] focus:border-transparent bg-white" />
                  </div>
                </div>
                <div className="mt-4 flex justify-end gap-3">
                  <button onClick={() => { setStartDate(''); setEndDate(''); }} className="px-4 py-2 text-[14px] text-gray-600 hover:text-[#0f0f23]">Clear Dates</button>
                </div>
              </div>
            )}
            
            <div className="text-[14px] text-gray-600 mt-3">
              Showing {filteredAndSortedSubmissions.length} of {totalSubmissions} submissions
              {statusFilter !== 'all' && ` (${statusFilter})`}
            </div>
          </div>

          <div className="space-y-4">
            {filteredAndSortedSubmissions.length === 0 ? (
              <div className="text-center py-12 border border-[#e8eaed] rounded-lg">
                <p className="text-gray-500 text-[15px]">No submissions found matching your filters</p>
              </div>
            ) : (
              filteredAndSortedSubmissions.map((submission) => {
                const isExpanded = expandedSubmissions.has(submission.id);
                const hasSavedGrade = !!savedGrades[submission.id];
                const effectiveScore = getEffectiveScore(submission);
                const currentScore = scores[submission.id] ?? (hasSavedGrade ? savedGrades[submission.id].score.toString() : submission.score?.toString() ?? '');
                const currentFeedback = feedbacks[submission.id] ?? (hasSavedGrade ? savedGrades[submission.id].feedback : submission.feedback ?? '');
                const canSave = currentScore.trim() !== '';
                const isEffectivelyGraded = submission.isGraded || hasSavedGrade;
                const mcqCorrectCount = submission.mcqAnswers?.filter(a => a.isCorrect).length ?? 0;
                const mcqTotal = submission.mcqAnswers?.length ?? 0;

                return (
                  <div key={submission.id} className="border border-[#e8eaed] rounded-lg overflow-hidden">
                    {/* Submission Header */}
                    <div className="p-6">
                      <div className="flex items-start justify-between mb-3">
                        <div className="flex items-center gap-3">
                          <span className="text-[16px] font-semibold text-[#0f0f23]">{submission.studentName}</span>
                          <span className="text-[14px] text-gray-600">{submission.studentId}</span>
                          {isEffectivelyGraded && (
                            <span className="px-2.5 py-0.5 bg-green-100 text-green-700 rounded text-[13px] font-medium">
                              Graded
                            </span>
                          )}
                          {submission.isAccessibility && (
                            <span className="px-2.5 py-0.5 bg-blue-100 text-[#3b5bdb] rounded text-[13px] font-medium">
                              Accessibility
                            </span>
                          )}
                        </div>
                        <button
                          onClick={() => toggleExpand(submission.id)}
                          className="text-[#3b5bdb] text-[15px] font-medium hover:underline"
                        >
                          {isExpanded ? 'Collapse' : 'Expand'}
                        </button>
                      </div>
                      <div className="text-[14px] text-gray-600 mb-2">Submitted at: {submission.submittedAt}</div>
                      {/* Header score summary */}
                      <div className="flex items-center gap-4 text-[14px] text-gray-600">
                        {effectiveScore !== undefined && (
                          <span>
                            Score: <span className="font-semibold text-[#0f0f23]">{effectiveScore}</span>
                            {hasSavedGrade && <span className="text-green-600 ml-1">(Teacher)</span>}
                            {!hasSavedGrade && !submission.isGraded && submission.aiScore !== undefined && <span className="text-[#3b5bdb] ml-1">(AI)</span>}
                          </span>
                        )}
                        {isQuiz && submission.mcqAnswers && (
                          <span>MCQ: {mcqCorrectCount}/{mcqTotal}</span>
                        )}
                      </div>
                    </div>

                    {/* Expanded Content */}
                    {isExpanded && (
                      <div className="border-t border-[#e8eaed] bg-gray-50 p-6">

                        {/* ── Quiz-specific: MCQ Answers ── */}
                        {isQuiz && submission.mcqAnswers && (
                          <div className="mb-6">
                            <div className="text-[14px] font-medium text-[#0f0f23] mb-3">
                              Multiple Choice Answers (Q1–Q5)
                              <span className="ml-2 text-gray-500 font-normal">({mcqCorrectCount}/{mcqTotal} correct)</span>
                            </div>
                            <div className="bg-white rounded border border-[#e8eaed] overflow-hidden">
                              <div className="grid grid-cols-5 gap-0">
                                {submission.mcqAnswers.map((mcq) => (
                                  <div
                                    key={mcq.question}
                                    className={`p-3 text-center border-r last:border-r-0 border-[#e8eaed] ${
                                      mcq.isCorrect ? 'bg-green-50' : 'bg-red-50'
                                    }`}
                                  >
                                    <div className="text-[12px] text-gray-500 mb-1">Q{mcq.question}</div>
                                    <div className="flex items-center justify-center gap-1">
                                      {mcq.isCorrect ? (
                                        <CheckCircle className="w-3.5 h-3.5 text-green-600" />
                                      ) : (
                                        <XCircle className="w-3.5 h-3.5 text-red-500" />
                                      )}
                                      <span className={`text-[14px] font-semibold ${mcq.isCorrect ? 'text-green-700' : 'text-red-600'}`}>
                                        {mcq.selected}
                                      </span>
                                    </div>
                                    {!mcq.isCorrect && (
                                      <div className="text-[11px] text-gray-500 mt-0.5">
                                        Correct: {mcq.correct}
                                      </div>
                                    )}
                                  </div>
                                ))}
                              </div>
                            </div>
                          </div>
                        )}

                        {/* ── Quiz-specific: SA Q6 Answer ── */}
                        {isQuiz && (
                          <div className="mb-6">
                            <div className="text-[14px] font-medium text-[#0f0f23] mb-2">
                              Short Answer — Q6
                              {submission.isAccessibility && (
                                <span className="ml-2 text-[12px] font-normal text-[#3b5bdb] bg-blue-50 px-2 py-0.5 rounded">Voice Response</span>
                              )}
                            </div>

                            {/* For accessibility students: show AI transcription */}
                            {submission.isAccessibility && submission.aiTranscription && (
                              <div className="mb-3">
                                <div className="flex items-center gap-2 mb-2">
                                  <Bot className="w-4 h-4 text-[#3b5bdb]" />
                                  <span className="text-[13px] font-medium text-[#3b5bdb]">AI Speech-to-Text Transcription</span>
                                </div>
                                <div className="text-[14px] text-gray-700 bg-blue-50 p-4 rounded border border-blue-200 italic">
                                  {submission.aiTranscription}
                                </div>
                              </div>
                            )}

                            {/* For normal students: show written SA answer */}
                            {!submission.isAccessibility && submission.saAnswer && (
                              <div className="text-[14px] text-gray-700 bg-white p-4 rounded border border-[#e8eaed]">
                                {submission.saAnswer}
                              </div>
                            )}

                            {/* Voice recording for accessibility student */}
                            {submission.isAccessibility && submission.voiceAttachments && submission.voiceAttachments.length > 0 && (
                              <div className="mt-3">
                                <div className="text-[13px] font-medium text-[#0f0f23] mb-2">Voice Recording:</div>
                                {submission.voiceAttachments.map((va, idx) => (
                                  <div
                                    key={idx}
                                    className="flex items-center justify-between bg-white p-4 rounded border border-[#e8eaed]"
                                  >
                                    <div className="flex items-center gap-3">
                                      <button
                                        onClick={() => toggleAudioPlayback(va.name)}
                                        className="w-9 h-9 rounded-full bg-[#3b5bdb] text-white flex items-center justify-center hover:bg-[#2b4bc9] transition-colors"
                                      >
                                        {playingAudio === va.name ? (
                                          <Pause className="w-4 h-4" />
                                        ) : (
                                          <Play className="w-4 h-4 ml-0.5" />
                                        )}
                                      </button>
                                      <div>
                                        <div className="text-[14px] font-medium text-[#0f0f23] flex items-center gap-2">
                                          <Mic className="w-4 h-4 text-[#3b5bdb]" />
                                          {va.name}
                                        </div>
                                        <div className="text-[13px] text-gray-500">{va.duration} · {va.size}</div>
                                      </div>
                                    </div>
                                    <button className="p-2 hover:bg-gray-100 rounded" title="Download">
                                      <Download className="w-5 h-5 text-gray-600" />
                                    </button>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        )}

                        {/* ── Non-quiz: original Submission Content ── */}
                        {!isQuiz && (
                          <div className="mb-6">
                            <div className="text-[14px] font-medium text-[#0f0f23] mb-2">Submission Content:</div>
                            <p className="text-[14px] text-gray-700 bg-white p-4 rounded border border-[#e8eaed]">
                              {submission.content}
                            </p>
                          </div>
                        )}

                        {/* Attachments (non-quiz) */}
                        {submission.attachments.length > 0 && (
                          <div className="mb-6">
                            <div className="text-[14px] font-medium text-[#0f0f23] mb-2">Attachments:</div>
                            <div className="space-y-2">
                              {submission.attachments.map((attachment, index) => (
                                <div key={index} className="flex items-center justify-between bg-white p-4 rounded border border-[#e8eaed]">
                                  <div className="flex items-center gap-3">
                                    <FileText className="w-5 h-5 text-[#3b5bdb]" />
                                    <div>
                                      <div className="text-[14px] font-medium text-[#0f0f23]">{attachment.name}</div>
                                      <div className="text-[13px] text-gray-500">{attachment.size}</div>
                                    </div>
                                  </div>
                                  <button className="p-2 hover:bg-gray-100 rounded">
                                    <Download className="w-5 h-5 text-gray-600" />
                                  </button>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* ── AI Score Section (quiz only) ── */}
                        {isQuiz && submission.aiScore !== undefined && (
                          <div className="mb-6">
                            <div className="bg-gradient-to-r from-blue-50 to-indigo-50 rounded-lg border border-blue-200 p-5">
                              <div className="flex items-center gap-2 mb-3">
                                <Bot className="w-5 h-5 text-[#3b5bdb]" />
                                <span className="text-[15px] font-semibold text-[#0f0f23]">AI Suggested Score</span>
                                {hasSavedGrade && (
                                  <span className="text-[12px] px-2 py-0.5 bg-green-100 text-green-700 rounded ml-2">Overridden by Teacher</span>
                                )}
                              </div>
                              <div className="flex items-baseline gap-2 mb-2">
                                <span className={`text-[28px] font-semibold ${hasSavedGrade ? 'text-gray-400 line-through' : 'text-[#3b5bdb]'}`}>
                                  {submission.aiScore}
                                </span>
                                <span className="text-[14px] text-gray-500">/ {mockAssessment.totalScore}</span>
                              </div>
                              {submission.aiFeedback && (
                                <p className="text-[13px] text-gray-600 leading-relaxed">{submission.aiFeedback}</p>
                              )}
                            </div>
                          </div>
                        )}

                        {/* ── Grading Form ── */}
                        <div>
                          <div className="flex items-center gap-2 mb-4">
                            <span className="text-[15px] font-semibold text-[#0f0f23]">Teacher Grading</span>
                            {isQuiz && submission.aiScore !== undefined && !hasSavedGrade && (
                              <span className="text-[12px] text-gray-500">Score defaults to AI suggestion until you save</span>
                            )}
                          </div>
                          <div className="mb-4">
                            <label className="block text-[14px] font-medium text-[#0f0f23] mb-2">
                              Score (Total: {mockAssessment.totalScore})
                            </label>
                            <input
                              type="number"
                              min="0"
                              max={mockAssessment.totalScore}
                              value={currentScore}
                              onChange={(e) => handleScoreChange(submission.id, e.target.value)}
                              placeholder={isQuiz && submission.aiScore !== undefined ? `AI suggests: ${submission.aiScore}` : 'Enter score'}
                              className="w-full px-4 py-2.5 border border-[#e8eaed] rounded-lg text-[15px] focus:outline-none focus:ring-2 focus:ring-[#3b5bdb] focus:border-transparent"
                            />
                          </div>

                          <div className="mb-4">
                            <label className="block text-[14px] font-medium text-[#0f0f23] mb-2">Feedback</label>
                            <textarea
                              value={currentFeedback}
                              onChange={(e) => handleFeedbackChange(submission.id, e.target.value)}
                              placeholder="Enter feedback..."
                              rows={4}
                              className="w-full px-4 py-2.5 border border-[#e8eaed] rounded-lg text-[15px] focus:outline-none focus:ring-2 focus:ring-[#3b5bdb] focus:border-transparent resize-none"
                            />
                          </div>

                          <button
                            onClick={() => handleSaveGrading(submission.id)}
                            disabled={!canSave}
                            className={`w-full py-3 rounded-lg text-[15px] font-medium transition-colors ${
                              canSave
                                ? 'bg-[#0f0f23] text-white hover:bg-[#1a1a3a]'
                                : 'bg-gray-300 text-gray-500 cursor-not-allowed'
                            }`}
                          >
                            {hasSavedGrade ? 'Update Grading' : 'Save Grading'}
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
    </div>
  );
}