import { useEffect, useRef, useCallback } from 'react';
import type { LabWidgetProps } from '../types';

export interface MechanicsState {
  angle: number; mass: number; friction: number; gravity: number;
  showForces: boolean; showDecomp: boolean; animTime?: number; isSliding?: boolean;
}
export const DEFAULT_MECHANICS_STATE: MechanicsState = {
  angle: 30, mass: 2, friction: 0.2, gravity: 9.8, showForces: true, showDecomp: true,
};

// ── 3-D math ─────────────────────────────────────────────────────────────────
type V3 = [number, number, number];
const add3  = (a: V3, b: V3): V3 => [a[0]+b[0], a[1]+b[1], a[2]+b[2]];
const dot3  = (a: V3, b: V3): number => a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
const norm3 = (v: V3): V3 => { const l=Math.sqrt(v[0]**2+v[1]**2+v[2]**2); return l?[v[0]/l,v[1]/l,v[2]/l]:v; };
const rxv   = (v: V3, a: number): V3 => [v[0], v[1]*Math.cos(a)-v[2]*Math.sin(a), v[1]*Math.sin(a)+v[2]*Math.cos(a)];
const ryv   = (v: V3, a: number): V3 => [v[0]*Math.cos(a)+v[2]*Math.sin(a), v[1], -v[0]*Math.sin(a)+v[2]*Math.cos(a)];
const rzv   = (v: V3, a: number): V3 => [v[0]*Math.cos(a)-v[1]*Math.sin(a), v[0]*Math.sin(a)+v[1]*Math.cos(a), v[2]];
function view(v: V3, vx: number, vy: number): V3 { return ryv(rxv(v, vx), vy); }

const FOV = 560, SCALE = 110;
function proj(v: V3, W: number, H: number): [number,number,number] {
  const s = FOV / (FOV + v[2] + 6);
  return [W/2 + v[0]*s*SCALE, H/2 - v[1]*s*SCALE, v[2]];
}

const LIGHT = norm3([1, 2, -1] as V3);
function shade(base: [number,number,number], n: V3): string {
  const d = Math.max(0, dot3(n, LIGHT));
  const i = 0.28 + 0.72*d;
  return `rgb(${Math.round(base[0]*i)},${Math.round(base[1]*i)},${Math.round(base[2]*i)})`;
}

// ── Geometry builders ────────────────────────────────────────────────────────
interface SceneFace { pts: V3[]; normal: V3; base: [number,number,number]; avgZ: number; }

function wedgeFaces(theta: number): SceneFace[] {
  const L=2.0, H=L*Math.tan(theta), D=0.85;
  // Right-triangle prism: apex at top-left
  // v0=front-bot-left, v1=front-bot-right, v2=front-top-left
  // v3=back-bot-left,  v4=back-bot-right,  v5=back-top-left
  const v: V3[] = [
    [-L/2,-H/2, D/2],[L/2,-H/2, D/2],[-L/2, H/2, D/2],
    [-L/2,-H/2,-D/2],[L/2,-H/2,-D/2],[-L/2, H/2,-D/2],
  ];
  const slopeN = norm3([H, L, 0] as V3); // outward slope normal
  return [
    { pts:[v[0],v[1],v[4],v[3]], normal:[0,-1,0],     base:[22,60,115], avgZ:0 }, // bottom
    { pts:[v[0],v[2],v[5],v[3]], normal:[-1,0,0],     base:[18,48,95],  avgZ:0 }, // left
    { pts:[v[0],v[1],v[2]],      normal:[0,0,1],      base:[25,65,120], avgZ:0 }, // front △
    { pts:[v[3],v[5],v[4]],      normal:[0,0,-1],     base:[25,65,120], avgZ:0 }, // back △
    { pts:[v[2],v[1],v[4],v[5]], normal:slopeN,        base:[38,95,165], avgZ:0 }, // slope
  ];
}

