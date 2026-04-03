import { useState, useMemo } from 'react';
import {
  Filter, Search, Eye, Download, FileText, Clock,
  Star, Calendar, BookOpen, ChevronDown, X, Target, BarChart2,
} from 'lucide-react';
import { CustomSelect } from '../../../components/teacher/CustomSelect';

/* ─── Types ────────────────────────────────────────────────────── */
interface Paper {
  id: string;
  title: string;
  publisher: string;
  grade: string;
  subject: string;
  semester: string;
  type: string;
  totalScore: number;
  durationMin: number;
  questionCount: number;
  quality: number;   // 0-100
  status: 'published' | 'draft';
  createdAt: string;
  textbook: string;
  sections: Section[];
}

interface Section {
  title: string;
  type: string;
  count: number;
  scoreEach: number;
  questions: MockQuestion[];
}

interface MockQuestion {
  n: number;
  text: string;
  options?: string[];
  answer?: string;
}

/* ─── Mock Data ─────────────────────────────────────────────────── */
const MCQ_SECTION = (offset = 0): Section => ({
  title: 'Multiple Choice', type: 'mcq', count: 5, scoreEach: 5,
  questions: [
    { n: offset + 1, text: 'Which of the following correctly identifies all parts of speech in the sentence?', options: ['A. Noun, Verb, Adjective', 'B. Pronoun, Adverb, Conjunction', 'C. Noun, Adjective, Verb', 'D. Verb, Preposition, Noun'], answer: 'C' },
    { n: offset + 2, text: 'Choose the word that best completes the sentence: The scientist conducted a __ experiment.', options: ['A. careful', 'B. carefully', 'C. care', 'D. careless'], answer: 'A' },
    { n: offset + 3, text: 'Identify the correct punctuation for the following sentence.', options: ['A. Its a beautiful day.', "B. It's a beautiful day.", 'C. Its a beautiful day!', "D. It's, a beautiful day."], answer: 'B' },
    { n: offset + 4, text: 'Which literary device is used in "The wind whispered secrets to the trees"?', options: ['A. Simile', 'B. Metaphor', 'C. Personification', 'D. Alliteration'], answer: 'C' },
    { n: offset + 5, text: 'What is the main idea of a paragraph that discusses climate change effects?', options: ['A. Weather is unpredictable', 'B. Rising temperatures affect ecosystems', 'C. Humans cause all natural disasters', 'D. Plants grow faster in heat'], answer: 'B' },
  ],
});

const TF_SECTION = (offset = 0): Section => ({
  title: 'True / False', type: 'tf', count: 5, scoreEach: 2,
  questions: [
    { n: offset + 1, text: 'The mitochondria is known as the powerhouse of the cell.', answer: 'True' },
    { n: offset + 2, text: 'Photosynthesis only occurs at night.', answer: 'False' },
    { n: offset + 3, text: 'DNA stands for Deoxyribonucleic Acid.', answer: 'True' },
    { n: offset + 4, text: 'All mammals are warm-blooded.', answer: 'True' },
    { n: offset + 5, text: 'Viruses are classified as living organisms.', answer: 'False' },
  ],
});

const FILL_SECTION = (offset = 0): Section => ({
  title: 'Fill in the Blank', type: 'fill', count: 5, scoreEach: 4,
  questions: [
    { n: offset + 1, text: 'The process by which plants make food using sunlight is called _______.', answer: 'photosynthesis' },
    { n: offset + 2, text: 'The speed of light in a vacuum is approximately _______ m/s.', answer: '3 × 10⁸' },
    { n: offset + 3, text: 'The chemical symbol for gold is _______.', answer: 'Au' },
    { n: offset + 4, text: "Newton's _______ law states that for every action there is an equal and opposite reaction.", answer: 'third' },
    { n: offset + 5, text: 'The powerhouse of the cell is the _______.', answer: 'mitochondria' },
  ],
});

const SA_SECTION = (offset = 0): Section => ({
  title: 'Short Answer', type: 'sa', count: 5, scoreEach: 6,
  questions: [
    { n: offset + 1, text: 'Explain the role of chlorophyll in photosynthesis.' },
    { n: offset + 2, text: "Describe Newton's second law of motion and give an example." },
    { n: offset + 3, text: 'What is the difference between a physical change and a chemical change?' },
    { n: offset + 4, text: 'How does the water cycle work? Name at least three stages.' },
    { n: offset + 5, text: 'Why is biodiversity important for ecosystem stability?' },
  ],
});

