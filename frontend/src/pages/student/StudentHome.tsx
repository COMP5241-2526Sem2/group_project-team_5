import { useState, useRef, useCallback } from 'react';
import StudentLayout from '../../components/student/StudentLayout';
import {
  CheckCircle2, Circle, Plus, Trash2, GripVertical,
  ClipboardCheck, BookOpen, Star, ChevronRight, Bell,
} from 'lucide-react';
import { useNavigate } from 'react-router';
import { motion, AnimatePresence } from 'motion/react';
import { useDrag, useDrop, DndProvider } from 'react-dnd';
import { HTML5Backend } from 'react-dnd-html5-backend';

// ── Mock student data (K-12 context) ─────────────────────────────────────────
const student = {
  name: 'Li Xiaoming',
  studentId: '2024001234',
  school: 'Greenwood Middle School',
  grade: 'Grade 8',
  class: 'Class 8A',
  homeroom: 'Mr. Chen',
  contact: '138****5678',
  accessibility: { visualImpairment: false },
};

// ── Today's schedule (period-based) ──────────────────────────────────────────
const PERIODS = [
  { period: 1, time: '08:00–08:45', subject: 'Mathematics',   teacher: 'Ms. Sylvia',  room: 'Room 301' },
  { period: 2, time: '08:55–09:40', subject: 'English',        teacher: 'Mr. Brown',   room: 'Room 205' },
  { period: 3, time: '10:00–10:45', subject: 'Physics',        teacher: 'Ms. Liu',     room: 'Lab 101'  },
  { period: 4, time: '10:55–11:40', subject: 'History',        teacher: 'Mr. Wang',    room: 'Room 102' },
  { period: 5, time: '13:30–14:15', subject: 'Chinese',        teacher: 'Ms. Zhang',   room: 'Room 201' },
  { period: 6, time: '14:25–15:10', subject: 'Physical Ed.',   teacher: 'Mr. Li',      room: 'Gymnasium'},
  { period: 7, time: '15:20–16:05', subject: 'Biology',        teacher: 'Ms. Chen',    room: 'Lab 102'  },
];

// ── Upcoming quizzes ──────────────────────────────────────────────────────────
const upcomingQuizzes = [
  { id: 1, subject: 'Mathematics', title: 'Chapter 5 — Linear Equations', date: 'Tomorrow', dueLabel: 'Due tomorrow', urgent: true  },
  { id: 2, subject: 'English',     title: 'Reading Comprehension Quiz',   date: 'Mar 28',   dueLabel: 'In 3 days',   urgent: false },
  { id: 3, subject: 'Physics',     title: 'Forces & Motion Test',         date: 'Apr 1',    dueLabel: 'In 7 days',   urgent: false },
];

// ── Recent grades ─────────────────────────────────────────────────────────────
const recentGrades = [
  { subject: 'Mathematics', title: 'Quiz — Fractions',       score: 92, total: 100, date: 'Mar 20' },
  { subject: 'English',     title: 'Essay — My Hometown',    score: 88, total: 100, date: 'Mar 18' },
  { subject: 'Physics',     title: 'Lab Report — Pendulum',  score: 95, total: 100, date: 'Mar 15' },
  { subject: 'History',     title: 'Chapter Test — WW2',     score: 79, total: 100, date: 'Mar 12' },
];

// ── Announcements ─────────────────────────────────────────────────────────────
const announcements = [
  { id: 1, title: 'Parent-Teacher Meeting', body: 'Scheduled for April 3rd, 15:00–17:00 in the main hall.', date: 'Mar 25' },
  { id: 2, title: 'Spring Sports Day',      body: 'Registration opens April 1st. Sign up with your PE teacher.', date: 'Mar 24' },
  { id: 3, title: 'Library Book Return',    body: 'All borrowed books must be returned by March 31st.', date: 'Mar 22' },
];

