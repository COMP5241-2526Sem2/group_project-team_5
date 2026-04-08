/**
 * Confirms switching labs/drafts while the user has an active Generate-mode conversation,
 * or clearing selection (deselect) which also resets Generate progress.
 */
export type ConfirmGenerateResetIntent = 'switch_lab' | 'deselect';

export function ConfirmGenerateResetModal({
  open,
  targetTitle,
  intent = 'switch_lab',
  onConfirm,
  onCancel,
}: {
  open: boolean;
  targetTitle: string;
  intent?: ConfirmGenerateResetIntent;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  if (!open) return null;
  const isDeselect = intent === 'deselect';
  return (
    <div
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 90,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}
      onClick={onCancel}
      role="presentation"
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: '#fff', borderRadius: '14px', padding: '28px',
          maxWidth: '400px', width: '90%', boxShadow: '0 20px 60px rgba(0,0,0,0.15)',
        }}
      >
        <div style={{ fontSize: '16px', fontWeight: 700, color: '#0f0f23', marginBottom: '10px' }}>
          {isDeselect ? 'Deselect this lab?' : 'Switch lab?'}
        </div>
        <div style={{ fontSize: '13px', color: '#6b7280', lineHeight: 1.65, marginBottom: '22px' }}>
          {isDeselect ? (
            <>
              You have an active <strong style={{ color: '#374151' }}>Generate</strong> conversation. Deselecting{' '}
              <strong style={{ color: '#1e40af' }}>{targetTitle}</strong> will clear this chat and the generate session, and unbind Drive / Generate from this lab.
            </>
          ) : (
            <>
              You have an active <strong style={{ color: '#374151' }}>Generate</strong> conversation. Switching to{' '}
              <strong style={{ color: '#1e40af' }}>{targetTitle}</strong> will clear this chat and the generate session.
            </>
          )}
        </div>
        <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
          <button
            type="button"
            onClick={onCancel}
            style={{
              padding: '8px 18px', border: '1px solid #e8eaed', borderRadius: '8px',
              background: '#fff', fontSize: '13px', cursor: 'pointer', color: '#374151',
            }}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            style={{
              padding: '8px 18px', border: 'none', borderRadius: '8px',
              background: '#3b5bdb', color: '#fff', fontSize: '13px', fontWeight: 600, cursor: 'pointer',
            }}
          >
            {isDeselect ? 'Deselect anyway' : 'Switch anyway'}
          </button>
        </div>
      </div>
    </div>
  );
}