const MOCK_PAPERS: Paper[] = [
  {
    id: '1',
    title: 'Grade 3 Chinese Vol.2 — Unified Curriculum Test',
    publisher: 'Unified Curriculum Press',
    grade: 'Grade 3',
    subject: 'Chinese',
    semester: 'Vol.2',
    type: 'Practice',
    totalScore: 50,
    durationMin: 30,
    questionCount: 30,
    quality: 88,
    status: 'published',
    createdAt: '2026/3/31',
    textbook: 'Unified Curriculum Chinese',
    sections: [MCQ_SECTION(0), TF_SECTION(5), FILL_SECTION(10)],
  },
  {
    id: '2',
    title: 'Grade 3 Math Vol.2 — PEP Edition Test',
    publisher: 'PEP Mathematics',
    grade: 'Grade 3',
    subject: 'Math',
    semester: 'Vol.2',
    type: 'Unit Test',
    totalScore: 100,
    durationMin: 45,
    questionCount: 40,
    quality: 88,
    status: 'published',
    createdAt: '2026/3/31',
    textbook: 'PEP Mathematics',
    sections: [MCQ_SECTION(0), FILL_SECTION(5), SA_SECTION(10)],
  },
  {
    id: '3',
    title: 'Grade 3 Math Vol.1 — PEP Edition Test',
    publisher: 'PEP Mathematics',
    grade: 'Grade 3',
    subject: 'Math',
    semester: 'Vol.1',
    type: 'Midterm',
    totalScore: 100,
    durationMin: 60,
    questionCount: 25,
    quality: 84,
    status: 'published',
    createdAt: '2026/3/22',
    textbook: 'PEP Mathematics',
    sections: [MCQ_SECTION(0), TF_SECTION(5), SA_SECTION(10)],
  },
  {
    id: '4',
    title: 'Grade 3 Chinese Vol.1 — Unified Curriculum Test',
    publisher: 'Unified Curriculum Press',
    grade: 'Grade 3',
    subject: 'Chinese',
    semester: 'Vol.1',
    type: 'Midterm',
    totalScore: 100,
    durationMin: 60,
    questionCount: 15,
    quality: 88,
    status: 'published',
    createdAt: '2026/3/21',
    textbook: 'Unified Curriculum Chinese',
    sections: [MCQ_SECTION(0), FILL_SECTION(5)],
  },
  {
    id: '5',
    title: 'Grade 4 Science Vol.1 — Final Exam',
    publisher: 'Science Education Press',
    grade: 'Grade 4',
    subject: 'Science',
    semester: 'Vol.1',
    type: 'Final Exam',
    totalScore: 100,
    durationMin: 90,
    questionCount: 35,
    quality: 91,
    status: 'published',
    createdAt: '2026/3/15',
    textbook: 'Science Education Press',
    sections: [MCQ_SECTION(0), TF_SECTION(5), FILL_SECTION(10), SA_SECTION(15)],
  },
  {
    id: '6',
    title: 'Grade 5 English Vol.2 — Unit Assessment',
    publisher: 'Oxford English',
    grade: 'Grade 5',
    subject: 'English',
    semester: 'Vol.2',
    type: 'Unit Test',
    totalScore: 80,
    durationMin: 50,
    questionCount: 28,
    quality: 85,
    status: 'draft',
    createdAt: '2026/3/10',
    textbook: 'Oxford Primary English',
    sections: [MCQ_SECTION(0), FILL_SECTION(5), SA_SECTION(10)],
  },
  {
    id: '7',
    title: 'Grade 6 Math Vol.1 — Semester Quiz',
    publisher: 'PEP Mathematics',
    grade: 'Grade 6',
    subject: 'Math',
    semester: 'Vol.1',
    type: 'Quiz',
    totalScore: 60,
    durationMin: 40,
    questionCount: 20,
    quality: 79,
    status: 'draft',
    createdAt: '2026/3/5',
    textbook: 'PEP Mathematics',
    sections: [MCQ_SECTION(0), TF_SECTION(5)],
  },
  {
    id: '8',
    title: 'Grade 4 Chinese Vol.2 — Comprehensive Test',
    publisher: 'Unified Curriculum Press',
    grade: 'Grade 4',
    subject: 'Chinese',
    semester: 'Vol.2',
    type: 'Comprehensive',
    totalScore: 120,
    durationMin: 75,
    questionCount: 42,
    quality: 93,
    status: 'published',
    createdAt: '2026/2/28',
    textbook: 'Unified Curriculum Chinese',
    sections: [MCQ_SECTION(0), TF_SECTION(5), FILL_SECTION(10), SA_SECTION(15)],
  },
];

