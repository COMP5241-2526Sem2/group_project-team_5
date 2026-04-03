import React, { useState, useRef, useEffect } from 'react';
import {
  Search, Plus, X, Check, ChevronDown, ChevronLeft, ChevronRight,
  FileText, Clock, Award, AlertCircle, CheckCircle2,
  Send, Edit3, Trash2, Save, Users, Calendar,
  MessageSquare, Zap, Layers, Star, BookOpen,
  Eye, ArrowLeftRight, RotateCcw, Pencil,
} from 'lucide-react';

/* ═══════════════════════════════════════════════════════════════════════════
   TYPES
═══════════════════════════════════════════════════════════════════════════ */
type StudioTab   = 'assemble' | 'publish' | 'grade';
type AssembleMode = 'bank' | 'papers';
type QType       = 'MCQ' | 'True/False' | 'Fill-blank' | 'Short Answer' | 'Essay';
type Diff        = 'easy' | 'medium' | 'hard';
type PaperKind   = 'exam' | 'quiz' | 'homework';
type PaperStatus = 'draft' | 'published' | 'closed';
type AssignKind  = 'exam' | 'quiz' | 'homework';
type SubStatus   = 'pending_sa' | 'ai_graded' | 'fully_graded';

interface LibQ {
  id: string; type: QType; diff: Diff;
  subject: string; grade: string; chapter: string;
  prompt: string; options?: string[]; answer?: string;
  source?: string;
}
interface SectionQ {
  uid: string; libId: string; prompt: string;
  type: QType; diff: Diff; pts: number;
  options?: string[]; answer?: string;
}
interface Section { id: string; label: string; type: QType; ptsEach: number; qs: SectionQ[]; }
interface Paper {
  id: string; title: string; kind: PaperKind;
  grade: string; subject: string; status: PaperStatus;
  duration: number; totalPts: number; qCount: number;
  sections: Section[]; createdAt: string;
  publishCfg?: PublishCfg; note?: string;
}
interface PublishCfg {
  assignKind: AssignKind; classes: string[];
  startDate: string; endDate: string;
  timeLimit: number; showResults: boolean; allowLate: boolean;
}
interface QResp {
  qId: string; prompt: string; type: QType; maxPts: number;
  studentAns: string; isCorrect?: boolean;
  aiPts?: number; aiNote?: string;
  teacherPts?: number; teacherNote?: string;
}
interface StudentSub {
  id: string; name: string; studentId: string; avatar: string;
  paperId: string; submittedAt: string; status: SubStatus;
  aiTotal: number; teacherTotal: number | null; maxPts: number;
  responses: QResp[];
}
interface ExamPaperEntry {
  id: string; title: string; grade: string; subject: string;
  totalScore: number; durationMin: number; questions: LibQ[];
}

/* ═══════════════════════════════════════════════════════════════════════════
   CONSTANTS
═══════════════════════════════════════════════════════════════════════════ */
const TYPE_C: Record<QType, { emoji: string; color: string; bg: string; short: string }> = {
  'MCQ':          { emoji: '📋', color: '#1d4ed8', bg: '#dbeafe', short: 'MCQ'   },
  'True/False':   { emoji: '✅', color: '#7c3aed', bg: '#ede9fe', short: 'T/F'   },
  'Fill-blank':   { emoji: '✏️', color: '#b45309', bg: '#fef3c7', short: 'Fill'  },
  'Short Answer': { emoji: '📝', color: '#15803d', bg: '#dcfce7', short: 'SA'    },
  'Essay':        { emoji: '✍️', color: '#be185d', bg: '#fce7f3', short: 'Essay' },
};
const DIFF_C: Record<Diff, { bg: string; color: string; label: string }> = {
  easy:   { bg: '#dcfce7', color: '#15803d', label: 'Easy'   },
  medium: { bg: '#fef9c3', color: '#a16207', label: 'Medium' },
  hard:   { bg: '#fee2e2', color: '#b91c1c', label: 'Hard'   },
};
const STATUS_C: Record<PaperStatus, { label: string; bg: string; color: string; dot: string }> = {
  draft:     { label: 'Draft',     bg: '#fef9c3', color: '#a16207', dot: '#f59e0b' },
  published: { label: 'Published', bg: '#dcfce7', color: '#15803d', dot: '#10b981' },
  closed:    { label: 'Closed',    bg: '#f3f4f6', color: '#6b7280', dot: '#9ca3af' },
};
const SUBJ_EMOJI: Record<string, string> = {
  Biology: '🔬', Physics: '⚡', Math: '📐', Chemistry: '⚗️', English: '📖', History: '🏛️',
};
const ALL_CLASSES = ['Grade 9-A','Grade 9-B','Grade 10-A','Grade 10-B','Grade 10-C','Grade 11-A','Grade 11-B'];
const GRADES   = ['Grade 7','Grade 8','Grade 9','Grade 10','Grade 11','Grade 12'];
const SUBJECTS = ['Biology','Physics','Chemistry','Math','English','History'];
const Q_TYPES: QType[] = ['MCQ','True/False','Fill-blank','Short Answer','Essay'];
const ROMAN = ['I','II','III','IV','V','VI','VII','VIII'];

/* ═══════════════════════════════════════════════════════════════════════════
   MOCK DATA — Question Bank
═══════════════════════════════════════════════════════════════════════════ */
const LIB_QS: LibQ[] = [
  { id:'lq1',  type:'MCQ',          diff:'easy',   subject:'Biology',   grade:'Grade 10', chapter:'Ch.3 Photosynthesis', prompt:'Which organelle is primarily responsible for photosynthesis?', options:['A. Mitochondria','B. Chloroplast','C. Ribosome','D. Vacuole'], answer:'B' },
  { id:'lq2',  type:'MCQ',          diff:'medium', subject:'Biology',   grade:'Grade 10', chapter:'Ch.3 Photosynthesis', prompt:'In the Calvin cycle, which molecule is the first CO₂ acceptor?', options:['A. RuBP','B. G3P','C. ATP','D. NADPH'], answer:'A' },
  { id:'lq3',  type:'MCQ',          diff:'hard',   subject:'Biology',   grade:'Grade 10', chapter:'Ch.3 Photosynthesis', prompt:'In the Z-scheme, the final electron acceptor is:', options:['A. Ferredoxin','B. NADP⁺','C. Plastocyanin','D. O₂'], answer:'B' },
  { id:'lq4',  type:'True/False',   diff:'easy',   subject:'Biology',   grade:'Grade 10', chapter:'Ch.3 Photosynthesis', prompt:'The Calvin cycle is also called the "light-independent" reactions.', answer:'True' },
  { id:'lq5',  type:'True/False',   diff:'medium', subject:'Biology',   grade:'Grade 10', chapter:'Ch.3 Photosynthesis', prompt:'Chlorophyll a absorbs light most strongly in the green region.', answer:'False' },
  { id:'lq6',  type:'Fill-blank',   diff:'medium', subject:'Biology',   grade:'Grade 10', chapter:'Ch.3 Photosynthesis', prompt:'The splitting of water during photosynthesis is called _______.', answer:'Photolysis' },
  { id:'lq7',  type:'Fill-blank',   diff:'hard',   subject:'Biology',   grade:'Grade 10', chapter:'Ch.3 Photosynthesis', prompt:'In PS I, the primary electron acceptor is _______.', answer:'Ferredoxin' },
  { id:'lq8',  type:'Short Answer', diff:'medium', subject:'Biology',   grade:'Grade 10', chapter:'Ch.3 Photosynthesis', prompt:'Explain why a leaf appears green. What happens to the absorbed wavelengths?' },
  { id:'lq9',  type:'Short Answer', diff:'hard',   subject:'Biology',   grade:'Grade 10', chapter:'Ch.3 Photosynthesis', prompt:'Compare the roles of Photosystem I and Photosystem II in the light-dependent reactions.' },
  { id:'lq10', type:'Essay',        diff:'hard',   subject:'Biology',   grade:'Grade 10', chapter:'Ch.3 Photosynthesis', prompt:'Describe the complete process of photosynthesis, covering both the light-dependent and light-independent reactions.' },
  { id:'lq11', type:'MCQ',          diff:'medium', subject:'Physics',   grade:'Grade 11', chapter:"Newton's Laws",       prompt:"If net force doubles while mass stays constant, acceleration:", options:['A. Halves','B. Same','C. Doubles','D. Quadruples'], answer:'C' },
  { id:'lq12', type:'MCQ',          diff:'hard',   subject:'Physics',   grade:'Grade 11', chapter:"Newton's Laws",       prompt:'A 5 kg block: 20 N east + 15 N north. Magnitude of acceleration:', options:['A. 5.0 m/s²','B. 7.0 m/s²','C. 4.0 m/s²','D. 6.0 m/s²'], answer:'A' },
  { id:'lq13', type:'Short Answer', diff:'medium', subject:'Physics',   grade:'Grade 11', chapter:"Newton's Laws",       prompt:"State Newton's three laws of motion with a real-world example for each." },
  { id:'lq14', type:'MCQ',          diff:'medium', subject:'Math',      grade:'Grade 9',  chapter:'Quadratic Functions', prompt:'Vertex form of f(x) = x²−6x+5?', options:['A. (x−3)²−4','B. (x+3)²−4','C. (x−3)²+4','D. (x−6)²+5'], answer:'A' },
  { id:'lq15', type:'Short Answer', diff:'hard',   subject:'Math',      grade:'Grade 9',  chapter:'Quadratic Functions', prompt:'h(t)=−5t²+20t+2. Find max height and the time at which it occurs.' },
  { id:'lq16', type:'MCQ',          diff:'medium', subject:'Chemistry', grade:'Grade 11', chapter:'Electrochemistry',    prompt:'In a galvanic cell, oxidation occurs at the:', options:['A. Anode','B. Cathode','C. Salt bridge','D. External circuit'], answer:'A' },
  { id:'lq17', type:'Essay',        diff:'hard',   subject:'Chemistry', grade:'Grade 11', chapter:'Organic Reactions',   prompt:'Compare SN1 and SN2 reaction mechanisms, including substrate structure and solvent polarity.' },
  { id:'lq18', type:'MCQ',          diff:'easy',   subject:'Biology',   grade:'Grade 10', chapter:'Ch.3 Photosynthesis', prompt:'Which gas is released as a byproduct of the light-dependent reactions?', options:['A. CO₂','B. N₂','C. O₂','D. H₂'], answer:'C' },
  { id:'lq19', type:'Fill-blank',   diff:'easy',   subject:'Biology',   grade:'Grade 10', chapter:'Ch.3 Photosynthesis', prompt:'ATP and NADPH produced in the light reactions are used to power the _______ cycle.', answer:'Calvin' },
  { id:'lq20', type:'True/False',   diff:'hard',   subject:'Biology',   grade:'Grade 10', chapter:'Ch.3 Photosynthesis', prompt:'Cyclic photophosphorylation produces both ATP and NADPH.', answer:'False' },
];

/* ═══════════════════════════════════════════════════════════════════════════
   MOCK DATA — Exam Papers
═══════════════════════════════════════════════════════════════════════════ */
function makeEPQ(paperId: string, n: number, type: QType, diff: Diff, prompt: string, opts?: string[], ans?: string, subject='Biology', grade='Grade 10', chapter='General'): LibQ {
  return { id:`ep_${paperId}_${n}`, type, diff, subject, grade, chapter, prompt, options:opts, answer:ans, source:paperId };
}
const EXAM_PAPERS: ExamPaperEntry[] = [
  {
    id:'ep1', title:'Grade 10 Biology Midterm — Spring 2026', grade:'Grade 10', subject:'Biology', totalScore:120, durationMin:90,
    questions:[
      makeEPQ('ep1',1,'MCQ','easy',   'The powerhouse of the cell is the:', ['A. Nucleus','B. Ribosome','C. Mitochondria','D. Vacuole'],'C','Biology','Grade 10','Cell Biology'),
      makeEPQ('ep1',2,'MCQ','medium', 'Which process converts glucose into pyruvate?', ['A. Krebs cycle','B. Glycolysis','C. Oxidative phosphorylation','D. Beta-oxidation'],'B','Biology','Grade 10','Cellular Respiration'),
      makeEPQ('ep1',3,'MCQ','hard',   'During oxidative phosphorylation, electrons pass from NADH to:', ['A. O₂','B. FAD','C. NAD⁺','D. Pyruvate'],'A','Biology','Grade 10','Cellular Respiration'),
      makeEPQ('ep1',4,'True/False','easy',   'Mitosis produces four genetically distinct daughter cells.', undefined,'False','Biology','Grade 10','Cell Division'),
      makeEPQ('ep1',5,'True/False','medium', 'Crossing over occurs during prophase I of meiosis.', undefined,'True','Biology','Grade 10','Cell Division'),
      makeEPQ('ep1',6,'Fill-blank','medium', 'The stage of mitosis where chromosomes align at the cell equator is called _______.', undefined,'Metaphase','Biology','Grade 10','Cell Division'),
      makeEPQ('ep1',7,'Fill-blank','hard',   'The enzyme that unwinds the DNA double helix during replication is called _______.', undefined,'Helicase','Biology','Grade 10','DNA Replication'),
      makeEPQ('ep1',8,'Short Answer','medium','Explain the difference between mitosis and meiosis in terms of chromosome number and genetic variation.'),
      makeEPQ('ep1',9,'Short Answer','hard',  'Describe how enzymes lower the activation energy of a reaction and how temperature affects enzyme activity.'),
      makeEPQ('ep1',10,'Essay','hard',        'Explain the complete process of cellular respiration, including glycolysis, the Krebs cycle, and oxidative phosphorylation.'),
    ],
  },
  {
    id:'ep2', title:"Grade 11 Physics Unit Test — Newton's Laws", grade:'Grade 11', subject:'Physics', totalScore:100, durationMin:75,
    questions:[
      makeEPQ('ep2',1,'MCQ','easy',   "Newton's first law is also called the law of:", ['A. Acceleration','B. Inertia','C. Gravity','D. Reaction'],'B','Physics','Grade 11','Mechanics'),
      makeEPQ('ep2',2,'MCQ','medium', 'A 10 kg object accelerates at 3 m/s². The net force is:', ['A. 13 N','B. 0.3 N','C. 30 N','D. 3 N'],'C','Physics','Grade 11','Mechanics'),
      makeEPQ('ep2',3,'MCQ','hard',   'Two objects of mass m and 2m are in free fall. Their accelerations are:', ['A. Equal','B. m/s and 2m/s','C. Ratio 1:2','D. Ratio 2:1'],'A','Physics','Grade 11','Gravity'),
      makeEPQ('ep2',4,'True/False','easy',   'Weight is a measure of the amount of matter in an object.', undefined,'False','Physics','Grade 11','Mechanics'),
      makeEPQ('ep2',5,'Fill-blank','medium', "The unit of force in SI is the _______, defined as 1 kg·m/s².", undefined,'Newton','Physics','Grade 11','Mechanics'),
      makeEPQ('ep2',6,'Short Answer','medium',"Explain why a rocket can accelerate in the vacuum of space using Newton's third law."),
      makeEPQ('ep2',7,'Short Answer','hard',  "A car skids to a stop. Analyze the forces involved using Newton's laws and explain what determines stopping distance."),
      makeEPQ('ep2',8,'Essay','hard',         "Design an experiment to verify Newton's second law. Include hypothesis, variables, method, expected results, and sources of error."),
    ],
  },
  {
    id:'ep3', title:'Grade 9 Math Review — Quadratics', grade:'Grade 9', subject:'Math', totalScore:80, durationMin:60,
    questions:[
      makeEPQ('ep3',1,'MCQ','easy',   'The solutions to x² − 5x + 6 = 0 are:', ['A. x=2,3','B. x=1,6','C. x=−2,−3','D. x=−1,6'],'A','Math','Grade 9','Quadratic Equations'),
      makeEPQ('ep3',2,'MCQ','medium', 'Which quadratic has vertex (2, −1)?', ['A. (x−2)²−1','B. (x+2)²−1','C. (x−2)²+1','D. x²−4x+3'],'A','Math','Grade 9','Quadratic Functions'),
      makeEPQ('ep3',3,'Fill-blank','medium', 'The discriminant of ax²+bx+c=0 is _______.', undefined,'b²−4ac','Math','Grade 9','Quadratic Equations'),
      makeEPQ('ep3',4,'True/False','easy',   'A quadratic function always has exactly two real roots.', undefined,'False','Math','Grade 9','Quadratic Equations'),
      makeEPQ('ep3',5,'Short Answer','hard',  'A ball is thrown with h(t)=−4.9t²+19.6t+2. Find the maximum height and when it hits the ground.'),
      makeEPQ('ep3',6,'Short Answer','medium','Solve 2x²+3x−2=0 by factoring. Show all steps.'),
    ],
  },
];

