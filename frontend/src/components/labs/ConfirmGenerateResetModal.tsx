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
          {isDeselect ? '取消选择实验？' : '切换实验？'}
        </div>
        <div style={{ fontSize: '13px', color: '#6b7280', lineHeight: 1.65, marginBottom: '22px' }}>
          {isDeselect ? (
            <>
              当前在 <strong style={{ color: '#374151' }}>Generate</strong> 中已有对话内容；取消选择{' '}
              <strong style={{ color: '#1e40af' }}>{targetTitle}</strong> 将清除本次对话与生成会话，并解除与 Drive / Generate 对该实验的绑定。
            </>
          ) : (
            <>
              当前在 <strong style={{ color: '#374151' }}>Generate</strong> 中已有对话内容；切换到{' '}
              <strong style={{ color: '#1e40af' }}>{targetTitle}</strong> 将清除本次对话与生成会话。
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
            取消
          </button>
          <button
            type="button"
            onClick={onConfirm}
            style={{
              padding: '8px 18px', border: 'none', borderRadius: '8px',
              background: '#3b5bdb', color: '#fff', fontSize: '13px', fontWeight: 600, cursor: 'pointer',
            }}
          >
            {isDeselect ? '仍要取消选择' : '继续切换'}
          </button>
        </div>
      </div>
    </div>
  );
}
