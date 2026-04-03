import React, { useState, useRef, useEffect } from 'react';
import { Filter, Search, ChevronDown, Check, Plus, Eye, X, FileText } from 'lucide-react';

// ── Types ─────────────────────────────────────────────────────────────────────
type Difficulty = 'easy' | 'medium' | 'hard';
type QType = 'MCQ' | 'True/False' | 'Fill-blank' | 'Short Answer' | 'Essay';

interface Question {
  id: string;
  prompt: string;
  options?: string[];      // MCQ only
  answer?: string;
  difficulty: Difficulty;
  type: QType;
}

interface QuestionSet {
  id: string;
  type: QType;
  subject: string;
  grade: string;
  semester: string;
  difficulty: Difficulty;
  chapter: string;
  source: string;
  aiGenerated: boolean;
  questions: Question[];
}

// ── Config ────────────────────────────────────────────────────────────────────
const TYPE_CONFIG: Record<QType, { bg: string; iconBg: string; label: string }> = {
  'MCQ':          { bg: '#dbeafe', iconBg: '#bfdbfe', label: 'Multiple Choice'   },
  'True/False':   { bg: '#ede9fe', iconBg: '#ddd6fe', label: 'True / False'      },
  'Fill-blank':   { bg: '#fed7aa', iconBg: '#fdba74', label: 'Fill in the Blank' },
  'Short Answer': { bg: '#d1fae5', iconBg: '#a7f3d0', label: 'Short Answer'      },
  'Essay':        { bg: '#fce7f3', iconBg: '#fbcfe8', label: 'Essay'             },
};

const DIFF_CONFIG: Record<Difficulty, { bg: string; color: string; label: string }> = {
  easy:   { bg: '#dcfce7', color: '#16a34a', label: 'Easy'   },
  medium: { bg: '#fef9c3', color: '#ca8a04', label: 'Medium' },
  hard:   { bg: '#ff6b35', color: '#ffffff', label: 'Hard'   },
};

/** Subtle accent for subject text — kept minimal for a cleaner layout */
const SUBJECT_CONFIG: Record<string, { color: string }> = {
  Biology:   { color: '#15803d' },
  Physics:   { color: '#a16207' },
  Math:      { color: '#1d4ed8' },
  Chemistry: { color: '#7e22ce' },
  English:   { color: '#c2410c' },
  History:   { color: '#475569' },
};

