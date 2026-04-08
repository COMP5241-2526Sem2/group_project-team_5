import { useEffect, useRef, useCallback, useState } from 'react';
import type { LabWidgetProps } from '../types';

// ── 3-D organelle definitions ─────────────────────────────────────────────────
interface Organelle3D {
  id: string; name: string; color: string; description: string;
  x: number; y: number; z: number; // 3D centre
  r: number;  // display radius
}

const ORGANELLES: Organelle3D[] = [
  { id:'nucleus',    name:'Nucleus',        color:'#3b5bdb', r:63,  x:0,    y:0,    z:0,
    description:'Contains DNA; controls all cellular activities via gene expression.' },
  { id:'nucleolus',  name:'Nucleolus',      color:'#1d4ed8', r:21,  x:-8,   y:-8,   z:18,
    description:'Produces ribosomal RNA (rRNA); found inside the nucleus.' },
  { id:'mito1',      name:'Mitochondria',   color:'#f97316', r:25,  x:118,  y:35,   z:52,
    description:'ATP production via cellular respiration — the cell\'s powerhouse.' },
  { id:'mito2',      name:'Mitochondria',   color:'#f97316', r:22,  x:-128, y:50,   z:-35,
    description:'ATP production via cellular respiration — the cell\'s powerhouse.' },
  { id:'er_rough',   name:'Rough ER',       color:'#8b5cf6', r:22,  x:98,   y:-65,  z:42,
    description:'Studded with ribosomes; synthesises and folds proteins.' },
  { id:'er_smooth',  name:'Smooth ER',      color:'#a78bfa', r:18,  x:-100, y:-62,  z:36,
    description:'Lipid synthesis and detoxification; no ribosomes.' },
  { id:'golgi',      name:'Golgi Apparatus',color:'#10b981', r:24,  x:22,   y:92,   z:-32,
    description:'Packages and ships proteins; the cell\'s post office.' },
  { id:'lysosome',   name:'Lysosome',       color:'#ef4444', r:16,  x:-52,  y:85,   z:50,
    description:'Contains digestive enzymes; breaks down waste and debris.' },
  { id:'vacuole',    name:'Vacuole',        color:'#06b6d4', r:26,  x:-128, y:-20,  z:-48,
    description:'Stores nutrients and waste; larger in plant cells.' },
  { id:'ribosome1',  name:'Ribosome',       color:'#fbbf24', r:9,   x:52,   y:-108, z:38,
    description:'Site of protein synthesis; reads mRNA to build polypeptides.' },
  { id:'ribosome2',  name:'Ribosome',       color:'#fbbf24', r:9,   x:90,   y:90,   z:-22,
    description:'Site of protein synthesis; reads mRNA to build polypeptides.' },
  { id:'centriole',  name:'Centriole',      color:'#e879f9', r:11,  x:48,   y:108,  z:34,
    description:'Organises the mitotic spindle during cell division.' },
];

// ── State ─────────────────────────────────────────────────────────────────────
export interface CellState {
  showMembrane: boolean; highlighted: string|null; visibleLayers: Record<string,boolean>;
}
export const DEFAULT_CELL_STATE: CellState = {
  showMembrane:true, highlighted:null,
  visibleLayers: Object.fromEntries(ORGANELLES.map(o=>[o.id,true])),
};

// ── 3-D math ──────────────────────────────────────────────────────────────────
type V3 = [number,number,number];
const rx3=(v:V3,a:number):V3=>[v[0],v[1]*Math.cos(a)-v[2]*Math.sin(a),v[1]*Math.sin(a)+v[2]*Math.cos(a)];
const ry3=(v:V3,a:number):V3=>[v[0]*Math.cos(a)+v[2]*Math.sin(a),v[1],-v[0]*Math.sin(a)+v[2]*Math.cos(a)];
function applyView(p:[number,number,number],vx:number,vy:number):V3 {
  return ry3(rx3(p as V3,vx),vy);
}

const FOV=650;
function proj3(v:V3,W:number,H:number):[number,number,number] {
  const s=FOV/(FOV+v[2]+4);
  return [W/2+v[0]*s, H/2-v[1]*s, v[2]];
}

