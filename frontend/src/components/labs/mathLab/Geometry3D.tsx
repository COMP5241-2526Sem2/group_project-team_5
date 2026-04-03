import { useEffect, useRef, useState, useCallback } from 'react';
import type { LabWidgetProps } from '../types';

export interface GeoState {
  shape: 'cube' | 'sphere' | 'cone' | 'cylinder' | 'torus';
  color: string;
  wireframe: boolean;
  showAxes: boolean;
  scale: number;
}

export const DEFAULT_GEO_STATE: GeoState = {
  shape: 'cube', color: '#3b5bdb', wireframe: false,
  showAxes: true, scale: 1,
};

// ── Simple 3-D math ───────────────────────────────────────────────────────────
type V3 = [number, number, number];

function rotX(v: V3, a: number): V3 {
  const [x, y, z] = v;
  return [x, y * Math.cos(a) - z * Math.sin(a), y * Math.sin(a) + z * Math.cos(a)];
}
function rotY(v: V3, a: number): V3 {
  const [x, y, z] = v;
  return [x * Math.cos(a) + z * Math.sin(a), y, -x * Math.sin(a) + z * Math.cos(a)];
}
function project(v: V3, W: number, H: number, fov = 400): [number, number, number] {
  const [x, y, z] = v;
  const scale = fov / (fov + z + 4);
  return [W / 2 + x * scale * 100, H / 2 - y * scale * 100, z];
}

// ── Shape vertices & edges ────────────────────────────────────────────────────
function cubeGeo(s: number): { verts: V3[]; edges: [number, number][] } {
  const h = s / 2;
  const verts: V3[] = [
    [-h,-h,-h],[h,-h,-h],[h,h,-h],[-h,h,-h],
    [-h,-h, h],[h,-h, h],[h,h, h],[-h,h, h],
  ];
  const edges: [number,number][] = [
    [0,1],[1,2],[2,3],[3,0],[4,5],[5,6],[6,7],[7,4],
    [0,4],[1,5],[2,6],[3,7],
  ];
  return { verts, edges };
}

function sphereGeo(r: number, stacks = 8, slices = 12): { verts: V3[]; edges: [number,number][] } {
  const verts: V3[] = [];
  const edges: [number,number][] = [];
  for (let i = 0; i <= stacks; i++) {
    const phi = (i / stacks) * Math.PI;
    for (let j = 0; j < slices; j++) {
      const theta = (j / slices) * 2 * Math.PI;
      verts.push([r * Math.sin(phi) * Math.cos(theta), r * Math.cos(phi), r * Math.sin(phi) * Math.sin(theta)]);
    }
  }
  for (let i = 0; i < stacks; i++) {
    for (let j = 0; j < slices; j++) {
      const a = i * slices + j, b = i * slices + (j + 1) % slices;
      const c = (i + 1) * slices + j;
      edges.push([a, b], [a, c]);
    }
  }
  return { verts, edges };
}

function coneGeo(r: number, h: number, slices = 16): { verts: V3[]; edges: [number,number][] } {
  const verts: V3[] = [[0, h / 2, 0]]; // apex
  for (let j = 0; j < slices; j++) {
    const t = (j / slices) * 2 * Math.PI;
    verts.push([r * Math.cos(t), -h / 2, r * Math.sin(t)]);
  }
  verts.push([0, -h / 2, 0]); // base center
  const edges: [number,number][] = [];
  for (let j = 1; j <= slices; j++) {
    edges.push([0, j], [j, j < slices ? j + 1 : 1], [j, slices + 1]);
  }
  return { verts, edges };
}

function cylinderGeo(r: number, h: number, slices = 16): { verts: V3[]; edges: [number,number][] } {
  const verts: V3[] = [];
  for (let j = 0; j < slices; j++) {
    const t = (j / slices) * 2 * Math.PI;
    verts.push([r * Math.cos(t), h / 2, r * Math.sin(t)]);
    verts.push([r * Math.cos(t), -h / 2, r * Math.sin(t)]);
  }
  const edges: [number,number][] = [];
  for (let j = 0; j < slices; j++) {
    const top = j * 2, bot = j * 2 + 1;
    const nTop = ((j + 1) % slices) * 2, nBot = ((j + 1) % slices) * 2 + 1;
    edges.push([top, bot], [top, nTop], [bot, nBot]);
  }
  return { verts, edges };
}

