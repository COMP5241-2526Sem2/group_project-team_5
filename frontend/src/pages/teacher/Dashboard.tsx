import TeacherLayout from '../../components/teacher/TeacherLayout';
import { User } from 'lucide-react';

export default function TeacherDashboard() {
  const stats = [
    { label: 'Total Students', value: '156' },
    { label: 'Ongoing Courses', value: '12' },
    { label: 'Average Score', value: '85.3' },
    { label: 'Critiques / Assignments', value: '23' },
  ];

  const recentActivities = [
    { student: 'Zhang Xiaoming', action: 'Submitted homework for Math', time: '2 minutes ago' },
    { student: 'Li Hua', action: 'Completed Physics test', time: '15 minutes ago' },
    { student: 'Wang Fang', action: 'Joined English course', time: '1 hour ago' },
    { student: 'Liu Qiang', action: 'Submitted Chemistry report', time: '2 hours ago' },
  ];

  return (
    <TeacherLayout>
      <div style={{ padding: '28px 32px' }}>
        {/* Page Title */}
        <div style={{ marginBottom: '28px' }}>
          <h1 style={{ fontSize: '24px', fontWeight: 700, background: 'linear-gradient(135deg, #0f0f23 0%, #7c2d12 100%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text', margin: '0 0 4px' }}>
            Dashboard
          </h1>
          <p style={{ fontSize: '14px', color: '#9ca3af', margin: 0 }}>Welcome back, Sylvia · Here's what's happening today</p>
        </div>

        {/* Stats Cards */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '20px', marginBottom: '36px' }}>
          {stats.map((stat, idx) => (
            <div
              key={idx}
              style={{
                background: '#ffffff',
                border: '1px solid #e8eaed',
                borderRadius: '12px',
                padding: '24px 20px',
                display: 'flex',
                flexDirection: 'column',
                gap: '8px',
              }}
            >
              <div style={{ fontSize: '13px', color: '#6b7280', fontWeight: 400 }}>{stat.label}</div>
              <div style={{ fontSize: '32px', fontWeight: 600, color: '#0f0f23', letterSpacing: '-0.02em' }}>{stat.value}</div>
            </div>
          ))}
        </div>

        {/* Recent Activity */}
        <div
          style={{
            background: '#ffffff',
            border: '1px solid #e8eaed',
            borderRadius: '12px',
            padding: '24px',
          }}
        >
          <h2 style={{ fontSize: '18px', fontWeight: 600, color: '#0f0f23', marginBottom: '20px' }}>
            Recent Activity
          </h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {recentActivities.map((activity, idx) => (
              <div
                key={idx}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '12px 0',
                  borderBottom: idx !== recentActivities.length - 1 ? '1px solid #f3f4f6' : 'none',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <div
                    style={{
                      width: '32px',
                      height: '32px',
                      borderRadius: '50%',
                      background: '#f3f4f6',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <User size={16} style={{ color: '#9ca3af' }} />
                  </div>
                  <div>
                    <div style={{ fontSize: '15px', color: '#0f0f23', fontWeight: 500 }}>
                      {activity.student}
                    </div>
                    <div style={{ fontSize: '14px', color: '#6b7280' }}>{activity.action}</div>
                  </div>
                </div>
                <div style={{ fontSize: '13px', color: '#9ca3af', whiteSpace: 'nowrap' }}>
                  {activity.time}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </TeacherLayout>
  );
}