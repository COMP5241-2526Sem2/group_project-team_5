import { motion } from 'motion/react';
import { X, AlertTriangle, Trash2, BookOpen } from 'lucide-react';

interface Course {
  id: number;
  code: string;
  name: string;
  teacher: string;
  department: string;
  status: 'not_open' | 'enrolling' | 'in_progress' | 'ended';
}

interface DeleteCourseModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  course: Course | null;
}

export default function DeleteCourseModal({
  isOpen,
  onClose,
  onConfirm,
  course,
}: DeleteCourseModalProps) {
  if (!isOpen || !course) return null;

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
        className="bg-white rounded-3xl shadow-2xl max-w-lg w-full overflow-hidden"
      >
        {/* 头部 - 带渐变背景 */}
        <div className="relative bg-gradient-to-br from-red-600 via-rose-600 to-pink-600 px-8 py-6 text-white overflow-hidden">
          <div className="absolute top-0 right-0 w-64 h-64 bg-white/10 rounded-full -mr-32 -mt-32"></div>
          <div className="absolute bottom-0 left-0 w-48 h-48 bg-white/10 rounded-full -ml-24 -mb-24"></div>

          <div className="relative z-10 flex items-center justify-between">
            <div className="flex items-center gap-4">
              <motion.div
                whileHover={{ rotate: 360 }}
                transition={{ duration: 0.6 }}
                className="w-16 h-16 bg-white/20 backdrop-blur-md rounded-2xl flex items-center justify-center shadow-lg"
              >
                <AlertTriangle className="w-8 h-8" />
              </motion.div>
              <div>
                <h3 className="text-2xl font-bold mb-1">Delete Course</h3>
                <p className="text-sm text-white/80">Confirm deletion</p>
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
        <div className="p-8 space-y-6">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
          >
            <p className="text-gray-800 text-lg mb-4">
              Are you sure you want to delete the following course?
            </p>
          </motion.div>

          {/* 课程信息卡片 */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="bg-gradient-to-br from-gray-50 to-gray-100 rounded-2xl p-6 border-2 border-gray-200"
          >
            <div className="flex items-start gap-4">
              <div className="w-14 h-14 bg-gradient-to-br from-blue-500 to-purple-500 rounded-xl flex items-center justify-center flex-shrink-0">
                <BookOpen className="w-7 h-7 text-white" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-xs bg-blue-100 text-blue-700 px-2 py-1 rounded-full font-mono font-semibold">
                    {course.code}
                  </span>
                </div>
                <h4 className="text-lg font-bold text-gray-800 mb-2">{course.name}</h4>
                <div className="space-y-1 text-sm text-gray-600">
                  <div className="flex items-center gap-2">
                    <span className="text-gray-400">Instructor:</span>
                    <span className="font-medium">{course.teacher}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-gray-400">Faculty:</span>
                    <span className="font-medium">{course.department}</span>
                  </div>
                </div>
              </div>
            </div>
          </motion.div>

          {/* 警告提示 */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="bg-gradient-to-br from-red-50 to-orange-50 border-2 border-red-300 rounded-2xl p-5"
          >
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 bg-red-500 rounded-xl flex items-center justify-center flex-shrink-0">
                <AlertTriangle className="w-6 h-6 text-white" />
              </div>
              <div className="flex-1">
                <p className="text-red-700 font-bold text-lg mb-2">This action cannot be undone!</p>
                <p className="text-red-600 text-sm">All course data (including enrollment records, grades, etc.) will be permanently lost and cannot be recovered.</p>
              </div>
            </div>
          </motion.div>

          {/* 操作说明 */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4 }}
            className="bg-blue-50 border border-blue-200 rounded-xl p-4"
          >
            <div className="text-sm text-gray-700 space-y-2">
              <div className="flex items-center gap-2">
                <div className="w-1.5 h-1.5 bg-blue-500 rounded-full"></div>
                <span>Only courses with status "Not Open" or "Ended" can be deleted.</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-1.5 h-1.5 bg-purple-500 rounded-full"></div>
                <span>Please ensure all important data has been backed up.</span>
              </div>
            </div>
          </motion.div>
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
            whileHover={{ scale: 1.02, boxShadow: "0 10px 40px -10px rgba(220, 38, 38, 0.5)" }}
            whileTap={{ scale: 0.98 }}
            onClick={onConfirm}
            className="px-6 py-2.5 bg-gradient-to-r from-red-600 to-rose-600 text-white rounded-xl shadow-lg font-medium flex items-center gap-2"
          >
            <Trash2 className="w-4 h-4" />
            <span>Confirm Delete</span>
          </motion.button>
        </div>
      </motion.div>
    </motion.div>
  );
}