// ── Mock Data ─────────────────────────────────────────────────────────────────
const QUESTION_SETS: QuestionSet[] = [
  {
    id: 'qs1', type: 'MCQ', subject: 'Biology', grade: 'Grade 10', semester: 'Vol.1',
    difficulty: 'medium', chapter: 'Ch.3 Photosynthesis', source: 'Ch.3 Photosynthesis.pdf', aiGenerated: true,
    questions: [
      { id: 'q1', type: 'MCQ', difficulty: 'medium', prompt: 'Which organelle is primarily responsible for ATP synthesis via oxidative phosphorylation?', options: ['A. Nucleus', 'B. Mitochondria', 'C. Ribosome', 'D. Golgi apparatus'], answer: 'B' },
      { id: 'q2', type: 'MCQ', difficulty: 'easy',   prompt: 'What is the primary pigment responsible for capturing light energy in photosynthesis?', options: ['A. Carotenoid', 'B. Xanthophyll', 'C. Chlorophyll a', 'D. Chlorophyll b'], answer: 'C' },
      { id: 'q3', type: 'MCQ', difficulty: 'hard',   prompt: 'In the Z-scheme of photosynthesis, the final electron acceptor is:', options: ['A. Ferredoxin', 'B. NADP⁺', 'C. Plastocyanin', 'D. Oxygen'], answer: 'B' },
    ],
  },
  {
    id: 'qs2', type: 'True/False', subject: 'Biology', grade: 'Grade 10', semester: 'Vol.1',
    difficulty: 'easy', chapter: 'Ch.3 Photosynthesis', source: 'Ch.3 Photosynthesis.pdf', aiGenerated: true,
    questions: [
      { id: 'q4', type: 'True/False', difficulty: 'easy', prompt: 'The Calvin cycle reactions are also known as the "light-independent" reactions.', answer: 'True' },
      { id: 'q5', type: 'True/False', difficulty: 'easy', prompt: 'Oxygen is produced during the light-dependent reactions of photosynthesis.', answer: 'True' },
      { id: 'q6', type: 'True/False', difficulty: 'medium', prompt: 'The Calvin cycle takes place in the thylakoid membrane.', answer: 'False' },
    ],
  },
  {
    id: 'qs3', type: 'Fill-blank', subject: 'Biology', grade: 'Grade 10', semester: 'Vol.1',
    difficulty: 'hard', chapter: 'Ch.3 Photosynthesis', source: 'Ch.3 Photosynthesis.pdf', aiGenerated: true,
    questions: [
      { id: 'q7', type: 'Fill-blank', difficulty: 'hard', prompt: 'The molecule _______ acts as the primary electron acceptor immediately after Photosystem I.', answer: 'Ferredoxin' },
      { id: 'q8', type: 'Fill-blank', difficulty: 'medium', prompt: 'The splitting of water during photosynthesis is called _______, releasing oxygen as a byproduct.', answer: 'Photolysis' },
    ],
  },
  {
    id: 'qs4', type: 'Short Answer', subject: 'Biology', grade: 'Grade 10', semester: 'Vol.1',
    difficulty: 'medium', chapter: 'Ch.3 Photosynthesis', source: 'Ch.3 Photosynthesis.pdf', aiGenerated: true,
    questions: [
      { id: 'q9',  type: 'Short Answer', difficulty: 'medium', prompt: 'Explain why a leaf appears green, and describe what happens to the wavelengths of light that are not reflected.' },
      { id: 'q10', type: 'Short Answer', difficulty: 'hard',   prompt: 'Compare the roles of Photosystem I and Photosystem II in the light-dependent reactions.' },
    ],
  },
  {
    id: 'qs5', type: 'MCQ', subject: 'Physics', grade: 'Grade 11', semester: 'Vol.1',
    difficulty: 'medium', chapter: "Newton's Laws of Motion", source: "Newton's Laws.docx", aiGenerated: true,
    questions: [
      { id: 'q11', type: 'MCQ', difficulty: 'medium', prompt: "According to Newton's second law, if the net force on an object doubles while its mass stays the same, the acceleration:", options: ['A. Halves', 'B. Stays the same', 'C. Doubles', 'D. Quadruples'], answer: 'C' },
      { id: 'q12', type: 'MCQ', difficulty: 'hard',   prompt: 'A 5 kg block on a frictionless surface is acted on by forces of 20 N east and 15 N north. What is the magnitude of the resulting acceleration?', options: ['A. 5.0 m/s²', 'B. 7.0 m/s²', 'C. 4.0 m/s²', 'D. 6.0 m/s²'], answer: 'A' },
      { id: 'q13', type: 'MCQ', difficulty: 'easy',   prompt: "Newton's third law states that for every action there is an equal and _______ reaction.", options: ['A. Larger', 'B. Smaller', 'C. Opposite', 'D. Parallel'], answer: 'C' },
    ],
  },
  {
    id: 'qs6', type: 'MCQ', subject: 'Math', grade: 'Grade 9', semester: 'Vol.2',
    difficulty: 'medium', chapter: 'Quadratic Functions', source: 'Quadratic Functions.pdf', aiGenerated: true,
    questions: [
      { id: 'q14', type: 'MCQ', difficulty: 'medium', prompt: 'Which of the following is the vertex form of f(x) = x² − 6x + 5?', options: ['A. (x − 3)² − 4', 'B. (x + 3)² − 4', 'C. (x − 3)² + 4', 'D. (x − 6)² + 5'], answer: 'A' },
      { id: 'q15', type: 'MCQ', difficulty: 'easy',   prompt: 'The axis of symmetry for f(x) = 2x² − 8x + 3 is x =', options: ['A. x = 2', 'B. x = −2', 'C. x = 4', 'D. x = −4'], answer: 'A' },
    ],
  },
  {
    id: 'qs7', type: 'Short Answer', subject: 'Math', grade: 'Grade 9', semester: 'Vol.2',
    difficulty: 'medium', chapter: 'Quadratic Functions', source: 'Quadratic Functions.pdf', aiGenerated: true,
    questions: [
      { id: 'q16', type: 'Short Answer', difficulty: 'medium', prompt: 'Solve 2x² + 5x − 3 = 0 using the quadratic formula and show all working.' },
      { id: 'q17', type: 'Short Answer', difficulty: 'hard',   prompt: 'A ball is thrown upward with height h(t) = −5t² + 20t + 2. Find the maximum height and the time at which it occurs.' },
    ],
  },
  {
    id: 'qs8', type: 'MCQ', subject: 'Chemistry', grade: 'Grade 11', semester: 'Vol.2',
    difficulty: 'medium', chapter: 'Electrochemistry', source: 'Manual entry', aiGenerated: false,
    questions: [
      { id: 'q18', type: 'MCQ', difficulty: 'medium', prompt: 'In a galvanic cell, oxidation occurs at the:', options: ['A. Anode', 'B. Cathode', 'C. Salt bridge', 'D. External circuit'], answer: 'A' },
      { id: 'q19', type: 'MCQ', difficulty: 'hard',   prompt: 'For the reaction Zn + Cu²⁺ → Zn²⁺ + Cu, the standard cell potential (E°cell) is:', options: ['A. 0.34 V', 'B. 1.10 V', 'C. 0.76 V', 'D. −1.10 V'], answer: 'B' },
    ],
  },
  {
    id: 'qs9', type: 'Essay', subject: 'Chemistry', grade: 'Grade 11', semester: 'Vol.2',
    difficulty: 'hard', chapter: 'Organic Reactions', source: 'Manual entry', aiGenerated: false,
    questions: [
      { id: 'q20', type: 'Essay', difficulty: 'hard', prompt: 'Compare and contrast the mechanisms of SN1 and SN2 reactions, including the role of substrate structure and solvent polarity.' },
    ],
  },
  {
    id: 'qs10', type: 'Fill-blank', subject: 'English', grade: 'Grade 8', semester: 'Vol.1',
    difficulty: 'easy', chapter: 'Literary Devices', source: 'Manual entry', aiGenerated: false,
    questions: [
      { id: 'q21', type: 'Fill-blank', difficulty: 'easy',   prompt: 'The author uses _______ to convey the sense of isolation felt by the protagonist in Chapter 3.', answer: 'imagery' },
      { id: 'q22', type: 'Fill-blank', difficulty: 'medium', prompt: 'A comparison using "like" or "as" is called a _______.', answer: 'simile' },
      { id: 'q23', type: 'Fill-blank', difficulty: 'easy',   prompt: 'When an author gives human characteristics to non-human things, it is called _______.', answer: 'personification' },
    ],
  },
];

