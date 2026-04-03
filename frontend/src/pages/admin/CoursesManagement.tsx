import { useState } from 'react';
import AdminLayout from '../../components/admin/AdminLayout';
import {
  Search, Plus, Pencil, Trash2, X, Check, BookOpen,
  ChevronLeft, ChevronRight,
} from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';

// ── Types ─────────────────────────────────────────────────────────────────────
interface Course {
  id: number;
  name: string;
  subject: string;
  teacher: string;
  grades: string[];   // e.g. ['Grade 8', 'Grade 9']
  period: string;     // e.g. 'Period 1 (08:00–08:45)'
  room: string;
  weekdays: string;   // e.g. 'Mon / Wed / Fri'
  students: number;
  maxStudents: number;
  status: 'active' | 'inactive';
}

// ── Mock data ─────────────────────────────────────────────────────────────────
const SUBJECTS = ['Mathematics', 'English', 'Physics', 'History', 'Chinese', 'Physical Ed.', 'Biology', 'Chemistry', 'Art', 'Music'];
const TEACHERS  = ['Ms. Sylvia', 'Mr. Brown', 'Ms. Liu', 'Mr. Wang', 'Ms. Zhang', 'Mr. Li', 'Ms. Chen', 'Mr. Chen'];
const GRADES    = ['Grade 7', 'Grade 8', 'Grade 9', 'Grade 10', 'Grade 11', 'Grade 12'];
const PERIODS   = [
  'Period 1 (08:00–08:45)',
  'Period 2 (08:55–09:40)',
  'Period 3 (10:00–10:45)',
  'Period 4 (10:55–11:40)',
  'Period 5 (13:30–14:15)',
  'Period 6 (14:25–15:10)',
  'Period 7 (15:20–16:05)',
];

const INIT_COURSES: Course[] = [
  { id: 1,  name: 'Mathematics — Grade 8A',   subject: 'Mathematics',   teacher: 'Ms. Sylvia', grades: ['Grade 8'],  period: PERIODS[0], room: 'Room 301', weekdays: 'Mon / Wed / Fri', students: 42, maxStudents: 45, status: 'active' },
  { id: 2,  name: 'English — Grade 7B',        subject: 'English',       teacher: 'Mr. Brown',  grades: ['Grade 7'],  period: PERIODS[1], room: 'Room 205', weekdays: 'Tue / Thu',        students: 40, maxStudents: 45, status: 'active' },
  { id: 3,  name: 'Physics — Grade 9C',        subject: 'Physics',       teacher: 'Ms. Liu',    grades: ['Grade 9'],  period: PERIODS[2], room: 'Lab 101',  weekdays: 'Mon / Wed',         students: 38, maxStudents: 40, status: 'active' },
  { id: 4,  name: 'History — Grade 10A',       subject: 'History',       teacher: 'Mr. Wang',   grades: ['Grade 10'], period: PERIODS[3], room: 'Room 102', weekdays: 'Tue / Thu',         students: 35, maxStudents: 40, status: 'active' },
  { id: 5,  name: 'Chinese — Grade 8B',        subject: 'Chinese',       teacher: 'Ms. Zhang',  grades: ['Grade 8'],  period: PERIODS[4], room: 'Room 201', weekdays: 'Mon / Wed / Fri',  students: 44, maxStudents: 45, status: 'active' },
  { id: 6,  name: 'Physical Ed. — Grade 7A',   subject: 'Physical Ed.',  teacher: 'Mr. Li',     grades: ['Grade 7'],  period: PERIODS[5], room: 'Gymnasium', weekdays: 'Tue / Thu / Fri', students: 45, maxStudents: 50, status: 'active' },
  { id: 7,  name: 'Biology — Grade 9A',        subject: 'Biology',       teacher: 'Ms. Chen',   grades: ['Grade 9'],  period: PERIODS[6], room: 'Lab 102',  weekdays: 'Wed / Fri',         students: 36, maxStudents: 40, status: 'active' },
  { id: 8,  name: 'Chemistry — Grade 12B',     subject: 'Chemistry',     teacher: 'Mr. Chen',   grades: ['Grade 12'], period: PERIODS[2], room: 'Lab 103',  weekdays: 'Mon / Wed',         students: 30, maxStudents: 35, status: 'active' },
  { id: 9,  name: 'Art — Grade 11A',           subject: 'Art',           teacher: 'Ms. Liu',    grades: ['Grade 11'], period: PERIODS[4], room: 'Art Room', weekdays: 'Fri',               students: 28, maxStudents: 35, status: 'active' },
  { id: 10, name: 'Music — Grade 7C',          subject: 'Music',         teacher: 'Mr. Brown',  grades: ['Grade 7'],  period: PERIODS[5], room: 'Music Rm', weekdays: 'Tue / Thu',         students: 30, maxStudents: 35, status: 'inactive' },
  { id: 11, name: 'Mathematics — Grade 10B',   subject: 'Mathematics',   teacher: 'Ms. Sylvia', grades: ['Grade 10'], period: PERIODS[1], room: 'Room 302', weekdays: 'Mon / Wed / Fri',  students: 38, maxStudents: 45, status: 'active' },
  { id: 12, name: 'English — Grade 12A',       subject: 'English',       teacher: 'Mr. Brown',  grades: ['Grade 12'], period: PERIODS[0], room: 'Room 206', weekdays: 'Tue / Thu',         students: 33, maxStudents: 40, status: 'active' },
];

