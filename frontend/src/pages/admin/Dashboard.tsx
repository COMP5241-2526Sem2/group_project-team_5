import AdminLayout from '../../components/admin/AdminLayout';
import { useState, useEffect } from 'react';
import { TrendingUp, TrendingDown, BookOpen, Users, ClipboardList, Award } from 'lucide-react';

/* ── static data (K-12 context) ──────────────────────────────────── */
const enrollmentTrend = [
  { month: 'Sep', total: 320, new: 320 },
  { month: 'Oct', total: 322, new: 2  },
  { month: 'Nov', total: 321, new: 0  },
  { month: 'Dec', total: 319, new: 0  },
  { month: 'Jan', total: 318, new: 0  },
  { month: 'Feb', total: 318, new: 0  },
];

const courseActivity = [
  { day: 'Mon', submissions: 34 },
  { day: 'Tue', submissions: 28 },
  { day: 'Wed', submissions: 41 },
  { day: 'Thu', submissions: 22 },
  { day: 'Fri', submissions: 48 },
  { day: 'Sat', submissions: 5  },
  { day: 'Sun', submissions: 3  },
];

const deptData = [
  { name: 'Grade 7',  value: 52, color: '#3b5bdb' },
  { name: 'Grade 8',  value: 56, color: '#7c3aed' },
  { name: 'Grade 9',  value: 54, color: '#0891b2' },
  { name: 'Grade 10', value: 48, color: '#059669' },
  { name: 'Grade 11', value: 45, color: '#d97706' },
  { name: 'Grade 12', value: 43, color: '#ef4444' },
];

const courses = [
  { name: 'Grade 8A — Mathematics',  students: 42, max: 45, status: 'in_progress' },
  { name: 'Grade 7B — English',       students: 40, max: 45, status: 'in_progress' },
  { name: 'Grade 9C — Physics',       students: 38, max: 45, status: 'in_progress' },
  { name: 'Grade 10A — History',      students: 35, max: 40, status: 'in_progress' },
  { name: 'Grade 12B — Chemistry',    students: 30, max: 35, status: 'in_progress' },
];

const activities = [
  { id: 1, user: 'Li Ming (G8A)',     action: 'completed Mathematics quiz',        module: 'Quiz',       time: '2m ago',    color: '#3b5bdb' },
  { id: 2, user: 'Wang Fang (G7B)',   action: 'submitted English essay',           module: 'Assignment', time: '15m ago',   color: '#059669' },
  { id: 3, user: 'Zhang Wei (G9C)',   action: 'completed Physics test',            module: 'Quiz',       time: '1h ago',    color: '#7c3aed' },
  { id: 4, user: 'Ms. Sylvia',        action: 'published new quiz for Grade 8A',   module: 'Assessment', time: '2h ago',    color: '#3b5bdb' },
  { id: 5, user: 'Chen Jing (G10A)', action: 'scored 95% on History quiz',        module: 'Quiz',       time: '3h ago',    color: '#d97706' },
  { id: 6, user: 'Admin',             action: 'added 2 new student accounts',      module: 'System',     time: '5h ago',    color: '#6b7280' },
  { id: 7, user: 'Mr. Brown',         action: 'updated English course materials',  module: 'Course',     time: 'Yesterday', color: '#059669' },
];

const notices = [
  { type: 'info',    text: '3 students have pending accessibility needs',  time: 'Today'     },
  { type: 'info',    text: '18 quiz submissions awaiting grading',          time: 'Today'     },
  { type: 'success', text: 'System backup completed successfully',          time: 'Yesterday' },
  { type: 'warning', text: '2 student accounts inactive for over 14 days',  time: 'Yesterday' },
];

const noticeStyle: Record<string, { bg: string; dot: string }> = {
  warning: { bg: '#fffbeb', dot: '#d97706' },
  info:    { bg: '#eff6ff', dot: '#3b5bdb' },
  success: { bg: '#f0fdf4', dot: '#059669' },
};

const statusMap: Record<string, { text: string; color: string; bg: string }> = {
  in_progress: { text: 'In Progress', color: '#2563eb', bg: '#eff6ff' },
  enrolling:   { text: 'Enrolling',   color: '#059669', bg: '#f0fdf4' },
  ended:       { text: 'Ended',       color: '#6b7280', bg: '#f9fafb' },
};