/* ═══════════════════════════════════════════════════════════════════════════
   MOCK DATA — Papers
═══════════════════════════════════════════════════════════════════════════ */
const INIT_PAPERS: Paper[] = [
  { id:'p1', title:'Grade 10 Biology Midterm — Spring 2026', kind:'exam', grade:'Grade 10', subject:'Biology', status:'published', duration:90, totalPts:120, qCount:29, sections:[], createdAt:'2026-03-28T14:22:00Z', publishCfg:{ assignKind:'exam', classes:['Grade 10-A','Grade 10-B'], startDate:'2026-04-05', endDate:'2026-04-05', timeLimit:90, showResults:true, allowLate:false } },
  { id:'p2', title:'Grade 9 Chemistry Unit Test — Acids & Bases', kind:'quiz', grade:'Grade 9', subject:'Chemistry', status:'draft', duration:60, totalPts:80, qCount:22, sections:[], createdAt:'2026-03-31T09:05:00Z', note:'Review Section III difficulty before publishing.' },
  { id:'p3', title:'Grade 11 Math Review — Sequences & Derivatives', kind:'exam', grade:'Grade 11', subject:'Math', status:'draft', duration:120, totalPts:150, qCount:35, sections:[], createdAt:'2026-04-01T17:40:00Z' },
  { id:'p4', title:'Grade 10 Biology Quiz — Cell Structure', kind:'quiz', grade:'Grade 10', subject:'Biology', status:'closed', duration:30, totalPts:50, qCount:15, sections:[], createdAt:'2026-02-10T11:00:00Z', publishCfg:{ assignKind:'quiz', classes:['Grade 10-A'], startDate:'2026-02-14', endDate:'2026-02-20', timeLimit:30, showResults:true, allowLate:true } },
];

/* ═══════════════════════════════════════════════════════════════════════════
   MOCK DATA — Student Submissions
═══════════════════════════════════════════════════════════════════════════ */
const BASE_RESPONSES: QResp[] = [
  { qId:'lq1', prompt:'Which organelle is primarily responsible for photosynthesis?', type:'MCQ', maxPts:3, studentAns:'B. Chloroplast', isCorrect:true, aiPts:3, aiNote:'Correct. Chloroplast contains the photosynthetic machinery.' },
  { qId:'lq2', prompt:'In the Calvin cycle, which molecule is the first CO₂ acceptor?', type:'MCQ', maxPts:3, studentAns:'A. RuBP', isCorrect:true, aiPts:3, aiNote:'Correct. RuBP is the primary CO₂ acceptor in the Calvin cycle.' },
  { qId:'lq3', prompt:'In the Z-scheme, the final electron acceptor is:', type:'MCQ', maxPts:3, studentAns:'A. Ferredoxin', isCorrect:false, aiPts:0, aiNote:'Incorrect. The final acceptor is NADP⁺ (B).' },
  { qId:'lq4', prompt:'The Calvin cycle is also called the "light-independent" reactions.', type:'True/False', maxPts:2, studentAns:'True', isCorrect:true, aiPts:2, aiNote:'Correct.' },
  { qId:'lq5', prompt:'Chlorophyll a absorbs light most strongly in the green region.', type:'True/False', maxPts:2, studentAns:'False', isCorrect:true, aiPts:2, aiNote:'Correct. Chlorophyll a absorbs red and blue most strongly.' },
  { qId:'lq8', prompt:'Explain why a leaf appears green. What happens to the absorbed wavelengths?', type:'Short Answer', maxPts:6, studentAns:'Leaves appear green because chlorophyll pigments absorb red and blue light for photosynthesis but reflect green wavelengths back. The absorbed red (~680 nm) and blue (~450 nm) light excites electrons in the photosystems, driving the light-dependent reactions to produce ATP and NADPH.', aiPts:5, aiNote:'Strong coverage. Correctly mentions wavelengths. Could elaborate on energy conversion. −1 pt.' },
  { qId:'lq9', prompt:'Compare the roles of Photosystem I and Photosystem II in the light-dependent reactions.', type:'Short Answer', maxPts:6, studentAns:'PSII (P680) splits water releasing O₂. Electrons flow through ETC generating a proton gradient for ATP. PSI (P700) re-energises electrons to reduce NADP⁺ → NADPH for the Calvin cycle.', aiPts:6, aiNote:'Excellent. Identifies both photosystems, wavelengths, electron flow, ATP and NADPH production.' },
];

function makeSub(id: string, name: string, sid: string, av: string, status: SubStatus, aiTotal: number, teacherTotal: number | null): StudentSub {
  return { id, name, studentId:sid, avatar:av, paperId:'p1', submittedAt:`2026-04-05T10:${id.slice(-2).padStart(2,'0')}:00Z`, status, aiTotal, teacherTotal, maxPts:120, responses:BASE_RESPONSES };
}
const INIT_SUBS: StudentSub[] = [
  makeSub('ss1','Alice Chen',  '2024001','👩‍🎓','fully_graded', 95, 96),
  makeSub('ss2','Bob Zhang',   '2024002','👨‍🎓','pending_sa',   78, null),
  makeSub('ss3','Carol Liu',   '2024003','👩‍🎓','fully_graded',102,104),
  makeSub('ss4','David Wang',  '2024004','👨‍🎓','pending_sa',   65, null),
  makeSub('ss5','Wang Black',  '2024007','🦯', 'pending_sa',   71, null),
  makeSub('ss6','Emma Wright', '2024005','👩‍🎓','ai_graded',    88, null),
  makeSub('ss7','Liam Park',   '2024008','👨‍🎓','pending_sa',   60, null),
];

/* ═══════════════════════════════════════════════════════════════════════════
   HELPERS
═══════════════════════════════════════════════════════════════════════════ */
function nid() { return Math.random().toString(36).slice(2,9); }
function fmtDate(iso: string) { return new Date(iso).toLocaleDateString('en-US',{ month:'short', day:'numeric', year:'numeric' }); }
function clamp(s: string, n: number) { return s.length > n ? s.slice(0,n)+'…' : s; }
function defaultPts(t: QType) { return t==='Essay' ? 15 : t==='Short Answer' ? 6 : t==='Fill-blank' ? 3 : 2; }

