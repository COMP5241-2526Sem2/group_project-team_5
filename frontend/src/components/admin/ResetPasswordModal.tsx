import { motion } from 'motion/react';
import { X, Key, AlertCircle, CheckCircle2 } from 'lucide-react';

type UserType = 'student' | 'teacher';

interface ResetPasswordModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  userType: UserType;
}

export default function ResetPasswordModal({
  isOpen,
  onClose,
  onConfirm,
  userType,
}: ResetPasswordModalProps) {
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
        className="bg-white rounded-3xl shadow-2xl max-w-md w-full overflow-hidden"
      >
        {/* 头部 - 带渐变背景 */}
        <div className="relative bg-gradient-to-br from-amber-600 via-orange-600 to-red-600 px-8 py-6 text-white overflow-hidden">
          <div className="absolute top-0 right-0 w-64 h-64 bg-white/10 rounded-full -mr-32 -mt-32"></div>
          <div className="absolute bottom-0 left-0 w-48 h-48 bg-white/10 rounded-full -ml-24 -mb-24"></div>

          <div className="relative z-10 flex items-center justify-between">
            <div className="flex items-center gap-4">
              <motion.div
                whileHover={{ rotate: 360 }}
                transition={{ duration: 0.6 }}
                className="w-16 h-16 bg-white/20 backdrop-blur-md rounded-2xl flex items-center justify-center shadow-lg"
              >
                <Key className="w-8 h-8" />
              </motion.div>
              <div>
                <h3 className="text-2xl font-bold mb-1">Reset Password</h3>
                <p className="text-sm text-white/80">Confirm reset operation</p>
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
            <div className="flex items-start gap-3 text-gray-700 mb-4">
              <AlertCircle className="w-6 h-6 text-orange-500 flex-shrink-0 mt-0.5" />
              <p className="text-base">
                Are you sure you want to reset this user's password?
              </p>
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="bg-gradient-to-br from-blue-50 to-indigo-50 border-2 border-blue-200 rounded-2xl p-5"
          >
            <div className="flex items-center gap-2 text-blue-700 font-semibold mb-3">
               <CheckCircle2 className="w-5 h-5" />
               <span>Reset Rules</span>
             </div>
             <ul className="space-y-2 text-sm text-gray-700">
               <li className="flex items-center gap-2">
                 <div className="w-1.5 h-1.5 bg-blue-500 rounded-full"></div>
                 <span>Student: reset to <span className="font-semibold text-blue-600">last 6 digits of student ID</span></span>
               </li>
               <li className="flex items-center gap-2">
                 <div className="w-1.5 h-1.5 bg-purple-500 rounded-full"></div>
                 <span>Teacher: reset to <span className="font-semibold text-purple-600">last 6 digits of employee ID</span></span>
               </li>
             </ul>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="bg-amber-50 border border-amber-200 rounded-xl p-4"
          >
            <p className="text-sm text-amber-700 flex items-start gap-2">
              <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
              <span>User must sign in with the new password on next login.</span>
            </p>
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
            whileHover={{ scale: 1.02, boxShadow: "0 10px 40px -10px rgba(234, 88, 12, 0.5)" }}
            whileTap={{ scale: 0.98 }}
            onClick={onConfirm}
            className="px-6 py-2.5 bg-gradient-to-r from-orange-600 to-red-600 text-white rounded-xl shadow-lg font-medium flex items-center gap-2"
          >
            <Key className="w-4 h-4" />
            <span>Confirm Reset</span>
          </motion.button>
        </div>
      </motion.div>
    </motion.div>
  );
}