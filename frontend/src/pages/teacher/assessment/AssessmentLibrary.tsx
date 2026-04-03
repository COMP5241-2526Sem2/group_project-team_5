import { useState, useRef, useEffect } from 'react';
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
const TYPE_CONFIG: Record<QType, { bg: string; iconBg: string; emoji: string; label: string }> = {
  'MCQ':          { bg: '#dbeafe', iconBg: '#bfdbfe', emoji: '📋', label: 'Multiple Choice'   },
  'True/False':   { bg: '#ede9fe', iconBg: '#ddd6fe', emoji: '✅', label: 'True / False'      },
  'Fill-blank':   { bg: '#fed7aa', iconBg: '#fdba74', emoji: '✏️', label: 'Fill in the Blank' },
  'Short Answer': { bg: '#d1fae5', iconBg: '#a7f3d0', emoji: '📝', label: 'Short Answer'      },
  'Essay':        { bg: '#fce7f3', iconBg: '#fbcfe8', emoji: '✍️', label: 'Essay'             },
};

const DIFF_CONFIG: Record<Difficulty, { bg: string; color: string; label: string }> = {
  easy:   { bg: '#dcfce7', color: '#16a34a', label: 'Easy'   },
  medium: { bg: '#fef9c3', color: '#ca8a04', label: 'Medium' },
  hard:   { bg: '#ff6b35', color: '#ffffff', label: 'Hard'   },
};