const ALL_SUBJECTS  = ['All Subjects',  ...Array.from(new Set(MOCK_PAPERS.map(p => p.subject)))];
const ALL_GRADES    = ['All Grades',    ...Array.from(new Set(MOCK_PAPERS.map(p => p.grade)))];
const ALL_SEMESTERS = ['All Semesters', 'Vol.1', 'Vol.2'];
const ALL_TYPES     = ['All Types',     ...Array.from(new Set(MOCK_PAPERS.map(p => p.type)))];

/* ─── Sub-components ─────────────────────────────────────────────── */
function FilterSelect({
  label, options, value, onChange,
}: { label: string; options: string[]; value: string; onChange: (v: string) => void }) {
  return (
    <div style={{ marginBottom: '18px' }}>
      <div style={{ fontSize: '13px', fontWeight: 600, color: '#374151', marginBottom: '8px' }}>{label}</div>
      <CustomSelect options={options} value={value} onChange={onChange} width="100%" />
    </div>
  );
}

function QualityBar({ score }: { score: number }) {
  const color = score >= 90 ? '#16a34a' : score >= 80 ? '#3b5bdb' : score >= 70 ? '#d97706' : '#dc2626';
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
      <div style={{ flex: 1, height: '5px', background: '#f0f0f0', borderRadius: '99px', overflow: 'hidden' }}>
        <div style={{ width: `${score}%`, height: '100%', background: color, borderRadius: '99px', transition: 'width 0.3s' }} />
      </div>
      <span style={{ fontSize: '13px', fontWeight: 700, color, minWidth: '28px', textAlign: 'right' }}>{score}</span>
    </div>
  );
}