/* ── SVG Line Chart ──────────────────────────────────────── */
function SvgLineChart() {
  const W = 480, H = 180, padL = 40, padR = 12, padT = 12, padB = 32;
  const innerW = W - padL - padR;
  const innerH = H - padT - padB;

  const vals1 = enrollmentTrend.map(d => d.total);
  const vals2 = enrollmentTrend.map(d => d.new);
  const maxV  = Math.max(...vals1) * 1.12;

  const xOf = (i: number) => padL + (i / (enrollmentTrend.length - 1)) * innerW;
  const yOf = (v: number) => padT + innerH - (v / maxV) * innerH;
  const line = (vals: number[]) =>
    vals.map((v, i) => `${i === 0 ? 'M' : 'L'} ${xOf(i).toFixed(1)} ${yOf(v).toFixed(1)}`).join(' ');

  const yTicks = [0, 50, 100, 150];
  const [tooltip, setTooltip] = useState<{ idx: number } | null>(null);

  return (
    <div style={{ position: 'relative', width: '100%', overflowX: 'auto' }}>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ display: 'block', minWidth: 300 }}>
        {yTicks.map(v => (
          <g key={v}>
            <line x1={padL} x2={W - padR} y1={yOf(v)} y2={yOf(v)} stroke="#f0f0f0" strokeWidth={1} />
            <text x={padL - 6} y={yOf(v) + 4} textAnchor="end" fontSize={11} fill="#9ca3af">{v}</text>
          </g>
        ))}
        {enrollmentTrend.map((d, i) => (
          <text key={i} x={xOf(i)} y={H - 8} textAnchor="middle" fontSize={11} fill="#9ca3af">{d.month}</text>
        ))}
        <path d={line(vals1)} fill="none" stroke="#3b5bdb" strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" />
        <path d={line(vals2)} fill="none" stroke="#7c3aed" strokeWidth={2}   strokeDasharray="5 4" strokeLinejoin="round" strokeLinecap="round" />
        {vals1.map((v, i) => <circle key={i} cx={xOf(i)} cy={yOf(v)} r={3.5} fill="#3b5bdb" />)}
        {vals2.map((v, i) => <circle key={i} cx={xOf(i)} cy={yOf(v)} r={3.5} fill="#7c3aed" />)}
        {enrollmentTrend.map((_, i) => (
          <rect key={i} x={xOf(i) - 22} y={padT} width={44} height={innerH}
            fill="transparent" style={{ cursor: 'crosshair' }}
            onMouseEnter={() => setTooltip({ idx: i })}
            onMouseLeave={() => setTooltip(null)}
          />
        ))}
        {tooltip !== null && (() => {
          const d  = enrollmentTrend[tooltip.idx];
          const tx = xOf(tooltip.idx);
          const bx = tx + 10;
          const by = padT + 4;
          return (
            <g>
              <line x1={tx} x2={tx} y1={padT} y2={padT + innerH} stroke="#e8eaed" strokeWidth={1} />
              <rect x={bx} y={by} width={92} height={52} rx={7} fill="white" stroke="#e8eaed" strokeWidth={1}
                filter="drop-shadow(0 2px 8px rgba(0,0,0,0.10))" />
              <text x={bx + 9} y={by + 16} fontSize={11} fill="#9ca3af">{d.month}</text>
              <text x={bx + 9} y={by + 31} fontSize={12} fill="#3b5bdb">Total  {d.total}</text>
              <text x={bx + 9} y={by + 46} fontSize={12} fill="#7c3aed">New    {d.new}</text>
            </g>
          );
        })()}
      </svg>
      <div style={{ display: 'flex', gap: 18, paddingLeft: 10, marginTop: 6 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <div style={{ width: 18, height: 2.5, background: '#3b5bdb', borderRadius: 2 }} />
          <span style={{ fontSize: 13, color: '#9ca3af' }}>Total Students</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <svg width={18} height={3}><line x1={0} y1={1.5} x2={18} y2={1.5} stroke="#7c3aed" strokeWidth={2} strokeDasharray="4 3" /></svg>
          <span style={{ fontSize: 13, color: '#9ca3af' }}>New This Month</span>
        </div>
      </div>
    </div>
  );
}