// ── Subject colour map ────────────────────────────────────────────────────────
const SUBJECT_COLOR: Record<string, { bg: string; color: string; dot: string }> = {
  'Mathematics': { bg: '#eff6ff', color: '#1e40af', dot: '#3b5bdb' },
  'English':     { bg: '#f0fdf4', color: '#166534', dot: '#22c55e' },
  'Physics':     { bg: '#fef3c7', color: '#92400e', dot: '#f59e0b' },
  'History':     { bg: '#fdf4ff', color: '#6b21a8', dot: '#a855f7' },
  'Chinese':     { bg: '#fff7ed', color: '#9a3412', dot: '#f97316' },
  'Physical Ed.':{ bg: '#ecfdf5', color: '#065f46', dot: '#10b981' },
  'Biology':     { bg: '#f0fdf4', color: '#065f46', dot: '#059669' },
  'Chemistry':   { bg: '#fefce8', color: '#713f12', dot: '#ca8a04' },
  'Art':         { bg: '#fdf2f8', color: '#701a75', dot: '#d946ef' },
  'Music':       { bg: '#f5f3ff', color: '#4c1d95', dot: '#8b5cf6' },
};
function sc(s: string) { return SUBJECT_COLOR[s] ?? { bg: '#f3f4f6', color: '#374151', dot: '#9ca3af' }; }

// ── Empty form ────────────────────────────────────────────────────────────────
function emptyForm(): Omit<Course, 'id'> {
  return { name: '', subject: SUBJECTS[0], teacher: TEACHERS[0], grades: [GRADES[0]], period: PERIODS[0], room: '', weekdays: 'Mon / Wed / Fri', students: 0, maxStudents: 45, status: 'active' };
}

const ITEMS_PER_PAGE = 8;
let _nextId = 100;

// ── Helper: label input ───────────────────────────────────────────────────────
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
      <label style={{ fontSize: '12px', fontWeight: 600, color: '#374151' }}>{label}</label>
      {children}
    </div>
  );
}

const INPUT = {
  width: '100%', padding: '7px 10px', border: '1px solid #e0e0e0', borderRadius: '7px',
  fontSize: '13px', color: '#0f0f23', outline: 'none', background: '#fff', boxSizing: 'border-box' as const,
};
const SELECT = { ...INPUT, cursor: 'pointer' };

