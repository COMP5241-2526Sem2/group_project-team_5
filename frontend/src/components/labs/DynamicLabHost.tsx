/**
 * DynamicLabHost — renders AI-generated lab definitions.
 * 
 * Safety model: AI returns a JSON LabComponentDefinition with a `rendererProfile`
 * pointing to one of the platform's built-in renderer profiles. No arbitrary
 * JS is eval'd; the profile maps to a controlled React component that interprets
 * the JSON state.
 */
import { useRef, useEffect } from 'react';
import type { LabComponentDefinition, LabState, LabWidgetProps } from './types';

// ── Profile renderers ─────────────────────────────────────────────────────────
// Each profile is a controlled renderer that interprets definition.initialState.

function PHSliderProfile({ state, onStateChange }: { state: LabState; onStateChange?: (patch: Partial<LabState>) => void }) {
  const ph = (state.ph as number) ?? 7;
  const showScale = (state.showScale as boolean) ?? true;

  // pH to color mapping
  function phColor(ph: number) {
    if (ph < 2)  return '#dc2626';
    if (ph < 4)  return '#f97316';
    if (ph < 6)  return '#eab308';
    if (ph < 7)  return '#84cc16';
    if (ph === 7) return '#22c55e';
    if (ph < 9)  return '#06b6d4';
    if (ph < 11) return '#3b5bdb';
    return '#7c3aed';
  }
  function phLabel(ph: number) {
    if (ph < 3)  return 'Strong Acid';
    if (ph < 7)  return 'Weak Acid';
    if (ph === 7) return 'Neutral';
    if (ph < 11) return 'Weak Base';
    return 'Strong Base';
  }

  const color = phColor(ph);

  return (
    <div style={{ background: '#0b1120', borderRadius: '10px', padding: '24px', fontFamily: 'monospace' }}>
      <div style={{ textAlign: 'center', marginBottom: '20px' }}>
        <div style={{ width: '120px', height: '120px', borderRadius: '50%', background: color, margin: '0 auto 12px', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: `0 0 32px ${color}88`, transition: 'background 0.4s, box-shadow 0.4s' }}>
          <div style={{ fontSize: '32px', fontWeight: 800, color: '#fff' }}>{ph.toFixed(1)}</div>
        </div>
        <div style={{ fontSize: '18px', fontWeight: 700, color, transition: 'color 0.4s' }}>{phLabel(ph)}</div>
      </div>

      {showScale && (
        <div style={{ marginBottom: '16px' }}>
          <div style={{ height: '16px', borderRadius: '8px', background: 'linear-gradient(to right, #dc2626,#f97316,#eab308,#84cc16,#22c55e,#06b6d4,#3b5bdb,#7c3aed)', position: 'relative', marginBottom: '4px' }}>
            <div style={{ position: 'absolute', top: '-2px', left: `${(ph / 14) * 100}%`, transform: 'translateX(-50%)', width: '20px', height: '20px', borderRadius: '50%', background: '#fff', border: `3px solid ${color}`, transition: 'left 0.3s' }} />
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px', color: '#6b7280' }}>
            {[0,1,2,3,4,5,6,7,8,9,10,11,12,13,14].map(v => <span key={v}>{v}</span>)}
          </div>
        </div>
      )}

      <input type="range" min="0" max="14" step="0.1" value={ph}
        onChange={e => onStateChange?.({ ph: parseFloat(e.target.value) })}
        style={{ width: '100%', accentColor: color }} />

      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: '#6b7280', marginTop: '6px' }}>
        <span style={{ color: '#ef4444' }}>Acidic (0)</span>
        <span style={{ color: '#22c55e' }}>Neutral (7)</span>
        <span style={{ color: '#7c3aed' }}>Basic (14)</span>
      </div>
    </div>
  );
}