const SUBJECT_CONFIG: Record<string, { emoji: string; bg: string; color: string }> = {
  Biology:   { emoji: '🔬', bg: '#dcfce7', color: '#15803d' },
  Physics:   { emoji: '⚡', bg: '#fef9c3', color: '#a16207' },
  Math:      { emoji: '📐', bg: '#dbeafe', color: '#1d4ed8' },
  Chemistry: { emoji: '⚗️', bg: '#f3e8ff', color: '#7e22ce' },
  English:   { emoji: '📖', bg: '#fff7ed', color: '#c2410c' },
  History:   { emoji: '🏛️', bg: '#f1f5f9', color: '#475569' },
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
    <div style={{ display: 'flex', height: 'calc(100vh - 48px)', overflow: 'hidden', position: 'relative' }}>

      {/* ── Filter sidebar ───────────────────────────────────── */}
      <div style={{
        width: '232px', flexShrink: 0, borderRight: '1px solid #e8eaed',
        background: '#fff', overflowY: 'auto', padding: '22px 16px',
        display: 'flex', flexDirection: 'column', gap: '18px',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '7px' }}>
          <Filter size={14} style={{ color: '#374151' }} />
          <span style={{ fontSize: '14px', fontWeight: 700, color: '#0f0f23' }}>Filters</span>
        </div>

        <p style={{ margin: 0, fontSize: '12px', color: '#6b7280', lineHeight: 1.65, padding: '10px 12px', background: '#f9fafb', borderRadius: '8px', border: '1px solid #f3f4f6' }}>
          Found{' '}
          <span style={{ color: '#3b5bdb', fontWeight: 700 }}>{totalQuestions}</span>
          {' '}questions, containing{' '}
          <span style={{ color: '#3b5bdb', fontWeight: 700 }}>{uniqueTypes}</span>
          {' '}question types
        </p>

        <div>
          <div style={{ fontSize: '12px', fontWeight: 600, color: '#374151', marginBottom: '7px' }}>Search</div>
          <div style={{ position: 'relative' }}>
            <Search size={12} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: '#9ca3af', pointerEvents: 'none' }} />
            <input
              value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Enter keyword…"
              style={{ width: '100%', boxSizing: 'border-box', padding: '8px 10px 8px 28px', border: '1.5px solid #e8eaed', borderRadius: '8px', fontSize: '12px', color: '#374151', outline: 'none', background: '#fff' }}
              onFocus={e => { e.currentTarget.style.borderColor = '#3b5bdb'; }}
              onBlur={e =>  { e.currentTarget.style.borderColor = '#e8eaed'; }}
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
            onClick={() => { setSearch(''); setFilterSubject('All Subjects'); setFilterGrade('All Grades'); setFilterSem('All Semesters'); setFilterDiff('All Difficulties'); setFilterType('All Types'); }}
            style={{ padding: '8px', borderRadius: '8px', border: '1px solid #e8eaed', background: '#fff', color: '#6b7280', fontSize: '12px', cursor: 'pointer' }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = '#f3f4f6'; }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = '#fff'; }}
          >
            Clear all filters
          </button>
        )}
      </div>

      {/* ── Card Grid ────────────────────────────────────────── */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', background: '#f2f5fb' }}>
        {/* Top bar */}
        <div style={{ padding: '12px 20px', borderBottom: '1px solid #e2e6f0', background: '#fff', flexShrink: 0, display: 'flex', alignItems: 'center', gap: '10px' }}>
          <span style={{ fontSize: '13px', color: '#6b7280' }}>
            {filtered.length} question sets · {totalQuestions} questions total
          </span>
          <button style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '7px 16px', borderRadius: '8px', border: 'none', background: '#3b5bdb', color: '#fff', fontSize: '13px', fontWeight: 600, cursor: 'pointer', marginLeft: 'auto' }}>
            <Plus size={13} /> Add Question
          </button>
        </div>

        {/* Grid */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '20px' }}>
          {filtered.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '80px 20px', color: '#9ca3af' }}>
              <Search size={36} style={{ opacity: 0.25, display: 'block', margin: '0 auto 14px' }} />
              <div style={{ fontSize: '14px' }}>No question sets match your filters</div>
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
              {filtered.map(set => (
                <QuestionSetCard key={set.id} set={set} onView={() => setActiveSet(set)} />
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
  const sc  = SUBJECT_CONFIG[set.subject] ?? { emoji: '📚', bg: '#f3f4f6', color: '#374151' };
  const [hovered, setHovered] = useState(false);

  return (
    <div
      style={{
        background: '#ffffff', borderRadius: '16px', overflow: 'hidden', position: 'relative',
        boxShadow: hovered
          ? '0 8px 32px rgba(59,91,219,0.12), 0 2px 8px rgba(0,0,0,0.06)'
          : '0 2px 12px rgba(0,0,0,0.06), 0 1px 3px rgba(0,0,0,0.04)',
        transition: 'box-shadow 0.2s, transform 0.2s',
        transform: hovered ? 'translateY(-2px)' : 'none',
        cursor: 'default',
        border: '1px solid rgba(0,0,0,0.04)',
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {/* Decorative watermark */}
      <div style={{
        position: 'absolute', top: '-10px', right: '-10px',
        width: '100px', height: '100px', borderRadius: '50%',
        background: tc.bg, opacity: 0.45, pointerEvents: 'none',
      }} />
      <div style={{
        position: 'absolute', top: '20px', right: '20px',
        fontSize: '52px', opacity: 0.07, pointerEvents: 'none',
        lineHeight: 1, userSelect: 'none',
      }}>
        {tc.emoji}
      </div>

      {/* Card body */}
      <div style={{ padding: '20px 20px 0' }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '14px', marginBottom: '16px' }}>
          {/* Icon block */}
          <div style={{
            width: '54px', height: '54px', borderRadius: '12px',
            background: tc.bg, display: 'flex', alignItems: 'center',
            justifyContent: 'center', fontSize: '26px', flexShrink: 0,
            boxShadow: `0 2px 8px ${tc.bg}`,
          }}>
            {tc.emoji}
          </div>
          {/* Title + subtitle */}
          <div style={{ flex: 1, minWidth: 0, paddingTop: '2px' }}>
            <div style={{ fontSize: '17px', fontWeight: 700, color: '#0f0f23', marginBottom: '4px', lineHeight: 1.2 }}>
              {tc.label}
            </div>
            <div style={{ fontSize: '12px', color: '#6b7280', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {set.grade} · {set.subject} · {set.semester}
            </div>
          </div>
          {/* Question count badge */}
          <div style={{
            flexShrink: 0, fontSize: '11px', fontWeight: 600, color: '#3b5bdb',
            background: '#eff6ff', borderRadius: '20px', padding: '3px 9px',
            whiteSpace: 'nowrap', marginTop: '2px',
          }}>
            {set.questions.length} Qs
          </div>
        </div>

        {/* Divider */}
        <div style={{ height: '1px', background: '#f0f2f7', marginBottom: '14px' }} />

        {/* Chips */}
        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '12px' }}>
          {/* Subject chip */}
          <span style={{
            display: 'inline-flex', alignItems: 'center', gap: '4px',
            fontSize: '11px', padding: '4px 10px', borderRadius: '20px',
            background: sc.bg, color: sc.color, fontWeight: 500,
            border: `1px solid ${sc.bg}`,
          }}>
            <span>{sc.emoji}</span> {set.subject}
          </span>
          {/* Grade chip */}
          <span style={{
            fontSize: '11px', padding: '4px 10px', borderRadius: '20px',
            border: '1px solid #d1d5db', color: '#374151', background: '#fff', fontWeight: 500,
          }}>
            {set.grade} ({set.semester})
          </span>
          {/* Difficulty chip */}
          <span style={{
            fontSize: '11px', padding: '4px 10px', borderRadius: '20px',
            background: dc.bg, color: dc.color, fontWeight: 600,
          }}>
            {dc.label}
          </span>
          {/* AI badge */}
          {set.aiGenerated && (
            <span style={{
              fontSize: '11px', padding: '4px 10px', borderRadius: '20px',
              background: '#f5f3ff', color: '#7c3aed', fontWeight: 500,
            }}>
              ✨ AI
            </span>
          )}
        </div>

        {/* Chapter */}
        <div style={{ fontSize: '12px', color: '#6b7280', marginBottom: '16px' }}>
          <span style={{ color: '#9ca3af', marginRight: '6px' }}>Chapter:</span>
          <span style={{ color: '#374151' }}>{set.chapter}</span>
        </div>
      </div>

      {/* View button */}
      <button
        onClick={onView}
        style={{
          width: '100%', padding: '13px 20px',
          border: 'none', borderTop: '1px solid #f0f2f7',
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
          background: hovered ? '#f7f9ff' : '#fafbff',
          color: '#3b5bdb', fontSize: '13px', fontWeight: 600, cursor: 'pointer',
          transition: 'background 0.15s',
        }}
      >
        <Eye size={14} />
        View Questions
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
      background: 'rgba(15,15,35,0.45)', backdropFilter: 'blur(3px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: '32px',
    }} onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={{
        background: '#fff', borderRadius: '18px', width: '100%', maxWidth: '740px',
        maxHeight: '85vh', display: 'flex', flexDirection: 'column',
        boxShadow: '0 24px 80px rgba(0,0,0,0.18)',
        overflow: 'hidden',
      }}>
        {/* Modal header */}
        <div style={{ padding: '24px 28px 0', flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '20px' }}>
            <div>
              <div style={{ fontSize: '11px', color: '#9ca3af', marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                {set.grade} · {set.subject} · {set.semester}
              </div>
              <div style={{ fontSize: '20px', fontWeight: 700, color: '#0f0f23' }}>
                {tc.label}
              </div>
            </div>
            <button
              onClick={onClose}
              style={{
                width: '32px', height: '32px', borderRadius: '8px',
                border: '1.5px solid #e8eaed', background: '#fff',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                cursor: 'pointer', color: '#6b7280', flexShrink: 0,
              }}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = '#f3f4f6'; }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = '#fff'; }}
            >
              <X size={15} />
            </button>
          </div>

          {/* Basic Info */}
          <div style={{ marginBottom: '20px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '7px', marginBottom: '14px' }}>
              <FileText size={14} style={{ color: '#374151' }} />
              <span style={{ fontSize: '14px', fontWeight: 700, color: '#0f0f23' }}>Basic Info</span>
            </div>
            <div style={{
              display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0',
              background: '#f9fafb', borderRadius: '10px', border: '1px solid #f0f2f5',
              overflow: 'hidden', marginBottom: '0',
            }}>
              {[
                { label: 'Grade',     value: set.grade },
                { label: 'Semester',  value: set.semester },
                { label: 'Difficulty', valueEl: (
                  <span style={{ display: 'inline-block', fontSize: '11px', fontWeight: 600, padding: '3px 10px', borderRadius: '20px', background: dc.bg, color: dc.color }}>
                    {dc.label}
                  </span>
                )},
              ].map((item, i) => (
                <div key={i} style={{ padding: '12px 16px', borderRight: i < 2 ? '1px solid #f0f2f5' : 'none' }}>
                  <div style={{ fontSize: '11px', color: '#9ca3af', marginBottom: '4px' }}>{item.label}</div>
                  {item.valueEl
                    ? item.valueEl
                    : <div style={{ fontSize: '13px', fontWeight: 600, color: '#0f0f23' }}>{item.value}</div>
                  }
                </div>
              ))}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0', background: '#f9fafb', borderRadius: '10px', border: '1px solid #f0f2f5', overflow: 'hidden', marginTop: '6px' }}>
              <div style={{ padding: '12px 16px', borderRight: '1px solid #f0f2f5' }}>
                <div style={{ fontSize: '11px', color: '#9ca3af', marginBottom: '4px' }}>Chapter</div>
                <div style={{ fontSize: '13px', fontWeight: 600, color: '#0f0f23' }}>{set.chapter}</div>
              </div>
              <div style={{ padding: '12px 16px' }}>
                <div style={{ fontSize: '11px', color: '#9ca3af', marginBottom: '4px' }}>Question Type</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span style={{ fontSize: '15px' }}>{tc.emoji}</span>
                  <span style={{ fontSize: '13px', fontWeight: 600, color: '#0f0f23' }}>{tc.label}</span>
                  <span style={{ fontSize: '11px', color: '#6b7280' }}>({set.questions.length} questions)</span>
                </div>
              </div>
            </div>
          </div>

          {/* Section title */}
          <div style={{ fontSize: '14px', fontWeight: 700, color: '#0f0f23', paddingBottom: '14px', borderBottom: '1px solid #f0f2f5' }}>
            Question Content
          </div>
        </div>

        {/* Scrollable questions */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '16px 28px 24px' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {set.questions.map((q, idx) => {
              const qdc = DIFF_CONFIG[q.difficulty];
              const qtc = TYPE_CONFIG[q.type];
              return (
                <div key={q.id} style={{
                  background: '#f8f9fb', borderRadius: '12px',
                  border: '1px solid #eef0f5', overflow: 'hidden',
                }}>
                  {/* Q header */}
                  <div style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    padding: '11px 16px', borderBottom: '1px solid #eef0f5',
                    background: '#fff',
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <span style={{ fontSize: '13px', fontWeight: 700, color: '#3b5bdb' }}>Q{idx + 1}</span>
                      <span style={{ fontSize: '11px', color: '#9ca3af' }}>·</span>
                      <span style={{ fontSize: '12px', color: '#3b5bdb', fontWeight: 500 }}>{qtc.label}</span>
                    </div>
                    <span style={{
                      fontSize: '11px', fontWeight: 600, padding: '3px 10px', borderRadius: '20px',
                      background: qdc.bg, color: qdc.color,
                    }}>
                      {qdc.label}
                    </span>
                  </div>

                  {/* Q body */}
                  <div style={{ padding: '14px 16px' }}>
                    <p style={{ margin: '0 0 12px', fontSize: '14px', color: '#1f2937', lineHeight: 1.7 }}>
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
                              padding: '8px 12px', borderRadius: '8px',
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
      <div style={{ fontSize: '12px', fontWeight: 600, color: '#374151', marginBottom: '7px' }}>{label}</div>
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '8px 12px', borderRadius: '8px', cursor: 'pointer', textAlign: 'left',
          border: `1.5px solid ${open ? '#3b5bdb' : '#e8eaed'}`,
          background: open ? '#fafbff' : '#fff', outline: 'none', transition: 'border-color 0.15s',
        }}
      >
        <span style={{ fontSize: '13px', color: isPlaceholder ? '#9ca3af' : '#0f0f23', fontWeight: isPlaceholder ? 400 : 500 }}>
          {value}
        </span>
        <ChevronDown size={13} style={{ color: open ? '#3b5bdb' : '#9ca3af', transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.18s', flexShrink: 0 }} />
      </button>

      {open && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 5px)', left: 0, right: 0, zIndex: 100,
          background: '#fff', border: '1.5px solid #e8eaed', borderRadius: '10px',
          boxShadow: '0 8px 24px rgba(0,0,0,0.10), 0 2px 6px rgba(0,0,0,0.06)',
          overflow: 'hidden', padding: '4px',
        }}>
          {options.map((opt, i) => {
            const isSel = opt === value;
            return (
              <button
                key={opt}
                onClick={() => { onChange(opt); setOpen(false); }}
                style={{
                  width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: '8px 10px', borderRadius: '7px', border: 'none', cursor: 'pointer',
                  background: isSel ? '#f0f4ff' : 'transparent',
                  color: isSel ? '#3b5bdb' : i === 0 ? '#6b7280' : '#374151',
                  fontSize: '13px', fontWeight: isSel ? 600 : 400, textAlign: 'left', transition: 'background 0.1s',
                }}
                onMouseEnter={e => { if (!isSel) (e.currentTarget as HTMLElement).style.background = '#f9fafb'; }}
                onMouseLeave={e => { if (!isSel) (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
              >
                <span>{opt}</span>
                {isSel && <Check size={12} style={{ color: '#3b5bdb', flexShrink: 0 }} />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}