import { useState } from 'react';
import { Search, Plus, Trash2, Eye, ChevronLeft, ChevronRight, MoreVertical } from 'lucide-react';
import AdminLayout from '../../components/admin/AdminLayout';
import UserDetailModal from '../../components/admin/UserDetailModal';
import AddUserModal from '../../components/admin/AddUserModal';
import ResetPasswordModal from '../../components/admin/ResetPasswordModal';
import BatchDeleteModal from '../../components/admin/BatchDeleteModal';
import { AnimatePresence } from 'motion/react';

type UserType = 'student' | 'teacher';

interface Student {
  id: number; name: string; studentId: string; department: string; major: string;
  phone: string; idCard: string; registeredAt: string; lastLogin: string;
  accessibility?: 'not-reported' | 'yes' | 'no';
}
interface Teacher {
  id: number; name: string; employeeId: string; department: string;
  phone: string; idCard: string; registeredAt: string; lastLogin: string;
}

// ── K-12 school structure ──────────────────────────────────────────────────
const departments = [
  'Grade 7', 'Grade 8', 'Grade 9',
  'Grade 10', 'Grade 11', 'Grade 12',
];
const majors: Record<string, string[]> = {
  'Grade 7':  ['Class 7A', 'Class 7B', 'Class 7C', 'Class 7D'],
  'Grade 8':  ['Class 8A', 'Class 8B', 'Class 8C', 'Class 8D'],
  'Grade 9':  ['Class 9A', 'Class 9B', 'Class 9C', 'Class 9D'],
  'Grade 10': ['Class 10A', 'Class 10B', 'Class 10C'],
  'Grade 11': ['Class 11A', 'Class 11B', 'Class 11C'],
  'Grade 12': ['Class 12A', 'Class 12B', 'Class 12C'],
};

const STUDENT_NAMES = ['Li Ming', 'Wang Fang', 'Zhang Wei', 'Chen Jing', 'Liu Yang', 'Zhao Lei', 'Sun Mei', 'Zhou Gang', 'Wu Ting', 'Xu Dan'];
const TEACHER_NAMES = ['Ms. Sylvia', 'Mr. Brown', 'Ms. Liu', 'Mr. Wang', 'Ms. Zhang', 'Mr. Li', 'Ms. Chen', 'Mr. Chen'];
const TEACHER_SUBJECTS = ['Mathematics', 'English', 'Physics', 'History', 'Chinese', 'Physical Ed.', 'Biology', 'Chemistry'];

const mockStudents: Student[] = Array.from({ length: 50 }, (_, i) => ({
  id: i + 1,
  name: STUDENT_NAMES[i % STUDENT_NAMES.length],
  studentId: `2024${String(i + 1).padStart(4, '0')}`,
  department: departments[i % departments.length],
  major: majors[departments[i % departments.length]][i % 4 < majors[departments[i % departments.length]].length ? i % 4 : 0],
  phone: `138****${5678 + i}`,
  idCard: `110************${1234 + i}`,
  registeredAt: '2024-09-01 10:30:00',
  lastLogin: '2025-03-20 14:20:00',
  accessibility: i === 6 ? 'yes' : i % 10 === 5 ? 'no' : 'not-reported',
}));

const mockTeachers: Teacher[] = Array.from({ length: 20 }, (_, i) => ({
  id: i + 1,
  name: TEACHER_NAMES[i % TEACHER_NAMES.length],
  employeeId: `T2024${String(i + 1).padStart(3, '0')}`,
  department: TEACHER_SUBJECTS[i % TEACHER_SUBJECTS.length],
  phone: `139****${1234 + i}`,
  idCard: `110************${5678 + i}`,
  registeredAt: '2024-08-01 09:00:00',
  lastLogin: '2025-03-25 16:45:00',
}));

const ITEMS = 20;