function torusGeo(R: number, r: number, segs = 20, tube = 10): { verts: V3[]; edges: [number,number][] } {
  const verts: V3[] = [];
  const edges: [number,number][] = [];
  for (let i = 0; i < segs; i++) {
    const u = (i / segs) * 2 * Math.PI;
    for (let j = 0; j < tube; j++) {
      const v = (j / tube) * 2 * Math.PI;
      verts.push([(R + r * Math.cos(v)) * Math.cos(u), r * Math.sin(v), (R + r * Math.cos(v)) * Math.sin(u)]);
    }
  }
  for (let i = 0; i < segs; i++) {
    for (let j = 0; j < tube; j++) {
      const a = i * tube + j;
      const b = i * tube + (j + 1) % tube;
      const c = ((i + 1) % segs) * tube + j;
      edges.push([a, b], [a, c]);
    }
  }
  return { verts, edges };
}

function getGeo(shape: GeoState['shape'], sc: number) {
  switch (shape) {
    case 'sphere':   return sphereGeo(sc);
    case 'cone':     return coneGeo(sc, sc * 2);
    case 'cylinder': return cylinderGeo(sc * 0.7, sc * 2);
    case 'torus':    return torusGeo(sc * 0.9, sc * 0.32);
    default:         return cubeGeo(sc * 1.6);
  }
}

// ── Hex color to rgb ──────────────────────────────────────────────────────────
function hexToRgb(hex: string) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return { r, g, b };
}

// ── Component ─────────────────────────────────────────────────────────────────
const SHAPES: GeoState['shape'][] = ['cube', 'sphere', 'cone', 'cylinder', 'torus'];
const SHAPE_LABELS: Record<GeoState['shape'], string> = { cube:'Cube', sphere:'Sphere', cone:'Cone', cylinder:'Cylinder', torus:'Torus' };
const COLORS = ['#3b5bdb','#7c3aed','#059669','#d97706','#ef4444','#0891b2'];

