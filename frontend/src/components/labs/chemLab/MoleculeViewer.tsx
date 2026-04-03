import { useEffect, useRef, useCallback } from 'react';
import type { LabWidgetProps } from '../types';

// ── CPK colours & van-der-Waals radii (display units) ────────────────────────
const ATOM_COLOR: Record<string, string> = {
  H:'#e2e8f0', O:'#ef4444', C:'#4b5563', N:'#3b5bdb',
  Cl:'#22c55e', S:'#eab308', P:'#f97316', Or:'#ef4444', // Or = ring-oxygen alias
};
const ATOM_R: Record<string, number> = {
  H:13, O:20, C:20, N:18, Cl:24, S:22, P:21, Or:20,
};

// ── 3-D atom/bond database ────────────────────────────────────────────────────
interface Atom3D { id:string; el:string; x:number; y:number; z:number; }
interface Bond    { a:string; b:string; order:1|2|3; }
interface Mol3D   { name:string; formula:string; atoms:Atom3D[]; bonds:Bond[]; geometry:string; }

const MOLECULES: Record<string,Mol3D> = {
  water: {
    name:'Water', formula:'H₂O', geometry:'Bent (104.5°)',
    atoms:[
      { id:'O',  el:'O',  x:  0,   y:  0,  z:  0 },
      { id:'H1', el:'H',  x:-78,   y:-58,  z:-18 },
      { id:'H2', el:'H',  x: 78,   y:-58,  z:-18 },
    ],
    bonds:[{a:'O',b:'H1',order:1},{a:'O',b:'H2',order:1}],
  },
  co2: {
    name:'Carbon Dioxide', formula:'CO₂', geometry:'Linear (180°)',
    atoms:[
      { id:'C',  el:'C',  x:   0,  y:  0,  z: 0 },
      { id:'O1', el:'O',  x:-115,  y:  0,  z: 0 },
      { id:'O2', el:'O',  x: 115,  y:  0,  z: 0 },
    ],
    bonds:[{a:'C',b:'O1',order:2},{a:'C',b:'O2',order:2}],
  },
  ammonia: {
    name:'Ammonia', formula:'NH₃', geometry:'Trigonal pyramidal',
    atoms:[
      { id:'N',  el:'N',  x:  0,   y: 28,  z:   0 },
      { id:'H1', el:'H',  x:-80,   y:-36,  z:  56 },
      { id:'H2', el:'H',  x: 80,   y:-36,  z:  56 },
      { id:'H3', el:'H',  x:  0,   y:-36,  z: -82 },
    ],
    bonds:[{a:'N',b:'H1',order:1},{a:'N',b:'H2',order:1},{a:'N',b:'H3',order:1}],
  },
  methane: {
    name:'Methane', formula:'CH₄', geometry:'Tetrahedral (109.5°)',
    atoms:[
      { id:'C',  el:'C',  x:  0,   y:  0,  z:   0 },
      { id:'H1', el:'H',  x: 72,   y: 72,  z:  72 },
      { id:'H2', el:'H',  x: 72,   y:-72,  z: -72 },
      { id:'H3', el:'H',  x:-72,   y: 72,  z: -72 },
      { id:'H4', el:'H',  x:-72,   y:-72,  z:  72 },
    ],
    bonds:[
      {a:'C',b:'H1',order:1},{a:'C',b:'H2',order:1},
      {a:'C',b:'H3',order:1},{a:'C',b:'H4',order:1},
    ],
  },
  ethanol: {
    name:'Ethanol', formula:'C₂H₅OH', geometry:'Tetrahedral carbons',
    atoms:[
      { id:'C1', el:'C',  x:-82,  y:  0,  z:  0 },
      { id:'C2', el:'C',  x: 42,  y:  0,  z:  0 },
      { id:'O',  el:'O',  x:118,  y:-52,  z:  0 },
      { id:'H1', el:'H',  x:-132, y:-60,  z: 36 },
      { id:'H2', el:'H',  x:-132, y:-60,  z:-36 },
      { id:'H3', el:'H',  x: -92, y: 80,  z:  0 },
      { id:'H4', el:'H',  x:  52, y: 72,  z: 46 },
      { id:'H5', el:'H',  x:  52, y: 72,  z:-46 },
      { id:'H6', el:'H',  x: 172, y:-52,  z:  0 },
    ],
    bonds:[
      {a:'C1',b:'C2',order:1},{a:'C2',b:'O',order:1},
      {a:'C1',b:'H1',order:1},{a:'C1',b:'H2',order:1},{a:'C1',b:'H3',order:1},
      {a:'C2',b:'H4',order:1},{a:'C2',b:'H5',order:1},{a:'O',b:'H6',order:1},
    ],
  },
  glucose: {
    name:'Glucose (pyranose)', formula:'C₆H₁₂O₆', geometry:'Chair conformation',
    atoms:[
      // Ring atoms (simplified chair conformation)
      { id:'C1', el:'C',  x:-100, y:-28,  z:-52 },
      { id:'C2', el:'C',  x:-100, y: 32,  z: 52 },
      { id:'C3', el:'C',  x:   0, y: 68,  z: 52 },
      { id:'C4', el:'C',  x: 100, y: 32,  z:-52 },
      { id:'C5', el:'C',  x: 100, y:-28,  z:-52 },
      { id:'Or', el:'Or', x:   0, y:-65,  z:-52 },
      // Substituents
      { id:'O1', el:'O',  x:-158, y:-28,  z:-100 },
      { id:'O2', el:'O',  x:-155, y: 48,  z:  90 },
      { id:'O3', el:'O',  x:   0, y:125,  z:  90 },
      { id:'O4', el:'O',  x: 155, y: 48,  z: -90 },
      { id:'C6', el:'C',  x: 148, y:-28,  z:   8 },
      { id:'O6', el:'O',  x: 195, y: 28,  z:   8 },
    ],
    bonds:[
      {a:'C1',b:'C2',order:1},{a:'C2',b:'C3',order:1},{a:'C3',b:'C4',order:1},
      {a:'C4',b:'C5',order:1},{a:'C5',b:'Or',order:1},{a:'Or',b:'C1',order:1},
      {a:'C1',b:'O1',order:1},{a:'C2',b:'O2',order:1},{a:'C3',b:'O3',order:1},
      {a:'C4',b:'O4',order:1},{a:'C5',b:'C6',order:1},{a:'C6',b:'O6',order:1},
    ],
  },
};

