import React, { useState, useEffect, useRef } from 'react';
import type { LucideIcon } from 'lucide-react';
import {
  ChevronRight, ChevronLeft, Check, Sparkles, Loader2,
  FileText, Clock, Award, BookOpen, Target, Layers,
  Download, Printer, Save, RotateCcw, ChevronDown,
  Plus, Minus, GripVertical, Trash2, Edit3, Send,
  FilePen, AlertCircle, ClipboardList, Trophy, Medal, RefreshCw,
} from 'lucide-react';
import {
  createPaperApi,
  downloadPaperExportApi,
  type PaperCreateRequestDto,
  type PaperCreateQuestionDto,
} from '../../../utils/paperApi';
import {
  previewGenerateQuestionsApi,
  type AIQuestionGenPreviewQuestionDto,
} from '../../../utils/aiQuestionGenApi';

// ── Types ─────────────────────────────────────────────────────────────────────
type ExamType = 'midterm' | 'final' | 'unit' | 'special' | 'review' | 'contest';
type Difficulty = 'easy' | 'medium' | 'hard' | 'mixed';
type PageView = 'wizard' | 'drafts';

interface SectionCfg {
  key: string;
  label: string;
  type: string;
  count: number;
  scoreEach: number;
}

interface GeneratedSection {
  title: string;
  description: string;
  questions: GeneratedQ[];
}

interface GeneratedQ {
  id: string;
  prompt: string;
  options?: { key: string; text: string; correct: boolean }[];
  answer?: string;
  score: number;
  difficulty: 'easy' | 'medium' | 'hard';
}

interface DraftPaper {
  id: string;
  title: string;
  grade: string;
  subject: string;
  examType: ExamType;
  totalScore: number;
  duration: number;
  questionCount: number;
  savedAt: string;          // ISO string
  sections: GeneratedSection[];
  note?: string;
}

// ── Config ────────────────────────────────────────────────────────────────────
const EXAM_TYPES: { id: ExamType; Icon: LucideIcon; label: string; desc: string }[] = [
  { id: 'midterm', Icon: ClipboardList, label: 'Midterm Exam',     desc: 'Mid-semester comprehensive test' },
  { id: 'final',   Icon: Trophy,        label: 'Final Exam',       desc: 'End-of-semester comprehensive test' },
  { id: 'unit',    Icon: BookOpen,      label: 'Unit Test',        desc: 'Targeted chapter/unit assessment' },
  { id: 'special', Icon: Target,        label: 'Special Practice', desc: 'Focused knowledge point drills' },
  { id: 'review',  Icon: RefreshCw,     label: 'Review Test',      desc: 'Multi-chapter comprehensive review' },
  { id: 'contest', Icon: Medal,         label: 'Contest Mock',     desc: 'Competition-level simulation exam' },
];

const GRADES = ['Grade 7', 'Grade 8', 'Grade 9', 'Grade 10', 'Grade 11', 'Grade 12'];
const SUBJECTS = ['Mathematics', 'Physics', 'Chemistry', 'Biology', 'English', 'History', 'Geography', 'Political Science'];
const PUBLISHERS = ["PEP (People's Education Press)", 'Beijing Normal University Press', 'Oxford University Press', 'Jiangsu Education Press'];

interface TbEdition {
  id: string;
  name: string;
  subtitle: string;
  color: string;
  year: string;
}

const TB_EDITION_DATA: Record<string, { name: string; subtitle: string; color: string; year: string }[]> = {
  English: [
    { name: 'Go for it!', subtitle: 'PEP English Go for it!', color: '#3b5bdb', year: '2024' },
    { name: 'New Standard English', subtitle: 'PEP New Standard English', color: '#0891b2', year: '2022' },
  ],
  Mathematics: [
    { name: 'Math A', subtitle: 'PEP Mathematics A', color: '#7c3aed', year: '2024' },
    { name: 'Math B', subtitle: 'PEP Mathematics B', color: '#6d28d9', year: '2023' },
  ],
  Physics: [
    { name: 'Physics Core', subtitle: 'PEP Physics Core Series', color: '#0e7490', year: '2024' },
    { name: 'Physics Elective', subtitle: 'PEP Physics Elective Series', color: '#164e63', year: '2023' },
  ],
  Chemistry: [
    { name: 'Chemistry Core', subtitle: 'PEP Chemistry Core Series', color: '#16a34a', year: '2024' },
    { name: 'Chemistry Elective', subtitle: 'PEP Chemistry Elective Series', color: '#15803d', year: '2023' },
  ],
  Biology: [
    { name: 'Biology Core', subtitle: 'PEP Biology Core Series', color: '#ca8a04', year: '2024' },
    { name: 'Biology Elective', subtitle: 'PEP Biology Elective Series', color: '#a16207', year: '2023' },
  ],
  History: [
    { name: 'History Core', subtitle: 'PEP History Core', color: '#dc2626', year: '2024' },
    { name: 'History Elective', subtitle: 'PEP History Elective', color: '#b91c1c', year: '2023' },
  ],
  Geography: [
    { name: 'Geography Core', subtitle: 'PEP Geography Core Series', color: '#059669', year: '2024' },
    { name: 'Geography Elective', subtitle: 'PEP Geography Elective Series', color: '#047857', year: '2023' },
  ],
};

const PUBLISHER_SHORT: Record<string, string> = {
  "PEP (People's Education Press)": 'PEP',
  'Beijing Normal University Press': 'BNU',
  'Jiangsu Education Press': 'Jiangsu',
  'Oxford University Press': 'Oxford',
};

function getTbEditions(publisher: string, grade: string, subject: string, semester: 'Vol.1' | 'Vol.2'): TbEdition[] {
  const pubLabel = PUBLISHER_SHORT[publisher] || publisher.split(' ')[0] || 'PEP';
  const volLabel = semester === 'Vol.1' ? 'Vol.1' : 'Vol.2';
  const base = TB_EDITION_DATA[subject] ?? [
    { name: `${subject} Standard`, subtitle: `${pubLabel} ${subject}`, color: '#3b5bdb', year: '2024' },
  ];
  return base.map((e, i) => ({
    ...e,
    id: `tb-${i}-${publisher.slice(0, 3)}-${grade}-${subject}-${semester}`,
    subtitle: `${e.subtitle} · ${grade} ${volLabel}`,
  }));
}

function mapDifficultyForPreview(level: Difficulty): 'easy' | 'medium' | 'hard' {
  if (level === 'easy' || level === 'hard') return level;
  return 'medium';
}

function mapSectionTypeToPreview(sectionType: string): string {
  if (sectionType === 'MCQ') return 'MCQ';
  if (sectionType === 'True/False') return 'True/False';
  if (sectionType === 'Fill-blank') return 'Fill-blank';
  if (sectionType === 'Essay') return 'Essay';
  return 'Short Answer';
}

function normalizePreviewType(type: string): string {
  const t = (type || '').trim().toLowerCase();
  if (t.includes('mcq')) return 'MCQ';
  if (t.includes('true') || t.includes('false')) return 'True/False';
  if (t.includes('fill')) return 'Fill-blank';
  if (t.includes('essay')) return 'Essay';
  return 'Short Answer';
}

function extractAnswerKey(answer?: string | null): string | null {
  if (!answer) return null;
  const raw = String(answer).trim().toUpperCase();
  if (/^[A-D]$/.test(raw)) return raw;
  const m = raw.match(/\b([A-D])\b/);
  return m ? m[1] : null;
}

function normalizeMcqOptions(
  options: AIQuestionGenPreviewQuestionDto['options'] | undefined,
  answer?: string | null,
): GeneratedQ['options'] | undefined {
  if (!options || options.length === 0) return undefined;

  const normalized = options
    .map((opt, idx) => {
      const key = (opt.key || '').trim().toUpperCase();
      return {
        key: /^[A-D]$/.test(key) ? key : 'ABCD'[idx] || 'A',
        text: (opt.text || '').trim(),
        correct: !!opt.correct,
      };
    })
    .filter((opt) => !!opt.text)
    .slice(0, 4);

  if (normalized.length === 0) return undefined;

  const answerKey = extractAnswerKey(answer);
  if (answerKey) {
    normalized.forEach((opt) => {
      if (opt.key === answerKey) opt.correct = true;
    });
  }
  if (!normalized.some((opt) => opt.correct)) {
    normalized[0].correct = true;
  }
  return normalized;
}

function buildFallbackQuestion({
  id,
  sectionType,
  subject,
  chapterHint,
  difficulty,
  score,
}: {
  id: string;
  sectionType: string;
  subject: string;
  chapterHint: string;
  difficulty: 'easy' | 'medium' | 'hard';
  score: number;
}): GeneratedQ {
  if (sectionType === 'MCQ') {
    return {
      id,
      prompt: `In ${subject}, which statement best explains ${chapterHint}?`,
      options: [
        { key: 'A', text: `A common misconception about ${chapterHint}`, correct: false },
        { key: 'B', text: `A correct explanation of ${chapterHint}`, correct: true },
        { key: 'C', text: 'A partially correct claim that misses key conditions', correct: false },
        { key: 'D', text: 'An unrelated statement from another topic', correct: false },
      ],
      score,
      difficulty,
    };
  }
  if (sectionType === 'True/False') {
    return {
      id,
      prompt: `True or False: Correct reasoning about ${chapterHint} in ${subject} should include boundary conditions.`,
      answer: 'True',
      score,
      difficulty,
    };
  }
  if (sectionType === 'Fill-blank') {
    return {
      id,
      prompt: `Fill in the blank: A key concept for solving ${chapterHint} in ${subject} is _______.`,
      answer: chapterHint,
      score,
      difficulty,
    };
  }
  if (sectionType === 'Essay') {
    return {
      id,
      prompt: `Write an essay analyzing ${chapterHint} in ${subject}, including method, example, and limitations.`,
      score,
      difficulty,
    };
  }
  return {
    id,
    prompt: `Use 2-3 sentences to explain ${chapterHint} and give one example in ${subject}.`,
    score,
    difficulty,
  };
}