/* ─── Detail Panel ───────────────────────────────────────────────── */
function PaperDetailPanel({ paper, onClose }: { paper: Paper; onClose: () => void }) {
  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 100,
      display: 'flex', alignItems: 'stretch',
    }}>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{ flex: 1, background: 'rgba(0,0,0,0.35)', backdropFilter: 'blur(2px)' }}
      />

      {/* Panel */}
      <div style={{
        width: '720px', background: '#f5f6fa', display: 'flex', flexDirection: 'column',
        boxShadow: '-4px 0 40px rgba(0,0,0,0.18)', overflow: 'hidden', position: 'relative',
      }}>

        {/* Floating action buttons */}
        <div style={{ position: 'absolute', right: '16px', top: '140px', display: 'flex', flexDirection: 'column', gap: '8px', zIndex: 10 }}>
          {[
            { icon: <Eye size={16} />, title: 'Preview' },
            { icon: <Download size={16} />, title: 'Download' },
          ].map(btn => (
            <button key={btn.title} title={btn.title}
              style={{ width: '42px', height: '42px', borderRadius: '50%', border: '1px solid #e8eaed', background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#374151', cursor: 'pointer', boxShadow: '0 2px 8px rgba(0,0,0,0.08)' }}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = '#f3f4f6'; }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = '#fff'; }}
            >
              {btn.icon}
            </button>
          ))}
        </div>

        {/* Header */}
        <div style={{ background: '#fff', borderBottom: '1px solid #e8eaed', padding: '20px 56px 20px 28px', flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px' }}>
            <h2 style={{ fontSize: '18px', fontWeight: 700, color: '#0f0f23', margin: 0, flex: 1, lineHeight: 1.3 }}>{paper.title}</h2>
            <span style={{
              fontSize: '11px', fontWeight: 600, padding: '3px 10px', borderRadius: '20px', flexShrink: 0,
              background: paper.status === 'published' ? '#eff6ff' : '#f3f4f6',
              color: paper.status === 'published' ? '#1d4ed8' : '#6b7280',
            }}>
              {paper.status === 'published' ? 'Published' : 'Draft'}
            </span>
            <button onClick={onClose}
              style={{ width: '28px', height: '28px', borderRadius: '7px', border: '1px solid #e8eaed', background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#6b7280', cursor: 'pointer', flexShrink: 0 }}>
              <X size={14} />
            </button>
          </div>
          {/* Meta bar */}
          <div style={{ display: 'flex', gap: '18px', flexWrap: 'wrap' }}>
            {[
              { icon: <FileText size={12} />, text: `${paper.subject} · ${paper.grade}` },
              { icon: <BookOpen size={12} />, text: `Textbook: ${paper.textbook}` },
              { icon: <Target size={12} />, text: `Score: ${paper.totalScore} pts` },
              { icon: <Clock size={12} />, text: `${paper.durationMin} min` },
              { icon: <BarChart2 size={12} />, text: paper.type },
            ].map((m, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '12px', color: '#6b7280' }}>
                <span style={{ color: '#9ca3af' }}>{m.icon}</span>
                {m.text}
              </div>
            ))}
          </div>
        </div>

        {/* Paper preview body */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '24px 28px' }}>
          {/* Paper header band */}
          <div style={{ background: '#2d5be3', borderRadius: '10px 10px 0 0', padding: '28px 40px', textAlign: 'center', color: '#fff', marginBottom: '0' }}>
            <div style={{ fontSize: '20px', fontWeight: 700, marginBottom: '18px' }}>{paper.title}</div>
            <div style={{ display: 'flex', justifyContent: 'center', gap: '40px', fontSize: '14px' }}>
              {['Name: _______________', 'Class: _______________', 'Student ID: _______________'].map(f => (
                <span key={f}>{f}</span>
              ))}
            </div>
          </div>

          {/* Instructions */}
          <div style={{ background: '#fefce8', border: '1px solid #fde68a', borderTop: 'none', padding: '16px 40px', marginBottom: '20px', borderRadius: '0 0 0 0' }}>
            <div style={{ fontSize: '13px', fontWeight: 700, color: '#374151', marginBottom: '6px' }}>Exam Instructions:</div>
            <div style={{ fontSize: '13px', color: '#4b5563', lineHeight: 1.7 }}>
              1. This exam contains {paper.questionCount} questions, total score {paper.totalScore} pts, duration {paper.durationMin} minutes.<br />
              2. Please write your name, class, and student ID in the designated fields before starting.<br />
              3. Read each question carefully before answering.
            </div>
          </div>

          {/* Sections */}
          {paper.sections.map((sec, si) => (
            <div key={si} style={{ background: '#fff', border: '1px solid #e8eaed', borderRadius: '10px', marginBottom: '16px', overflow: 'hidden' }}>
              {/* Section header */}
              <div style={{ padding: '14px 20px', borderBottom: '1px solid #f0f2f5', display: 'flex', alignItems: 'baseline', gap: '8px' }}>
                <span style={{ fontSize: '15px', fontWeight: 700, color: '#1e40af' }}>
                  {toRoman(si + 1)}. {sec.title}
                </span>
                <span style={{ fontSize: '12px', color: '#6b7280' }}>
                  ({sec.count} questions · {sec.scoreEach} pts each · Total {sec.count * sec.scoreEach} pts)
                </span>
              </div>

              {/* Questions */}
              <div style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
                {sec.questions.map(q => (
                  <div key={q.n}>
                    <div style={{ fontSize: '14px', color: '#0f0f23', marginBottom: '8px', lineHeight: 1.6 }}>
                      <span style={{ fontWeight: 600, marginRight: '4px' }}>{q.n}.</span> {q.text}
                    </div>
                    {/* MCQ options */}
                    {q.options && (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '5px', paddingLeft: '18px' }}>
                        {q.options.map((opt, oi) => (
                          <div key={oi} style={{ fontSize: '13px', color: opt.startsWith(q.answer + '.') ? '#1d4ed8' : '#4b5563', fontWeight: opt.startsWith(q.answer + '.') ? 600 : 400 }}>
                            {opt}
                          </div>
                        ))}
                      </div>
                    )}
                    {/* TF answer */}
                    {sec.type === 'tf' && q.answer && (
                      <div style={{ paddingLeft: '18px', fontSize: '13px', color: '#9ca3af' }}>
                        ( True &nbsp;/&nbsp; False )
                      </div>
                    )}
                    {/* Fill blank */}
                    {sec.type === 'fill' && (
                      <div style={{ paddingLeft: '18px', marginTop: '4px' }}>
                        <div style={{ display: 'inline-block', width: '200px', borderBottom: '1px solid #9ca3af', height: '20px' }} />
                      </div>
                    )}
                    {/* SA answer area */}
                    {sec.type === 'sa' && (
                      <div style={{ paddingLeft: '18px', marginTop: '8px' }}>
                        <div style={{ height: '60px', border: '1px dashed #d1d5db', borderRadius: '6px', background: '#f9fafb' }} />
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function toRoman(n: number) {
  return ['I', 'II', 'III', 'IV', 'V', 'VI'][n - 1] ?? n;
}

/* ─── Main Component ─────────────────────────────────────────────── */
export default function AssessmentPapers() {
  const [search, setSearch]       = useState('');
  const [subject, setSubject]     = useState('All Subjects');
  const [grade, setGrade]         = useState('All Grades');
  const [semester, setSemester]   = useState('All Semesters');
  const [type, setType]           = useState('All Types');
  const [previewPaper, setPreviewPaper] = useState<Paper | null>(null);

  const filtered = useMemo(() => {
    return MOCK_PAPERS.filter(p => {
      if (search && !p.title.toLowerCase().includes(search.toLowerCase())) return false;
      if (subject  !== 'All Subjects'  && p.subject  !== subject)  return false;
      if (grade    !== 'All Grades'    && p.grade    !== grade)    return false;
      if (semester !== 'All Semesters' && p.semester !== semester) return false;
      if (type     !== 'All Types'     && p.type     !== type)     return false;
      return true;
    });
  }, [search, subject, grade, semester, type]);

  return (
    <div style={{ display: 'flex', height: 'calc(100vh - 48px)', overflow: 'hidden', background: '#fafafa' }}>

      {/* ── Left Filter Panel ───────────────────────────────────── */}
      <div style={{
        width: '200px', flexShrink: 0, background: '#fff',
        borderRight: '1px solid #e5e7eb', overflowY: 'auto',
        padding: '16px 14px',
      }}>
        {/* Panel title */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '8px' }}>
          <Filter size={14} style={{ color: '#6b7280' }} />
          <span style={{ fontSize: '13px', fontWeight: 600, color: '#111827' }}>Filter</span>
        </div>

        {/* Found count */}
        <div style={{ fontSize: '11px', color: '#9ca3af', marginBottom: '14px' }}>
          {filtered.length} papers
        </div>

        {/* Search */}
        <div style={{ marginBottom: '20px' }}>
          <div style={{ fontSize: '13px', fontWeight: 600, color: '#374151', marginBottom: '8px' }}>Search</div>
          <div style={{ position: 'relative' }}>
            <Search size={13} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: '#9ca3af' }} />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Enter keyword…"
              style={{
                width: '100%', boxSizing: 'border-box', padding: '8px 10px 8px 32px',
                border: '1px solid #e8eaed', borderRadius: '8px', fontSize: '13px',
                color: '#374151', outline: 'none', background: '#fff',
              }}
              onFocus={e => { e.currentTarget.style.borderColor = '#3b5bdb'; }}
              onBlur={e => { e.currentTarget.style.borderColor = '#e8eaed'; }}
            />
          </div>
        </div>

        {/* Dropdowns */}
        <FilterSelect label="Subject"  options={ALL_SUBJECTS}  value={subject}  onChange={setSubject} />
        <FilterSelect label="Grade"    options={ALL_GRADES}    value={grade}    onChange={setGrade} />
        <FilterSelect label="Semester" options={ALL_SEMESTERS} value={semester} onChange={setSemester} />
        <FilterSelect label="Type"     options={ALL_TYPES}     value={type}     onChange={setType} />

        {/* Reset */}
        {(search || subject !== 'All Subjects' || grade !== 'All Grades' || semester !== 'All Semesters' || type !== 'All Types') && (
          <button
            onClick={() => { setSearch(''); setSubject('All Subjects'); setGrade('All Grades'); setSemester('All Semesters'); setType('All Types'); }}
            style={{ width: '100%', padding: '8px', borderRadius: '8px', border: '1px dashed #d1d5db', background: 'transparent', fontSize: '13px', color: '#6b7280', cursor: 'pointer', marginTop: '4px' }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = '#9ca3af'; (e.currentTarget as HTMLElement).style.color = '#374151'; }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = '#d1d5db'; (e.currentTarget as HTMLElement).style.color = '#6b7280'; }}
          >
            Reset Filters
          </button>
        )}
      </div>

      {/* ── Right Content ────────────────────────────────────────── */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '14px' }}>
        {filtered.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '80px 0' }}>
            <FileText size={40} style={{ color: '#d1d5db', marginBottom: '12px' }} />
            <p style={{ fontSize: '15px', color: '#9ca3af' }}>No papers match your filters.</p>
          </div>
        ) : (
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
            gap: '12px',
          }}>
            {filtered.map(paper => (
              <PaperCard key={paper.id} paper={paper} onView={() => setPreviewPaper(paper)} />
            ))}
          </div>
        )}
      </div>

      {/* ── Detail Panel ─────────────────────────────────────────── */}
      {previewPaper && (
        <PaperDetailPanel paper={previewPaper} onClose={() => setPreviewPaper(null)} />
      )}
    </div>
  );
}