/* ── SVG Bar Chart ───────────────────────────────────────── */
function SvgBarChart() {
  const W = 380, H = 170, padL = 32, padR = 10, padT = 12, padB = 32;
  const innerW = W - padL - padR;
  const innerH = H - padT - padB;
  const n    = courseActivity.length;
  const maxV = Math.max(...courseActivity.map(d => d.submissions)) * 1.15;
  const bw   = (innerW / n) * 0.55;

  const xOf = (i: number) => padL + (i + 0.5) * (innerW / n);
  const yOf = (v: number) => padT + innerH - (v / maxV) * innerH;
  const yTicks = [0, 10, 20, 30, 40];
  const [hov, setHov] = useState<number | null>(null);

  return (
    <div style={{ width: '100%', overflowX: 'auto' }}>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ display: 'block', minWidth: 280 }}>
        {yTicks.map(v => (
          <g key={v}>
            <line x1={padL} x2={W - padR} y1={yOf(v)} y2={yOf(v)} stroke="#f0f0f0" strokeWidth={1} />
            <text x={padL - 5} y={yOf(v) + 4} textAnchor="end" fontSize={11} fill="#9ca3af">{v}</text>
          </g>
        ))}
        {courseActivity.map((d, i) => {
          const x  = xOf(i);
          const y  = yOf(d.submissions);
          const bh = innerH - (y - padT);
          const isHov = hov === i;
          return (
            <g key={i}>
              <rect x={x - bw / 2} y={y} width={bw} height={bh} rx={4}
                fill={isHov ? '#2f4dc4' : '#3b5bdb'} opacity={isHov ? 1 : 0.85}
                style={{ transition: 'fill 0.15s, opacity 0.15s', cursor: 'default' }}
              />
              {isHov && (
                <g>
                  <rect x={x - 20} y={y - 26} width={40} height={20} rx={5} fill="white" stroke="#e8eaed" strokeWidth={1}
                    filter="drop-shadow(0 1px 4px rgba(0,0,0,0.10))" />
                  <text x={x} y={y - 11} textAnchor="middle" fontSize={12} fill="#0f0f23">{d.submissions}</text>
                </g>
              )}
              <text x={x} y={H - 8} textAnchor="middle" fontSize={11} fill="#9ca3af">{d.day}</text>
              <rect x={x - bw / 2 - 5} y={padT} width={bw + 10} height={innerH}
                fill="transparent"
                onMouseEnter={() => setHov(i)}
                onMouseLeave={() => setHov(null)}
              />
            </g>
          );
        })}
      </svg>
    </div>
  );
}

/* ── SVG Donut ───────────────────────────────────────────── */
function SvgDonut() {
  const total = deptData.reduce((s, d) => s + d.value, 0);
  const cx = 60, cy = 60, r = 46, ir = 28;
  let angle = -Math.PI / 2;
  const slices = deptData.map(d => {
    const sweep = (d.value / total) * 2 * Math.PI;
    const start = angle;
    angle += sweep;
    return { ...d, start, sweep };
  });

  const arc = (cx: number, cy: number, r: number, start: number, sweep: number) => {
    const x1 = cx + r * Math.cos(start);
    const y1 = cy + r * Math.sin(start);
    const x2 = cx + r * Math.cos(start + sweep);
    const y2 = cy + r * Math.sin(start + sweep);
    return `M ${x1.toFixed(2)} ${y1.toFixed(2)} A ${r} ${r} 0 ${sweep > Math.PI ? 1 : 0} 1 ${x2.toFixed(2)} ${y2.toFixed(2)}`;
  };

  return (
    <svg viewBox="0 0 120 120" width={120} height={120}>
      {slices.map((s, i) => (
        <path key={i} fill={s.color}
          d={`${arc(cx, cy, r, s.start, s.sweep - 0.04)} L ${(cx + ir * Math.cos(s.start + s.sweep - 0.04)).toFixed(2)} ${(cy + ir * Math.sin(s.start + s.sweep - 0.04)).toFixed(2)} ${arc(cx, cy, ir, s.start + s.sweep - 0.04, -(s.sweep - 0.04))} Z`}
        />
      ))}
      <circle cx={cx} cy={cy} r={ir - 1} fill="white" />
    </svg>
  );
}