// ── Draw lit sphere ───────────────────────────────────────────────────────────
function drawSphere3D(ctx:CanvasRenderingContext2D,cx:number,cy:number,r:number,hex:string,isHl:boolean) {
  if (r<2) return;
  if (isHl) {
    const glow=ctx.createRadialGradient(cx,cy,r*0.4,cx,cy,r*2.1);
    glow.addColorStop(0,hex+'50'); glow.addColorStop(1,'transparent');
    ctx.fillStyle=glow; ctx.beginPath(); ctx.arc(cx,cy,r*2.1,0,Math.PI*2); ctx.fill();
  }
  const rr=parseInt(hex.slice(1,3),16), gg=parseInt(hex.slice(3,5),16), bb=parseInt(hex.slice(5,7),16);
  const dark=(c:number)=>Math.max(0,c-80);
  const hx=cx-r*0.3, hy=cy-r*0.3;
  const g=ctx.createRadialGradient(hx,hy,r*0.04,cx,cy,r*1.02);
  g.addColorStop(0,'rgba(255,255,255,0.88)');
  g.addColorStop(0.2,hex);
  g.addColorStop(0.65,hex);
  g.addColorStop(1,`rgb(${dark(rr)},${dark(gg)},${dark(bb)})`);
  ctx.beginPath(); ctx.arc(cx,cy,r,0,Math.PI*2);
  ctx.fillStyle=g; ctx.fill();
  ctx.strokeStyle=isHl?'#ffffff':hex+'99'; ctx.lineWidth=isHl?2:0.8; ctx.stroke();
}

// ── Draw 3-D ellipsoid outline (cell membrane) ───────────────────────────────
function drawMembrane(ctx:CanvasRenderingContext2D,W:number,H:number,vx:number,vy:number) {
  const RX=175, RY=158, RZ=140;
  const LATS=7, LONS=10;
  ctx.strokeStyle='rgba(52,211,153,0.45)'; ctx.lineWidth=1.5; ctx.setLineDash([5,4]);

  // Latitude rings
  for (let li=1;li<LATS;li++) {
    const phi=(li/LATS)*Math.PI-Math.PI/2;
    const cosP=Math.cos(phi), sinP=Math.sin(phi);
    const pts: [number,number][] = [];
    const STEPS=40;
    for (let si=0;si<=STEPS;si++) {
      const theta=(si/STEPS)*Math.PI*2;
      const p: V3 = [RX*Math.cos(theta)*cosP, RY*sinP, RZ*Math.sin(theta)*cosP];
      const pv=applyView(p,vx,vy);
      const [px,py]=proj3(pv,W,H);
      pts.push([px,py]);
    }
    ctx.beginPath(); ctx.moveTo(pts[0][0],pts[0][1]);
    for (let i=1;i<pts.length;i++) ctx.lineTo(pts[i][0],pts[i][1]);
    ctx.stroke();
  }

  // Longitude meridians
  for (let li=0;li<LONS;li++) {
    const theta=(li/LONS)*Math.PI*2;
    const pts: [number,number][] = [];
    const STEPS=30;
    for (let si=0;si<=STEPS;si++) {
      const phi=(si/STEPS)*Math.PI-Math.PI/2;
      const cosP=Math.cos(phi), sinP=Math.sin(phi);
      const p: V3 = [RX*Math.cos(theta)*cosP, RY*sinP, RZ*Math.sin(theta)*cosP];
      const pv=applyView(p,vx,vy);
      const [px,py]=proj3(pv,W,H);
      pts.push([px,py]);
    }
    ctx.beginPath(); ctx.moveTo(pts[0][0],pts[0][1]);
    for (let i=1;i<pts.length;i++) ctx.lineTo(pts[i][0],pts[i][1]);
    ctx.stroke();
  }
  ctx.setLineDash([]);
}