// ── Subject colours ───────────────────────────────────────────────────────────
const SUBJECT_COLORS: Record<string, { bg: string; color: string; dot: string }> = {
  'Mathematics':  { bg: '#eff6ff', color: '#1e40af', dot: '#3b5bdb' },
  'English':      { bg: '#f0fdf4', color: '#166534', dot: '#22c55e' },
  'Physics':      { bg: '#fef3c7', color: '#92400e', dot: '#f59e0b' },
  'History':      { bg: '#fdf4ff', color: '#6b21a8', dot: '#a855f7' },
  'Chinese':      { bg: '#fff7ed', color: '#9a3412', dot: '#f97316' },
  'Physical Ed.': { bg: '#f0fdf4', color: '#065f46', dot: '#10b981' },
  'Biology':      { bg: '#ecfdf5', color: '#065f46', dot: '#059669' },
};
function subjectStyle(s: string) {
  return SUBJECT_COLORS[s] ?? { bg: '#f3f4f6', color: '#374151', dot: '#9ca3af' };
}

// ── Todo ──────────────────────────────────────────────────────────────────────
interface Todo { id: number; text: string; done: boolean; }
const INIT_TODOS: Todo[] = [
  { id: 1, text: 'Finish Math homework (p.78–80)',  done: false },
  { id: 2, text: 'Read History chapter 12',         done: true  },
  { id: 3, text: 'Prepare Physics lab report',      done: false },
  { id: 4, text: 'Study English vocabulary list',   done: false },
  { id: 5, text: 'Return library books',            done: false },
];
let _tid = 200;

const TODO_TYPE = 'K12_TODO';

function DraggableTodo({ todo, index, move, onToggle, onDelete }: {
  todo: Todo; index: number;
  move: (from: number, to: number) => void;
  onToggle: (id: number) => void;
  onDelete: (id: number) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [, drop] = useDrop<{ index: number }>({
    accept: TODO_TYPE,
    hover(item) {
      if (item.index === index) return;
      move(item.index, index);
      item.index = index;
    },
  });
  const [{ isDragging }, drag, preview] = useDrag({
    type: TODO_TYPE,
    item: { index },
    collect: m => ({ isDragging: m.isDragging() }),
  });
  preview(drop(ref));

  return (
    <div ref={ref} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '7px 10px', borderRadius: '8px', background: '#fff', border: '1px solid #f0f0f0', marginBottom: '5px', opacity: isDragging ? 0.4 : 1, transition: 'opacity 0.15s' }}>
      <div ref={drag as unknown as React.Ref<HTMLDivElement>} style={{ cursor: 'grab', color: '#d1d5db', display: 'flex', flexShrink: 0 }}>
        <GripVertical size={13} />
      </div>
      <button onClick={() => onToggle(todo.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, display: 'flex', flexShrink: 0, color: todo.done ? '#3b5bdb' : '#d1d5db' }}>
        {todo.done ? <CheckCircle2 size={16} /> : <Circle size={16} />}
      </button>
      <span style={{ flex: 1, fontSize: '13px', color: todo.done ? '#9ca3af' : '#374151', textDecoration: todo.done ? 'line-through' : 'none' }}>{todo.text}</span>
      <button onClick={() => onDelete(todo.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, display: 'flex', flexShrink: 0, color: '#e5e7eb' }}
        onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = '#ef4444'; }}
        onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = '#e5e7eb'; }}>
        <Trash2 size={13} />
      </button>
    </div>
  );
}

// ── Section header ────────────────────────────────────────────────────────────
function SectionHeader({ title, action, onAction }: { title: string; action?: string; onAction?: () => void }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
      <span style={{ fontSize: '15px', fontWeight: 700, color: '#0f0f23' }}>{title}</span>
      {action && (
        <button onClick={onAction} style={{ fontSize: '12px', color: '#3b5bdb', background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '2px' }}>
          {action} <ChevronRight size={12} />
        </button>
      )}
    </div>
  );
}

// ── Score colour ──────────────────────────────────────────────────────────────
function scoreColor(pct: number) {
  if (pct >= 90) return '#059669';
  if (pct >= 75) return '#3b5bdb';
  if (pct >= 60) return '#d97706';
  return '#ef4444';
}

