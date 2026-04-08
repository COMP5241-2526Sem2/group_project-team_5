/**
 * Built-in series-circuit SVG lab. AI labs with flat state (voltage, r1, r2, …) use
 * `app.utils.ohm_law_circuit_svg_render_code` in DB as `render_code` for a matching look.
 */
import { useEffect, useRef, useState } from 'react';
import type { LabWidgetProps, LabCommand } from '../types';

// ── Circuit State ─────────────────────────────────────────────────────────────
export interface CircuitComponent {
  id: string;
  type: 'battery' | 'resistor' | 'bulb' | 'switch' | 'ammeter' | 'voltmeter' | 'capacitor';
  label: string;
  value?: number;
  unit?: string;
  closed?: boolean; // for switch
  x: number; y: number;   // grid position (0–5 cols, 0–3 rows)
  rotation?: number;       // 0 | 90 | 180 | 270
}

export interface CircuitWire {
  id: string;
  from: { x: number; y: number };
  to: { x: number; y: number };
}

export interface CircuitState {
  components: CircuitComponent[];
  wires: CircuitWire[];
  voltage: number;       // battery EMF
  showValues: boolean;
  showCurrentFlow: boolean;
  animOffset: number;    // 0-1 for current animation
  mode: 'series' | 'parallel';
}

export const DEFAULT_CIRCUIT_STATE: CircuitState = {
  voltage: 9,
  showValues: true,
  showCurrentFlow: true,
  animOffset: 0,
  mode: 'series',
  components: [
    { id: 'bat', type: 'battery', label: 'Battery', value: 9, unit: 'V', x: 0, y: 1 },
    { id: 'sw1', type: 'switch',  label: 'S₁', closed: true, x: 1, y: 0 },
    { id: 'r1',  type: 'resistor',label: 'R₁', value: 10, unit: 'Ω', x: 2, y: 0 },
    { id: 'r2',  type: 'resistor',label: 'R₂', value: 20, unit: 'Ω', x: 3, y: 0 },
    { id: 'bul', type: 'bulb',    label: 'L₁', value: 6,  unit: 'W',  x: 4, y: 0 },
  ],
  wires: [
    { id: 'w1', from: { x: 0, y: 0 }, to: { x: 1, y: 0 } },
    { id: 'w2', from: { x: 1, y: 0 }, to: { x: 2, y: 0 } },
    { id: 'w3', from: { x: 2, y: 0 }, to: { x: 3, y: 0 } },
    { id: 'w4', from: { x: 3, y: 0 }, to: { x: 4, y: 0 } },
    { id: 'w5', from: { x: 4, y: 0 }, to: { x: 5, y: 0 } },
    { id: 'w6', from: { x: 5, y: 0 }, to: { x: 5, y: 2 } },
    { id: 'w7', from: { x: 5, y: 2 }, to: { x: 0, y: 2 } },
    { id: 'w8', from: { x: 0, y: 2 }, to: { x: 0, y: 1 } },
  ],
};

// ── SVG Circuit renderer ──────────────────────────────────────────────────────
const CELL = 90; // px per grid cell
const COLS = 6, ROWS = 3;
const W = CELL * COLS + 40, H = CELL * ROWS + 40;
const OFF = 20; // offset from edge

function gx(x: number) { return OFF + x * CELL; }
function gy(y: number) { return OFF + y * CELL; }

// Physics calculations
function calcCircuit(state: CircuitState) {
  if (!state?.components) return { current: 0, isOpen: true };
  const sw = state.components.find(c => c.type === 'switch');
  const isClosed = !sw || sw.closed !== false;
  if (!isClosed) return { current: 0, isOpen: true };
  const resistors = state.components.filter(c => c.type === 'resistor');
  const totalR = resistors.reduce((s, r) => s + (r.value ?? 10), 0);
  const current = totalR > 0 ? state.voltage / totalR : 0;
  return { current, isOpen: false };
}

// Component SVG drawers
function drawBattery(x: number, y: number, value: number, showValues: boolean) {
  const cx = gx(x), cy = gy(y);
  return (
    <g key="bat" transform={`translate(${cx},${cy})`}>
      <rect x="-22" y="-28" width="44" height="56" rx="6" fill="#1e293b" stroke="#3b5bdb" strokeWidth="1.5" />
      {/* Long line (positive) */}
      <line x1="-12" y1="-12" x2="12" y2="-12" stroke="#60a5fa" strokeWidth="3" />
      {/* Short line (negative) */}
      <line x1="-7" y1="0" x2="7" y2="0" stroke="#60a5fa" strokeWidth="2" />
      <line x1="-12" y1="12" x2="12" y2="12" stroke="#60a5fa" strokeWidth="3" />
      <line x1="-7" y1="24" x2="7" y2="24" stroke="#60a5fa" strokeWidth="2" />
      {showValues && <text x="0" y="-36" textAnchor="middle" fill="#60a5fa" fontSize="11" fontFamily="monospace">{value}V</text>}
    </g>
  );
}

