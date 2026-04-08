import React, { type ElementType, type ReactNode, useCallback, useEffect, useState } from 'react';
import { useNavigate, useLocation } from 'react-router';
import { useChat } from '../labs/ChatContext';
import { prefetchPaperList, prefetchQuestionBankSets } from '../../utils/assessmentDataCache';

/** 跨 Labs 页面实例保留：用于检测 Lab Catalog ↔ Drafts 切换（TeacherLayout 会随路由重挂载） */
let prevTeacherLabsSection: 'catalog' | 'drafts' | null = null;
import {
  ClipboardList, BookOpen, LogOut, Settings,
  ChevronDown, PanelLeftClose, PanelLeftOpen, FlaskConical,
  FileJson,
} from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';

interface NavItem {
  id: string;
  icon: ElementType;
  label: string;
  path: string;
}

interface SubNavItem {
  id: string;
  icon?: ElementType;
  label: string;
  path: string;
}

const ASSESSMENT_SUB_ITEMS: SubNavItem[] = [
  { id: 'generate',  label: 'AI Question Gen',  path: '/teacher/assessment/generate'  },
  { id: 'ai-paper',  label: 'AI Paper',         path: '/teacher/assessment/ai-paper'  },
  { id: 'library',   label: 'Question Bank',    path: '/teacher/assessment/library'   },
  { id: 'papers',    label: 'Exam Papers',      path: '/teacher/assessment/papers'    },
  { id: 'grading',   label: 'Task Publishing', path: '/teacher/assessment/grading'   },
];

const LABS_SUB_ITEMS: SubNavItem[] = [
  { id: 'catalog', icon: FlaskConical, label: 'Lab Catalog', path: '/teacher/labs'        },
  { id: 'drafts',  icon: FileJson,     label: 'Drafts',    path: '/teacher/labs/drafts' },
];