const SUBJECT_OPTIONS  = ['All Subjects',    'Biology', 'Physics', 'Math', 'Chemistry', 'English', 'History'];
const GRADE_OPTIONS    = ['All Grades',      'Grade 7', 'Grade 8', 'Grade 9', 'Grade 10', 'Grade 11', 'Grade 12'];
const SEMESTER_OPTIONS = ['All Semesters',   'Vol.1', 'Vol.2'];
const DIFF_OPTIONS     = ['All Difficulties','Easy', 'Medium', 'Hard'];
const TYPE_OPTIONS     = ['All Types',       'MCQ', 'True/False', 'Fill-blank', 'Short Answer', 'Essay'];

const isDefault = (val: string) =>
  ['All Subjects','All Grades','All Semesters','All Difficulties','All Types'].includes(val);

// ── Main Component ─────────────────────────────────────────────────────────────
export default function AssessmentLibrary() {
  const [search,        setSearch]        = useState('');
  const [filterSubject, setFilterSubject] = useState('All Subjects');
  const [filterGrade,   setFilterGrade]   = useState('All Grades');
  const [filterSem,     setFilterSem]     = useState('All Semesters');
  const [filterDiff,    setFilterDiff]    = useState('All Difficulties');
  const [filterType,    setFilterType]    = useState('All Types');
  const [activeSet,     setActiveSet]     = useState<QuestionSet | null>(null);

  const filtered = QUESTION_SETS.filter(s => {
    const q = search.toLowerCase();
    return (
      (!q || s.type.toLowerCase().includes(q) || s.subject.toLowerCase().includes(q) || s.chapter.toLowerCase().includes(q)) &&
      (isDefault(filterSubject) || s.subject   === filterSubject) &&
      (isDefault(filterGrade)   || s.grade     === filterGrade)   &&
      (isDefault(filterSem)     || s.semester  === filterSem)     &&
      (isDefault(filterDiff)    || s.difficulty === filterDiff.toLowerCase()) &&
      (isDefault(filterType)    || s.type      === filterType)
    );
  });

  const totalQuestions = filtered.reduce((a, s) => a + s.questions.length, 0);
  const uniqueTypes    = new Set(filtered.map(s => s.type)).size;

  const hasActiveFilters =
    !isDefault(filterSubject) || !isDefault(filterGrade) ||
    !isDefault(filterSem)     || !isDefault(filterDiff)  ||
    !isDefault(filterType)    || search !== '';

  return (
    <div style={{ display: 'flex', height: 'calc(100vh - 48px)', overflow: 'hidden', position: 'relative', background: '#fafafa' }}>

      {/* ── Filter sidebar ───────────────────────────────────── */}
      <aside style={{
        width: '200px', flexShrink: 0, borderRight: '1px solid #e5e7eb',
        background: '#fff', overflowY: 'auto', padding: '16px 14px',
        display: 'flex', flexDirection: 'column', gap: '14px',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <Filter size={14} style={{ color: '#6b7280' }} />
          <span style={{ fontSize: '13px', fontWeight: 600, color: '#111827' }}>Filter</span>
        </div>

        <p style={{ margin: 0, fontSize: '11px', color: '#9ca3af', lineHeight: 1.5 }}>
          {totalQuestions} questions · {uniqueTypes} types
        </p>

        <div>
          <div style={{ fontSize: '11px', fontWeight: 500, color: '#6b7280', marginBottom: '6px' }}>Search</div>
          <div style={{ position: 'relative' }}>
            <Search size={12} style={{ position: 'absolute', left: '9px', top: '50%', transform: 'translateY(-50%)', color: '#9ca3af', pointerEvents: 'none' }} />
            <input
              value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Keyword…"
              style={{ width: '100%', boxSizing: 'border-box', padding: '7px 9px 7px 26px', border: '1px solid #e5e7eb', borderRadius: '6px', fontSize: '12px', color: '#374151', outline: 'none', background: '#fff' }}
              onFocus={e => { e.currentTarget.style.borderColor = '#d1d5db'; }}
              onBlur={e =>  { e.currentTarget.style.borderColor = '#e5e7eb'; }}
            />
          </div>
        </div>

        <CustomSelect label="Subject"       value={filterSubject} onChange={setFilterSubject} options={SUBJECT_OPTIONS}  />
        <CustomSelect label="Grade"         value={filterGrade}   onChange={setFilterGrade}   options={GRADE_OPTIONS}    />
        <CustomSelect label="Semester"      value={filterSem}     onChange={setFilterSem}     options={SEMESTER_OPTIONS} />
        <CustomSelect label="Difficulty"    value={filterDiff}    onChange={setFilterDiff}    options={DIFF_OPTIONS}     />
        <CustomSelect label="Question Type" value={filterType}    onChange={setFilterType}    options={TYPE_OPTIONS}     />

        {hasActiveFilters && (
          <button
            type="button"
            onClick={() => { setSearch(''); setFilterSubject('All Subjects'); setFilterGrade('All Grades'); setFilterSem('All Semesters'); setFilterDiff('All Difficulties'); setFilterType('All Types'); }}
            style={{ padding: '7px 10px', borderRadius: '6px', border: '1px solid #e5e7eb', background: '#fff', color: '#6b7280', fontSize: '11px', cursor: 'pointer' }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = '#f9fafb'; }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = '#fff'; }}
          >
            Reset
          </button>
        )}
      </aside>

      {/* ── Card Grid ────────────────────────────────────────── */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minWidth: 0 }}>
        {/* Top bar */}
        <div style={{ padding: '10px 14px', borderBottom: '1px solid #e5e7eb', background: '#fff', flexShrink: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontSize: '12px', color: '#6b7280' }}>
            {filtered.length} sets · {totalQuestions} questions
          </span>
          <button type="button" style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', padding: '6px 12px', borderRadius: '6px', border: '1px solid #e5e7eb', background: '#111827', color: '#fff', fontSize: '12px', fontWeight: 500, cursor: 'pointer', marginLeft: 'auto' }}>
            <Plus size={13} /> Add
          </button>
        </div>

        {/* Grid */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '14px' }}>
          {filtered.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '64px 16px', color: '#9ca3af' }}>
              <Search size={28} style={{ opacity: 0.35, display: 'block', margin: '0 auto 10px' }} />
              <div style={{ fontSize: '13px' }}>No matches</div>
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '12px' }}>
              {filtered.map(set => (
                <React.Fragment key={set.id}>
                  <QuestionSetCard set={set} onView={() => setActiveSet(set)} />
                </React.Fragment>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── Detail Modal ─────────────────────────────────────── */}
      {activeSet && (
        <DetailModal set={activeSet} onClose={() => setActiveSet(null)} />
      )}
    </div>
  );
}