export default function Geometry3D({ state: rawState, onStateChange, readonly }: LabWidgetProps) {
  const s = rawState as unknown as GeoState;
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const angleRef  = useRef({ x: 0.4, y: 0 });
  const dragRef   = useRef<{ mx: number; my: number; ax: number; ay: number } | null>(null);
  const rafRef    = useRef<number>(0);

  const W = 560, H = 360;

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d')!;
    ctx.clearRect(0, 0, W, H);

    // Background gradient
    const bg = ctx.createRadialGradient(W/2, H/2, 0, W/2, H/2, W/2);
    bg.addColorStop(0, '#111827');
    bg.addColorStop(1, '#030712');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);

    const { r, g, b } = hexToRgb(s.color);
    const geo = getGeo(s.shape, s.scale);
    const ax = angleRef.current.x, ay = angleRef.current.y;

    // Transform vertices
    const projected = geo.verts.map(v => {
      let p = rotX(v, ax);
      p = rotY(p, ay);
      return project(p, W, H);
    });

    // Sort edges by avg Z for painter's algorithm
    const edgesWithZ = geo.edges.map(([a, b]) => ({
      a, b, z: (projected[a][2] + projected[b][2]) / 2
    }));
    edgesWithZ.sort((x, y) => x.z - y.z);

    if (!s.wireframe) {
      // Filled faces approximation: draw glow
      const glow = ctx.createRadialGradient(W/2, H/2, 0, W/2, H/2, 120 * s.scale);
      glow.addColorStop(0, `rgba(${r},${g},${b},0.18)`);
      glow.addColorStop(1, `rgba(${r},${g},${b},0)`);
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(W/2, H/2, 150 * s.scale, 0, Math.PI * 2);
      ctx.fill();
    }

    // Draw edges
    for (const { a, b, z } of edgesWithZ) {
      const [x1, y1, z1] = projected[a];
      const [x2, y2, z2] = projected[b];
      const depth = Math.max(0, Math.min(1, (z + 2) / 4));
      const alpha = s.wireframe ? 0.9 : 0.5 + depth * 0.5;
      ctx.strokeStyle = `rgba(${r},${g},${b},${alpha})`;
      ctx.lineWidth   = s.wireframe ? 1 : 1.5;
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();
    }

    // Axes
    if (s.showAxes) {
      const axes: [V3, V3, string, string][] = [
        [[0,0,0],[1.8,0,0],'#ef4444','X'],
        [[0,0,0],[0,1.8,0],'#22c55e','Y'],
        [[0,0,0],[0,0,1.8],'#60a5fa','Z'],
      ];
      for (const [from, to, col, lbl] of axes) {
        let pf = rotX(from, ax); pf = rotY(pf, ay);
        let pt = rotX(to, ax);   pt = rotY(pt, ay);
        const [x1,y1] = project(pf, W, H);
        const [x2,y2] = project(pt, W, H);
        ctx.strokeStyle = col; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.moveTo(x1,y1); ctx.lineTo(x2,y2); ctx.stroke();
        ctx.fillStyle = col; ctx.font = '11px monospace';
        ctx.fillText(lbl, x2+4, y2+4);
      }
    }

    // Shape label
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    ctx.font = '12px monospace';
    ctx.textAlign = 'left';
    ctx.fillText(SHAPE_LABELS[s.shape] + ' · 3D Canvas', 10, 20);
    ctx.textAlign = 'right';
    ctx.fillStyle = 'rgba(255,255,255,0.25)';
    ctx.fillText('Drag to rotate · Scroll to scale', W-8, H-8);
  }, [s]);

  // Auto-rotate
  useEffect(() => {
    let last = performance.now();
    const tick = (now: number) => {
      if (!dragRef.current) {
        angleRef.current.y += (now - last) * 0.0004;
      }
      last = now;
      draw();
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [draw]);

  function onMouseDown(e: React.MouseEvent) {
    dragRef.current = { mx: e.clientX, my: e.clientY, ax: angleRef.current.x, ay: angleRef.current.y };
  }
  function onMouseMove(e: React.MouseEvent) {
    if (!dragRef.current) return;
    const dx = e.clientX - dragRef.current.mx;
    const dy = e.clientY - dragRef.current.my;
    angleRef.current.x = dragRef.current.ax + dy * 0.01;
    angleRef.current.y = dragRef.current.ay + dx * 0.01;
  }
  function onMouseUp() { dragRef.current = null; }
  function onWheel(e: React.WheelEvent) {
    if (readonly) return;
    e.preventDefault();
    const ns = Math.max(0.3, Math.min(2.5, s.scale + (e.deltaY > 0 ? -0.08 : 0.08)));
    onStateChange?.({ scale: ns });
  }

  return (
    <div style={{ background: '#030712', borderRadius: '10px', overflow: 'hidden' }}>
      <canvas ref={canvasRef} width={W} height={H}
        style={{ width: '100%', display: 'block', cursor: dragRef.current ? 'grabbing' : 'grab' }}
        onMouseDown={onMouseDown} onMouseMove={onMouseMove}
        onMouseUp={onMouseUp} onMouseLeave={onMouseUp} onWheel={onWheel} />

      {!readonly && (
        <div style={{ background: '#0f1030', padding: '12px 16px', display: 'flex', flexWrap: 'wrap', gap: '12px', alignItems: 'center' }}>
          <div style={{ display: 'flex', gap: '5px' }}>
            {SHAPES.map(sh => (
              <button key={sh} onClick={() => onStateChange?.({ shape: sh })}
                style={{ padding: '4px 10px', borderRadius: '6px', border: `1px solid ${s.shape===sh ? s.color : '#2a2a50'}`, background: s.shape===sh ? s.color+'22' : 'transparent', color: s.shape===sh ? s.color : '#6b7280', fontSize: '11px', cursor: 'pointer', fontWeight: s.shape===sh ? 700 : 400 }}>
                {SHAPE_LABELS[sh]}
              </button>
            ))}
          </div>
          <div style={{ display: 'flex', gap: '5px' }}>
            {COLORS.map(c => (
              <button key={c} onClick={() => onStateChange?.({ color: c })}
                style={{ width: '18px', height: '18px', borderRadius: '50%', background: c, border: s.color===c ? '2px solid #fff' : '2px solid transparent', cursor: 'pointer' }} />
            ))}
          </div>
          <label style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '12px', color: '#d1d5db', cursor: 'pointer' }}>
            <input type="checkbox" checked={s.wireframe} onChange={e => onStateChange?.({ wireframe: e.target.checked })} style={{ accentColor: '#3b5bdb' }} /> Wireframe
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '12px', color: '#d1d5db', cursor: 'pointer' }}>
            <input type="checkbox" checked={s.showAxes} onChange={e => onStateChange?.({ showAxes: e.target.checked })} style={{ accentColor: '#3b5bdb' }} /> Axes
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: '#d1d5db' }}>
            <span style={{ color: '#60a5fa', fontFamily: 'monospace' }}>scale</span>
            <input type="range" min="0.3" max="2.5" step="0.05" value={s.scale}
              onChange={e => onStateChange?.({ scale: parseFloat(e.target.value) })}
              style={{ width: '70px', accentColor: '#3b5bdb' }} />
            <span style={{ fontFamily: 'monospace', minWidth: '28px', color: '#9ca3af' }}>{s.scale.toFixed(1)}x</span>
          </label>
        </div>
      )}
    </div>
  );
}