export default function TeacherLayout({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const location = useLocation();
  const { clearLabChatBinding, isGenerating, cancelGeneration } = useChat();
  const [activeMenu, setActiveMenu] = useState('lessons');
  const [activeSub, setActiveSub] = useState('generate');
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [pendingNavPath, setPendingNavPath] = useState<string | null>(null);

  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  const timeStr = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
  const dateStr = now.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });

  const navItems: NavItem[] = [
    { id: 'lessons',    icon: BookOpen,      label: 'Lessons',    path: '/teacher/lessons' },
    { id: 'labs',       icon: FlaskConical,  label: 'Labs',       path: '/teacher/labs' },
    { id: 'assessment', icon: ClipboardList, label: 'Assessment', path: '/teacher/assessment/generate' },
  ];

  useEffect(() => {
    const p = location.pathname;
    if (p.startsWith('/teacher/assessment') || p.startsWith('/teacher/test/')) {
      setActiveMenu('assessment');
      const found = ASSESSMENT_SUB_ITEMS.find(s => p.startsWith(s.path));
      if (found) setActiveSub(found.id);
      return;
    }
    if (p.startsWith('/teacher/labs')) {
      setActiveMenu('labs');
      if (p.includes('/drafts')) setActiveSub('drafts');
      else setActiveSub('catalog');
      return;
    }
    if (p.startsWith('/teacher/lessons') || p.startsWith('/teacher/lesson-')) { setActiveMenu('lessons'); return; }
    setActiveMenu('lessons');
  }, [location.pathname]);

  /** Lab Catalog ↔ Drafts：解除 Chat 与实验绑定并重置为 Generate 欢迎态 */
  useEffect(() => {
    const p = location.pathname;
    if (!p.startsWith('/teacher/labs')) {
      prevTeacherLabsSection = null;
      return;
    }
    const section: 'catalog' | 'drafts' = p.includes('/drafts') ? 'drafts' : 'catalog';
    if (prevTeacherLabsSection !== null && prevTeacherLabsSection !== section) {
      clearLabChatBinding();
    }
    prevTeacherLabsSection = section;
  }, [location.pathname, clearLabChatBinding]);

  const guardedNavigate = useCallback((path: string) => {
    if (!path || path === location.pathname) return;
    if (isGenerating) {
      setPendingNavPath(path);
      return;
    }
    navigate(path);
  }, [isGenerating, location.pathname, navigate]);

  const prefetchAssessmentSub = useCallback((subId: string) => {
    // Fire-and-forget prefetch to make first navigation instant.
    if (subId === 'library') {
      void prefetchQuestionBankSets({});
      return;
    }
    if (subId === 'papers') {
      void prefetchPaperList({ page: 1, page_size: 100 });
      return;
    }
  }, []);

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', background: '#ffffff', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' }}>
      {/* Header */}
      <header style={{ height: '48px', background: '#ffffff', borderBottom: '1px solid #e8eaed', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 20px', position: 'sticky', top: 0, zIndex: 50, flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <span style={{ fontSize: '19px', fontWeight: 600, color: '#0f0f23', letterSpacing: '-0.01em' }}>OpenStudy</span>
        </div>

        <div style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: '14px' }}>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '1px', borderRight: '1px solid #e8eaed', paddingRight: '14px' }}>
            <span style={{ fontSize: '15px', fontWeight: 600, color: '#0f0f23', letterSpacing: '0.02em', fontVariantNumeric: 'tabular-nums' }}>{timeStr}</span>
            <span style={{ fontSize: '12px', color: '#9ca3af' }}>{dateStr}</span>
          </div>
          <button
            onClick={() => setShowUserMenu(!showUserMenu)}
            style={{ display: 'flex', alignItems: 'center', gap: '6px', background: 'transparent', border: 'none', cursor: 'pointer', padding: '4px 8px', borderRadius: '8px' }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = '#f3f4f6'; }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
          >
            <img src="https://images.unsplash.com/photo-1649972904349-6e44c42644a7?w=48&h=48&fit=crop&crop=face" alt="avatar" style={{ width: '24px', height: '24px', borderRadius: '50%', objectFit: 'cover' }} />
            <span style={{ fontSize: '15px', color: '#374151' }}>Ms. Sylvia</span>
            <ChevronDown size={13} style={{ color: '#9ca3af' }} />
          </button>

          <AnimatePresence>
            {showUserMenu && (
              <>
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} style={{ position: 'fixed', inset: 0, zIndex: 40 }} onClick={() => setShowUserMenu(false)} />
                <motion.div
                  initial={{ opacity: 0, y: -6, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -6, scale: 0.97 }} transition={{ duration: 0.12 }}
                  style={{ position: 'absolute', right: 0, top: 'calc(100% + 6px)', width: '160px', background: 'white', borderRadius: '10px', boxShadow: '0 4px 24px rgba(0,0,0,0.10), 0 0 0 1px rgba(0,0,0,0.06)', zIndex: 50, overflow: 'hidden', padding: '4px' }}
                >
                  <DropBtn icon={<Settings size={14} />} label="Profile Settings" onClick={() => setShowUserMenu(false)} />
                  <div style={{ height: '1px', background: '#f0f0f0', margin: '3px 0' }} />
                  <DropBtn icon={<LogOut size={14} />} label="Sign Out" onClick={() => navigate('/login')} danger />
                </motion.div>
              </>
            )}
          </AnimatePresence>
        </div>
      </header>

      {/* Body */}
      <div style={{ display: 'flex', flex: 1, minHeight: 0 }}>
        <AnimatePresence initial={false}>
          {sidebarOpen && (
            <motion.aside
              initial={{ width: 0, opacity: 0 }} animate={{ width: 188, opacity: 1 }} exit={{ width: 0, opacity: 0 }}
              transition={{ duration: 0.2, ease: 'easeInOut' }}
              style={{ background: '#ffffff', borderRight: '1px solid #e8eaed', flexShrink: 0, overflow: 'hidden', height: 'calc(100vh - 48px)', position: 'sticky', top: '48px', display: 'flex', flexDirection: 'column' }}
            >
              <div style={{ padding: '10px 8px', width: '188px', flex: 1, overflowY: 'auto' }}>
                <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '6px' }}>
                  <button
                    onClick={() => setSidebarOpen(false)}
                    style={{ width: '28px', height: '28px', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid #e8eaed', borderRadius: '7px', background: '#fff', color: '#9ca3af', cursor: 'pointer' }}
                    onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = '#f3f4f6'; (e.currentTarget as HTMLElement).style.color = '#374151'; }}
                    onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = '#fff'; (e.currentTarget as HTMLElement).style.color = '#9ca3af'; }}
                  >
                    <PanelLeftClose size={14} />
                  </button>
                </div>

                {navItems.map(item => {
                  const Icon = item.icon;
                  const isActive = activeMenu === item.id;
                  const isAssessment = item.id === 'assessment';
                  const isLabs = item.id === 'labs';
                  return (
                    <div key={item.id}>
                      {/* Main nav item */}
                      <button
                        onClick={() => {
                          setActiveMenu(item.id);
                          guardedNavigate(isAssessment ? '/teacher/assessment/generate' : item.path);
                        }}
                        style={{
                          width: '100%', display: 'flex', alignItems: 'center', gap: '8px',
                          padding: '7px 10px', borderRadius: '7px', border: 'none', cursor: 'pointer',
                          marginBottom: '2px', fontSize: '15px',
                          fontWeight: isActive ? 600 : 400,
                          background: isActive && !isLabs ? '#f3f4f6' : 'transparent',
                          color: isActive ? '#0f0f23' : '#6b7280',
                          transition: 'background 0.15s, color 0.15s', textAlign: 'left',
                        }}
                        onMouseEnter={e => { if (!isActive) (e.currentTarget as HTMLElement).style.background = '#f9fafb'; }}
                        onMouseLeave={e => { if (!isActive) (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
                      >
                        <Icon size={16} style={{ flexShrink: 0, color: isActive ? '#374151' : '#9ca3af' }} />
                        <span>{item.label}</span>
                      </button>

                      {/* Labs sub-nav */}
                      {isLabs && (
                        <AnimatePresence initial={false}>
                          {isActive && (
                            <motion.div
                              initial={{ height: 0, opacity: 0 }}
                              animate={{ height: 'auto', opacity: 1 }}
                              exit={{ height: 0, opacity: 0 }}
                              transition={{ duration: 0.18, ease: 'easeInOut' }}
                              style={{ overflow: 'hidden', marginBottom: '2px' }}
                            >
                              <div style={{ display: 'flex' }}>
                                <div style={{ width: '18px', flexShrink: 0, display: 'flex', justifyContent: 'center', paddingLeft: '10px' }}>
                                  <div style={{ width: '1px', background: '#e8eaed', borderRadius: '1px' }} />
                                </div>
                                <div style={{ flex: 1, padding: '2px 0 4px' }}>
                                  {LABS_SUB_ITEMS.map(sub => {
                                    const SubIcon = sub.icon;
                                    const isSubActive = activeSub === sub.id && activeMenu === 'labs';
                                    return (
                                      <button
                                        key={sub.id}
                                        onClick={() => { setActiveSub(sub.id); guardedNavigate(sub.path); }}
                                        style={{
                                          width: '100%', display: 'flex', alignItems: 'center', gap: '7px',
                                          padding: '6px 10px', borderRadius: '7px', border: 'none', cursor: 'pointer',
                                          marginBottom: '1px', fontSize: '13px',
                                          fontWeight: isSubActive ? 600 : 400,
                                          background: isSubActive ? '#eff6ff' : 'transparent',
                                          color: isSubActive ? '#3b5bdb' : '#6b7280',
                                          transition: 'background 0.12s, color 0.12s', textAlign: 'left',
                                        }}
                                        onMouseEnter={e => { if (!isSubActive) { (e.currentTarget as HTMLElement).style.background = '#f9fafb'; (e.currentTarget as HTMLElement).style.color = '#374151'; } }}
                                        onMouseLeave={e => { if (!isSubActive) { (e.currentTarget as HTMLElement).style.background = 'transparent'; (e.currentTarget as HTMLElement).style.color = '#6b7280'; } }}
                                      >
                                        <SubIcon size={13} style={{ flexShrink: 0, color: isSubActive ? '#3b5bdb' : '#9ca3af' }} />
                                        <span>{sub.label}</span>
                                      </button>
                                    );
                                  })}
                                </div>
                              </div>
                            </motion.div>
                          )}
                        </AnimatePresence>
                      )}

                      {/* Assessment sub-nav — slides open when active */}
                      {isAssessment && (
                        <AnimatePresence initial={false}>
                          {isActive && (
                            <motion.div
                              initial={{ height: 0, opacity: 0 }}
                              animate={{ height: 'auto', opacity: 1 }}
                              exit={{ height: 0, opacity: 0 }}
                              transition={{ duration: 0.18, ease: 'easeInOut' }}
                              style={{ overflow: 'hidden', marginBottom: '2px' }}
                            >
                              {/* Vertical connector line + sub-items */}
                              <div style={{ display: 'flex', gap: '0' }}>
                                {/* Line track */}
                                <div style={{ width: '18px', flexShrink: 0, display: 'flex', justifyContent: 'center', paddingLeft: '10px' }}>
                                  <div style={{ width: '1px', background: '#e8eaed', borderRadius: '1px' }} />
                                </div>
                                {/* Items */}
                                <div style={{ flex: 1, padding: '2px 0 4px' }}>
                                  {ASSESSMENT_SUB_ITEMS.map(sub => {
                                    const isSubActive = activeSub === sub.id && activeMenu === 'assessment';
                                    return (
                                      <button
                                        key={sub.id}
                                        onClick={() => { setActiveSub(sub.id); guardedNavigate(sub.path); }}
                                        onFocus={() => prefetchAssessmentSub(sub.id)}
                                        style={{
                                          width: '100%', display: 'flex', alignItems: 'center',
                                          padding: '6px 10px', borderRadius: '7px', border: 'none', cursor: 'pointer',
                                          marginBottom: '1px', fontSize: '13px',
                                          fontWeight: isSubActive ? 600 : 400,
                                          background: isSubActive ? '#eff6ff' : 'transparent',
                                          color: isSubActive ? '#3b5bdb' : '#6b7280',
                                          transition: 'background 0.12s, color 0.12s', textAlign: 'left',
                                        }}
                                        onMouseEnter={e => {
                                          prefetchAssessmentSub(sub.id);
                                          if (!isSubActive) {
                                            (e.currentTarget as HTMLElement).style.background = '#f9fafb';
                                            (e.currentTarget as HTMLElement).style.color = '#374151';
                                          }
                                        }}
                                        onMouseLeave={e => { if (!isSubActive) { (e.currentTarget as HTMLElement).style.background = 'transparent'; (e.currentTarget as HTMLElement).style.color = '#6b7280'; } }}
                                      >
                                        {sub.label}
                                      </button>
                                    );
                                  })}
                                </div>
                              </div>
                            </motion.div>
                          )}
                        </AnimatePresence>
                      )}
                    </div>
                  );
                })}
              </div>
            </motion.aside>
          )}
        </AnimatePresence>

        {!sidebarOpen && (
          <div style={{ position: 'fixed', left: '10px', top: '58px', zIndex: 40 }}>
            <button onClick={() => setSidebarOpen(true)}
              style={{ width: '28px', height: '28px', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid #e8eaed', borderRadius: '7px', background: '#fff', color: '#9ca3af', cursor: 'pointer', boxShadow: '0 1px 4px rgba(0,0,0,0.08)' }}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = '#f3f4f6'; (e.currentTarget as HTMLElement).style.color = '#374151'; }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = '#fff'; (e.currentTarget as HTMLElement).style.color = '#9ca3af'; }}
            >
              <PanelLeftOpen size={14} />
            </button>
          </div>
        )}

        <main style={{ flex: 1, background: '#ffffff', minHeight: 'calc(100vh - 48px)', overflow: 'auto' }}>
          {children}
        </main>
      </div>

      <InterruptGenerationModal
        open={pendingNavPath !== null}
        onCancel={() => setPendingNavPath(null)}
        onConfirm={() => {
          const path = pendingNavPath;
          setPendingNavPath(null);
          cancelGeneration('Generation interrupted (user switched pages)');
          if (path) navigate(path);
        }}
      />
    </div>
  );
}

function DropBtn({ icon, label, onClick, danger }: { icon: React.ReactNode; label: string; onClick?: () => void; danger?: boolean }) {
  return (
    <button onClick={onClick}
      style={{ width: '100%', display: 'flex', alignItems: 'center', gap: '8px', padding: '7px 10px', borderRadius: '6px', border: 'none', cursor: 'pointer', background: 'transparent', color: danger ? '#ef4444' : '#374151', fontSize: '13px', textAlign: 'left' }}
      onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = danger ? '#fef2f2' : '#f9fafb'; }}
      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
    >
      {icon}{label}
    </button>
  );
}