// ── Main component ────────────────────────────────────────────────────────────
export default function StudentHome() {
  const navigate = useNavigate();
  const [todos, setTodos] = useState<Todo[]>(INIT_TODOS);
  const [newTodo, setNewTodo] = useState('');

  const moveTodo = useCallback((from: number, to: number) => {
    setTodos(prev => {
      const next = [...prev];
      const [item] = next.splice(from, 1);
      next.splice(to, 0, item);
      return next;
    });
  }, []);

  const toggleTodo = (id: number) => setTodos(prev => prev.map(t => t.id === id ? { ...t, done: !t.done } : t));
  const deleteTodo = (id: number) => setTodos(prev => prev.filter(t => t.id !== id));
  const addTodo = () => {
    const text = newTodo.trim();
    if (!text) return;
    setTodos(prev => [...prev, { id: ++_tid, text, done: false }]);
    setNewTodo('');
  };

  const now = new Date();
  const currentHour = now.getHours() * 60 + now.getMinutes();
  const currentPeriodIndex = PERIODS.findIndex(p => {
    const [startH, startM] = p.time.split('–')[0].split(':').map(Number);
    const [endH, endM]     = p.time.split('–')[1].split(':').map(Number);
    const start = startH * 60 + startM;
    const end   = endH   * 60 + endM;
    return currentHour >= start && currentHour <= end;
  });

  const donePct = todos.length > 0 ? Math.round(todos.filter(t => t.done).length / todos.length * 100) : 0;

  return (
    <DndProvider backend={HTML5Backend}>
      <StudentLayout>
        <div style={{ padding: '24px 28px', maxWidth: '1200px', margin: '0 auto', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' }}>

          {/* ── Greeting banner ── */}
          <div style={{ background: 'linear-gradient(135deg, #3b5bdb 0%, #4f46e5 100%)', borderRadius: '14px', padding: '20px 24px', marginBottom: '24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', color: '#fff' }}>
            <div>
              <div style={{ fontSize: '13px', opacity: 0.75, marginBottom: '4px' }}>
                {now.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}
              </div>
              <div style={{ fontSize: '22px', fontWeight: 700, marginBottom: '4px' }}>
                Good {now.getHours() < 12 ? 'morning' : now.getHours() < 18 ? 'afternoon' : 'evening'}, {student.name.split(' ')[0]}! 👋
              </div>
              <div style={{ fontSize: '13px', opacity: 0.8 }}>
                {student.grade} · {student.class} · {student.school}
              </div>
            </div>
            <div style={{ textAlign: 'right', flexShrink: 0 }}>
              <div style={{ fontSize: '12px', opacity: 0.7, marginBottom: '6px' }}>Today's tasks</div>
              <div style={{ fontSize: '28px', fontWeight: 800, lineHeight: 1 }}>{donePct}%</div>
              <div style={{ fontSize: '11px', opacity: 0.7 }}>completed</div>
            </div>
          </div>

          {/* ── Main grid ── */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: '20px' }}>

            {/* LEFT column */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>

              {/* Today's Timetable */}
              <div style={{ background: '#fff', border: '1px solid #e8eaed', borderRadius: '12px', overflow: 'hidden' }}>
                <div style={{ padding: '14px 18px', borderBottom: '1px solid #e8eaed' }}>
                  <SectionHeader title="Today's Schedule" />
                </div>
                <div style={{ padding: '10px 14px 14px' }}>
                  {PERIODS.map((p, i) => {
                    const sc = subjectStyle(p.subject);
                    const isCurrent = i === currentPeriodIndex;
                    return (
                      <div key={p.period} style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '8px 10px', borderRadius: '8px', marginBottom: '4px', background: isCurrent ? sc.bg : 'transparent', border: isCurrent ? `1px solid ${sc.dot}20` : '1px solid transparent', transition: 'background 0.15s' }}>
                        <div style={{ width: '22px', height: '22px', borderRadius: '50%', background: isCurrent ? sc.dot : '#f3f4f6', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                          <span style={{ fontSize: '10px', fontWeight: 700, color: isCurrent ? '#fff' : '#9ca3af' }}>{p.period}</span>
                        </div>
                        <div style={{ width: '100px', flexShrink: 0 }}>
                          <span style={{ fontSize: '11px', color: '#9ca3af', fontVariantNumeric: 'tabular-nums' }}>{p.time}</span>
                        </div>
                        <div style={{ flex: 1 }}>
                          <span style={{ fontSize: '13px', fontWeight: isCurrent ? 600 : 500, color: isCurrent ? sc.color : '#374151' }}>{p.subject}</span>
                          {isCurrent && <span style={{ marginLeft: '7px', fontSize: '10px', background: sc.dot, color: '#fff', padding: '1px 6px', borderRadius: '10px', fontWeight: 600 }}>Now</span>}
                        </div>
                        <div style={{ fontSize: '12px', color: '#9ca3af', flexShrink: 0 }}>{p.room}</div>
                        <div style={{ fontSize: '12px', color: '#9ca3af', flexShrink: 0, minWidth: '80px', textAlign: 'right' }}>{p.teacher}</div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Upcoming Quizzes */}
              <div style={{ background: '#fff', border: '1px solid #e8eaed', borderRadius: '12px', overflow: 'hidden' }}>
                <div style={{ padding: '14px 18px', borderBottom: '1px solid #e8eaed' }}>
                  <SectionHeader title="Upcoming Quizzes" action="View All" onAction={() => navigate('/student/quiz')} />
                </div>
                <div style={{ padding: '12px 14px' }}>
                  {upcomingQuizzes.map(q => {
                    const sc = subjectStyle(q.subject);
                    return (
                      <div key={q.id} style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '10px 12px', borderRadius: '9px', border: `1px solid ${q.urgent ? '#fecaca' : '#f0f0f0'}`, background: q.urgent ? '#fff5f5' : '#fafafa', marginBottom: '8px' }}>
                        <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: q.urgent ? '#ef4444' : sc.dot, flexShrink: 0 }} />
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: '13px', fontWeight: 600, color: '#0f0f23', marginBottom: '2px' }}>{q.title}</div>
                          <div style={{ fontSize: '11px', color: '#9ca3af' }}>
                            <span style={{ background: sc.bg, color: sc.color, padding: '1px 6px', borderRadius: '4px', marginRight: '6px', fontWeight: 600 }}>{q.subject}</span>
                            {q.dueLabel}
                          </div>
                        </div>
                        <button onClick={() => navigate('/student/quiz')}
                          style={{ fontSize: '12px', color: '#3b5bdb', background: '#eff6ff', border: '1px solid #dbeafe', borderRadius: '6px', padding: '4px 10px', cursor: 'pointer', flexShrink: 0, fontWeight: 500 }}>
                          Start
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Recent Grades */}
              <div style={{ background: '#fff', border: '1px solid #e8eaed', borderRadius: '12px', overflow: 'hidden' }}>
                <div style={{ padding: '14px 18px', borderBottom: '1px solid #e8eaed' }}>
                  <SectionHeader title="Recent Grades" />
                </div>
                <div style={{ padding: '6px 14px 14px' }}>
                  {recentGrades.map((g, i) => {
                    const pct = Math.round(g.score / g.total * 100);
                    const sc = subjectStyle(g.subject);
                    return (
                      <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '14px', padding: '10px 4px', borderBottom: i < recentGrades.length - 1 ? '1px solid #f5f5f5' : 'none' }}>
                        <div style={{ width: '32px', height: '32px', borderRadius: '8px', background: sc.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                          <BookOpen size={14} style={{ color: sc.dot }} />
                        </div>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: '13px', fontWeight: 500, color: '#0f0f23' }}>{g.title}</div>
                          <div style={{ fontSize: '11px', color: '#9ca3af', marginTop: '1px' }}>{g.subject} · {g.date}</div>
                        </div>
                        <div style={{ textAlign: 'right', flexShrink: 0 }}>
                          <div style={{ fontSize: '18px', fontWeight: 700, color: scoreColor(pct), lineHeight: 1 }}>{g.score}</div>
                          <div style={{ fontSize: '10px', color: '#9ca3af' }}>/ {g.total}</div>
                        </div>
                        <div style={{ flexShrink: 0 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '3px' }}>
                            <Star size={11} style={{ color: '#f59e0b', fill: '#f59e0b' }} />
                            <span style={{ fontSize: '12px', fontWeight: 600, color: scoreColor(pct) }}>{pct}%</span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* RIGHT column */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>

              {/* Student profile card */}
              <div style={{ background: '#fff', border: '1px solid #e8eaed', borderRadius: '12px', padding: '18px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '14px' }}>
                  <div style={{ width: '44px', height: '44px', borderRadius: '12px', background: '#dbeafe', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '20px', fontWeight: 800, color: '#3b5bdb', flexShrink: 0 }}>
                    {student.name.charAt(0)}
                  </div>
                  <div>
                    <div style={{ fontSize: '15px', fontWeight: 700, color: '#0f0f23' }}>{student.name}</div>
                    <div style={{ fontSize: '12px', color: '#9ca3af' }}>ID: {student.studentId}</div>
                  </div>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  {[
                    ['School',   student.school],
                    ['Grade',    student.grade],
                    ['Class',    student.class],
                    ['Homeroom', student.homeroom],
                  ].map(([label, value]) => (
                    <div key={label} style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                      <span style={{ fontSize: '12px', color: '#9ca3af', minWidth: '62px' }}>{label}</span>
                      <span style={{ fontSize: '13px', color: '#374151', fontWeight: 500 }}>{value}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Announcements */}
              <div style={{ background: '#fff', border: '1px solid #e8eaed', borderRadius: '12px', overflow: 'hidden' }}>
                <div style={{ padding: '14px 18px', borderBottom: '1px solid #e8eaed', display: 'flex', alignItems: 'center', gap: '7px' }}>
                  <Bell size={14} style={{ color: '#374151' }} />
                  <span style={{ fontSize: '15px', fontWeight: 700, color: '#0f0f23' }}>Announcements</span>
                </div>
                <div style={{ padding: '10px 14px' }}>
                  {announcements.map((a, i) => (
                    <div key={a.id} style={{ padding: '8px 0', borderBottom: i < announcements.length - 1 ? '1px solid #f5f5f5' : 'none' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '3px' }}>
                        <span style={{ fontSize: '13px', fontWeight: 600, color: '#0f0f23' }}>{a.title}</span>
                        <span style={{ fontSize: '11px', color: '#9ca3af', flexShrink: 0, marginLeft: '8px' }}>{a.date}</span>
                      </div>
                      <p style={{ fontSize: '12px', color: '#6b7280', margin: 0, lineHeight: 1.5 }}>{a.body}</p>
                    </div>
                  ))}
                </div>
              </div>

              {/* To-do list */}
              <div style={{ background: '#fff', border: '1px solid #e8eaed', borderRadius: '12px', overflow: 'hidden' }}>
                <div style={{ padding: '14px 18px', borderBottom: '1px solid #e8eaed' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '7px' }}>
                      <ClipboardCheck size={14} style={{ color: '#374151' }} />
                      <span style={{ fontSize: '15px', fontWeight: 700, color: '#0f0f23' }}>To-Do</span>
                    </div>
                    <span style={{ fontSize: '12px', color: '#9ca3af' }}>{todos.filter(t => t.done).length}/{todos.length} done</span>
                  </div>
                  {/* Progress bar */}
                  <div style={{ marginTop: '8px', height: '4px', background: '#f0f0f0', borderRadius: '2px', overflow: 'hidden' }}>
                    <motion.div animate={{ width: `${donePct}%` }} transition={{ duration: 0.4 }}
                      style={{ height: '100%', background: '#3b5bdb', borderRadius: '2px' }} />
                  </div>
                </div>

                <div style={{ padding: '12px 14px' }}>
                  <AnimatePresence>
                    {todos.map((todo, i) => (
                      <motion.div key={todo.id} initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, height: 0, marginBottom: 0 }}>
                        <DraggableTodo todo={todo} index={i} move={moveTodo} onToggle={toggleTodo} onDelete={deleteTodo} />
                      </motion.div>
                    ))}
                  </AnimatePresence>

                  {/* Add new */}
                  <div style={{ display: 'flex', gap: '6px', marginTop: '6px' }}>
                    <input
                      value={newTodo}
                      onChange={e => setNewTodo(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && addTodo()}
                      placeholder="Add a task…"
                      style={{ flex: 1, padding: '6px 10px', border: '1px solid #e8eaed', borderRadius: '7px', fontSize: '13px', outline: 'none', color: '#374151' }}
                      onFocus={e => { e.currentTarget.style.borderColor = '#3b5bdb'; }}
                      onBlur={e => { e.currentTarget.style.borderColor = '#e8eaed'; }}
                    />
                    <button onClick={addTodo} disabled={!newTodo.trim()}
                      style={{ width: '30px', height: '30px', borderRadius: '7px', border: 'none', background: newTodo.trim() ? '#3b5bdb' : '#f3f4f6', color: newTodo.trim() ? '#fff' : '#9ca3af', cursor: newTodo.trim() ? 'pointer' : 'not-allowed', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      <Plus size={15} />
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </StudentLayout>
    </DndProvider>
  );
}