/* ── Shared components ───────────────────────────────────── */
function StatCard({ icon: Icon, iconColor, iconBg, label, value, sub, up }: {
  icon: React.ElementType; iconColor: string; iconBg: string;
  label: string; value: string; sub: string; up?: boolean;
}) {
  return (
    <div style={{ background: '#fff', border: '1px solid #e8eaed', borderRadius: 12, padding: '20px 22px' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 14 }}>
        <div style={{ width: 40, height: 40, borderRadius: 10, background: iconBg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Icon size={19} style={{ color: iconColor }} />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: 13, color: up ? '#059669' : '#ef4444' }}>
          {up ? <TrendingUp size={13} /> : <TrendingDown size={13} />}
          {sub}
        </div>
      </div>
      <p style={{ fontSize: 30, fontWeight: 700, color: '#0f0f23', lineHeight: 1, marginBottom: 6 }}>{value}</p>
      <p style={{ fontSize: 13, color: '#9ca3af' }}>{label}</p>
    </div>
  );
}

function SectionCard({ title, action, children }: { title: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div style={{ background: '#fff', border: '1px solid #e8eaed', borderRadius: 12, overflow: 'hidden' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px', borderBottom: '1px solid #f5f5f5' }}>
        <h3 style={{ fontSize: 15, fontWeight: 600, color: '#0f0f23' }}>{title}</h3>
        {action}
      </div>
      {children}
    </div>
  );
}

/* ── Main ────────────────────────────────────────────────── */
export default function Dashboard() {
  const [counts, setCounts] = useState({ students: 0, courses: 0, avgScore: 0, pending: 0 });

  useEffect(() => {
    const targets = { students: 156, courses: 12, avgScore: 85.3, pending: 23 };
    const duration = 900;
    const start = Date.now();
    const tick = () => {
      const p = Math.min((Date.now() - start) / duration, 1);
      const e = 1 - Math.pow(1 - p, 3);
      setCounts({
        students: Math.round(targets.students * e),
        courses:  Math.round(targets.courses * e),
        avgScore: Math.round(targets.avgScore * e * 10) / 10,
        pending:  Math.round(targets.pending * e),
      });
      if (p < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }, []);

  return (
    <AdminLayout>
      <div style={{ padding: '32px 40px', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif', maxWidth: 1200 }}>

        {/* Header */}
        <div style={{ marginBottom: 24 }}>
          <h1 style={{ fontSize: 24, fontWeight: 700, color: '#0f0f23' }}>Dashboard</h1>
          <p style={{ fontSize: 14, color: '#9ca3af', marginTop: 4 }}>February 2026 · Live data</p>
        </div>

        {/* Stat cards */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 22 }}>
          <StatCard icon={Users}         iconColor="#3b5bdb" iconBg="#eef2ff" label="Total Students"       value={counts.students.toString()}    sub="+11 this month" up />
          <StatCard icon={BookOpen}      iconColor="#7c3aed" iconBg="#f5f3ff" label="Active Courses"       value={counts.courses.toString()}     sub="+2 this term"   up />
          <StatCard icon={Award}         iconColor="#059669" iconBg="#f0fdf4" label="Average Grade"        value={counts.avgScore.toFixed(1)}    sub="+1.2 vs last mo." up />
          <StatCard icon={ClipboardList} iconColor="#d97706" iconBg="#fffbeb" label="Pending Assignments"  value={counts.pending.toString()}     sub="-5 vs yesterday" />
        </div>

        {/* Line chart + Dept donut */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 310px', gap: 16, marginBottom: 16 }}>
          <SectionCard title="Student Enrollment Trend">
            <div style={{ padding: '18px 20px 14px' }}>
              <SvgLineChart />
            </div>
          </SectionCard>

          <SectionCard title="Department Distribution">
            <div style={{ padding: '14px 20px 18px' }}>
              <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 14 }}>
                <SvgDonut />
              </div>
              {deptData.map((d, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 9 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div style={{ width: 9, height: 9, borderRadius: '50%', background: d.color, flexShrink: 0 }} />
                    <span style={{ fontSize: 13, color: '#374151' }}>{d.name}</span>
                  </div>
                  <span style={{ fontSize: 13, color: '#9ca3af' }}>{d.value}</span>
                </div>
              ))}
            </div>
          </SectionCard>
        </div>

        {/* Bar chart + Course overview */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
          <SectionCard title="Weekly Assignment Submissions">
            <div style={{ padding: '18px 20px 14px' }}>
              <SvgBarChart />
            </div>
          </SectionCard>

          <SectionCard title="Course Overview" action={
            <span style={{ fontSize: 13, color: '#3b5bdb', cursor: 'pointer' }}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.textDecoration = 'underline'; }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.textDecoration = 'none'; }}>
              View all
            </span>
          }>
            <div>
              {courses.map((c, i) => {
                const pct = Math.round((c.students / c.max) * 100);
                const st  = statusMap[c.status];
                return (
                  <div key={i}
                    style={{ padding: '13px 20px', borderBottom: i < courses.length - 1 ? '1px solid #f8f8f8' : 'none', cursor: 'default' }}
                    onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = '#fafafa'; }}
                    onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 7 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ fontSize: 14, fontWeight: 500, color: '#0f0f23' }}>{c.name}</span>
                        <span style={{ fontSize: 12, padding: '2px 8px', borderRadius: 20, background: st.bg, color: st.color }}>{st.text}</span>
                      </div>
                      <span style={{ fontSize: 13, color: '#9ca3af' }}>{c.students}/{c.max}</span>
                    </div>
                    <div style={{ height: 5, background: '#f0f0f0', borderRadius: 3, overflow: 'hidden' }}>
                      <div style={{ height: '100%', width: `${pct}%`, background: pct >= 90 ? '#ef4444' : '#3b5bdb', borderRadius: 3 }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </SectionCard>
        </div>

        {/* Recent activity + Notices */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 310px', gap: 16 }}>
          <SectionCard title="Recent Activity">
            <div>
              {activities.map((item, i) => (
                <div key={item.id}
                  style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '13px 20px', borderBottom: i < activities.length - 1 ? '1px solid #f8f8f8' : 'none' }}
                  onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = '#fafafa'; }}
                  onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <div style={{ width: 32, height: 32, borderRadius: '50%', background: '#eef2ff', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      <span style={{ fontSize: 13, fontWeight: 600, color: '#3b5bdb' }}>{item.user[0]}</span>
                    </div>
                    <p style={{ fontSize: 14, color: '#374151' }}>
                      <span style={{ fontWeight: 600, color: '#0f0f23' }}>{item.user}</span>
                      {' '}
                      <span style={{ color: item.color }}>{item.action}</span>
                    </p>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0, marginLeft: 16 }}>
                    <span style={{ fontSize: 12, padding: '2px 8px', borderRadius: 20, background: '#f3f4f6', color: '#6b7280' }}>{item.module}</span>
                    <span style={{ fontSize: 12, color: '#9ca3af', whiteSpace: 'nowrap' }}>{item.time}</span>
                  </div>
                </div>
              ))}
            </div>
          </SectionCard>

          <SectionCard title="System Notices">
            <div style={{ padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 9 }}>
              {notices.map((n, i) => {
                const s = noticeStyle[n.type];
                return (
                  <div key={i} style={{ background: s.bg, borderRadius: 9, padding: '11px 14px', display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                    <div style={{ width: 7, height: 7, borderRadius: '50%', background: s.dot, marginTop: 5, flexShrink: 0 }} />
                    <div>
                      <p style={{ fontSize: 13, color: '#374151', lineHeight: 1.45 }}>{n.text}</p>
                      <p style={{ fontSize: 12, color: '#9ca3af', marginTop: 3 }}>{n.time}</p>
                    </div>
                  </div>
                );
              })}
            </div>

            <div style={{ padding: '12px 14px', borderTop: '1px solid #f5f5f5', display: 'flex', flexDirection: 'column', gap: 7 }}>
              <p style={{ fontSize: 12, color: '#9ca3af', marginBottom: 2, padding: '0 2px' }}>Quick Actions</p>
              {[
                { label: 'Add New Course',  href: '/admin/courses'  },
                { label: 'Manage Users',    href: '/admin/users'    },
                { label: 'System Settings', href: '/admin/settings' },
              ].map((op, i) => (
                <a key={i} href={op.href}
                  style={{ display: 'block', padding: '9px 14px', borderRadius: 8, border: '1px solid #e8eaed', background: '#fff', color: '#374151', fontSize: 14, textDecoration: 'none' }}
                  onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = '#f9fafb'; (e.currentTarget as HTMLElement).style.borderColor = '#d1d5db'; }}
                  onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = '#fff'; (e.currentTarget as HTMLElement).style.borderColor = '#e8eaed'; }}
                >
                  {op.label}
                </a>
              ))}
            </div>
          </SectionCard>
        </div>
      </div>
    </AdminLayout>
  );
}