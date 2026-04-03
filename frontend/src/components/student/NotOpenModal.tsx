import { motion } from 'motion/react';
import { Clock, X, CalendarClock } from 'lucide-react';

interface Props {
  onClose: () => void;
  /** Round 1 start datetime */
  openAt: Date;
}

function fmtDT(d: Date): string {
  return (
    d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) +
    '  ·  ' +
    d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false })
  );
}

export function NotOpenModal({ onClose, openAt }: Props) {
  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.32)',
        zIndex: 1050, display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: '20px',
      }}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.96, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.96, y: 6 }}
        transition={{ duration: 0.16 }}
        onClick={e => e.stopPropagation()}
        style={{
          background: '#fff', borderRadius: '14px',
          maxWidth: '420px', width: '100%',
          boxShadow: '0 20px 60px rgba(0,0,0,0.16)',
          overflow: 'hidden',
        }}
      >
        {/* Header */}
        <div style={{
          padding: '16px 20px', borderBottom: '1px solid #e8eaed',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '9px' }}>
            <div style={{
              width: '30px', height: '30px', background: '#f3f4f6',
              borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center',
              flexShrink: 0,
            }}>
              <Clock size={16} style={{ color: '#6b7280' }} />
            </div>
            <span style={{ fontSize: '15px', fontWeight: 700, color: '#0f0f23' }}>
              Course Selection Not Open
            </span>
          </div>
          <button
            onClick={onClose}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9ca3af', padding: '4px', display: 'flex' }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = '#374151'; }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = '#9ca3af'; }}
          >
            <X size={15} />
          </button>
        </div>

        {/* Body */}
        <div style={{ padding: '22px 20px', display: 'flex', flexDirection: 'column', gap: '16px' }}>

          <p style={{ fontSize: '15px', color: '#374151', margin: 0, lineHeight: 1.55 }}>
            The course selection period has{' '}
            <strong style={{ color: '#0f0f23' }}>not started yet</strong>.
            Submission of course selections is not allowed before Round&nbsp;1 opens.
          </p>

          {/* Open time card */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: '12px',
            background: '#f9fafb', border: '1px solid #e8eaed',
            borderRadius: '10px', padding: '13px 16px',
          }}>
            <CalendarClock size={18} style={{ color: '#6b7280', flexShrink: 0 }} />
            <div>
              <div style={{ fontSize: '12px', color: '#9ca3af', marginBottom: '3px' }}>
                Round 1 opens at:
              </div>
              <div style={{ fontSize: '15px', fontWeight: 700, color: '#0f0f23' }}>
                {fmtDT(openAt)}
              </div>
            </div>
          </div>

          <p style={{ fontSize: '14px', color: '#6b7280', margin: 0 }}>
            Please return during the selection period to submit your courses.
          </p>

          <button
            onClick={onClose}
            style={{
              padding: '10px', borderRadius: '8px', border: 'none',
              background: '#0f0f23', color: '#fff',
              fontSize: '15px', fontWeight: 600, cursor: 'pointer',
            }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = '#1f1f3a'; }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = '#0f0f23'; }}
          >
            OK, Got It
          </button>
        </div>
      </motion.div>
    </div>
  );
}