function SnellsLawProfile({ state, onStateChange }: { state: LabState; onStateChange?: (patch: Partial<LabState>) => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const n1 = (state.n1 as number) ?? 1.0;
  const n2 = (state.n2 as number) ?? 1.5;
  const theta1_deg = (state.theta1 as number) ?? 30;
  const theta1 = theta1_deg * Math.PI / 180;
  const sinTheta2 = Math.min(1, n1 * Math.sin(theta1) / n2);
  const theta2 = Math.asin(sinTheta2);
  const totalInternalReflection = n1 * Math.sin(theta1) / n2 > 1;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d')!;
    const W = canvas.width, H = canvas.height;
    ctx.clearRect(0, 0, W, H);

    // Background
    ctx.fillStyle = '#0b1120'; ctx.fillRect(0, 0, W, H);
    // Media
    ctx.fillStyle = '#0d1f3c'; ctx.fillRect(0, H / 2, W, H / 2);
    // Interface
    ctx.strokeStyle = '#334155'; ctx.lineWidth = 1; ctx.setLineDash([6,4]);
    ctx.beginPath(); ctx.moveTo(0, H/2); ctx.lineTo(W, H/2); ctx.stroke();
    // Normal
    ctx.strokeStyle = '#4b5563'; ctx.setLineDash([4,4]);
    ctx.beginPath(); ctx.moveTo(W/2, 20); ctx.lineTo(W/2, H-20); ctx.stroke();
    ctx.setLineDash([]);

    // Labels
    ctx.fillStyle = '#60a5fa'; ctx.font = '12px monospace';
    ctx.fillText(`n₁ = ${n1.toFixed(2)} (Air)`, 10, 30);
    ctx.fillStyle = '#34d399';
    ctx.fillText(`n₂ = ${n2.toFixed(2)} (${n2 > 1.4 ? 'Glass' : 'Water'})`, 10, H/2 + 22);

    const O = { x: W/2, y: H/2 };
    const rayLen = 160;

    // Incident ray
    const ix = O.x - Math.sin(theta1) * rayLen;
    const iy = O.y - Math.cos(theta1) * rayLen;
    ctx.strokeStyle = '#fbbf24'; ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.moveTo(ix, iy); ctx.lineTo(O.x, O.y); ctx.stroke();
    ctx.fillStyle = '#fbbf24'; ctx.font = '11px monospace';
    ctx.fillText(`θ₁=${theta1_deg.toFixed(0)}°`, ix - 10, iy - 8);

    if (!totalInternalReflection) {
      // Refracted ray
      const rx = O.x + Math.sin(theta2) * rayLen;
      const ry = O.y + Math.cos(theta2) * rayLen;
      ctx.strokeStyle = '#34d399'; ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.moveTo(O.x, O.y); ctx.lineTo(rx, ry); ctx.stroke();
      ctx.fillStyle = '#34d399';
      ctx.fillText(`θ₂=${(theta2 * 180 / Math.PI).toFixed(1)}°`, rx + 6, ry - 8);
    } else {
      // Total internal reflection
      const rx = O.x + Math.sin(theta1) * rayLen;
      const ry = O.y - Math.cos(theta1) * rayLen;
      ctx.strokeStyle = '#ef4444'; ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.moveTo(O.x, O.y); ctx.lineTo(rx, ry); ctx.stroke();
      ctx.fillStyle = '#ef4444'; ctx.font = '13px monospace';
      ctx.fillText('Total Internal Reflection', W/2 - 80, H/2 - 20);
    }

    // Origin dot
    ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(O.x, O.y, 4, 0, Math.PI*2); ctx.fill();
  }, [n1, n2, theta1, theta2, totalInternalReflection, theta1_deg]);

  return (
    <div style={{ background: '#0b1120', borderRadius: '10px', overflow: 'hidden' }}>
      <canvas ref={canvasRef} width={400} height={280} style={{ width: '100%', display: 'block' }} />
      <div style={{ padding: '12px 16px', background: '#0f172a', display: 'flex', flexWrap: 'wrap', gap: '14px' }}>
        {[
          { key: 'theta1', label: 'θ₁ (°)', min: 0, max: 89, step: 1, color: '#fbbf24' },
          { key: 'n1', label: 'n₁', min: 1, max: 2, step: 0.01, color: '#60a5fa' },
          { key: 'n2', label: 'n₂', min: 1, max: 2.5, step: 0.01, color: '#34d399' },
        ].map(({ key, label, min, max, step, color }) => (
          <label key={key} style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: '#d1d5db' }}>
            <span style={{ color, fontFamily: 'monospace', minWidth: '30px' }}>{label}</span>
            <input type="range" min={min} max={max} step={step} value={state[key] as number}
              onChange={e => onStateChange?.({ [key]: parseFloat(e.target.value) })}
              style={{ width: '80px', accentColor: color }} />
            <span style={{ fontFamily: 'monospace', minWidth: '35px', color: '#9ca3af' }}>{(state[key] as number).toFixed(key === 'theta1' ? 0 : 2)}</span>
          </label>
        ))}
      </div>
    </div>
  );
}

// ── Profile map ───────────────────────────────────────────────────────────────
const PROFILE_RENDERERS: Record<string, React.ComponentType<{ state: LabState; onStateChange?: (p: Partial<LabState>) => void }>> = {
  'ph_slider':   PHSliderProfile,
  'snells_law':  SnellsLawProfile,
};

// Try to match registryKey suffix
function resolveProfile(def: LabComponentDefinition) {
  // Try by registry key suffix
  for (const key of Object.keys(PROFILE_RENDERERS)) {
    if (def.registryKey.includes(key)) return PROFILE_RENDERERS[key];
  }
  return null;
}

// ── DynamicLabHost ────────────────────────────────────────────────────────────
export default function DynamicLabHost({ state, onStateChange, readonly, definition }: LabWidgetProps & { definition: LabComponentDefinition }) {
  const Renderer = resolveProfile(definition);

  if (!Renderer) {
    return (
      <div style={{ background: '#0b1120', borderRadius: '10px', padding: '32px', textAlign: 'center', color: '#6b7280', fontFamily: 'monospace' }}>
        <div style={{ fontSize: '32px', marginBottom: '12px' }}>🧪</div>
        <div style={{ fontSize: '14px', color: '#9ca3af', marginBottom: '6px' }}>{definition.title}</div>
        <div style={{ fontSize: '11px' }}>{definition.description}</div>
        <div style={{ marginTop: '12px', fontSize: '10px', color: '#374151' }}>Profile: {definition.rendererProfile}</div>
      </div>
    );
  }

  return <Renderer state={state} onStateChange={readonly ? undefined : onStateChange} />;
}