// ── Main page ─────────────────────────────────────────────────────────────────
export default function CoursesManagement() {
  const [courses, setCourses]       = useState<Course[]>(INIT_COURSES);
  const [search, setSearch]         = useState('');
  const [filterSubject, setFilter]  = useState('');
  const [filterGrade, setFGrade]    = useState('');
  const [page, setPage]             = useState(1);

  // modal state
  const [modalOpen, setModalOpen]   = useState(false);
  const [editId, setEditId]         = useState<number | null>(null);
  const [form, setForm]             = useState<Omit<Course, 'id'>>(emptyForm());

  // delete confirm
  const [deleteId, setDeleteId]     = useState<number | null>(null);

  // ── Filtering ───────────────────────────────────────────────────────────────
  const filtered = courses.filter(c => {
    const q = search.toLowerCase();
    return (
      (!q || c.name.toLowerCase().includes(q) || c.teacher.toLowerCase().includes(q)) &&
      (!filterSubject || c.subject === filterSubject) &&
      (!filterGrade   || c.grades.includes(filterGrade))
    );
  });
  const totalPages = Math.max(1, Math.ceil(filtered.length / ITEMS_PER_PAGE));
  const pageData   = filtered.slice((page - 1) * ITEMS_PER_PAGE, page * ITEMS_PER_PAGE);

  // ── Modal helpers ───────────────────────────────────────────────────────────
  function openAdd() {
    setEditId(null);
    setForm(emptyForm());
    setModalOpen(true);
  }
  function openEdit(c: Course) {
    setEditId(c.id);
    const { id, ...rest } = c;
    setForm(rest);
    setModalOpen(true);
  }
  function closeModal() { setModalOpen(false); }

  function saveForm() {
    if (!form.name.trim() || !form.room.trim()) return;
    if (editId !== null) {
      setCourses(prev => prev.map(c => c.id === editId ? { ...form, id: editId } : c));
    } else {
      setCourses(prev => [...prev, { ...form, id: ++_nextId }]);
    }
    setModalOpen(false);
    setPage(1);
  }

  function deleteCourse(id: number) {
    setCourses(prev => prev.filter(c => c.id !== id));
    setDeleteId(null);
  }

  const pf = (field: keyof typeof form, val: unknown) => setForm(prev => ({ ...prev, [field]: val }));

  return (
    <AdminLayout>
      <div style={{ padding: '24px 28px', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' }}>

        {/* ── Header ── */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{ width: '32px', height: '32px', background: '#3b5bdb', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <BookOpen size={16} style={{ color: '#fff' }} />
            </div>
            <div>
              <h1 style={{ fontSize: '18px', fontWeight: 700, color: '#0f0f23', margin: 0 }}>Courses</h1>
              <p style={{ fontSize: '12px', color: '#9ca3af', margin: 0 }}>{courses.length} courses total</p>
            </div>
          </div>
          <button onClick={openAdd} style={{ display: 'flex', alignItems: 'center', gap: '6px', background: '#3b5bdb', color: '#fff', border: 'none', borderRadius: '8px', padding: '8px 16px', fontSize: '13px', fontWeight: 600, cursor: 'pointer' }}>
            <Plus size={14} /> Add Course
          </button>
        </div>

        {/* ── Filters ── */}
        <div style={{ display: 'flex', gap: '10px', marginBottom: '16px', flexWrap: 'wrap' }}>
          <div style={{ position: 'relative', flex: '1 1 220px', minWidth: '180px' }}>
            <Search size={14} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: '#9ca3af' }} />
            <input value={search} onChange={e => { setSearch(e.target.value); setPage(1); }}
              placeholder="Search name or teacher…"
              style={{ width: '100%', paddingLeft: '32px', padding: '8px 10px 8px 32px', border: '1px solid #e8eaed', borderRadius: '8px', fontSize: '13px', outline: 'none', color: '#0f0f23', boxSizing: 'border-box' }} />
          </div>
          <select value={filterSubject} onChange={e => { setFilter(e.target.value); setPage(1); }}
            style={{ padding: '8px 12px', border: '1px solid #e8eaed', borderRadius: '8px', fontSize: '13px', color: '#374151', background: '#fff', cursor: 'pointer', outline: 'none', minWidth: '140px' }}>
            <option value="">All Subjects</option>
            {SUBJECTS.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
          <select value={filterGrade} onChange={e => { setFGrade(e.target.value); setPage(1); }}
            style={{ padding: '8px 12px', border: '1px solid #e8eaed', borderRadius: '8px', fontSize: '13px', color: '#374151', background: '#fff', cursor: 'pointer', outline: 'none', minWidth: '120px' }}>
            <option value="">All Grades</option>
            {GRADES.map(g => <option key={g} value={g}>{g}</option>)}
          </select>
        </div>

        {/* ── Table ── */}
        <div style={{ background: '#fff', border: '1px solid #e8eaed', borderRadius: '12px', overflow: 'hidden' }}>
          {/* Table head */}
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr 1fr 90px 80px', gap: '0', borderBottom: '1px solid #e8eaed', padding: '0 16px', background: '#fafafa' }}>
            {['Course Name', 'Subject', 'Teacher', 'Schedule', 'Students', 'Status', 'Actions'].map(h => (
              <div key={h} style={{ padding: '10px 8px', fontSize: '12px', fontWeight: 600, color: '#6b7280' }}>{h}</div>
            ))}
          </div>

          {pageData.length === 0 ? (
            <div style={{ padding: '48px', textAlign: 'center', color: '#9ca3af', fontSize: '14px' }}>No courses found.</div>
          ) : (
            pageData.map((c, i) => {
              const style = sc(c.subject);
              const fillPct = Math.round(c.students / c.maxStudents * 100);
              return (
                <div key={c.id} style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr 1fr 90px 80px', gap: '0', padding: '0 16px', borderBottom: i < pageData.length - 1 ? '1px solid #f5f5f5' : 'none', alignItems: 'center' }}>
                  {/* Name */}
                  <div style={{ padding: '12px 8px' }}>
                    <div style={{ fontSize: '13px', fontWeight: 600, color: '#0f0f23' }}>{c.name}</div>
                    <div style={{ fontSize: '11px', color: '#9ca3af', marginTop: '2px' }}>{c.room}</div>
                  </div>
                  {/* Subject */}
                  <div style={{ padding: '12px 8px' }}>
                    <span style={{ background: style.bg, color: style.color, padding: '2px 8px', borderRadius: '5px', fontSize: '11px', fontWeight: 600 }}>{c.subject}</span>
                  </div>
                  {/* Teacher */}
                  <div style={{ padding: '12px 8px', fontSize: '13px', color: '#374151' }}>{c.teacher}</div>
                  {/* Schedule */}
                  <div style={{ padding: '12px 8px' }}>
                    <div style={{ fontSize: '12px', color: '#374151' }}>{c.period.split(' ')[0]} {c.period.split(' ')[1]}</div>
                    <div style={{ fontSize: '11px', color: '#9ca3af' }}>{c.weekdays}</div>
                  </div>
                  {/* Students + fill bar */}
                  <div style={{ padding: '12px 8px' }}>
                    <div style={{ fontSize: '12px', color: '#374151', marginBottom: '4px' }}>{c.students} / {c.maxStudents}</div>
                    <div style={{ height: '4px', background: '#f0f0f0', borderRadius: '2px', overflow: 'hidden' }}>
                      <div style={{ height: '100%', width: `${fillPct}%`, background: fillPct >= 95 ? '#ef4444' : fillPct >= 75 ? '#f59e0b' : '#3b5bdb', borderRadius: '2px' }} />
                    </div>
                  </div>
                  {/* Status */}
                  <div style={{ padding: '12px 8px' }}>
                    <span style={{ fontSize: '11px', fontWeight: 600, padding: '3px 8px', borderRadius: '5px', background: c.status === 'active' ? '#d1fae5' : '#f3f4f6', color: c.status === 'active' ? '#065f46' : '#9ca3af' }}>
                      {c.status === 'active' ? 'Active' : 'Inactive'}
                    </span>
                  </div>
                  {/* Actions */}
                  <div style={{ padding: '12px 8px', display: 'flex', gap: '6px' }}>
                    <button onClick={() => openEdit(c)} title="Edit"
                      style={{ width: '28px', height: '28px', border: '1px solid #e8eaed', borderRadius: '6px', background: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#6b7280' }}
                      onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = '#eff6ff'; (e.currentTarget as HTMLElement).style.color = '#3b5bdb'; }}
                      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = '#fff'; (e.currentTarget as HTMLElement).style.color = '#6b7280'; }}>
                      <Pencil size={13} />
                    </button>
                    <button onClick={() => setDeleteId(c.id)} title="Delete"
                      style={{ width: '28px', height: '28px', border: '1px solid #e8eaed', borderRadius: '6px', background: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#6b7280' }}
                      onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = '#fef2f2'; (e.currentTarget as HTMLElement).style.color = '#ef4444'; }}
                      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = '#fff'; (e.currentTarget as HTMLElement).style.color = '#6b7280'; }}>
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* ── Pagination ── */}
        {totalPages > 1 && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '14px' }}>
            <span style={{ fontSize: '12px', color: '#9ca3af' }}>
              Showing {(page - 1) * ITEMS_PER_PAGE + 1}–{Math.min(page * ITEMS_PER_PAGE, filtered.length)} of {filtered.length}
            </span>
            <div style={{ display: 'flex', gap: '6px' }}>
              <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
                style={{ width: '30px', height: '30px', border: '1px solid #e8eaed', borderRadius: '7px', background: '#fff', cursor: page === 1 ? 'not-allowed' : 'pointer', opacity: page === 1 ? 0.4 : 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#374151' }}>
                <ChevronLeft size={14} />
              </button>
              {Array.from({ length: totalPages }, (_, i) => i + 1).map(p => (
                <button key={p} onClick={() => setPage(p)}
                  style={{ width: '30px', height: '30px', border: '1px solid', borderColor: page === p ? '#3b5bdb' : '#e8eaed', borderRadius: '7px', background: page === p ? '#3b5bdb' : '#fff', color: page === p ? '#fff' : '#374151', cursor: 'pointer', fontSize: '13px', fontWeight: page === p ? 600 : 400 }}>
                  {p}
                </button>
              ))}
              <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}
                style={{ width: '30px', height: '30px', border: '1px solid #e8eaed', borderRadius: '7px', background: '#fff', cursor: page === totalPages ? 'not-allowed' : 'pointer', opacity: page === totalPages ? 0.4 : 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#374151' }}>
                <ChevronRight size={14} />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ── Add / Edit Modal ── */}
      <AnimatePresence>
        {modalOpen && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 60, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px' }}
            onClick={closeModal}>
            <motion.div initial={{ opacity: 0, scale: 0.96, y: 12 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.96 }} transition={{ duration: 0.18 }}
              onClick={e => e.stopPropagation()}
              style={{ background: '#fff', borderRadius: '14px', width: '100%', maxWidth: '560px', overflow: 'hidden', boxShadow: '0 20px 60px rgba(0,0,0,0.18)' }}>

              {/* Modal header */}
              <div style={{ padding: '18px 22px', borderBottom: '1px solid #e8eaed', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <div style={{ width: '28px', height: '28px', background: '#3b5bdb', borderRadius: '7px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <BookOpen size={14} style={{ color: '#fff' }} />
                  </div>
                  <span style={{ fontSize: '15px', fontWeight: 700, color: '#0f0f23' }}>
                    {editId !== null ? 'Edit Course' : 'Add Course'}
                  </span>
                </div>
                <button onClick={closeModal} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9ca3af', display: 'flex' }}>
                  <X size={18} />
                </button>
              </div>

              {/* Modal body */}
              <div style={{ padding: '20px 22px', display: 'flex', flexDirection: 'column', gap: '14px', maxHeight: 'calc(90vh - 140px)', overflowY: 'auto' }}>

                <Field label="Course Name *">
                  <input value={form.name} onChange={e => pf('name', e.target.value)}
                    placeholder="e.g. Mathematics — Grade 8A"
                    style={INPUT}
                    onFocus={e => { e.currentTarget.style.borderColor = '#3b5bdb'; }}
                    onBlur={e => { e.currentTarget.style.borderColor = '#e0e0e0'; }} />
                </Field>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                  <Field label="Subject *">
                    <select value={form.subject} onChange={e => pf('subject', e.target.value)} style={SELECT}>
                      {SUBJECTS.map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </Field>
                  <Field label="Teacher *">
                    <select value={form.teacher} onChange={e => pf('teacher', e.target.value)} style={SELECT}>
                      {TEACHERS.map(t => <option key={t} value={t}>{t}</option>)}
                    </select>
                  </Field>
                </div>

                <Field label="Grade(s)">
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '7px' }}>
                    {GRADES.map(g => {
                      const active = form.grades.includes(g);
                      return (
                        <button key={g} type="button"
                          onClick={() => pf('grades', active ? form.grades.filter(x => x !== g) : [...form.grades, g])}
                          style={{ padding: '4px 12px', borderRadius: '6px', border: `1px solid ${active ? '#3b5bdb' : '#e0e0e0'}`, background: active ? '#eff6ff' : '#fff', color: active ? '#3b5bdb' : '#6b7280', fontSize: '12px', fontWeight: active ? 600 : 400, cursor: 'pointer' }}>
                          {g}
                        </button>
                      );
                    })}
                  </div>
                </Field>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                  <Field label="Period">
                    <select value={form.period} onChange={e => pf('period', e.target.value)} style={SELECT}>
                      {PERIODS.map(p => <option key={p} value={p}>{p}</option>)}
                    </select>
                  </Field>
                  <Field label="Room *">
                    <input value={form.room} onChange={e => pf('room', e.target.value)}
                      placeholder="e.g. Room 301"
                      style={INPUT}
                      onFocus={e => { e.currentTarget.style.borderColor = '#3b5bdb'; }}
                      onBlur={e => { e.currentTarget.style.borderColor = '#e0e0e0'; }} />
                  </Field>
                </div>

                <Field label="Weekdays">
                  <input value={form.weekdays} onChange={e => pf('weekdays', e.target.value)}
                    placeholder="e.g. Mon / Wed / Fri"
                    style={INPUT}
                    onFocus={e => { e.currentTarget.style.borderColor = '#3b5bdb'; }}
                    onBlur={e => { e.currentTarget.style.borderColor = '#e0e0e0'; }} />
                </Field>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                  <Field label="Enrolled Students">
                    <input type="number" min={0} value={form.students} onChange={e => pf('students', Number(e.target.value))}
                      style={INPUT}
                      onFocus={e => { e.currentTarget.style.borderColor = '#3b5bdb'; }}
                      onBlur={e => { e.currentTarget.style.borderColor = '#e0e0e0'; }} />
                  </Field>
                  <Field label="Max Capacity">
                    <input type="number" min={1} value={form.maxStudents} onChange={e => pf('maxStudents', Number(e.target.value))}
                      style={INPUT}
                      onFocus={e => { e.currentTarget.style.borderColor = '#3b5bdb'; }}
                      onBlur={e => { e.currentTarget.style.borderColor = '#e0e0e0'; }} />
                  </Field>
                </div>

                <Field label="Status">
                  <div style={{ display: 'flex', gap: '8px' }}>
                    {(['active', 'inactive'] as const).map(s => (
                      <button key={s} type="button" onClick={() => pf('status', s)}
                        style={{ padding: '5px 16px', borderRadius: '6px', border: `1px solid ${form.status === s ? '#3b5bdb' : '#e0e0e0'}`, background: form.status === s ? '#eff6ff' : '#fff', color: form.status === s ? '#3b5bdb' : '#6b7280', fontSize: '13px', fontWeight: form.status === s ? 600 : 400, cursor: 'pointer' }}>
                        {s === 'active' ? 'Active' : 'Inactive'}
                      </button>
                    ))}
                  </div>
                </Field>
              </div>

              {/* Modal footer */}
              <div style={{ padding: '14px 22px', borderTop: '1px solid #e8eaed', display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                <button onClick={closeModal}
                  style={{ padding: '8px 18px', border: '1px solid #e8eaed', borderRadius: '8px', background: '#fff', color: '#374151', fontSize: '13px', cursor: 'pointer' }}>
                  Cancel
                </button>
                <button onClick={saveForm} disabled={!form.name.trim() || !form.room.trim()}
                  style={{ padding: '8px 18px', border: 'none', borderRadius: '8px', background: form.name.trim() && form.room.trim() ? '#3b5bdb' : '#e5e7eb', color: form.name.trim() && form.room.trim() ? '#fff' : '#9ca3af', fontSize: '13px', fontWeight: 600, cursor: form.name.trim() && form.room.trim() ? 'pointer' : 'not-allowed', display: 'flex', alignItems: 'center', gap: '5px' }}>
                  <Check size={14} /> {editId !== null ? 'Save Changes' : 'Add Course'}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Delete confirm ── */}
      <AnimatePresence>
        {deleteId !== null && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 60, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
            onClick={() => setDeleteId(null)}>
            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }}
              onClick={e => e.stopPropagation()}
              style={{ background: '#fff', borderRadius: '14px', padding: '28px', maxWidth: '360px', width: '90%', textAlign: 'center', boxShadow: '0 20px 60px rgba(0,0,0,0.15)' }}>
              <div style={{ width: '48px', height: '48px', background: '#fef2f2', borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 14px' }}>
                <Trash2 size={22} style={{ color: '#ef4444' }} />
              </div>
              <div style={{ fontSize: '16px', fontWeight: 700, color: '#0f0f23', marginBottom: '6px' }}>Delete Course?</div>
              <div style={{ fontSize: '13px', color: '#6b7280', marginBottom: '20px' }}>
                This will permanently remove<br />
                <strong style={{ color: '#374151' }}>{courses.find(c => c.id === deleteId)?.name}</strong>
              </div>
              <div style={{ display: 'flex', gap: '8px', justifyContent: 'center' }}>
                <button onClick={() => setDeleteId(null)} style={{ padding: '8px 20px', border: '1px solid #e8eaed', borderRadius: '8px', background: '#fff', color: '#374151', fontSize: '13px', cursor: 'pointer' }}>Cancel</button>
                <button onClick={() => deleteCourse(deleteId!)} style={{ padding: '8px 20px', border: 'none', borderRadius: '8px', background: '#ef4444', color: '#fff', fontSize: '13px', fontWeight: 600, cursor: 'pointer' }}>Delete</button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </AdminLayout>
  );
}