// ── State ─────────────────────────────────────────────────────────────────────
export interface MoleculeState {
  moleculeKey: string; showLabels: boolean; highlighted: string|null; zoom: number;
}
export const DEFAULT_MOLECULE_STATE: MoleculeState = {
  moleculeKey:'water', showLabels:true, highlighted:null, zoom:1,
};

// ── 3-D math (local) ──────────────────────────────────────────────────────────
type V3 = [number,number,number];
const rx3 = (v:V3,a:number):V3 => [v[0], v[1]*Math.cos(a)-v[2]*Math.sin(a), v[1]*Math.sin(a)+v[2]*Math.cos(a)];
const ry3 = (v:V3,a:number):V3 => [v[0]*Math.cos(a)+v[2]*Math.sin(a), v[1], -v[0]*Math.sin(a)+v[2]*Math.cos(a)];
function viewAtom(a:Atom3D, vx:number, vy:number): V3 {
  return ry3(rx3([a.x,a.y,a.z],vx),vy);
}

const FOV=600;
function projAtom(v:V3, W:number, H:number, zoom:number): [number,number,number] {
  const s = FOV/(FOV+v[2]+4) * zoom;
  return [W/2+v[0]*s, H/2-v[1]*s, v[2]];
}

// ── Draw a sphere with lighting ────────────────────────────────────────────────
function drawSphere(
  ctx:CanvasRenderingContext2D, cx:number, cy:number, r:number,
  hexColor:string, isHl:boolean
) {
  // Glow for highlighted
  if (isHl) {
    const glow = ctx.createRadialGradient(cx,cy,r*0.3,cx,cy,r*2.2);
    glow.addColorStop(0, hexColor+'55'); glow.addColorStop(1,'transparent');
    ctx.fillStyle=glow; ctx.beginPath(); ctx.arc(cx,cy,r*2.2,0,Math.PI*2); ctx.fill();
  }
  // Parse hex to RGB
  const rr=parseInt(hexColor.slice(1,3),16);
  const gg=parseInt(hexColor.slice(3,5),16);
  const bb=parseInt(hexColor.slice(5,7),16);
  const dark=(c:number)=>Math.max(0,c-75);
  // Lit sphere: light from upper-left
  const hx=cx-r*0.32, hy=cy-r*0.32;
  const grad=ctx.createRadialGradient(hx,hy,r*0.05,cx,cy,r*1.05);
  grad.addColorStop(0,'rgba(255,255,255,0.92)');
  grad.addColorStop(0.22, hexColor);
  grad.addColorStop(0.65, hexColor);
  grad.addColorStop(1, `rgb(${dark(rr)},${dark(gg)},${dark(bb)})`);
  ctx.beginPath(); ctx.arc(cx,cy,r,0,Math.PI*2);
  ctx.fillStyle=grad; ctx.fill();
  ctx.strokeStyle=isHl?'#ffffff':hexColor+'bb';
  ctx.lineWidth=isHl?2:0.8; ctx.stroke();
}

