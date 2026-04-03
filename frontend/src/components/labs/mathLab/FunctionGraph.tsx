import { useEffect, useRef, useState, useCallback } from 'react';
import type { LabWidgetProps } from '../types';

// ── State shape ───────────────────────────────────────────────────────────────
interface Curve { id:string; label:string; color:string; expr:string; }

interface FuncState {
  a:number; b:number; c:number; d:number;
  xMin:number; xMax:number; yMin:number; yMax:number;
  showGrid:boolean; showTangent:boolean; tangentX:number;
  curves:Curve[]; activeId:string;
  mode3d?: boolean; // 3D surface mode toggle
}

export const DEFAULT_FUNC_STATE: FuncState = {
  a:1, b:1, c:0, d:0,
  xMin:-6.28, xMax:6.28, yMin:-3, yMax:3,
  showGrid:true, showTangent:false, tangentX:0,
  curves:[{ id:'c1', label:'f(x)', color:'#3b5bdb', expr:'a*sin(b*x+c)+d' }],
  activeId:'c1', mode3d:false,
};

// ── Safe math evaluator ───────────────────────────────────────────────────────
function evalExpr(expr:string, x:number, y:number, params:Record<string,number>):number {
  try {
    // eslint-disable-next-line no-new-func
    const fn = new Function('x','y','a','b','c','d','Math',`
      const sin=Math.sin,cos=Math.cos,tan=Math.tan,abs=Math.abs,
            sqrt=Math.sqrt,exp=Math.exp,log=Math.log,PI=Math.PI;
      return ${expr};
    `);
    const v = fn(x, y, params.a, params.b, params.c, params.d, Math);
    return isFinite(v) ? v : NaN;
  } catch { return NaN; }
}

// ── 3-D math for surface ──────────────────────────────────────────────────────
type V3 = [number,number,number];
const rx3=(v:V3,a:number):V3=>[v[0],v[1]*Math.cos(a)-v[2]*Math.sin(a),v[1]*Math.sin(a)+v[2]*Math.cos(a)];
const ry3=(v:V3,a:number):V3=>[v[0]*Math.cos(a)+v[2]*Math.sin(a),v[1],-v[0]*Math.sin(a)+v[2]*Math.cos(a)];
const dot3=(a:V3,b:V3)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
const norm3=(v:V3):V3=>{ const l=Math.sqrt(v[0]**2+v[1]**2+v[2]**2); return l?[v[0]/l,v[1]/l,v[2]/l]:v; };
const LIGHT3=norm3([1,2,-1]);

function proj3D(v:V3,W:number,H:number,vx:number,vy:number):[number,number,number]{
  const p=ry3(rx3(v,vx),vy);
  const fov=320, s=fov/(fov+p[2]+2);
  return [W/2+p[0]*s*1.1, H/2-p[1]*s*1.1, p[2]];
}

function lerpColor(t:number, color:string):[number,number,number] {
  // Map t ∈ [-1,1] to a cool-warm colormap
  const r=parseInt(color.slice(1,3),16);
  const g=parseInt(color.slice(3,5),16);
  const bv=parseInt(color.slice(5,7),16);
  const tn=(t+1)/2; // 0..1
  // Blend: deep-blue → color → yellow
  if (tn<0.5) {
    const f=tn*2;
    return [Math.round(30*( 1-f)+r*f), Math.round(80*(1-f)+g*f), Math.round(180*(1-f)+bv*f)];
  } else {
    const f=(tn-0.5)*2;
    return [Math.round(r*(1-f)+255*f), Math.round(g*(1-f)+200*f), Math.round(bv*(1-f)+50*f)];
  }
}