function blockFaces(theta: number): SceneFace[] {
  const hs = 0.225;
  const localV: V3[] = [
    [-hs,-hs,-hs],[hs,-hs,-hs],[hs,hs,-hs],[-hs,hs,-hs],
    [-hs,-hs, hs],[hs,-hs, hs],[hs,hs, hs],[-hs,hs, hs],
  ];
  // Rotate to sit on slope: rotZ(-theta) aligns block bottom with slope surface
  const rv = localV.map(v => rzv(v, -theta));
  // Block center: slope midpoint + half-height in normal direction
  const L=2.0, H=L*Math.tan(theta);
  const slopeN = norm3([H, L, 0] as V3);
  const bc: V3 = [hs*slopeN[0], hs*slopeN[1], 0];
  const wv = rv.map(v => add3(v, bc));
  // Face normals in world space
  const fNormals: [number[],V3][] = [
    [[0,1,2,3], rzv([0,0,-1], -theta) as V3],
    [[4,7,6,5], rzv([0,0, 1], -theta) as V3],
    [[0,4,5,1], rzv([0,-1,0], -theta) as V3],
    [[3,2,6,7], rzv([0, 1,0], -theta) as V3],
    [[0,3,7,4], rzv([-1,0,0], -theta) as V3],
    [[1,5,6,2], rzv([ 1,0,0], -theta) as V3],
  ];
  const BASE: [number,number,number] = [195, 105, 30];
  return fNormals.map(([idx, n]) => ({
    pts: idx.map(i => wv[i]) as V3[],
    normal: n, base: BASE, avgZ: 0,
  }));
}

function groundFace(): SceneFace {
  const g = -1.15, s=3.5;
  return {
    pts: [[-s,g,-s],[s,g,-s],[s,g,s],[-s,g,s]] as V3[],
    normal: [0,1,0], base: [12,22,38], avgZ:0,
  };
}

// ── Arrow drawing ─────────────────────────────────────────────────────────────
function drawArrow3D(
  ctx: CanvasRenderingContext2D,
  p1: [number,number], p2: [number,number],
  color: string, label: string, lineWidth=2.5
) {
  const dx = p2[0]-p1[0], dy = p2[1]-p1[1];
  const len = Math.hypot(dx,dy);
  if (len < 6) return;
  const ux=dx/len, uy=dy/len;
  // shaft
  ctx.strokeStyle=color; ctx.lineWidth=lineWidth;
  ctx.beginPath(); ctx.moveTo(p1[0],p1[1]); ctx.lineTo(p2[0],p2[1]); ctx.stroke();
  // head
  const hs=13;
  ctx.fillStyle=color; ctx.beginPath();
  ctx.moveTo(p2[0],p2[1]);
  ctx.lineTo(p2[0]-ux*hs-uy*hs*0.45, p2[1]-uy*hs+ux*hs*0.45);
  ctx.lineTo(p2[0]-ux*hs+uy*hs*0.45, p2[1]-uy*hs-ux*hs*0.45);
  ctx.closePath(); ctx.fill();
  // label
  ctx.fillStyle=color; ctx.font='bold 11px monospace';
  ctx.fillText(label, (p1[0]+p2[0])/2+uy*16, (p1[1]+p2[1])/2-ux*16);
}

