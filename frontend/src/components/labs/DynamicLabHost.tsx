/**
 * DynamicLabHost — renders AI-generated lab definitions.
 *
 * Rendering strategy:
 *   1. explicit visualProfile → dedicated hard-coded renderer (ph_slider, snells_law)
 *   2. otherwise → GenericDynamicRenderer: introspects initialState fields,
 *      auto-generates controls + adaptive Canvas visualisation.
 *
 * No arbitrary JS is eval'd; all rendering is controlled React + Canvas2D code.
 */
import { useRef, useEffect, useCallback, useState, useMemo } from 'react';
import type { LabComponentDefinition, LabState, LabWidgetProps } from './types';

// ── Deterministic ID for canvas animation loop ─────────────────────────────────
let _animFrame = 0;
function nextId() { return ++_animFrame; }

// ══════════════════════════════════════════════════════════════════════════════
// PROFILE RENDERERS  (explicit visualProfile / registry_key suffix)
// ══════════════════════════════════════════════════════════════════════════════

function PHSliderProfile({ state, onStateChange }: LabWidgetProps) {
  const ph = typeof state.ph === 'number' ? state.ph : parseFloat(String(state.ph)) || 7;
  const showScale = state.showScale !== undefined ? !!state.showScale : true;

  function phColor(p: number) {
    if (p < 2)  return '#dc2626';
    if (p < 4)  return '#f97316';
    if (p < 6)  return '#eab308';
    if (p < 7)  return '#84cc16';
    if (p === 7) return '#22c55e';
    if (p < 9)  return '#06b6d4';
    if (p < 11) return '#3b5bdb';
    return '#7c3aed';
  }
  function phLabel(p: number) {
    if (p < 3)  return 'Strong Acid';
    if (p < 7)  return 'Weak Acid';
    if (p === 7) return 'Neutral';
    if (p < 11) return 'Weak Base';
    return 'Strong Base';
  }
  const color = phColor(ph);

  return (
    <div style={{ background: '#0b1120', borderRadius: '10px', padding: '24px', fontFamily: 'monospace' }}>
      <div style={{ textAlign: 'center', marginBottom: '20px' }}>
        <div style={{
          width: '120px', height: '120px', borderRadius: '50%',
          background: color, margin: '0 auto 12px',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          boxShadow: `0 0 32px ${color}88`, transition: 'background 0.4s',
        }}>
          <div style={{ fontSize: '32px', fontWeight: 800, color: '#fff' }}>{ph.toFixed(1)}</div>
        </div>
        <div style={{ fontSize: '18px', fontWeight: 700, color }}>{phLabel(ph)}</div>
      </div>
      {showScale && (
        <div style={{ marginBottom: '16px' }}>
          <div style={{
            height: '16px', borderRadius: '8px',
            background: 'linear-gradient(to right,#dc2626,#f97316,#eab308,#84cc16,#22c55e,#06b6d4,#3b5bdb,#7c3aed)',
            position: 'relative', marginBottom: '4px',
          }}>
            <div style={{
              position: 'absolute', top: '-2px',
              left: `${(ph / 14) * 100}%`,
              transform: 'translateX(-50%)',
              width: '20px', height: '20px', borderRadius: '50%',
              background: '#fff', border: `3px solid ${color}`, transition: 'left 0.3s',
            }} />
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

function SnellsLawProfile({ state, onStateChange }: LabWidgetProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animIdRef = useRef<number>(0);

  function cn(v: unknown, fb: number) {
    if (typeof v === 'number' && !isNaN(v)) return v;
    if (typeof v === 'string') { const n = parseFloat(v); if (!isNaN(n)) return n; }
    return fb;
  }

  const media = (state.media as Record<string, unknown> | undefined) ?? {};
  const n1 = cn(state.n1 ?? state.n1_medium ?? media.n1 ?? (state as Record<string,unknown>).refractive_index_1, 1.0);
  const n2 = cn(state.n2 ?? state.n2_medium ?? media.n2 ?? (state as Record<string,unknown>).refractive_index_2, 1.5);
  const theta1_deg = cn(
    state.theta1 ?? state.incident_angle ?? state.incidentAngle
      ?? state.angle_of_incidence ?? state.angle1
      ?? (state.incident as Record<string,unknown> | undefined)?.angle,
    30,
  );
  const theta1 = theta1_deg * Math.PI / 180;
  const sinT2 = Math.min(1, n1 * Math.sin(theta1) / n2);
  const theta2 = Math.asin(sinT2);
  const tir = n1 * Math.sin(theta1) / n2 > 1;

  function draw() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d')!;
    const W = canvas.width, H = canvas.height;
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = '#0b1120'; ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = '#0d1f3c'; ctx.fillRect(0, H / 2, W, H / 2);
    ctx.strokeStyle = '#334155'; ctx.lineWidth = 1; ctx.setLineDash([6, 4]);
    ctx.beginPath(); ctx.moveTo(0, H / 2); ctx.lineTo(W, H / 2); ctx.stroke();
    ctx.strokeStyle = '#4b5563'; ctx.setLineDash([4, 4]);
    ctx.beginPath(); ctx.moveTo(W / 2, 20); ctx.lineTo(W / 2, H - 20); ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = '#60a5fa'; ctx.font = '12px monospace';
    ctx.fillText(`n\u2081 = ${n1.toFixed(2)} (Air)`, 10, 30);
    ctx.fillStyle = '#34d399';
    ctx.fillText(`n\u2082 = ${n2.toFixed(2)} (${n2 > 1.4 ? 'Glass' : 'Water'})`, 10, H / 2 + 22);
    const O = { x: W / 2, y: H / 2 };
    const rayLen = 160;
    const ix = O.x - Math.sin(theta1) * rayLen;
    const iy = O.y - Math.cos(theta1) * rayLen;
    ctx.strokeStyle = '#fbbf24'; ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.moveTo(ix, iy); ctx.lineTo(O.x, O.y); ctx.stroke();
    ctx.fillStyle = '#fbbf24'; ctx.font = '11px monospace';
    ctx.fillText(`\u03b8\u2081=${theta1_deg.toFixed(0)}\u00b0`, ix - 10, iy - 8);
    if (!tir) {
      const rx = O.x + Math.sin(theta2) * rayLen;
      const ry = O.y + Math.cos(theta2) * rayLen;
      ctx.strokeStyle = '#34d399'; ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.moveTo(O.x, O.y); ctx.lineTo(rx, ry); ctx.stroke();
      ctx.fillStyle = '#34d399';
      ctx.fillText(`\u03b8\u2082=${(theta2 * 180 / Math.PI).toFixed(1)}\u00b0`, rx + 6, ry - 8);
    } else {
      const rx = O.x + Math.sin(theta1) * rayLen;
      const ry = O.y - Math.cos(theta1) * rayLen;
      ctx.strokeStyle = '#ef4444'; ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.moveTo(O.x, O.y); ctx.lineTo(rx, ry); ctx.stroke();
      ctx.fillStyle = '#ef4444'; ctx.font = '13px monospace';
      ctx.fillText('Total Internal Reflection', W / 2 - 80, H / 2 - 20);
    }
    ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(O.x, O.y, 4, 0, Math.PI * 2); ctx.fill();
  }

  useEffect(() => {
    draw();
    const id = nextId();
    animIdRef.current = id;
  }, [n1, n2, theta1_deg, tir]);

  const setParam = useCallback((key: string, val: number) => onStateChange?.({ [key]: val }), [onStateChange]);

  const sliders = [
    { key: 'theta1', label: '\u03b8\u2081 (\u00b0)', min: 0, max: 89, step: 1, val: theta1_deg, color: '#fbbf24', dec: 0 },
    { key: 'n1', label: 'n\u2081', min: 1, max: 2, step: 0.01, val: n1, color: '#60a5fa', dec: 2 },
    { key: 'n2', label: 'n\u2082', min: 1, max: 2.5, step: 0.01, val: n2, color: '#34d399', dec: 2 },
  ];

  return (
    <div style={{ background: '#0b1120', borderRadius: '10px', overflow: 'hidden' }}>
      <canvas ref={canvasRef} width={400} height={280} style={{ width: '100%', display: 'block' }} />
      <div style={{ padding: '12px 16px', background: '#0f172a', display: 'flex', flexWrap: 'wrap', gap: '14px' }}>
        {sliders.map(({ key, label, min, max, step, val, color, dec }) => (
          <label key={key} style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: '#d1d5db' }}>
            <span style={{ color, fontFamily: 'monospace', minWidth: '30px' }}>{label}</span>
            <input type="range" min={min} max={max} step={step} value={val}
              onChange={e => setParam(key, parseFloat(e.target.value))}
              style={{ width: '80px', accentColor: color }} />
            <span style={{ fontFamily: 'monospace', minWidth: '35px', color: '#9ca3af' }}>{val.toFixed(dec)}</span>
          </label>
        ))}
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// GENERIC DYNAMIC RENDERER  — field introspection → auto controls + canvas
// ══════════════════════════════════════════════════════════════════════════════

/** Classifies initialState fields to pick the best canvas rendering mode. */
type RenderMode = 'physics' | 'wave' | 'molecule' | 'ph' | 'grid2d' | 'generic';

interface IntrospectedField {
  key: string;
  label: string;
  type: 'number' | 'string' | 'boolean' | 'array' | 'object';
  min?: number;
  max?: number;
  step?: number;
  unit?: string;
  options?: string[];
  value: unknown;
}

function labelFromKey(key: string): string {
  return key
    .replace(/_/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/\b\w/g, c => c.toUpperCase());
}

function num(v: unknown, lo: number, hi: number, step = 0.01): { value: number; min: number; max: number; step: number } {
  const n = typeof v === 'number' ? v : parseFloat(String(v));
  const clamped = isNaN(n) ? lo : Math.max(lo, Math.min(hi, n));
  return { value: clamped, min: lo, max: hi, step };
}

function introspectField(key: string, value: unknown): IntrospectedField | null {
  // Boolean fields → toggle
  if (typeof value === 'boolean') {
    return { key, label: labelFromKey(key), type: 'boolean', value };
  }

  // Numeric fields → slider with sensible defaults
  if (typeof value === 'number' || (typeof value === 'string' && !isNaN(parseFloat(value)))) {
    const n = typeof value === 'number' ? value : parseFloat(value);
    if (isNaN(n)) return null;

    // Physics
    if (/angle|theta/i.test(key))   return { key, label: labelFromKey(key), type: 'number', ...num(value, 0, 180, 1), unit: '\u00b0' };
    if (/mass|gravity/i.test(key))  return { key, label: labelFromKey(key), type: 'number', ...num(value, 0, 20, 0.1), unit: key.includes('mass') ? 'kg' : 'm/s\u00b2' };
    if (/velocity|speed/i.test(key))return { key, label: labelFromKey(key), type: 'number', ...num(value, -20, 20, 0.5), unit: 'm/s' };
    if (/force|f/i.test(key))       return { key, label: labelFromKey(key), type: 'number', ...num(value, -50, 50, 0.5), unit: 'N' };
    if (/voltage|v/i.test(key))     return { key, label: labelFromKey(key), type: 'number', ...num(value, 0, 24, 0.5), unit: 'V' };
    if (/resistance|r/i.test(key))  return { key, label: labelFromKey(key), type: 'number', ...num(value, 0, 1000, 1), unit: '\u03a9' };
    if (/current|i\b/i.test(key))   return { key, label: labelFromKey(key), type: 'number', ...num(value, 0, 10, 0.01), unit: 'A' };
    if (/frequency|freq/i.test(key))return { key, label: labelFromKey(key), type: 'number', ...num(value, 0.1, 10, 0.1), unit: 'Hz' };
    if (/amplitude|amp/i.test(key)) return { key, label: labelFromKey(key), type: 'number', ...num(value, 0, 5, 0.1), unit: '' };
    if (/wavelength|lambda/i.test(key)) return { key, label: labelFromKey(key), type: 'number', ...num(value, 100, 800, 10), unit: 'nm' };
    if (/time|t\b/i.test(key))     return { key, label: labelFromKey(key), type: 'number', ...num(value, 0, 60, 0.5), unit: 's' };
    if (/temperature|temp/i.test(key)) return { key, label: labelFromKey(key), type: 'number', ...num(value, -50, 300, 1), unit: '\u00b0C' };
    if (/pressure|p\b/i.test(key)) return { key, label: labelFromKey(key), type: 'number', ...num(value, 0, 10, 0.1), unit: 'atm' };
    if (/volume|vol/i.test(key))   return { key, label: labelFromKey(key), type: 'number', ...num(value, 0, 10, 0.1), unit: 'L' };
    if (/x\b|position|px/i.test(key)) return { key, label: labelFromKey(key), type: 'number', ...num(value, -10, 10, 0.1), unit: '' };
    if (/y\b/i.test(key))          return { key, label: labelFromKey(key), type: 'number', ...num(value, -10, 10, 0.1), unit: '' };

    // pH special
    if (/ph/i.test(key)) return { key, label: labelFromKey(key), type: 'number', ...num(value, 0, 14, 0.1) };

    // Generic with heuristics for common AI-generated names
    if (/n\d|index|refractive/i.test(key)) return { key, label: labelFromKey(key), type: 'number', ...num(value, 1, 3, 0.01) };
    if (/theta|incident/i.test(key)) return { key, label: labelFromKey(key), type: 'number', ...num(value, 0, 89, 1), unit: '\u00b0' };

    // Catch-all numeric
    return { key, label: labelFromKey(key), type: 'number', ...num(value, Math.max(-100, n - 10), Math.min(100, n + 10), Math.abs(n) > 10 ? 1 : 0.1) };
  }

  // String fields → select / text
  if (typeof value === 'string') {
    if (value.includes(',')) {
      const options = value.split(',').map(s => s.trim()).filter(Boolean);
      return { key, label: labelFromKey(key), type: 'string', options, value };
    }
    return { key, label: labelFromKey(key), type: 'string', value };
  }

  return null;
}

function classifyRenderMode(fields: IntrospectedField[], title: string, description?: string): RenderMode {
  const all = title + ' ' + (description ?? '');
  const keys = fields.map(f => f.key.toLowerCase());

  if (keys.includes('ph')) return 'ph';
  if (keys.some(k => /molecule|atom|bond/i.test(k))) return 'molecule';
  if (keys.some(k => /wave|oscillat|frequency|amplitude|wavelength/i.test(k))) return 'wave';
  if (keys.some(k => /angle|theta|force|mass|gravity|velocity|position/i.test(k))) return 'physics';
  if (keys.some(k => /x\b|y\b|grid|cartesian/i.test(k))) return 'grid2d';
  if (all.includes('refraction') || all.includes('snell') || all.includes('折射')) return 'physics';
  return 'generic';
}

// ── Canvas renderers per mode ────────────────────────────────────────────────

function drawPhysics(ctx: CanvasRenderingContext2D, W: number, H: number, fields: IntrospectedField[], state: LabState, t: number) {
  ctx.fillStyle = '#0b1120'; ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = '#1e293b'; ctx.lineWidth = 1;
  for (let x = 0; x < W; x += 40) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke(); }
  for (let y = 0; y < H; y += 40) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }

  const angle  = (fields.find(f => /angle|theta/i.test(f.key))?.value as number) ?? 45;
  const speed  = (fields.find(f => /speed|velocity/i.test(f.key))?.value as number) ?? 5;
  const mass   = (fields.find(f => /mass/i.test(f.key))?.value as number) ?? 2;
  const grav   = (fields.find(f => /gravity/i.test(f.key))?.value as number) ?? 9.8;
  const force  = (fields.find(f => /force|f\b/i.test(f.key) && !/force/i.test(f.key))?.value as number) ?? 10;
  const xPos   = (fields.find(f => /x\b|position|px/i.test(f.key))?.value as number) ?? 0;
  const yPos   = (fields.find(f => /y\b/i.test(f.key))?.value as number) ?? 0;
  const vx     = (fields.find(f => /vx/i.test(f.key))?.value as number) ?? 0;
  const vy     = (fields.find(f => /vy/i.test(f.key))?.value as number) ?? 0;

  const cx = W / 2, cy = H / 2;
  const scale = Math.min(W, H) / 20;

  // Projectile trail
  if (fields.some(f => /angle|velocity|speed/i.test(f.key))) {
    const v = speed, ang = angle * Math.PI / 180;
    const g = grav;
    ctx.strokeStyle = '#3b5bdb'; ctx.lineWidth = 2;
    ctx.beginPath();
    for (let tt = 0; tt < Math.min(t, 10); tt += 0.05) {
      const px = cx + v * Math.cos(ang) * tt * scale * 0.3;
      const py = cy - (v * Math.sin(ang) * tt - 0.5 * g * tt * tt) * scale * 0.3;
      if (tt === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.stroke();

    // Current ball
    const bx = cx + v * Math.cos(ang) * t * scale * 0.3;
    const by = cy - (v * Math.sin(ang) * t - 0.5 * g * t * t) * scale * 0.3;
    ctx.fillStyle = '#fbbf24';
    ctx.beginPath(); ctx.arc(bx, by, 10, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#fff'; ctx.font = '10px monospace';
    ctx.fillText(`v=${v.toFixed(1)}m/s`, bx + 12, by + 4);
    ctx.fillText(`\u03b8=${angle}\u00b0`, bx + 12, by + 18);
    ctx.fillText(`t=${t.toFixed(1)}s`, bx + 12, by + 32);
  }

  // Force / vector arrows
  if (fields.some(f => /force|f\b/i.test(f.key))) {
    const fx = force * Math.cos((angle) * Math.PI / 180);
    const fy = force * Math.sin((angle) * Math.PI / 180);
    drawArrow(ctx, cx, cy, cx + fx * scale * 0.3, cy - fy * scale * 0.3, '#ef4444', 3);
    ctx.fillStyle = '#ef4444'; ctx.font = '11px monospace';
    ctx.fillText(`F=${force.toFixed(1)}N`, cx + fx * scale * 0.3 + 8, cy - fy * scale * 0.3);
  }

  // Free-body diagram
  if (fields.some(f => /mass|gravity/i.test(f.key))) {
    const wx = cx + 80, wy = cy;
    ctx.strokeStyle = '#6b7280'; ctx.lineWidth = 1.5;
    ctx.strokeRect(wx - 20, wy - 20, 40, 40);
    ctx.fillStyle = '#9ca3af'; ctx.font = '10px monospace';
    ctx.fillText(`${mass}kg`, wx - 12, wy + 4);
    drawArrow(ctx, wx, wy - 20, wx, wy - 20 - mass * scale * 0.1, '#3b82f6', 2);
    ctx.fillStyle = '#3b82f6'; ctx.font = '10px monospace';
    ctx.fillText(`W=${(mass * grav).toFixed(1)}N`, wx + 4, wy - 20 - mass * scale * 0.1 - 4);
  }

  // Cartesian point
  if (fields.some(f => /x\b|y\b/i.test(f.key))) {
    const px = cx + xPos * scale * 0.5;
    const py = cy - yPos * scale * 0.5;
    ctx.fillStyle = '#34d399'; ctx.beginPath(); ctx.arc(px, py, 6, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#9ca3af'; ctx.font = '10px monospace';
    ctx.fillText(`(${xPos.toFixed(1)}, ${yPos.toFixed(1)})`, px + 10, py - 6);
  }

  // Velocity vector
  if (vx !== 0 || vy !== 0) {
    drawArrow(ctx, cx, cy, cx + vx * scale * 0.3, cy - vy * scale * 0.3, '#a78bfa', 2);
    ctx.fillStyle = '#a78bfa'; ctx.font = '10px monospace';
    ctx.fillText(`v\u2093=${vx.toFixed(1)}`, cx + vx * scale * 0.3 + 6, cy - vy * scale * 0.3 - 4);
    ctx.fillText(`v\u1d62=${vy.toFixed(1)}`, cx + vx * scale * 0.3 + 6, cy - vy * scale * 0.3 + 8);
  }

  // Axis labels
  ctx.strokeStyle = '#334155'; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.moveTo(20, H - 20); ctx.lineTo(W - 10, H - 20); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(20, H - 20); ctx.lineTo(20, 10); ctx.stroke();
  ctx.fillStyle = '#4b5563'; ctx.font = '11px monospace';
  ctx.fillText('x', W - 18, H - 12);
  ctx.fillText('y', 28, 18);
}

function drawWave(ctx: CanvasRenderingContext2D, W: number, H: number, fields: IntrospectedField[], t: number) {
  ctx.fillStyle = '#0b1120'; ctx.fillRect(0, 0, W, H);
  const amp   = (fields.find(f => /amp/i.test(f.key))?.value as number) ?? 2;
  const freq  = (fields.find(f => /freq/i.test(f.key))?.value as number) ?? 1;
  const wave  = (fields.find(f => /wave/i.test(f.key))?.value as number) ?? 1;
  const lam   = (fields.find(f => /lambda/i.test(f.key))?.value as number) ?? 200;
  const phase = (fields.find(f => /phase/i.test(f.key))?.value as number) ?? 0;

  const mid = H / 2;
  ctx.strokeStyle = '#334155'; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(0, mid); ctx.lineTo(W, mid); ctx.stroke();

  const colors = ['#3b82f6', '#34d399', '#fbbf24', '#f87171'];
  const numWaves = Math.min(4, wave);
  for (let w = 0; w < numWaves; w++) {
    const a = amp / (w + 1);
    const f = freq * (w + 1);
    const wl = lam / (w + 1);
    ctx.strokeStyle = colors[w % colors.length]; ctx.lineWidth = 2;
    ctx.beginPath();
    for (let x = 0; x < W; x++) {
      const px = x / W * 4 * Math.PI + phase + t * f * 2;
      const py = mid - a * Math.sin(px) * (H * 0.35 / 5);
      if (x === 0) ctx.moveTo(x, py); else ctx.lineTo(x, py);
    }
    ctx.stroke();
  }

  // Labels
  ctx.fillStyle = '#9ca3af'; ctx.font = '11px monospace';
  ctx.fillText(`A=${amp.toFixed(1)} | f=${freq.toFixed(1)}Hz | \u03bb=${lam.toFixed(0)}nm | t=${t.toFixed(2)}s`, 12, 18);
}

function drawMolecule(ctx: CanvasRenderingContext2D, W: number, H: number, fields: IntrospectedField[], state: LabState) {
  ctx.fillStyle = '#0b1120'; ctx.fillRect(0, 0, W, H);
  const mol = String(state.moleculeKey ?? state.molecule ?? 'H2O');
  const highlighted = String(state.highlighted ?? '');

  const molecules: Record<string, { atoms: { label: string; x: number; y: number; color: string }[]; bonds: [number, number, number][] }> = {
    H2O: { atoms: [{ label: 'O', x: 0.5, y: 0.45, color: '#ef4444' }, { label: 'H', x: 0.35, y: 0.65, color: '#60a5fa' }, { label: 'H', x: 0.65, y: 0.65, color: '#60a5fa' }], bonds: [[0, 1, 1], [0, 2, 1]] },
    CO2: { atoms: [{ label: 'C', x: 0.5, y: 0.5, color: '#6b7280' }, { label: 'O', x: 0.28, y: 0.5, color: '#ef4444' }, { label: 'O', x: 0.72, y: 0.5, color: '#ef4444' }], bonds: [[0, 1, 2], [0, 2, 2]] },
    CH4: { atoms: [{ label: 'C', x: 0.5, y: 0.5, color: '#6b7280' }, { label: 'H', x: 0.5, y: 0.22, color: '#60a5fa' }, { label: 'H', x: 0.22, y: 0.65, color: '#60a5fa' }, { label: 'H', x: 0.78, y: 0.65, color: '#60a5fa' }, { label: 'H', x: 0.5, y: 0.78, color: '#60a5fa' }], bonds: [[0, 1, 1], [0, 2, 1], [0, 3, 1], [0, 4, 1]] },
    O2:  { atoms: [{ label: 'O', x: 0.38, y: 0.5, color: '#ef4444' }, { label: 'O', x: 0.62, y: 0.5, color: '#ef4444' }], bonds: [[0, 1, 2]] },
    N2:  { atoms: [{ label: 'N', x: 0.38, y: 0.5, color: '#3b82f6' }, { label: 'N', x: 0.62, y: 0.5, color: '#3b82f6' }], bonds: [[0, 1, 3]] },
    NaCl:{ atoms: [{ label: 'Na', x: 0.35, y: 0.5, color: '#a78bfa' }, { label: 'Cl', x: 0.65, y: 0.5, color: '#34d399' }], bonds: [[0, 1, 1]] },
    H2:  { atoms: [{ label: 'H', x: 0.42, y: 0.5, color: '#60a5fa' }, { label: 'H', x: 0.58, y: 0.5, color: '#60a5fa' }], bonds: [[0, 1, 1]] },
    HCl: { atoms: [{ label: 'H', x: 0.38, y: 0.5, color: '#60a5fa' }, { label: 'Cl', x: 0.62, y: 0.5, color: '#34d399' }], bonds: [[0, 1, 1]] },
  };

  const def = molecules[mol] ?? molecules.H2O;
  const pad = 40;
  const usable = Math.min(W, H) - pad * 2;

  def.bonds.forEach(([ai, bi, order]) => {
    const a = def.atoms[ai], b = def.atoms[bi];
    const ax = pad + a.x * usable, ay = pad + a.y * usable;
    const bx = pad + b.x * usable, by = pad + b.y * usable;
    ctx.strokeStyle = '#4b5563'; ctx.lineWidth = 2 + order;
    for (let o = 0; o < order; o++) {
      const off = (o - (order - 1) / 2) * 3;
      ctx.beginPath(); ctx.moveTo(ax, ay + off); ctx.lineTo(bx, by + off); ctx.stroke();
    }
  });

  def.atoms.forEach(atom => {
    const ax = pad + atom.x * usable, ay = pad + atom.y * usable;
    const isHl = atom.label === highlighted || highlighted === 'all';
    ctx.fillStyle = atom.color;
    ctx.beginPath(); ctx.arc(ax, ay, isHl ? 18 : 14, 0, Math.PI * 2); ctx.fill();
    if (isHl) {
      ctx.strokeStyle = '#fff'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(ax, ay, 20, 0, Math.PI * 2); ctx.stroke();
    }
    ctx.fillStyle = '#fff'; ctx.font = `bold ${isHl ? 13 : 11}px monospace`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(atom.label, ax, ay);
  });
  ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = '#9ca3af'; ctx.font = '12px monospace';
  ctx.fillText(mol, 12, H - 12);
}

function drawPH(ctx: CanvasRenderingContext2D, W: number, H: number, fields: IntrospectedField[]) {
  const phField = fields.find(f => /ph/i.test(f.key));
  const ph = (phField?.value as number) ?? 7;
  function pc(p: number) {
    if (p < 2)  return '#dc2626';
    if (p < 4)  return '#f97316';
    if (p < 6)  return '#eab308';
    if (p < 7)  return '#84cc16';
    if (p === 7) return '#22c55e';
    if (p < 9)  return '#06b6d4';
    if (p < 11) return '#3b5bdb';
    return '#7c3aed';
  }
  ctx.fillStyle = '#0b1120'; ctx.fillRect(0, 0, W, H);
  const cx = W / 2, cy = H / 2;
  ctx.fillStyle = pc(ph);
  ctx.beginPath(); ctx.arc(cx, cy, Math.min(W, H) * 0.32, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#fff'; ctx.font = 'bold 32px monospace';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(ph.toFixed(1), cx, cy);
  ctx.font = '14px monospace';
  ctx.fillText(ph < 7 ? 'Acidic' : ph > 7 ? 'Basic' : 'Neutral', cx, cy + 36);
  ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
}

function drawGrid2D(ctx: CanvasRenderingContext2D, W: number, H: number, fields: IntrospectedField[], t: number) {
  ctx.fillStyle = '#0b1120'; ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = '#1e293b'; ctx.lineWidth = 1;
  for (let x = 0; x < W; x += 30) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke(); }
  for (let y = 0; y < H; y += 30) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }

  const xVal = (fields.find(f => /^x$|position|px/i.test(f.key))?.value as number) ?? 0;
  const yVal = (fields.find(f => /^y$/i.test(f.key))?.value as number) ?? 0;
  const cx = W / 2, cy = H / 2;
  const sx = (fields.find(f => /^x$|position|px/i.test(f.key))?.max ?? 10) || 10;
  const sy = (fields.find(f => /^y$/i.test(f.key))?.max ?? 10) || 10;
  const px = cx + (xVal / sx) * (W / 2 - 20);
  const py = cy - (yVal / sy) * (H / 2 - 20);

  const trail = fields.find(f => /trail|path/i.test(f.key))?.value;
  if (trail) {
    ctx.strokeStyle = '#3b5bdb55'; ctx.lineWidth = 1.5;
    for (let tt = Math.max(0, t - 3); tt < t; tt += 0.1) {
      const ptx = cx + (xVal / sx) * (W / 2 - 20) * Math.sin(tt);
      const pty = cy - (yVal / sy) * (H / 2 - 20) * Math.cos(tt);
      if (tt === Math.max(0, t - 3)) ctx.beginPath();
      else ctx.lineTo(ptx, pty);
    }
    ctx.stroke();
  }

  ctx.fillStyle = '#34d399'; ctx.beginPath(); ctx.arc(px, py, 8, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#fff'; ctx.font = '11px monospace';
  ctx.fillText(`(${xVal.toFixed(2)}, ${yVal.toFixed(2)})`, px + 12, py - 8);
  ctx.strokeStyle = '#34d39944'; ctx.lineWidth = 1;
  ctx.setLineDash([4, 4]);
  ctx.beginPath(); ctx.moveTo(px, cy); ctx.lineTo(px, py); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(cx, py); ctx.lineTo(px, py); ctx.stroke();
  ctx.setLineDash([]);
}

function drawGeneric(ctx: CanvasRenderingContext2D, W: number, H: number, fields: IntrospectedField[], state: LabState, t: number) {
  ctx.fillStyle = '#0b1120'; ctx.fillRect(0, 0, W, H);
  const cx = W / 2, cy = H / 2;
  ctx.strokeStyle = '#1e293b'; ctx.lineWidth = 1;
  for (let x = 0; x < W; x += 40) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke(); }
  for (let y = 0; y < H; y += 40) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }

  // Animated ring pulse
  const numField = fields.find(f => f.type === 'number');
  const val = ((numField?.value as number) ?? 1) / (numField?.max ?? 1);
  const pulse = Math.sin(t * 2) * 0.3 + 0.7;
  ctx.strokeStyle = `rgba(59,130,246,${pulse * 0.6})`; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.arc(cx, cy, 60 + val * 80, 0, Math.PI * 2 * val); ctx.stroke();
  ctx.fillStyle = `rgba(59,130,246,${pulse * 0.8})`;
  ctx.beginPath(); ctx.arc(cx, cy, 8, 0, Math.PI * 2); ctx.fill();

  // Render first 6 numeric fields as labelled values
  const numFields = fields.filter(f => f.type === 'number').slice(0, 6);
  numFields.forEach((f, i) => {
    const y = 20 + i * 18;
    ctx.fillStyle = '#9ca3af'; ctx.font = '11px monospace';
    ctx.fillText(`${f.label}:`, 12, y);
    ctx.fillStyle = '#e2e8f0';
    ctx.fillText(`${(f.value as number).toFixed(2)}${f.unit ?? ''}`, 12 + ctx.measureText(`${f.label}:  `).width, y);
  });
}

// ── Arrow helper ─────────────────────────────────────────────────────────────

function drawArrow(ctx: CanvasRenderingContext2D, x1: number, y1: number, x2: number, y2: number, color: string, lw = 2) {
  const dx = x2 - x1, dy = y2 - y1;
  const len = Math.sqrt(dx * dx + dy * dy);
  if (len < 2) return;
  const ux = dx / len, uy = dy / len;
  const hs = 8;
  ctx.strokeStyle = color; ctx.fillStyle = color; ctx.lineWidth = lw;
  ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(x2, y2);
  ctx.lineTo(x2 - ux * hs - uy * hs * 0.5, y2 - uy * hs + ux * hs * 0.5);
  ctx.lineTo(x2 - ux * hs + uy * hs * 0.5, y2 - uy * hs - ux * hs * 0.5);
  ctx.closePath(); ctx.fill();
}

// ── GenericDynamicRenderer ───────────────────────────────────────────────────

function GenericDynamicRenderer({ state, onStateChange, definition }: LabWidgetProps & { definition: LabComponentDefinition }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef = useRef<{ id: number; t: number; last: number }>({ id: 0, t: 0, last: 0 });
  const [, forceUpdate] = useState(0);
  const [animRunning, setAnimRunning] = useState(false);

  const fields = useMemo(() => {
    const result: IntrospectedField[] = [];
    const seen = new Set<string>();
    for (const [key, val] of Object.entries(state)) {
      if (seen.has(key)) continue;
      seen.add(key);
      const f = introspectField(key, val);
      if (f) result.push(f);
    }
    return result;
  }, [state]);

  const mode = useMemo(() =>
    classifyRenderMode(fields, definition.title, definition.description),
  [fields, definition.title, definition.description]);

  // Animation loop
  useEffect(() => {
    if (!animRunning) {
      if (animRef.current.id) { cancelAnimationFrame(animRef.current.id); animRef.current.id = 0; }
      return;
    }
    const run = (ts: number) => {
      if (!animRef.current.last) animRef.current.last = ts;
      const dt = Math.min((ts - animRef.current.last) / 1000, 0.05);
      animRef.current.last = ts;
      animRef.current.t += dt;
      const canvas = canvasRef.current;
      if (!canvas) { animRef.current.id = requestAnimationFrame(run); return; }
      const ctx = canvas.getContext('2d')!;
      const W = canvas.width, H = canvas.height;
      switch (mode) {
        case 'physics':  drawPhysics(ctx, W, H, fields, state, animRef.current.t); break;
        case 'wave':     drawWave(ctx, W, H, fields, animRef.current.t); break;
        case 'molecule': drawMolecule(ctx, W, H, fields, state); break;
        case 'ph':       drawPH(ctx, W, H, fields); break;
        case 'grid2d':   drawGrid2D(ctx, W, H, fields, animRef.current.t); break;
        default:         drawGeneric(ctx, W, H, fields, state, animRef.current.t); break;
      }
      animRef.current.id = requestAnimationFrame(run);
    };
    animRef.current.id = requestAnimationFrame(run);
    return () => { if (animRef.current.id) cancelAnimationFrame(animRef.current.id); };
  }, [animRunning, mode, fields, state]);

  const toggleAnim = useCallback(() => setAnimRunning(v => !v), []);
  const resetTime = useCallback(() => { animRef.current.t = 0; }, []);

  function handleChange(key: string, value: unknown) {
    onStateChange?.({ [key]: value });
    forceUpdate(n => n + 1);
  }

  const numericFields = fields.filter(f => f.type === 'number');
  const boolFields     = fields.filter(f => f.type === 'boolean');
  const stringFields   = fields.filter(f => f.type === 'string');

  return (
    <div style={{ background: '#0b1120', borderRadius: '10px', overflow: 'hidden', fontFamily: 'monospace' }}>
      {/* Canvas */}
      <div style={{ position: 'relative' }}>
        <canvas ref={canvasRef} width={480} height={320} style={{ width: '100%', display: 'block' }} />
        {/* Canvas mode badge */}
        <div style={{
          position: 'absolute', top: '8px', right: '8px',
          background: 'rgba(15,23,42,0.85)', border: '1px solid #334155',
          borderRadius: '6px', padding: '3px 8px',
          fontSize: '10px', color: '#6b7280',
        }}>
          {mode} renderer
        </div>
        {/* Play / Pause */}
        <button onClick={toggleAnim}
          style={{
            position: 'absolute', bottom: '8px', right: '8px',
            padding: '4px 10px', borderRadius: '6px',
            border: '1px solid #334155', background: 'rgba(15,23,42,0.85)',
            color: '#9ca3af', fontSize: '11px', cursor: 'pointer',
          }}>
          {animRunning ? '\u23f8 Play' : '\u25b6 Play'}
        </button>
      </div>

      {/* Controls panel */}
      {fields.length > 0 ? (
        <div style={{ padding: '12px 14px', background: '#0f172a', borderTop: '1px solid #1e293b' }}>
          {/* Numeric sliders */}
          {numericFields.length > 0 && (
            <div style={{ marginBottom: boolFields.length || stringFields.length ? '10px' : 0 }}>
              {numericFields.map(f => (
                <div key={f.key} style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                  <span style={{ fontSize: '11px', color: '#9ca3af', minWidth: '80px' }}>{f.label}</span>
                  <input
                    type="range"
                    min={f.min} max={f.max} step={f.step}
                    value={f.value as number}
                    onChange={e => handleChange(f.key, parseFloat(e.target.value))}
                    style={{ flex: 1, accentColor: '#3b82f6' }}
                  />
                  <span style={{ fontSize: '11px', color: '#e2e8f0', minWidth: '50px', textAlign: 'right' }}>
                    {(f.value as number).toFixed(f.step && f.step >= 1 ? 0 : 2)}{f.unit ?? ''}
                  </span>
                </div>
              ))}
            </div>
          )}

          {/* Boolean toggles */}
          {boolFields.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: stringFields.length ? '10px' : 0 }}>
              {boolFields.map(f => (
                <button key={f.key} onClick={() => handleChange(f.key, !f.value)}
                  style={{
                    padding: '4px 10px', borderRadius: '6px', fontSize: '11px',
                    border: `1px solid ${f.value ? '#3b82f6' : '#334155'}`,
                    background: f.value ? 'rgba(59,130,246,0.15)' : 'transparent',
                    color: f.value ? '#60a5fa' : '#6b7280', cursor: 'pointer',
                  }}>
                  {f.label}: {f.value ? 'ON' : 'OFF'}
                </button>
              ))}
            </div>
          )}

          {/* String selects */}
          {stringFields.length > 0 && stringFields.map(f => (
            <div key={f.key} style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
              <span style={{ fontSize: '11px', color: '#9ca3af', minWidth: '80px' }}>{f.label}</span>
              {f.options ? (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                  {f.options.map(opt => (
                    <button key={opt} onClick={() => handleChange(f.key, opt)}
                      style={{
                        padding: '3px 8px', borderRadius: '5px', fontSize: '11px',
                        border: `1px solid ${f.value === opt ? '#34d399' : '#334155'}`,
                        background: f.value === opt ? 'rgba(52,211,153,0.15)' : 'transparent',
                        color: f.value === opt ? '#6ee7b7' : '#6b7280', cursor: 'pointer',
                      }}>
                      {opt}
                    </button>
                  ))}
                </div>
              ) : (
                <input
                  type="text" value={f.value as string}
                  onChange={e => handleChange(f.key, e.target.value)}
                  style={{
                    flex: 1, background: '#1e293b', border: '1px solid #334155',
                    borderRadius: '5px', color: '#e2e8f0', fontSize: '11px',
                    padding: '3px 8px', fontFamily: 'monospace',
                  }}
                />
              )}
            </div>
          ))}
        </div>
      ) : (
        <div style={{ padding: '16px', background: '#0f172a', textAlign: 'center', color: '#4b5563', fontSize: '12px' }}>
          No controllable parameters found in initial_state.
        </div>
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// DynamicLabHost — routes to profile renderer or GenericDynamicRenderer
// ══════════════════════════════════════════════════════════════════════════════

function resolveProfile(def: LabComponentDefinition) {
  const vp = def.visualProfile?.toLowerCase();
  const PROFILE_RENDERERS: Record<string, React.ComponentType<LabWidgetProps>> = {
    ph_slider:  PHSliderProfile,
    snells_law: SnellsLawProfile,
  };
  if (vp && PROFILE_RENDERERS[vp]) return PROFILE_RENDERERS[vp];
  for (const key of Object.keys(PROFILE_RENDERERS)) {
    if (def.registryKey.toLowerCase().includes(key)) return PROFILE_RENDERERS[key];
  }
  return null;
}

export default function DynamicLabHost({ state, onStateChange, readonly, height, definition }: LabWidgetProps & { definition: LabComponentDefinition }) {
  const Renderer = resolveProfile(definition);

  if (!Renderer) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0', borderRadius: '10px', overflow: 'hidden' }}>
        <GenericDynamicRenderer state={state} onStateChange={readonly ? undefined : onStateChange} definition={definition} />
      </div>
    );
  }

  if (readonly) {
    return <Renderer state={state} onStateChange={undefined} />;
  }
  return <Renderer state={state} onStateChange={onStateChange} />;
}
