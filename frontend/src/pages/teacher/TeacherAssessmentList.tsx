import { useState } from 'react';
import { Link } from 'react-router';
import { Search } from 'lucide-react';
import { CustomSelect } from '../../components/teacher/CustomSelect';

interface Assessment {
  id: string;
  title: string;
  course: string;
  type: 'exam' | 'quiz' | 'homework';
  description: string;
  dueDate: string;
  submitted: number;
  total: number;
  graded: number;
  status: 'grading' | 'completed';
}

const mockAssessments: Assessment[] = [
  {
    id: '1',
    title: 'Math Midterm Exam',
    course: 'Advanced Math A',
    type: 'exam',
    description: 'Covers chapters 1-5, requires written answers',
    dueDate: '2026-02-20',
    submitted: 32,
    total: 45,
    graded: 25,
    status: 'grading',
  },
  {
    id: '2',
    title: 'Conceptual Quiz',
    course: 'Advanced Concepts and Theory',
    type: 'quiz',
    description: 'Multiple choice and short answer distribution',
    dueDate: '2026-02-16',
    submitted: 42,
    total: 42,
    graded: 42,
    status: 'completed',
  },
  {
    id: '3',
    title: 'Chapter 1 Practice Problems',
    course: 'Advanced Math A',
    type: 'homework',
    description: 'Complete exercises 1-10, requires detailed solution steps',
    dueDate: '2026-02-20',
    submitted: 45,
    total: 50,
    graded: 38,
    status: 'grading',
  },
];

export default function TeacherAssessmentList() {
  const [searchQuery, setSearchQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');

  const filteredAssessments = mockAssessments.filter((assessment) => {
    const matchesSearch =
      assessment.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      assessment.course.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesType = typeFilter === 'all' || assessment.type === typeFilter;
    const matchesStatus = statusFilter === 'all' || assessment.status === statusFilter;
    return matchesSearch && matchesType && matchesStatus;
  }).sort((a, b) => {
    // Sort by status first: 'grading' before 'completed'
    if (a.status !== b.status) {
      return a.status === 'grading' ? -1 : 1;
    }
    // Within same status, sort by due date (earlier dates first)
    return new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime();
  });

  const getTypeLabel = (type: string) => {
    const labels = { exam: 'Exam', quiz: 'Quiz', homework: 'Homework' };
    return labels[type as keyof typeof labels] || type;
  };

  const getTypeBadgeColor = (type: string) => {
    const colors = {
      exam: 'bg-purple-100 text-purple-700',
      quiz: 'bg-blue-100 text-blue-700',
      homework: 'bg-green-100 text-green-700',
    };
    return colors[type as keyof typeof colors] || 'bg-gray-100 text-gray-700';
  };

  const getStatusLabel = (status: string) => {
    return status === 'grading' ? 'Grading' : 'Completed';
  };

  const getStatusBadgeColor = (status: string) => {
    return status === 'grading' ? 'bg-orange-100 text-orange-700' : 'bg-green-100 text-green-700';
  };

  const isPastDue = (dueDate: string) => {
    return new Date(dueDate) < new Date();
  };

  return (
    <div>
      <div style={{ padding: '28px 32px' }}>
        {/* Header */}
        <div style={{ marginBottom: '28px' }}>
          <h1 style={{ fontSize: '24px', fontWeight: 700, background: 'linear-gradient(135deg, #0f0f23 0%, #7c2d12 100%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text', margin: '0 0 4px' }}>Assessment & Testing</h1>
          <p style={{ fontSize: '14px', color: '#9ca3af', margin: 0 }}>Manage and grade all course tests, assignments, and exams</p>
        </div>

        {/* Filters */}
        <div className="flex gap-4 mb-6">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
            <input
              type="text"
              placeholder="Search by assessment name..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 border border-[#e8eaed] rounded-lg text-[15px] focus:outline-none focus:ring-2 focus:ring-[#3b5bdb] focus:border-transparent"
            />
          </div>
          <CustomSelect
            options={['All Types', 'exam', 'quiz', 'homework']}
            value={typeFilter === 'all' ? 'All Types' : typeFilter}
            onChange={v => setTypeFilter(v === 'All Types' ? 'all' : v)}
            minWidth={140}
          />
          <CustomSelect
            options={['All Status', 'grading', 'completed']}
            value={statusFilter === 'all' ? 'All Status' : statusFilter}
            onChange={v => setStatusFilter(v === 'All Status' ? 'all' : v)}
            minWidth={140}
          />
        </div>

        {/* Assessment List */}
        <div className="space-y-4">
          {filteredAssessments.map((assessment) => (
            <div key={assessment.id} className="border border-[#e8eaed] rounded-lg p-6 hover:shadow-sm transition-shadow">
              {/* Header */}
              <div className="flex items-start justify-between mb-3">
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-2">
                    <h3 className="text-[17px] font-semibold text-[#0f0f23]">{assessment.title}</h3>
                    <span className="text-[14px] text-gray-600">
                      {assessment.course}
                    </span>
                    <span className={`px-2.5 py-0.5 rounded text-[13px] font-medium ${getTypeBadgeColor(assessment.type)}`}>
                      {getTypeLabel(assessment.type)}
                    </span>
                  </div>
                  <p className="text-[14px] text-gray-600">{assessment.description}</p>
                </div>
                <div className="flex items-center gap-3 ml-6">
                  <span className={`px-3 py-1.5 rounded text-[14px] font-medium ${getStatusBadgeColor(assessment.status)}`}>
                    {getStatusLabel(assessment.status)}
                  </span>
                </div>
              </div>

              {/* Stats */}
              <div className="mb-4">
                <div className="flex items-center gap-6 text-[14px] mb-2">
                  <span className={isPastDue(assessment.dueDate) ? 'text-red-600' : 'text-gray-600'}>
                    Due date: {assessment.dueDate} {isPastDue(assessment.dueDate) && '(Past due)'}
                  </span>
                  <span className="text-gray-600">Submitted: {assessment.submitted}/{assessment.total}</span>
                  <span className="text-gray-600">Graded: {assessment.graded}/{assessment.submitted}</span>
                </div>

                {/* Progress Bar */}
                <div className="relative w-full h-2 bg-gray-100 rounded-full overflow-hidden">
                  <div
                    className="absolute top-0 left-0 h-full bg-[#3b5bdb] rounded-full transition-all"
                    style={{ width: `${(assessment.graded / assessment.submitted) * 100}%` }}
                  />
                </div>
              </div>

              {/* Action */}
              <div className="flex justify-end">
                <Link
                  to={`/teacher/assessment/${assessment.id}`}
                  className="text-[#3b5bdb] text-[15px] font-medium hover:underline"
                >
                  {assessment.status === 'grading' ? 'Start Grading →' : 'View Details →'}
                </Link>
              </div>
            </div>
          ))}
        </div>

        {filteredAssessments.length === 0 && (
          <div className="text-center py-12">
            <p className="text-gray-500 text-[15px]">No assessments found</p>
          </div>
        )}
      </div>
    </div>
  );
}