import { motion } from 'motion/react';
import { AlertTriangle, X, Sparkles, Shield } from 'lucide-react';

interface Props {
  onConfirm: () => void;
  onCancel: () => void;
}

export default function GenerateLabModal({ onConfirm, onCancel }: Props) {
  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px' }}
      onClick={onCancel}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.93, y: 16 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.93 }}
        transition={{ duration: 0.2, ease: 'easeOut' }}
        onClick={e => e.stopPropagation()}
        style={{ background: '#0f1117', border: '1px solid #1e293b', borderRadius: '16px', width: '100%', maxWidth: '460px', overflow: 'hidden', boxShadow: '0 24px 80px rgba(0,0,0,0.5)' }}
      >
        {/* Header */}
        <div style={{ background: 'linear-gradient(135deg, #1e1b4b 0%, #1e3a5f 100%)', padding: '20px 22px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{ width: '36px', height: '36px', background: '#3b5bdb22', border: '1px solid #3b5bdb66', borderRadius: '9px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Sparkles size={18} style={{ color: '#818cf8' }} />
            </div>
            <div>
              <div style={{ fontSize: '15px', fontWeight: 700, color: '#e2e8f0' }}>Generate New Lab Component</div>
              <div style={{ fontSize: '11px', color: '#6b7280' }}>Teacher-only action · Confirmation required</div>
            </div>
          </div>
          <button onClick={onCancel} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#6b7280', display: 'flex' }}>
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div style={{ padding: '22px' }}>
          {/* Warning block */}
          <div style={{ background: '#1c1f26', border: '1px solid #f59e0b33', borderRadius: '10px', padding: '14px 16px', marginBottom: '18px', display: 'flex', gap: '12px' }}>
            <AlertTriangle size={18} style={{ color: '#f59e0b', flexShrink: 0, marginTop: '1px' }} />
            <div>
              <div style={{ fontSize: '13px', fontWeight: 600, color: '#fbbf24', marginBottom: '5px' }}>Before you continue</div>
              <ul style={{ margin: 0, padding: '0 0 0 16px', fontSize: '12px', color: '#9ca3af', lineHeight: 1.7 }}>
                <li>An AI session will be created and <strong style={{ color: '#d1d5db' }}>quota will be consumed</strong>.</li>
                <li>The generated Lab will be saved as a <strong style={{ color: '#d1d5db' }}>draft</strong> — it will not be published automatically.</li>
                <li>AI output is subject to schema validation before registration.</li>
                <li>This action is <strong style={{ color: '#d1d5db' }}>teacher-only</strong>; students have no access to this endpoint.</li>
              </ul>
            </div>
          </div>

          {/* Security note */}
          <div style={{ background: '#0d1f3c', border: '1px solid #1e3a5f', borderRadius: '8px', padding: '10px 14px', display: 'flex', gap: '10px', marginBottom: '20px' }}>
            <Shield size={14} style={{ color: '#3b82f6', flexShrink: 0, marginTop: '2px' }} />
            <div style={{ fontSize: '11px', color: '#6b7280', lineHeight: 1.6 }}>
              AI returns a <strong style={{ color: '#60a5fa' }}>JSON definition</strong> — no arbitrary code is executed.
              The platform's built-in <strong style={{ color: '#60a5fa' }}>DynamicLabHost</strong> interprets the definition safely.
            </div>
          </div>

          {/* Actions */}
          <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
            <button onClick={onCancel}
              style={{ padding: '9px 20px', border: '1px solid #1e293b', borderRadius: '8px', background: 'transparent', color: '#6b7280', fontSize: '13px', cursor: 'pointer' }}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = '#1a1a2e'; }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}>
              Cancel
            </button>
            <button onClick={onConfirm}
              style={{ padding: '9px 22px', border: 'none', borderRadius: '8px', background: 'linear-gradient(135deg, #3b5bdb, #4f46e5)', color: '#fff', fontSize: '13px', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.opacity = '0.9'; }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.opacity = '1'; }}>
              <Sparkles size={14} /> Confirm & Start Session
            </button>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}