// ── Question Set Card ─────────────────────────────────────────────────────────
function QuestionSetCard({ set, onView }: { set: QuestionSet; onView: () => void }) {
  const tc  = TYPE_CONFIG[set.type];
  const dc  = DIFF_CONFIG[set.difficulty];
  const sc  = SUBJECT_CONFIG[set.subject] ?? { color: '#374151' };
  const [hovered, setHovered] = useState(false);

  return (
    <div
      style={{
        background: '#fff', borderRadius: '8px', overflow: 'hidden',
        border: '1px solid #e5e7eb',
        boxShadow: hovered ? '0 1px 3px rgba(0,0,0,0.06)' : 'none',
        transition: 'box-shadow 0.15s',
        cursor: 'default',
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <div style={{ padding: '14px 14px 12px' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '10px', marginBottom: '8px' }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: '14px', fontWeight: 600, color: '#111827', lineHeight: 1.35, marginBottom: '4px' }}>
              {tc.label}
            </div>
            <div style={{ fontSize: '11px', color: '#9ca3af', lineHeight: 1.45 }}>
              <span style={{ color: sc.color, fontWeight: 500 }}>{set.subject}</span>
              {' · '}{set.grade} · {set.semester}
              {' · '}{dc.label}
              {set.aiGenerated && (
                <>
                  {' · '}
                  <span style={{ color: '#6b7280' }}>AI</span>
                </>
              )}
            </div>
          </div>
          <span style={{ flexShrink: 0, fontSize: '11px', color: '#6b7280', fontVariantNumeric: 'tabular-nums' }}>
            {set.questions.length} Q
          </span>
        </div>

        <div style={{ fontSize: '12px', color: '#6b7280', lineHeight: 1.5 }}>
          {set.chapter}
        </div>
      </div>

      <button
        type="button"
        onClick={onView}
        style={{
          width: '100%', padding: '9px 14px',
          border: 'none', borderTop: '1px solid #f3f4f6',
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
          background: hovered ? '#f9fafb' : '#fff',
          color: '#374151', fontSize: '12px', fontWeight: 500, cursor: 'pointer',
          transition: 'background 0.12s',
        }}
      >
        <Eye size={13} style={{ color: '#9ca3af' }} />
        View
      </button>
    </div>
  );
}

// ── Detail Modal ──────────────────────────────────────────────────────────────
function DetailModal({ set, onClose }: { set: QuestionSet; onClose: () => void }) {
  const tc = TYPE_CONFIG[set.type];
  const dc = DIFF_CONFIG[set.difficulty];

  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') onClose(); }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 200,
      background: 'rgba(17,24,39,0.35)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: '24px',
    }} onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={{
        background: '#fff', borderRadius: '8px', width: '100%', maxWidth: '560px',
        maxHeight: '85vh', display: 'flex', flexDirection: 'column',
        border: '1px solid #e5e7eb',
        boxShadow: '0 10px 40px rgba(0,0,0,0.08)',
        overflow: 'hidden',
      }}>
        {/* Modal header */}
        <div style={{ padding: '16px 18px 0', flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '20px' }}>
            <div>
              <div style={{ fontSize: '11px', color: '#9ca3af', marginBottom: '4px' }}>
                {set.grade} · {set.subject} · {set.semester}
              </div>
              <div style={{ fontSize: '16px', fontWeight: 600, color: '#111827' }}>
                {tc.label}
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              style={{
                width: '30px', height: '30px', borderRadius: '6px',
                border: '1px solid #e5e7eb', background: '#fff',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                cursor: 'pointer', color: '#6b7280', flexShrink: 0,
              }}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = '#f9fafb'; }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = '#fff'; }}
            >
              <X size={15} />
            </button>
          </div>

          {/* Basic Info */}
          <div style={{ marginBottom: '16px', paddingBottom: '14px', borderBottom: '1px solid #f3f4f6' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '6px' }}>
              <FileText size={13} style={{ color: '#9ca3af' }} />
              <span style={{ fontSize: '12px', fontWeight: 600, color: '#374151' }}>Details</span>
            </div>
            <div style={{ fontSize: '12px', color: '#6b7280', lineHeight: 1.6 }}>
              <div><span style={{ color: '#9ca3af' }}>Chapter:</span> {set.chapter}</div>
              <div style={{ marginTop: '4px' }}>
                <span style={{ color: '#9ca3af' }}>Difficulty:</span>{' '}
                <span style={{ fontSize: '11px', fontWeight: 600, padding: '2px 8px', borderRadius: '4px', background: dc.bg, color: dc.color }}>
                  {dc.label}
                </span>
                {' · '}
                <span style={{ color: '#9ca3af' }}>Count:</span> {set.questions.length}
              </div>
            </div>
          </div>

          {/* Section title */}
          <div style={{ fontSize: '12px', fontWeight: 600, color: '#374151', paddingBottom: '10px' }}>
            Questions
          </div>
        </div>

        {/* Scrollable questions */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '0 18px 18px' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {set.questions.map((q, idx) => {
              const qdc = DIFF_CONFIG[q.difficulty];
              const qtc = TYPE_CONFIG[q.type];
              return (
                <div key={q.id} style={{
                  background: '#fafafa', borderRadius: '6px',
                  border: '1px solid #e5e7eb', overflow: 'hidden',
                }}>
                  {/* Q header */}
                  <div style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    padding: '8px 12px', borderBottom: '1px solid #f3f4f6',
                    background: '#fff',
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <span style={{ fontSize: '12px', fontWeight: 600, color: '#111827' }}>Q{idx + 1}</span>
                      <span style={{ fontSize: '11px', color: '#9ca3af' }}>·</span>
                      <span style={{ fontSize: '11px', color: '#6b7280' }}>{qtc.label}</span>
                    </div>
                    <span style={{
                      fontSize: '10px', fontWeight: 600, padding: '2px 8px', borderRadius: '4px',
                      background: qdc.bg, color: qdc.color,
                    }}>
                      {qdc.label}
                    </span>
                  </div>

                  {/* Q body */}
                  <div style={{ padding: '12px' }}>
                    <p style={{ margin: '0 0 10px', fontSize: '13px', color: '#374151', lineHeight: 1.65 }}>
                      {q.prompt}
                    </p>
                    {/* MCQ options */}
                    {q.options && (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                        {q.options.map(opt => {
                          const letter = opt[0];
                          const isCorrect = q.answer === letter;
                          return (
                            <div key={opt} style={{
                              display: 'flex', alignItems: 'center', gap: '10px',
                              padding: '6px 10px', borderRadius: '8px',
                              background: isCorrect ? '#f0fdf4' : '#fff',
                              border: `1px solid ${isCorrect ? '#bbf7d0' : '#e8eaed'}`,
                            }}>
                              <span style={{
                                width: '20px', height: '20px', borderRadius: '50%', flexShrink: 0,
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                fontSize: '11px', fontWeight: 700,
                                background: isCorrect ? '#16a34a' : '#f3f4f6',
                                color: isCorrect ? '#fff' : '#6b7280',
                              }}>
                                {letter}
                              </span>
                              <span style={{ fontSize: '13px', color: isCorrect ? '#15803d' : '#374151', fontWeight: isCorrect ? 500 : 400 }}>
                                {opt.slice(3)}
                              </span>
                              {isCorrect && (
                                <Check size={12} style={{ color: '#16a34a', marginLeft: 'auto' }} />
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                    {/* Answer for non-MCQ */}
                    {!q.options && q.answer && (
                      <div style={{
                        marginTop: '6px', padding: '8px 12px', borderRadius: '8px',
                        background: '#f0fdf4', border: '1px solid #bbf7d0',
                        fontSize: '12px', color: '#15803d',
                      }}>
                        <span style={{ fontWeight: 600 }}>Answer: </span>{q.answer}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Custom Dropdown ───────────────────────────────────────────────────────────
function CustomSelect({ label, value, onChange, options }: {
  label: string; value: string; onChange: (v: string) => void; options: string[];
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const isPlaceholder = options[0] === value;

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <div style={{ fontSize: '11px', fontWeight: 500, color: '#6b7280', marginBottom: '5px' }}>{label}</div>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        style={{
          width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '6px 9px', borderRadius: '6px', cursor: 'pointer', textAlign: 'left',
          border: `1px solid ${open ? '#d1d5db' : '#e5e7eb'}`,
          background: '#fff', outline: 'none', transition: 'border-color 0.12s',
        }}
      >
        <span style={{ fontSize: '12px', color: isPlaceholder ? '#9ca3af' : '#111827', fontWeight: isPlaceholder ? 400 : 500 }}>
          {value}
        </span>
        <ChevronDown size={12} style={{ color: '#9ca3af', transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s', flexShrink: 0 }} />
      </button>

      {open && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0, zIndex: 100,
          background: '#fff', border: '1px solid #e5e7eb', borderRadius: '6px',
          boxShadow: '0 4px 12px rgba(0,0,0,0.06)',
          overflow: 'hidden', padding: '3px',
        }}>
          {options.map((opt, i) => {
            const isSel = opt === value;
            return (
              <button
                type="button"
                key={opt}
                onClick={() => { onChange(opt); setOpen(false); }}
                style={{
                  width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: '6px 8px', borderRadius: '4px', border: 'none', cursor: 'pointer',
                  background: isSel ? '#f3f4f6' : 'transparent',
                  color: i === 0 ? '#9ca3af' : '#374151',
                  fontSize: '12px', fontWeight: isSel ? 500 : 400, textAlign: 'left', transition: 'background 0.1s',
                }}
                onMouseEnter={e => { if (!isSel) (e.currentTarget as HTMLElement).style.background = '#f9fafb'; }}
                onMouseLeave={e => { if (!isSel) (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
              >
                <span>{opt}</span>
                {isSel && <Check size={11} style={{ color: '#6b7280', flexShrink: 0 }} />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}