// ── Draw 3D surface ───────────────────────────────────────────────────────────
function draw3DSurface(
  ctx:CanvasRenderingContext2D, W:number, H:number,
  s:FuncState, vx:number, vy:number
) {
  ctx.clearRect(0,0,W,H);
  // Background
  const bg=ctx.createRadialGradient(W/2,H/2,0,W/2,H/2,260);
  bg.addColorStop(0,'#0e1628'); bg.addColorStop(1,'#050912');
  ctx.fillStyle=bg; ctx.fillRect(0,0,W,H);

  const params={a:s.a,b:s.b,c:s.c,d:s.d};
  const STEPS=28;
  const range=s.xMax-s.xMin;
  const YSCALE=2.5; // how much z maps to visual height

  // Build grid heights
  const grid:(number[])[]=[];
  let yMax=-Infinity, yMin=Infinity;
  for (let j=0;j<=STEPS;j++) {
    grid[j]=[];
    for (let i=0;i<=STEPS;i++) {
      const xv=s.xMin+i/STEPS*range;
      const zv=s.xMin+j/STEPS*range;
      const yv=evalExpr(s.expr??s.curves[0]?.expr??'a*sin(b*x+c)+d', xv, zv, params);
      grid[j][i]=isNaN(yv)?0:yv;
      if (!isNaN(yv)){ yMax=Math.max(yMax,yv); yMin=Math.min(yMin,yv); }
    }
  }
  const yRange=Math.max(yMax-yMin,0.01);

  type Quad={avgZ:number;pts:[number,number][];color:string;};
  const quads:Quad[]=[];

  for (let j=0;j<STEPS;j++) {
    for (let i=0;i<STEPS;i++) {
      const xs=[i,i+1,i+1,i].map(ii=>-1+ii/STEPS*2);
      const zs=[j,j,j+1,j+1].map(jj=>-1+jj/STEPS*2);
      const ys=[
        grid[j][i], grid[j][i+1], grid[j+1][i+1], grid[j+1][i],
      ].map(y=>y/yRange*YSCALE);

      // Face normal for shading
      const p0:V3=[xs[0],ys[0],zs[0]];
      const p1:V3=[xs[1],ys[1],zs[1]];
      const p2:V3=[xs[2],ys[2],zs[2]];
      const e1:V3=[p1[0]-p0[0],p1[1]-p0[1],p1[2]-p0[2]];
      const e2:V3=[p2[0]-p0[0],p2[1]-p0[1],p2[2]-p0[2]];
      const faceN=norm3([e1[1]*e2[2]-e1[2]*e2[1], e1[2]*e2[0]-e1[0]*e2[2], e1[0]*e2[1]-e1[1]*e2[0]]);
      const diff=Math.max(0,dot3(faceN,LIGHT3));
      const intensity=0.3+0.7*diff;

      const avgY=(ys[0]+ys[1]+ys[2]+ys[3])/4;
      const tn=(avgY*yRange/YSCALE-yMin)/yRange*2-1;
      const [r,g,b]=lerpColor(tn, s.curves[0]?.color??'#3b5bdb');
      const ri=Math.round(r*intensity), gi=Math.round(g*intensity), bi=Math.round(b*intensity);
      const color=`rgb(${ri},${gi},${bi})`;

      const pts4 = [p0,p1,p2,[xs[3],ys[3],zs[3]] as V3].map(p=>{
        const [px,py]=proj3D(p,W,H,vx,vy);
        return [px,py] as [number,number];
      });
      const avgZ=pts4.reduce((s,p)=>s+p[0],0)/4; // crude, use actual z
      const pzs=[p0,p1,p2,[xs[3],ys[3],zs[3]] as V3].map(p=>proj3D(p,W,H,vx,vy)[2]);
      const realAvgZ=pzs.reduce((s,z)=>s+z,0)/4;

      quads.push({ avgZ:realAvgZ, pts:pts4, color });
    }
  }

  quads.sort((a,b)=>b.avgZ-a.avgZ);
  for (const {pts,color} of quads) {
    ctx.beginPath();
    ctx.moveTo(pts[0][0],pts[0][1]);
    for (let k=1;k<pts.length;k++) ctx.lineTo(pts[k][0],pts[k][1]);
    ctx.closePath();
    ctx.fillStyle=color; ctx.fill();
    ctx.strokeStyle='rgba(0,0,0,0.15)'; ctx.lineWidth=0.4; ctx.stroke();
  }

  // Axes
  const axisLines:[V3,V3,string,string][]=[
    [[-1.1,0,0],[1.1,0,0],'#ef4444','X'],
    [[0,-1,0],[0,1.4,0],'#22c55e','Y'],
    [[0,0,-1.1],[0,0,1.1],'#60a5fa','Z'],
  ];
  for (const [from,to,col,lbl] of axisLines) {
    const [x1,y1]=proj3D(from,W,H,vx,vy);
    const [x2,y2]=proj3D(to,W,H,vx,vy);
    ctx.strokeStyle=col; ctx.lineWidth=1.2;
    ctx.beginPath(); ctx.moveTo(x1,y1); ctx.lineTo(x2,y2); ctx.stroke();
    ctx.fillStyle=col; ctx.font='11px monospace'; ctx.textAlign='center';
    ctx.fillText(lbl,x2,y2-5);
  }

  // Label
  const active=s.curves[0];
  const exprStr=active?`f(x,z) = ${active.expr}`:'';
  ctx.fillStyle='rgba(255,255,255,0.55)'; ctx.font='700 12px monospace'; ctx.textAlign='left';
  ctx.fillText(exprStr.replace(/\bx\b/g,'x').replace(/\+d/,''),10,20);
  ctx.fillStyle='rgba(255,255,255,0.2)'; ctx.font='10px monospace'; ctx.textAlign='right';
  ctx.fillText('Drag to orbit · 3D Surface',W-8,H-8);
  ctx.textAlign='left';
}