type TextbookChapter = { id: string; title: string; sections: string[] };

const TEXTBOOK_CHAPTERS: Record<string, TextbookChapter[]> = {
  English: [
    { id: 'en1', title: 'Unit 1  Meeting new people', sections: ['Greetings & farewells', 'Name & age', 'Countries & flags', 'Phonics a-e /eɪ/'] },
    { id: 'en2', title: 'Unit 2  Expressing yourself', sections: ['Feelings', 'I feel ···', 'Body parts', 'Phonics i-e /aɪ/'] },
    { id: 'en3', title: 'Unit 3  Learning better', sections: ['School items', 'Where is ···?', 'Prepositions', 'Phonics o-e /əʊ/'] },
    { id: 'en4', title: 'Unit 4  Healthy food', sections: ['Food words', "I like / I don't like", 'Countable & uncountable', 'Phonics u-e /juː/'] },
    { id: 'en5', title: 'Unit 5  Old toys', sections: ['Toys & games', 'Past simple actions', 'When did you ···?', 'Phonics ar /ɑː/'] },
    { id: 'en6', title: 'Unit 6  Numbers in life', sections: ['Numbers 21–100', 'Money & price', 'Addition & subtraction', 'Phonics review'] },
  ],
  Mathematics: [
    { id: 'ma1', title: 'Chapter 1  Rational Numbers', sections: ['Integers', 'Fractions & decimals', 'Number line', 'Absolute value'] },
    { id: 'ma2', title: 'Chapter 2  Algebraic Expressions', sections: ['Variables & constants', 'Simplifying expressions', 'Like terms', 'Substitution'] },
    { id: 'ma3', title: 'Chapter 3  Equations', sections: ['One-variable equations', 'Two-variable equations', 'Systems of equations', 'Word problems'] },
    { id: 'ma4', title: 'Chapter 4  Geometry Basics', sections: ['Points, lines & planes', 'Angles', 'Triangles', 'Congruence'] },
    { id: 'ma5', title: 'Chapter 5  Statistics & Probability', sections: ['Data collection', 'Mean, median & mode', 'Graphs & charts', 'Basic probability'] },
  ],
  Physics: [
    { id: 'ph1', title: 'Chapter 1  Mechanics', sections: ['Motion & velocity', 'Acceleration', "Newton's Laws", 'Friction & forces'] },
    { id: 'ph2', title: 'Chapter 2  Energy & Work', sections: ['Kinetic energy', 'Potential energy', 'Work & power', 'Conservation of energy'] },
    { id: 'ph3', title: 'Chapter 3  Waves & Sound', sections: ['Wave properties', 'Frequency & amplitude', 'Sound waves', 'Doppler effect'] },
    { id: 'ph4', title: 'Chapter 4  Electricity', sections: ['Electric charge', 'Current & voltage', "Ohm's Law & resistance", 'Series & parallel circuits'] },
    { id: 'ph5', title: 'Chapter 5  Light & Optics', sections: ['Reflection', 'Refraction', 'Lenses', 'Color & spectrum'] },
  ],
  Chemistry: [
    { id: 'ch1', title: 'Chapter 1  Matter & Properties', sections: ['States of matter', 'Physical properties', 'Chemical properties', 'Mixtures & solutions'] },
    { id: 'ch2', title: 'Chapter 2  Atoms & Elements', sections: ['Atomic structure', 'Periodic table', 'Isotopes', 'Electron configuration'] },
    { id: 'ch3', title: 'Chapter 3  Chemical Bonding', sections: ['Ionic bonds', 'Covalent bonds', 'Metallic bonds', 'Molecular shape'] },
    { id: 'ch4', title: 'Chapter 4  Chemical Reactions', sections: ['Reaction types', 'Balancing equations', 'Stoichiometry', 'Reaction rates'] },
    { id: 'ch5', title: 'Chapter 5  Acids & Bases', sections: ['pH scale', 'Properties of acids', 'Properties of bases', 'Neutralisation'] },
  ],
  Biology: [
    { id: 'bi1', title: 'Chapter 1  Cell Biology', sections: ['Cell structure', 'Organelles', 'Cell division', 'Transport across membranes'] },
    { id: 'bi2', title: 'Chapter 2  Genetics', sections: ['DNA & genes', 'Mendelian genetics', 'Mutations', 'Genetic disorders'] },
    { id: 'bi3', title: 'Chapter 3  Ecosystems', sections: ['Food chains & webs', 'Energy flow', 'Biomes', 'Human impact'] },
    { id: 'bi4', title: 'Chapter 4  Human Body Systems', sections: ['Digestive system', 'Circulatory system', 'Respiratory system', 'Nervous system'] },
    { id: 'bi5', title: 'Chapter 5  Evolution', sections: ['Natural selection', 'Adaptation', 'Evidence for evolution', 'Classification'] },
  ],
  History: [
    { id: 'hi1', title: 'Unit 1  Ancient Civilizations', sections: ['Mesopotamia', 'Ancient Egypt', 'Indus Valley', 'Ancient China'] },
    { id: 'hi2', title: 'Unit 2  Classical Antiquity', sections: ['Ancient Greece', 'Roman Republic', 'Roman Empire', 'Decline & fall'] },
    { id: 'hi3', title: 'Unit 3  Medieval Period', sections: ['Feudal system', 'The Crusades', 'Byzantine Empire', 'Islamic Golden Age'] },
    { id: 'hi4', title: 'Unit 4  Modern World', sections: ['Industrial Revolution', 'World War I', 'World War II', 'Cold War'] },
  ],
  Geography: [
    { id: 'ge1', title: 'Unit 1  Physical Geography', sections: ['Landforms', 'Climate zones', 'Water cycle', 'Natural disasters'] },
    { id: 'ge2', title: 'Unit 2  Human Geography', sections: ['Population', 'Urbanisation', 'Agriculture', 'Economic activities'] },
    { id: 'ge3', title: 'Unit 3  Geopolitics', sections: ['Countries & capitals', 'Borders & territory', 'International relations', 'Trade routes'] },
    { id: 'ge4', title: 'Unit 4  Environmental Issues', sections: ['Climate change', 'Deforestation', 'Ocean pollution', 'Sustainable development'] },
  ],
};

const DEFAULT_SECTIONS: SectionCfg[] = [
  { key: 'mcq',    label: 'Section I  — Multiple Choice',  type: 'MCQ',          count: 15, scoreEach: 3 },
  { key: 'tf',     label: 'Section II — True / False',     type: 'True/False',   count: 5,  scoreEach: 2 },
  { key: 'fill',   label: 'Section III — Fill in Blank',   type: 'Fill-blank',   count: 5,  scoreEach: 3 },
  { key: 'sa',     label: 'Section IV — Short Answer',     type: 'Short Answer', count: 3,  scoreEach: 6 },
  { key: 'essay',  label: 'Section V  — Essay',            type: 'Essay',        count: 1,  scoreEach: 15 },
];

// 当前页面只展示真实数据/真实生成结果；不再内置 mock 试卷与 mock 草稿，避免无效加载与包体膨胀。

const DIFF_CFG = {
  easy:   { bg: '#dcfce7', color: '#15803d' },
  medium: { bg: '#fef9c3', color: '#a16207' },
  hard:   { bg: '#fee2e2', color: '#b91c1c' },
};

function fmtDate(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) +
    ' · ' + d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
}

