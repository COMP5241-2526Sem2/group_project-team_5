import { motion } from 'motion/react';
import { X, RefreshCw, Clock, CheckCircle2, PlayCircle, PauseCircle, StopCircle } from 'lucide-react';

interface CourseStatusModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  currentStatus: 'not_open' | 'enrolling' | 'in_progress' | 'ended';
  newStatus: 'not_open' | 'enrolling' | 'in_progress' | 'ended';
  autoStatusManage: boolean;
  onStatusChange: (status: 'not_open' | 'enrolling' | 'in_progress' | 'ended') => void;
  onAutoStatusChange: (auto: boolean) => void;
}

export default function CourseStatusModal({
  isOpen,
  onClose,
  onConfirm,
  currentStatus,
  newStatus,
  autoStatusManage,
  onStatusChange,
  onAutoStatusChange,
}: CourseStatusModalProps) {
  if (!isOpen) return null;

  const statusConfig = {
    not_open: { 
      text: 'Not Open', 
      color: 'from-gray-500 to-gray-600',
      icon: PauseCircle,
      description: 'Course is not open; students cannot view or enroll.'
    },
    enrolling: { 
      text: 'Enrolling', 
      color: 'from-green-500 to-emerald-600',
      icon: CheckCircle2,
      description: 'Course is open for enrollment; students can view and register.'
    },
    in_progress: { 
      text: 'In Progress', 
      color: 'from-blue-500 to-indigo-600',
      icon: PlayCircle,
      description: 'Course is underway; enrollment is closed.'
    },
    ended: { 
      text: 'Ended', 
      color: 'from-red-500 to-rose-600',
      icon: StopCircle,
      description: 'Course has ended; no enrollment or changes accepted.'
    },
  };

  const CurrentIcon = statusConfig[currentStatus].icon;
  const NewIcon = statusConfig[newStatus].icon;

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
        className="bg-white rounded-3xl shadow-2xl max-w-2xl w-full overflow-hidden"
      >
        {/* 头部 - 带渐变背景 */}
        <div className="relative bg-gradient-to-br from-cyan-600 via-blue-600 to-indigo-600 px-8 py-6 text-white overflow-hidden">
          <div className="absolute top-0 right-0 w-64 h-64 bg-white/10 rounded-full -mr-32 -mt-32"></div>
          <div className="absolute bottom-0 left-0 w-48 h-48 bg-white/10 rounded-full -ml-24 -mb-24"></div>

          <div className="relative z-10 flex items-center justify-between">
            <div className="flex items-center gap-4">
              <motion.div
                whileHover={{ rotate: 360 }}
                transition={{ duration: 0.6 }}
                className="w-16 h-16 bg-white/20 backdrop-blur-md rounded-2xl flex items-center justify-center shadow-lg"
              >
                <RefreshCw className="w-8 h-8" />
              </motion.div>
              <div>
                <h3 className="text-2xl font-bold mb-1">Change Course Status</h3>
                <p className="text-sm text-white/80">Select a new status for this course</p>
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
          {/* 当前状态 */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className={`bg-gradient-to-br ${statusConfig[currentStatus].color} rounded-2xl p-6 text-white`}
          >
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 bg-white/20 backdrop-blur-md rounded-xl flex items-center justify-center">
                <CurrentIcon className="w-7 h-7" />
              </div>
              <div className="flex-1">
                <div className="text-sm text-white/80 mb-1">Current Status</div>
                <div className="text-2xl font-bold">{statusConfig[currentStatus].text}</div>
              </div>
            </div>
          </motion.div>

          {/* 箭头 */}
          <motion.div
            initial={{ opacity: 0, scale: 0.5 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.2 }}
            className="flex justify-center"
          >
            <div className="w-12 h-12 bg-gradient-to-br from-blue-100 to-indigo-100 rounded-full flex items-center justify-center">
              <motion.div
                animate={{ y: [0, 4, 0] }}
                transition={{ duration: 1.5, repeat: Infinity, ease: "easeInOut" }}
              >
                <svg className="w-6 h-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M19 14l-7 7m0 0l-7-7m7 7V3" />
                </svg>
              </motion.div>
            </div>
          </motion.div>

          {/* 选择新状态 */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
          >
            <label className="block text-sm font-semibold text-gray-700 mb-3">
              Select New Status
            </label>
            <div className="grid grid-cols-2 gap-3">
              {(Object.keys(statusConfig) as Array<keyof typeof statusConfig>).map((status) => {
                const config = statusConfig[status];
                const Icon = config.icon;
                return (
                  <motion.button
                    key={status}
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={() => onStatusChange(status)}
                    className={`p-4 rounded-xl border-2 transition-all ${
                      newStatus === status
                        ? `bg-gradient-to-br ${config.color} text-white border-transparent shadow-lg`
                        : 'bg-white border-gray-200 text-gray-700 hover:border-gray-300'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                        newStatus === status ? 'bg-white/20' : 'bg-gray-100'
                      }`}>
                        <Icon className="w-5 h-5" />
                      </div>
                      <div className="text-left">
                        <div className="font-semibold">{config.text}</div>
                        <div className={`text-xs mt-0.5 ${
                          newStatus === status ? 'text-white/80' : 'text-gray-500'
                        }`}>
                          {config.description}
                        </div>
                      </div>
                    </div>
                  </motion.button>
                );
              })}
            </div>
          </motion.div>

          {/* 自动状态管理 */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4 }}
            className="bg-gradient-to-br from-blue-50 to-indigo-50 border-2 border-blue-200 rounded-2xl p-5"
          >
            <div className="flex items-start gap-3">
              <input
                type="checkbox"
                id="autoManage"
                checked={autoStatusManage}
                onChange={(e) => onAutoStatusChange(e.target.checked)}
                className="w-5 h-5 mt-0.5 rounded border-gray-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
              />
              <label htmlFor="autoManage" className="flex-1 cursor-pointer">
                <div className="flex items-center gap-2 text-blue-700 font-semibold mb-2">
                  <Clock className="w-4 h-4" />
                  <span>Enable Auto Status Management</span>
                </div>
                <p className="text-sm text-gray-700">
                  The system will automatically switch status based on enrollment and course dates:
                </p>
                <ul className="mt-2 space-y-1 text-xs text-gray-600">
                  <li className="flex items-center gap-2">
                    <div className="w-1.5 h-1.5 bg-blue-500 rounded-full"></div>
                    <span>When enrollment opens → automatically switches to "Enrolling"</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <div className="w-1.5 h-1.5 bg-purple-500 rounded-full"></div>
                    <span>When course starts → automatically switches to "In Progress"</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <div className="w-1.5 h-1.5 bg-pink-500 rounded-full"></div>
                    <span>When course ends → automatically switches to "Ended"</span>
                  </li>
                </ul>
              </label>
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
            whileHover={{ scale: 1.02, boxShadow: "0 10px 40px -10px rgba(37, 99, 235, 0.5)" }}
            whileTap={{ scale: 0.98 }}
            onClick={onConfirm}
            className={`px-6 py-2.5 bg-gradient-to-r ${statusConfig[newStatus].color} text-white rounded-xl shadow-lg font-medium flex items-center gap-2`}
          >
            <RefreshCw className="w-4 h-4" />
            <span>Confirm Change</span>
          </motion.button>
        </div>
      </motion.div>
    </motion.div>
  );
}