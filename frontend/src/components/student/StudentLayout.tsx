import { ReactNode, useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router';
import {
  Home, ClipboardCheck, FileText, BarChart2, Bot, Settings,
  LogOut, PanelLeftClose, PanelLeftOpen, ChevronDown,
} from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';

interface NavItem {
  id: string;
  icon: React.ElementType;
  label: string;
  path?: string;
  pending?: boolean;
}

export default function StudentLayout({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const location = useLocation();
  const [activeMenu, setActiveMenu] = useState('home');
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [showUserMenu, setShowUserMenu] = useState(false);

  // ── Real-time clock ──
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  const timeStr = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
  const dateStr = now.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });

  const navItems: NavItem[] = [
    { id: 'home',         icon: Home,           label: 'Home',        path: '/student/home' },
    { id: 'quiz',         icon: ClipboardCheck, label: 'Quiz',        path: '/student/quiz' },
    { id: 'assignments',  icon: FileText,        label: 'Assignments', pending: true },
    { id: 'grades',       icon: BarChart2,       label: 'Grades',      pending: true },
    { id: 'ai-assistant', icon: Bot,             label: 'AI Assistant',pending: true },
    { id: 'settings',     icon: Settings,        label: 'Settings',    pending: true },
  ];

  useEffect(() => {
    const p = location.pathname;
    if (p.startsWith('/student/quiz')) { setActiveMenu('quiz'); return; }
    if (p === '/student/home' || p === '/student') { setActiveMenu('home'); return; }
  }, [location.pathname]);

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
            <div style={{ width: '24px', height: '24px', borderRadius: '50%', background: '#dbeafe', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '11px', fontWeight: 700, color: '#3b5bdb' }}>L</div>
            <span style={{ fontSize: '15px', color: '#374151' }}>Li Xiaoming</span>
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
        {/* Sidebar */}
        <AnimatePresence initial={false}>
          {sidebarOpen && (
            <motion.aside
              initial={{ width: 0, opacity: 0 }} animate={{ width: 188, opacity: 1 }} exit={{ width: 0, opacity: 0 }}
              transition={{ duration: 0.2, ease: 'easeInOut' }}
              style={{ background: '#ffffff', borderRight: '1px solid #e8eaed', flexShrink: 0, overflow: 'hidden', height: 'calc(100vh - 48px)', position: 'sticky', top: '48px', display: 'flex', flexDirection: 'column' }}
            >
              <div style={{ padding: '10px 8px', width: '188px', flex: 1 }}>
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
                  if (item.pending) {
                    return (
                      <div key={item.id} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '7px 10px', borderRadius: '7px', marginBottom: '2px', opacity: 0.45, cursor: 'not-allowed', userSelect: 'none' }}>
                        <Icon size={16} style={{ color: '#9ca3af', flexShrink: 0 }} />
                        <span style={{ fontSize: '15px', color: '#6b7280', flex: 1 }}>{item.label}</span>
                        <span style={{ fontSize: '10px', background: '#f3f4f6', color: '#9ca3af', padding: '1px 5px', borderRadius: '4px', fontWeight: 500 }}>Soon</span>
                      </div>
                    );
                  }
                  const isActive = activeMenu === item.id;
                  return (
                    <button key={item.id} onClick={() => { setActiveMenu(item.id); navigate(item.path!); }}
                      style={{ width: '100%', display: 'flex', alignItems: 'center', gap: '8px', padding: '7px 10px', borderRadius: '7px', border: 'none', cursor: 'pointer', marginBottom: '2px', fontSize: '15px', fontWeight: isActive ? 600 : 400, background: isActive ? '#f3f4f6' : 'transparent', color: isActive ? '#0f0f23' : '#6b7280', transition: 'background 0.15s, color 0.15s', textAlign: 'left' }}
                      onMouseEnter={e => { if (!isActive) (e.currentTarget as HTMLElement).style.background = '#f9fafb'; }}
                      onMouseLeave={e => { if (!isActive) (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
                    >
                      <Icon size={16} style={{ flexShrink: 0, color: isActive ? '#374151' : '#9ca3af' }} />
                      <span>{item.label}</span>
                    </button>
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