function drawResistor(x: number, y: number, value: number, label: string, showValues: boolean, current: number) {
  const cx = gx(x), cy = gy(y);
  const glow = current > 0 ? '#fbbf24' : '#374151';
  return (
    <g key={label} transform={`translate(${cx},${cy})`}>
      <rect x="-22" y="-14" width="44" height="28" rx="5" fill="#1e293b" stroke={glow} strokeWidth="1.5" />
      {/* Zigzag */}
      <polyline points="-15,0 -10,-9 -5,9 0,-9 5,9 10,-9 15,0" fill="none" stroke={glow} strokeWidth="2" strokeLinejoin="round" />
      {showValues && <text x="0" y="-20" textAnchor="middle" fill="#9ca3af" fontSize="11" fontFamily="monospace">{label} {value}Ω</text>}
    </g>
  );
}

function drawBulb(x: number, y: number, label: string, current: number) {
  const cx = gx(x), cy = gy(y);
  const lit = current > 0;
  return (
    <g key={label} transform={`translate(${cx},${cy})`}>
      {lit && <circle cx="0" cy="0" r="26" fill={`rgba(251,191,36,${Math.min(0.25, current * 0.04)})`} />}
      <circle cx="0" cy="0" r="18" fill="#1e293b" stroke={lit ? '#fbbf24' : '#374151'} strokeWidth="2" />
      <line x1="-8" y1="-8" x2="8" y2="8" stroke={lit ? '#fbbf24' : '#4b5563'} strokeWidth="2" />
      <line x1="8" y1="-8" x2="-8" y2="8" stroke={lit ? '#fbbf24' : '#4b5563'} strokeWidth="2" />
      <text x="0" y="-24" textAnchor="middle" fill={lit ? '#fbbf24' : '#6b7280'} fontSize="11" fontFamily="monospace">{label}</text>
    </g>
  );
}

function drawSwitch(x: number, y: number, label: string, closed: boolean, onClick: () => void) {
  const cx = gx(x), cy = gy(y);
  return (
    <g key={label} transform={`translate(${cx},${cy})`} onClick={onClick} style={{ cursor: 'pointer' }}>
      <rect x="-24" y="-16" width="48" height="32" rx="6" fill="#1e293b" stroke={closed ? '#10b981' : '#f97316'} strokeWidth="1.5" />
      <circle cx="-10" cy="0" r="4" fill={closed ? '#10b981' : '#6b7280'} />
      <circle cx="10" cy="0" r="4" fill={closed ? '#10b981' : '#6b7280'} />
      <line x1="-10" y1="0" x2={closed ? 10 : 5} y2={closed ? 0 : -10}
        stroke={closed ? '#10b981' : '#f97316'} strokeWidth="2.5" strokeLinecap="round" />
      <text x="0" y="-22" textAnchor="middle" fill={closed ? '#10b981' : '#f97316'} fontSize="11" fontFamily="monospace">{label}</text>
    </g>
  );
}