// ── Component ─────────────────────────────────────────────────────────────────
export default function CellViewer({ state:rawState, onStateChange, readonly }: LabWidgetProps) {
  const s = rawState as unknown as CellState;
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const angleRef  = useRef({ x:-0.18, y:0.3 });
  const dragRef   = useRef<{mx:number;my:number;ax:number;ay:number}|null>(null);
  const rafRef    = useRef<number>(0);
  const stateRef  = useRef(s);
  const [tooltip, setTooltip] = useState<{x:number;y:number;name:string;color:string}|null>(null);
  useEffect(()=>{ stateRef.current=s; },[s]);

  const W=580, H=420;

  const draw = useCallback(()=>{
    const canvas=canvasRef.current; if (!canvas) return;
    const ctx=canvas.getContext('2d')!;
    const s=stateRef.current;
    const vx=angleRef.current.x, vy=angleRef.current.y;

    ctx.clearRect(0,0,W,H);
    const bg=ctx.createRadialGradient(W/2,H/2,0,W/2,H/2,240);
    bg.addColorStop(0,'#0d1529'); bg.addColorStop(1,'#050912');
    ctx.fillStyle=bg; ctx.fillRect(0,0,W,H);

    // Cytoplasm fill (ellipse)
    const cyto=ctx.createRadialGradient(W/2-30,H/2-30,0,W/2,H/2,200);
    cyto.addColorStop(0,'rgba(20,40,80,0.5)'); cyto.addColorStop(1,'rgba(5,10,20,0.15)');
    ctx.fillStyle=cyto; ctx.beginPath(); ctx.ellipse(W/2,H/2,175,158,0,0,Math.PI*2); ctx.fill();

    // Cell membrane
    if (s.showMembrane) drawMembrane(ctx,W,H,vx,vy);

    // Project all organelles
    type ProjOrg = { org:Organelle3D; px:number; py:number; pz:number; r:number; };
    const projOrgs: ProjOrg[] = ORGANELLES
      .filter(o=>s.visibleLayers[o.id]!==false)
      .map(o=>{
        const pv=applyView([o.x,o.y,o.z],vx,vy);
        const [px,py,pz]=proj3(pv,W,H);
        const perspScale=FOV/(FOV+pz+4);
        return { org:o, px, py, pz, r:o.r*perspScale };
      });

    // Painter's sort: back to front (nucleus rendered after others so it overlaps)
    projOrgs.sort((a,b)=>{
      // nucleus always rendered after other organelles (it contains nucleolus visually)
      if (a.org.id==='nucleus' && b.org.id!=='nucleolus') return 1;
      if (b.org.id==='nucleus' && a.org.id!=='nucleolus') return -1;
      return b.pz-a.pz;
    });

    for (const { org, px, py, r } of projOrgs) {
      drawSphere3D(ctx,px,py,Math.max(5,r),org.color,s.highlighted===org.id);
    }

    // Name label for highlighted
    if (s.highlighted) {
      const fo=projOrgs.find(p=>p.org.id===s.highlighted);
      if (fo) {
        ctx.fillStyle=fo.org.color; ctx.font='700 13px monospace'; ctx.textAlign='center';
        ctx.fillText(fo.org.name, fo.px, fo.py-fo.r-8);
      }
    }

    // Corner label
    ctx.textAlign='left'; ctx.fillStyle='rgba(255,255,255,0.38)'; ctx.font='11px monospace';
    ctx.fillText('Animal Cell · 3D View · Click organelle to learn',10,20);
    ctx.fillStyle='rgba(255,255,255,0.18)'; ctx.textAlign='right';
    ctx.fillText('Drag to rotate',W-8,H-8);
    ctx.textAlign='left';
  },[]);

  useEffect(()=>{
    let last=performance.now();
    const tick=(now:number)=>{
      if (!dragRef.current) angleRef.current.y+=(now-last)*0.00022;
      last=now; draw(); rafRef.current=requestAnimationFrame(tick);
    };
    rafRef.current=requestAnimationFrame(tick);
    return ()=>cancelAnimationFrame(rafRef.current);
  },[draw]);

  function projOrg(o:Organelle3D):[number,number,number] {
    const vx=angleRef.current.x, vy=angleRef.current.y;
    const pv=applyView([o.x,o.y,o.z],vx,vy);
    return proj3(pv,W,H);
  }

  function hitTest(mx:number,my:number):Organelle3D|null {
    const s=stateRef.current;
    let best:Organelle3D|null=null, bestZ=Infinity;
    for (const o of ORGANELLES) {
      if (s.visibleLayers[o.id]===false) continue;
      const [px,py,pz]=projOrg(o);
      const r=o.r*(FOV/(FOV+pz+4));
      if (Math.hypot(mx-px,my-py)<r+4 && pz<bestZ) { bestZ=pz; best=o; }
    }
    return best;
  }

  function handleClick(e:React.MouseEvent<HTMLCanvasElement>) {
    if (readonly) return;
    const rect=canvasRef.current!.getBoundingClientRect();
    const mx=(e.clientX-rect.left)*W/rect.width;
    const my=(e.clientY-rect.top)*H/rect.height;
    const hit=hitTest(mx,my);
    onStateChange?.({ highlighted: hit?.id===s.highlighted?null:hit?.id??null });
  }

  function handleMouseMove(e:React.MouseEvent<HTMLCanvasElement>) {
    if (dragRef.current) { onMouseMove(e); return; }
    const rect=canvasRef.current!.getBoundingClientRect();
    const mx=(e.clientX-rect.left)*W/rect.width;
    const my=(e.clientY-rect.top)*H/rect.height;
    const hit=hitTest(mx,my);
    if (hit) setTooltip({ x:e.clientX-rect.left, y:e.clientY-rect.top, name:hit.name, color:hit.color });
    else setTooltip(null);
  }

  function onMouseDown(e:React.MouseEvent) {
    setTooltip(null);
    dragRef.current={ mx:e.clientX, my:e.clientY, ax:angleRef.current.x, ay:angleRef.current.y };
  }
  function onMouseMove(e:React.MouseEvent) {
    if (!dragRef.current) return;
    angleRef.current.x=Math.max(-1.2,Math.min(1.2,dragRef.current.ax+(e.clientY-dragRef.current.my)*0.008));
    angleRef.current.y=dragRef.current.ay+(e.clientX-dragRef.current.mx)*0.008;
  }
  function onMouseUp() { dragRef.current=null; }

  const selectedOrg=ORGANELLES.find(o=>o.id===s.highlighted);
  const uniqueOrgs=ORGANELLES.filter((o,i,arr)=>arr.findIndex(b=>b.name===o.name)===i);

  return (
    <div style={{ background:'#050912', borderRadius:'10px', overflow:'hidden', display: 'inline-block', verticalAlign: 'top', width: W, boxSizing: 'border-box' }}>
      <div style={{ position:'relative' }}>
        <canvas ref={canvasRef} width={W} height={H}
          style={{ width: W, height: H, display:'block', cursor: dragRef.current?'grabbing':'grab' }}
          onMouseDown={onMouseDown} onMouseMove={handleMouseMove}
          onMouseUp={onMouseUp} onMouseLeave={()=>{ dragRef.current=null; setTooltip(null); }}
          onClick={handleClick} />

        {/* Info panel for selected organelle */}
        {selectedOrg && (
          <div style={{ position:'absolute', bottom:'12px', left:'12px', background:'rgba(3,7,18,0.92)', backdropFilter:'blur(8px)', padding:'10px 14px', borderRadius:'9px', border:`1px solid ${selectedOrg.color}44`, maxWidth:'240px' }}>
            <div style={{ display:'flex', alignItems:'center', gap:'7px', marginBottom:'5px' }}>
              <div style={{ width:'10px', height:'10px', borderRadius:'50%', background:selectedOrg.color, flexShrink:0 }} />
              <span style={{ fontSize:'13px', fontWeight:700, color:'#e2e8f0' }}>{selectedOrg.name}</span>
            </div>
            <p style={{ fontSize:'11px', color:'#9ca3af', margin:0, lineHeight:1.6 }}>{selectedOrg.description}</p>
          </div>
        )}

        {/* Hover tooltip */}
        {tooltip && !selectedOrg && (
          <div style={{ position:'absolute', top:tooltip.y-34, left:tooltip.x+12, background:'rgba(0,0,0,0.82)', padding:'3px 9px', borderRadius:'5px', fontSize:'11px', color:'#e2e8f0', pointerEvents:'none', whiteSpace:'nowrap', border:`1px solid ${tooltip.color}44` }}>
            {tooltip.name}
          </div>
        )}
      </div>

      {!readonly && (
        <div style={{ background:'#080c1a', padding:'12px 16px' }}>
          <div style={{ display:'flex', flexWrap:'wrap', gap:'6px', marginBottom:'8px', alignItems:'center' }}>
            <label style={{ display:'flex', alignItems:'center', gap:'5px', fontSize:'12px', color:'#d1d5db', cursor:'pointer', marginRight:'8px' }}>
              <input type="checkbox" checked={s.showMembrane}
                onChange={e=>onStateChange?.({showMembrane:e.target.checked})} style={{ accentColor:'#3b5bdb' }} />
              Cell Membrane
            </label>
            <span style={{ fontSize:'11px', color:'#4b5563', marginLeft:'4px' }}>
              Rotate 3D view by dragging the cell
            </span>
          </div>
          <div style={{ display:'flex', flexWrap:'wrap', gap:'6px' }}>
            {uniqueOrgs.map(org=>{
              const allIds=ORGANELLES.filter(o=>o.name===org.name).map(o=>o.id);
              const visible=allIds.every(id=>s.visibleLayers[id]!==false);
              return (
                <button key={org.id} onClick={()=>{
                  const patch=Object.fromEntries(allIds.map(id=>[id,!visible]));
                  onStateChange?.({ visibleLayers:{...s.visibleLayers,...patch} });
                }}
                  style={{ display:'flex', alignItems:'center', gap:'4px', padding:'3px 9px', borderRadius:'6px', border:`1px solid ${visible?org.color+'66':'#1e293b'}`, background:visible?org.color+'11':'transparent', cursor:'pointer' }}>
                  <div style={{ width:'7px', height:'7px', borderRadius:'50%', background:visible?org.color:'#374151' }} />
                  <span style={{ fontSize:'10px', color:visible?org.color:'#4b5563', fontWeight:visible?600:400 }}>{org.name}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