// ── Component ─────────────────────────────────────────────────────────────────
export default function Mechanics3D({ state: rawState, onStateChange, readonly }: LabWidgetProps) {
  const s = rawState as unknown as MechanicsState;
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const angleRef  = useRef({ x: -0.28, y: 0.7 });
  const dragRef   = useRef<{mx:number;my:number;ax:number;ay:number}|null>(null);
  const rafRef    = useRef<number>(0);
  const stateRef  = useRef(s);
  useEffect(() => { stateRef.current = s; }, [s]);

  const W=580, H=400;

  const draw = useCallback(() => {
    const canvas = canvasRef.current; if (!canvas) return;
    const ctx = canvas.getContext('2d')!;
    const s = stateRef.current;
    const theta = s.angle * Math.PI / 180;
    const vx = angleRef.current.x, vy = angleRef.current.y;

    ctx.clearRect(0,0,W,H);
    // Background
    const bg = ctx.createRadialGradient(W/2,H/2,0,W/2,H/2,W*0.65);
    bg.addColorStop(0,'#0e1628'); bg.addColorStop(1,'#050912');
    ctx.fillStyle=bg; ctx.fillRect(0,0,W,H);

    // Physics
    const Fg  = s.mass * s.gravity;
    const Fn  = Fg * Math.cos(theta);
    const Ff  = s.friction * Fn;
    const Fpar = Fg * Math.sin(theta);
    const Fnet = Fpar - Ff;
    const accel = Fnet / s.mass;

    // Build all scene faces
    const allFaces: SceneFace[] = [
      groundFace(),
      ...wedgeFaces(theta),
      ...blockFaces(theta),
    ];

    // Transform + project
    type ProjFace = { pts2: [number,number][]; avgZ: number; color: string };
    const projFaces: ProjFace[] = allFaces.map(f => {
      const viewPts = f.pts.map(p => view(p, vx, vy));
      const avgZ = viewPts.reduce((s,p)=>s+p[2],0)/viewPts.length;
      const viewNormal = view(f.normal, vx, vy) as V3;
      const col = shade(f.base, viewNormal);
      const pts2 = viewPts.map(p => { const [px,py] = proj(p,W,H); return [px,py] as [number,number]; });
      return { pts2, avgZ, color: col };
    });

    // Painter's sort (back to front)
    projFaces.sort((a,b) => b.avgZ - a.avgZ);

    // Draw faces
    for (const { pts2, color } of projFaces) {
      ctx.beginPath();
      ctx.moveTo(pts2[0][0], pts2[0][1]);
      for (let i=1;i<pts2.length;i++) ctx.lineTo(pts2[i][0],pts2[i][1]);
      ctx.closePath();
      ctx.fillStyle = color; ctx.fill();
      ctx.strokeStyle='rgba(0,0,0,0.25)'; ctx.lineWidth=0.7; ctx.stroke();
    }

    // Force arrows
    if (s.showForces) {
      // Block center in world space
      const L=2.0, H=L*Math.tan(theta);
      const slopeN = norm3([H,L,0] as V3);
      const hs=0.225;
      const bcWorld: V3 = [hs*slopeN[0]+hs*Math.sin(theta)*0.1, hs*slopeN[1], 0];
      const bcView = view(bcWorld, vx, vy);
      const [bcx,bcy] = proj(bcView, W, H);

      const FSCALE = 3.2;

      function arrowEnd(dir3World: V3, mag: number): [number,number] {
        const end3 = add3(bcWorld, [dir3World[0]*mag*FSCALE/SCALE/1.8, dir3World[1]*mag*FSCALE/SCALE/1.8, dir3World[2]*mag*FSCALE/SCALE/1.8] as V3);
        const ev = view(end3, vx, vy);
        const [ex,ey] = proj(ev, W, H);
        return [ex,ey];
      }

      // Weight (gravity, straight down)
      drawArrow3D(ctx,[bcx,bcy],arrowEnd([0,-1,0],Fg),'#ef4444',`Fg=${Fg.toFixed(1)}N`);
      // Normal force (along slope normal)
      drawArrow3D(ctx,[bcx,bcy],arrowEnd(slopeN,Fn),'#10b981',`N=${Fn.toFixed(1)}N`);
      // Friction (up slope = toward apex)
      const L2=2.0, H2=L2*Math.tan(theta);
      const upSlope = norm3([-L2, H2, 0] as V3);
      drawArrow3D(ctx,[bcx,bcy],arrowEnd(upSlope,Ff),'#a78bfa',`f=${Ff.toFixed(1)}N`);
      // Net force (down slope) if enabled
      if (s.showDecomp && Math.abs(Fnet)>0.05) {
        const downSlope = norm3([L2, -H2, 0] as V3);
        const sign = Fnet > 0 ? 1 : -1;
        drawArrow3D(ctx,[bcx,bcy],arrowEnd(downSlope,Math.abs(Fnet)*sign),'#fbbf24',`F=${Fnet.toFixed(1)}N`,3.5);
      }
    }

    // Info panel
    const px=W-175, py=12;
    ctx.fillStyle='rgba(8,15,35,0.88)';
    ctx.beginPath(); (ctx as any).roundRect?.(px,py,162,140,8) ?? ctx.rect(px,py,162,140);
    ctx.fill(); ctx.strokeStyle='#1e3a5f'; ctx.lineWidth=1; ctx.stroke();
    ctx.fillStyle='#60a5fa'; ctx.font='700 12px monospace'; ctx.textAlign='left';
    ctx.fillText('Force Analysis',px+10,py+20);
    const rows: [string,string][] = [
      ['#ef4444',`Fg   = ${Fg.toFixed(2)} N`],
      ['#10b981',`N    = ${Fn.toFixed(2)} N`],
      ['#a78bfa',`f    = ${Ff.toFixed(2)} N`],
      ['#fbbf24',`F∥   = ${Fpar.toFixed(2)} N`],
      [Fnet>0.05?'#f97316':'#10b981',`a    = ${Math.abs(accel).toFixed(2)} m/s²`],
      ['#94a3b8',`θ    = ${s.angle}°`],
    ];
    rows.forEach(([c,t],i)=>{ ctx.fillStyle=c; ctx.font='11px monospace'; ctx.fillText(t,px+10,py+40+i*17); });

    // Drag hint
    ctx.fillStyle='rgba(255,255,255,0.2)'; ctx.font='10px monospace'; ctx.textAlign='right';
    ctx.fillText('Drag to orbit · 3D Scene',W-8,H-8);
    ctx.textAlign='left';
  }, []);

  // RAF loop
  useEffect(() => {
    let last = performance.now();
    const tick = (now: number) => {
      if (!dragRef.current) angleRef.current.y += (now-last)*0.00025;
      last=now; draw(); rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [draw]);

  function onMouseDown(e: React.MouseEvent) {
    dragRef.current = { mx:e.clientX, my:e.clientY, ax:angleRef.current.x, ay:angleRef.current.y };
  }
  function onMouseMove(e: React.MouseEvent) {
    if (!dragRef.current) return;
    angleRef.current.x = Math.max(-1.2, Math.min(1.2, dragRef.current.ax + (e.clientY-dragRef.current.my)*0.009));
    angleRef.current.y = dragRef.current.ay + (e.clientX-dragRef.current.mx)*0.009;
  }
  function onMouseUp() { dragRef.current=null; }

  function onTouchStart(e: React.TouchEvent) {
    const t=e.touches[0];
    dragRef.current = { mx:t.clientX, my:t.clientY, ax:angleRef.current.x, ay:angleRef.current.y };
  }
  function onTouchMove(e: React.TouchEvent) {
    if (!dragRef.current) return; e.preventDefault();
    const t=e.touches[0];
    angleRef.current.x = Math.max(-1.2, Math.min(1.2, dragRef.current.ax+(t.clientY-dragRef.current.my)*0.009));
    angleRef.current.y = dragRef.current.ay+(t.clientX-dragRef.current.mx)*0.009;
  }

  return (
    <div style={{ background:'#050912', borderRadius:'10px', overflow:'hidden', display: 'inline-block', verticalAlign: 'top', width: W, boxSizing: 'border-box' }}>
      <canvas ref={canvasRef} width={W} height={H}
        style={{ width: W, height: H, display:'block', cursor: dragRef.current?'grabbing':'grab' }}
        onMouseDown={onMouseDown} onMouseMove={onMouseMove} onMouseUp={onMouseUp} onMouseLeave={onMouseUp}
        onTouchStart={onTouchStart} onTouchMove={onTouchMove} onTouchEnd={onMouseUp} />

      {!readonly && (
        <div style={{ background:'#0f1030', padding:'12px 16px', display:'flex', flexWrap:'wrap', gap:'14px', alignItems:'center' }}>
          {[
            { key:'angle',    label:'θ (°)',  min:0,   max:80,  step:1,    color:'#60a5fa', suffix:'°',  dec:0 },
            { key:'mass',     label:'m (kg)', min:0.5, max:20,  step:0.5,  color:'#f97316', suffix:'kg', dec:1 },
            { key:'friction', label:'μ',      min:0,   max:1,   step:0.01, color:'#a78bfa', suffix:'',   dec:2 },
            { key:'gravity',  label:'g',      min:1,   max:25,  step:0.1,  color:'#10b981', suffix:'',   dec:1 },
          ].map(({ key, label, min, max, step, color, suffix, dec }) => (
            <label key={key} style={{ display:'flex', alignItems:'center', gap:'6px', fontSize:'12px', color:'#d1d5db' }}>
              <span style={{ color, fontFamily:'monospace', minWidth:'50px' }}>{label}</span>
              <input type="range" min={min} max={max} step={step}
                value={s[key as keyof MechanicsState] as number}
                onChange={e => onStateChange?.({ [key]: parseFloat(e.target.value) })}
                style={{ width:'80px', accentColor:color }} />
              <span style={{ fontFamily:'monospace', minWidth:'42px', color:'#9ca3af' }}>
                {(s[key as keyof MechanicsState] as number).toFixed(dec)}{suffix}
              </span>
            </label>
          ))}
          {[{key:'showForces',label:'Forces'},{key:'showDecomp',label:'Net Force'}].map(({key,label})=>(
            <label key={key} style={{ display:'flex', alignItems:'center', gap:'5px', fontSize:'12px', color:'#d1d5db', cursor:'pointer' }}>
              <input type="checkbox" checked={!!s[key as keyof MechanicsState]}
                onChange={e=>onStateChange?.({[key]:e.target.checked})} style={{ accentColor:'#3b5bdb' }} />
              {label}
            </label>
          ))}
        </div>
      )}
    </div>
  );
}