// ── Component ─────────────────────────────────────────────────────────────────
export default function MoleculeViewer({ state:rawState, onStateChange, readonly }: LabWidgetProps) {
  const s = rawState as unknown as MoleculeState;
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const angleRef  = useRef({ x:0.2, y:0.4 });
  const dragRef   = useRef<{mx:number;my:number;ax:number;ay:number}|null>(null);
  const rafRef    = useRef<number>(0);
  const stateRef  = useRef(s);
  useEffect(()=>{ stateRef.current=s; },[s]);

  const W=580, H=400;

  const draw = useCallback(()=>{
    const canvas=canvasRef.current; if (!canvas) return;
    const ctx=canvas.getContext('2d')!;
    const s=stateRef.current;
    const mol=MOLECULES[s.moleculeKey]??MOLECULES.water;
    const vx=angleRef.current.x, vy=angleRef.current.y;
    const zoom=s.zoom;

    ctx.clearRect(0,0,W,H);
    // Background
    const bg=ctx.createRadialGradient(W/2,H/2,0,W/2,H/2,260);
    bg.addColorStop(0,'#0e1628'); bg.addColorStop(1,'#050912');
    ctx.fillStyle=bg; ctx.fillRect(0,0,W,H);

    // Build atom map + projected positions
    const amap: Record<string,Atom3D> = {};
    mol.atoms.forEach(a=>{ amap[a.id]=a; });

    type ProjAtom = { id:string; el:string; px:number; py:number; pz:number; r:number; };
    const projAtoms: ProjAtom[] = mol.atoms.map(a=>{
      const v=viewAtom(a,vx,vy);
      const [px,py,pz]=projAtom(v,W,H,zoom);
      const baseR=(ATOM_R[a.el]??14);
      const perspScale=FOV/(FOV+pz+4)*zoom;
      const r=baseR*perspScale;
      return { id:a.id, el:a.el, px,py,pz,r };
    });
    const pamap: Record<string,ProjAtom>={};
    projAtoms.forEach(p=>{ pamap[p.id]=p; });

    // Depth-sort bonds + atoms together using avg-z
    type DrawItem =
      | { kind:'atom'; atom:ProjAtom; }
      | { kind:'bond'; a:ProjAtom; b:ProjAtom; order:1|2|3; avgZ:number; };

    const items: DrawItem[] = [];
    for (const bond of mol.bonds) {
      const a=pamap[bond.a], b=pamap[bond.b];
      if (!a||!b) continue;
      items.push({ kind:'bond', a, b, order:bond.order, avgZ:(a.pz+b.pz)/2 });
    }
    for (const pa of projAtoms) {
      items.push({ kind:'atom', atom:pa });
    }
    items.sort((x,y)=>{
      const za = x.kind==='atom' ? x.atom.pz : x.avgZ;
      const zb = y.kind==='atom' ? y.atom.pz : y.avgZ;
      return zb-za; // back to front
    });

    // Draw
    for (const item of items) {
      if (item.kind==='bond') {
        const {a,b,order}=item;
        const dx=b.px-a.px, dy=b.py-a.py;
        const len=Math.hypot(dx,dy); if (len<2) continue;
        const ux=dx/len, uy=dy/len;
        const perp=[-uy*0.5,ux*0.5];
        const offsets=order===1?[0]:order===2?[-4.5,4.5]:[-7,0,7];
        // Fade bonds that go "behind" – lighter stroke for bonds with positive avgZ
        const depthAlpha=Math.max(0.3,Math.min(1,1-item.avgZ/300));
        for (const off of offsets) {
          const ox=perp[0]*off*zoom, oy=perp[1]*off*zoom;
          // Shorten so it doesn't overlap atom spheres
          const sa=a.r*0.55, sb=b.r*0.55;
          ctx.beginPath();
          ctx.moveTo(a.px+ox+ux*sa, a.py+oy+uy*sa);
          ctx.lineTo(b.px+ox-ux*sb, b.py+oy-uy*sb);
          ctx.strokeStyle=`rgba(148,163,184,${depthAlpha})`;
          ctx.lineWidth=Math.max(1.5, 2.5*zoom*(FOV/(FOV+item.avgZ+4)));
          ctx.stroke();
        }
      } else {
        const {atom}=item;
        const color=ATOM_COLOR[atom.el]??'#888';
        const isHl=s.highlighted===atom.id;
        drawSphere(ctx,atom.px,atom.py,Math.max(4,atom.r),color,isHl);
        if (s.showLabels && atom.r>9) {
          ctx.fillStyle=atom.el==='C'?'#e2e8f0':'#030712';
          ctx.font=`700 ${Math.max(8,atom.r*0.82)}px monospace`;
          ctx.textAlign='center'; ctx.textBaseline='middle';
          ctx.fillText(atom.el,atom.px,atom.py);
        }
      }
    }

    // Formula + geometry
    ctx.textAlign='left'; ctx.textBaseline='alphabetic';
    ctx.fillStyle='rgba(255,255,255,0.75)'; ctx.font='700 16px monospace';
    ctx.fillText(mol.formula,12,26);
    ctx.fillStyle='rgba(255,255,255,0.35)'; ctx.font='11px monospace';
    ctx.fillText(mol.name,12,42);
    ctx.fillStyle='rgba(148,163,184,0.55)'; ctx.font='10px monospace';
    ctx.fillText(mol.geometry,12,56);

    // Drag hint
    ctx.fillStyle='rgba(255,255,255,0.18)'; ctx.textAlign='right';
    ctx.fillText('Drag to rotate · 3D View',W-8,H-8);
    ctx.textAlign='left';
  },[]);

  useEffect(()=>{
    let last=performance.now();
    const tick=(now:number)=>{
      if (!dragRef.current) angleRef.current.y+=(now-last)*0.0003;
      last=now; draw(); rafRef.current=requestAnimationFrame(tick);
    };
    rafRef.current=requestAnimationFrame(tick);
    return ()=>cancelAnimationFrame(rafRef.current);
  },[draw]);

  function hitAtom(ex:number,ey:number): string|null {
    const s=stateRef.current;
    const mol=MOLECULES[s.moleculeKey]??MOLECULES.water;
    const vx=angleRef.current.x, vy=angleRef.current.y;
    let closest:string|null=null, minD=Infinity;
    for (const a of mol.atoms) {
      const v=viewAtom(a,vx,vy);
      const [px,py]=projAtom(v,W,H,s.zoom);
      const r=(ATOM_R[a.el]??14)*s.zoom*(FOV/(FOV+v[2]+4));
      const d=Math.hypot(ex-px,ey-py);
      if (d<r+4 && d<minD) { minD=d; closest=a.id; }
    }
    return closest;
  }

  function handleClick(e:React.MouseEvent<HTMLCanvasElement>) {
    if (readonly) return;
    const rect=canvasRef.current!.getBoundingClientRect();
    const mx=(e.clientX-rect.left)*W/rect.width;
    const my=(e.clientY-rect.top)*H/rect.height;
    const hit=hitAtom(mx,my);
    onStateChange?.({ highlighted: hit===s.highlighted?null:hit });
  }

  function onMouseDown(e:React.MouseEvent) {
    dragRef.current={ mx:e.clientX, my:e.clientY, ax:angleRef.current.x, ay:angleRef.current.y };
  }
  function onMouseMove(e:React.MouseEvent) {
    if (!dragRef.current) return;
    angleRef.current.x=dragRef.current.ax+(e.clientY-dragRef.current.my)*0.009;
    angleRef.current.y=dragRef.current.ay+(e.clientX-dragRef.current.mx)*0.009;
  }
  function onMouseUp() { dragRef.current=null; }

  const mol=MOLECULES[s.moleculeKey]??MOLECULES.water;
  const uniqueEls=mol.atoms.filter((a,i,arr)=>arr.findIndex(b=>b.el===a.el)===i);

  return (
    <div style={{ background:'#050912', borderRadius:'10px', overflow:'hidden' }}>
      <canvas ref={canvasRef} width={W} height={H}
        style={{ width:'100%', display:'block', cursor: readonly?'default':dragRef.current?'grabbing':'grab' }}
        onMouseDown={onMouseDown} onMouseMove={onMouseMove}
        onMouseUp={onMouseUp} onMouseLeave={onMouseUp}
        onClick={handleClick} />

      {!readonly && (
        <div style={{ background:'#080c1a', padding:'12px 16px', display:'flex', flexWrap:'wrap', gap:'12px', alignItems:'center' }}>
          <div style={{ display:'flex', gap:'5px', flexWrap:'wrap' }}>
            {Object.entries(MOLECULES).map(([key,m])=>(
              <button key={key} onClick={()=>onStateChange?.({moleculeKey:key,highlighted:null})}
                style={{ padding:'3px 10px', borderRadius:'6px', border:`1px solid ${s.moleculeKey===key?'#3b5bdb':'#1e293b'}`, background:s.moleculeKey===key?'#1e3a8a22':'transparent', color:s.moleculeKey===key?'#60a5fa':'#6b7280', fontSize:'11px', cursor:'pointer', fontFamily:'monospace', fontWeight:s.moleculeKey===key?700:400 }}>
                {m.formula}
              </button>
            ))}
          </div>
          <label style={{ display:'flex', alignItems:'center', gap:'6px', fontSize:'12px', color:'#d1d5db' }}>
            <span style={{ color:'#60a5fa', fontFamily:'monospace' }}>zoom</span>
            <input type="range" min="0.5" max="2.2" step="0.05" value={s.zoom}
              onChange={e=>onStateChange?.({zoom:parseFloat(e.target.value)})}
              style={{ width:'70px', accentColor:'#3b5bdb' }} />
          </label>
          <label style={{ display:'flex', alignItems:'center', gap:'5px', fontSize:'12px', color:'#d1d5db', cursor:'pointer' }}>
            <input type="checkbox" checked={s.showLabels} onChange={e=>onStateChange?.({showLabels:e.target.checked})} style={{ accentColor:'#3b5bdb' }} /> Labels
          </label>
          <div style={{ display:'flex', gap:'8px', alignItems:'center', marginLeft:'auto' }}>
            {uniqueEls.map(a=>(
              <div key={a.el} style={{ display:'flex', alignItems:'center', gap:'4px' }}>
                <div style={{ width:'10px', height:'10px', borderRadius:'50%', background:ATOM_COLOR[a.el]??'#888' }} />
                <span style={{ fontSize:'10px', color:'#9ca3af', fontFamily:'monospace' }}>{a.el}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
