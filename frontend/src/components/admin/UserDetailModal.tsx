import { motion } from 'motion/react';
import { X, GraduationCap, Briefcase, Building2, Eye, CreditCard, Phone, CheckCircle2, AlertTriangle, Clock } from 'lucide-react';

interface Student {
  id: number;
  name: string;
  studentId: string;
  department: string;
  major: string;
  phone: string;
  idCard: string;
  registeredAt: string;
  lastLogin: string;
  accessibility?: 'not-reported' | 'yes' | 'no';
}

interface Teacher {
  id: number;
  name: string;
  employeeId: string;
  department: string;
  phone: string;
  idCard: string;
  registeredAt: string;
  lastLogin: string;
}

type UserType = 'student' | 'teacher';

interface UserDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  user: Student | Teacher;
  userType: UserType;
  isEditing: boolean;
  onEdit: () => void;
  onCancelEdit: () => void;
  onSave: () => void;
  onResetPassword: (user: Student | Teacher) => void;
  departments: string[];
  majors: Record<string, string[]>;
}

export default function UserDetailModal({
  isOpen,
  onClose,
  user,
  userType,
  isEditing,
  onEdit,
  onCancelEdit,
  onSave,
  onResetPassword,
  departments,
  majors,
}: UserDetailModalProps) {
  if (!isOpen) return null;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 bg-black/60 backdrop-blur-md flex items-center justify-center z-50 p-4"
      onClick={onClose}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ duration: 0.3, ease: "easeOut" }}
        onClick={(e) => e.stopPropagation()}
        className="bg-white rounded-3xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-hidden"
      >
        {/* 头部 - 带渐变背景 */}
        <div className="relative bg-gradient-to-br from-blue-600 via-purple-600 to-pink-600 px-8 py-6 text-white overflow-hidden">
          <div className="absolute top-0 right-0 w-64 h-64 bg-white/10 rounded-full -mr-32 -mt-32"></div>
          <div className="absolute bottom-0 left-0 w-48 h-48 bg-white/10 rounded-full -ml-24 -mb-24"></div>

          <div className="relative z-10 flex items-center justify-between">
            <div className="flex items-center gap-4">
              <motion.div
                whileHover={{ rotate: 360 }}
                transition={{ duration: 0.6 }}
                className="w-16 h-16 bg-white/20 backdrop-blur-md rounded-2xl flex items-center justify-center shadow-lg"
              >
                {userType === 'student' ? (
                  <GraduationCap className="w-8 h-8" />
                ) : (
                  <Briefcase className="w-8 h-8" />
                )}
              </motion.div>
              <div>
                <h3 className="text-2xl font-bold mb-1">
                  {userType === 'student' ? 'Student' : 'Teacher'} Details
                </h3>
                <p className="text-sm text-white/80">{user.name}</p>
              </div>
            </div>
            <motion.button
              whileHover={{ scale: 1.1, rotate: 90 }}
              whileTap={{ scale: 0.9 }}
              onClick={onClose}
              className="w-10 h-10 bg-white/20 backdrop-blur-md rounded-xl flex items-center justify-center hover:bg-white/30 transition-all"
            >
              <X className="w-5 h-5" />
            </motion.button>
          </div>
        </div>

        {/* 内容区域 */}
        <div className="p-8 space-y-6 max-h-[calc(90vh-200px)] overflow-y-auto">
          {/* 基本信息 */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
          >
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-blue-600 rounded-xl flex items-center justify-center shadow-lg">
                <Building2 className="w-5 h-5 text-white" />
              </div>
              <h4 className="text-lg font-semibold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
                Basic Information
              </h4>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="bg-gradient-to-br from-gray-50 to-gray-100 rounded-2xl p-4 border border-gray-200">
                <div className="flex items-center gap-2 text-gray-500 text-sm mb-2">
                  <Eye className="w-4 h-4" />
                  <span>Full Name</span>
                </div>
                <div className="text-gray-800 font-medium text-lg flex items-center justify-between">
                  <span>{user.name}</span>
                  <span className="text-xs text-gray-400 bg-gray-200 px-2 py-1 rounded-full">Read-only</span>
                </div>
              </div>
              <div className="bg-gradient-to-br from-gray-50 to-gray-100 rounded-2xl p-4 border border-gray-200">
                <div className="flex items-center gap-2 text-gray-500 text-sm mb-2">
                  <CreditCard className="w-4 h-4" />
                  <span>ID Number</span>
                </div>
                <div className="text-gray-800 font-medium font-mono flex items-center justify-between">
                  <span className="text-sm">{user.idCard}</span>
                  <span className="text-xs text-gray-400 bg-gray-200 px-2 py-1 rounded-full">Read-only</span>
                </div>
              </div>
            </div>
          </motion.div>

          {/* 可编辑信息 */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
          >
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 bg-gradient-to-br from-purple-500 to-pink-600 rounded-xl flex items-center justify-center shadow-lg">
                <AlertTriangle className="w-5 h-5 text-white" />
              </div>
              <h4 className="text-lg font-semibold bg-gradient-to-r from-purple-600 to-pink-600 bg-clip-text text-transparent">
                Editable Details
              </h4>
              {!isEditing && (
                <span className="text-xs text-gray-500 bg-gray-100 px-3 py-1 rounded-full">Click Edit to modify</span>
              )}
            </div>
            <div className="space-y-4">
              <div>
                <label className="flex items-center gap-2 text-sm font-medium text-gray-700 mb-2">
                  <span className={userType === 'student' ? 'text-blue-600' : 'text-purple-600'}>●</span>
                  {userType === 'student' ? 'Student ID' : 'Employee ID'}
                  <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <div className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400">
                    {userType === 'student' ? <GraduationCap className="w-5 h-5" /> : <Briefcase className="w-5 h-5" />}
                  </div>
                  <input
                    type="text"
                    value={'studentId' in user ? user.studentId : user.employeeId}
                    disabled={!isEditing}
                    className={`w-full pl-12 pr-4 py-3 border-2 rounded-xl text-gray-800 font-medium transition-all ${
                      isEditing
                        ? 'border-blue-300 bg-white focus:border-blue-500 focus:ring-4 focus:ring-blue-500/20 focus:outline-none'
                        : 'border-gray-200 bg-gray-50 text-gray-600'
                    }`}
                  />
                </div>
              </div>

              <div>
                <label className="flex items-center gap-2 text-sm font-medium text-gray-700 mb-2">
                  <span className="text-green-600">●</span>
                  Faculty
                  <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <div className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400">
                    <Building2 className="w-5 h-5" />
                  </div>
                  <select
                    value={user.department}
                    disabled={!isEditing}
                    className={`w-full pl-12 pr-10 py-3 border-2 rounded-xl text-gray-800 font-medium appearance-none transition-all ${
                      isEditing
                        ? 'border-blue-300 bg-white focus:border-blue-500 focus:ring-4 focus:ring-blue-500/20 focus:outline-none cursor-pointer'
                        : 'border-gray-200 bg-gray-50 text-gray-600'
                    }`}
                  >
                    {departments.map((dept) => (
                      <option key={dept} value={dept}>
                        {dept}
                      </option>
                    ))}
                  </select>
                  <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-gray-400">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </div>
                </div>
              </div>

              {userType === 'student' && 'major' in user && (
                <div>
                  <label className="flex items-center gap-2 text-sm font-medium text-gray-700 mb-2">
                    <span className="text-purple-600">●</span>
                    Major
                  </label>
                  <div className="relative">
                    <div className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400">
                      <GraduationCap className="w-5 h-5" />
                    </div>
                    <select
                      value={user.major}
                      disabled={!isEditing}
                      className={`w-full pl-12 pr-10 py-3 border-2 rounded-xl text-gray-800 font-medium appearance-none transition-all ${
                        isEditing
                          ? 'border-blue-300 bg-white focus:border-blue-500 focus:ring-4 focus:ring-blue-500/20 focus:outline-none cursor-pointer'
                          : 'border-gray-200 bg-gray-50 text-gray-600'
                      }`}
                    >
                      {majors[user.department]?.map((major) => (
                        <option key={major} value={major}>
                          {major}
                        </option>
                      ))}
                    </select>
                    <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-gray-400">
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                      </svg>
                    </div>
                  </div>
                  <p className="text-xs text-gray-500 mt-2 ml-1">(Student field, read-only)</p>
                </div>
              )}

              {userType === 'student' && 'accessibility' in user && (
                <div>
                  <label className="flex items-center gap-2 text-sm font-medium text-gray-700 mb-2">
                    <span className="text-indigo-600">●</span>
                    Blind / low vision
                  </label>
                  <div className="relative">
                    <div className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400">
                      <Eye className="w-5 h-5" />
                    </div>
                    <select
                      value={user.accessibility || 'not-reported'}
                      disabled={!isEditing}
                      className={`w-full pl-12 pr-10 py-3 border-2 rounded-xl text-gray-800 font-medium appearance-none transition-all ${
                        isEditing
                          ? 'border-blue-300 bg-white focus:border-blue-500 focus:ring-4 focus:ring-blue-500/20 focus:outline-none cursor-pointer'
                          : 'border-gray-200 bg-gray-50 text-gray-600'
                      }`}
                    >
                      <option value="not-reported">Not reported</option>
                      <option value="yes">Yes – Blind / low vision</option>
                      <option value="no">No</option>
                    </select>
                    <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-gray-400">
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                      </svg>
                    </div>
                  </div>
                  <p className="text-xs text-gray-500 mt-2 ml-1">
                    If set to 'Yes', the student will automatically get screen-reader friendly layouts and voice-assisted quiz mode by default. This does not skip consent for audio recording.
                  </p>
                </div>
              )}

              <div>
                <label className="flex items-center gap-2 text-sm font-medium text-gray-700 mb-2">
                  <span className="text-orange-600">●</span>
                  Phone Number
                  <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <div className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400">
                    <Phone className="w-5 h-5" />
                  </div>
                  <input
                    type="text"
                    value={user.phone}
                    disabled={!isEditing}
                    className={`w-full pl-12 pr-4 py-3 border-2 rounded-xl text-gray-800 font-medium transition-all ${
                      isEditing
                        ? 'border-blue-300 bg-white focus:border-blue-500 focus:ring-4 focus:ring-blue-500/20 focus:outline-none'
                        : 'border-gray-200 bg-gray-50 text-gray-600'
                    }`}
                  />
                </div>
              </div>

              <div className="bg-gradient-to-br from-yellow-50 to-orange-50 border-2 border-yellow-200 rounded-2xl p-4">
                <label className="flex items-center gap-2 text-sm font-medium text-gray-700 mb-3">
                  <span className="text-red-600">●</span>
                  Password Management
                </label>
                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={() => onResetPassword(user)}
                  className="flex items-center gap-2 px-4 py-2 bg-white border-2 border-blue-300 text-blue-600 rounded-xl hover:bg-blue-50 hover:border-blue-400 transition-all font-medium shadow-sm"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  <span>Reset Password</span>
                </motion.button>
              </div>
            </div>
          </motion.div>

          {/* 系统信息 */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="bg-gradient-to-br from-blue-50 to-purple-50 border border-blue-200 rounded-2xl p-4"
          >
            <div className="flex items-center gap-2 text-gray-600 text-sm mb-3">
              <Clock className="w-4 h-4" />
              <span className="font-medium">System Info</span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
              <div className="flex items-center gap-2 text-gray-600">
                <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                <span>Registered:</span>
                <span className="text-gray-800 font-medium">{user.registeredAt}</span>
              </div>
              <div className="flex items-center gap-2 text-gray-600">
                <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
                <span>Last Login:</span>
                <span className="text-gray-800 font-medium">{user.lastLogin}</span>
              </div>
            </div>
          </motion.div>
        </div>

        {/* 底部按钮 */}
        <div className="border-t border-gray-200 px-8 py-4 bg-gray-50 flex gap-3 justify-end rounded-b-3xl">
          {!isEditing ? (
            <>
              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={onClose}
                className="px-6 py-2.5 border-2 border-gray-300 text-gray-700 rounded-xl hover:bg-white hover:border-gray-400 transition-all font-medium"
              >
                Close
              </motion.button>
              <motion.button
                whileHover={{ scale: 1.02, boxShadow: "0 10px 40px -10px rgba(59, 130, 246, 0.5)" }}
                whileTap={{ scale: 0.98 }}
                onClick={onEdit}
                className="px-6 py-2.5 bg-gradient-to-r from-blue-600 to-purple-600 text-white rounded-xl shadow-lg font-medium flex items-center gap-2"
              >
                <AlertTriangle className="w-4 h-4" />
                <span>Edit</span>
              </motion.button>
            </>
          ) : (
            <>
              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={onCancelEdit}
                className="px-6 py-2.5 border-2 border-gray-300 text-gray-700 rounded-xl hover:bg-white hover:border-gray-400 transition-all font-medium"
              >
                Cancel
              </motion.button>
              <motion.button
                whileHover={{ scale: 1.02, boxShadow: "0 10px 40px -10px rgba(34, 197, 94, 0.5)" }}
                whileTap={{ scale: 0.98 }}
                onClick={onSave}
                className="px-6 py-2.5 bg-gradient-to-r from-green-600 to-emerald-600 text-white rounded-xl shadow-lg font-medium flex items-center gap-2"
              >
                <CheckCircle2 className="w-4 h-4" />
                <span>Save</span>
              </motion.button>
            </>
          )}
        </div>
      </motion.div>
    </motion.div>
  );
}