// ── Custom select ─────────────────────────────────────────────────────────────
function SimpleSelect({ label, options, value, onChange, placeholder, required }: {
  label: string; options: string[]; value: string; onChange: (v: string) => void;
  placeholder?: string; required?: boolean;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ position: 'relative' }}>
      <div style={{ fontSize: '13px', fontWeight: 500, color: '#374151', marginBottom: '6px' }}>
        {label}{required && <span style={{ color: '#ef4444', marginLeft: '2px' }}>*</span>}
      </div>
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '9px 12px', borderRadius: '8px', cursor: 'pointer',
          border: `1.5px solid ${open ? '#3b5bdb' : '#e8eaed'}`,
          background: '#fff', outline: 'none', transition: 'border-color 0.15s',
        }}
      >
        <span style={{ fontSize: '13px', color: value ? '#0f0f23' : '#9ca3af', fontWeight: value ? 500 : 400 }}>
          {value || placeholder || 'Select…'}
        </span>
        <ChevronDown size={13} style={{ color: open ? '#3b5bdb' : '#9ca3af', transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.18s' }} />
      </button>
      {open && (
        <div
          style={{ position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0, zIndex: 50, background: '#fff', border: '1.5px solid #e8eaed', borderRadius: '10px', boxShadow: '0 8px 24px rgba(0,0,0,0.10)', padding: '4px' }}
          onMouseLeave={() => setOpen(false)}
        >
          {options.map(opt => (
            <button key={opt} onClick={() => { onChange(opt); setOpen(false); }}
              style={{
                width: '100%', padding: '8px 10px', borderRadius: '7px',
                borderTop: 'none', borderRight: 'none', borderBottom: 'none', borderLeft: 'none',
                cursor: 'pointer',
                background: value === opt ? '#eff6ff' : 'transparent',
                color: value === opt ? '#3b5bdb' : '#374151',
                fontSize: '13px', fontWeight: value === opt ? 600 : 400, textAlign: 'left',
              }}
              onMouseEnter={e => { if (value !== opt) (e.currentTarget as HTMLElement).style.background = '#f9fafb'; }}
              onMouseLeave={e => { if (value !== opt) (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
            >
              {opt}
              {value === opt && <Check size={11} style={{ float: 'right', color: '#3b5bdb', marginTop: '2px' }} />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function CountStepper({ value, onChange, min = 0, max = 30 }: { value: number; onChange: (v: number) => void; min?: number; max?: number }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', border: '1px solid #e8eaed', borderRadius: '8px', overflow: 'hidden' }}>
      <button onClick={() => onChange(Math.max(min, value - 1))}
        style={{ width: '32px', height: '32px', borderTop: 'none', borderRight: 'none', borderBottom: 'none', borderLeft: 'none', background: '#f9fafb', color: '#374151', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Minus size={12} />
      </button>
      <div style={{ width: '40px', textAlign: 'center', fontSize: '13px', fontWeight: 600, color: '#0f0f23', borderLeft: '1px solid #e8eaed', borderRight: '1px solid #e8eaed', height: '32px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        {value}
      </div>
      <button onClick={() => onChange(Math.min(max, value + 1))}
        style={{ width: '32px', height: '32px', borderTop: 'none', borderRight: 'none', borderBottom: 'none', borderLeft: 'none', background: '#f9fafb', color: '#374151', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Plus size={12} />
      </button>
    </div>
  );
}

// ── Draft Card ────────────────────────────────────────────────────────────────
function DraftCard({
  draft,
  onDelete,
  onPublish,
}: {
  draft: DraftPaper;
  onDelete: (id: string) => void;
  onPublish: (id: string) => void;
}) {
  const examCfg = EXAM_TYPES.find(e => e.id === draft.examType);
  const EtIcon = examCfg?.Icon;
  const [confirmDelete, setConfirmDelete] = useState(false);

  return (
    <div style={{
      background: '#fff',
      border: '1px solid #e8eaed',
      borderRadius: '14px',
      padding: '20px 22px',
      display: 'flex',
      flexDirection: 'column',
      gap: '12px',
      transition: 'box-shadow 0.15s, border-color 0.15s',
      position: 'relative',
      overflow: 'hidden',
    }}
      onMouseEnter={e => {
        (e.currentTarget as HTMLElement).style.boxShadow = '0 4px 16px rgba(59,91,219,0.10)';
        (e.currentTarget as HTMLElement).style.borderColor = '#c7d2fe';
      }}
      onMouseLeave={e => {
        (e.currentTarget as HTMLElement).style.boxShadow = 'none';
        (e.currentTarget as HTMLElement).style.borderColor = '#e8eaed';
      }}
    >
      <div style={{ position: 'absolute', top: 0, left: 0, width: '3px', height: '100%', background: '#e5e7eb', borderRadius: '14px 0 0 14px' }} />

      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '12px', paddingLeft: '8px' }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
            <span style={{ fontSize: '10px', fontWeight: 700, padding: '2px 8px', borderRadius: '20px', background: '#f3f4f6', color: '#374151', letterSpacing: '0.03em', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
              {EtIcon && <EtIcon size={11} style={{ color: '#9ca3af' }} />}
              {examCfg?.label}
            </span>
            <span style={{ fontSize: '10px', fontWeight: 600, padding: '2px 8px', borderRadius: '20px', background: '#fef9c3', color: '#a16207' }}>
              DRAFT
            </span>
          </div>
          <div style={{ fontSize: '15px', fontWeight: 700, color: '#0f0f23', lineHeight: 1.4, marginBottom: '2px' }}>
            {draft.title}
          </div>
          <div style={{ fontSize: '12px', color: '#6b7280' }}>
            {draft.grade} · {draft.subject}
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', gap: '16px', paddingLeft: '8px' }}>
        {[
          { icon: <FileText size={11} />, label: `${draft.questionCount} questions` },
          { icon: <Award size={11} />, label: `${draft.totalScore} pts` },
          { icon: <Clock size={11} />, label: `${draft.duration} min` },
        ].map(item => (
          <div key={item.label} style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '12px', color: '#6b7280' }}>
            <span style={{ color: '#9ca3af' }}>{item.icon}</span>
            {item.label}
          </div>
        ))}
      </div>

      {draft.note && (
        <div style={{ paddingLeft: '8px', display: 'flex', alignItems: 'flex-start', gap: '6px' }}>
          <AlertCircle size={12} style={{ color: '#f59e0b', flexShrink: 0, marginTop: '1px' }} />
          <span style={{ fontSize: '12px', color: '#92400e', lineHeight: 1.5 }}>{draft.note}</span>
        </div>
      )}

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingLeft: '8px', paddingTop: '4px', borderTop: '1px solid #f3f4f6' }}>
        <span style={{ fontSize: '11px', color: '#9ca3af' }}>
          Saved {fmtDate(draft.savedAt)}
        </span>

        <div style={{ display: 'flex', gap: '6px' }}>
          {confirmDelete ? (
            <>
              <span style={{ fontSize: '12px', color: '#ef4444', display: 'flex', alignItems: 'center', gap: '4px', marginRight: '4px' }}>
                Delete?
              </span>
              <button
                onClick={() => setConfirmDelete(false)}
                style={{ padding: '5px 12px', borderRadius: '7px', border: '1px solid #e8eaed', background: '#fff', color: '#374151', fontSize: '12px', cursor: 'pointer' }}>
                Cancel
              </button>
              <button
                onClick={() => onDelete(draft.id)}
                style={{ padding: '5px 12px', borderRadius: '7px', border: 'none', background: '#fee2e2', color: '#b91c1c', fontSize: '12px', fontWeight: 600, cursor: 'pointer' }}>
                Confirm
              </button>
            </>
          ) : (
            <>
              <button
                onClick={() => setConfirmDelete(true)}
                style={{ display: 'flex', alignItems: 'center', gap: '4px', padding: '5px 10px', borderRadius: '7px', border: '1px solid #fecaca', background: '#fff', color: '#ef4444', fontSize: '12px', cursor: 'pointer' }}>
                <Trash2 size={11} /> Delete
              </button>
              <button
                style={{ display: 'flex', alignItems: 'center', gap: '4px', padding: '5px 12px', borderRadius: '7px', border: '1px solid #e8eaed', background: '#fff', color: '#374151', fontSize: '12px', cursor: 'pointer' }}>
                <Edit3 size={11} /> Edit
              </button>
              <button
                onClick={() => onPublish(draft.id)}
                style={{ display: 'flex', alignItems: 'center', gap: '4px', padding: '5px 14px', borderRadius: '7px', border: 'none', background: '#3b5bdb', color: '#fff', fontSize: '12px', fontWeight: 600, cursor: 'pointer' }}>
                <Send size={11} /> Publish
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Drafts view ───────────────────────────────────────────────────────────────
function DraftsView({
  drafts,
  onDelete,
  onPublish,
}: {
  drafts: DraftPaper[];
  onDelete: (id: string) => void;
  onPublish: (id: string) => void;
}) {
  return (
    <div style={{ width: '100%' }}>
      {/* Header */}
      <div style={{ marginBottom: '24px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <h2 style={{ fontSize: '20px', fontWeight: 700, color: '#0f0f23', margin: '0 0 4px' }}>
              Draft Papers
            </h2>
            <p style={{ fontSize: '13px', color: '#6b7280', margin: 0 }}>
              {drafts.length} paper{drafts.length !== 1 ? 's' : ''} waiting to be reviewed and published
            </p>
          </div>
        </div>
      </div>

      {drafts.length === 0 ? (
        /* Empty state */
        <div style={{
          textAlign: 'center', padding: '72px 40px',
          background: '#fafafa', border: '1.5px dashed #d1d5db',
          borderRadius: '16px',
        }}>
          <div style={{ width: '56px', height: '56px', borderRadius: '16px', background: '#eef2ff', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
            <FilePen size={26} style={{ color: '#3b5bdb' }} />
          </div>
          <div style={{ fontSize: '16px', fontWeight: 700, color: '#374151', marginBottom: '6px' }}>No drafts yet</div>
          <div style={{ fontSize: '13px', color: '#9ca3af' }}>
            Generated papers saved as drafts will appear here for further editing before publishing.
          </div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {drafts.map(d => (
            <React.Fragment key={d.id}>
              <DraftCard draft={d} onDelete={onDelete} onPublish={onPublish} />
            </React.Fragment>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────
export default function AssessmentAIPaper() {
  const [pageView, setPageView] = useState<PageView>('wizard');
  const [drafts, setDrafts] = useState<DraftPaper[]>([]);
  const [publishedIds, setPublishedIds] = useState<string[]>([]);

  const [step, setStep] = useState(1);

  // Step 1
  const [examType, setExamType] = useState<ExamType | null>(null);

  // Step 2
  const [grade,     setGrade]     = useState('');
  const [subject,   setSubject]   = useState('');
  const [semester,  setSemester]  = useState<'Vol.1' | 'Vol.2'>('Vol.1');
  const [publisher, setPublisher] = useState('');
  const [textbookEditionId, setTextbookEditionId] = useState('');
  const [title,     setTitle]     = useState('');
  const [totalScore, setTotalScore] = useState(120);
  const [duration,  setDuration]  = useState(90);

  // Step 3
  const [selectedSections, setSelectedSections] = useState<Set<string>>(new Set());
  const [difficulty, setDifficulty] = useState<Difficulty>('mixed');
  const [sections, setSections] = useState<SectionCfg[]>(DEFAULT_SECTIONS);

  // Step 4
  const [generating, setGenerating]   = useState(false);
  const [genProgress, setGenProgress] = useState(0);
  const [genDone,    setGenDone]      = useState(false);
  const [paper,      setPaper]        = useState<GeneratedSection[]>([]);
  const [draftSaved, setDraftSaved]   = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [persistedPaperId, setPersistedPaperId] = useState<number | null>(null);
  const [exportingPdf, setExportingPdf] = useState(false);
  const [savingLibrary, setSavingLibrary] = useState(false);

  const textbookEditions =
    grade && subject && publisher
      ? getTbEditions(publisher, grade, subject, semester)
      : [];
  const selectedEdition = textbookEditions.find((ed) => ed.id === textbookEditionId) || null;
  const tbChapters = selectedEdition ? (TEXTBOOK_CHAPTERS[subject] ?? []) : [];
  const tbSecKey = (chapterId: string, section: string) => `${chapterId}::${section}`;

  const tbChapterSelected = (chapterId: string, chapterSections: string[]) =>
    chapterSections.some((s) => selectedSections.has(tbSecKey(chapterId, s)));
  const tbChapterAllSelected = (chapterId: string, chapterSections: string[]) =>
    chapterSections.length > 0 && chapterSections.every((s) => selectedSections.has(tbSecKey(chapterId, s)));

  useEffect(() => {
    setTextbookEditionId('');
    setSelectedSections(new Set());
  }, [grade, subject, semester, publisher]);

  function toggleTbChapter(chapterId: string, chapterSections: string[]) {
    const allSel = tbChapterAllSelected(chapterId, chapterSections);
    setSelectedSections((prev) => {
      const next = new Set(prev);
      chapterSections.forEach((s) => {
        const k = tbSecKey(chapterId, s);
        if (allSel) next.delete(k);
        else next.add(k);
      });
      return next;
    });
  }

  function toggleTbSection(chapterId: string, section: string) {
    const key = tbSecKey(chapterId, section);
    setSelectedSections((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function totalQ() { return sections.reduce((s, t) => s + t.count, 0); }
  function calcTotal() { return sections.reduce((s, t) => s + t.count * t.scoreEach, 0); }

  function setSectionCount(key: string, val: number) {
    setSections(prev => prev.map(s => s.key === key ? { ...s, count: val } : s));
  }
  function setSectionScore(key: string, val: number) {
    setSections(prev => prev.map(s => s.key === key ? { ...s, scoreEach: val } : s));
  }

  function buildPaperCreatePayloadFromCurrentPaper(): PaperCreateRequestDto {
    const questions: PaperCreateQuestionDto[] = paper.flatMap((sec) =>
      sec.questions.map((q) => ({
        type: sec.title.includes('Multiple Choice')
          ? 'MCQ'
          : sec.title.includes('True')
            ? 'True/False'
            : sec.title.includes('Fill')
              ? 'Fill-blank'
              : sec.title.includes('Essay')
                ? 'Essay'
                : 'Short Answer',
        prompt: q.prompt,
        difficulty: q.difficulty,
        answer: q.answer,
        options: q.options?.map((opt) => ({
          key: opt.key,
          text: opt.text,
          is_correct: !!opt.correct,
        })),
        score: q.score,
      })),
    );

    return {
      title: title || `${grade} ${subject} ${EXAM_TYPES.find((e) => e.id === examType)?.label ?? 'Exam'}`,
      grade,
      subject,
      semester,
      exam_type: examType || 'midterm',
      duration_min: duration,
      total_score: totalScore,
      questions,
    };
  }

  async function ensurePersistedPaperIdForExport(): Promise<number | null> {
    if (persistedPaperId) return persistedPaperId;
    if (!paper.length) return null;

    const confirmed = window.confirm('Export PDF requires creating a draft paper first. Continue?');
    if (!confirmed) return null;

    const created = await createPaperApi(buildPaperCreatePayloadFromCurrentPaper());
    setPersistedPaperId(created.paper_id);
    return created.paper_id;
  }

  async function previewWithRetry(
    payload: Parameters<typeof previewGenerateQuestionsApi>[0],
    retries = 1,
  ) {
    let attempt = 0;
    let lastErr: unknown = null;
    while (attempt <= retries) {
      try {
        return await previewGenerateQuestionsApi(payload);
      } catch (err) {
        lastErr = err;
        const msg = err instanceof Error ? err.message : '';
        const isTimeout = msg.includes('HTTP 504') || msg.toLowerCase().includes('gateway timeout');
        if (!isTimeout || attempt >= retries) {
          throw err;
        }
        await new Promise((r) => setTimeout(r, 500 * (attempt + 1)));
      }
      attempt += 1;
    }
    throw lastErr;
  }

  async function handleGenerate() {
    setErrorMsg(null);
    setGenerating(true);
    setGenProgress(0);
    setGenDone(false);
    setPaper([]);
    setDraftSaved(false);
    setPersistedPaperId(null);

    try {
      setGenProgress(10);
      await new Promise((r) => setTimeout(r, 160));

      const selectedSectionNames = Array.from(selectedSections)
        .map((item) => String(item).split('::')[1])
        .filter(Boolean);
      const chapterPool =
        selectedSectionNames.length > 0
          ? selectedSectionNames
          : tbChapters.flatMap((c) => c.sections).slice(0, 8);

      const commonSourceText = [
        `publisher=${publisher}`,
        `grade=${grade}`,
        `subject=${subject}`,
        `semester=${semester}`,
        `edition=${selectedEdition?.name || 'unknown'}`,
        `selected_sections=${selectedSectionNames.join(', ')}`,
        `selected_chapters=${tbChapters.map((c) => c.title).join(', ')}`,
      ].join('\n');

      const enabledSections = sections.filter((sec) => sec.count > 0);
      const totalEnabled = Math.max(1, enabledSections.length);
      let serial = 1;
      const fallbackDifficulty = mapDifficultyForPreview(difficulty);
      const warnings: string[] = [];

      const builtSections: GeneratedSection[] = [];
      for (let secIdx = 0; secIdx < enabledSections.length; secIdx++) {
        const sec = enabledSections[secIdx];
        const secType = mapSectionTypeToPreview(sec.type);
        const secSourceText = `${commonSourceText}\nfocus_type=${secType}`;

        let previewQuestions: AIQuestionGenPreviewQuestionDto[] = [];
        try {
          const preview = await previewWithRetry(
            {
              source_text: secSourceText,
              subject,
              grade,
              difficulty: mapDifficultyForPreview(difficulty),
              question_count: sec.count,
              type_targets: { [secType]: sec.count },
              source_mode: 'textbook',
            },
            1,
          );
          previewQuestions = (preview.questions || []).filter(
            (q) => normalizePreviewType(q.type) === secType,
          );
          if (preview.warning) {
            warnings.push(`${sec.type}: ${preview.warning}`);
          }
        } catch (err) {
          const message = err instanceof Error ? err.message : 'unknown error';
          warnings.push(`${sec.type}: ${message}`);
        }

        const sectionQuestions: GeneratedQ[] = [];
        for (let i = 0; i < sec.count; i++) {
          const matched = previewQuestions[i];
          const chapterHint = chapterPool[(secIdx + i) % Math.max(1, chapterPool.length)] || 'core concept';
          if (matched) {
            const mcqOptions = secType === 'MCQ' ? normalizeMcqOptions(matched.options, matched.answer) : undefined;
            if (secType === 'MCQ' && (!mcqOptions || mcqOptions.length < 2)) {
              sectionQuestions.push(
                buildFallbackQuestion({
                  id: `q-${serial++}`,
                  sectionType: secType,
                  subject,
                  chapterHint,
                  difficulty: fallbackDifficulty,
                  score: sec.scoreEach,
                }),
              );
              continue;
            }

            sectionQuestions.push({
              id: `q-${serial++}`,
              prompt: matched.prompt,
              options: mcqOptions ?? (matched.options?.length
                ? matched.options.map((opt) => ({ key: opt.key, text: opt.text, correct: !!opt.correct }))
                : undefined),
              answer: secType === 'MCQ' ? undefined : (matched.answer || undefined),
              score: sec.scoreEach,
              difficulty: matched.difficulty,
            });
          } else {
            sectionQuestions.push(
              buildFallbackQuestion({
                id: `q-${serial++}`,
                sectionType: secType,
                subject,
                chapterHint,
                difficulty: fallbackDifficulty,
                score: sec.scoreEach,
              }),
            );
          }
        }

        builtSections.push({
          title: sec.label,
          description: `${sec.count} question(s) × ${sec.scoreEach} point(s)`,
          questions: sectionQuestions,
        });

        const base = 12;
        const span = 82;
        setGenProgress(base + Math.round(((secIdx + 1) / totalEnabled) * span));
      }

      setPaper(builtSections);
      if (warnings.length > 0) {
        const has504 = warnings.some((w) => w.includes('HTTP 504'));
        setErrorMsg(
          has504
            ? '部分分区请求超时(504)，已自动重试并对失败分区使用回退题目。'
            : `Generation warning: ${warnings.slice(0, 2).join(' | ')}`,
        );
      }
      setGenProgress(100);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'unknown error';
      const chapterPool = tbChapters.flatMap((c) => c.sections).slice(0, 8);
      let serial = 1;
      const fallbackDifficulty = mapDifficultyForPreview(difficulty);
      const fallbackSections: GeneratedSection[] = sections
        .filter((sec) => sec.count > 0)
        .map((sec, secIdx) => ({
          title: sec.label,
          description: `${sec.count} question(s) × ${sec.scoreEach} point(s)`,
          questions: Array.from({ length: sec.count }).map((_, i) => {
            const chapterHint = chapterPool[(secIdx + i) % Math.max(1, chapterPool.length)] || 'core concept';
            return buildFallbackQuestion({
              id: `q-${serial++}`,
              sectionType: mapSectionTypeToPreview(sec.type),
              subject,
              chapterHint,
              difficulty: fallbackDifficulty,
              score: sec.scoreEach,
            });
          }),
        }));
      setPaper(fallbackSections);
      setErrorMsg(`Generate API unavailable; fallback questions used (${message}).`);
      setGenProgress(100);
    } finally {
      setGenerating(false);
      setGenDone(true);
    }
  }

  async function handleSaveToLibrary() {
    if (!paper.length) return;
    if (persistedPaperId) {
      window.alert(`Paper #${persistedPaperId} already saved to library.`);
      return;
    }

    setSavingLibrary(true);
    try {
      const created = await createPaperApi(buildPaperCreatePayloadFromCurrentPaper());
      setPersistedPaperId(created.paper_id);
      setDraftSaved(true);
      window.alert(`Saved to library as Paper #${created.paper_id}.`);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'unknown error';
      window.alert(`Save to library failed: ${message}`);
    } finally {
      setSavingLibrary(false);
    }
  }

  async function handleExportPdf() {
    if (!paper.length) {
      window.alert('No generated paper to export.');
      return;
    }

    setExportingPdf(true);
    try {
      const paperId = await ensurePersistedPaperIdForExport();
      if (!paperId) return;
      await downloadPaperExportApi(paperId, 'pdf');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'unknown error';
      window.alert(`Export PDF failed: ${message}`);
    } finally {
      setExportingPdf(false);
    }
  }

  function handleSaveDraft() {
    if (!paper.length) return;
    const newDraft: DraftPaper = {
      id: `d${Date.now()}`,
      title: title || `${grade} ${subject} ${EXAM_TYPES.find(e => e.id === examType)?.label ?? 'Exam'}`,
      grade,
      subject,
      examType: examType!,
      totalScore,
      duration,
      questionCount: paper.reduce((n, s) => n + s.questions.length, 0),
      savedAt: new Date().toISOString(),
      sections: paper,
    };
    setDrafts(prev => [newDraft, ...prev]);
    setDraftSaved(true);
  }

  function handleDeleteDraft(id: string) {
    setDrafts(prev => prev.filter(d => d.id !== id));
  }

  function handlePublishDraft(id: string) {
    setPublishedIds(prev => [...prev, id]);
    setTimeout(() => setDrafts(prev => prev.filter(d => d.id !== id)), 900);
  }

  const canProceedBasicInfo = Boolean(grade && subject && title && publisher && textbookEditionId);
  const canGeneratePaper = Boolean(selectedEdition && totalQ() > 0 && calcTotal() > 0);

  const examTypeCfg = EXAM_TYPES.find(e => e.id === examType);
  const mainScrollRef = useRef<HTMLDivElement>(null);

  const WIZARD_STEPS = [
    { n: 1, label: 'Exam Type' },
    { n: 2, label: 'Basic Info' },
    { n: 3, label: 'Content & Structure' },
    { n: 4, label: 'Generate & Preview' },
  ] as const;

  useEffect(() => {
    if (mainScrollRef.current) {
      mainScrollRef.current.scrollTo({ top: 0, behavior: 'auto' });
    }
  }, [step, pageView]);

  const contentMaxWidth = step === 4 && pageView === 'wizard' ? '800px' : '680px';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 48px)', overflow: 'hidden', background: '#fafafa' }}>

      {/* Top: Paper Generator — flat horizontal stepper (wizard only) */}
      {pageView === 'wizard' && (
        <div style={{ borderBottom: '1px solid #e5e7eb', background: '#fff', padding: '12px 20px 10px' }}>
          <div style={{ width: '100%', maxWidth: '980px', margin: '0 auto', overflowX: 'auto' }}>
            <div style={{ fontSize: '11px', fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: '10px' }}>Paper Generator</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'nowrap' }}>
              {WIZARD_STEPS.map((s, idx, arr) => (
                <React.Fragment key={s.n}>
                  <button
                    type="button"
                    onClick={step > s.n ? () => setStep(s.n) : undefined}
                    style={{
                      display: 'inline-flex', alignItems: 'center', gap: '6px',
                      padding: '6px 4px 8px',
                      border: 'none',
                      background: 'transparent',
                      borderBottom: step === s.n ? '2px solid #111827' : '2px solid transparent',
                      color: step === s.n ? '#111827' : step > s.n ? '#4b5563' : '#9ca3af',
                      cursor: step > s.n ? 'pointer' : 'default',
                      fontSize: '12px', fontWeight: step === s.n ? 600 : 500,
                      whiteSpace: 'nowrap',
                    }}
                  >
                    <span style={{
                      width: '20px', height: '20px', borderRadius: '50%',
                      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                      border: `1px solid ${step === s.n ? '#111827' : step > s.n ? '#d1d5db' : '#e5e7eb'}`,
                      background: step > s.n ? '#f9fafb' : '#fff',
                      color: step === s.n ? '#111827' : step > s.n ? '#374151' : '#9ca3af',
                      fontSize: '10px', fontWeight: 700,
                    }}>
                      {step > s.n ? <Check size={11} strokeWidth={2.5} /> : s.n}
                    </span>
                    {s.label}
                  </button>
                  {idx < arr.length - 1 && (
                    <ChevronRight size={14} style={{ color: '#d1d5db', flexShrink: 0 }} aria-hidden />
                  )}
                </React.Fragment>
              ))}
            </div>
          </div>
        </div>
      )}

      {pageView === 'drafts' && (
        <div style={{ borderBottom: '1px solid #e5e7eb', background: '#fff', padding: '12px 20px 10px' }}>
          <div style={{ width: '100%', maxWidth: '980px', margin: '0 auto' }}>
            <div style={{ fontSize: '11px', fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: '4px' }}>Paper Generator</div>
            <div style={{ fontSize: '13px', color: '#6b7280' }}>Draft papers — review and publish when ready</div>
          </div>
        </div>
      )}

      {/* Main content */}
      <div ref={mainScrollRef} style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden', padding: '16px 20px', minWidth: 0, display: 'flex', justifyContent: 'center' }}>

        <div style={{ width: '100%', maxWidth: contentMaxWidth }}>

        {/* ── Tab bar ── */}
        <div style={{ display: 'flex', gap: '4px', marginBottom: '16px', borderBottom: '1px solid #e5e7eb', paddingBottom: '0' }}>
          {([
            { id: 'wizard' as PageView, label: 'New Paper' },
            { id: 'drafts' as PageView, label: `Drafts${drafts.length > 0 ? ` (${drafts.length})` : ''}` },
          ]).map(tab => {
            const active = pageView === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setPageView(tab.id)}
                style={{
                  padding: '8px 12px', cursor: 'pointer',
                  borderTop: 'none', borderRight: 'none', borderLeft: 'none',
                  borderBottom: `2px solid ${active ? '#111827' : 'transparent'}`,
                  background: 'transparent',
                  color: active ? '#111827' : '#6b7280',
                  fontSize: '12px', fontWeight: active ? 600 : 500,
                  transition: 'all 0.15s',
                  marginBottom: '-1px',
                }}>
                {tab.label}
              </button>
            );
          })}
        </div>

        {/* ── Drafts view ── */}
        {pageView === 'drafts' && (
          <DraftsView
            drafts={drafts}
            onDelete={handleDeleteDraft}
            onPublish={handlePublishDraft}
          />
        )}

        {/* ── Wizard ── */}
        {pageView === 'wizard' && (
          <>
            {/* ══ STEP 1: Exam Type ══ */}
            {step === 1 && (
              <div>
                <div style={{ marginBottom: '24px' }}>
                  <h2 style={{ fontSize: '20px', fontWeight: 700, color: '#0f0f23', margin: '0 0 6px' }}>Select Exam Type</h2>
                  <p style={{ fontSize: '13px', color: '#6b7280', margin: 0 }}>
                    Choose the type and purpose of the exam paper you want to generate.
                  </p>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '32px' }}>
                  {EXAM_TYPES.map(et => {
                    const isSelected = examType === et.id;
                    const EtIcon = et.Icon;
                    return (
                      <button
                        key={et.id}
                        onClick={() => setExamType(et.id)}
                        style={{
                          display: 'flex', alignItems: 'flex-start', gap: '14px',
                          padding: '16px 18px', borderRadius: '12px', cursor: 'pointer', textAlign: 'left',
                          border: `1px solid ${isSelected ? '#111827' : '#e5e7eb'}`,
                          background: '#fff',
                          transition: 'all 0.15s',
                          position: 'relative', overflow: 'hidden',
                          boxShadow: isSelected ? 'none' : '0 1px 2px rgba(0,0,0,0.04)',
                        }}
                        onMouseEnter={e => { if (!isSelected) { (e.currentTarget as HTMLElement).style.borderColor = '#d1d5db'; (e.currentTarget as HTMLElement).style.background = '#f9fafb'; } }}
                        onMouseLeave={e => { if (!isSelected) { (e.currentTarget as HTMLElement).style.borderColor = '#e5e7eb'; (e.currentTarget as HTMLElement).style.background = '#fff'; } }}
                      >
                        <div style={{
                          width: '40px', height: '40px', borderRadius: '10px',
                          border: `1px solid ${isSelected ? '#111827' : '#e5e7eb'}`,
                          background: isSelected ? '#f9fafb' : '#fff',
                          display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                        }}>
                          <EtIcon size={20} style={{ color: isSelected ? '#111827' : '#6b7280' }} strokeWidth={1.75} />
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: '15px', fontWeight: 700, color: '#0f0f23', marginBottom: '4px' }}>
                            {et.label}
                          </div>
                          <div style={{ fontSize: '12px', color: '#6b7280', lineHeight: 1.5 }}>
                            {et.desc}
                          </div>
                        </div>
                        {isSelected && (
                          <div style={{ position: 'absolute', top: '12px', right: '12px', width: '20px', height: '20px', borderRadius: '50%', background: '#111827', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <Check size={11} style={{ color: '#fff' }} strokeWidth={2.5} />
                          </div>
                        )}
                      </button>
                    );
                  })}
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                  <button
                    onClick={() => setStep(2)}
                    disabled={!examType}
                    style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '10px 24px', borderRadius: '9px', border: 'none', background: examType ? '#3b5bdb' : '#e8eaed', color: examType ? '#fff' : '#9ca3af', fontSize: '14px', fontWeight: 600, cursor: examType ? 'pointer' : 'not-allowed' }}
                  >
                    Next <ChevronRight size={15} />
                  </button>
                </div>
              </div>
            )}

            {/* ══ STEP 2: Basic Info ══ */}
            {step === 2 && (
              <div>
                <div style={{ marginBottom: '24px' }}>
                  <h2 style={{ fontSize: '20px', fontWeight: 700, color: '#0f0f23', margin: '0 0 6px' }}>Basic Information</h2>
                  <p style={{ fontSize: '13px', color: '#6b7280', margin: 0 }}>
                    Set the grade, subject, and exam parameters.
                  </p>
                </div>

                <div style={{ background: '#fff', border: '1px solid #e8eaed', borderRadius: '14px', padding: '22px 24px', marginBottom: '16px' }}>
                  <div style={{ fontSize: '13px', fontWeight: 600, color: '#374151', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <BookOpen size={14} style={{ color: '#3b5bdb' }} /> Scope
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px', marginBottom: '14px' }}>
                    <SimpleSelect label="Grade" options={GRADES} value={grade} onChange={setGrade} placeholder="Select grade" required />
                    <SimpleSelect label="Subject" options={SUBJECTS} value={subject} onChange={setSubject} placeholder="Select subject" required />
                  </div>
                  <div style={{ display: 'flex', gap: '10px', alignItems: 'center', marginBottom: '14px' }}>
                    <span style={{ fontSize: '13px', fontWeight: 500, color: '#374151' }}>Semester</span>
                    {(['Vol.1', 'Vol.2'] as const).map(s => (
                      <button key={s} onClick={() => setSemester(s)}
                        style={{ padding: '5px 16px', borderRadius: '7px', border: `1.5px solid ${semester === s ? '#3b5bdb' : '#e8eaed'}`, background: semester === s ? '#eff6ff' : '#fff', color: semester === s ? '#3b5bdb' : '#6b7280', fontSize: '12px', fontWeight: semester === s ? 600 : 400, cursor: 'pointer', transition: 'all 0.12s' }}>
                        {s}
                      </button>
                    ))}
                  </div>
                  <SimpleSelect label="Textbook Publisher" options={PUBLISHERS} value={publisher} onChange={setPublisher} placeholder="Select publisher" required />

                  {grade && subject && semester && publisher && (
                    <div style={{ marginTop: '16px', border: '1px solid #e8eaed', borderRadius: '10px', padding: '14px' }}>
                      <div style={{ fontSize: '13px', fontWeight: 600, color: '#374151', marginBottom: '4px' }}>Textbook Edition</div>
                      <div style={{ fontSize: '12px', color: '#9ca3af', marginBottom: '12px' }}>Choose the exact edition before selecting chapter coverage.</div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        {textbookEditions.map((ed) => {
                          const active = textbookEditionId === ed.id;
                          return (
                            <button
                              key={ed.id}
                              onClick={() => setTextbookEditionId(ed.id)}
                              style={{
                                display: 'flex', alignItems: 'center', gap: '12px',
                                padding: '10px 12px', borderRadius: '9px', cursor: 'pointer', textAlign: 'left',
                                border: `1.5px solid ${active ? ed.color : '#e8eaed'}`,
                                background: active ? `${ed.color}12` : '#fff',
                              }}
                            >
                              <div style={{ width: '6px', alignSelf: 'stretch', borderRadius: '4px', background: ed.color, flexShrink: 0 }} />
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ fontSize: '13px', fontWeight: 700, color: active ? ed.color : '#111827', marginBottom: '2px' }}>{ed.name}</div>
                                <div style={{ fontSize: '11px', color: '#6b7280' }}>{ed.subtitle}</div>
                              </div>
                              <span style={{ fontSize: '11px', color: active ? ed.color : '#9ca3af', fontWeight: 600 }}>{ed.year}</span>
                              {active && (
                                <div style={{ width: '18px', height: '18px', borderRadius: '50%', background: ed.color, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                  <Check size={10} style={{ color: '#fff' }} strokeWidth={3} />
                                </div>
                              )}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>

                <div style={{ background: '#fff', border: '1px solid #e8eaed', borderRadius: '14px', padding: '22px 24px', marginBottom: '16px' }}>
                  <div style={{ fontSize: '13px', fontWeight: 600, color: '#374151', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <FileText size={14} style={{ color: '#3b5bdb' }} /> Paper Details
                  </div>
                  <div style={{ marginBottom: '14px' }}>
                    <div style={{ fontSize: '13px', fontWeight: 500, color: '#374151', marginBottom: '6px' }}>
                      Exam Title <span style={{ color: '#ef4444' }}>*</span>
                    </div>
                    <input
                      value={title}
                      onChange={e => setTitle(e.target.value)}
                      placeholder={grade && subject ? `${grade} ${subject} ${examTypeCfg?.label ?? 'Exam'} — Spring 2026` : 'Enter exam title…'}
                      style={{ width: '100%', boxSizing: 'border-box', padding: '9px 13px', border: '1.5px solid #e8eaed', borderRadius: '9px', fontSize: '13px', color: '#374151', outline: 'none', fontFamily: 'inherit' }}
                      onFocus={e => { e.currentTarget.style.borderColor = '#3b5bdb'; }}
                      onBlur={e =>  { e.currentTarget.style.borderColor = '#e8eaed'; }}
                    />
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
                    <div>
                      <div style={{ fontSize: '13px', fontWeight: 500, color: '#374151', marginBottom: '6px', display: 'flex', alignItems: 'center', gap: '5px' }}>
                        <Award size={12} style={{ color: '#9ca3af' }} /> Total Score <span style={{ color: '#ef4444' }}>*</span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <input
                          type="number" value={totalScore} onChange={e => setTotalScore(Number(e.target.value))}
                          style={{ width: '80px', padding: '9px 12px', border: '1.5px solid #e8eaed', borderRadius: '9px', fontSize: '13px', color: '#374151', outline: 'none', textAlign: 'center', fontFamily: 'inherit' }}
                          onFocus={e => { e.currentTarget.style.borderColor = '#3b5bdb'; }}
                          onBlur={e =>  { e.currentTarget.style.borderColor = '#e8eaed'; }}
                        />
                        <span style={{ fontSize: '13px', color: '#6b7280' }}>points</span>
                      </div>
                    </div>
                    <div>
                      <div style={{ fontSize: '13px', fontWeight: 500, color: '#374151', marginBottom: '6px', display: 'flex', alignItems: 'center', gap: '5px' }}>
                        <Clock size={12} style={{ color: '#9ca3af' }} /> Duration <span style={{ color: '#ef4444' }}>*</span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <input
                          type="number" value={duration} onChange={e => setDuration(Number(e.target.value))}
                          style={{ width: '80px', padding: '9px 12px', border: '1.5px solid #e8eaed', borderRadius: '9px', fontSize: '13px', color: '#374151', outline: 'none', textAlign: 'center', fontFamily: 'inherit' }}
                          onFocus={e => { e.currentTarget.style.borderColor = '#3b5bdb'; }}
                          onBlur={e =>  { e.currentTarget.style.borderColor = '#e8eaed'; }}
                        />
                        <span style={{ fontSize: '13px', color: '#6b7280' }}>minutes</span>
                      </div>
                    </div>
                  </div>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <button onClick={() => setStep(1)}
                    style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '10px 22px', borderRadius: '9px', border: '1px solid #e8eaed', background: '#fff', color: '#374151', fontSize: '14px', cursor: 'pointer' }}>
                    <ChevronLeft size={15} /> Back
                  </button>
                  <button
                    onClick={() => setStep(3)}
                    disabled={!canProceedBasicInfo}
                    style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '10px 24px', borderRadius: '9px', border: 'none', background: canProceedBasicInfo ? '#3b5bdb' : '#e8eaed', color: canProceedBasicInfo ? '#fff' : '#9ca3af', fontSize: '14px', fontWeight: 600, cursor: canProceedBasicInfo ? 'pointer' : 'not-allowed' }}>
                    Next <ChevronRight size={15} />
                  </button>
                </div>
              </div>
            )}

            {/* ══ STEP 3: Content & Structure ══ */}
            {step === 3 && (
              <div>
                <div style={{ marginBottom: '24px' }}>
                  <h2 style={{ fontSize: '20px', fontWeight: 700, color: '#0f0f23', margin: '0 0 6px' }}>Content & Structure</h2>
                  <p style={{ fontSize: '13px', color: '#6b7280', margin: 0 }}>
                    Choose the chapters covered and define the section structure.
                  </p>
                </div>

                {/* Chapter selection */}
                <div style={{ background: '#fff', border: '1px solid #e8eaed', borderRadius: '14px', padding: '22px 24px', marginBottom: '16px' }}>
                  <div style={{ fontSize: '13px', fontWeight: 600, color: '#374151', marginBottom: '4px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <Layers size={14} style={{ color: '#3b5bdb' }} /> Chapter Coverage
                  </div>
                  {selectedEdition && (
                    <div style={{ marginBottom: '10px', fontSize: '12px', color: '#6b7280' }}>
                      Edition: <span style={{ fontWeight: 600, color: '#374151' }}>{selectedEdition.name}</span> · {grade} · {semester}
                    </div>
                  )}
                  <div style={{ fontSize: '12px', color: '#9ca3af', marginBottom: '14px' }}>
                    {selectedSections.size === 0 ? 'Click chapter checkbox to select all sections in chapter, or click tags to select specific sections' : `${selectedSections.size} section(s) selected`}
                  </div>
                  {selectedEdition ? (
                    <div style={{ border: '1px solid #e8eaed', borderRadius: '12px', overflow: 'hidden', background: '#fff' }}>
                      <div style={{ maxHeight: '300px', overflowY: 'auto' }}>
                        {tbChapters.map((ch, idx) => {
                          const anySel = tbChapterSelected(ch.id, ch.sections);
                          const allSel = tbChapterAllSelected(ch.id, ch.sections);
                          const isLast = idx === tbChapters.length - 1;
                          return (
                            <div
                              key={ch.id}
                              style={{
                                padding: '14px 16px',
                                borderBottom: isLast ? 'none' : '1px solid #f0f2f5',
                                background: anySel ? '#fafbff' : '#fff',
                              }}
                            >
                              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px' }}>
                                <button
                                  onClick={() => toggleTbChapter(ch.id, ch.sections)}
                                  style={{
                                    width: '18px',
                                    height: '18px',
                                    borderRadius: '5px',
                                    border: `2px solid ${allSel || anySel ? '#3b5bdb' : '#d1d5db'}`,
                                    background: allSel ? '#3b5bdb' : '#fff',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    cursor: 'pointer',
                                    padding: 0,
                                  }}
                                  aria-label={`select chapter ${ch.title}`}
                                >
                                  {allSel && <Check size={11} style={{ color: '#fff' }} strokeWidth={3} />}
                                  {anySel && !allSel && <div style={{ width: '8px', height: '2px', background: '#3b5bdb', borderRadius: '1px' }} />}
                                </button>
                                <span style={{ fontSize: '14px', fontWeight: 600, color: anySel ? '#1e3a8a' : '#111827' }}>{ch.title}</span>
                              </div>

                              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '7px', paddingLeft: '28px' }}>
                                {ch.sections.map((sec) => {
                                  const active = selectedSections.has(tbSecKey(ch.id, sec));
                                  return (
                                    <button
                                      key={sec}
                                      onClick={() => toggleTbSection(ch.id, sec)}
                                      style={{
                                        padding: '4px 12px',
                                        borderRadius: '20px',
                                        cursor: 'pointer',
                                        border: `1px solid ${active ? '#3b5bdb' : '#e8eaed'}`,
                                        background: active ? '#eff6ff' : '#fff',
                                        color: active ? '#3b5bdb' : '#4b5563',
                                        fontSize: '12px',
                                        fontWeight: active ? 600 : 400,
                                      }}
                                    >
                                      {sec}
                                    </button>
                                  );
                                })}
                              </div>
                            </div>
                          );
                        })}
                      </div>

                      {selectedSections.size > 0 && (
                        <div style={{ padding: '10px 14px', borderTop: '1px solid #dbe4ff', background: '#f0f4ff', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                          <span style={{ fontSize: '12px', fontWeight: 600, color: '#3b5bdb' }}>Selected {selectedSections.size} section(s)</span>
                          <button
                            onClick={() => setSelectedSections(new Set())}
                            style={{ fontSize: '12px', color: '#6b7280', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
                          >
                            Clear
                          </button>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div style={{ padding: '14px', borderRadius: '10px', border: '1px dashed #d1d5db', color: '#9ca3af', fontSize: '12px' }}>
                      Please go back to Step 2 and choose a textbook edition first.
                    </div>
                  )}
                </div>

                {/* Difficulty */}
                <div style={{ background: '#fff', border: '1px solid #e8eaed', borderRadius: '14px', padding: '22px 24px', marginBottom: '16px' }}>
                  <div style={{ fontSize: '13px', fontWeight: 600, color: '#374151', marginBottom: '14px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <Target size={14} style={{ color: '#3b5bdb' }} /> Overall Difficulty
                  </div>
                  <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                    {([
                      { id: 'easy' as const,   label: 'Easy',   dot: '#22c55e', bg: '#f0fdf4', color: '#166534', border: '#d1d5db' },
                      { id: 'medium' as const, label: 'Medium', dot: '#f59e0b', bg: '#fffbeb', color: '#92400e', border: '#d1d5db' },
                      { id: 'hard' as const,   label: 'Hard',   dot: '#ef4444', bg: '#fef2f2', color: '#991b1b', border: '#d1d5db' },
                      { id: 'mixed' as const,  label: 'Mixed',  dot: '#8b5cf6', bg: '#f5f3ff', color: '#5b21b6', border: '#d1d5db' },
                    ]).map(d => (
                      <button key={d.id} onClick={() => setDifficulty(d.id as Difficulty)}
                        style={{
                          flex: '1 1 calc(25% - 8px)', minWidth: '120px', padding: '10px 10px', borderRadius: '8px', cursor: 'pointer',
                          border: `1px solid ${difficulty === d.id ? '#111827' : d.border}`,
                          background: difficulty === d.id ? d.bg : '#fff',
                          color: difficulty === d.id ? d.color : '#6b7280',
                          fontSize: '12px', fontWeight: difficulty === d.id ? 600 : 500,
                          transition: 'all 0.12s', display: 'flex', flexDirection: 'row',
                          alignItems: 'center', justifyContent: 'center', gap: '8px',
                        }}>
                        <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: d.dot, flexShrink: 0 }} />
                        {d.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Section structure */}
                <div style={{ background: '#fff', border: '1px solid #e8eaed', borderRadius: '14px', padding: '22px 24px', marginBottom: '28px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
                    <div style={{ fontSize: '13px', fontWeight: 600, color: '#374151', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <FileText size={14} style={{ color: '#3b5bdb' }} /> Section Structure
                    </div>
                    <div style={{ fontSize: '12px', color: '#6b7280' }}>
                      Total: <span style={{ color: calcTotal() === totalScore ? '#16a34a' : '#ef4444', fontWeight: 600 }}>{calcTotal()}</span>
                      <span style={{ color: '#9ca3af' }}> / {totalScore} pts</span>
                    </div>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 100px 100px 80px', gap: '8px', padding: '6px 8px', marginBottom: '4px' }}>
                    {['Section', 'Questions', 'Pts / Q', 'Subtotal'].map(h => (
                      <div key={h} style={{ fontSize: '11px', fontWeight: 600, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{h}</div>
                    ))}
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    {sections.map(sec => (
                      <div key={sec.key} style={{ display: 'grid', gridTemplateColumns: '1fr 100px 100px 80px', gap: '8px', alignItems: 'center', padding: '10px 8px', borderRadius: '8px', background: '#f9fafb', border: '1px solid #f0f2f5' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <GripVertical size={12} style={{ color: '#d1d5db' }} />
                          <span style={{ fontSize: '12px', color: '#374151' }}>{sec.type}</span>
                        </div>
                        <CountStepper value={sec.count} onChange={v => setSectionCount(sec.key, v)} max={30} />
                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                          <input
                            type="number" value={sec.scoreEach}
                            onChange={e => setSectionScore(sec.key, Math.max(1, Number(e.target.value)))}
                            style={{ width: '52px', padding: '4px 8px', border: '1px solid #e8eaed', borderRadius: '6px', fontSize: '12px', textAlign: 'center', fontFamily: 'inherit', outline: 'none' }}
                            onFocus={e => { e.currentTarget.style.borderColor = '#3b5bdb'; }}
                            onBlur={e  => { e.currentTarget.style.borderColor = '#e8eaed'; }}
                          />
                          <span style={{ fontSize: '11px', color: '#9ca3af' }}>pts</span>
                        </div>
                        <div style={{ fontSize: '13px', fontWeight: 600, color: '#0f0f23' }}>
                          {sec.count * sec.scoreEach} pts
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <button onClick={() => setStep(2)}
                    style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '10px 22px', borderRadius: '9px', border: '1px solid #e8eaed', background: '#fff', color: '#374151', fontSize: '14px', cursor: 'pointer' }}>
                    <ChevronLeft size={15} /> Back
                  </button>
                  <button onClick={() => { setStep(4); handleGenerate(); }}
                    disabled={!canGeneratePaper}
                    style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '10px 24px', borderRadius: '9px', border: 'none', background: canGeneratePaper ? '#3b5bdb' : '#e8eaed', color: canGeneratePaper ? '#fff' : '#9ca3af', fontSize: '14px', fontWeight: 600, cursor: canGeneratePaper ? 'pointer' : 'not-allowed' }}>
                    <Sparkles size={15} /> Generate Paper
                  </button>
                </div>
              </div>
            )}

            {/* ══ STEP 4: Generate & Preview ══ */}
            {step === 4 && (
              <div>

                {/* Generating state */}
                {generating && (
                  <div style={{ textAlign: 'center', padding: '80px 40px' }}>
                    <div style={{ width: '64px', height: '64px', borderRadius: '20px', background: '#eff6ff', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px' }}>
                      <Sparkles size={30} style={{ color: '#3b5bdb' }} />
                    </div>
                    <div style={{ fontSize: '18px', fontWeight: 700, color: '#0f0f23', marginBottom: '6px' }}>
                      Generating Your Exam Paper…
                    </div>
                    <div style={{ fontSize: '13px', color: '#6b7280', marginBottom: '32px' }}>
                      AI is structuring questions based on your configuration
                    </div>
                    <div style={{ width: '360px', margin: '0 auto', background: '#e8eaed', borderRadius: '999px', height: '8px', overflow: 'hidden' }}>
                      <div style={{ width: `${genProgress}%`, height: '100%', background: 'linear-gradient(90deg, #3b5bdb, #7c3aed)', borderRadius: '999px', transition: 'width 0.35s ease' }} />
                    </div>
                    <div style={{ marginTop: '10px', fontSize: '13px', color: '#9ca3af' }}>{genProgress}%</div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginTop: '28px', maxWidth: '320px', margin: '28px auto 0' }}>
                      {[
                        { threshold: 20,  label: 'Analysing exam configuration' },
                        { threshold: 45,  label: 'Selecting questions from pool' },
                        { threshold: 70,  label: 'Balancing difficulty distribution' },
                        { threshold: 90,  label: 'Formatting paper structure' },
                        { threshold: 100, label: 'Finalising & proofreading' },
                      ].map(item => (
                        <div key={item.label} style={{ display: 'flex', alignItems: 'center', gap: '8px', opacity: genProgress >= item.threshold ? 1 : 0.35, transition: 'opacity 0.3s' }}>
                          {genProgress >= item.threshold
                            ? <Check size={13} style={{ color: '#3b5bdb', flexShrink: 0 }} />
                            : <Loader2 size={13} style={{ color: '#3b5bdb', flexShrink: 0, animation: genProgress >= item.threshold - 20 ? 'spin 1s linear infinite' : 'none' }} />
                          }
                          <span style={{ fontSize: '12px', color: genProgress >= item.threshold ? '#374151' : '#9ca3af' }}>{item.label}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Done — paper preview */}
                {genDone && (
                  <div>
                    {errorMsg && (
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'flex-start',
                          gap: '10px',
                          padding: '12px 14px',
                          borderRadius: '10px',
                          background: '#fffbeb',
                          border: '1px solid #fde68a',
                          color: '#92400e',
                          fontSize: '12px',
                          marginBottom: '14px',
                        }}
                      >
                        <AlertCircle size={14} style={{ flexShrink: 0, marginTop: '1px' }} />
                        <div style={{ lineHeight: 1.6 }}>
                          {errorMsg}
                        </div>
                      </div>
                    )}
                    {/* Toolbar */}
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '24px' }}>
                      <div>
                        <h2 style={{ fontSize: '20px', fontWeight: 700, color: '#0f0f23', margin: '0 0 4px' }}>Preview Generated Paper</h2>
                        <p style={{ fontSize: '13px', color: '#6b7280', margin: 0 }}>{paper.reduce((n, s) => n + s.questions.length, 0)} questions · {calcTotal()} points · {duration} min</p>
                      </div>
                      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                        <button
                          onClick={() => { setStep(3); setGenDone(false); setPaper([]); setDraftSaved(false); }}
                          style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 14px', borderRadius: '8px', border: '1px solid #e8eaed', background: '#fff', color: '#374151', fontSize: '12px', cursor: 'pointer' }}>
                          <RotateCcw size={12} /> Regenerate
                        </button>
                        <button style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 14px', borderRadius: '8px', border: '1px solid #e8eaed', background: '#fff', color: '#374151', fontSize: '12px', cursor: 'pointer' }}>
                          <Printer size={12} /> Print
                        </button>
                        <button
                          onClick={handleExportPdf}
                          disabled={exportingPdf || !paper.length}
                          style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 14px', borderRadius: '8px', border: '1px solid #e8eaed', background: '#fff', color: exportingPdf || !paper.length ? '#9ca3af' : '#374151', fontSize: '12px', cursor: exportingPdf || !paper.length ? 'not-allowed' : 'pointer' }}>
                          <Download size={12} /> {exportingPdf ? 'Exporting…' : 'Export PDF'}
                        </button>
                        {/* Save to Drafts */}
                        <button
                          onClick={handleSaveDraft}
                          disabled={draftSaved}
                          style={{
                            display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 14px', borderRadius: '8px',
                            border: `1px solid ${draftSaved ? '#86efac' : '#fde68a'}`,
                            background: draftSaved ? '#f0fdf4' : '#fffbeb',
                            color: draftSaved ? '#16a34a' : '#b45309',
                            fontSize: '12px', fontWeight: 600, cursor: draftSaved ? 'default' : 'pointer',
                            transition: 'all 0.2s',
                          }}>
                          {draftSaved ? <Check size={12} /> : <FilePen size={12} />}
                          {draftSaved ? 'Saved to Drafts' : 'Save to Drafts'}
                        </button>
                        <button
                          onClick={handleSaveToLibrary}
                          disabled={savingLibrary || !paper.length}
                          style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 16px', borderRadius: '8px', border: 'none', background: savingLibrary || !paper.length ? '#93c5fd' : '#3b5bdb', color: '#fff', fontSize: '12px', fontWeight: 600, cursor: savingLibrary || !paper.length ? 'not-allowed' : 'pointer' }}>
                          <Save size={12} /> {savingLibrary ? 'Saving…' : persistedPaperId ? `Saved #${persistedPaperId}` : 'Save to Library'}
                        </button>
                      </div>
                    </div>

                    {/* Draft saved banner */}
                    {draftSaved && (
                      <div style={{
                        display: 'flex', alignItems: 'center', gap: '10px',
                        padding: '12px 16px', borderRadius: '10px', marginBottom: '16px',
                        background: '#f0fdf4', border: '1px solid #bbf7d0',
                      }}>
                        <Check size={15} style={{ color: '#16a34a', flexShrink: 0 }} />
                        <span style={{ fontSize: '13px', color: '#15803d' }}>
                          Paper saved to Drafts. You can review and publish it from the{' '}
                          <button
                            onClick={() => setPageView('drafts')}
                            style={{ color: '#15803d', fontWeight: 700, textDecoration: 'underline', background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontSize: '13px' }}>
                            Drafts tab
                          </button>.
                        </span>
                      </div>
                    )}

                    {/* Paper document */}
                    <div style={{ background: '#fff', border: '1px solid #e8eaed', borderRadius: '16px', overflow: 'hidden', boxShadow: '0 4px 24px rgba(0,0,0,0.06)' }}>
                      {/* Paper header */}
                      <div style={{ padding: '28px 32px', borderBottom: '2px solid #0f0f23', textAlign: 'center', background: '#fafafa' }}>
                        {examTypeCfg && (
                          <div style={{ fontSize: '11px', color: '#9ca3af', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.08em' }}>{examTypeCfg.label}</div>
                        )}
                        <div style={{ fontSize: '22px', fontWeight: 700, color: '#0f0f23', marginBottom: '8px' }}>
                          {title || `${grade} ${subject} Examination`}
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '24px', fontSize: '12px', color: '#6b7280' }}>
                          <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                            <Award size={12} style={{ color: '#3b5bdb' }} /> Total: {totalScore} points
                          </span>
                          <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                            <Clock size={12} style={{ color: '#3b5bdb' }} /> Duration: {duration} minutes
                          </span>
                          <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                            <BookOpen size={12} style={{ color: '#3b5bdb' }} /> {grade} · {subject}
                          </span>
                        </div>
                        <div style={{ marginTop: '14px', display: 'flex', gap: '20px', justifyContent: 'center', fontSize: '12px', color: '#374151' }}>
                          <span>Name: __________________________</span>
                          <span>Class: __________________________</span>
                          <span>Score: __________</span>
                        </div>
                      </div>

                      {/* Sections */}
                      <div style={{ padding: '24px 32px', display: 'flex', flexDirection: 'column', gap: '28px' }}>
                        {paper.map((sec, si) => (
                          <div key={si}>
                            <div style={{ display: 'flex', alignItems: 'baseline', gap: '10px', marginBottom: '6px' }}>
                              <div style={{ fontSize: '15px', fontWeight: 700, color: '#0f0f23' }}>{sec.title}</div>
                            </div>
                            <div style={{ fontSize: '12px', color: '#6b7280', marginBottom: '14px', paddingLeft: '2px' }}>{sec.description}</div>
                            <div style={{ height: '1px', background: '#e8eaed', marginBottom: '16px' }} />

                            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                              {sec.questions.map((q, qi) => {
                                const dc = DIFF_CFG[q.difficulty];
                                return (
                                  <div key={q.id} style={{ display: 'flex', gap: '12px' }}>
                                    <div style={{ width: '24px', height: '24px', borderRadius: '50%', background: '#f3f4f6', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '11px', fontWeight: 700, color: '#374151', marginTop: '1px' }}>
                                      {qi + 1}
                                    </div>
                                    <div style={{ flex: 1 }}>
                                      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '8px', marginBottom: '8px' }}>
                                        <p style={{ margin: 0, fontSize: '14px', color: '#1f2937', lineHeight: 1.7 }}>{q.prompt}</p>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}>
                                          <span style={{ fontSize: '10px', fontWeight: 600, padding: '2px 8px', borderRadius: '20px', background: dc.bg, color: dc.color }}>{q.difficulty}</span>
                                          <span style={{ fontSize: '10px', color: '#9ca3af' }}>{q.score} pts</span>
                                        </div>
                                      </div>
                                      {q.options && q.options.length > 0 && (
                                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px' }}>
                                          {q.options.map(opt => (
                                            <div key={opt.key} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '7px 10px', borderRadius: '7px', background: opt.correct ? '#f0fdf4' : '#f9fafb', border: `1px solid ${opt.correct ? '#bbf7d0' : '#e8eaed'}` }}>
                                              <span style={{ width: '18px', height: '18px', borderRadius: '50%', background: opt.correct ? '#16a34a' : '#e8eaed', color: opt.correct ? '#fff' : '#6b7280', fontSize: '10px', fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                                                {opt.key}
                                              </span>
                                              <span style={{ fontSize: '12px', color: opt.correct ? '#15803d' : '#374151', fontWeight: opt.correct ? 500 : 400 }}>{opt.text}</span>
                                            </div>
                                          ))}
                                        </div>
                                      )}
                                      {(!q.options || q.options.length === 0) && q.answer && (
                                        <div style={{ padding: '7px 12px', borderRadius: '7px', background: '#f0fdf4', border: '1px solid #bbf7d0', fontSize: '12px', color: '#15803d' }}>
                                          <span style={{ fontWeight: 600 }}>Answer: </span>{q.answer}
                                        </div>
                                      )}
                                      {(!q.options || q.options.length === 0) && !q.answer && (
                                        <div style={{ height: '48px', borderBottom: '1px dashed #e8eaed', marginTop: '4px' }} />
                                      )}
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div style={{ marginTop: '24px', display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                      <button onClick={() => { setStep(1); setGenDone(false); setPaper([]); setDraftSaved(false); setPersistedPaperId(null); setExamType(null); setGrade(''); setSubject(''); setSemester('Vol.1'); setPublisher(''); setTextbookEditionId(''); setSelectedSections(new Set()); setTitle(''); }}
                        style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '10px 20px', borderRadius: '9px', border: '1px solid #e8eaed', background: '#fff', color: '#374151', fontSize: '13px', cursor: 'pointer' }}>
                        Start Over
                      </button>
                      <button style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '10px 22px', borderRadius: '9px', border: 'none', background: '#3b5bdb', color: '#fff', fontSize: '13px', fontWeight: 600, cursor: 'pointer' }}>
                        <Send size={14} /> Publish Now
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </>
        )}
        </div>
      </div>

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}
