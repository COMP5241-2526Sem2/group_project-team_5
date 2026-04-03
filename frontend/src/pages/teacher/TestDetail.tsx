import { useNavigate } from 'react-router';
import TeacherLayout from '../../components/teacher/TeacherLayout';
import { ArrowLeft } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, ResponsiveContainer, Tooltip } from 'recharts';

export default function TestDetail() {
  const navigate = useNavigate();

  const testInfo = {
    name: 'Chapter 1 Test: Functions and Limits',
    date: '2026-02-12',
    students: 48,
    questions: 10,
    courseId: '1',
  };

  // ── Grade Statistics ─────────────────────────────────────────────
  const gradeStats = [
    { label: 'Students', value: '48' },
    { label: 'Average', value: '82.5' },
    { label: 'Pass Rate', value: '95.8%' },
    { label: 'Highest Score', value: '98' },
  ];

  const chartData = [
    { range: '0–59', count: 1 },
    { range: '60–69', count: 4 },
    { range: '70–79', count: 12 },
    { range: '80–89', count: 20 },
    { range: '90–100', count: 11 },
  ];

  // ── Student Performance ──────────────────────────────────────────
  const students = [
    { name: 'Zhang San',  score: '95', correct: '9/10', time: '2026-02-12 14:23', status: 'Passed' },
    { name: 'Li Si',      score: '88', correct: '8/10', time: '2026-02-12 14:18', status: 'Passed' },
    { name: 'Wang Wu',    score: '76', correct: '7/10', time: '2026-02-12 14:35', status: 'Passed' },
    { name: 'Zhao Liu',   score: '92', correct: '9/10', time: '2026-02-12 14:15', status: 'Passed' },
    { name: 'Sun Qi',     score: '58', correct: '5/10', time: '2026-02-12 14:42', status: 'Failed' },
  ];

  // ── Question Analysis ────────────────────────────────────────────
  const questions = [
    { number: 1, text: 'What is the derivative of function f(x) = x² at point x = 2?', accuracy: '92%' },
    { number: 2, text: 'Which of the following functions is continuous?',               accuracy: '85%' },
    { number: 3, text: 'Find the limit lim(x→0) sin(x)/x',                             accuracy: '68%' },
  ];

  return (
    <TeacherLayout>
      <div style={{ padding: '28px 32px' }}>

        {/* Back */}
        <button
          onClick={() => navigate(`/teacher/course/${testInfo.courseId}`)}
          style={{ display: 'flex', alignItems: 'center', gap: '6px', background: 'transparent', border: 'none', color: '#6b7280', fontSize: '14px', cursor: 'pointer', marginBottom: '20px', padding: '4px 0' }}
          onMouseEnter={e => ((e.currentTarget as HTMLElement).style.color = '#0f0f23')}
          onMouseLeave={e => ((e.currentTarget as HTMLElement).style.color = '#6b7280')}
        >
          <ArrowLeft size={16} />
          <span>Back to Course</span>
        </button>

        {/* Title */}
        <div style={{ marginBottom: '6px' }}>
          <h1 style={{ fontSize: '24px', fontWeight: 700, background: 'linear-gradient(135deg, #0f0f23 0%, #7c2d12 100%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text', marginBottom: '8px' }}>
            {testInfo.name}
          </h1>
          <div style={{ display: 'flex', gap: '16px', fontSize: '14px', color: '#9ca3af' }}>
            <span>{testInfo.date}</span>
            <span>·</span>
            <span>{testInfo.students} participants</span>
            <span>·</span>
            <span>{testInfo.questions} questions</span>
          </div>
        </div>

        {/* ── Grade Statistics ──────────────────────────────────────── */}
        <section style={{ marginTop: '32px', marginBottom: '36px' }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '10px', marginBottom: '16px' }}>
            <h2 style={{ fontSize: '17px', fontWeight: 700, color: '#0f0f23', margin: 0 }}>Grade Statistics</h2>
            <span style={{ fontSize: '13px', color: '#9ca3af' }}>Recent grade distribution &amp; analysis</span>
          </div>

          {/* Stat cards */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '14px', marginBottom: '20px' }}>
            {gradeStats.map((stat, idx) => (
              <div
                key={idx}
                style={{
                  padding: '20px 22px',
                  background: '#f9fafb',
                  border: '1px solid #f0f0f0',
                  borderRadius: '12px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '6px',
                }}
              >
                <div style={{ fontSize: '13px', color: '#6b7280' }}>{stat.label}</div>
                <div style={{ fontSize: '28px', fontWeight: 700, color: '#0f0f23', letterSpacing: '-0.02em' }}>{stat.value}</div>
              </div>
            ))}
          </div>

          {/* Score distribution chart */}
          <div style={{ background: '#ffffff', border: '1px solid #e8eaed', borderRadius: '12px', padding: '24px' }}>
            <div style={{ fontSize: '14px', fontWeight: 600, color: '#0f0f23', marginBottom: '16px' }}>Score Distribution</div>
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={chartData} barSize={40}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" vertical={false} />
                <XAxis dataKey="range" tick={{ fontSize: 13, fill: '#6b7280' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 13, fill: '#6b7280' }} axisLine={false} tickLine={false} />
                <Tooltip
                  cursor={{ fill: '#f3f4f6' }}
                  contentStyle={{ borderRadius: '8px', border: '1px solid #e8eaed', fontSize: '13px' }}
                  formatter={(v: number) => [`${v} students`, 'Count']}
                />
                <Bar dataKey="count" fill="#3b5bdb" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </section>

        {/* ── Student Performance ───────────────────────────────────── */}
        <section style={{ marginBottom: '36px' }}>
          <h2 style={{ fontSize: '17px', fontWeight: 700, color: '#0f0f23', marginBottom: '16px' }}>
            Student Performance
          </h2>
          <div style={{ background: '#ffffff', border: '1px solid #e8eaed', borderRadius: '12px', overflow: 'hidden' }}>
            {/* Header */}
            <div style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr 1fr 1.5fr 1fr', padding: '12px 24px', background: '#f9fafb', borderBottom: '1px solid #e8eaed' }}>
              {['Student Name', 'Score', 'Correct Rate', 'Submission Time', 'Status'].map(h => (
                <span key={h} style={{ fontSize: '12px', fontWeight: 600, color: '#9ca3af', letterSpacing: '0.04em', textTransform: 'uppercase' }}>{h}</span>
              ))}
            </div>
            {students.map((student, idx) => (
              <div
                key={idx}
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1.5fr 1fr 1fr 1.5fr 1fr',
                  alignItems: 'center',
                  padding: '16px 24px',
                  borderBottom: idx !== students.length - 1 ? '1px solid #f3f4f6' : 'none',
                  fontSize: '14px',
                  color: '#0f0f23',
                }}
              >
                <span>{student.name}</span>
                <span style={{ fontWeight: 600 }}>{student.score} pts</span>
                <span style={{ color: '#374151' }}>{student.correct}</span>
                <span style={{ color: '#6b7280' }}>{student.time}</span>
                <span>
                  <span style={{
                    display: 'inline-flex', alignItems: 'center',
                    padding: '4px 10px', borderRadius: '12px', fontSize: '12px', fontWeight: 500,
                    background: student.status === 'Passed' ? '#dcfce7' : '#fee2e2',
                    color:      student.status === 'Passed' ? '#16a34a' : '#dc2626',
                  }}>
                    {student.status}
                  </span>
                </span>
              </div>
            ))}
          </div>
        </section>

        {/* ── Question Analysis ─────────────────────────────────────── */}
        <section>
          <h2 style={{ fontSize: '17px', fontWeight: 700, color: '#0f0f23', marginBottom: '16px' }}>
            Question Analysis
          </h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            {questions.map(q => (
              <div key={q.number} style={{ padding: '20px', background: '#f9fafb', borderRadius: '12px', border: '1px solid #f0f0f0' }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px', marginBottom: '14px' }}>
                  <div style={{ width: '28px', height: '28px', borderRadius: '50%', background: '#3b5bdb', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '13px', fontWeight: 700, flexShrink: 0 }}>
                    {q.number}
                  </div>
                  <div style={{ fontSize: '15px', color: '#0f0f23', paddingTop: '4px' }}>{q.text}</div>
                </div>
                <div style={{ paddingLeft: '40px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <div style={{ flex: 1, height: '8px', background: '#e8eaed', borderRadius: '4px', overflow: 'hidden' }}>
                      <div style={{ height: '100%', width: q.accuracy, background: '#3b5bdb', borderRadius: '4px' }} />
                    </div>
                    <span style={{ fontSize: '13px', color: '#6b7280', whiteSpace: 'nowrap' }}>Correct rate {q.accuracy}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>

      </div>
    </TeacherLayout>
  );
}
