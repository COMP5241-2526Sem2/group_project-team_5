import { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { X, BookOpen, FileText, Calendar, Users, MapPin, Settings, Save, Plus, GraduationCap, Trash2, Info } from 'lucide-react';

interface Course {
  id?: number;
  code: string; name: string; teacher: string; teacherId: string;
  department: string; credits: number; hours: number;
  maxStudents: number; currentStudents: number; semester: string;
  startDate: string; endDate: string; classTime: string; location: string;
  description: string; syllabus: string;
  status: 'not_open' | 'enrolling' | 'in_progress' | 'ended';
  isPublic: boolean; autoStatusManage: boolean;
}

interface MajorRequirement {
  id: number;
  majorId: number;
  majorName: string;
  type: 'mandatory' | 'elective';
}

interface AddEditCourseModalProps {
  isOpen: boolean; onClose: () => void; onSave: () => void;
  isEditMode: boolean; formData: Partial<Course>; onFormDataChange: (data: Partial<Course>) => void;
  departments: string[]; semesters: string[]; teachers: { id: string; name: string }[];
}

const MAJORS_LIST = [
  { id: 1, name: 'Software Engineering' },
  { id: 2, name: 'Computer Science' },
  { id: 3, name: 'Data Science' },
  { id: 4, name: 'Artificial Intelligence' },
  { id: 5, name: 'Electronic Engineering' },
  { id: 6, name: 'Business Administration' },
];

let reqIdCounter = 100;

export default function AddEditCourseModal({
  isOpen, onClose, onSave, isEditMode, formData, onFormDataChange, departments, semesters, teachers,
}: AddEditCourseModalProps) {
  const [majorReqs, setMajorReqs] = useState<MajorRequirement[]>([]);
  const [addingRow, setAddingRow] = useState(false);
  const [newMajorId, setNewMajorId] = useState('');
  const [newType, setNewType] = useState<'mandatory' | 'elective'>('mandatory');

  useEffect(() => {
    if (isOpen) {
      setMajorReqs(isEditMode ? [
        { id: 1, majorId: 1, majorName: 'Software Engineering', type: 'mandatory' },
        { id: 2, majorId: 2, majorName: 'Computer Science',     type: 'elective' },
        { id: 3, majorId: 3, majorName: 'Data Science',         type: 'elective' },
      ] : []);
      setAddingRow(false);
      setNewMajorId('');
      setNewType('mandatory');
    }
  }, [isOpen, isEditMode]);

  if (!isOpen) return null;

  const handleAddMajorReq = () => {
    if (!newMajorId) return;
    const major = MAJORS_LIST.find(m => m.id === Number(newMajorId));
    if (!major) return;
    if (majorReqs.find(r => r.majorId === major.id)) return;
    setMajorReqs(prev => [...prev, { id: ++reqIdCounter, majorId: major.id, majorName: major.name, type: newType }]);
    setAddingRow(false);
    setNewMajorId('');
    setNewType('mandatory');
  };

  const inputCls = "w-full px-4 py-3 border-2 border-gray-200 rounded-xl text-gray-800 focus:border-blue-500 focus:ring-4 focus:ring-blue-500/20 focus:outline-none transition-all";
  const selectCls = inputCls + " appearance-none cursor-pointer";

  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 bg-black/60 backdrop-blur-md flex items-center justify-center z-50 p-4"
      onClick={onClose}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 20 }} animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ duration: 0.3, ease: 'easeOut' }}
        onClick={e => e.stopPropagation()}
        className="bg-white rounded-3xl shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-hidden"
      >
        {/* Header */}
        <div className="relative bg-gradient-to-br from-blue-600 via-indigo-600 to-purple-600 px-8 py-6 text-white overflow-hidden">
          <div className="absolute top-0 right-0 w-64 h-64 bg-white/10 rounded-full -mr-32 -mt-32" />
          <div className="absolute bottom-0 left-0 w-48 h-48 bg-white/10 rounded-full -ml-24 -mb-24" />
          <div className="relative z-10 flex items-center justify-between">
            <div className="flex items-center gap-4">
              <motion.div whileHover={{ rotate: 360 }} transition={{ duration: 0.6 }}
                className="w-16 h-16 bg-white/20 backdrop-blur-md rounded-2xl flex items-center justify-center shadow-lg">
                <BookOpen className="w-8 h-8" />
              </motion.div>
              <div>
                <h3 className="text-2xl font-bold mb-1">{isEditMode ? 'Edit Course' : 'Add Course'}</h3>
                <p className="text-sm text-white/80">Fill in the course details</p>
              </div>
            </div>
            <motion.button whileHover={{ scale: 1.1, rotate: 90 }} whileTap={{ scale: 0.9 }} onClick={onClose}
              className="w-10 h-10 bg-white/20 backdrop-blur-md rounded-xl flex items-center justify-center hover:bg-white/30 transition-all">
              <X className="w-5 h-5" />
            </motion.button>
          </div>
        </div>

        {/* Form body */}
        <div className="p-8 space-y-6 max-h-[calc(90vh-180px)] overflow-y-auto">

          {/* Basic Information */}
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
            <div className="flex items-center gap-2 text-blue-600 font-semibold mb-4">
              <FileText className="w-5 h-5" /><span>Basic Information</span>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="flex items-center gap-2 text-sm font-medium text-gray-700 mb-2"><span className="text-blue-600">●</span>Course Code <span className="text-red-500">*</span></label>
                <input type="text" value={formData.code || ''} onChange={e => onFormDataChange({ ...formData, code: e.target.value })} placeholder="e.g. CS101" className={inputCls} />
              </div>
              <div>
                <label className="flex items-center gap-2 text-sm font-medium text-gray-700 mb-2"><span className="text-purple-600">●</span>Course Name <span className="text-red-500">*</span></label>
                <input type="text" value={formData.name || ''} onChange={e => onFormDataChange({ ...formData, name: e.target.value })} placeholder="Data Structures & Algorithms" className={inputCls} />
              </div>
              <div>
                <label className="flex items-center gap-2 text-sm font-medium text-gray-700 mb-2"><span className="text-green-600">●</span>Instructor <span className="text-red-500">*</span></label>
                <select value={formData.teacherId || ''} onChange={e => { const t = teachers.find(t => t.id === e.target.value); onFormDataChange({ ...formData, teacherId: e.target.value, teacher: t?.name || '' }); }} className={selectCls}>
                  <option value="">Select instructor</option>
                  {teachers.map(t => <option key={t.id} value={t.id}>{t.name} ({t.id})</option>)}
                </select>
              </div>
              <div>
                <label className="flex items-center gap-2 text-sm font-medium text-gray-700 mb-2"><span className="text-orange-600">●</span>Faculty <span className="text-red-500">*</span></label>
                <select value={formData.department || ''} onChange={e => onFormDataChange({ ...formData, department: e.target.value })} className={selectCls}>
                  <option value="">Select faculty</option>
                  {departments.map(d => <option key={d} value={d}>{d}</option>)}
                </select>
              </div>
              <div>
                <label className="flex items-center gap-2 text-sm font-medium text-gray-700 mb-2"><span className="text-pink-600">●</span>Credits</label>
                <input type="number" value={formData.credits || 3} onChange={e => onFormDataChange({ ...formData, credits: Number(e.target.value) })} min="1" max="10" className={inputCls} />
              </div>
              <div>
                <label className="flex items-center gap-2 text-sm font-medium text-gray-700 mb-2"><span className="text-indigo-600">●</span>Teaching Hours</label>
                <input type="number" value={formData.hours || 48} onChange={e => onFormDataChange({ ...formData, hours: Number(e.target.value) })} min="1" max="200" className={inputCls} />
              </div>
            </div>
          </motion.div>

          {/* Schedule & Location */}
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
            <div className="flex items-center gap-2 text-purple-600 font-semibold mb-4">
              <Calendar className="w-5 h-5" /><span>Schedule & Location</span>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="flex items-center gap-2 text-sm font-medium text-gray-700 mb-2"><span className="text-blue-600">●</span>Semester <span className="text-red-500">*</span></label>
                <select value={formData.semester || ''} onChange={e => onFormDataChange({ ...formData, semester: e.target.value })} className={selectCls}>
                  <option value="">Select semester</option>
                  {semesters.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <div>
                <label className="flex items-center gap-2 text-sm font-medium text-gray-700 mb-2"><span className="text-purple-600">●</span>Class Time</label>
                <input type="text" value={formData.classTime || ''} onChange={e => onFormDataChange({ ...formData, classTime: e.target.value })} placeholder="Mon 1-2, Wed 3-4" className={inputCls} />
              </div>
              <div>
                <label className="flex items-center gap-2 text-sm font-medium text-gray-700 mb-2"><span className="text-green-600">●</span>Start Date</label>
                <input type="date" value={formData.startDate || ''} onChange={e => onFormDataChange({ ...formData, startDate: e.target.value })} className={inputCls} />
              </div>
              <div>
                <label className="flex items-center gap-2 text-sm font-medium text-gray-700 mb-2"><span className="text-orange-600">●</span>End Date</label>
                <input type="date" value={formData.endDate || ''} onChange={e => onFormDataChange({ ...formData, endDate: e.target.value })} className={inputCls} />
              </div>
              <div className="col-span-2">
                <label className="flex items-center gap-2 text-sm font-medium text-gray-700 mb-2"><span className="text-pink-600">●</span>Location</label>
                <div className="relative">
                  <MapPin className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                  <input type="text" value={formData.location || ''} onChange={e => onFormDataChange({ ...formData, location: e.target.value })} placeholder="Building A, Room 301" className="w-full pl-12 pr-4 py-3 border-2 border-gray-200 rounded-xl text-gray-800 focus:border-blue-500 focus:ring-4 focus:ring-blue-500/20 focus:outline-none transition-all" />
                </div>
              </div>
            </div>
          </motion.div>

          {/* Enrollment Settings */}
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}>
            <div className="flex items-center gap-2 text-green-600 font-semibold mb-4">
              <Users className="w-5 h-5" /><span>Enrollment Settings</span>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2">
                <label className="flex items-center gap-2 text-sm font-medium text-gray-700 mb-2"><span className="text-blue-600">●</span>Enrollment Cap</label>
                <input type="number" value={formData.maxStudents || 60} onChange={e => onFormDataChange({ ...formData, maxStudents: Number(e.target.value) })} min="1" max="500" className={inputCls} />
              </div>
            </div>
            {/* System-wide time notice */}
            <div style={{ marginTop: '14px', display: 'flex', gap: '10px', padding: '12px 14px', background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: '10px', alignItems: 'flex-start' }}>
              <Info size={15} style={{ color: '#3b5bdb', flexShrink: 0, marginTop: '1px' }} />
              <div>
                <p style={{ fontSize: '13px', color: '#1e40af', fontWeight: 600, margin: '0 0 3px' }}>Selection times are managed system-wide</p>
                <p style={{ fontSize: '13px', color: '#3b82f6', margin: 0 }}>
                  Individual courses no longer set their own enrollment times. All course selection follows the unified two-round schedule configured in{' '}
                  <span style={{ fontWeight: 600, textDecoration: 'underline', cursor: 'pointer' }}>System Settings → Selection Time Management</span>.
                </p>
              </div>
            </div>
          </motion.div>

          {/* Course Description */}
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }}>
            <div className="flex items-center gap-2 text-orange-600 font-semibold mb-4">
              <FileText className="w-5 h-5" /><span>Course Description</span>
            </div>
            <textarea value={formData.description || ''} onChange={e => onFormDataChange({ ...formData, description: e.target.value })} placeholder="Enter course description…" rows={3} className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl text-gray-800 focus:border-blue-500 focus:ring-4 focus:ring-blue-500/20 focus:outline-none transition-all resize-none" />
          </motion.div>

          {/* Status Settings */}
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.5 }}>
            <div className="flex items-center gap-2 text-indigo-600 font-semibold mb-4">
              <Settings className="w-5 h-5" /><span>Status Settings</span>
            </div>
            <div className="space-y-4">
              <div>
                <label className="flex items-center gap-2 text-sm font-medium text-gray-700 mb-2"><span className="text-indigo-600">●</span>Course Status <span className="text-red-500">*</span></label>
                <select
                  value={formData.status || 'not_open'}
                  onChange={e => onFormDataChange({ ...formData, status: e.target.value as Course['status'] })}
                  className={selectCls}
                >
                  <option value="not_open">Not Open</option>
                  <option value="enrolling">Open for Enrollment</option>
                  <option value="in_progress">In Progress</option>
                  <option value="ended">Ended</option>
                </select>
              </div>
              <div className="space-y-3">
                <label className="flex items-center gap-3 cursor-pointer">
                  <input type="checkbox" checked={formData.isPublic || false} onChange={e => onFormDataChange({ ...formData, isPublic: e.target.checked })} className="w-5 h-5 rounded border-gray-300 text-blue-600 focus:ring-blue-500 cursor-pointer" />
                  <div>
                    <span className="text-sm text-gray-700 font-medium">Public course</span>
                    <p className="text-xs text-gray-400 mt-0.5">Visible to students in the course catalog</p>
                  </div>
                </label>
                <label className="flex items-center gap-3 cursor-pointer">
                  <input type="checkbox" checked={formData.autoStatusManage || false} onChange={e => onFormDataChange({ ...formData, autoStatusManage: e.target.checked })} className="w-5 h-5 rounded border-gray-300 text-blue-600 focus:ring-blue-500 cursor-pointer" />
                  <div>
                    <span className="text-sm text-gray-700 font-medium">Auto status management</span>
                    <p className="text-xs text-gray-400 mt-0.5">Automatically transition status based on system enrollment schedule</p>
                  </div>
                </label>
              </div>
            </div>
          </motion.div>

          {/* ── Major Requirements (new section) ── */}
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.6 }}>
            <div style={{ borderTop: '1px solid #f3f4f6', paddingTop: '20px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#7c3aed', fontWeight: 600, fontSize: '15px' }}>
                  <GraduationCap size={18} style={{ color: '#7c3aed' }} />
                  <span>Major Requirements</span>
                  {majorReqs.length > 0 && (
                    <span style={{ fontSize: '12px', fontWeight: 500, background: '#ede9fe', color: '#7c3aed', padding: '2px 8px', borderRadius: '20px' }}>
                      {majorReqs.length}
                    </span>
                  )}
                </div>
                {!addingRow && (
                  <button
                    type="button"
                    onClick={() => setAddingRow(true)}
                    style={{ display: 'flex', alignItems: 'center', gap: '5px', padding: '6px 12px', borderRadius: '7px', border: '1px solid #e5e7eb', background: 'white', color: '#374151', fontSize: '13px', cursor: 'pointer', fontWeight: 500, transition: 'all 0.15s' }}
                    onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = '#f9fafb'; (e.currentTarget as HTMLElement).style.borderColor = '#d1d5db'; }}
                    onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'white'; (e.currentTarget as HTMLElement).style.borderColor = '#e5e7eb'; }}
                  >
                    <Plus size={13} /> Add Major Mapping
                  </button>
                )}
              </div>

              {/* Inline add row */}
              {addingRow && (
                <div style={{ display: 'flex', gap: '8px', marginBottom: '12px', padding: '10px 12px', background: '#f5f3ff', borderRadius: '8px', border: '1px solid #ddd6fe', alignItems: 'center', flexWrap: 'wrap' }}>
                  <select
                    value={newMajorId}
                    onChange={e => setNewMajorId(e.target.value)}
                    style={{ flex: 1, minWidth: '160px', padding: '7px 10px', border: '1px solid #e5e7eb', borderRadius: '6px', fontSize: '13px', background: 'white', outline: 'none', cursor: 'pointer' }}
                  >
                    <option value="">Select Major</option>
                    {MAJORS_LIST.filter(m => !majorReqs.find(r => r.majorId === m.id)).map(m => (
                      <option key={m.id} value={m.id}>{m.name}</option>
                    ))}
                  </select>
                  <select
                    value={newType}
                    onChange={e => setNewType(e.target.value as 'mandatory' | 'elective')}
                    style={{ width: '130px', padding: '7px 10px', border: '1px solid #e5e7eb', borderRadius: '6px', fontSize: '13px', background: 'white', outline: 'none', cursor: 'pointer' }}
                  >
                    <option value="mandatory">Mandatory</option>
                    <option value="elective">Elective</option>
                  </select>
                  <button
                    type="button" onClick={handleAddMajorReq} disabled={!newMajorId}
                    style={{ padding: '7px 16px', borderRadius: '6px', border: 'none', background: newMajorId ? '#3b5bdb' : '#c4b5fd', color: 'white', fontSize: '13px', cursor: newMajorId ? 'pointer' : 'not-allowed', fontWeight: 600 }}
                  >
                    Confirm
                  </button>
                  <button
                    type="button" onClick={() => { setAddingRow(false); setNewMajorId(''); setNewType('mandatory'); }}
                    style={{ padding: '7px 12px', borderRadius: '6px', border: '1px solid #e5e7eb', background: 'white', color: '#6b7280', fontSize: '13px', cursor: 'pointer' }}
                  >
                    Cancel
                  </button>
                </div>
              )}

              {/* Requirements table */}
              {majorReqs.length > 0 ? (
                <div style={{ border: '1px solid #e5e7eb', borderRadius: '10px', overflow: 'hidden' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr style={{ background: '#fafafa' }}>
                        <th style={{ padding: '10px 16px', textAlign: 'left', fontSize: '11px', fontWeight: 600, color: '#9ca3af', letterSpacing: '0.06em', textTransform: 'uppercase' }}>Major</th>
                        <th style={{ padding: '10px 16px', textAlign: 'left', fontSize: '11px', fontWeight: 600, color: '#9ca3af', letterSpacing: '0.06em', textTransform: 'uppercase' }}>Type</th>
                        <th style={{ padding: '10px 16px', textAlign: 'right', fontSize: '11px', fontWeight: 600, color: '#9ca3af', letterSpacing: '0.06em', textTransform: 'uppercase' }}>Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {majorReqs.map(req => (
                        <tr key={req.id} style={{ borderTop: '1px solid #f3f4f6' }}>
                          <td style={{ padding: '11px 16px', fontSize: '14px', color: '#374151', fontWeight: 500 }}>{req.majorName}</td>
                          <td style={{ padding: '11px 16px' }}>
                            <select
                              value={req.type}
                              onChange={e => setMajorReqs(prev => prev.map(r => r.id === req.id ? { ...r, type: e.target.value as 'mandatory' | 'elective' } : r))}
                              style={{
                                padding: '4px 10px', borderRadius: '6px',
                                border: `1px solid ${req.type === 'mandatory' ? '#bfdbfe' : '#bbf7d0'}`,
                                background: req.type === 'mandatory' ? '#eff6ff' : '#f0fdf4',
                                color: req.type === 'mandatory' ? '#1d4ed8' : '#15803d',
                                fontSize: '13px', fontWeight: 500, outline: 'none', cursor: 'pointer',
                              }}
                            >
                              <option value="mandatory">Mandatory</option>
                              <option value="elective">Elective</option>
                            </select>
                          </td>
                          <td style={{ padding: '11px 16px', textAlign: 'right' }}>
                            <button
                              type="button"
                              onClick={() => setMajorReqs(prev => prev.filter(r => r.id !== req.id))}
                              style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '4px 10px', borderRadius: '5px', border: '1px solid #fee2e2', background: '#fff5f5', color: '#ef4444', fontSize: '12px', cursor: 'pointer', transition: 'background 0.1s' }}
                              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = '#fee2e2'; }}
                              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = '#fff5f5'; }}
                            >
                              <Trash2 size={12} /> Remove
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : !addingRow && (
                <div style={{ padding: '28px', border: '1.5px dashed #e5e7eb', borderRadius: '10px', textAlign: 'center', background: '#fafafa' }}>
                  <GraduationCap size={22} style={{ color: '#d1d5db', margin: '0 auto 8px' }} />
                  <p style={{ color: '#9ca3af', fontSize: '13px', margin: 0 }}>No major requirements configured yet.</p>
                  <p style={{ color: '#c4b5fd', fontSize: '13px', margin: '4px 0 0', cursor: 'pointer' }} onClick={() => setAddingRow(true)}>+ Add Major Mapping</p>
                </div>
              )}
            </div>
          </motion.div>
        </div>

        {/* Footer */}
        <div className="border-t border-gray-200 px-8 py-4 bg-gray-50 flex gap-3 justify-end rounded-b-3xl">
          <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }} onClick={onClose}
            className="px-6 py-2.5 border-2 border-gray-300 text-gray-700 rounded-xl hover:bg-white hover:border-gray-400 transition-all font-medium">
            Cancel
          </motion.button>
          <motion.button
            whileHover={{ scale: 1.02, boxShadow: '0 10px 40px -10px rgba(79,70,229,0.5)' }} whileTap={{ scale: 0.98 }}
            onClick={onSave}
            className="px-6 py-2.5 bg-gradient-to-r from-blue-600 to-purple-600 text-white rounded-xl shadow-lg font-medium flex items-center gap-2">
            <Save className="w-4 h-4" /><span>Save</span>
          </motion.button>
        </div>
      </motion.div>
    </motion.div>
  );
}