export default function UsersManagement() {
  const [userType, setUserType] = useState<UserType>('student');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedDept, setSelectedDept] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [showResetPasswordModal, setShowResetPasswordModal] = useState(false);
  const [showBatchDeleteModal, setShowBatchDeleteModal] = useState(false);
  const [selectedUser, setSelectedUser] = useState<Student | Teacher | null>(null);
  const [isEditing, setIsEditing] = useState(false);

  const [newStudentData, setNewStudentData] = useState({ name: '', studentId: '', department: '', major: '', phone: '', idCard: '', password: '' });
  const [newTeacherData, setNewTeacherData] = useState({ name: '', employeeId: '', department: '', phone: '', idCard: '', password: '' });

  const currentData = userType === 'student' ? mockStudents : mockTeachers;
  const filtered = currentData.filter(item => {
    const q = searchQuery.toLowerCase();
    return (
      (!q || item.name.includes(searchQuery) || ('studentId' in item && item.studentId.includes(searchQuery)) || ('employeeId' in item && item.employeeId.includes(searchQuery))) &&
      (!selectedDept || item.department === selectedDept)
    );
  });
  const totalPages = Math.ceil(filtered.length / ITEMS);
  const paginated = filtered.slice((currentPage - 1) * ITEMS, currentPage * ITEMS);

  const handleAddUser = () => {
    if (userType === 'student') {
      if (!newStudentData.name || !newStudentData.studentId || !newStudentData.department || !newStudentData.major) { alert('Please fill in all required fields.'); return; }
      alert('Student added successfully!');
    } else {
      if (!newTeacherData.name || !newTeacherData.employeeId || !newTeacherData.department) { alert('Please fill in all required fields.'); return; }
      alert('Teacher added successfully!');
    }
    setShowAddModal(false);
    setNewStudentData({ name: '', studentId: '', department: '', major: '', phone: '', idCard: '', password: '' });
    setNewTeacherData({ name: '', employeeId: '', department: '', phone: '', idCard: '', password: '' });
  };

  const confirmResetPassword = () => {
    const def = userType === 'student' ? 'last 6 digits of student ID' : 'last 6 digits of employee ID';
    if (confirm(`Reset this user's password to the ${def}?`)) { alert('Password reset successfully!'); setShowResetPasswordModal(false); }
  };

  return (
    <AdminLayout>
      <div style={{ padding: '32px 40px', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' }}>
        {/* 标题栏 */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '24px' }}>
          <h1 style={{ fontSize: '22px', fontWeight: 600, color: '#0f0f23' }}>User Management</h1>
          <div style={{ display: 'flex', gap: '8px' }}>
            {selectedIds.length > 0 && (
              <button
                onClick={() => { if (selectedIds.length > 100) { alert('Maximum 100 users per batch.'); return; } setShowBatchDeleteModal(true); }}
                style={{ padding: '8px 14px', borderRadius: '8px', border: '1px solid #fecaca', background: '#fef2f2', color: '#dc2626', fontSize: '13.5px', fontWeight: 500, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}
              >
                <Trash2 size={14} /> Delete Selected ({selectedIds.length})
              </button>
            )}
            <button
              onClick={() => setShowAddModal(true)}
              style={{ padding: '8px 16px', borderRadius: '8px', border: 'none', background: '#0f0f23', color: '#ffffff', fontSize: '13.5px', fontWeight: 500, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', transition: 'background 0.15s' }}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = '#1f1f3a'; }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = '#0f0f23'; }}
            >
              <Plus size={14} /> Add {userType === 'student' ? 'Student' : 'Teacher'}
            </button>
          </div>
        </div>

        {/* 类型切换标签 */}
        <div style={{ display: 'flex', background: '#f3f4f6', borderRadius: '8px', padding: '3px', marginBottom: '18px', gap: '3px', width: 'fit-content' }}>
          {(['student', 'teacher'] as UserType[]).map(t => (
            <button
              key={t}
              onClick={() => { setUserType(t); setCurrentPage(1); setSelectedIds([]); setSearchQuery(''); setSelectedDept(''); }}
              style={{
                padding: '6px 16px', borderRadius: '6px', border: 'none', cursor: 'pointer',
                fontSize: '13.5px', fontWeight: userType === t ? 500 : 400,
                background: userType === t ? '#ffffff' : 'transparent',
                color: userType === t ? '#0f0f23' : '#6b7280',
                boxShadow: userType === t ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
                transition: 'all 0.15s',
              }}
            >
              {t === 'student' ? `Students (${mockStudents.length})` : `Teachers (${mockTeachers.length})`}
            </button>
          ))}
        </div>

        {/* 搜索 + 筛选 */}
        <div style={{ display: 'flex', gap: '10px', marginBottom: '16px', alignItems: 'center' }}>
          <div style={{ position: 'relative', flex: 1, maxWidth: '300px' }}>
            <Search size={14} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: '#9ca3af' }} />
            <input
              value={searchQuery}
              onChange={e => { setSearchQuery(e.target.value); setCurrentPage(1); }}
              placeholder={`Search name, ${userType === 'student' ? 'student ID' : 'employee ID'}…`}
              style={{ width: '100%', padding: '8px 12px 8px 32px', border: '1px solid #e5e7eb', borderRadius: '8px', fontSize: '13.5px', color: '#374151', outline: 'none', background: '#fafafa', boxSizing: 'border-box' }}
              onFocus={e => { e.currentTarget.style.borderColor = '#3b5bdb'; e.currentTarget.style.background = '#fff'; }}
              onBlur={e => { e.currentTarget.style.borderColor = '#e5e7eb'; e.currentTarget.style.background = '#fafafa'; }}
            />
          </div>
          <select
            value={selectedDept}
            onChange={e => { setSelectedDept(e.target.value); setCurrentPage(1); }}
            style={{ padding: '8px 12px', border: '1px solid #e5e7eb', borderRadius: '8px', fontSize: '13.5px', color: '#374151', outline: 'none', background: '#fafafa', cursor: 'pointer', appearance: 'none' }}
          >
            <option value="">All Faculties</option>
            {departments.map(d => <option key={d} value={d}>{d}</option>)}
          </select>
        </div>

        {/* 用户列表 */}
        <div style={{ border: '1px solid #e8eaed', borderRadius: '10px', overflow: 'hidden', background: '#fff' }}>
          {/* 表头 */}
          <div style={{ display: 'flex', alignItems: 'center', padding: '10px 20px', background: '#fafafa', borderBottom: '1px solid #f0f0f0' }}>
            <input
              type="checkbox"
              checked={selectedIds.length === paginated.length && paginated.length > 0}
              onChange={() => { if (selectedIds.length === paginated.length) setSelectedIds([]); else setSelectedIds(paginated.map(i => i.id)); }}
              style={{ width: '14px', height: '14px', cursor: 'pointer', marginRight: '16px' }}
            />
            <span style={{ fontSize: '12px', color: '#9ca3af' }}>
              {filtered.length} {userType === 'student' ? 'student' : 'teacher'}{filtered.length !== 1 ? 's' : ''}{selectedIds.length > 0 && ` · ${selectedIds.length} selected`}
            </span>
          </div>

          {paginated.length === 0 ? (
            <div style={{ padding: '60px', textAlign: 'center', color: '#9ca3af', fontSize: '14px' }}>No records found</div>
          ) : (
            paginated.map((item, idx) => (
              <div
                key={item.id}
                style={{
                  display: 'flex', alignItems: 'center', padding: '13px 20px',
                  borderBottom: idx < paginated.length - 1 ? '1px solid #f5f5f5' : 'none',
                  transition: 'background 0.1s', cursor: 'default',
                }}
                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = '#fafafa'; }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
              >
                <input
                  type="checkbox"
                  checked={selectedIds.includes(item.id)}
                  onChange={() => setSelectedIds(prev => prev.includes(item.id) ? prev.filter(i => i !== item.id) : [...prev, item.id])}
                  style={{ width: '14px', height: '14px', cursor: 'pointer', marginRight: '16px', flexShrink: 0 }}
                  onClick={e => e.stopPropagation()}
                />

                {/* 序号/头像占位 */}
                <div style={{ width: '32px', height: '32px', borderRadius: '50%', background: '#eef2ff', display: 'flex', alignItems: 'center', justifyContent: 'center', marginRight: '12px', flexShrink: 0 }}>
                  <span style={{ fontSize: '12px', fontWeight: 600, color: '#3b5bdb' }}>{item.name[0]}</span>
                </div>

                {/* 主要信息 */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '2px' }}>
                    <span style={{ fontSize: '14px', fontWeight: 500, color: '#0f0f23' }}>{item.name}</span>
                    <span style={{ fontSize: '12px', color: '#9ca3af', fontFamily: 'monospace' }}>{'studentId' in item ? item.studentId : item.employeeId}</span>
                  </div>
                  <span style={{ fontSize: '12px', color: '#9ca3af' }}>
                    {item.department}{userType === 'student' && 'major' in item ? ` · ${'major' in item ? item.major : ''}` : ''}
                  </span>
                </div>

                {/* 手机号 */}
                <span style={{ fontSize: '13px', color: '#6b7280', marginRight: '20px', flexShrink: 0 }}>{item.phone}</span>

                {/* 操作 */}
                <button
                  onClick={() => { setSelectedUser(item); setIsEditing(false); setShowDetailModal(true); }}
                  style={{ padding: '5px 12px', borderRadius: '6px', border: '1px solid #e5e7eb', background: '#fff', color: '#374151', fontSize: '13px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '5px', flexShrink: 0, transition: 'all 0.1s' }}
                  onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = '#f9fafb'; (e.currentTarget as HTMLElement).style.borderColor = '#d1d5db'; }}
                  onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = '#fff'; (e.currentTarget as HTMLElement).style.borderColor = '#e5e7eb'; }}
                >
                  <Eye size={13} /> View
                </button>
              </div>
            ))
          )}
        </div>

        {/* 分页 */}
        {totalPages > 1 && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '16px' }}>
            <span style={{ fontSize: '13px', color: '#9ca3af' }}>{filtered.length} record{filtered.length !== 1 ? 's' : ''}</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
              <PgBtn disabled={currentPage === 1} onClick={() => setCurrentPage(p => Math.max(1, p - 1))}><ChevronLeft size={14} /></PgBtn>
              {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                const pg = totalPages <= 5 ? i + 1 : currentPage <= 3 ? i + 1 : currentPage >= totalPages - 2 ? totalPages - 4 + i : currentPage - 2 + i;
                return <PgBtn key={pg} active={currentPage === pg} onClick={() => setCurrentPage(pg)}>{pg}</PgBtn>;
              })}
              <PgBtn disabled={currentPage === totalPages} onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}><ChevronRight size={14} /></PgBtn>
            </div>
          </div>
        )}
      </div>

      <AddUserModal isOpen={showAddModal} onClose={() => setShowAddModal(false)} userType={userType} studentData={newStudentData} teacherData={newTeacherData} onStudentDataChange={setNewStudentData} onTeacherDataChange={setNewTeacherData} onSubmit={handleAddUser} departments={departments} majors={majors} />
      {showDetailModal && selectedUser && (
        <UserDetailModal isOpen={showDetailModal} onClose={() => { setShowDetailModal(false); setIsEditing(false); }} user={selectedUser} userType={userType} isEditing={isEditing} onEdit={() => setIsEditing(true)} onCancelEdit={() => setIsEditing(false)} onSave={() => { alert('Saved successfully!'); setShowDetailModal(false); setIsEditing(false); }} onResetPassword={(u) => { setSelectedUser(u); setShowResetPasswordModal(true); }} departments={departments} majors={majors} />
      )}
      <ResetPasswordModal isOpen={showResetPasswordModal} onClose={() => setShowResetPasswordModal(false)} onConfirm={confirmResetPassword} userType={userType} />
      <BatchDeleteModal isOpen={showBatchDeleteModal} onClose={() => setShowBatchDeleteModal(false)} onConfirm={() => { alert(`Successfully deleted ${selectedIds.length} user(s).`); setSelectedIds([]); setShowBatchDeleteModal(false); }} selectedUsers={currentData.filter(u => selectedIds.includes(u.id))} userType={userType} />
    </AdminLayout>
  );
}

function PgBtn({ children, onClick, disabled, active }: { children: React.ReactNode; onClick?: () => void; disabled?: boolean; active?: boolean }) {
  return (
    <button onClick={onClick} disabled={disabled} style={{ width: '32px', height: '32px', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '7px', border: `1px solid ${active ? '#3b5bdb' : '#e5e7eb'}`, background: active ? '#3b5bdb' : '#fff', color: active ? '#fff' : disabled ? '#d1d5db' : '#374151', fontSize: '13px', fontWeight: active ? 600 : 400, cursor: disabled ? 'not-allowed' : 'pointer', transition: 'all 0.1s' }}>
      {children}
    </button>
  );
}