function InterruptGenerationModal({
  open,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  if (!open) return null;
  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.45)',
        zIndex: 95,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
      onClick={onCancel}
      role="presentation"
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: '#fff',
          borderRadius: '14px',
          padding: '26px',
          maxWidth: '420px',
          width: '92%',
          boxShadow: '0 20px 60px rgba(0,0,0,0.15)',
        }}
      >
        <div style={{ fontSize: '16px', fontWeight: 800, color: '#0f0f23', marginBottom: '10px' }}>
          Generation in progress: switching pages will interrupt it
        </div>
        <div style={{ fontSize: '13px', color: '#6b7280', lineHeight: 1.65, marginBottom: '20px' }}>
          An AI generation/streaming response is still running. Continuing will <strong style={{ color: '#111827' }}>terminate this generation</strong> and may cause unsaved output to be lost.
        </div>
        <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
          <button
            type="button"
            onClick={onCancel}
            style={{
              padding: '8px 18px',
              border: '1px solid #e8eaed',
              borderRadius: '8px',
              background: '#fff',
              fontSize: '13px',
              cursor: 'pointer',
              color: '#374151',
            }}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            style={{
              padding: '8px 18px',
              border: 'none',
              borderRadius: '8px',
              background: '#ef4444',
              color: '#fff',
              fontSize: '13px',
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            Continue and Interrupt
          </button>
        </div>
      </div>
    </div>
  );
}