// ── Component ─────────────────────────────────────────────────────────────────
export default function FunctionGraph({ state:rawState, onStateChange, readonly }: LabWidgetProps) {
  const s = rawState as unknown as FuncState;
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [hoverX, setHoverX] = useState<number|null>(null);
  const [dragging, setDragging] = useState(false);
  const [dragStart, setDragStart] = useState<{mx:number;xMin:number;xMax:number;yMin:number;yMax:number}|null>(null);
  const angleRef  = useRef({ x:-0.45, y:0.5 });
  const dragRef3D = useRef<{mx:number;my:number;ax:number;ay:number}|null>(null);
  const rafRef    = useRef<number>(0);
  const stateRef  = useRef(s);
  useEffect(()=>{ stateRef.current=s; },[s]);

  const W=640, H=400;
  const is3D=!!s.mode3d;

  // 3D draw via RAF
  const draw3D = useCallback(()=>{
    const canvas=canvasRef.current; if (!canvas) return;
    const ctx=canvas.getContext('2d')!;
    draw3DSurface(ctx,W,H,stateRef.current,angleRef.current.x,angleRef.current.y);
  },[]);

  useEffect(()=>{
    if (!is3D) { cancelAnimationFrame(rafRef.current); return; }
    let last=performance.now();
    const tick=(now:number)=>{
      if (!dragRef3D.current) angleRef.current.y+=(now-last)*0.00022;
      last=now; draw3D(); rafRef.current=requestAnimationFrame(tick);
    };
    rafRef.current=requestAnimationFrame(tick);
    return ()=>cancelAnimationFrame(rafRef.current);
  },[is3D,draw3D]);

  // World ↔ canvas (2D)
  const wx2cx=useCallback((wx:number)=>(wx-s.xMin)/(s.xMax-s.xMin)*W,[s.xMin,s.xMax]);
  const wy2cy=useCallback((wy:number)=>H-(wy-s.yMin)/(s.yMax-s.yMin)*H,[s.yMin,s.yMax]);
  const cx2wx=useCallback((cx:number)=>s.xMin+cx/W*(s.xMax-s.xMin),[s.xMin,s.xMax]);

  // 2D draw effect
  useEffect(()=>{
    if (is3D) return;
    const canvas=canvasRef.current; if (!canvas) return;
    const ctx=canvas.getContext('2d')!;
    ctx.clearRect(0,0,W,H);
    const params={a:s.a,b:s.b,c:s.c,d:s.d};
    ctx.fillStyle='#0f1117'; ctx.fillRect(0,0,W,H);
    if (s.showGrid) {
      ctx.strokeStyle='#1e2030'; ctx.lineWidth=1;
      const xStep=(s.xMax-s.xMin)/10, yStep=(s.yMax-s.yMin)/8;
      for (let gx=Math.ceil(s.xMin/xStep)*xStep;gx<=s.xMax;gx+=xStep){
        const cx=wx2cx(gx); ctx.beginPath(); ctx.moveTo(cx,0); ctx.lineTo(cx,H); ctx.stroke();
      }
      for (let gy=Math.ceil(s.yMin/yStep)*yStep;gy<=s.yMax;gy+=yStep){
        const cy=wy2cy(gy); ctx.beginPath(); ctx.moveTo(0,cy); ctx.lineTo(W,cy); ctx.stroke();
      }
    }
    const ax0=wx2cx(0), ay0=wy2cy(0);
    ctx.strokeStyle='#4b5563'; ctx.lineWidth=1.5;
    if (ax0>=0&&ax0<=W){ ctx.beginPath(); ctx.moveTo(ax0,0); ctx.lineTo(ax0,H); ctx.stroke(); }
    if (ay0>=0&&ay0<=H){ ctx.beginPath(); ctx.moveTo(0,ay0); ctx.lineTo(W,ay0); ctx.stroke(); }
    ctx.fillStyle='#6b7280'; ctx.font='11px monospace'; ctx.textAlign='center';
    const xStep2=(s.xMax-s.xMin)/10;
    for (let gx=Math.ceil(s.xMin/xStep2)*xStep2;gx<=s.xMax;gx+=xStep2){
      const cx=wx2cx(gx), labelY=Math.min(H-4,Math.max(14,ay0+14));
      if (Math.abs(gx)>0.01) ctx.fillText(gx.toFixed(1),cx,labelY);
    }
    ctx.textAlign='right';
    const yStep2=(s.yMax-s.yMin)/8;
    for (let gy=Math.ceil(s.yMin/yStep2)*yStep2;gy<=s.yMax;gy+=yStep2){
      const cy=wy2cy(gy), labelX=Math.min(W-4,Math.max(28,ax0-4));
      if (Math.abs(gy)>0.01) ctx.fillText(gy.toFixed(1),labelX,cy+4);
    }
    for (const curve of s.curves) {
      const steps=W*2; ctx.beginPath(); let first=true, prevY=NaN;
      for (let i=0;i<=steps;i++){
        const wx=s.xMin+(i/steps)*(s.xMax-s.xMin);
        const wy=evalExpr(curve.expr,wx,0,params);
        const cx=wx2cx(wx), cy=wy2cy(wy);
        if (isNaN(wy)||Math.abs(wy-prevY)>(s.yMax-s.yMin)*2){ first=true; }
        else if (first){ ctx.moveTo(cx,cy); first=false; }
        else ctx.lineTo(cx,cy);
        prevY=wy;
      }
      ctx.strokeStyle=curve.color; ctx.lineWidth=2.5; ctx.stroke();
    }
    if (hoverX!==null) {
      const activeCurve=s.curves.find(c=>c.id===s.activeId)??s.curves[0];
      if (activeCurve) {
        const wy=evalExpr(activeCurve.expr,hoverX,0,params);
        if (!isNaN(wy)) {
          const cx=wx2cx(hoverX), cy=wy2cy(wy);
          ctx.setLineDash([4,4]); ctx.strokeStyle='#9ca3af'; ctx.lineWidth=1;
          ctx.beginPath(); ctx.moveTo(cx,0); ctx.lineTo(cx,H); ctx.stroke();
          ctx.beginPath(); ctx.moveTo(0,cy); ctx.lineTo(W,cy); ctx.stroke();
          ctx.setLineDash([]);
          ctx.fillStyle=activeCurve.color; ctx.beginPath(); ctx.arc(cx,cy,5,0,Math.PI*2); ctx.fill();
          ctx.fillStyle='#fff'; ctx.font='12px monospace'; ctx.textAlign='left';
          const tx=cx+8, ty=cy-8;
          ctx.fillText(`(${hoverX.toFixed(2)}, ${wy.toFixed(2)})`,tx<W-110?tx:tx-130,ty<20?ty+20:ty);
        }
      }
    }
    if (s.showTangent) {
      const activeCurve=s.curves.find(c=>c.id===s.activeId)??s.curves[0];
      if (activeCurve) {
        const dx=0.001, tx=s.tangentX;
        const fy=evalExpr(activeCurve.expr,tx,0,params);
        const slope=(evalExpr(activeCurve.expr,tx+dx,0,params)-evalExpr(activeCurve.expr,tx-dx,0,params))/(2*dx);
        ctx.strokeStyle='#f59e0b'; ctx.lineWidth=1.5; ctx.setLineDash([6,3]);
        ctx.beginPath();
        ctx.moveTo(wx2cx(s.xMin),wy2cy(fy+slope*(s.xMin-tx)));
        ctx.lineTo(wx2cx(s.xMax),wy2cy(fy+slope*(s.xMax-tx)));
        ctx.stroke(); ctx.setLineDash([]);
        ctx.fillStyle='#f59e0b'; ctx.font='11px monospace'; ctx.textAlign='left';
        ctx.fillText(`slope = ${slope.toFixed(3)}`,8,16);
      }
    }
  },[s,hoverX,is3D,wx2cx,wy2cy]);

  // Mouse handlers
  function onMouseMove2D(e:React.MouseEvent<HTMLCanvasElement>) {
    const rect=canvasRef.current!.getBoundingClientRect();
    const scaleX=W/rect.width;
    const cx=(e.clientX-rect.left)*scaleX;
    setHoverX(cx2wx(cx));
    if (dragging&&dragStart&&!readonly) {
      const dxCanvas=(e.clientX-rect.left)*scaleX-dragStart.mx;
      const dxWorld=dxCanvas/W*(s.xMax-s.xMin);
      onStateChange?.({ xMin:dragStart.xMin-dxWorld, xMax:dragStart.xMax-dxWorld });
    }
  }
  function onMouseMove3D(e:React.MouseEvent) {
    if (!dragRef3D.current) return;
    angleRef.current.x=dragRef3D.current.ax+(e.clientY-dragRef3D.current.my)*0.009;
    angleRef.current.y=dragRef3D.current.ay+(e.clientX-dragRef3D.current.mx)*0.009;
  }
  function onWheel(e:React.WheelEvent) {
    if (readonly) return; e.preventDefault();
    const factor=e.deltaY>0?1.15:0.87;
    const cx=(s.xMax+s.xMin)/2, cy=(s.yMax+s.yMin)/2;
    const hw=(s.xMax-s.xMin)/2*factor, hh=(s.yMax-s.yMin)/2*factor;
    onStateChange?.({ xMin:cx-hw, xMax:cx+hw, yMin:cy-hh, yMax:cy+hh });
  }

  const params={a:s.a,b:s.b,c:s.c,d:s.d};
  const activeCurve=s.curves[0];

  return (
    <div style={{ background:'#0f1117', borderRadius:'10px', overflow:'hidden', userSelect:'none' }}>
      <canvas ref={canvasRef} width={W} height={H}
        style={{ width:'100%', display:'block', cursor: is3D?(dragRef3D.current?'grabbing':'grab'):(dragging?'grabbing':'crosshair') }}
        onMouseMove={is3D?onMouseMove3D:onMouseMove2D}
        onMouseLeave={()=>{ setHoverX(null); dragRef3D.current=null; }}
        onMouseDown={e=>{
          if (readonly) return;
          if (is3D) {
            dragRef3D.current={ mx:e.clientX, my:e.clientY, ax:angleRef.current.x, ay:angleRef.current.y };
          } else {
            const rect=canvasRef.current!.getBoundingClientRect();
            setDragging(true);
            setDragStart({ mx:(e.clientX-rect.left)*W/rect.width, xMin:s.xMin, xMax:s.xMax, yMin:s.yMin, yMax:s.yMax });
          }
        }}
        onMouseUp={()=>{ setDragging(false); setDragStart(null); dragRef3D.current=null; }}
        onWheel={!is3D?onWheel:undefined}
      />

      {!readonly && (
        <div style={{ background:'#161822', padding:'12px 16px', display:'flex', flexWrap:'wrap', gap:'14px', alignItems:'center' }}>
          {/* 3D mode toggle */}
          <div style={{ display:'flex', background:'#0f1117', borderRadius:'7px', padding:'2px', gap:'1px' }}>
            {([['2D','false'],['3D Surface','true']] as const).map(([label,val])=>(
              <button key={val} onClick={()=>onStateChange?.({ mode3d: val==='true' })}
                style={{ padding:'4px 12px', borderRadius:'5px', border:'none', background:String(!!s.mode3d)===val?'#1e3a8a':'transparent', color:String(!!s.mode3d)===val?'#60a5fa':'#6b7280', fontSize:'11px', cursor:'pointer', fontWeight:String(!!s.mode3d)===val?700:400 }}>
                {label}
              </button>
            ))}
          </div>

          {/* Expression preview */}
          <div style={{ display:'flex', alignItems:'center', gap:'6px' }}>
            <div style={{ width:'10px', height:'10px', borderRadius:'50%', background:activeCurve?.color??'#3b5bdb' }} />
            <span style={{ fontSize:'12px', color:'#9ca3af', fontFamily:'monospace' }}>
              {is3D?`f(x,z)`:`f(x)`} = {params.a}·sin({params.b}x+{params.c})+{params.d}
            </span>
          </div>

          {/* Parameter sliders */}
          <div style={{ display:'flex', gap:'12px', flexWrap:'wrap' }}>
            {(['a','b','c','d'] as const).map(p=>(
              <label key={p} style={{ display:'flex', alignItems:'center', gap:'6px', fontSize:'12px', color:'#d1d5db' }}>
                <span style={{ fontFamily:'monospace', color:'#60a5fa', minWidth:'12px' }}>{p}</span>
                <input type="range" min="-5" max="5" step="0.1" value={params[p]}
                  onChange={e=>onStateChange?.({[p]:parseFloat(e.target.value)})}
                  style={{ width:'80px', accentColor:'#3b5bdb' }} />
                <span style={{ fontFamily:'monospace', minWidth:'32px' }}>{params[p].toFixed(1)}</span>
              </label>
            ))}
          </div>

          {!is3D && (
            <>
              <label style={{ display:'flex', alignItems:'center', gap:'6px', fontSize:'12px', color:'#d1d5db', cursor:'pointer' }}>
                <input type="checkbox" checked={s.showTangent} onChange={e=>onStateChange?.({showTangent:e.target.checked})} style={{ accentColor:'#f59e0b' }} />
                Tangent
              </label>
              {s.showTangent && (
                <label style={{ display:'flex', alignItems:'center', gap:'6px', fontSize:'12px', color:'#d1d5db' }}>
                  <span style={{ fontFamily:'monospace', color:'#f59e0b' }}>x₀</span>
                  <input type="range" min={s.xMin} max={s.xMax} step="0.01" value={s.tangentX}
                    onChange={e=>onStateChange?.({tangentX:parseFloat(e.target.value)})}
                    style={{ width:'80px', accentColor:'#f59e0b' }} />
                  <span style={{ fontFamily:'monospace', minWidth:'36px' }}>{s.tangentX.toFixed(2)}</span>
                </label>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}