/* ═══════════════════════════════════════════════════════════════════════════
   SHARED UI
═══════════════════════════════════════════════════════════════════════════ */
function DiffBadge({ d }: { d: Diff }) {
  const c = DIFF_C[d];
  return <span style={{ fontSize:'10px', fontWeight:700, padding:'2px 7px', borderRadius:'20px', background:c.bg, color:c.color, flexShrink:0 }}>{c.label}</span>;
}
function TypeBadge({ t }: { t: QType }) {
  const tc = TYPE_C[t];
  return <span style={{ fontSize:'10px', fontWeight:700, padding:'2px 8px', borderRadius:'20px', background:tc.bg, color:tc.color, flexShrink:0 }}>{tc.emoji} {tc.short}</span>;
}
function Pill({ label, active, onClick }: { label:string; active:boolean; onClick:()=>void }) {
  return (
    <button onClick={onClick} style={{ padding:'5px 13px', borderRadius:'6px', border:'none', cursor:'pointer', fontSize:'12px', background:active?'#fff':'transparent', color:active?'#0f0f23':'#6b7280', fontWeight:active?600:400, boxShadow:active?'0 1px 3px rgba(0,0,0,0.08)':'none', whiteSpace:'nowrap' }}>
      {label}
    </button>
  );
}
function MiniSelect({ label, value, onChange, options }: { label:string; value:string; onChange:(v:string)=>void; options:string[] }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    function h(e: MouseEvent) { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); }
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);
  return (
    <div ref={ref} style={{ position:'relative', flexShrink:0 }}>
      <button onClick={()=>setOpen(o=>!o)} style={{ display:'flex', alignItems:'center', gap:'5px', padding:'6px 11px', borderRadius:'8px', border:`1.5px solid ${open?'#3b5bdb':'#e8eaed'}`, background:'#fff', cursor:'pointer', fontSize:'12px', color:'#374151', fontWeight:500, whiteSpace:'nowrap' }}>
        <span style={{ color:'#9ca3af', fontSize:'11px' }}>{label}</span>
        <span style={{ color:'#0f0f23' }}>{value}</span>
        <ChevronDown size={11} style={{ color:'#9ca3af', transform:open?'rotate(180deg)':'none', transition:'transform 0.15s' }}/>
      </button>
      {open && (
        <div style={{ position:'absolute', top:'calc(100% + 4px)', left:0, zIndex:300, background:'#fff', border:'1.5px solid #e8eaed', borderRadius:'10px', boxShadow:'0 8px 24px rgba(0,0,0,0.10)', padding:'4px', minWidth:'130px' }}>
          {options.map(o=>(
            <button key={o} onClick={()=>{ onChange(o); setOpen(false); }}
              style={{ width:'100%', padding:'7px 10px', borderRadius:'7px', border:'none', cursor:'pointer', background:value===o?'#eff6ff':'transparent', color:value===o?'#3b5bdb':'#374151', fontSize:'12px', fontWeight:value===o?600:400, textAlign:'left', display:'flex', alignItems:'center', justifyContent:'space-between' }}
              onMouseEnter={e=>{ if(value!==o)(e.currentTarget as HTMLElement).style.background='#f9fafb'; }}
              onMouseLeave={e=>{ if(value!==o)(e.currentTarget as HTMLElement).style.background='transparent'; }}>
              {o} {value===o && <Check size={10} style={{ color:'#3b5bdb' }}/>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   TAB BAR
═══════════════════════════════════════════════════════════════════════════ */
function StudioTabBar({ tab, setTab, draftCount, pendingCount }: {
  tab:StudioTab; setTab:(t:StudioTab)=>void; draftCount:number; pendingCount:number;
}) {
  const tabs: { id:StudioTab; label:string; emoji:string; badge?:number }[] = [
    { id:'assemble', label:'Assemble', emoji:'🔨' },
    { id:'publish',  label:'Publish',  emoji:'📤', badge:draftCount  },
    { id:'grade',    label:'AI Grade', emoji:'⚡', badge:pendingCount },
  ];
  return (
    <div style={{ display:'flex', alignItems:'stretch', borderBottom:'1px solid #e8eaed', background:'#fff', padding:'0 24px', flexShrink:0 }}>
      {tabs.map(t=>(
        <button key={t.id} onClick={()=>setTab(t.id)}
          style={{ display:'flex', alignItems:'center', gap:'7px', padding:'13px 18px', borderTop:'none', borderLeft:'none', borderRight:'none', borderBottom:`2.5px solid ${tab===t.id?'#3b5bdb':'transparent'}`, background:'transparent', color:tab===t.id?'#3b5bdb':'#6b7280', fontSize:'13px', fontWeight:tab===t.id?700:400, cursor:'pointer', transition:'color 0.15s', whiteSpace:'nowrap' }}>
          <span>{t.emoji}</span>
          {t.label}
          {t.badge != null && t.badge > 0 && (
            <span style={{ fontSize:'10px', fontWeight:700, padding:'1px 6px', borderRadius:'9px', background:tab===t.id?'#3b5bdb':'#e8eaed', color:tab===t.id?'#fff':'#6b7280' }}>{t.badge}</span>
          )}
        </button>
      ))}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   MODE 1 — QUESTION BANK BROWSER
═══════════════════════════════════════════════════════════════════════════ */
interface BrowserProps {
  addedIds: Set<string>;
  replaceMode: boolean;
  replaceTargetType: QType | null;
  onAdd: (q: LibQ) => void;
  onReplace: (q: LibQ) => void;
}
function QuestionBankBrowser({ addedIds, replaceMode, replaceTargetType, onAdd, onReplace }: BrowserProps) {
  const [qSearch,      setQSearch]      = useState('');
  const [typeFilters,  setTypeFilters]  = useState<QType[]>([]);
  const [typeDropOpen, setTypeDropOpen] = useState(false);
  const typeRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function h(e: MouseEvent) { if (typeRef.current && !typeRef.current.contains(e.target as Node)) setTypeDropOpen(false); }
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  useEffect(() => {
    if (replaceMode && replaceTargetType) setTypeFilters([replaceTargetType]);
    else if (!replaceMode) setTypeFilters([]);
  }, [replaceMode, replaceTargetType]);

  const filtered = LIB_QS.filter(q =>
    (typeFilters.length===0 || typeFilters.includes(q.type)) &&
    (!qSearch || q.prompt.toLowerCase().includes(qSearch.toLowerCase()))
  );
  const byType: Partial<Record<QType,LibQ[]>> = {};
  filtered.forEach(q=>{ (byType[q.type]??=[]).push(q); });

  function toggleType(t: QType) { setTypeFilters(prev=>prev.includes(t)?prev.filter(x=>x!==t):[...prev,t]); }
  const typeLabel = typeFilters.length===0 ? 'All Types'
    : typeFilters.length===1 ? `${TYPE_C[typeFilters[0]].emoji} ${typeFilters[0]}`
    : `${typeFilters.length} types selected`;

  return (
    <div style={{ flex:1, display:'flex', flexDirection:'column', overflow:'hidden' }}>
      {replaceMode && (
        <div style={{ padding:'7px 11px', background:'#fef3c7', borderBottom:'1px solid #fde68a', display:'flex', alignItems:'center', gap:'6px', flexShrink:0 }}>
          <ArrowLeftRight size={11} style={{ color:'#d97706', flexShrink:0 }}/>
          <span style={{ fontSize:'11px', color:'#92400e', fontWeight:600, flex:1 }}>Replace mode{replaceTargetType?` — ${replaceTargetType}`:''}</span>
          <span style={{ fontSize:'10px', color:'#b45309' }}>Click to swap</span>
        </div>
      )}
      <div style={{ padding:'10px 11px 0', flexShrink:0 }}>
        {/* Search */}
        <div style={{ position:'relative', marginBottom:'8px' }}>
          <Search size={11} style={{ position:'absolute', left:'9px', top:'50%', transform:'translateY(-50%)', color:'#9ca3af', pointerEvents:'none' }}/>
          <input value={qSearch} onChange={e=>setQSearch(e.target.value)} placeholder="Search questions…"
            style={{ width:'100%', boxSizing:'border-box', padding:'6px 8px 6px 25px', border:'1.5px solid #e8eaed', borderRadius:'7px', fontSize:'12px', outline:'none', color:'#374151' }}
            onFocus={e=>{e.currentTarget.style.borderColor='#3b5bdb';}} onBlur={e=>{e.currentTarget.style.borderColor='#e8eaed';}}/>
        </div>
        {/* Type multi-select dropdown */}
        <div style={{ marginBottom:'10px' }}>
          <div style={{ fontSize:'11px', fontWeight:600, color:'#374151', marginBottom:'5px' }}>Question Type</div>
          <div ref={typeRef} style={{ position:'relative' }}>
            <button onClick={()=>setTypeDropOpen(o=>!o)}
              style={{ width:'100%', display:'flex', alignItems:'center', gap:'6px', padding:'7px 11px', borderRadius:'8px', border:`1.5px solid ${typeDropOpen?'#3b5bdb':'#e8eaed'}`, background:'#fff', cursor:'pointer', textAlign:'left', boxSizing:'border-box' }}>
              <span style={{ flex:1, fontSize:'12px', color:typeFilters.length===0?'#9ca3af':'#0f0f23', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{typeLabel}</span>
              <div style={{ display:'flex', alignItems:'center', gap:'5px', flexShrink:0 }}>
                {typeFilters.length>0 && (
                  <span role="button" onClick={e=>{ e.stopPropagation(); setTypeFilters([]); }}
                    style={{ width:'15px', height:'15px', borderRadius:'50%', cursor:'pointer', background:'#d1d5db', color:'#fff', display:'flex', alignItems:'center', justifyContent:'center' }}>
                    <X size={8}/>
                  </span>
                )}
                <ChevronDown size={12} style={{ color:'#9ca3af', transform:typeDropOpen?'rotate(180deg)':'none', transition:'transform 0.15s' }}/>
              </div>
            </button>
            {typeDropOpen && (
              <div style={{ position:'absolute', top:'calc(100% + 4px)', left:0, right:0, zIndex:500, background:'#fff', border:'1.5px solid #e8eaed', borderRadius:'10px', boxShadow:'0 8px 24px rgba(0,0,0,0.12)', padding:'4px' }}>
                <button onClick={()=>setTypeFilters([])}
                  style={{ width:'100%', display:'flex', alignItems:'center', gap:'9px', padding:'7px 10px', borderRadius:'7px', border:'none', cursor:'pointer', background:typeFilters.length===0?'#eff6ff':'transparent', textAlign:'left', marginBottom:'2px' }}
                  onMouseEnter={e=>{ if(typeFilters.length!==0)(e.currentTarget as HTMLElement).style.background='#f9fafb'; }}
                  onMouseLeave={e=>{ if(typeFilters.length!==0)(e.currentTarget as HTMLElement).style.background='transparent'; }}>
                  <div style={{ width:'15px', height:'15px', borderRadius:'4px', border:`2px solid ${typeFilters.length===0?'#3b5bdb':'#d1d5db'}`, background:typeFilters.length===0?'#3b5bdb':'#fff', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
                    {typeFilters.length===0 && <Check size={9} style={{ color:'#fff' }}/>}
                  </div>
                  <span style={{ fontSize:'12px', fontWeight:typeFilters.length===0?600:400, color:typeFilters.length===0?'#1d4ed8':'#374151' }}>All Types</span>
                </button>
                <div style={{ height:'1px', background:'#f3f4f6', margin:'2px 6px 4px' }}/>
                {Q_TYPES.map(t=>{
                  const tc=TYPE_C[t]; const checked=typeFilters.includes(t);
                  return (
                    <button key={t} onClick={()=>toggleType(t)}
                      style={{ width:'100%', display:'flex', alignItems:'center', gap:'9px', padding:'7px 10px', borderRadius:'7px', border:'none', cursor:'pointer', background:checked?'#eff6ff':'transparent', textAlign:'left', marginBottom:'1px' }}
                      onMouseEnter={e=>{ if(!checked)(e.currentTarget as HTMLElement).style.background='#f9fafb'; }}
                      onMouseLeave={e=>{ if(!checked)(e.currentTarget as HTMLElement).style.background='transparent'; }}>
                      <div style={{ width:'15px', height:'15px', borderRadius:'4px', border:`2px solid ${checked?'#3b5bdb':'#d1d5db'}`, background:checked?'#3b5bdb':'#fff', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
                        {checked && <Check size={9} style={{ color:'#fff' }}/>}
                      </div>
                      <span style={{ fontSize:'13px', flexShrink:0 }}>{tc.emoji}</span>
                      <span style={{ flex:1, fontSize:'12px', fontWeight:checked?600:400, color:checked?'#1d4ed8':'#374151' }}>{t}</span>
                      <span style={{ fontSize:'10px', color:'#9ca3af', flexShrink:0 }}>{LIB_QS.filter(q=>q.type===t).length}</span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
      {/* Question list */}
      <div style={{ flex:1, overflowY:'auto', padding:'0 8px 8px' }}>
        {filtered.length===0 ? (
          <div style={{ textAlign:'center', padding:'36px 12px', color:'#9ca3af' }}>
            <BookOpen size={26} style={{ opacity:0.18, display:'block', margin:'0 auto 8px' }}/>
            <div style={{ fontSize:'12px' }}>No questions found</div>
          </div>
        ) : Q_TYPES.map(t=>{
          const qs=byType[t]; if(!qs?.length) return null;
          const tc=TYPE_C[t];
          return (
            <div key={t} style={{ marginBottom:'11px' }}>
              <div style={{ fontSize:'10px', fontWeight:700, color:'#374151', marginBottom:'5px', display:'flex', alignItems:'center', gap:'5px' }}>
                <span>{tc.emoji}</span><span>{t}</span><span style={{ color:'#9ca3af', fontWeight:400 }}>({qs.length})</span>
              </div>
              {qs.map(q=>{
                const already=addedIds.has(q.id);
                const isReplace=replaceMode && replaceTargetType===q.type;
                return (
                  <div key={q.id} onClick={()=>{ if(isReplace&&!already) onReplace(q); }}
                    style={{ display:'flex', alignItems:'flex-start', gap:'7px', padding:'7px 8px', borderRadius:'8px', marginBottom:'3px',
                      background:already?'#f0fdf4':isReplace?'#fffbeb':'#f9fafb',
                      border:`1px solid ${already?'#bbf7d0':isReplace?'#fde68a':'transparent'}`,
                      cursor:isReplace&&!already?'pointer':'default' }}>
                    <div style={{ flex:1 }}>
                      <div style={{ fontSize:'11px', color:'#374151', lineHeight:1.5, marginBottom:'3px' }}>{clamp(q.prompt,70)}</div>
                      <DiffBadge d={q.diff}/>
                    </div>
                    {isReplace ? (
                      <div style={{ flexShrink:0, width:'22px', height:'22px', borderRadius:'6px', background:'#fef9c3', border:'1px solid #fde68a', display:'flex', alignItems:'center', justifyContent:'center' }}>
                        <ArrowLeftRight size={11} style={{ color:'#d97706' }}/>
                      </div>
                    ) : (
                      <button onClick={e=>{ e.stopPropagation(); if(!already) onAdd(q); }}
                        style={{ flexShrink:0, width:'22px', height:'22px', borderRadius:'6px', border:'none', cursor:already?'default':'pointer', background:already?'#d1fae5':'#3b5bdb', color:already?'#15803d':'#fff', display:'flex', alignItems:'center', justifyContent:'center' }}>
                        {already ? <Check size={11}/> : <Plus size={11}/>}
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   MODE 2 — EXAM PAPER PICKER
═══════════════════════════════════════════════════════════════════════════ */
interface PaperPickerProps {
  onLoad: (ep: ExamPaperEntry) => void;
  canvasHasContent: boolean;
  loadedPaperId: string | null;
}
function ExamPaperPicker({ onLoad, canvasHasContent, loadedPaperId }: PaperPickerProps) {
  const [expandId,  setExpandId]  = useState<string|null>(null);
  const [confirmId, setConfirmId] = useState<string|null>(null);

  function tryLoad(ep: ExamPaperEntry) {
    if (canvasHasContent && loadedPaperId!==ep.id) { setConfirmId(ep.id); return; }
    onLoad(ep); setExpandId(ep.id);
  }
  function qByType(ep: ExamPaperEntry) {
    const m: Partial<Record<QType,number>> = {};
    ep.questions.forEach(q=>{ m[q.type]=(m[q.type]??0)+1; });
    return m;
  }

  return (
    <div style={{ flex:1, display:'flex', flexDirection:'column', overflow:'hidden' }}>
      <div style={{ padding:'10px 11px 8px', flexShrink:0 }}>
        <p style={{ margin:0, fontSize:'11px', color:'#6b7280', lineHeight:1.6, padding:'9px 11px', background:'#f8f9fb', borderRadius:'8px', border:'1px solid #f0f2f5' }}>
          Pick an existing exam paper to load it into the canvas, then freely edit, reorder, or swap questions.
        </p>
      </div>
      <div style={{ flex:1, overflowY:'auto', padding:'0 8px 12px', display:'flex', flexDirection:'column', gap:'7px' }}>
        {EXAM_PAPERS.map(ep=>{
          const isLoaded   = loadedPaperId===ep.id;
          const isExpanded = expandId===ep.id;
          const confirming = confirmId===ep.id;
          const qmap       = qByType(ep);
          return (
            <div key={ep.id} onClick={()=>setExpandId(v=>v===ep.id?null:ep.id)}
              style={{ borderRadius:'10px', border:`1.5px solid ${isLoaded?'#3b5bdb':'#e8eaed'}`, background:isLoaded?'#f0f4ff':'#fff', overflow:'hidden', cursor:'pointer',
                boxShadow:isLoaded?'0 0 0 3px rgba(59,91,219,0.09)':'none', transition:'border-color 0.15s, box-shadow 0.15s' }}>
              <div style={{ display:'flex', alignItems:'center', gap:'9px', padding:'10px 11px' }}>
                <span style={{ fontSize:'18px', flexShrink:0 }}>{SUBJ_EMOJI[ep.subject]??'📄'}</span>
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{ fontSize:'11px', fontWeight:700, color:isLoaded?'#1d4ed8':'#0f0f23', lineHeight:1.35, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{ep.title}</div>
                  <div style={{ fontSize:'9px', color:'#9ca3af', marginTop:'2px' }}>{ep.grade} · {ep.subject} · {ep.questions.length}q · {ep.totalScore}pts · {ep.durationMin}min</div>
                </div>
                <div style={{ display:'flex', alignItems:'center', gap:'5px', flexShrink:0 }}>
                  {isLoaded && <span style={{ fontSize:'9px', fontWeight:700, padding:'2px 7px', borderRadius:'20px', background:'#3b5bdb', color:'#fff' }}>Loaded</span>}
                  <ChevronDown size={13} style={{ color:'#9ca3af', transform:isExpanded?'rotate(180deg)':'none', transition:'transform 0.18s' }}/>
                </div>
              </div>
              {isExpanded && (
                <div style={{ borderTop:'1px solid #e8eaed', padding:'9px 11px' }} onClick={e=>e.stopPropagation()}>
                  <div style={{ display:'flex', gap:'4px', flexWrap:'wrap', marginBottom:'9px' }}>
                    {Q_TYPES.map(t=>{ const c=qmap[t]; if(!c) return null; const tc=TYPE_C[t]; return (
                      <span key={t} style={{ fontSize:'10px', padding:'2px 8px', borderRadius:'20px', background:tc.bg, color:tc.color, fontWeight:600 }}>{tc.emoji} {t} ×{c}</span>
                    ); })}
                  </div>
                  <div style={{ display:'flex', flexDirection:'column', gap:'3px', maxHeight:'130px', overflowY:'auto', marginBottom:'10px' }}>
                    {ep.questions.map((q,i)=>{ const tc=TYPE_C[q.type]; return (
                      <div key={q.id} style={{ display:'flex', alignItems:'flex-start', gap:'6px', padding:'4px 7px', borderRadius:'6px', background:'#f9fafb' }}>
                        <span style={{ fontSize:'9px', fontWeight:700, color:'#9ca3af', flexShrink:0, marginTop:'1px' }}>Q{i+1}</span>
                        <span style={{ fontSize:'10px', padding:'1px 5px', borderRadius:'4px', background:tc.bg, color:tc.color, fontWeight:600, flexShrink:0 }}>{tc.short}</span>
                        <span style={{ fontSize:'10px', color:'#374151', lineHeight:1.4, flex:1 }}>{clamp(q.prompt, 55)}</span>
                      </div>
                    ); })}
                  </div>
                  {confirming ? (
                    <div style={{ padding:'9px 11px', background:'#fffbeb', borderRadius:'8px', border:'1px solid #fde68a' }}>
                      <div style={{ fontSize:'11px', color:'#92400e', fontWeight:600, marginBottom:'7px' }}>⚠️ This will replace current canvas content.</div>
                      <div style={{ display:'flex', gap:'6px' }}>
                        <button onClick={()=>{ onLoad(ep); setConfirmId(null); setExpandId(ep.id); }}
                          style={{ flex:1, padding:'7px', borderRadius:'7px', border:'none', cursor:'pointer', background:'#ef4444', color:'#fff', fontSize:'11px', fontWeight:700 }}>Replace & Load</button>
                        <button onClick={()=>setConfirmId(null)}
                          style={{ padding:'7px 11px', borderRadius:'7px', border:'1px solid #e8eaed', cursor:'pointer', background:'#fff', color:'#374151', fontSize:'11px' }}>Cancel</button>
                      </div>
                    </div>
                  ) : (
                    <button onClick={()=>tryLoad(ep)}
                      style={{ width:'100%', padding:'9px', borderRadius:'8px', border:'none', cursor:'pointer', background:isLoaded?'#dcfce7':'#3b5bdb', color:isLoaded?'#15803d':'#fff', fontSize:'12px', fontWeight:700, display:'flex', alignItems:'center', justifyContent:'center', gap:'7px' }}>
                      {isLoaded ? <><CheckCircle2 size={13}/> Already Loaded</> : <><RotateCcw size={13}/> Load into Canvas</>}
                    </button>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   CANVAS QUESTION CARD
═══════════════════════════════════════════════════════════════════════════ */
interface CanvasQCardProps {
  q: SectionQ; globalIdx: number; secId: string;
  isEditing: boolean; isReplaceTarget: boolean;
  onEdit: () => void; onCancelEdit: () => void;
  onSaveEdit: (newPrompt: string) => void;
  onReplace: () => void; onRemove: () => void;
}
function CanvasQCard({ q, globalIdx, isEditing, isReplaceTarget, onEdit, onCancelEdit, onSaveEdit, onReplace, onRemove }: CanvasQCardProps) {
  const [editText, setEditText] = useState(q.prompt);
  useEffect(()=>{ setEditText(q.prompt); }, [q.prompt, isEditing]);

  return (
    <div style={{ borderRadius:'8px', border:`1.5px solid ${isEditing?'#93c5fd':isReplaceTarget?'#fde68a':'#f0f2f5'}`, background:isEditing?'#f0f7ff':isReplaceTarget?'#fffbeb':'#fafafa', overflow:'hidden', transition:'border-color 0.15s, background 0.15s' }}>
      <div style={{ display:'flex', alignItems:'center', gap:'7px', padding:'5px 8px', borderBottom:isEditing?'1px solid #bfdbfe':'none' }}>
        <span style={{ fontSize:'10px', fontWeight:700, color:'#3b5bdb', flexShrink:0 }}>Q{globalIdx}</span>
        <TypeBadge t={q.type}/>
        <DiffBadge d={q.diff}/>
        <span style={{ fontSize:'10px', fontWeight:600, color:'#6b7280', marginLeft:'auto', flexShrink:0 }}>{q.pts}pt</span>
        <div style={{ display:'flex', gap:'2px', marginLeft:'4px' }}>
          {!isEditing && (
            <>
              <button title="Edit" onClick={onEdit}
                style={{ width:'20px', height:'20px', borderRadius:'5px', border:'none', cursor:'pointer', background:'transparent', color:'#9ca3af', display:'flex', alignItems:'center', justifyContent:'center' }}
                onMouseEnter={e=>{ (e.currentTarget as HTMLElement).style.background='#eff6ff'; (e.currentTarget as HTMLElement).style.color='#3b5bdb'; }}
                onMouseLeave={e=>{ (e.currentTarget as HTMLElement).style.background='transparent'; (e.currentTarget as HTMLElement).style.color='#9ca3af'; }}>
                <Pencil size={10}/>
              </button>
              <button title="Replace" onClick={onReplace}
                style={{ width:'20px', height:'20px', borderRadius:'5px', border:'none', cursor:'pointer', background:isReplaceTarget?'#fef9c3':'transparent', color:isReplaceTarget?'#d97706':'#9ca3af', display:'flex', alignItems:'center', justifyContent:'center' }}
                onMouseEnter={e=>{ (e.currentTarget as HTMLElement).style.background='#fef3c7'; (e.currentTarget as HTMLElement).style.color='#d97706'; }}
                onMouseLeave={e=>{ (e.currentTarget as HTMLElement).style.background=isReplaceTarget?'#fef9c3':'transparent'; (e.currentTarget as HTMLElement).style.color=isReplaceTarget?'#d97706':'#9ca3af'; }}>
                <ArrowLeftRight size={10}/>
              </button>
            </>
          )}
          <button title="Remove" onClick={onRemove}
            style={{ width:'20px', height:'20px', borderRadius:'5px', border:'none', cursor:'pointer', background:'transparent', color:'#d1d5db', display:'flex', alignItems:'center', justifyContent:'center' }}
            onMouseEnter={e=>{ (e.currentTarget as HTMLElement).style.background='#fee2e2'; (e.currentTarget as HTMLElement).style.color='#b91c1c'; }}
            onMouseLeave={e=>{ (e.currentTarget as HTMLElement).style.background='transparent'; (e.currentTarget as HTMLElement).style.color='#d1d5db'; }}>
            <X size={10}/>
          </button>
        </div>
      </div>
      <div style={{ padding:'5px 8px 7px' }}>
        {isEditing ? (
          <>
            <textarea value={editText} onChange={e=>setEditText(e.target.value)} rows={3} autoFocus
              style={{ width:'100%', boxSizing:'border-box', padding:'6px 9px', borderRadius:'6px', border:'1.5px solid #93c5fd', fontSize:'11px', color:'#0f0f23', outline:'none', resize:'vertical', fontFamily:'inherit', lineHeight:1.55 }}/>
            {q.options && (
              <div style={{ marginTop:'5px', display:'flex', flexDirection:'column', gap:'2px' }}>
                {q.options.map(opt=>(
                  <div key={opt} style={{ fontSize:'10px', color:'#6b7280', padding:'2px 6px', borderRadius:'4px', background:'#fff', border:'1px solid #e8eaed' }}>{opt}</div>
                ))}
              </div>
            )}
            <div style={{ display:'flex', gap:'5px', marginTop:'7px' }}>
              <button onClick={()=>onSaveEdit(editText)} style={{ padding:'4px 12px', borderRadius:'6px', border:'none', cursor:'pointer', background:'#3b5bdb', color:'#fff', fontSize:'11px', fontWeight:600, display:'flex', alignItems:'center', gap:'4px' }}>
                <Check size={9}/> Save
              </button>
              <button onClick={onCancelEdit} style={{ padding:'4px 10px', borderRadius:'6px', border:'1px solid #e8eaed', cursor:'pointer', background:'#fff', color:'#6b7280', fontSize:'11px' }}>Cancel</button>
            </div>
          </>
        ) : (
          <span style={{ fontSize:'11px', color:'#374151', lineHeight:1.55 }}>{q.prompt}</span>
        )}
      </div>
      {isReplaceTarget && !isEditing && (
        <div style={{ padding:'4px 8px', background:'#fef3c7', borderTop:'1px solid #fde68a', fontSize:'10px', color:'#92400e', display:'flex', alignItems:'center', gap:'4px' }}>
          <ArrowLeftRight size={9}/> Switch to Question Bank tab and click a question to replace
        </div>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   ASSEMBLE VIEW
═══════════════════════════════════════════════════════════════════════════ */
function AssembleView({ onSave }: { onSave:(p:Paper)=>void }) {
  const [mode,    setMode]    = useState<AssembleMode>('bank');
  const [grade,   setGrade]   = useState('Grade 10');
  const [subject, setSubject] = useState('Biology');
  const [title,   setTitle]   = useState('');
  const [kind,    setKind]    = useState<PaperKind>('exam');
  const [dur,     setDur]     = useState(90);

  const [sections, setSections] = useState<Section[]>([
    { id:nid(), label:'Section I: Multiple Choice', type:'MCQ', ptsEach:3, qs:[
      { uid:nid(), libId:'lq1', type:'MCQ', diff:'easy',   pts:3, prompt:'Which organelle is primarily responsible for photosynthesis?', options:['A. Mitochondria','B. Chloroplast','C. Ribosome','D. Vacuole'], answer:'B' },
      { uid:nid(), libId:'lq2', type:'MCQ', diff:'medium', pts:3, prompt:'In the Calvin cycle, which molecule is the first CO₂ acceptor?', options:['A. RuBP','B. G3P','C. ATP','D. NADPH'], answer:'A' },
      { uid:nid(), libId:'lq3', type:'MCQ', diff:'hard',   pts:3, prompt:'In the Z-scheme, the final electron acceptor is:', options:['A. Ferredoxin','B. NADP⁺','C. Plastocyanin','D. O₂'], answer:'B' },
    ]},
    { id:nid(), label:'Section II: True / False', type:'True/False', ptsEach:2, qs:[
      { uid:nid(), libId:'lq4', type:'True/False', diff:'easy',   pts:2, prompt:'The Calvin cycle is also called the "light-independent" reactions.', answer:'True' },
      { uid:nid(), libId:'lq5', type:'True/False', diff:'medium', pts:2, prompt:'Chlorophyll a absorbs light most strongly in the green region.', answer:'False' },
    ]},
    { id:nid(), label:'Section III: Fill-blank', type:'Fill-blank', ptsEach:3, qs:[
      { uid:nid(), libId:'lq6', type:'Fill-blank', diff:'medium', pts:3, prompt:'The splitting of water during photosynthesis is called _______.', answer:'Photolysis' },
      { uid:nid(), libId:'lq7', type:'Fill-blank', diff:'hard',   pts:3, prompt:'In PS I, the primary electron acceptor is _______.', answer:'Ferredoxin' },
    ]},
    { id:nid(), label:'Section IV: Short Answer', type:'Short Answer', ptsEach:6, qs:[
      { uid:nid(), libId:'lq8', type:'Short Answer', diff:'medium', pts:6, prompt:'Explain why a leaf appears green. What happens to the absorbed wavelengths?' },
    ]},
    { id:nid(), label:'Section V: Essay', type:'Essay', ptsEach:15, qs:[
      { uid:nid(), libId:'lq10', type:'Essay', diff:'hard', pts:15, prompt:'Describe the complete process of photosynthesis, covering both the light-dependent and light-independent reactions.' },
    ]},
  ]);

  const [loadedPaperId, setLoadedPaperId] = useState<string|null>(null);
  const [addSecOpen,    setAddSecOpen]    = useState(false);
  const [newSecType,    setNewSecType]    = useState<QType>('MCQ');
  const [saved,         setSaved]         = useState(false);
  const [editingId,     setEditingId]     = useState<string|null>(null);
  const [replaceTarget, setReplaceTarget] = useState<{ secId:string; uid:string; type:QType }|null>(null);

  const addedIds = new Set<string>(sections.flatMap(s => s.qs.map(q => q.libId)));
  const canvasHasContent = sections.some(s=>s.qs.length>0);

  // Load an entire exam paper into canvas
  function loadPaper(ep: ExamPaperEntry) {
    const secMap: Partial<Record<QType,Section>> = {};
    ep.questions.forEach(q=>{
      if (!secMap[q.type]) {
        const idx = Object.keys(secMap).length;
        secMap[q.type] = { id:nid(), label:`Section ${ROMAN[idx]??idx+1}: ${q.type}`, type:q.type, ptsEach:defaultPts(q.type), qs:[] };
      }
      secMap[q.type]!.qs.push({ uid:nid(), libId:q.id, type:q.type, diff:q.diff, pts:defaultPts(q.type), prompt:q.prompt, options:q.options, answer:q.answer });
    });
    setSections(Object.values(secMap) as Section[]);
    setLoadedPaperId(ep.id);
    setGrade(ep.grade); setSubject(ep.subject); setDur(ep.durationMin);
    setTitle(ep.title + ' (edited)');
    setEditingId(null); setReplaceTarget(null);
  }

  function addQ(lq: LibQ) {
    const existing = sections.find(s=>s.type===lq.type);
    const pts = defaultPts(lq.type);
    if (existing) {
      setSections(prev=>prev.map(s=>s.id===existing.id
        ? {...s, qs:[...s.qs, { uid:nid(), libId:lq.id, type:lq.type, diff:lq.diff, pts:s.ptsEach, prompt:lq.prompt, options:lq.options, answer:lq.answer }]}
        : s));
    } else {
      const idx = sections.length;
      setSections(prev=>[...prev, { id:nid(), label:`Section ${ROMAN[idx]??idx+1}: ${lq.type}`, type:lq.type, ptsEach:pts, qs:[{ uid:nid(), libId:lq.id, type:lq.type, diff:lq.diff, pts, prompt:lq.prompt, options:lq.options, answer:lq.answer }] }]);
    }
  }
  function replaceQ(lq: LibQ) {
    if (!replaceTarget) return;
    setSections(prev=>prev.map(s=>s.id===replaceTarget.secId
      ? {...s, qs:s.qs.map(q=>q.uid===replaceTarget.uid ? {...q, libId:lq.id, prompt:lq.prompt, options:lq.options, answer:lq.answer, diff:lq.diff} : q)}
      : s));
    setReplaceTarget(null);
  }
  function saveEdit(secId: string, uid: string, newPrompt: string) {
    setSections(prev=>prev.map(s=>s.id===secId ? {...s, qs:s.qs.map(q=>q.uid===uid ? {...q, prompt:newPrompt} : q)} : s));
    setEditingId(null);
  }
  function removeQ(secId: string, uid: string) {
    if (editingId===uid) setEditingId(null);
    if (replaceTarget?.uid===uid) setReplaceTarget(null);
    setSections(prev=>prev.map(s=>s.id===secId ? {...s, qs:s.qs.filter(q=>q.uid!==uid)} : s));
  }
  function removeSec(id: string) { setSections(prev=>prev.filter(s=>s.id!==id)); }
  function updatePtsEach(secId: string, v: number) {
    setSections(prev=>prev.map(s=>s.id===secId ? {...s, ptsEach:v, qs:s.qs.map(q=>({...q, pts:v}))} : s));
  }
  function addSection() {
    const idx = sections.length;
    setSections(prev=>[...prev, { id:nid(), label:`Section ${ROMAN[idx]??idx+1}: ${newSecType}`, type:newSecType, ptsEach:defaultPts(newSecType), qs:[] }]);
    setAddSecOpen(false);
  }

  const totalQ   = sections.reduce((n,s)=>n+s.qs.length, 0);
  const totalPts = sections.reduce((n,s)=>n+s.qs.length*s.ptsEach, 0);

  function handleSave() {
    const paper: Paper = {
      id:`p${Date.now()}`, title:title||`${grade} ${subject} ${kind==='exam'?'Exam':kind==='quiz'?'Quiz':'Homework'}`,
      kind, grade, subject, status:'draft', duration:dur, totalPts, qCount:totalQ, sections, createdAt:new Date().toISOString(),
    };
    onSave(paper); setSaved(true); setTimeout(()=>setSaved(false), 2500);
  }

  return (
    <div style={{ display:'flex', flexDirection:'column', height:'100%', overflow:'hidden' }}>
      {/* Config bar */}
      <div style={{ padding:'9px 18px', borderBottom:'1px solid #e8eaed', background:'#fafafa', display:'flex', alignItems:'center', gap:'10px', flexShrink:0, flexWrap:'wrap' }}>
        <div style={{ display:'flex', background:'#f3f4f6', borderRadius:'8px', padding:'2px' }}>
          {(['exam','quiz','homework'] as PaperKind[]).map(k=>(
            <button key={k} onClick={()=>setKind(k)} style={{ padding:'5px 12px', borderRadius:'6px', border:'none', cursor:'pointer', fontSize:'12px', background:kind===k?'#fff':'transparent', color:kind===k?'#0f0f23':'#6b7280', fontWeight:kind===k?600:400, boxShadow:kind===k?'0 1px 3px rgba(0,0,0,0.08)':'none' }}>
              {k==='exam'?'📋 Exam':k==='quiz'?'⚡ Quiz':'📚 Homework'}
            </button>
          ))}
        </div>
        <MiniSelect label="Grade "   value={grade}   onChange={setGrade}   options={GRADES}/>
        <MiniSelect label="Subject " value={subject} onChange={setSubject} options={SUBJECTS}/>
        <input value={title} onChange={e=>setTitle(e.target.value)}
          placeholder={`e.g. ${grade} ${subject} Midterm 2026`}
          style={{ flex:1, minWidth:'180px', padding:'7px 12px', borderRadius:'8px', border:'1.5px solid #e8eaed', fontSize:'12px', color:'#0f0f23', outline:'none' }}
          onFocus={e=>{e.currentTarget.style.borderColor='#3b5bdb';}} onBlur={e=>{e.currentTarget.style.borderColor='#e8eaed';}}/>
        <div style={{ display:'flex', alignItems:'center', gap:'5px' }}>
          <Clock size={12} style={{ color:'#9ca3af' }}/>
          <input type="number" value={dur} min={5} max={360} onChange={e=>setDur(+e.target.value)}
            style={{ width:'50px', padding:'6px 8px', borderRadius:'8px', border:'1.5px solid #e8eaed', fontSize:'12px', textAlign:'center', outline:'none' }}/>
          <span style={{ fontSize:'11px', color:'#6b7280' }}>min</span>
        </div>
      </div>

      {/* Body */}
      <div style={{ flex:1, display:'flex', overflow:'hidden' }}>
        {/* LEFT PANEL */}
        <div style={{ width:'272px', flexShrink:0, borderRight:'1px solid #e8eaed', display:'flex', flexDirection:'column', overflow:'hidden', background:'#fff' }}>
          {/* Mode switcher */}
          <div style={{ padding:'10px 11px 0', flexShrink:0 }}>
            <div style={{ display:'flex', background:'#f3f4f6', borderRadius:'8px', padding:'2px', marginBottom:'10px' }}>
              {([
                { id:'bank'   as AssembleMode, label:'Question Bank', icon:<BookOpen size={11}/> },
                { id:'papers' as AssembleMode, label:'Exam Papers',   icon:<FileText size={11}/> },
              ]).map(m=>(
                <button key={m.id} onClick={()=>{ setMode(m.id); if(replaceTarget) setReplaceTarget(null); }}
                  style={{ flex:1, padding:'6px 4px', borderRadius:'6px', border:'none', cursor:'pointer', fontSize:'11px', fontWeight:mode===m.id?700:400, background:mode===m.id?'#fff':'transparent', color:mode===m.id?'#0f0f23':'#6b7280', boxShadow:mode===m.id?'0 1px 3px rgba(0,0,0,0.08)':'none', display:'flex', alignItems:'center', justifyContent:'center', gap:'5px', transition:'all 0.15s' }}>
                  {m.icon}{m.label}
                </button>
              ))}
            </div>
          </div>
          {/* Panel content */}
          {mode==='bank' ? (
            <QuestionBankBrowser
              addedIds={addedIds}
              replaceMode={!!replaceTarget}
              replaceTargetType={replaceTarget?.type??null}
              onAdd={addQ}
              onReplace={replaceQ}
            />
          ) : (
            <ExamPaperPicker
              onLoad={loadPaper}
              canvasHasContent={canvasHasContent}
              loadedPaperId={loadedPaperId}
            />
          )}
        </div>

        {/* RIGHT — Canvas */}
        <div style={{ flex:1, display:'flex', flexDirection:'column', overflow:'hidden', background:'#f7f8fb' }}>
          <div style={{ padding:'8px 18px', borderBottom:'1px solid #e8eaed', background:'#fff', display:'flex', alignItems:'center', gap:'10px', flexShrink:0 }}>
            <span style={{ fontSize:'12px', fontWeight:700, color:'#0f0f23' }}>Paper Canvas</span>
            <span style={{ fontSize:'11px', color:'#9ca3af' }}>{totalQ}q · {totalPts}pts · {dur}min</span>
            {loadedPaperId && (
              <span style={{ fontSize:'10px', padding:'2px 8px', borderRadius:'20px', background:'#f0f4ff', color:'#3b5bdb', fontWeight:600 }}>
                based on {EXAM_PAPERS.find(p=>p.id===loadedPaperId)?.title.split('—')[0].trim()}
              </span>
            )}
            {replaceTarget && (
              <button onClick={()=>setReplaceTarget(null)}
                style={{ marginLeft:'auto', display:'flex', alignItems:'center', gap:'5px', padding:'4px 11px', borderRadius:'6px', border:'1px solid #fde68a', background:'#fef9c3', color:'#92400e', fontSize:'11px', cursor:'pointer' }}>
                <X size={10}/> Cancel Replace
              </button>
            )}
          </div>

          <div style={{ flex:1, overflowY:'auto', padding:'14px 18px', display:'flex', flexDirection:'column', gap:'12px' }}>
            {sections.length===0 ? (
              <div style={{ textAlign:'center', padding:'60px 20px', border:'2px dashed #e8eaed', borderRadius:'16px', color:'#9ca3af', background:'#fff' }}>
                <Layers size={30} style={{ opacity:0.18, display:'block', margin:'0 auto 10px' }}/>
                <div style={{ fontSize:'13px', fontWeight:600, color:'#374151', marginBottom:'4px' }}>Paper canvas is empty</div>
                <div style={{ fontSize:'12px' }}>Browse the Question Bank to add questions, or load an Exam Paper as a starting point.</div>
              </div>
            ) : sections.map((sec,si)=>{
              const tc=TYPE_C[sec.type]; const secTotal=sec.qs.length*sec.ptsEach;
              return (
                <div key={sec.id} style={{ background:'#fff', border:'1px solid #e8eaed', borderRadius:'12px', overflow:'hidden' }}>
                  <div style={{ display:'flex', alignItems:'center', gap:'9px', padding:'9px 12px', background:'#f8f9fb', borderBottom:'1px solid #f0f2f5' }}>
                    <div style={{ width:'6px', height:'6px', borderRadius:'50%', background:tc.color, flexShrink:0 }}/>
                    <span style={{ fontSize:'12px', fontWeight:700, color:'#0f0f23', flex:1 }}>{sec.label}</span>
                    <TypeBadge t={sec.type}/>
                    <div style={{ display:'flex', alignItems:'center', gap:'4px', fontSize:'11px', color:'#6b7280' }}>
                      <span>{sec.qs.length}q ·</span>
                      <input type="number" value={sec.ptsEach} min={1} max={50} onChange={e=>updatePtsEach(sec.id,+e.target.value)}
                        style={{ width:'34px', textAlign:'center', padding:'2px 4px', borderRadius:'5px', border:'1px solid #e8eaed', fontSize:'11px', fontWeight:600, color:'#3b5bdb' }}/>
                      <span>pt/q =</span>
                      <span style={{ color:'#0f0f23', fontWeight:700 }}>{secTotal}pt</span>
                    </div>
                    <button onClick={()=>removeSec(sec.id)} style={{ width:'20px', height:'20px', borderRadius:'5px', border:'none', cursor:'pointer', background:'#fee2e2', color:'#b91c1c', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
                      <X size={10}/>
                    </button>
                  </div>
                  <div style={{ padding:'8px 12px', display:'flex', flexDirection:'column', gap:'5px' }}>
                    {sec.qs.length===0 ? (
                      <div style={{ fontSize:'11px', color:'#9ca3af', padding:'6px 0', fontStyle:'italic' }}>No questions — add {sec.type} questions from the Question Bank.</div>
                    ) : sec.qs.map((q,qi)=>{
                      const globalIdx=sections.slice(0,si).reduce((n,s)=>n+s.qs.length,0)+qi+1;
                      return (
                        <React.Fragment key={q.uid}>
                          <CanvasQCard
                            q={q} globalIdx={globalIdx} secId={sec.id}
                            isEditing={editingId===q.uid}
                            isReplaceTarget={replaceTarget?.uid===q.uid}
                            onEdit={()=>{ setReplaceTarget(null); setEditingId(q.uid); }}
                            onCancelEdit={()=>setEditingId(null)}
                            onSaveEdit={(p)=>saveEdit(sec.id,q.uid,p)}
                            onReplace={()=>{ setEditingId(null); setMode('bank'); setReplaceTarget(rt=>rt?.uid===q.uid?null:{secId:sec.id,uid:q.uid,type:q.type}); }}
                            onRemove={()=>removeQ(sec.id,q.uid)}
                          />
                        </React.Fragment>
                      );
                    })}
                  </div>
                </div>
              );
            })}
            {/* Add section */}
            <div>
              {addSecOpen ? (
                <div style={{ display:'flex', alignItems:'center', gap:'8px', padding:'10px 14px', border:'1.5px solid #3b5bdb', borderRadius:'10px', background:'#f0f4ff', flexWrap:'wrap' }}>
                  <span style={{ fontSize:'12px', fontWeight:600, color:'#374151' }}>Type:</span>
                  {Q_TYPES.map(t=>(
                    <button key={t} onClick={()=>setNewSecType(t)} style={{ padding:'4px 9px', borderRadius:'6px', border:'none', cursor:'pointer', fontSize:'11px', background:newSecType===t?TYPE_C[t].bg:'#f3f4f6', color:newSecType===t?TYPE_C[t].color:'#6b7280', fontWeight:newSecType===t?700:400 }}>
                      {TYPE_C[t].emoji} {TYPE_C[t].short}
                    </button>
                  ))}
                  <button onClick={addSection} style={{ marginLeft:'auto', padding:'5px 14px', borderRadius:'7px', border:'none', cursor:'pointer', background:'#3b5bdb', color:'#fff', fontSize:'12px', fontWeight:600 }}>Add</button>
                  <button onClick={()=>setAddSecOpen(false)} style={{ padding:'5px 9px', borderRadius:'7px', border:'1px solid #e8eaed', cursor:'pointer', background:'#fff', color:'#6b7280', fontSize:'12px' }}>Cancel</button>
                </div>
              ) : (
                <button onClick={()=>setAddSecOpen(true)}
                  style={{ display:'flex', alignItems:'center', gap:'6px', padding:'8px', borderRadius:'9px', border:'1.5px dashed #d1d5db', background:'transparent', color:'#9ca3af', fontSize:'12px', cursor:'pointer', width:'100%', justifyContent:'center' }}
                  onMouseEnter={e=>{ (e.currentTarget as HTMLElement).style.borderColor='#3b5bdb'; (e.currentTarget as HTMLElement).style.color='#3b5bdb'; }}
                  onMouseLeave={e=>{ (e.currentTarget as HTMLElement).style.borderColor='#d1d5db'; (e.currentTarget as HTMLElement).style.color='#9ca3af'; }}>
                  <Plus size={12}/> Add Section
                </button>
              )}
            </div>
          </div>

          {/* Footer */}
          <div style={{ borderTop:'1px solid #e8eaed', padding:'10px 18px', display:'flex', alignItems:'center', justifyContent:'space-between', background:'#fff', flexShrink:0 }}>
            <div style={{ display:'flex', gap:'16px' }}>
              {[{ icon:<FileText size={12}/>, label:`${totalQ} question${totalQ!==1?'s':''}` },{ icon:<Award size={12}/>, label:`${totalPts} pts` },{ icon:<Clock size={12}/>, label:`${dur} min` }].map(item=>(
                <div key={item.label} style={{ display:'flex', alignItems:'center', gap:'4px', fontSize:'12px', color:'#6b7280' }}><span style={{ color:'#9ca3af' }}>{item.icon}</span>{item.label}</div>
              ))}
            </div>
            <div style={{ display:'flex', gap:'8px', alignItems:'center' }}>
              {saved && <span style={{ fontSize:'11px', color:'#15803d', display:'flex', alignItems:'center', gap:'4px' }}><CheckCircle2 size={12}/> Saved</span>}
              <button onClick={handleSave} disabled={totalQ===0}
                style={{ display:'flex', alignItems:'center', gap:'6px', padding:'8px 18px', borderRadius:'9px', border:'none', cursor:totalQ>0?'pointer':'not-allowed', background:totalQ>0?'#3b5bdb':'#e8eaed', color:totalQ>0?'#fff':'#9ca3af', fontSize:'13px', fontWeight:600 }}>
                <Save size={12}/> Save Draft
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   PUBLISH VIEW
═══════════════════════════════════════════════════════════════════════════ */
function PublishCard({ paper, onDelete, onSelectPublish, isSelected }: {
  paper:Paper; onDelete:(id:string)=>void; onSelectPublish:()=>void; isSelected:boolean;
}) {
  const [confirmDel, setConfirmDel] = useState(false);
  const sc=STATUS_C[paper.status]; const se=SUBJ_EMOJI[paper.subject]??'📄';
  return (
    <div style={{ background:'#fff', border:`1.5px solid ${isSelected?'#93c5fd':'#e8eaed'}`, borderRadius:'12px', overflow:'hidden', boxShadow:isSelected?'0 0 0 3px rgba(59,91,219,0.10)':'none', transition:'all 0.15s' }}>
      <div style={{ display:'flex', alignItems:'center', gap:'12px', padding:'13px 15px' }}>
        <div style={{ width:'3px', height:'38px', borderRadius:'2px', background:sc.dot, flexShrink:0 }}/>
        <div style={{ fontSize:'20px', flexShrink:0 }}>{se}</div>
        <div style={{ flex:1, minWidth:0 }}>
          <div style={{ display:'flex', alignItems:'center', gap:'7px', marginBottom:'3px', flexWrap:'wrap' }}>
            <span style={{ fontSize:'13px', fontWeight:700, color:'#0f0f23', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', maxWidth:'300px' }}>{paper.title}</span>
            <span style={{ fontSize:'9px', fontWeight:700, padding:'2px 7px', borderRadius:'20px', background:sc.bg, color:sc.color, flexShrink:0 }}>{sc.label.toUpperCase()}</span>
            <span style={{ fontSize:'9px', fontWeight:600, padding:'2px 6px', borderRadius:'20px', background:'#f3f4f6', color:'#6b7280', flexShrink:0, textTransform:'uppercase' }}>{paper.kind}</span>
          </div>
          <div style={{ display:'flex', gap:'12px', flexWrap:'wrap' }}>
            {[{ icon:<FileText size={9}/>, v:`${paper.qCount}q` },{ icon:<Award size={9}/>, v:`${paper.totalPts}pts` },{ icon:<Clock size={9}/>, v:`${paper.duration}min` },{ icon:<Calendar size={9}/>, v:fmtDate(paper.createdAt) }].map(s=>(
              <span key={s.v} style={{ display:'flex', alignItems:'center', gap:'3px', fontSize:'10px', color:'#9ca3af' }}>{s.icon}{s.v}</span>
            ))}
            {paper.publishCfg && <span style={{ display:'flex', alignItems:'center', gap:'3px', fontSize:'10px', color:'#9ca3af' }}><Users size={9}/>{paper.publishCfg.classes.join(', ')}</span>}
          </div>
          {paper.note && <div style={{ fontSize:'10px', color:'#92400e', marginTop:'3px', display:'flex', alignItems:'center', gap:'3px' }}><AlertCircle size={9} style={{ color:'#f59e0b' }}/>{paper.note}</div>}
        </div>
        <div style={{ display:'flex', gap:'5px', flexShrink:0 }}>
          {confirmDel ? (
            <>
              <span style={{ fontSize:'11px', color:'#ef4444', alignSelf:'center' }}>Delete?</span>
              <button onClick={()=>setConfirmDel(false)} style={{ padding:'4px 9px', borderRadius:'6px', border:'1px solid #e8eaed', background:'#fff', color:'#374151', fontSize:'11px', cursor:'pointer' }}>Cancel</button>
              <button onClick={()=>onDelete(paper.id)} style={{ padding:'4px 9px', borderRadius:'6px', border:'none', background:'#fee2e2', color:'#b91c1c', fontSize:'11px', fontWeight:600, cursor:'pointer' }}>Delete</button>
            </>
          ) : (
            <>
              <button onClick={()=>setConfirmDel(true)} style={{ display:'flex', alignItems:'center', padding:'6px 9px', borderRadius:'7px', border:'1px solid #fecaca', background:'#fff', color:'#ef4444', fontSize:'11px', cursor:'pointer' }}><Trash2 size={11}/></button>
              <button style={{ display:'flex', alignItems:'center', gap:'3px', padding:'6px 10px', borderRadius:'7px', border:'1px solid #e8eaed', background:'#fff', color:'#374151', fontSize:'11px', cursor:'pointer' }}><Edit3 size={11}/> Edit</button>
              {paper.status==='draft' ? (
                <button onClick={onSelectPublish} style={{ display:'flex', alignItems:'center', gap:'4px', padding:'6px 13px', borderRadius:'7px', border:'none', background:isSelected?'#eff6ff':'#3b5bdb', color:isSelected?'#3b5bdb':'#fff', fontSize:'11px', fontWeight:600, cursor:'pointer' }}>
                  <Send size={11}/> {isSelected?'Cancel':'Publish'}
                </button>
              ) : (
                <button style={{ display:'flex', alignItems:'center', gap:'3px', padding:'6px 12px', borderRadius:'7px', border:'1px solid #e8eaed', background:'#fff', color:'#374151', fontSize:'11px', cursor:'pointer' }}><Eye size={11}/> View</button>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function PublishPanel({ paper, onClose, onPublish }: { paper:Paper; onClose:()=>void; onPublish:(cfg:PublishCfg)=>void }) {
  const [assignKind,  setAssignKind]  = useState<AssignKind>('exam');
  const [classes,     setClasses]     = useState<string[]>([]);
  const [startDate,   setStartDate]   = useState('2026-04-10');
  const [endDate,     setEndDate]     = useState('2026-04-10');
  const [timeLimit,   setTimeLimit]   = useState(paper.duration);
  const [showResults, setShowResults] = useState(true);
  const [allowLate,   setAllowLate]   = useState(false);
  const [publishing,  setPublishing]  = useState(false);
  const [done,        setDone]        = useState(false);

  const ASSIGN_OPTS: Record<AssignKind,{ label:string; desc:string; emoji:string }> = {
    exam:     { label:'Exam',     emoji:'📝', desc:'One attempt, strict time limit' },
    quiz:     { label:'Quiz',     emoji:'⚡', desc:'Timed, may allow multiple attempts' },
    homework: { label:'Homework', emoji:'📚', desc:'Untimed, flexible submission window' },
  };
  function toggleClass(c: string) { setClasses(prev=>prev.includes(c)?prev.filter(x=>x!==c):[...prev,c]); }
  function doPublish() {
    if (!classes.length) return;
    setPublishing(true);
    setTimeout(()=>{ setPublishing(false); setDone(true); onPublish({ assignKind, classes, startDate, endDate, timeLimit, showResults, allowLate }); setTimeout(onClose,1100); },1400);
  }

  return (
    <div style={{ width:'320px', flexShrink:0, borderLeft:'1px solid #e8eaed', display:'flex', flexDirection:'column', background:'#fff', overflow:'hidden', height:'100%' }}>
      <div style={{ padding:'14px 16px', borderBottom:'1px solid #e8eaed', display:'flex', alignItems:'center', gap:'9px', flexShrink:0 }}>
        <div style={{ width:'32px', height:'32px', borderRadius:'8px', background:'#eff6ff', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
          <Send size={15} style={{ color:'#3b5bdb' }}/>
        </div>
        <div style={{ flex:1, minWidth:0 }}>
          <div style={{ fontSize:'13px', fontWeight:700, color:'#0f0f23' }}>Publish Paper</div>
          <div style={{ fontSize:'10px', color:'#6b7280', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{paper.title}</div>
        </div>
        <button onClick={onClose} style={{ width:'24px', height:'24px', borderRadius:'6px', border:'none', cursor:'pointer', background:'transparent', color:'#9ca3af', display:'flex', alignItems:'center', justifyContent:'center' }}
          onMouseEnter={e=>{(e.currentTarget as HTMLElement).style.background='#f3f4f6';}}
          onMouseLeave={e=>{(e.currentTarget as HTMLElement).style.background='transparent';}}>
          <X size={13}/>
        </button>
      </div>
      <div style={{ flex:1, overflowY:'auto', padding:'14px 16px', display:'flex', flexDirection:'column', gap:'16px' }}>
        <div>
          <div style={{ fontSize:'10px', fontWeight:700, color:'#9ca3af', textTransform:'uppercase', letterSpacing:'0.07em', marginBottom:'7px' }}>Assignment Type</div>
          <div style={{ display:'flex', flexDirection:'column', gap:'5px' }}>
            {(Object.entries(ASSIGN_OPTS) as [AssignKind,typeof ASSIGN_OPTS[AssignKind]][]).map(([k,v])=>(
              <button key={k} onClick={()=>setAssignKind(k)} style={{ display:'flex', alignItems:'center', gap:'9px', padding:'8px 10px', borderRadius:'8px', border:`1.5px solid ${assignKind===k?'#3b5bdb':'#e8eaed'}`, background:assignKind===k?'#f0f4ff':'#fff', cursor:'pointer', textAlign:'left' }}>
                <span style={{ fontSize:'15px' }}>{v.emoji}</span>
                <div style={{ flex:1 }}>
                  <div style={{ fontSize:'12px', fontWeight:assignKind===k?700:500, color:assignKind===k?'#3b5bdb':'#374151' }}>{v.label}</div>
                  <div style={{ fontSize:'10px', color:'#9ca3af' }}>{v.desc}</div>
                </div>
                {assignKind===k && <Check size={13} style={{ color:'#3b5bdb' }}/>}
              </button>
            ))}
          </div>
        </div>
        <div>
          <div style={{ fontSize:'10px', fontWeight:700, color:'#9ca3af', textTransform:'uppercase', letterSpacing:'0.07em', marginBottom:'7px' }}>Assign to Classes</div>
          <div style={{ display:'flex', flexDirection:'column', gap:'3px' }}>
            {ALL_CLASSES.map(c=>(
              <button key={c} onClick={()=>toggleClass(c)} style={{ display:'flex', alignItems:'center', gap:'8px', padding:'6px 9px', borderRadius:'7px', border:`1px solid ${classes.includes(c)?'#bfdbfe':'#f3f4f6'}`, background:classes.includes(c)?'#eff6ff':'#fafafa', cursor:'pointer', textAlign:'left' }}>
                <div style={{ width:'15px', height:'15px', borderRadius:'4px', border:`2px solid ${classes.includes(c)?'#3b5bdb':'#d1d5db'}`, background:classes.includes(c)?'#3b5bdb':'#fff', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
                  {classes.includes(c) && <Check size={9} style={{ color:'#fff' }}/>}
                </div>
                <span style={{ fontSize:'12px', fontWeight:classes.includes(c)?600:400, color:classes.includes(c)?'#1d4ed8':'#374151' }}>{c}</span>
              </button>
            ))}
          </div>
          {classes.length===0 && <div style={{ fontSize:'10px', color:'#ef4444', marginTop:'4px' }}>Select at least one class.</div>}
        </div>
        <div>
          <div style={{ fontSize:'10px', fontWeight:700, color:'#9ca3af', textTransform:'uppercase', letterSpacing:'0.07em', marginBottom:'7px' }}>Schedule</div>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'7px' }}>
            {[{label:'Start Date',value:startDate,set:setStartDate},{label:'End Date',value:endDate,set:setEndDate}].map(f=>(
              <div key={f.label}>
                <div style={{ fontSize:'10px', color:'#6b7280', marginBottom:'3px' }}>{f.label}</div>
                <input type="date" value={f.value} onChange={e=>f.set(e.target.value)} style={{ width:'100%', boxSizing:'border-box', padding:'6px 9px', borderRadius:'7px', border:'1.5px solid #e8eaed', fontSize:'11px', outline:'none' }}/>
              </div>
            ))}
          </div>
        </div>
        {assignKind!=='homework' && (
          <div>
            <div style={{ fontSize:'10px', fontWeight:700, color:'#9ca3af', textTransform:'uppercase', letterSpacing:'0.07em', marginBottom:'7px' }}>Time Limit</div>
            <div style={{ display:'flex', alignItems:'center', gap:'7px' }}>
              <input type="number" value={timeLimit} min={5} max={360} onChange={e=>setTimeLimit(+e.target.value)} style={{ width:'64px', padding:'6px 9px', borderRadius:'7px', border:'1.5px solid #e8eaed', fontSize:'13px', textAlign:'center', outline:'none' }}/>
              <span style={{ fontSize:'12px', color:'#6b7280' }}>minutes</span>
            </div>
          </div>
        )}
        <div>
          <div style={{ fontSize:'10px', fontWeight:700, color:'#9ca3af', textTransform:'uppercase', letterSpacing:'0.07em', marginBottom:'7px' }}>Options</div>
          {[{ label:'Show results to students after submission', val:showResults, set:setShowResults },{ label:'Allow late submission', val:allowLate, set:setAllowLate }].map(opt=>(
            <button key={opt.label} onClick={()=>opt.set(!opt.val)} style={{ display:'flex', alignItems:'center', gap:'8px', padding:'6px 0', border:'none', background:'transparent', cursor:'pointer', width:'100%', textAlign:'left', marginBottom:'2px' }}>
              <div style={{ width:'16px', height:'16px', borderRadius:'4px', border:`2px solid ${opt.val?'#3b5bdb':'#d1d5db'}`, background:opt.val?'#3b5bdb':'#fff', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
                {opt.val && <Check size={10} style={{ color:'#fff' }}/>}
              </div>
              <span style={{ fontSize:'12px', color:'#374151' }}>{opt.label}</span>
            </button>
          ))}
        </div>
      </div>
      <div style={{ padding:'12px 16px', borderTop:'1px solid #e8eaed', flexShrink:0 }}>
        <button onClick={doPublish} disabled={!classes.length||publishing||done}
          style={{ width:'100%', padding:'11px', borderRadius:'9px', border:'none', cursor:classes.length&&!publishing?'pointer':'not-allowed', background:done?'#dcfce7':!classes.length?'#e8eaed':'#3b5bdb', color:done?'#15803d':!classes.length?'#9ca3af':'#fff', fontSize:'13px', fontWeight:700, display:'flex', alignItems:'center', justifyContent:'center', gap:'7px', transition:'background 0.2s' }}>
          {done ? <><CheckCircle2 size={15}/> Published!</> : publishing ? <><span style={{ width:'13px', height:'13px', borderRadius:'50%', border:'2px solid rgba(255,255,255,0.3)', borderTopColor:'#fff', display:'inline-block', animation:'spin 0.7s linear infinite' }}/> Publishing…</> : <><Send size={14}/> Publish Now</>}
        </button>
      </div>
    </div>
  );
}

function PublishView({ papers, onDelete, onPublish, onNewPaper }: { papers:Paper[]; onDelete:(id:string)=>void; onPublish:(id:string,cfg:PublishCfg)=>void; onNewPaper:()=>void }) {
  const [filter,   setFilter]   = useState<'all'|PaperStatus>('all');
  const [selPaper, setSelPaper] = useState<Paper|null>(null);

  const displayed = filter==='all' ? papers : papers.filter(p=>p.status===filter);
  const cnt = { all:papers.length, draft:papers.filter(p=>p.status==='draft').length, published:papers.filter(p=>p.status==='published').length, closed:papers.filter(p=>p.status==='closed').length };

  return (
    <div style={{ display:'flex', height:'100%', overflow:'hidden' }}>
      <div style={{ flex:1, display:'flex', flexDirection:'column', overflow:'hidden' }}>
        <div style={{ padding:'12px 20px', borderBottom:'1px solid #e8eaed', display:'flex', alignItems:'center', gap:'10px', flexShrink:0, background:'#fafafa' }}>
          <div style={{ display:'flex', background:'#f3f4f6', borderRadius:'8px', padding:'2px' }}>
            {([['all',`All (${cnt.all})`],['draft',`Drafts (${cnt.draft})`],['published',`Published (${cnt.published})`],['closed',`Closed (${cnt.closed})`]] as [string,string][]).map(([k,l])=>(
              <React.Fragment key={k}>
                <Pill label={l} active={filter===k} onClick={()=>setFilter(k as typeof filter)}/>
              </React.Fragment>
            ))}
          </div>
          <button onClick={onNewPaper} style={{ marginLeft:'auto', display:'flex', alignItems:'center', gap:'5px', padding:'7px 15px', borderRadius:'8px', border:'none', cursor:'pointer', background:'#3b5bdb', color:'#fff', fontSize:'12px', fontWeight:600 }}>
            <Plus size={12}/> New Paper
          </button>
        </div>
        <div style={{ flex:1, overflowY:'auto', padding:'14px 20px', display:'flex', flexDirection:'column', gap:'8px' }}>
          {displayed.length===0 ? (
            <div style={{ textAlign:'center', padding:'60px 20px', color:'#9ca3af' }}>
              <FileText size={32} style={{ opacity:0.18, display:'block', margin:'0 auto 10px' }}/>
              <div style={{ fontSize:'13px' }}>No papers in this category</div>
            </div>
          ) : displayed.map(paper=>(
            <React.Fragment key={paper.id}>
              <PublishCard paper={paper} isSelected={selPaper?.id===paper.id} onDelete={onDelete} onSelectPublish={()=>setSelPaper(p=>p?.id===paper.id?null:paper)}/>
            </React.Fragment>
          ))}
        </div>
      </div>
      {selPaper && <PublishPanel paper={selPaper} onClose={()=>setSelPaper(null)} onPublish={cfg=>{ onPublish(selPaper.id,cfg); setSelPaper(null); }}/>}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   GRADE VIEW
═══════════════════════════════════════════════════════════════════════════ */
function GradeView({ papers, subs, onUpdateSub }: { papers:Paper[]; subs:StudentSub[]; onUpdateSub:(s:StudentSub)=>void }) {
  const gradable = papers.filter(p=>p.status==='published'||p.status==='closed');
  const [selPaperId, setSelPaperId] = useState<string>(gradable[0]?.id??'');
  const [selSubId,   setSelSubId]   = useState<string|null>(null);
  const [saIdx,      setSaIdx]      = useState(0);
  const [overrides,  setOverrides]  = useState<Record<string,{ pts:string; note:string }>>({});

  const paperSubs = subs.filter(s=>s.paperId===selPaperId);
  const selSub    = paperSubs.find(s=>s.id===selSubId)??null;
  const saResps   = selSub ? selSub.responses.filter(r=>r.type==='Short Answer'||r.type==='Essay') : [];
  const curSA     = saResps[saIdx]??null;
  const overKey   = curSA ? `${selSubId}_${curSA.qId}` : '';

  const pending   = paperSubs.filter(s=>s.status==='pending_sa').length;
  const aiDone    = paperSubs.filter(s=>s.status==='ai_graded').length;
  const completed = paperSubs.filter(s=>s.status==='fully_graded').length;
  const allGraded = saResps.length>0 && saResps.every((_,i)=>!!overrides[`${selSubId}_${saResps[i].qId}`]);

  const SUB_STATUS_C: Record<SubStatus,{ label:string; bg:string; color:string; Icon:typeof AlertCircle }> = {
    pending_sa:   { label:'SA Pending', bg:'#fef3c7', color:'#d97706', Icon:AlertCircle },
    ai_graded:    { label:'AI Graded',  bg:'#dbeafe', color:'#1d4ed8', Icon:Zap },
    fully_graded: { label:'Completed',  bg:'#dcfce7', color:'#15803d', Icon:CheckCircle2 },
  };

  function acceptAI() {
    if (!curSA) return;
    setOverrides(prev=>({...prev,[overKey]:{ pts:String(curSA.aiPts??0), note:'' }}));
    if (saIdx<saResps.length-1) setSaIdx(i=>i+1); else finishGrading();
  }
  function saveNext() { if (saIdx<saResps.length-1) setSaIdx(i=>i+1); else finishGrading(); }
  function finishGrading() {
    if (!selSub) return;
    onUpdateSub({...selSub, status:'fully_graded', teacherTotal:selSub.aiTotal});
  }

  return (
    <div style={{ display:'flex', height:'100%', overflow:'hidden' }}>
      {/* Panel 1: Papers */}
      <div style={{ width:'230px', flexShrink:0, borderRight:'1px solid #e8eaed', display:'flex', flexDirection:'column', overflow:'hidden', background:'#fff' }}>
        <div style={{ padding:'12px 12px 10px', borderBottom:'1px solid #f3f4f6', flexShrink:0 }}>
          <div style={{ fontSize:'10px', fontWeight:700, color:'#9ca3af', textTransform:'uppercase', letterSpacing:'0.07em', marginBottom:'9px' }}>Grading Center</div>
          {[{ label:'SA Pending', val:subs.filter(s=>s.status==='pending_sa').length, color:'#d97706', bg:'#fffbeb', Icon:AlertCircle },
            { label:'AI Graded',  val:subs.filter(s=>s.status!=='pending_sa').length, color:'#3b5bdb', bg:'#eff6ff', Icon:Zap },
            { label:'Completed',  val:subs.filter(s=>s.status==='fully_graded').length, color:'#059669', bg:'#ecfdf5', Icon:CheckCircle2 }].map(s=>{
            const I=s.Icon;
            return (
              <div key={s.label} style={{ display:'flex', alignItems:'center', gap:'7px', padding:'5px 7px', borderRadius:'7px', background:s.bg, marginBottom:'4px' }}>
                <I size={12} style={{ color:s.color, flexShrink:0 }}/>
                <div><div style={{ fontSize:'14px', fontWeight:700, color:s.color, lineHeight:1 }}>{s.val}</div><div style={{ fontSize:'9px', color:'#6b7280' }}>{s.label}</div></div>
              </div>
            );
          })}
        </div>
        <div style={{ flex:1, overflowY:'auto', padding:'7px' }}>
          {gradable.length===0 ? (
            <div style={{ fontSize:'11px', color:'#9ca3af', textAlign:'center', padding:'24px 8px' }}>No published papers</div>
          ) : gradable.map(p=>{
            const psubs=subs.filter(s=>s.paperId===p.id);
            const pend=psubs.filter(s=>s.status==='pending_sa').length;
            const done=psubs.filter(s=>s.status==='fully_graded').length;
            const pct=psubs.length>0?Math.round(done/psubs.length*100):0;
            const sel=selPaperId===p.id;
            return (
              <button key={p.id} onClick={()=>{ setSelPaperId(p.id); setSelSubId(null); setSaIdx(0); }}
                style={{ width:'100%', padding:'9px', borderRadius:'8px', border:`1px solid ${sel?'#bfdbfe':'transparent'}`, background:sel?'#f0f4ff':'transparent', cursor:'pointer', textAlign:'left', marginBottom:'3px' }}
                onMouseEnter={e=>{ if(!sel)(e.currentTarget as HTMLElement).style.background='#f9fafb'; }}
                onMouseLeave={e=>{ if(!sel)(e.currentTarget as HTMLElement).style.background='transparent'; }}>
                <div style={{ display:'flex', alignItems:'center', gap:'6px', marginBottom:'5px' }}>
                  <span style={{ fontSize:'15px' }}>{SUBJ_EMOJI[p.subject]??'📄'}</span>
                  <span style={{ fontSize:'11px', fontWeight:700, color:sel?'#3b5bdb':'#0f0f23', flex:1, lineHeight:1.3 }}>{clamp(p.title,32)}</span>
                  {pend>0 && <span style={{ fontSize:'9px', fontWeight:700, padding:'2px 5px', borderRadius:'4px', background:'#fef3c7', color:'#d97706', flexShrink:0 }}>{pend} SA</span>}
                </div>
                <div style={{ fontSize:'10px', color:'#9ca3af', marginBottom:'5px' }}>{psubs.length} students · {done}/{psubs.length} graded</div>
                <div style={{ height:'3px', borderRadius:'2px', background:'#e8eaed', overflow:'hidden' }}>
                  <div style={{ height:'100%', width:`${pct}%`, background:pct===100?'#10b981':'#3b5bdb', borderRadius:'2px', transition:'width 0.4s' }}/>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Panel 2: Students */}
      <div style={{ width:'238px', flexShrink:0, borderRight:'1px solid #e8eaed', display:'flex', flexDirection:'column', overflow:'hidden', background:'#fff' }}>
        <div style={{ padding:'9px 12px', borderBottom:'1px solid #f3f4f6', flexShrink:0, display:'flex', alignItems:'center', gap:'6px' }}>
          <Users size={12} style={{ color:'#374151' }}/>
          <span style={{ fontSize:'12px', fontWeight:700, color:'#0f0f23' }}>Students</span>
          <span style={{ fontSize:'10px', color:'#9ca3af', marginLeft:'auto' }}>{paperSubs.length} submitted</span>
        </div>
        <div style={{ display:'flex', padding:'7px 9px', gap:'5px', borderBottom:'1px solid #f3f4f6', flexShrink:0 }}>
          {[{ l:'SA Pend',v:pending,c:'#d97706',bg:'#fef9c3' },{ l:'AI Done',v:aiDone,c:'#3b5bdb',bg:'#dbeafe' },{ l:'Done',v:completed,c:'#059669',bg:'#dcfce7' }].map(s=>(
            <div key={s.l} style={{ flex:1, textAlign:'center', padding:'4px', borderRadius:'6px', background:s.bg }}>
              <div style={{ fontSize:'13px', fontWeight:700, color:s.c }}>{s.v}</div>
              <div style={{ fontSize:'9px', color:'#6b7280' }}>{s.l}</div>
            </div>
          ))}
        </div>
        <div style={{ flex:1, overflowY:'auto', padding:'5px' }}>
          {paperSubs.length===0 ? (
            <div style={{ fontSize:'11px', color:'#9ca3af', textAlign:'center', padding:'24px 8px' }}>No submissions yet</div>
          ) : paperSubs.map(sub=>{
            const sel=selSubId===sub.id;
            const sc=SUB_STATUS_C[sub.status]; const I=sc.Icon;
            return (
              <button key={sub.id} onClick={()=>{ setSelSubId(sub.id); setSaIdx(0); }}
                style={{ width:'100%', padding:'8px 9px', borderRadius:'8px', border:`1px solid ${sel?'#bfdbfe':'transparent'}`, background:sel?'#f0f4ff':'transparent', cursor:'pointer', textAlign:'left', marginBottom:'2px' }}
                onMouseEnter={e=>{ if(!sel)(e.currentTarget as HTMLElement).style.background='#f9fafb'; }}
                onMouseLeave={e=>{ if(!sel)(e.currentTarget as HTMLElement).style.background='transparent'; }}>
                <div style={{ display:'flex', alignItems:'center', gap:'7px' }}>
                  <span style={{ fontSize:'17px' }}>{sub.avatar}</span>
                  <div style={{ flex:1, minWidth:0 }}>
                    <div style={{ fontSize:'12px', fontWeight:sel?700:500, color:sel?'#3b5bdb':'#0f0f23' }}>{sub.name}</div>
                    <div style={{ fontSize:'9px', color:'#9ca3af' }}>#{sub.studentId}</div>
                  </div>
                  <div style={{ textAlign:'right', flexShrink:0 }}>
                    <div style={{ fontSize:'11px', fontWeight:700, color:sub.teacherTotal!=null?'#15803d':'#374151' }}>
                      {sub.teacherTotal??sub.aiTotal}<span style={{ fontSize:'9px', color:'#9ca3af', fontWeight:400 }}>/{sub.maxPts}</span>
                    </div>
                    <div style={{ display:'flex', alignItems:'center', gap:'2px', justifyContent:'flex-end', padding:'1px 5px', borderRadius:'4px', background:sc.bg, color:sc.color, fontSize:'9px', fontWeight:600 }}>
                      <I size={8}/> {sc.label}
                    </div>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Panel 3: Response Reviewer */}
      <div style={{ flex:1, display:'flex', flexDirection:'column', overflow:'hidden', background:'#f7f8fb' }}>
        {!selSub ? (
          <div style={{ flex:1, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', color:'#9ca3af', gap:'10px' }}>
            <MessageSquare size={36} style={{ opacity:0.14 }}/>
            <div style={{ fontSize:'13px', fontWeight:600, color:'#6b7280' }}>Select a student to begin review</div>
            <div style={{ fontSize:'11px', maxWidth:'240px', textAlign:'center' }}>AI grades MCQ, T/F, and Fill-blank automatically. SA and Essay require your review.</div>
          </div>
        ) : (
          <>
            <div style={{ padding:'11px 18px', borderBottom:'1px solid #e8eaed', display:'flex', alignItems:'center', gap:'10px', flexShrink:0, background:'#fff' }}>
              <span style={{ fontSize:'20px' }}>{selSub.avatar}</span>
              <div style={{ flex:1 }}>
                <div style={{ fontSize:'13px', fontWeight:700, color:'#0f0f23' }}>{selSub.name} <span style={{ fontSize:'11px', color:'#9ca3af', fontWeight:400 }}>#{selSub.studentId}</span></div>
                <div style={{ fontSize:'11px', color:'#6b7280' }}>Submitted {fmtDate(selSub.submittedAt)} · AI Total: {selSub.aiTotal}/{selSub.maxPts}</div>
              </div>
              {selSub.status==='pending_sa' && <span style={{ fontSize:'10px', fontWeight:600, padding:'4px 9px', borderRadius:'7px', background:'#fef3c7', color:'#d97706', display:'flex', alignItems:'center', gap:'4px' }}><AlertCircle size={10}/> {saResps.length}q pending</span>}
              {selSub.status==='fully_graded' && <span style={{ fontSize:'10px', fontWeight:600, padding:'4px 9px', borderRadius:'7px', background:'#dcfce7', color:'#15803d', display:'flex', alignItems:'center', gap:'4px' }}><CheckCircle2 size={10}/> Fully Reviewed</span>}
            </div>
            <div style={{ flex:1, overflowY:'auto', padding:'14px 18px', display:'flex', flexDirection:'column', gap:'12px' }}>
              <div style={{ background:'#fff', borderRadius:'12px', border:'1px solid #e8eaed', padding:'13px 15px' }}>
                <div style={{ fontSize:'11px', fontWeight:700, color:'#374151', marginBottom:'9px', display:'flex', alignItems:'center', gap:'5px' }}><Zap size={12} style={{ color:'#3b5bdb' }}/> Auto-graded by AI</div>
                <div style={{ display:'flex', flexDirection:'column', gap:'4px' }}>
                  {selSub.responses.filter(r=>r.type==='MCQ'||r.type==='True/False'||r.type==='Fill-blank').map((r,i)=>{
                    const tc=TYPE_C[r.type];
                    return (
                      <div key={r.qId} style={{ display:'flex', alignItems:'center', gap:'9px', padding:'5px 9px', borderRadius:'7px', background:r.isCorrect?'#f0fdf4':'#fef2f2' }}>
                        <span style={{ fontSize:'9px', fontWeight:700, padding:'1px 6px', borderRadius:'4px', background:tc.bg, color:tc.color, flexShrink:0 }}>Q{i+1}</span>
                        <span style={{ flex:1, fontSize:'11px', color:'#374151' }}>{clamp(r.prompt,62)}</span>
                        <span style={{ fontSize:'10px', fontWeight:600, color:'#6b7280', flexShrink:0 }}>"{clamp(r.studentAns,16)}"</span>
                        <span style={{ fontSize:'11px', fontWeight:700, color:r.isCorrect?'#15803d':'#b91c1c', flexShrink:0 }}>{r.aiPts}/{r.maxPts}</span>
                        {r.isCorrect ? <CheckCircle2 size={11} style={{ color:'#10b981', flexShrink:0 }}/> : <X size={11} style={{ color:'#ef4444', flexShrink:0 }}/>}
                      </div>
                    );
                  })}
                </div>
              </div>

              {saResps.length>0 && (
                <div style={{ background:'#fff', borderRadius:'12px', border:'1px solid #e8eaed', overflow:'hidden' }}>
                  <div style={{ padding:'10px 15px', borderBottom:'1px solid #f3f4f6', display:'flex', alignItems:'center', gap:'9px', background:'#f8f9fb' }}>
                    <MessageSquare size={13} style={{ color:'#374151' }}/>
                    <span style={{ fontSize:'12px', fontWeight:700, color:'#0f0f23', flex:1 }}>{curSA?.type==='Essay'?'Essay':'Short Answer'} Review</span>
                    <span style={{ fontSize:'11px', color:'#6b7280' }}>{saIdx+1}/{saResps.length}</span>
                    <button onClick={()=>setSaIdx(i=>Math.max(0,i-1))} disabled={saIdx===0} style={{ width:'24px', height:'24px', borderRadius:'6px', border:'1px solid #e8eaed', background:'#fff', cursor:saIdx>0?'pointer':'not-allowed', display:'flex', alignItems:'center', justifyContent:'center', color:'#6b7280', opacity:saIdx===0?0.4:1 }}><ChevronLeft size={12}/></button>
                    <button onClick={()=>setSaIdx(i=>Math.min(saResps.length-1,i+1))} disabled={saIdx>=saResps.length-1} style={{ width:'24px', height:'24px', borderRadius:'6px', border:'1px solid #e8eaed', background:'#fff', cursor:saIdx<saResps.length-1?'pointer':'not-allowed', display:'flex', alignItems:'center', justifyContent:'center', color:'#6b7280', opacity:saIdx>=saResps.length-1?0.4:1 }}><ChevronRight size={12}/></button>
                  </div>
                  {curSA && (
                    <div style={{ padding:'14px 15px' }}>
                      <div style={{ marginBottom:'12px' }}>
                        <div style={{ fontSize:'10px', fontWeight:700, color:'#9ca3af', textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:'5px' }}>Question</div>
                        <div style={{ fontSize:'12px', color:'#0f0f23', lineHeight:1.65, padding:'9px 12px', background:'#f8f9fb', borderRadius:'8px', borderLeft:'3px solid #3b5bdb' }}>{curSA.prompt}</div>
                        <div style={{ display:'flex', gap:'5px', marginTop:'5px' }}><TypeBadge t={curSA.type}/><span style={{ fontSize:'10px', color:'#6b7280', padding:'2px 7px', borderRadius:'20px', background:'#f3f4f6' }}>Max {curSA.maxPts} pts</span></div>
                      </div>
                      <div style={{ marginBottom:'12px' }}>
                        <div style={{ fontSize:'10px', fontWeight:700, color:'#9ca3af', textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:'5px' }}>Student's Answer</div>
                        <div style={{ fontSize:'12px', color:'#374151', lineHeight:1.7, padding:'10px 13px', background:'#f9fafb', borderRadius:'8px', border:'1px solid #f0f2f5', maxHeight:'130px', overflowY:'auto' }}>{curSA.studentAns}</div>
                      </div>
                      <div style={{ marginBottom:'14px', padding:'11px 13px', background:'#eff6ff', borderRadius:'10px', border:'1px solid #bfdbfe' }}>
                        <div style={{ display:'flex', alignItems:'center', gap:'6px', marginBottom:'6px' }}>
                          <Zap size={12} style={{ color:'#3b5bdb' }}/>
                          <span style={{ fontSize:'11px', fontWeight:700, color:'#1d4ed8' }}>AI Suggestion</span>
                          <span style={{ marginLeft:'auto', fontSize:'15px', fontWeight:700, color:'#1d4ed8' }}>{curSA.aiPts}<span style={{ fontSize:'10px', color:'#6b7280', fontWeight:400 }}>/{curSA.maxPts} pts</span></span>
                        </div>
                        <p style={{ margin:0, fontSize:'11px', color:'#374151', lineHeight:1.65, fontStyle:'italic' }}>{curSA.aiNote}</p>
                      </div>
                      <div>
                        <div style={{ fontSize:'10px', fontWeight:700, color:'#9ca3af', textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:'7px' }}>Your Review</div>
                        <div style={{ display:'flex', gap:'9px', marginBottom:'8px' }}>
                          <div>
                            <div style={{ fontSize:'11px', color:'#6b7280', marginBottom:'3px' }}>Score Override</div>
                            <div style={{ display:'flex', alignItems:'center', gap:'5px' }}>
                              <input type="number" min={0} max={curSA.maxPts}
                                value={overrides[overKey]?.pts ?? curSA.aiPts ?? ''}
                                onChange={e=>setOverrides(prev=>({...prev,[overKey]:{ pts:e.target.value, note:prev[overKey]?.note??'' }}))}
                                placeholder={String(curSA.aiPts??0)}
                                style={{ width:'52px', padding:'6px 8px', borderRadius:'7px', border:'1.5px solid #e8eaed', fontSize:'13px', textAlign:'center', outline:'none' }}/>
                              <span style={{ fontSize:'11px', color:'#6b7280' }}>/{curSA.maxPts}</span>
                            </div>
                          </div>
                          <div style={{ flex:1 }}>
                            <div style={{ fontSize:'11px', color:'#6b7280', marginBottom:'3px' }}>Feedback (optional)</div>
                            <textarea
                              value={overrides[overKey]?.note??''}
                              onChange={e=>setOverrides(prev=>({...prev,[overKey]:{ pts:prev[overKey]?.pts??String(curSA.aiPts??0), note:e.target.value }}))}
                              placeholder="Write feedback for student…" rows={2}
                              style={{ width:'100%', boxSizing:'border-box', padding:'6px 9px', borderRadius:'7px', border:'1.5px solid #e8eaed', fontSize:'11px', outline:'none', resize:'none', fontFamily:'inherit' }}/>
                          </div>
                        </div>
                        <div style={{ display:'flex', gap:'7px' }}>
                          <button onClick={acceptAI} style={{ display:'flex', alignItems:'center', gap:'5px', padding:'7px 14px', borderRadius:'8px', border:'none', cursor:'pointer', background:'#dcfce7', color:'#15803d', fontSize:'12px', fontWeight:600 }}><CheckCircle2 size={12}/> Accept AI Score</button>
                          <button onClick={saveNext} style={{ display:'flex', alignItems:'center', gap:'5px', padding:'7px 16px', borderRadius:'8px', border:'none', cursor:'pointer', background:'#3b5bdb', color:'#fff', fontSize:'12px', fontWeight:600 }}><Save size={12}/> {saIdx<saResps.length-1?'Save & Next':'Finish Review'}</button>
                        </div>
                        {saResps.length>1 && (
                          <div style={{ display:'flex', gap:'5px', marginTop:'11px', justifyContent:'center' }}>
                            {saResps.map((r,i)=>{ const rev=!!overrides[`${selSubId}_${r.qId}`]; return <div key={r.qId} onClick={()=>setSaIdx(i)} style={{ width:'7px', height:'7px', borderRadius:'50%', cursor:'pointer', background:i===saIdx?'#3b5bdb':rev?'#10b981':'#d1d5db', transition:'background 0.15s' }}/>; })}
                          </div>
                        )}
                        {allGraded && selSub.status!=='fully_graded' && (
                          <button onClick={finishGrading} style={{ width:'100%', marginTop:'12px', padding:'9px', borderRadius:'9px', border:'none', cursor:'pointer', background:'#059669', color:'#fff', fontSize:'12px', fontWeight:700, display:'flex', alignItems:'center', justifyContent:'center', gap:'7px' }}>
                            <Star size={13}/> Mark as Fully Graded
                          </button>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )}
              {saResps.length===0 && (
                <div style={{ background:'#fff', borderRadius:'12px', border:'1px solid #e8eaed', padding:'22px', textAlign:'center' }}>
                  <CheckCircle2 size={26} style={{ color:'#10b981', display:'block', margin:'0 auto 8px' }}/>
                  <div style={{ fontSize:'12px', fontWeight:600, color:'#374151' }}>All responses auto-graded by AI</div>
                  <div style={{ fontSize:'11px', color:'#9ca3af', marginTop:'2px' }}>No short-answer or essay questions.</div>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   ROOT
═══════════════════════════════════════════════════════════════════════════ */
export default function AssessmentGrading() {
  const [tab,    setTab]    = useState<StudioTab>('assemble');
  const [papers, setPapers] = useState<Paper[]>(INIT_PAPERS);
  const [subs,   setSubs]   = useState<StudentSub[]>(INIT_SUBS);

  const draftCount   = papers.filter(p=>p.status==='draft').length;
  const pendingCount = subs.filter(s=>s.status==='pending_sa').length;

  function addPaper(p: Paper)                        { setPapers(prev=>[p,...prev]); }
  function deletePaper(id: string)                   { setPapers(prev=>prev.filter(p=>p.id!==id)); }
  function publishPaper(id: string, cfg: PublishCfg) { setPapers(prev=>prev.map(p=>p.id===id?{...p,status:'published',publishCfg:cfg}:p)); }
  function updateSub(sub: StudentSub)                { setSubs(prev=>prev.map(s=>s.id===sub.id?sub:s)); }

  return (
    <div style={{ display:'flex', flexDirection:'column', height:'calc(100vh - 48px)', overflow:'hidden', fontFamily:'-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif', background:'#fff' }}>
      <div style={{ background:'#fff', borderBottom:'1px solid #e8eaed', flexShrink:0 }}>
        <div style={{ padding:'14px 24px 0', display:'flex', alignItems:'flex-end', gap:'20px' }}>
          <div style={{ paddingBottom:'12px' }}>
            <div style={{ fontSize:'16px', fontWeight:700, color:'#0f0f23', marginBottom:'2px' }}>Grading Studio</div>
            <div style={{ fontSize:'11px', color:'#9ca3af' }}>Assemble papers · Publish to students · AI-assisted grading</div>
          </div>
          <StudioTabBar tab={tab} setTab={setTab} draftCount={draftCount} pendingCount={pendingCount}/>
        </div>
      </div>
      <div style={{ flex:1, overflow:'hidden' }}>
        {tab==='assemble' && <AssembleView onSave={addPaper}/>}
        {tab==='publish'  && <PublishView  papers={papers} onDelete={deletePaper} onPublish={publishPaper} onNewPaper={()=>setTab('assemble')}/>}
        {tab==='grade'    && <GradeView    papers={papers} subs={subs} onUpdateSub={updateSub}/>}
      </div>
      <style>{`@keyframes spin { to { transform:rotate(360deg); } }`}</style>
    </div>
  );
}
