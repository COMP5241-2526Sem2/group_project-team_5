import { motion } from 'motion/react';
import { X, GraduationCap, Briefcase, Building2, Phone, CreditCard, Key, UserPlus } from 'lucide-react';

type UserType = 'student' | 'teacher';

interface StudentData {
  name: string;
  studentId: string;
  department: string;
  major: string;
  phone: string;
  idCard: string;
  password: string;
}

interface TeacherData {
  name: string;
  employeeId: string;
  department: string;
  phone: string;
  idCard: string;
  password: string;
}

interface AddUserModalProps {
  isOpen: boolean;
  onClose: () => void;
  userType: UserType;
  studentData: StudentData;
  teacherData: TeacherData;
  onStudentDataChange: (data: StudentData) => void;
  onTeacherDataChange: (data: TeacherData) => void;
  onSubmit: () => void;
  departments: string[];
  majors: Record<string, string[]>;
}

export default function AddUserModal({
  isOpen,
  onClose,
  userType,
  studentData,
  teacherData,
  onStudentDataChange,
  onTeacherDataChange,
  onSubmit,
  departments,
  majors,
}: AddUserModalProps) {
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
        <div className="relative bg-gradient-to-br from-green-600 via-emerald-600 to-teal-600 px-8 py-6 text-white overflow-hidden">
          <div className="absolute top-0 right-0 w-64 h-64 bg-white/10 rounded-full -mr-32 -mt-32"></div>
          <div className="absolute bottom-0 left-0 w-48 h-48 bg-white/10 rounded-full -ml-24 -mb-24"></div>

          <div className="relative z-10 flex items-center justify-between">
            <div className="flex items-center gap-4">
              <motion.div
                whileHover={{ rotate: 360 }}
                transition={{ duration: 0.6 }}
                className="w-16 h-16 bg-white/20 backdrop-blur-md rounded-2xl flex items-center justify-center shadow-lg"
              >
                <UserPlus className="w-8 h-8" />
              </motion.div>
              <div>
                <h3 className="text-2xl font-bold mb-1">
                  Add {userType === 'student' ? 'Student' : 'Teacher'}
                </h3>
                <p className="text-sm text-white/80">Fill in user details</p>
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
        <div className="p-8 space-y-4 max-h-[calc(90vh-200px)] overflow-y-auto">
          {userType === 'student' ? (
            <>
              <motion.div
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.1 }}
              >
                <label className="flex items-center gap-2 text-sm font-medium text-gray-700 mb-2">
                  <span className="text-blue-600">●</span>
                  Full Name
                  <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <div className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400">
                    <GraduationCap className="w-5 h-5" />
                  </div>
                  <input
                    type="text"
                    value={studentData.name}
                    onChange={(e) => onStudentDataChange({ ...studentData, name: e.target.value })}
                    className="w-full pl-12 pr-4 py-3 border-2 border-gray-200 rounded-xl text-gray-800 focus:border-green-500 focus:ring-4 focus:ring-green-500/20 focus:outline-none transition-all"
                    placeholder="Enter student name"
                  />
                </div>
              </motion.div>

              <motion.div
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.15 }}
              >
                <label className="flex items-center gap-2 text-sm font-medium text-gray-700 mb-2">
                  <span className="text-purple-600">●</span>
                  Student ID
                  <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <div className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400">
                    <CreditCard className="w-5 h-5" />
                  </div>
                  <input
                    type="text"
                    value={studentData.studentId}
                    onChange={(e) => onStudentDataChange({ ...studentData, studentId: e.target.value })}
                    className="w-full pl-12 pr-4 py-3 border-2 border-gray-200 rounded-xl text-gray-800 focus:border-green-500 focus:ring-4 focus:ring-green-500/20 focus:outline-none transition-all"
                    placeholder="Enter student ID"
                  />
                </div>
              </motion.div>

              <motion.div
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.2 }}
              >
                <label className="flex items-center gap-2 text-sm font-medium text-gray-700 mb-2">
                  <span className="text-green-600">●</span>
                  Grade
                  <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <div className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400">
                    <Building2 className="w-5 h-5" />
                  </div>
                  <select
                    value={studentData.department}
                    onChange={(e) => onStudentDataChange({ ...studentData, department: e.target.value, major: '' })}
                    className="w-full pl-12 pr-10 py-3 border-2 border-gray-200 rounded-xl text-gray-800 focus:border-green-500 focus:ring-4 focus:ring-green-500/20 focus:outline-none transition-all appearance-none cursor-pointer"
                  >
                    <option value="">Select grade</option>
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
              </motion.div>

              <motion.div
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.25 }}
              >
                <label className="flex items-center gap-2 text-sm font-medium text-gray-700 mb-2">
                  <span className="text-pink-600">●</span>
                  Major
                  <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <div className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400">
                    <GraduationCap className="w-5 h-5" />
                  </div>
                  <select
                    value={studentData.major}
                    onChange={(e) => onStudentDataChange({ ...studentData, major: e.target.value })}
                    disabled={!studentData.department}
                    className="w-full pl-12 pr-10 py-3 border-2 border-gray-200 rounded-xl text-gray-800 focus:border-green-500 focus:ring-4 focus:ring-green-500/20 focus:outline-none transition-all appearance-none cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <option value="">Select major</option>
                    {studentData.department &&
                      majors[studentData.department]?.map((major) => (
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
              </motion.div>

              <motion.div
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.3 }}
              >
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
                    value={studentData.phone}
                    onChange={(e) => onStudentDataChange({ ...studentData, phone: e.target.value })}
                    className="w-full pl-12 pr-4 py-3 border-2 border-gray-200 rounded-xl text-gray-800 focus:border-green-500 focus:ring-4 focus:ring-green-500/20 focus:outline-none transition-all"
                    placeholder="Enter phone number"
                  />
                </div>
              </motion.div>

              <motion.div
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.35 }}
              >
                <label className="flex items-center gap-2 text-sm font-medium text-gray-700 mb-2">
                  <span className="text-indigo-600">●</span>
                  ID Number
                  <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <div className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400">
                    <CreditCard className="w-5 h-5" />
                  </div>
                  <input
                    type="text"
                    value={studentData.idCard}
                    onChange={(e) => onStudentDataChange({ ...studentData, idCard: e.target.value })}
                    className="w-full pl-12 pr-4 py-3 border-2 border-gray-200 rounded-xl text-gray-800 focus:border-green-500 focus:ring-4 focus:ring-green-500/20 focus:outline-none transition-all"
                    placeholder="Enter ID number"
                  />
                </div>
              </motion.div>

              <motion.div
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.4 }}
              >
                <label className="flex items-center gap-2 text-sm font-medium text-gray-700 mb-2">
                  <span className="text-red-600">●</span>
                  Initial Password
                  <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <div className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400">
                    <Key className="w-5 h-5" />
                  </div>
                  <input
                    type="text"
                    value={studentData.password}
                    onChange={(e) => onStudentDataChange({ ...studentData, password: e.target.value })}
                    className="w-full pl-12 pr-4 py-3 border-2 border-gray-200 rounded-xl text-gray-800 focus:border-green-500 focus:ring-4 focus:ring-green-500/20 focus:outline-none transition-all"
                    placeholder="Suggested: last 6 digits of student ID"
                  />
                </div>
              </motion.div>
            </>
          ) : (
            <>
              <motion.div
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.1 }}
              >
                <label className="flex items-center gap-2 text-sm font-medium text-gray-700 mb-2">
                  <span className="text-blue-600">●</span>
                  Full Name
                  <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <div className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400">
                    <Briefcase className="w-5 h-5" />
                  </div>
                  <input
                    type="text"
                    value={teacherData.name}
                    onChange={(e) => onTeacherDataChange({ ...teacherData, name: e.target.value })}
                    className="w-full pl-12 pr-4 py-3 border-2 border-gray-200 rounded-xl text-gray-800 focus:border-green-500 focus:ring-4 focus:ring-green-500/20 focus:outline-none transition-all"
                    placeholder="Enter teacher name"
                  />
                </div>
              </motion.div>

              <motion.div
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.15 }}
              >
                <label className="flex items-center gap-2 text-sm font-medium text-gray-700 mb-2">
                  <span className="text-purple-600">●</span>
                  Employee ID
                  <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <div className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400">
                    <CreditCard className="w-5 h-5" />
                  </div>
                  <input
                    type="text"
                    value={teacherData.employeeId}
                    onChange={(e) => onTeacherDataChange({ ...teacherData, employeeId: e.target.value })}
                    className="w-full pl-12 pr-4 py-3 border-2 border-gray-200 rounded-xl text-gray-800 focus:border-green-500 focus:ring-4 focus:ring-green-500/20 focus:outline-none transition-all"
                    placeholder="Enter employee ID"
                  />
                </div>
              </motion.div>

              <motion.div
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.2 }}
              >
                <label className="flex items-center gap-2 text-sm font-medium text-gray-700 mb-2">
                  <span className="text-green-600">●</span>
                  Subject
                  <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <div className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400">
                    <Building2 className="w-5 h-5" />
                  </div>
                  <select
                    value={teacherData.department}
                    onChange={(e) => onTeacherDataChange({ ...teacherData, department: e.target.value })}
                    className="w-full pl-12 pr-10 py-3 border-2 border-gray-200 rounded-xl text-gray-800 focus:border-green-500 focus:ring-4 focus:ring-green-500/20 focus:outline-none transition-all appearance-none cursor-pointer"
                  >
                    <option value="">Select subject</option>
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
              </motion.div>

              <motion.div
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.25 }}
              >
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
                    value={teacherData.phone}
                    onChange={(e) => onTeacherDataChange({ ...teacherData, phone: e.target.value })}
                    className="w-full pl-12 pr-4 py-3 border-2 border-gray-200 rounded-xl text-gray-800 focus:border-green-500 focus:ring-4 focus:ring-green-500/20 focus:outline-none transition-all"
                    placeholder="Enter phone number"
                  />
                </div>
              </motion.div>

              <motion.div
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.3 }}
              >
                <label className="flex items-center gap-2 text-sm font-medium text-gray-700 mb-2">
                  <span className="text-indigo-600">●</span>
                  ID Number
                  <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <div className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400">
                    <CreditCard className="w-5 h-5" />
                  </div>
                  <input
                    type="text"
                    value={teacherData.idCard}
                    onChange={(e) => onTeacherDataChange({ ...teacherData, idCard: e.target.value })}
                    className="w-full pl-12 pr-4 py-3 border-2 border-gray-200 rounded-xl text-gray-800 focus:border-green-500 focus:ring-4 focus:ring-green-500/20 focus:outline-none transition-all"
                    placeholder="Enter ID number"
                  />
                </div>
              </motion.div>

              <motion.div
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.35 }}
              >
                <label className="flex items-center gap-2 text-sm font-medium text-gray-700 mb-2">
                  <span className="text-red-600">●</span>
                  Initial Password
                  <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <div className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400">
                    <Key className="w-5 h-5" />
                  </div>
                  <input
                    type="text"
                    value={teacherData.password}
                    onChange={(e) => onTeacherDataChange({ ...teacherData, password: e.target.value })}
                    className="w-full pl-12 pr-4 py-3 border-2 border-gray-200 rounded-xl text-gray-800 focus:border-green-500 focus:ring-4 focus:ring-green-500/20 focus:outline-none transition-all"
                    placeholder="Suggested: last 6 digits of employee ID"
                  />
                </div>
              </motion.div>
            </>
          )}
        </div>

        {/* 底部按钮 */}
        <div className="border-t border-gray-200 px-8 py-4 bg-gray-50 flex gap-3 justify-end rounded-b-3xl">
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={onClose}
            className="px-6 py-2.5 border-2 border-gray-300 text-gray-700 rounded-xl hover:bg-white hover:border-gray-400 transition-all font-medium"
          >
            Cancel
          </motion.button>
          <motion.button
            whileHover={{ scale: 1.02, boxShadow: "0 10px 40px -10px rgba(16, 185, 129, 0.5)" }}
            whileTap={{ scale: 0.98 }}
            onClick={onSubmit}
            className="px-6 py-2.5 bg-gradient-to-r from-green-600 to-emerald-600 text-white rounded-xl shadow-lg font-medium flex items-center gap-2"
          >
            <UserPlus className="w-4 h-4" />
            <span>Save</span>
          </motion.button>
        </div>
      </motion.div>
    </motion.div>
  );
}