/* ─── Paper Card ─────────────────────────────────────────────────── */
function PaperCard({ paper, onView }: { paper: Paper; onView: () => void }) {
  const rows: { label: string; value: string | number }[] = [
    { label: 'Total Score',  value: `${paper.totalScore} pts` },
    { label: 'Duration',     value: `${paper.durationMin} min` },
    { label: 'Questions',    value: paper.questionCount },
    { label: 'Quality',      value: '' }, // rendered separately
    { label: 'Created',      value: paper.createdAt },
  ];

  return (
    <div
      style={{
        background: '#fff', border: '1px solid #e5e7eb', borderRadius: '8px',
        overflow: 'hidden', display: 'flex', flexDirection: 'column',
        transition: 'box-shadow 0.15s',
      }}
      onMouseEnter={e => { (e.currentTarget as HTMLElement).style.boxShadow = '0 1px 3px rgba(0,0,0,0.06)'; }}
      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.boxShadow = 'none'; }}
    >
      {/* Card body */}
      <div style={{ padding: '14px' }}>
        {/* Title + status badge */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '10px', marginBottom: '6px' }}>
          <h3 style={{ fontSize: '14px', fontWeight: 600, color: '#111827', margin: 0, lineHeight: 1.4 }}>{paper.title}</h3>
          {paper.status === 'published' && (
            <span style={{ fontSize: '10px', fontWeight: 600, padding: '2px 8px', borderRadius: '12px', background: '#f3f4f6', color: '#6b7280', flexShrink: 0, marginTop: '2px' }}>Published</span>
          )}
        </div>

        {/* Subtitle breadcrumb */}
        <div style={{ fontSize: '11px', color: '#6b7280', marginBottom: '12px', lineHeight: 1.5 }}>
          {paper.publisher}&nbsp;·&nbsp;{paper.grade}&nbsp;{paper.subject}&nbsp;·&nbsp;{paper.type}
        </div>

        {/* Stats table */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0' }}>
          {rows.map((row, i) => (
            <div key={i} style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '7px 0',
              borderTop: i === 0 ? '1px solid #f3f4f6' : 'none',
              borderBottom: '1px solid #f3f4f6',
            }}>
              <span style={{ fontSize: '12px', color: '#9ca3af' }}>{row.label}:</span>
              {row.label === 'Quality' ? (
                <div style={{ width: '140px' }}>
                  <QualityBar score={paper.quality} />
                </div>
              ) : (
                <span style={{ fontSize: '12px', fontWeight: 500, color: '#111827' }}>{row.value}</span>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Action buttons */}
      <div style={{ display: 'flex', borderTop: '1px solid #f3f4f6' }}>
        <button
          onClick={onView}
          style={{
            flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '7px',
            padding: '12px', border: 'none', borderRight: '1px solid #f0f2f5',
            background: '#fff', color: '#374151', fontSize: '13px', cursor: 'pointer',
            transition: 'background 0.12s',
          }}
          onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = '#f9fafb'; }}
          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = '#fff'; }}
        >
          <Eye size={14} style={{ color: '#6b7280' }} /> View
        </button>
        <button
          onClick={() => {}}
          style={{
            flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '7px',
            padding: '12px', border: 'none',
            background: '#fff', color: '#374151', fontSize: '13px', cursor: 'pointer',
            transition: 'background 0.12s',
          }}
          onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = '#f9fafb'; }}
          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = '#fff'; }}
        >
          <Download size={14} style={{ color: '#6b7280' }} /> Download
        </button>
      </div>
    </div>
  );
}