export default function CircuitLab({ state: rawState, onStateChange, dispatch, readonly }: LabWidgetProps) {
  const s = rawState as unknown as CircuitState;
  const animRef = useRef<number>(0);
  const { current, isOpen } = calcCircuit(s);

  // Current animation
  useEffect(() => {
    if (!s.showCurrentFlow || isOpen) return;
    let frame: number;
    let t = s.animOffset;
    const tick = () => {
      t = (t + 0.003) % 1;
      onStateChange?.({ animOffset: t });
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [s.showCurrentFlow, isOpen]);

  function toggleSwitch(id: string) {
    if (readonly) return;
    const cmd: LabCommand = { type: 'TOGGLE_SWITCH', payload: { id }, description: `Toggle switch ${id}` };
    const updated = s.components.map(c => c.id === id && c.type === 'switch' ? { ...c, closed: !c.closed } : c);
    onStateChange?.({ components: updated });
    dispatch?.(cmd);
  }

  function setVoltage(v: number) {
    onStateChange?.({ voltage: v });
    dispatch?.({ type: 'SET_PARAM', payload: { key: 'voltage', value: v }, description: `Set battery voltage to ${v}V` });
  }

  // Wire rendering with animated current flow
  function renderWires() {
    return s.wires.map(wire => {
      const x1 = gx(wire.from.x), y1 = gy(wire.from.y);
      const x2 = gx(wire.to.x), y2 = gy(wire.to.y);
      const len = Math.hypot(x2 - x1, y2 - y1);
      return (
        <g key={wire.id}>
          <line x1={x1} y1={y1} x2={x2} y2={y2} stroke="#334155" strokeWidth="4" />
          {!isOpen && s.showCurrentFlow && current > 0 && (
            <line x1={x1} y1={y1} x2={x2} y2={y2}
              stroke="#3b82f6" strokeWidth="2" strokeDasharray="10 18"
              strokeDashoffset={-(s.animOffset * 28) % 28}
              style={{ transition: 'none' }} />
          )}
        </g>
      );
    });
  }

  return (
    <div
      style={{
        background: '#0b1120',
        borderRadius: '10px',
        overflow: 'hidden',
        width: W,
        display: 'inline-block',
        verticalAlign: 'top',
        boxSizing: 'border-box',
      }}
    >
      {/* Circuit SVG：viewBox 内等比例绘制（meet），外框由 LabScaleToFit 整体等比缩放 */}
      <div style={{ width: W, height: H, overflow: 'hidden', position: 'relative' }}>
        <svg
          viewBox={`0 0 ${W} ${H}`}
          preserveAspectRatio="xMidYMid meet"
          width="100%"
          height="100%"
          style={{ display: 'block' }}
        >
          <defs>
            <filter id="glow">
              <feGaussianBlur stdDeviation="3" result="blur" />
              <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
            </filter>
          </defs>

          {/* Wires */}
          {renderWires()}

          {/* Components */}
          {s.components.map(comp => {
            switch (comp.type) {
              case 'battery':  return drawBattery(comp.x, comp.y, s.voltage, s.showValues);
              case 'resistor': return drawResistor(comp.x, comp.y, comp.value ?? 10, comp.label, s.showValues, current);
              case 'bulb':     return drawBulb(comp.x, comp.y, comp.label, current);
              case 'switch':   return drawSwitch(comp.x, comp.y, comp.label, comp.closed !== false, () => toggleSwitch(comp.id));
              default: return null;
            }
          })}

          {/* Measurements overlay */}
          {!isOpen && current > 0 && (
            <g>
              <rect x={W - 100} y={8} width="90" height="52" rx="7" fill="rgba(15,23,42,0.85)" stroke="#1e3a5f" />
              <text x={W - 55} y={26} textAnchor="middle" fill="#60a5fa" fontSize="11" fontFamily="monospace" fontWeight="700">Circuit</text>
              <text x={W - 55} y={42} textAnchor="middle" fill="#34d399" fontSize="11" fontFamily="monospace">I = {current.toFixed(3)} A</text>
              <text x={W - 55} y={56} textAnchor="middle" fill="#fbbf24" fontSize="11" fontFamily="monospace">U = {s.voltage} V</text>
            </g>
          )}
          {isOpen && (
            <g>
              <rect x={W - 110} y={8} width="100" height="30" rx="7" fill="rgba(249,115,22,0.15)" stroke="#f97316" />
              <text x={W - 60} y={28} textAnchor="middle" fill="#f97316" fontSize="12" fontFamily="monospace">OPEN CIRCUIT</text>
            </g>
          )}
        </svg>
      </div>

      {/* Controls */}
      {!readonly && (
        <div style={{ flexShrink: 0, background: '#0f172a', padding: '12px 16px', display: 'flex', flexWrap: 'wrap', gap: '16px', alignItems: 'center' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', color: '#d1d5db' }}>
            <span style={{ color: '#60a5fa', fontFamily: 'monospace', minWidth: '50px' }}>EMF (V)</span>
            <input type="range" min="1" max="24" step="0.5" value={s.voltage}
              onChange={e => setVoltage(parseFloat(e.target.value))}
              style={{ width: '100px', accentColor: '#3b5bdb' }} />
            <span style={{ fontFamily: 'monospace', minWidth: '36px', color: '#60a5fa' }}>{s.voltage}V</span>
          </label>

          {s.components.filter(c => c.type === 'resistor').map(r => (
            <label key={r.id} style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', color: '#d1d5db' }}>
              <span style={{ color: '#fbbf24', fontFamily: 'monospace', minWidth: '30px' }}>{r.label}</span>
              <input type="range" min="1" max="100" step="1" value={r.value ?? 10}
                onChange={e => {
                  const v = parseFloat(e.target.value);
                  onStateChange?.({ components: s.components.map(c => c.id === r.id ? { ...c, value: v } : c) });
                }}
                style={{ width: '80px', accentColor: '#fbbf24' }} />
              <span style={{ fontFamily: 'monospace', minWidth: '36px', color: '#9ca3af' }}>{r.value}Ω</span>
            </label>
          ))}

          <label style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '12px', color: '#d1d5db', cursor: 'pointer' }}>
            <input type="checkbox" checked={s.showCurrentFlow} onChange={e => onStateChange?.({ showCurrentFlow: e.target.checked })} style={{ accentColor: '#3b82f6' }} />
            Current animation
          </label>

          <label style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '12px', color: '#d1d5db', cursor: 'pointer' }}>
            <input type="checkbox" checked={s.showValues} onChange={e => onStateChange?.({ showValues: e.target.checked })} style={{ accentColor: '#3b82f6' }} />
            Show values
          </label>
        </div>
      )}
    </div>
  );
}