import React, { Fragment, useState, useRef, useCallback, useEffect } from 'react';
import { useNavigate } from 'react-router';
import {
  Upload, FileText, AlignLeft, BookOpen, ScanLine, Layers,
  X, Check, ChevronRight, ChevronLeft,
  Sparkles, Loader2, CheckCircle2, AlertCircle,
  Plus, Minus, Image, ImageOff, RefreshCw,
  BarChart2, Camera, Shapes, FlaskConical,
  Search, Library, Trash2,
  PenLine, Copy,
} from 'lucide-react';
import { CustomSelect, SelectField } from '../../../components/teacher/CustomSelect';
import { previewGenerateQuestionsApi } from '../../../utils/aiQuestionGenApi';
import { createPaperApi } from '../../../utils/paperApi';
import { extractSourceTextApi } from '../../../utils/sourceExtractionApi';

// ── Types ──────────────────────────────────────────────────────────────────────
type SourceTab = 'upload' | 'text' | 'textbook' | 'exam' | 'questions';
type IllustStyle = 'auto' | 'diagram' | 'chart' | 'photo' | 'scientific';
type QuestionInputMode = 'paste' | 'bank';
type ExamGenMode = 'error-questions' | 'simulation';

interface QTypeCfg {
  label: string; desc: string;
  key: string; count: number; active: boolean;
}

/** Enter Text：至少字数与 canProceedStep1、占位符一致 */
const TEXT_SOURCE_MIN_CHARS = 5;

interface GeneratedQ {
  id: string; type: string; prompt: string;
  options?: { key: string; text: string; correct: boolean }[];
  answer?: string; difficulty: 'easy' | 'medium' | 'hard';
  explanation: string;
  hasImage?: boolean;
  imageStyle?: IllustStyle;
  derivedFrom?: string; // for 以题生题
}

// ── Mock generated questions ───────────────────────────────────────────────────
const MOCK_QUESTIONS: GeneratedQ[] = [
  {
    id: 'q1', type: 'MCQ',
    prompt: 'Which organelle is primarily responsible for ATP synthesis via oxidative phosphorylation?',
    options: [
      { key: 'A', text: 'Ribosome', correct: false },
      { key: 'B', text: 'Mitochondria', correct: true },
      { key: 'C', text: 'Golgi apparatus', correct: false },
      { key: 'D', text: 'Smooth ER', correct: false },
    ],
    difficulty: 'medium',
    explanation: 'Mitochondria contain the electron transport chain and ATP synthase, which together drive oxidative phosphorylation to produce ATP.',
  },
  {
    id: 'q2', type: 'MCQ',
    prompt: 'In the light-dependent reactions of photosynthesis, water molecules are split in a process called:',
    options: [
      { key: 'A', text: 'Glycolysis', correct: false },
      { key: 'B', text: 'Calvin cycle', correct: false },
      { key: 'C', text: 'Photolysis', correct: true },
      { key: 'D', text: 'Chemiosmosis', correct: false },
    ],
    difficulty: 'easy',
    explanation: 'Photolysis is the light-driven splitting of water molecules (2H₂O → 4H⁺ + 4e⁻ + O₂) that occurs at Photosystem II.',
  },
  {
    id: 'q3', type: 'MCQ',
    prompt: 'Which of the following correctly describes the relationship between photosynthesis and cellular respiration?',
    options: [
      { key: 'A', text: 'They occur in the same organelle', correct: false },
      { key: 'B', text: 'Products of one are reactants of the other', correct: true },
      { key: 'C', text: 'Both produce oxygen as a by-product', correct: false },
      { key: 'D', text: 'Both require sunlight to proceed', correct: false },
    ],
    difficulty: 'medium',
    explanation: 'Photosynthesis uses CO₂ and H₂O to produce glucose and O₂; cellular respiration uses glucose and O₂ to produce CO₂ and H₂O — they are complementary processes.',
  },
  {
    id: 'q4', type: 'True/False',
    prompt: 'The Calvin cycle reactions are also known as the "light-independent" reactions because they can proceed in complete darkness as long as ATP and NADPH are available.',
    answer: 'True',
    difficulty: 'easy',
    explanation: 'The Calvin cycle uses ATP and NADPH produced by the light reactions to fix CO₂ into G3P, and does not directly require light.',
  },
  {
    id: 'q5', type: 'Fill-blank',
    prompt: 'The molecule _______ acts as the primary electron acceptor immediately after Photosystem I and is then used to reduce NADP⁺ to NADPH.',
    answer: 'Ferredoxin',
    difficulty: 'hard',
    explanation: 'Ferredoxin (Fd) accepts electrons from excited chlorophyll in PSI and passes them to NADP⁺ reductase.',
  },
  {
    id: 'q6', type: 'Short Answer',
    prompt: 'Explain why a leaf appears green, and describe what happens to the wavelengths of light that are not reflected.',
    difficulty: 'medium',
    explanation: 'Chlorophyll absorbs red (~700 nm) and blue (~450 nm) light most strongly, and reflects green light. The absorbed wavelengths excite electrons in the pigment molecules, driving the light-dependent reactions.',
  },
];

const MOCK_DERIVED_QUESTIONS: GeneratedQ[] = [
  {
    id: 'd1', type: 'MCQ',
    prompt: 'Based on the concept of Newton\'s Second Law (F = ma), if the net force on a 5 kg object doubles while its mass stays constant, what happens to its acceleration?',
    options: [
      { key: 'A', text: 'It halves', correct: false },
      { key: 'B', text: 'It stays the same', correct: false },
      { key: 'C', text: 'It doubles', correct: true },
      { key: 'D', text: 'It quadruples', correct: false },
    ],
    difficulty: 'medium',
    derivedFrom: "Newton's Second Law: F = ma",
    explanation: 'Since F = ma, with constant mass, doubling F means acceleration doubles as well.',
  },
  {
    id: 'd2', type: 'MCQ',
    prompt: 'A variant of Newton\'s Third Law: a horse pulls a cart forward. According to the law of action-reaction pairs, which statement is correct?',
    options: [
      { key: 'A', text: 'The cart pulls the horse backward with an equal force', correct: true },
      { key: 'B', text: 'The net force on the system is doubled', correct: false },
      { key: 'C', text: 'There is no reaction force since the horse is living', correct: false },
      { key: 'D', text: 'The reaction force acts on the horse in the same direction', correct: false },
    ],
    difficulty: 'medium',
    derivedFrom: "Newton's Third Law: action-reaction",
    explanation: "Newton's Third Law: for every action force there is an equal and opposite reaction force acting on the other body.",
  },
  {
    id: 'd3', type: 'Fill-blank',
    prompt: "According to Newton's First Law, an object at rest will remain at rest unless acted upon by a(n) _______ force.",
    answer: 'unbalanced (net)',
    difficulty: 'easy',
    derivedFrom: "Newton's First Law: inertia",
    explanation: 'Inertia keeps an object in its current state of motion; only a net external force can change it.',
  },
  {
    id: 'd4', type: 'Short Answer',
    prompt: 'A student claims that Newton\'s Third Law means all forces cancel out and nothing can ever move. Identify the flaw in this reasoning.',
    difficulty: 'hard',
    derivedFrom: "Newton's Third Law misconception",
    explanation: "Action-reaction pairs act on DIFFERENT objects, so they don't cancel. Net force is calculated on a single object from all forces acting ON that object.",
  },
];

const DIFFICULTY_COLORS = {
  easy:   { bg: '#f0fdf4', color: '#166534', dot: '#22c55e' },
  medium: { bg: '#fffbeb', color: '#92400e', dot: '#f59e0b' },
  hard:   { bg: '#fef2f2', color: '#991b1b', dot: '#ef4444' },
};

const GRADES    = ['Grade 7', 'Grade 8', 'Grade 9', 'Grade 10', 'Grade 11', 'Grade 12'];
const SUBJECTS  = ['Mathematics', 'Physics', 'Chemistry', 'Biology', 'Economics', 'English', 'History', 'Geography'];
const PUBLISHERS = ["PEP (People's Education Press)", 'Beijing Normal University Press', 'Jiangsu Education Press', 'Oxford University Press'];

// ── Textbook chapter data ──────────────────────────────────────────────────────
const TEXTBOOK_CHAPTERS: Record<string, { id: string; title: string; sections: string[] }[]> = {
  'English': [
    { id: 'en1', title: 'Unit 1  Meeting new people',    sections: ['Greetings & farewells', 'Name & age', 'Countries & flags', 'Phonics a-e /eɪ/'] },
    { id: 'en2', title: 'Unit 2  Expressing yourself',   sections: ['Feelings', 'I feel ···', 'Body parts', 'Phonics i-e /aɪ/'] },
    { id: 'en3', title: 'Unit 3  Learning better',       sections: ['School items', 'Where is ···?', 'Prepositions', 'Phonics o-e /əʊ/'] },
    { id: 'en4', title: 'Unit 4  Healthy food',          sections: ['Food words', "I like / I don't like", 'Countable & uncountable', 'Phonics u-e /juː/'] },
    { id: 'en5', title: 'Unit 5  Old toys',              sections: ['Toys & games', 'Past simple actions', 'When did you ···?', 'Phonics ar /ɑː/'] },
    { id: 'en6', title: 'Unit 6  Numbers in life',       sections: ['Numbers 21–100', 'Money & price', 'Addition & subtraction', 'Phonics review'] },
  ],
  'Mathematics': [
    { id: 'ma1', title: 'Chapter 1  Rational Numbers',         sections: ['Integers', 'Fractions & decimals', 'Number line', 'Absolute value'] },
    { id: 'ma2', title: 'Chapter 2  Algebraic Expressions',    sections: ['Variables & constants', 'Simplifying expressions', 'Like terms', 'Substitution'] },
    { id: 'ma3', title: 'Chapter 3  Equations',                sections: ['One-variable equations', 'Two-variable equations', 'Systems of equations', 'Word problems'] },
    { id: 'ma4', title: 'Chapter 4  Geometry Basics',          sections: ['Points, lines & planes', 'Angles', 'Triangles', 'Congruence'] },
    { id: 'ma5', title: 'Chapter 5  Statistics & Probability', sections: ['Data collection', 'Mean, median & mode', 'Graphs & charts', 'Basic probability'] },
  ],
  'Physics': [
    { id: 'ph1', title: 'Chapter 1  Mechanics',       sections: ['Motion & velocity', 'Acceleration', "Newton's Laws", 'Friction & forces'] },
    { id: 'ph2', title: 'Chapter 2  Energy & Work',   sections: ['Kinetic energy', 'Potential energy', 'Work & power', 'Conservation of energy'] },
    { id: 'ph3', title: 'Chapter 3  Waves & Sound',   sections: ['Wave properties', 'Frequency & amplitude', 'Sound waves', 'Doppler effect'] },
    { id: 'ph4', title: 'Chapter 4  Electricity',     sections: ['Electric charge', 'Current & voltage', "Ohm's Law & resistance", 'Series & parallel circuits'] },
    { id: 'ph5', title: 'Chapter 5  Light & Optics',  sections: ['Reflection', 'Refraction', 'Lenses', 'Color & spectrum'] },
  ],
  'Chemistry': [
    { id: 'ch1', title: 'Chapter 1  Matter & Properties', sections: ['States of matter', 'Physical properties', 'Chemical properties', 'Mixtures & solutions'] },
    { id: 'ch2', title: 'Chapter 2  Atoms & Elements',    sections: ['Atomic structure', 'Periodic table', 'Isotopes', 'Electron configuration'] },
    { id: 'ch3', title: 'Chapter 3  Chemical Bonding',    sections: ['Ionic bonds', 'Covalent bonds', 'Metallic bonds', 'Molecular shape'] },
    { id: 'ch4', title: 'Chapter 4  Chemical Reactions',  sections: ['Reaction types', 'Balancing equations', 'Stoichiometry', 'Reaction rates'] },
    { id: 'ch5', title: 'Chapter 5  Acids & Bases',       sections: ['pH scale', 'Properties of acids', 'Properties of bases', 'Neutralisation'] },
  ],
  'Biology': [
    { id: 'bi1', title: 'Chapter 1  Cell Biology',       sections: ['Cell structure', 'Organelles', 'Cell division', 'Transport across membranes'] },
    { id: 'bi2', title: 'Chapter 2  Genetics',           sections: ['DNA & genes', 'Mendelian genetics', 'Mutations', 'Genetic disorders'] },
    { id: 'bi3', title: 'Chapter 3  Ecosystems',         sections: ['Food chains & webs', 'Energy flow', 'Biomes', 'Human impact'] },
    { id: 'bi4', title: 'Chapter 4  Human Body Systems', sections: ['Digestive system', 'Circulatory system', 'Respiratory system', 'Nervous system'] },
    { id: 'bi5', title: 'Chapter 5  Evolution',          sections: ['Natural selection', 'Adaptation', 'Evidence for evolution', 'Classification'] },
  ],
  'History': [
    { id: 'hi1', title: 'Unit 1  Ancient Civilizations', sections: ['Mesopotamia', 'Ancient Egypt', 'Indus Valley', 'Ancient China'] },
    { id: 'hi2', title: 'Unit 2  Classical Antiquity',   sections: ['Ancient Greece', 'Roman Republic', 'Roman Empire', 'Decline & fall'] },
    { id: 'hi3', title: 'Unit 3  Medieval Period',       sections: ['Feudal system', 'The Crusades', 'Byzantine Empire', 'Islamic Golden Age'] },
    { id: 'hi4', title: 'Unit 4  Modern World',          sections: ['Industrial Revolution', 'World War I', 'World War II', 'Cold War'] },
  ],
  'Geography': [
    { id: 'ge1', title: 'Unit 1  Physical Geography',   sections: ['Landforms', 'Climate zones', 'Water cycle', 'Natural disasters'] },
    { id: 'ge2', title: 'Unit 2  Human Geography',      sections: ['Population', 'Urbanisation', 'Agriculture', 'Economic activities'] },
    { id: 'ge3', title: 'Unit 3  Geopolitics',          sections: ['Countries & capitals', 'Borders & territory', 'International relations', 'Trade routes'] },
    { id: 'ge4', title: 'Unit 4  Environmental Issues', sections: ['Climate change', 'Deforestation', 'Ocean pollution', 'Sustainable development'] },
  ],
};

// ── Textbook editions mock data ────────────────────────────────────────────────
interface TbEdition { id: string; name: string; subtitle: string; color: string; year: string; }

const TB_EDITION_DATA: Record<string, { name: string; subtitle: string; color: string; year: string }[]> = {
  'English': [
    { name: 'Go for it!',           subtitle: 'PEP English: Go for it!',    color: '#3b5bdb', year: '2024 Edition' },
    { name: 'New Standard English', subtitle: 'PEP New Standard English',    color: '#0891b2', year: '2022 Edition' },
  ],
  'Mathematics': [
    { name: 'Mathematics A Edition', subtitle: 'PEP Mathematics (A Edition)', color: '#7c3aed', year: '2024 Edition' },
    { name: 'Mathematics B Edition', subtitle: 'PEP Mathematics (B Edition)', color: '#6d28d9', year: '2023 Edition' },
  ],
  'Physics': [
    { name: 'Physics (Required)',       subtitle: 'PEP Physics Required Series',    color: '#0e7490', year: '2024 Edition' },
    { name: 'Physics (Selective Required)', subtitle: 'PEP Elective Series',        color: '#164e63', year: '2023 Edition' },
  ],
  'Chemistry': [
    { name: 'Chemistry (Required)',       subtitle: 'PEP Chemistry Required Series',   color: '#16a34a', year: '2024 Edition' },
    { name: 'Chemistry (Selective Required)', subtitle: 'PEP Elective Series',       color: '#15803d', year: '2023 Edition' },
  ],
  'Biology': [
    { name: 'Biology (Required)',       subtitle: 'PEP Biology Required Series', color: '#ca8a04', year: '2024 Edition' },
    { name: 'Biology (Selective Required)', subtitle: 'PEP Elective Series',     color: '#a16207', year: '2023 Edition' },
  ],
  'History': [
    { name: 'Chinese & World History Outline (Vol.1)', subtitle: 'PEP History Required', color: '#dc2626', year: '2024 Edition' },
    { name: 'Selective Required Series',     subtitle: 'PEP History Elective', color: '#b91c1c', year: '2023 Edition' },
  ],
  'Geography': [
    { name: 'Geography (Required)',       subtitle: 'PEP Geography Required Series', color: '#059669', year: '2024 Edition' },
    { name: 'Geography (Selective Required)', subtitle: 'PEP Elective Series',     color: '#047857', year: '2023 Edition' },
  ],
};

const PUBLISHER_SHORT: Record<string, string> = {
  "PEP (People's Education Press)": 'PEP',
  'Beijing Normal University Press': 'BNU Press',
  'Jiangsu Education Press': 'JSEP',
  'Oxford University Press': 'Oxford',
};

function getTbEditions(publisher: string, grade: string, subject: string, semester: string): TbEdition[] {
  const pubLabel = PUBLISHER_SHORT[publisher] || publisher.split(' ')[0];
  const volLabel = semester === 'Vol.1' ? 'Volume 1' : 'Volume 2';
  const base = TB_EDITION_DATA[subject] ?? [
    { name: `${pubLabel} ${subject}`, subtitle: `${pubLabel} ${subject}`, color: '#3b5bdb', year: '2024 Edition' },
  ];
  return base.map((e, i) => ({
    ...e,
    id: `tb-${i}-${publisher.slice(0, 3)}-${grade}-${subject}-${semester}`,
    subtitle: `${e.subtitle} · ${grade} ${volLabel}`,
  }));
}

// ── Illustration style meta ────────────────────────────────────────────────────
const ILLUST_STYLES: { id: IllustStyle; icon: React.ElementType; label: string; desc: string; color: string }[] = [
  { id: 'auto',       icon: Sparkles,     label: 'Auto',        desc: 'AI decides best type',      color: '#3b5bdb' },
  { id: 'diagram',    icon: Shapes,       label: 'Diagram',     desc: 'Flow / concept maps',       color: '#7c3aed' },
  { id: 'chart',      icon: BarChart2,    label: 'Chart',       desc: 'Graphs & data viz',         color: '#0891b2' },
  { id: 'photo',      icon: Camera,       label: 'Photo',       desc: 'Real-world reference image', color: '#16a34a' },
  { id: 'scientific', icon: FlaskConical, label: 'Scientific',  desc: 'Lab / anatomy diagrams',    color: '#d97706' },
];

// Mock illustration placeholders (colored gradient boxes simulating AI images)
const MOCK_ILLUST_COLORS = [
  'linear-gradient(135deg, #dbeafe 0%, #bfdbfe 100%)',
  'linear-gradient(135deg, #d1fae5 0%, #a7f3d0 100%)',
  'linear-gradient(135deg, #fef3c7 0%, #fde68a 100%)',
  'linear-gradient(135deg, #ede9fe 0%, #ddd6fe 100%)',
  'linear-gradient(135deg, #fce7f3 0%, #fbcfe8 100%)',
];

// ── Question Bank mock data ────────────────────────────────────────────────────
interface BankQuestion {
  id: string; type: string; subject: string; grade: string;
  difficulty: 'easy' | 'medium' | 'hard'; prompt: string;
  tags: string[];
}

const QUESTION_BANK: BankQuestion[] = [
  { id: 'bq1',  type: 'MCQ',         subject: 'Physics',   grade: 'Grade 11', difficulty: 'medium', prompt: "According to Newton's Second Law, if the net force on an object doubles while mass stays constant, what happens to acceleration?",           tags: ["Newton's Laws", 'Force', 'Mechanics'] },
  { id: 'bq2',  type: 'MCQ',         subject: 'Physics',   grade: 'Grade 11', difficulty: 'easy',   prompt: "Newton's Third Law states that for every action there is an equal and opposite ___.",                                                       tags: ["Newton's Laws", 'Reaction force'] },
  { id: 'bq3',  type: 'True/False',  subject: 'Physics',   grade: 'Grade 10', difficulty: 'easy',   prompt: 'An object at rest will remain at rest unless acted on by a net external force.',                                                           tags: ['Inertia', "Newton's First Law"] },
  { id: 'bq4',  type: 'Short Answer',subject: 'Physics',   grade: 'Grade 11', difficulty: 'hard',   prompt: 'A 5 kg box is pushed across a frictionless surface with 20 N. Calculate the acceleration and describe the motion.',                       tags: ['Calculation', 'Kinematics'] },
  { id: 'bq5',  type: 'MCQ',         subject: 'Biology',   grade: 'Grade 10', difficulty: 'medium', prompt: 'Which organelle is primarily responsible for ATP synthesis via oxidative phosphorylation?',                                               tags: ['Cell biology', 'Mitochondria', 'ATP'] },
  { id: 'bq6',  type: 'MCQ',         subject: 'Biology',   grade: 'Grade 10', difficulty: 'easy',   prompt: 'In the light-dependent reactions of photosynthesis, water molecules are split in a process called:',                                     tags: ['Photosynthesis', 'Photolysis'] },
  { id: 'bq7',  type: 'Fill-blank',  subject: 'Biology',   grade: 'Grade 10', difficulty: 'medium', prompt: 'The molecule _______ acts as the primary electron acceptor immediately after Photosystem I.',                                            tags: ['Photosynthesis', 'Electron transport'] },
  { id: 'bq8',  type: 'Short Answer',subject: 'Biology',   grade: 'Grade 10', difficulty: 'medium', prompt: 'Explain why a leaf appears green, and describe what happens to absorbed wavelengths.',                                                   tags: ['Chlorophyll', 'Light absorption'] },
  { id: 'bq9',  type: 'MCQ',         subject: 'Math',      grade: 'Grade 9',  difficulty: 'medium', prompt: 'Which of the following is the vertex form of the quadratic y = x² − 4x + 3?',                                                          tags: ['Quadratics', 'Vertex form'] },
  { id: 'bq10', type: 'Fill-blank',  subject: 'Math',      grade: 'Grade 9',  difficulty: 'easy',   prompt: 'The discriminant of ax² + bx + c = 0 is given by _______. If it is negative, the equation has no real roots.',                         tags: ['Discriminant', 'Quadratics'] },
  { id: 'bq11', type: 'MCQ',         subject: 'Chemistry', grade: 'Grade 11', difficulty: 'medium', prompt: 'Which type of bond involves the sharing of electron pairs between atoms?',                                                               tags: ['Chemical bonding', 'Covalent bond'] },
  { id: 'bq12', type: 'True/False',  subject: 'Chemistry', grade: 'Grade 11', difficulty: 'easy',   prompt: 'Ionic bonds form between a metal and a non-metal through electron transfer.',                                                            tags: ['Ionic bond', 'Chemical bonding'] },
];

const BANK_SUBJECTS = ['All Subjects', 'Physics', 'Biology', 'Economics', 'Math', 'Chemistry'];
const BANK_TYPES    = ['All Types', 'MCQ', 'True/False', 'Fill-blank', 'Short Answer'];

const GENERIC_STOPWORDS = new Set([
  'the', 'and', 'for', 'with', 'that', 'this', 'from', 'your', 'into', 'about', 'paper', 'chapter', 'supplementary',
  'notes', 'exercise', 'exam', 'test', 'question', 'questions', 'grade', 'vol', 'unit', 'file', 'upload', 'document',
  'what', 'which', 'when', 'where', 'why', 'how', 'are', 'was', 'were', 'can', 'could', 'should', 'would', 'have',
  'has', 'had', 'more', 'than', 'then', 'their', 'there', 'they', 'them', 'also', 'only', 'between', 'under', 'over',
  'using', 'used', 'into', 'across', 'after', 'before', 'during', 'through', 'because', 'within', 'without', 'below',
  'above', 'economics', 'biology', 'physics', 'chemistry', 'mathematics', 'english', 'history', 'geography',
]);

function hashString(input: string): number {
  let h = 2166136261;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h += (h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24);
  }
  return h >>> 0;
}

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a += 0x6D2B79F5;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function toTitleToken(token: string): string {
  return token
    .split('_')
    .map((s) => s ? s[0].toUpperCase() + s.slice(1) : s)
    .join(' ');
}

function extractKeywords(sourceText: string): string[] {
  const normalized = sourceText
    .toLowerCase()
    .replace(/[^a-z0-9_\-\s]/g, ' ')
    .replace(/[\-_]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (!normalized) {
    return [];
  }

  const freq = new Map<string, number>();
  for (const raw of normalized.split(' ')) {
    const token = raw.trim();
    if (token.length < 4) continue;
    if (/^\d+$/.test(token)) continue;
    if (GENERIC_STOPWORDS.has(token)) continue;
    freq.set(token, (freq.get(token) || 0) + 1);
  }

  return Array.from(freq.entries())
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 12)
    .map(([k]) => toTitleToken(k));
}

function uniqueKeepOrder(items: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of items) {
    const key = item.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
}

const SUBJECT_KEYWORDS: Array<{ subject: string; keywords: string[] }> = [
  { subject: 'Economics', keywords: ['economics', 'econ', 'market', 'demand', 'supply', 'gdp', 'inflation', 'macro', 'micro'] },
  { subject: 'Biology', keywords: ['biology', 'photosynthesis', 'cell', 'dna', 'ecosystem', 'mitochondria'] },
  { subject: 'Physics', keywords: ['physics', 'newton', 'force', 'velocity', 'acceleration', 'energy'] },
  { subject: 'Chemistry', keywords: ['chemistry', 'atom', 'bond', 'acid', 'base', 'molecule'] },
  { subject: 'Mathematics', keywords: ['math', 'mathematics', 'algebra', 'geometry', 'quadratic', 'calculus'] },
  { subject: 'English', keywords: ['english', 'grammar', 'vocabulary', 'reading', 'writing'] },
  { subject: 'History', keywords: ['history', 'dynasty', 'war', 'revolution', 'civilization'] },
  { subject: 'Geography', keywords: ['geography', 'climate', 'plate', 'population', 'urbanization'] },
];

const SUBJECT_TOPICS: Record<string, string[]> = {
  Economics: ['price elasticity of demand', 'opportunity cost', 'market equilibrium', 'inflation and CPI', 'fiscal policy', 'comparative advantage'],
  Biology: ['cellular respiration', 'photosynthesis', 'genetic inheritance', 'enzyme activity', 'ecosystem energy flow', 'natural selection'],
  Physics: ['Newton\'s second law', 'conservation of energy', 'momentum', 'circuit current and voltage', 'wave properties', 'optics and refraction'],
  Chemistry: ['covalent bonding', 'mole concept', 'acid-base neutralisation', 'reaction rates', 'periodic trends', 'redox reactions'],
  Mathematics: ['quadratic functions', 'simultaneous equations', 'probability distributions', 'trigonometric ratios', 'linear functions', 'statistics interpretation'],
  English: ['main idea inference', 'grammar tense consistency', 'argument structure', 'vocabulary in context', 'cohesion devices', 'tone and register'],
  History: ['industrial revolution impact', 'causes of world war I', 'colonial expansion', 'cold war dynamics', 'historical source reliability', 'reform movements'],
  Geography: ['plate tectonics', 'monsoon systems', 'urban migration', 'resource distribution', 'sustainable development', 'population pyramids'],
};

function detectSubjectFromText(text: string): string | null {
  const normalized = text.toLowerCase();
  for (const item of SUBJECT_KEYWORDS) {
    if (item.keywords.some((kw) => normalized.includes(kw))) {
      return item.subject;
    }
  }
  return null;
}

function getTopic(subjectName: string, index: number): string {
  const pool = SUBJECT_TOPICS[subjectName] ?? SUBJECT_TOPICS.Biology;
  return pool[index % pool.length];
}

function optionWithCorrect(topic: string, subjectName: string) {
  return [
    { key: 'A', text: `A common misconception unrelated to ${topic}`, correct: false },
    { key: 'B', text: `A correct explanation of ${topic} in ${subjectName}`, correct: true },
    { key: 'C', text: `A partially true statement that misses key conditions`, correct: false },
    { key: 'D', text: `A reversed causal claim about ${topic}`, correct: false },
  ];
}
// ── Sub-components ─────────────────────────────────────────────────────────────
// Toggle switch
function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div
      onClick={() => onChange(!checked)}
      style={{
        width: '42px', height: '24px', borderRadius: '99px', cursor: 'pointer', flexShrink: 0,
        background: checked ? '#3b5bdb' : '#d1d5db',
        position: 'relative', transition: 'background 0.2s',
      }}
    >
      <div style={{
        position: 'absolute', top: '3px',
        left: checked ? '21px' : '3px',
        width: '18px', height: '18px', borderRadius: '50%',
        background: '#fff', boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
        transition: 'left 0.2s',
      }} />
    </div>
  );
}

// Image placeholder card
function IllustPlaceholder({ qIndex, style: styleName }: { qIndex: number; style: IllustStyle }) {
  const grad = MOCK_ILLUST_COLORS[qIndex % MOCK_ILLUST_COLORS.length];
  const meta = ILLUST_STYLES.find(s => s.id === styleName) ?? ILLUST_STYLES[0];
  const Icon = meta.icon;
  return (
    <div style={{
      marginTop: '12px', borderRadius: '10px', overflow: 'hidden',
      border: '1px solid #e8eaed',
    }}>
      <div style={{
        height: '120px', background: grad,
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '8px',
      }}>
        <Icon size={28} style={{ color: 'rgba(0,0,0,0.2)' }} />
        <span style={{ fontSize: '12px', color: 'rgba(0,0,0,0.3)', fontWeight: 500 }}>
          AI-generated {meta.label.toLowerCase()} illustration
        </span>
      </div>
      <div style={{
        padding: '7px 12px', background: '#fafafa',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <span style={{ fontSize: '11px', color: '#9ca3af', display: 'inline-flex', alignItems: 'center', gap: '5px' }}>
          <Sparkles size={11} style={{ opacity: 0.65 }} /> AI Illustration · {meta.label}
        </span>
        <button style={{ fontSize: '11px', color: '#3b5bdb', border: 'none', background: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}>
          <RefreshCw size={11} /> Regenerate
        </button>
      </div>
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────
export default function AssessmentGenerate() {
  const navigate = useNavigate();
  const [step, setStep] = useState(1);
  const [sourceTab, setSourceTab] = useState<SourceTab>('upload');

  // Step 1 state
  const [uploadedFile, setUploadedFile] = useState<{ name: string; size: number; file?: File; extractedText?: string } | null>(null);
  const [textInput, setTextInput] = useState('');
  const [pastedQuestions, setPastedQuestions] = useState('');
  const [isDragging, setIsDragging] = useState(false);
  const [deriveMode, setDeriveMode] = useState<'variation' | 'extension' | 'contrast'>('variation');
  const [qInputMode, setQInputMode] = useState<QuestionInputMode>('paste');
  const [examGenMode, setExamGenMode] = useState<ExamGenMode>('error-questions');
  const [examMatchMode, setExamMatchMode] = useState<'type' | 'knowledge'>('type');
  const [examDifficulty, setExamDifficulty] = useState<'basic' | 'solid' | 'advanced'>('solid');
  const [examFiles, setExamFiles] = useState<{ name: string; size: number; url: string }[]>([]);
  const [examDragging, setExamDragging] = useState(false);
  const examFileRef = useRef<HTMLInputElement>(null);
  const [bankSearch, setBankSearch] = useState('');
  const [bankSubject, setBankSubject] = useState('All Subjects');
  const [bankType, setBankType] = useState('All Types');
  const [selectedBankIds, setSelectedBankIds] = useState<Set<string>>(new Set());
  const fileRef = useRef<HTMLInputElement>(null);
  const mainScrollRef = useRef<HTMLDivElement>(null);

  // Textbook tab state
  const [tbPublisher, setTbPublisher] = useState('');
  const [tbGrade, setTbGrade] = useState('');
  const [tbSubject, setTbSubject] = useState('');
  const [tbSemester, setTbSemester] = useState('');
  const [tbEdition, setTbEdition] = useState('');
  const [selectedSections, setSelectedSections] = useState<Set<string>>(new Set());

  const tbResetDeep  = () => { setSelectedSections(new Set()); };
  const tbResetEdition = () => { setTbEdition(''); tbResetDeep(); };
  const tbResetSemester = () => { setTbSemester(''); tbResetEdition(); };
  const tbResetAll = () => { tbResetSemester(); };

  const tbSecKey = (chapterId: string, section: string) => `${chapterId}::${section}`;
  const tbChapters = tbEdition ? (TEXTBOOK_CHAPTERS[tbSubject] ?? []) : [];

  const tbChapterSelected = (chapterId: string, sections: string[]) =>
    sections.some(s => selectedSections.has(tbSecKey(chapterId, s)));
  const tbChapterAllSelected = (chapterId: string, sections: string[]) =>
    sections.length > 0 && sections.every(s => selectedSections.has(tbSecKey(chapterId, s)));

  const toggleTbChapter = (chapterId: string, sections: string[]) => {
    const allSel = tbChapterAllSelected(chapterId, sections);
    setSelectedSections(prev => {
      const next = new Set(prev);
      sections.forEach(s => {
        const k = tbSecKey(chapterId, s);
        allSel ? next.delete(k) : next.add(k);
      });
      return next;
    });
  };

  const toggleTbSection = (chapterId: string, section: string) => {
    const key = tbSecKey(chapterId, section);
    setSelectedSections(prev => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  };

  // Step 2 state
  const [difficulty, setDifficulty] = useState<'easy' | 'medium' | 'hard'>('medium');
  const [qTypes, setQTypes] = useState<QTypeCfg[]>([
    { label: 'Multiple Choice (MCQ)', desc: 'Choose the best answer from a list of options.', key: 'mcq',   count: 5, active: true  },
    { label: 'True / False',          desc: 'Determine if the statement is true or false.',   key: 'tf',    count: 2, active: true  },
    { label: 'Fill in the Blank',     desc: 'Complete the sentence with the correct word.',   key: 'fill',  count: 2, active: true  },
    { label: 'Short Answer',          desc: 'Provide a concise answer to the question.',      key: 'sa',    count: 1, active: true  },
    { label: 'Essay',                 desc: 'Write a detailed response to the question.',     key: 'essay', count: 0, active: false },
  ]);

  // Illustration settings
  const [illustEnabled, setIllustEnabled] = useState(false);
  const [illustStyle, setIllustStyle] = useState<IllustStyle>('auto');
  const [illustTypes, setIllustTypes] = useState<Set<string>>(new Set(['mcq', 'sa']));
  const [illustPrompt, setIllustPrompt] = useState('');

  // Step 3 state
  const [generating, setGenerating] = useState(false);
  const [genPhase, setGenPhase] = useState<'questions' | 'illustrations' | 'done'>('questions');
  const [genProgress, setGenProgress] = useState(0);
  const [illustProgress, setIllustProgress] = useState(0);
  const [genDone, setGenDone] = useState(false);
  const [questions, setQuestions] = useState<GeneratedQ[]>([]);
  const [expandedQ, setExpandedQ] = useState<string | null>(null);
  const [savedIds, setSavedIds] = useState<Set<string>>(new Set());
  const [creatingPaper, setCreatingPaper] = useState(false);
  const [generateNonce, setGenerateNonce] = useState(0);

  function inferEffectiveSubject(): string {
    if (sourceTab === 'textbook' && tbSubject) return tbSubject;

    const candidates: string[] = [];
    if (uploadedFile?.name) candidates.push(uploadedFile.name);
    if (textInput) candidates.push(textInput);
    if (pastedQuestions) candidates.push(pastedQuestions);
    if (examFiles.length > 0) candidates.push(examFiles.map((f) => f.name).join(' '));
    if (selectedBankIds.size > 0) {
      const fromBank = QUESTION_BANK
        .filter((q) => selectedBankIds.has(q.id))
        .map((q) => `${q.subject} ${q.prompt}`)
        .join(' ');
      candidates.push(fromBank);
    }

    const detected = detectSubjectFromText(candidates.join(' '));
    return detected || tbSubject || 'Biology';
  }

  function buildSourceMaterialText(): string {
    if (sourceTab === 'upload') {
      return uploadedFile?.extractedText || uploadedFile?.name || '';
    }
    if (sourceTab === 'text') {
      return textInput;
    }
    if (sourceTab === 'textbook') {
      const chosenSections = Array.from(selectedSections)
        .map((item) => String(item).split('::')[1])
        .join(' ');
      return [tbPublisher, tbGrade, tbSubject, tbSemester, tbEdition, chosenSections].filter(Boolean).join(' ');
    }
    if (sourceTab === 'exam') {
      const fileNames = examFiles.map((f) => f.name).join(' ');
      return [fileNames, examGenMode, examMatchMode, examDifficulty].filter(Boolean).join(' ');
    }

    if (qInputMode === 'paste') {
      return pastedQuestions;
    }
    return QUESTION_BANK
      .filter((q) => selectedBankIds.has(q.id))
      .map((q) => `${q.subject} ${q.prompt} ${q.tags.join(' ')}`)
      .join(' ');
  }

  function buildGeneratedQuestions(effectiveSubject: string, topicPool: string[], seedKey: string): GeneratedQ[] {
    const rand = mulberry32(hashString(seedKey));

    const deriveSource = qInputMode === 'paste'
      ? pastedQuestions.trim().split('\n').find((line) => line.trim()) || 'Provided source question'
      : QUESTION_BANK.find((q) => selectedBankIds.has(q.id))?.prompt || 'Selected bank question';

    const typeLabel: Record<string, string> = {
      mcq: 'MCQ',
      tf: 'True/False',
      fill: 'Fill-blank',
      sa: 'Short Answer',
      essay: 'Essay',
    };

    const result: GeneratedQ[] = [];
    let idx = 0;
    const promptLeadPool = [
      'In this topic',
      'From core concept analysis',
      'Within the syllabus scope',
      'In exam-style reasoning',
    ];

    for (const qt of qTypes) {
      if (!qt.active) continue;
      for (let i = 0; i < qt.count; i++) {
        const topic = topicPool[Math.floor(rand() * topicPool.length)] || getTopic(effectiveSubject, idx);
        const promptLead = promptLeadPool[Math.floor(rand() * promptLeadPool.length)];
        const base: GeneratedQ = {
          id: `gq-${idx + 1}`,
          type: typeLabel[qt.key],
          difficulty,
          prompt: '',
          explanation: '',
          hasImage: illustEnabled && illustTypes.has(qt.key),
          imageStyle: illustStyle,
          derivedFrom: sourceTab === 'questions' ? deriveSource.slice(0, 90) : undefined,
        };

        if (qt.key === 'mcq') {
          base.prompt = sourceTab === 'questions'
            ? `Based on "${deriveSource.slice(0, 50)}...", which statement about ${topic} is most accurate?`
            : `${promptLead}, in ${effectiveSubject} which statement best explains ${topic}?`;
          base.options = optionWithCorrect(topic, effectiveSubject);
          base.explanation = `${topic} was selected from the uploaded material cues and ${effectiveSubject} topic set; the correct option reflects the most supported definition/mechanism.`;
        } else if (qt.key === 'tf') {
          base.prompt = `True or False: a correct understanding of ${topic} in ${effectiveSubject} requires identifying assumptions and boundary conditions.`;
          base.answer = 'True';
          base.explanation = `Questions on ${topic} often depend on conditions; identifying assumptions prevents overgeneralized conclusions.`;
        } else if (qt.key === 'fill') {
          base.prompt = `Complete the statement: in ${effectiveSubject} the concept most directly used to analyze ${topic} is _______.`;
          base.answer = topic;
          base.explanation = `${topic} is the intended key term and anchors the analytical framework of the question.`;
        } else if (qt.key === 'sa') {
          base.prompt = `Use 2-3 sentences to explain ${topic} and provide one source-grounded example in ${effectiveSubject}.`;
          base.explanation = `A strong answer defines ${topic}, explains mechanism or logic, and gives a concrete example.`;
        } else {
          base.prompt = `Write an essay discussing ${topic} in ${effectiveSubject}, including source evidence, argument structure, and one counterexample.`;
          base.explanation = `High-quality essays should include precise definitions, evidence-based reasoning, and discussion of limitations.`;
        }

        result.push(base);
        idx += 1;
      }
    }
    return result;
  }

  async function handleCreateExamPaper() {
    const selected = (savedIds.size > 0 ? questions.filter((q) => savedIds.has(q.id)) : questions);
    if (selected.length === 0) {
      window.alert('Please generate questions first.');
      return;
    }

    setCreatingPaper(true);
    try {
      const resolvedSemester = sourceTab === 'textbook'
        ? (tbSemester.includes('Vol.2') ? 'Vol.2' : tbSemester.includes('Vol.1') ? 'Vol.1' : null)
        : null;

      const response = await createPaperApi({
        title: `AI Generated ${inferEffectiveSubject()} Paper ${new Date().toISOString().slice(0, 10)}`,
        grade: tbGrade || 'Grade 7',
        subject: inferEffectiveSubject(),
        semester: resolvedSemester,
        exam_type: sourceTab === 'exam' ? 'simulation' : 'ai_generated',
        duration_min: 45,
        total_score: 100,
        questions: selected.map((q) => ({
          type: q.type,
          prompt: q.prompt,
          difficulty: q.difficulty,
          explanation: q.explanation,
          answer: q.answer,
          options: (q.options || []).map((opt) => ({
            key: opt.key,
            text: opt.text,
            is_correct: !!opt.correct,
          })),
        })),
      });

      window.alert(`Paper #${response.paper_id} created successfully. Redirecting to Exam Papers.`);
      navigate('/teacher/assessment/papers');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'unknown error';
      window.alert(`Create Exam Paper failed: ${message}`);
    } finally {
      setCreatingPaper(false);
    }
  }

  // Helpers
  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault(); setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) setUploadedFile({ name: file.name, size: file.size, file, extractedText: '' });
  }, []);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) setUploadedFile({ name: file.name, size: file.size, file, extractedText: '' });
  };

  function handleExamFiles(files: FileList | null) {
    if (!files) return;
    const newFiles = Array.from(files).slice(0, Math.max(0, 5 - examFiles.length)).map(f => ({
      name: f.name, size: f.size,
      url: f.type.startsWith('image/') ? URL.createObjectURL(f) : '',
    }));
    setExamFiles(prev => [...prev, ...newFiles].slice(0, 5));
  }

  function removeExamFile(idx: number) {
    setExamFiles(prev => prev.filter((_, i) => i !== idx));
  }

  function totalQ() { return qTypes.filter(t => t.active).reduce((s, t) => s + t.count, 0); }

  function canProceedStep1() {
    if (sourceTab === 'upload') return !!uploadedFile;
    // 与下方占位「至少 N 字」一致；中英文都按字符数计
    if (sourceTab === 'text') return textInput.trim().length >= TEXT_SOURCE_MIN_CHARS;
    if (sourceTab === 'exam') return examFiles.length > 0;
    if (sourceTab === 'questions') {
      if (qInputMode === 'paste') return pastedQuestions.trim().length > 30;
      return selectedBankIds.size > 0;
    }
    return true;
  }

  function canProceedStep2() {
    if (sourceTab === 'exam') return true;
    // Grade/subject 仅在 Textbook 流程的 Step 1 中选择；上传/文本等来源 Step 2 不要求填写
    return totalQ() > 0;
  }

  async function handleGenerate() {
    const nextNonce = generateNonce + 1;
    setGenerateNonce(nextNonce);
    setGenerating(true); setGenProgress(0); setIllustProgress(0);
    setGenDone(false); setQuestions([]); setGenPhase('questions');

    // Phase 1: generate questions
    const qSteps = [15, 30, 50, 70, 85, 100];
    for (const p of qSteps) {
      await new Promise(r => setTimeout(r, 380));
      setGenProgress(p);
    }
    const effectiveSubject = inferEffectiveSubject();
    let sourceMaterial = buildSourceMaterialText();
    if (sourceTab === 'upload' && uploadedFile?.file) {
      try {
        const extracted = await extractSourceTextApi(uploadedFile.file);
        sourceMaterial = extracted.source_text;
        setUploadedFile((prev) => prev ? { ...prev, extractedText: extracted.source_text } : prev);
      } catch {
        // fallback to filename when extraction fails
      }
    }
    const materialKeywords = extractKeywords(sourceMaterial);
    const subjectDefaults = SUBJECT_TOPICS[effectiveSubject] ?? SUBJECT_TOPICS.Biology;
    const topicPool = uniqueKeepOrder([...materialKeywords, ...subjectDefaults]).slice(0, 20);
    const seedKey = `${effectiveSubject}|${sourceMaterial}|${difficulty}|${sourceTab}|${nextNonce}`;
    const typeTargets = qTypes
      .filter((qt) => qt.active)
      .reduce<Record<string, number>>((acc, qt) => {
        if (qt.key === 'mcq') acc.MCQ = qt.count;
        else if (qt.key === 'tf') acc['True/False'] = qt.count;
        else if (qt.key === 'fill') acc['Fill-blank'] = qt.count;
        else if (qt.key === 'sa') acc['Short Answer'] = qt.count;
        else if (qt.key === 'essay') acc.Essay = qt.count;
        return acc;
      }, {});

    let qs = buildGeneratedQuestions(effectiveSubject, topicPool, seedKey);
    try {
      const previewSourceText = (() => {
        if (sourceTab === 'text') {
          return (sourceMaterial || textInput).trim();
        }
        if (sourceTab === 'textbook') {
          const m = sourceMaterial.trim();
          return m || `${effectiveSubject} ${tbGrade || 'Grade 7'} ${difficulty}`.trim();
        }
        const m = sourceMaterial.trim();
        if (m) return m;
        if (sourceTab === 'upload' && uploadedFile?.name) return uploadedFile.name.trim();
        if (sourceTab === 'exam' && examFiles.length > 0) {
          return examFiles.map((f) => f.name).join(' ').trim();
        }
        return '[no extractable text]';
      })();

      const previewPayload: Parameters<typeof previewGenerateQuestionsApi>[0] = {
        source_text: previewSourceText,
        difficulty,
        question_count: totalQ(),
        type_targets: typeTargets,
      };
      if (sourceTab === 'textbook') {
        previewPayload.subject = effectiveSubject;
        previewPayload.grade = tbGrade || 'Grade 7';
      }
      const preview = await previewGenerateQuestionsApi(previewPayload);
      if (preview.questions.length > 0) {
        qs = preview.questions.map((q, idx) => ({
          id: `gq-${idx + 1}`,
          type: q.type,
          prompt: q.prompt,
          options: q.options.map((opt) => ({ key: opt.key, text: opt.text, correct: opt.correct })),
          answer: q.answer || undefined,
          difficulty: q.difficulty,
          explanation: q.explanation,
          hasImage: illustEnabled && illustTypes.has(q.type === 'MCQ' ? 'mcq' : q.type === 'True/False' ? 'tf' : q.type === 'Fill-blank' ? 'fill' : q.type === 'Essay' ? 'essay' : 'sa'),
          imageStyle: illustStyle,
        }));
      }
    } catch {
      // keep local fallback generation when preview API is unavailable
    }

    setQuestions(qs);
    await new Promise(r => setTimeout(r, 200));

    // Phase 2: generate illustrations (if enabled)
    if (illustEnabled) {
      setGenPhase('illustrations'); setIllustProgress(0);
      const iSteps = [20, 45, 65, 85, 100];
      for (const p of iSteps) {
        await new Promise(r => setTimeout(r, 480));
        setIllustProgress(p);
      }
      await new Promise(r => setTimeout(r, 200));
    }

    setGenerating(false); setGenDone(true); setGenPhase('done');
  }

  function setQTypeCount(key: string, val: number) {
    setQTypes(prev => prev.map(t => t.key === key ? { ...t, count: Math.max(1, val) } : t));
  }

  function toggleQType(key: string) {
    setQTypes(prev => prev.map(t => t.key === key
      ? { ...t, active: !t.active, count: !t.active && t.count === 0 ? 5 : t.count }
      : t));
  }

  function toggleIllustType(key: string) {
    setIllustTypes(prev => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  }

  function fmtSize(b: number) {
    if (b < 1024) return `${b} B`;
    if (b < 1048576) return `${(b / 1024).toFixed(1)} KB`;
    return `${(b / 1048576).toFixed(1)} MB`;
  }

  const SOURCE_TABS: { id: SourceTab; icon: React.ElementType; label: string; badge?: string }[] = [
    { id: 'upload',    icon: Upload,    label: 'Upload Doc' },
    { id: 'text',      icon: AlignLeft, label: 'Enter Text' },
    { id: 'textbook',  icon: BookOpen,  label: 'Textbook' },
    { id: 'exam',      icon: ScanLine,  label: 'Exam Paper' },
    { id: 'questions', icon: Layers,    label: 'From Questions', badge: 'New' },
  ];

  const filteredBank = QUESTION_BANK.filter(q => {
    if (bankSubject !== 'All Subjects' && q.subject !== bankSubject) return false;
    if (bankType !== 'All Types' && q.type !== bankType) return false;
    if (bankSearch && !q.prompt.toLowerCase().includes(bankSearch.toLowerCase()) && !q.tags.some(t => t.toLowerCase().includes(bankSearch.toLowerCase()))) return false;
    return true;
  });

  useEffect(() => {
    // Keep each step entry anchored at the top of the right pane.
    if (mainScrollRef.current) {
      mainScrollRef.current.scrollTo({ top: 0, behavior: 'auto' });
    }
  }, [step]);

  const DERIVE_MODES = [
    { id: 'variation',  label: 'Variation',  desc: 'Similar questions with different parameters' },
    { id: 'extension',  label: 'Extension',  desc: 'Deeper / follow-up questions on the same topic' },
    { id: 'contrast',   label: 'Contrast',   desc: 'Common misconception traps & distractors' },
  ] as const;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 48px)', overflow: 'hidden', background: '#fafafa' }}>

      {/* Top: Generation Wizard — flat horizontal stepper */}
      <div style={{ borderBottom: '1px solid #e5e7eb', background: '#fff', padding: '12px 20px 10px' }}>
        <div style={{ width: '100%', maxWidth: '980px', margin: '0 auto', overflowX: 'auto' }}>
          <div style={{ fontSize: '11px', fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: '10px' }}>Generation Wizard</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'nowrap' }}>
            {(sourceTab === 'questions' ? [
              { n: 1, label: 'Choose Source',     matchStep: 1, total: 2 },
              { n: 2, label: 'Generate & Review', matchStep: 3, total: 2 },
            ] : [
              { n: 1, label: 'Choose Source',       matchStep: 1, total: 3 },
              { n: 2, label: 'Configure Questions', matchStep: 2, total: 3 },
              { n: 3, label: 'Generate & Review',   matchStep: 3, total: 3 },
            ]).map((s, idx, arr) => (
              <Fragment key={s.n}>
                <button
                  type="button"
                  onClick={step > s.matchStep ? () => setStep(s.matchStep) : undefined}
                  style={{
                    display: 'inline-flex', alignItems: 'center', gap: '6px',
                    padding: '6px 4px 8px',
                    border: 'none',
                    background: 'transparent',
                    borderBottom: step === s.matchStep ? '2px solid #111827' : '2px solid transparent',
                    color: step === s.matchStep ? '#111827' : step > s.matchStep ? '#4b5563' : '#9ca3af',
                    cursor: step > s.matchStep ? 'pointer' : 'default',
                    fontSize: '12px', fontWeight: step === s.matchStep ? 600 : 500,
                    whiteSpace: 'nowrap',
                  }}
                >
                  <span style={{
                    width: '20px', height: '20px', borderRadius: '50%',
                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                    border: `1px solid ${step === s.matchStep ? '#111827' : step > s.matchStep ? '#d1d5db' : '#e5e7eb'}`,
                    background: step > s.matchStep ? '#f9fafb' : '#fff',
                    color: step === s.matchStep ? '#111827' : step > s.matchStep ? '#374151' : '#9ca3af',
                    fontSize: '10px', fontWeight: 700,
                  }}>
                    {step > s.matchStep ? <Check size={11} strokeWidth={2.5} /> : s.n}
                  </span>
                  {s.label}
                </button>
                {idx < arr.length - 1 && (
                  <ChevronRight size={14} style={{ color: '#d1d5db', flexShrink: 0 }} aria-hidden />
                )}
              </Fragment>
            ))}
          </div>
        </div>
      </div>

      {/* Main content */}
      <div ref={mainScrollRef} style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden', padding: '16px 20px', minWidth: 0, display: 'flex', justifyContent: 'center' }}>
        <div style={{ width: '100%', maxWidth: '680px' }}>

        {/* ── STEP 1 ── */}
        {step === 1 && (
          <div>
            <h2 style={{ fontSize: '20px', fontWeight: 700, color: '#0f0f23', margin: '0 0 4px' }}>Choose Content Source</h2>
            <p style={{ fontSize: '13px', color: '#6b7280', marginBottom: '24px' }}>
              Select how you'd like to provide content for AI question generation.
            </p>

            {/* Source tabs — single row */}
            <div style={{ display: 'flex', gap: '8px', marginBottom: '16px', flexWrap: 'wrap' }}>
              {SOURCE_TABS.map(tab => {
                const Icon = tab.icon;
                const isActive = sourceTab === tab.id;
                return (
                  <button key={tab.id} onClick={() => setSourceTab(tab.id)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: '6px',
                      padding: '7px 10px', borderRadius: '6px', cursor: 'pointer',
                      border: `1px solid ${isActive ? '#d1d5db' : '#e5e7eb'}`,
                      background: '#fff',
                      color: isActive ? '#111827' : '#6b7280',
                      fontSize: '12px', fontWeight: isActive ? 600 : 500,
                      transition: 'all 0.12s', whiteSpace: 'nowrap', flexShrink: 0,
                    }}>
                    <Icon size={14} />
                    {tab.label}
                    {tab.badge && (
                      <span style={{ fontSize: '9px', fontWeight: 700, padding: '1px 5px', borderRadius: '4px', background: '#7c3aed', color: '#fff' }}>
                        {tab.badge}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>

            {/* ── Upload ── */}
            {sourceTab === 'upload' && (
              <div>
                <input ref={fileRef} type="file" accept=".pdf,.doc,.docx,.ppt,.pptx,.png,.jpg,.jpeg" onChange={handleFileChange} style={{ display: 'none' }} />
                {!uploadedFile ? (
                  <div
                    onDragOver={e => { e.preventDefault(); setIsDragging(true); }}
                    onDragLeave={() => setIsDragging(false)}
                    onDrop={handleDrop}
                    onClick={() => fileRef.current?.click()}
                    style={{
                      border: `1px dashed ${isDragging ? '#9ca3af' : '#d1d5db'}`,
                      borderRadius: '12px', padding: '36px 24px',
                      textAlign: 'center', cursor: 'pointer',
                      background: isDragging ? '#f9fafb' : '#fff',
                      transition: 'all 0.15s',
                    }}>
                    <div style={{ width: '52px', height: '52px', borderRadius: '14px', background: isDragging ? '#3b5bdb' : '#e8eaed', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px', transition: 'all 0.15s' }}>
                      <Upload size={22} style={{ color: isDragging ? '#fff' : '#9ca3af' }} />
                    </div>
                    <div style={{ fontSize: '16px', fontWeight: 600, color: '#0f0f23', marginBottom: '6px' }}>
                      Drop your file here, or <span style={{ color: '#3b5bdb' }}>browse</span>
                    </div>
                    <div style={{ fontSize: '12px', color: '#9ca3af' }}>Supports PDF, Word, PowerPoint, PNG, JPG — up to 50 MB</div>
                  </div>
                ) : (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '14px', padding: '18px 20px', borderRadius: '12px', border: '1.5px solid #3b5bdb', background: '#eff6ff' }}>
                    <div style={{ width: '40px', height: '40px', borderRadius: '10px', background: '#3b5bdb', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      <FileText size={18} style={{ color: '#fff' }} />
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: '14px', fontWeight: 600, color: '#0f0f23' }}>{uploadedFile.name}</div>
                      <div style={{ fontSize: '12px', color: '#6b7280' }}>{fmtSize(uploadedFile.size)}</div>
                    </div>
                    <button onClick={() => setUploadedFile(null)} style={{ width: '28px', height: '28px', borderRadius: '7px', border: '1px solid #d1d5db', background: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#6b7280' }}>
                      <X size={13} />
                    </button>
                  </div>
                )}
                <div style={{ marginTop: '14px', display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <div style={{ flex: 1, height: '1px', background: '#e8eaed' }} />
                  <span style={{ fontSize: '11px', color: '#9ca3af' }}>or try a sample</span>
                  <div style={{ flex: 1, height: '1px', background: '#e8eaed' }} />
                </div>
                <div style={{ display: 'flex', gap: '8px', marginTop: '10px', flexWrap: 'wrap' }}>
                  {[
                    'WFN_19-20 Economics Paper 2.pdf',
                    'Ch.3 Photosynthesis.pdf',
                    "Newton's Laws.docx",
                    'Quadratic Functions.pdf',
                  ].map(f => (
                    <button
                      key={f}
                      onClick={() => setUploadedFile({ name: f, size: Math.floor(Math.random() * 500000 + 50000), extractedText: '' })}
                      style={{
                        padding: '5px 12px',
                        borderRadius: '20px',
                        border: '1px solid #e8eaed',
                        background: '#fff',
                        fontSize: '12px',
                        color: '#374151',
                        cursor: 'pointer',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '6px',
                      }}
                    >
                      <FileText size={13} style={{ color: '#9ca3af', flexShrink: 0 }} />
                      {f}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* ── Text ── */}
            {sourceTab === 'text' && (
              <div>
                <textarea
                  value={textInput} onChange={e => setTextInput(e.target.value)}
                  placeholder={`Paste your text content here — lecture notes, article, textbook excerpt, etc. (at least ${TEXT_SOURCE_MIN_CHARS} characters)...`}
                  rows={12}
                  style={{ width: '100%', boxSizing: 'border-box', padding: '14px 16px', border: '1.5px solid #e8eaed', borderRadius: '12px', fontSize: '13px', color: '#374151', lineHeight: 1.7, outline: 'none', resize: 'vertical', fontFamily: 'inherit' }}
                  onFocus={e => { e.currentTarget.style.borderColor = '#3b5bdb'; }}
                  onBlur={e => { e.currentTarget.style.borderColor = '#e8eaed'; }}
                />
                <div style={{ marginTop: '6px', fontSize: '11px', color: '#9ca3af', textAlign: 'right', display: 'flex', justifyContent: 'flex-end', flexWrap: 'wrap', gap: '6px' }}>
                  <span>{textInput.length} characters</span>
                  {textInput.trim().length < TEXT_SOURCE_MIN_CHARS && (
                    <span style={{ color: '#b45309' }}>· At least {TEXT_SOURCE_MIN_CHARS - textInput.trim().length} more characters are required to continue</span>
                  )}
                </div>
              </div>
            )}

            {/* ── Textbook ── */}
            {sourceTab === 'textbook' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>

                {/* ── Step A: 四项下拉 Publisher / Grade / Subject / Semester ── */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                  <SelectField label="Publisher" options={PUBLISHERS}                       placeholder="Select publisher"  value={tbPublisher} onChange={v => { setTbPublisher(v); tbResetAll(); }} />
                  <SelectField label="Grade"     options={GRADES}                           placeholder="Select grade"      value={tbGrade}     onChange={v => { setTbGrade(v);     tbResetAll(); }} />
                  <SelectField label="Subject"   options={SUBJECTS}                         placeholder="Select subject"    value={tbSubject}   onChange={v => { setTbSubject(v);   tbResetAll(); }} />
                  <SelectField label="Semester"  options={['Vol.1 · Volume 1', 'Vol.2 · Volume 2']} placeholder="Select semester"   value={tbSemester}  onChange={v => { setTbSemester(v);  tbResetEdition(); }} />
                </div>

                {/* ── Step B: 教材版本选择 ── */}
                {tbSubject && tbSemester && (() => {
                  const semKey = tbSemester.startsWith('Vol.1') ? 'Vol.1' : 'Vol.2';
                  const editions = getTbEditions(tbPublisher || "PEP (People's Education Press)", tbGrade || 'Grade 7', tbSubject, semKey);
                  return (
                    <div style={{ background: '#fff', border: '1px solid #e8eaed', borderRadius: '12px', padding: '18px 20px' }}>
                      <div style={{ fontSize: '13px', fontWeight: 600, color: '#374151', marginBottom: '4px' }}>Textbook Edition</div>
                      <div style={{ fontSize: '12px', color: '#9ca3af', marginBottom: '14px' }}>Select the specific textbook edition you use</div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                        {editions.map(ed => {
                          const active = tbEdition === ed.id;
                          return (
                            <button
                              key={ed.id}
                              onClick={() => { setTbEdition(ed.id); tbResetDeep(); }}
                              style={{
                                display: 'flex', alignItems: 'center', gap: '14px',
                                padding: '14px 16px', borderRadius: '10px', cursor: 'pointer', textAlign: 'left',
                                border: `1.5px solid ${active ? ed.color : '#e8eaed'}`,
                                background: active ? `${ed.color}0d` : '#fafafa',
                                boxShadow: active ? `0 0 0 3px ${ed.color}22` : 'none',
                                transition: 'all 0.14s', outline: 'none',
                              }}
                            >
                              {/* Book spine */}
                              <div style={{
                                width: '8px', alignSelf: 'stretch', borderRadius: '4px',
                                background: ed.color, flexShrink: 0, minHeight: '44px',
                              }} />
                              {/* Book icon */}
                              <div style={{
                                width: '40px', height: '52px', borderRadius: '6px', flexShrink: 0,
                                background: `${ed.color}18`,
                                border: `1.5px solid ${ed.color}33`,
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                              }}>
                                <BookOpen size={18} style={{ color: ed.color }} />
                              </div>
                              {/* Text */}
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ fontSize: '14px', fontWeight: 700, color: active ? ed.color : '#111827', marginBottom: '3px' }}>
                                  {ed.name}
                                </div>
                                <div style={{ fontSize: '12px', color: '#6b7280', marginBottom: '6px' }}>
                                  {ed.subtitle}
                                </div>
                                <span style={{
                                  display: 'inline-block', padding: '2px 8px', borderRadius: '20px',
                                  background: active ? `${ed.color}18` : '#f3f4f6',
                                  color: active ? ed.color : '#9ca3af',
                                  fontSize: '11px', fontWeight: 500,
                                }}>
                                  {ed.year}
                                </span>
                              </div>
                              {/* Selected check */}
                              {active && (
                                <div style={{
                                  width: '22px', height: '22px', borderRadius: '50%',
                                  background: ed.color, display: 'flex', alignItems: 'center',
                                  justifyContent: 'center', flexShrink: 0,
                                }}>
                                  <Check size={12} style={{ color: '#fff', strokeWidth: 3 }} />
                                </div>
                              )}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  );
                })()}

                {/* ── Step D: Chapter selector — shown once edition is picked ── */}
                {tbEdition && tbChapters.length > 0 && (
                  <div style={{ border: '1px solid #e8eaed', borderRadius: '12px', overflow: 'hidden', background: '#fff' }}>
                    {/* Header */}
                    <div style={{ padding: '16px 20px', borderBottom: '1px solid #f0f2f5' }}>
                      <div style={{ fontSize: '15px', fontWeight: 700, color: '#0f0f23', marginBottom: '2px' }}>Select Practice Content</div>
                      <div style={{ fontSize: '12px', color: '#9ca3af' }}>
                        {selectedSections.size > 0
                          ? `${selectedSections.size} knowledge point(s) selected · click chapters or tags to select individually`
                          : 'Click a chapter checkbox to select all in that chapter, or click tags to select individual knowledge points'}
                      </div>
                    </div>

                    {/* Chapter rows */}
                    <div style={{ maxHeight: '360px', overflowY: 'auto' }}>
                      {tbChapters.map((ch, idx) => {
                        const anySel   = tbChapterSelected(ch.id, ch.sections);
                        const allSel   = tbChapterAllSelected(ch.id, ch.sections);
                        const isLast   = idx === tbChapters.length - 1;
                        return (
                          <div
                            key={ch.id}
                            style={{
                              padding: '16px 20px',
                              borderBottom: isLast ? 'none' : '1px solid #f0f2f5',
                              background: anySel ? '#fafbff' : '#fff',
                              transition: 'background 0.12s',
                            }}
                          >
                            {/* Unit row */}
                            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '10px' }}>
                              {/* Checkbox */}
                              <button
                                onClick={() => toggleTbChapter(ch.id, ch.sections)}
                                style={{
                                  flexShrink: 0, width: '18px', height: '18px', borderRadius: '5px',
                                  border: `2px solid ${allSel ? '#3b5bdb' : anySel ? '#3b5bdb' : '#d1d5db'}`,
                                  background: allSel ? '#3b5bdb' : 'transparent',
                                  cursor: 'pointer', display: 'flex', alignItems: 'center',
                                  justifyContent: 'center', outline: 'none', padding: 0,
                                  transition: 'all 0.15s',
                                }}
                                aria-label={`Select all sections in ${ch.title}`}
                              >
                                {allSel && <Check size={11} style={{ color: '#fff', strokeWidth: 3 }} />}
                                {anySel && !allSel && (
                                  <div style={{ width: '8px', height: '2px', background: '#3b5bdb', borderRadius: '1px' }} />
                                )}
                              </button>
                              {/* Unit title */}
                              <span style={{ fontSize: '15px', fontWeight: 600, color: anySel ? '#1e3a8a' : '#111827' }}>
                                {ch.title}
                              </span>
                            </div>

                            {/* Section tags */}
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '7px', paddingLeft: '30px' }}>
                              {ch.sections.map(sec => {
                                const active = selectedSections.has(tbSecKey(ch.id, sec));
                                return (
                                  <button
                                    key={sec}
                                    onClick={() => toggleTbSection(ch.id, sec)}
                                    style={{
                                      padding: '4px 12px', borderRadius: '20px', cursor: 'pointer',
                                      border: `1px solid ${active ? '#3b5bdb' : '#e8eaed'}`,
                                      background: active ? '#eff6ff' : '#fff',
                                      color: active ? '#3b5bdb' : '#4b5563',
                                      fontSize: '12px', fontWeight: active ? 600 : 400,
                                      transition: 'all 0.12s', outline: 'none',
                                      whiteSpace: 'nowrap',
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

                    {/* Footer summary */}
                    {selectedSections.size > 0 && (
                      <div style={{
                        padding: '12px 20px', borderTop: '1px solid #dbe4ff',
                        background: '#f0f4ff', display: 'flex', alignItems: 'center',
                        justifyContent: 'space-between',
                      }}>
                        <span style={{ fontSize: '13px', fontWeight: 600, color: '#3b5bdb' }}>
                          {selectedSections.size} knowledge point(s) selected
                          {Array.from(new Set([...selectedSections].map((k: string) => k.split('::')[0]))).length > 0 &&
                            ` · across ${Array.from(new Set([...selectedSections].map((k: string) => k.split('::')[0]))).length} chapter(s)`}
                        </span>
                        <button
                          onClick={() => setSelectedSections(new Set())}
                          style={{ fontSize: '12px', color: '#6b7280', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
                        >
                          Clear all
                        </button>
                      </div>
                    )}
                  </div>
                )}

                {/* Empty state prompt */}
                {!tbSubject && (
                  <div style={{ padding: '20px 16px', background: '#f9fafb', border: '1px dashed #d1d5db', borderRadius: '10px', fontSize: '13px', color: '#9ca3af', textAlign: 'center', lineHeight: 1.8 }}>
                    <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '8px' }}>
                      <BookOpen size={22} style={{ color: '#d1d5db' }} />
                    </div>
                    Please select publisher, grade, subject, and semester first, then choose a textbook edition
                  </div>
                )}

                {/* Copyright notice */}
                <div style={{ padding: '11px 14px', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: '8px', fontSize: '12px', color: '#92400e', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <AlertCircle size={13} style={{ flexShrink: 0 }} /> Textbook content is subject to copyright. AI will use summary references only.
                </div>
              </div>
            )}

            {/* ── Exam Paper ── */}
            {sourceTab === 'exam' && (
              <div>

                {/* ── Generation Mode ── */}
                <div style={{ marginBottom: '20px' }}>
                  <div style={{ fontSize: '13px', fontWeight: 600, color: '#374151', marginBottom: '10px' }}>
                    Generation Mode
                  </div>
                  <div style={{ display: 'flex', gap: '12px' }}>
                    {([
                      {
                        id: 'error-questions' as ExamGenMode,
                        Icon: PenLine,
                        label: 'Error-Based Questions',
                        labelEn: 'Error-Based Questions',
                        desc: 'Generate targeted review questions from mistakes in graded exam papers',
                        descEn: 'Generate targeted review questions from a graded exam with marked mistakes',
                        color: '#dc2626',
                        activeBorder: '#fca5a5',
                        activeBg: '#fff5f5',
                        iconBg: 'linear-gradient(135deg,#dc2626,#f87171)',
                      },
                      {
                        id: 'simulation' as ExamGenMode,
                        Icon: Copy,
                        label: 'Question Simulation',
                        labelEn: 'Question Simulation',
                        desc: 'Generate similar questions based on the structure of a blank exam paper',
                        descEn: 'Generate similar questions mirroring the structure of a blank exam paper',
                        color: '#0891b2',
                        activeBorder: '#67e8f9',
                        activeBg: '#ecfeff',
                        iconBg: 'linear-gradient(135deg,#0891b2,#22d3ee)',
                      },
                    ]).map(m => {
                      const active = examGenMode === m.id;
                      return (
                        <button
                          key={m.id}
                          onClick={() => setExamGenMode(m.id)}
                          style={{
                            flex: 1, padding: '16px 18px', borderRadius: '14px',
                            cursor: 'pointer', textAlign: 'left',
                            border: `1.5px solid ${active ? m.activeBorder : '#e8eaed'}`,
                            background: active ? m.activeBg : '#fafafa',
                            boxShadow: active ? `0 0 0 3px ${m.activeBorder}55` : 'none',
                            transition: 'all 0.14s', outline: 'none',
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', marginBottom: '8px' }}>
                            <div style={{
                              width: '36px', height: '36px', borderRadius: '10px', flexShrink: 0,
                              background: active ? m.iconBg : '#e8eaed',
                              display: 'flex', alignItems: 'center', justifyContent: 'center',
                              transition: 'background 0.14s',
                            }}>
                              <m.Icon size={17} style={{ color: active ? '#fff' : '#9ca3af' }} />
                            </div>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ fontSize: '14px', fontWeight: 700, color: active ? m.color : '#374151', lineHeight: 1.25 }}>
                                {m.label}
                              </div>
                              <div style={{ fontSize: '11px', color: active ? m.color : '#9ca3af', fontWeight: 500 }}>
                                {m.labelEn}
                              </div>
                            </div>
                            {active && (
                              <div style={{
                                width: '20px', height: '20px', borderRadius: '50%',
                                background: m.color, display: 'flex', alignItems: 'center',
                                justifyContent: 'center', flexShrink: 0, marginTop: '1px',
                              }}>
                                <Check size={11} style={{ color: '#fff' }} strokeWidth={2.5} />
                              </div>
                            )}
                          </div>
                          <div style={{ paddingLeft: '46px' }}>
                            <p style={{ margin: '0 0 2px', fontSize: '12px', color: active ? m.color : '#6b7280', lineHeight: 1.5, opacity: active ? 0.85 : 1 }}>
                              {m.desc}
                            </p>
                            <p style={{ margin: 0, fontSize: '11px', color: '#9ca3af', lineHeight: 1.4 }}>
                              {m.descEn}
                            </p>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Tip banner (upload only — no camera scan) */}
                <div style={{ padding: '11px 14px', borderRadius: '9px', background: '#fffbeb', border: '1px solid #fde68a', marginBottom: '20px', display: 'flex', alignItems: 'flex-start', gap: '8px' }}>
                  <AlertCircle size={13} style={{ color: '#d97706', flexShrink: 0, marginTop: '1px' }} />
                  <span style={{ fontSize: '12px', color: '#92400e', lineHeight: 1.6 }}>
                    <strong>Tip: </strong>
                    Upload up to 5 images (JPG, PNG) or a single PDF. Max 10 MB per file. AI will extract all questions automatically.
                  </span>
                </div>

                {/* ── Upload exam paper ── */}
                <div>
                    <input ref={examFileRef} type="file" accept=".pdf,.png,.jpg,.jpeg" multiple onChange={e => handleExamFiles(e.target.files)} style={{ display:'none' }}/>
                    {/* Drop zone */}
                    <div
                      onDragOver={e => { e.preventDefault(); setExamDragging(true); }}
                      onDragLeave={() => setExamDragging(false)}
                      onDrop={e => { e.preventDefault(); setExamDragging(false); handleExamFiles(e.dataTransfer.files); }}
                      onClick={() => examFileRef.current?.click()}
                      style={{
                        border:`2px dashed ${examDragging?'#3b5bdb':examFiles.length>0?'#bfdbfe':'#d1d5db'}`,
                        borderRadius:'16px', padding:'48px 40px', textAlign:'center', cursor:'pointer',
                        background: examDragging?'#eff6ff':examFiles.length>0?'#f8faff':'#fafafa',
                        transition:'all 0.15s',
                      }}>
                      <div style={{ width:'56px', height:'56px', borderRadius:'14px', margin:'0 auto 14px', background:examDragging?'#3b5bdb':'linear-gradient(135deg,#dbeafe,#bfdbfe)', display:'flex', alignItems:'center', justifyContent:'center', transition:'background 0.15s' }}>
                        <Upload size={24} style={{ color:examDragging?'#fff':'#3b5bdb' }}/>
                      </div>
                      <div style={{ fontSize:'15px', fontWeight:700, color:'#0f0f23', marginBottom:'5px' }}>
                        {examDragging ? 'Drop files here' : 'Click to upload or drag & drop'}
                      </div>
                      <div style={{ fontSize:'12px', color:'#9ca3af', marginBottom:'5px' }}>Supports JPG, PNG, PDF · Max 10 MB per file</div>
                      <div style={{ fontSize:'11px', color:examFiles.length>0?'#3b5bdb':'#c4b5fd', fontWeight:600 }}>{examFiles.length} / 5 files</div>
                    </div>

                    {/* File list */}
                    {examFiles.length > 0 && (
                      <div style={{ marginTop:'14px', display:'flex', flexDirection:'column', gap:'6px' }}>
                        {examFiles.map((f,i) => (
                          <div key={i} style={{ display:'flex', alignItems:'center', gap:'10px', padding:'10px 13px', borderRadius:'10px', border:'1px solid #e8eaed', background:'#fff' }}>
                            <div style={{ width:'36px', height:'36px', borderRadius:'9px', flexShrink:0, overflow:'hidden', border:'1px solid #e8eaed', background:'#f3f4f6', display:'flex', alignItems:'center', justifyContent:'center' }}>
                              {f.url
                                ? <img src={f.url} alt="" style={{ width:'100%', height:'100%', objectFit:'cover' }}/>
                                : <FileText size={16} style={{ color:'#9ca3af' }}/>
                              }
                            </div>
                            <div style={{ flex:1, minWidth:0 }}>
                              <div style={{ fontSize:'13px', fontWeight:600, color:'#0f0f23', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{f.name}</div>
                              <div style={{ fontSize:'11px', color:'#9ca3af' }}>{fmtSize(f.size)}</div>
                            </div>
                            <span style={{ fontSize:'10px', padding:'2px 8px', borderRadius:'20px', background:'#dcfce7', color:'#15803d', fontWeight:600, flexShrink:0, display:'inline-flex', alignItems:'center', gap:'3px' }}><Check size={10} strokeWidth={3} />Ready</span>
                            <button onClick={e => { e.stopPropagation(); removeExamFile(i); }} style={{ width:'28px', height:'28px', borderRadius:'7px', border:'1px solid #fecaca', background:'#fff', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', color:'#ef4444', flexShrink:0 }}>
                              <Trash2 size={12}/>
                            </button>
                          </div>
                        ))}
                        {examFiles.length < 5 && (
                          <button onClick={e => { e.stopPropagation(); examFileRef.current?.click(); }}
                            style={{ width:'100%', padding:'9px', borderRadius:'9px', border:'1.5px dashed #bfdbfe', background:'transparent', color:'#3b5bdb', fontSize:'12px', fontWeight:600, cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', gap:'6px' }}>
                            <Plus size={13}/> Add More Files
                          </button>
                        )}
                      </div>
                    )}
                  </div>
              </div>
            )}

            {/* ── From Questions (以题生题) ── */}
            {sourceTab === 'questions' && (
              <div>
                {/* Explainer banner */}
                <div style={{ padding: '13px 16px', background: 'linear-gradient(135deg, #f5f3ff, #ede9fe)', border: '1px solid #c4b5fd', borderRadius: '12px', marginBottom: '16px', display: 'flex', gap: '12px', alignItems: 'flex-start' }}>
                  <Layers size={17} style={{ color: '#7c3aed', flexShrink: 0, marginTop: '1px' }} />
                  <div>
                    <div style={{ fontSize: '13px', fontWeight: 600, color: '#4c1d95', marginBottom: '2px' }}>Generate from Existing Questions</div>
                    <div style={{ fontSize: '12px', color: '#6d28d9', lineHeight: 1.6 }}>
                      Paste questions or pick directly from your Question Bank. AI analyses their structure and cognitive level to generate a fresh related set.
                    </div>
                  </div>
                </div>

                {/* Input mode toggle */}
                <div style={{ display: 'flex', gap: '0', marginBottom: '16px', border: '1.5px solid #e8eaed', borderRadius: '10px', overflow: 'hidden', width: 'fit-content' }}>
                  {([
                    { id: 'paste' as const, icon: AlignLeft, label: 'Paste Questions' },
                    { id: 'bank'  as const, icon: Library,   label: 'Pick from Question Bank' },
                  ]).map((m, i) => (
                    <button key={m.id} onClick={() => setQInputMode(m.id)}
                      style={{
                        display: 'flex', alignItems: 'center', gap: '7px',
                        padding: '9px 18px', border: 'none', cursor: 'pointer',
                        borderLeft: i > 0 ? '1.5px solid #e8eaed' : 'none',
                        background: qInputMode === m.id ? '#f5f3ff' : '#fff',
                        color: qInputMode === m.id ? '#6d28d9' : '#6b7280',
                        fontSize: '13px', fontWeight: qInputMode === m.id ? 600 : 400,
                        transition: 'all 0.12s',
                      }}>
                      <m.icon size={14} /> {m.label}
                    </button>
                  ))}
                </div>

                {/* Derive mode selector */}
                <div style={{ marginBottom: '16px' }}>
                  <div style={{ fontSize: '13px', fontWeight: 600, color: '#374151', marginBottom: '10px' }}>Derivation Style</div>
                  <div style={{ display: 'flex', gap: '10px' }}>
                    {DERIVE_MODES.map(m => (
                      <button key={m.id} onClick={() => setDeriveMode(m.id)}
                        style={{
                          flex: 1, padding: '12px 10px', borderRadius: '10px', cursor: 'pointer', textAlign: 'left',
                          border: `1.5px solid ${deriveMode === m.id ? '#7c3aed' : '#e8eaed'}`,
                          background: deriveMode === m.id ? '#f5f3ff' : '#fff',
                          transition: 'all 0.12s',
                        }}>
                        <div style={{ fontSize: '13px', fontWeight: 600, color: deriveMode === m.id ? '#6d28d9' : '#374151', marginBottom: '3px' }}>{m.label}</div>
                        <div style={{ fontSize: '11px', color: '#9ca3af', lineHeight: 1.4 }}>{m.desc}</div>
                      </button>
                    ))}
                  </div>
                </div>

                {/* ── Paste mode ── */}
                {qInputMode === 'paste' && (
                  <div>
                    <textarea
                      value={pastedQuestions} onChange={e => setPastedQuestions(e.target.value)}
                      placeholder={"Example:\n1. What is Newton's Second Law of Motion?\n   A. F = mv   B. F = ma   C. F = m/a   D. F = v/t\n\n2. True or False: An object in motion stays in motion unless acted upon by an external force.\n\nAny format accepted — AI will parse the structure automatically."}
                      rows={9}
                      style={{ width: '100%', boxSizing: 'border-box', padding: '14px 16px', border: '1.5px solid #e8eaed', borderRadius: '12px', fontSize: '13px', color: '#374151', lineHeight: 1.7, outline: 'none', resize: 'vertical', fontFamily: 'inherit' }}
                      onFocus={e => { e.currentTarget.style.borderColor = '#7c3aed'; }}
                      onBlur={e => { e.currentTarget.style.borderColor = '#e8eaed'; }}
                    />
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '6px', marginBottom: '12px' }}>
                      <span style={{ fontSize: '11px', color: '#9ca3af' }}>Any format accepted — AI will parse the structure automatically</span>
                      <span style={{ fontSize: '11px', color: '#9ca3af' }}>{pastedQuestions.length} chars</span>
                    </div>
                    <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                      {[
                        { label: "Newton's Laws (Physics)", text: "1. State Newton's Second Law of Motion.\n2. True/False: Force and acceleration are inversely proportional.\n3. A 10 kg block accelerates at 2 m/s². What is the net force?" },
                        { label: 'Photosynthesis (Biology)', text: "1. Where do the light-dependent reactions occur in the chloroplast?\n   A. Stroma  B. Thylakoid membrane  C. Outer membrane  D. Matrix\n2. What gas is released as a by-product of photosynthesis?" },
                      ].map(s => (
                        <button key={s.label} onClick={() => setPastedQuestions(s.text)}
                          style={{ padding: '6px 14px', borderRadius: '20px', border: '1px solid #e8eaed', background: '#fff', fontSize: '12px', color: '#374151', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                          <PenLine size={13} style={{ color: '#9ca3af', flexShrink: 0 }} />{s.label}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* ── Question Bank picker ── */}
                {qInputMode === 'bank' && (
                  <div>
                    {/* Filter bar */}
                    <div style={{ display: 'flex', gap: '8px', marginBottom: '10px', alignItems: 'center' }}>
                      <div style={{ position: 'relative', flex: 1 }}>
                        <Search size={13} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: '#9ca3af' }} />
                        <input value={bankSearch} onChange={e => setBankSearch(e.target.value)}
                          placeholder="Search questions or tags…"
                          style={{ width: '100%', boxSizing: 'border-box', padding: '8px 10px 8px 32px', border: '1px solid #e8eaed', borderRadius: '8px', fontSize: '13px', outline: 'none' }}
                          onFocus={e => { e.currentTarget.style.borderColor = '#7c3aed'; }}
                          onBlur={e => { e.currentTarget.style.borderColor = '#e8eaed'; }}
                        />
                      </div>
                      <CustomSelect options={BANK_SUBJECTS} value={bankSubject} onChange={setBankSubject} minWidth={130} />
                      <CustomSelect options={BANK_TYPES} value={bankType} onChange={setBankType} minWidth={130} />
                      {selectedBankIds.size > 0 && (
                        <button onClick={() => setSelectedBankIds(new Set())}
                          style={{ padding: '7px 12px', borderRadius: '8px', border: '1px solid #fca5a5', background: '#fef2f2', color: '#dc2626', fontSize: '12px', cursor: 'pointer', whiteSpace: 'nowrap' }}>
                          Clear ({selectedBankIds.size})
                        </button>
                      )}
                    </div>

                    {/* Question list */}
                    <div style={{ border: '1px solid #e8eaed', borderRadius: '12px', overflow: 'hidden', maxHeight: '320px', overflowY: 'auto' }}>
                      {filteredBank.length === 0 ? (
                        <div style={{ padding: '32px', textAlign: 'center', color: '#9ca3af', fontSize: '13px' }}>No questions match your filters.</div>
                      ) : filteredBank.map((bq, i) => {
                        const isSelected = selectedBankIds.has(bq.id);
                        const dc = DIFFICULTY_COLORS[bq.difficulty];
                        return (
                          <div key={bq.id}
                            onClick={() => {
                              setSelectedBankIds(prev => {
                                const next = new Set(prev);
                                next.has(bq.id) ? next.delete(bq.id) : next.add(bq.id);
                                return next;
                              });
                            }}
                            style={{
                              display: 'flex', alignItems: 'flex-start', gap: '12px',
                              padding: '12px 16px', cursor: 'pointer',
                              borderBottom: i < filteredBank.length - 1 ? '1px solid #f0f2f5' : 'none',
                              background: isSelected ? '#f5f3ff' : '#fff',
                              transition: 'background 0.12s',
                            }}
                            onMouseEnter={e => { if (!isSelected) (e.currentTarget as HTMLElement).style.background = '#fafafa'; }}
                            onMouseLeave={e => { if (!isSelected) (e.currentTarget as HTMLElement).style.background = '#fff'; }}
                          >
                            {/* Checkbox */}
                            <div style={{ width: '18px', height: '18px', borderRadius: '5px', flexShrink: 0, marginTop: '2px', border: `2px solid ${isSelected ? '#7c3aed' : '#d1d5db'}`, background: isSelected ? '#7c3aed' : '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.15s' }}>
                              {isSelected && <Check size={10} style={{ color: '#fff', strokeWidth: 3 }} />}
                            </div>
                            {/* Content */}
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ fontSize: '13px', color: '#0f0f23', lineHeight: 1.5, marginBottom: '6px' }}>{bq.prompt}</div>
                              <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', alignItems: 'center' }}>
                                <span style={{ fontSize: '10px', fontWeight: 600, padding: '2px 7px', borderRadius: '5px', background: '#f3f4f6', color: '#6b7280' }}>{bq.type}</span>
                                <span style={{ fontSize: '10px', fontWeight: 600, padding: '2px 7px', borderRadius: '5px', background: dc.bg, color: dc.color }}>{bq.difficulty}</span>
                                <span style={{ fontSize: '10px', color: '#9ca3af' }}>{bq.subject} · {bq.grade}</span>
                                {bq.tags.slice(0, 2).map(t => (
                                  <span key={t} style={{ fontSize: '10px', padding: '2px 7px', borderRadius: '5px', background: '#f5f3ff', color: '#7c3aed' }}>#{t}</span>
                                ))}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    {/* Selected summary / select-all */}
                    <div style={{ marginTop: '10px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <button onClick={() => setSelectedBankIds(new Set(filteredBank.map(q => q.id)))}
                        style={{ fontSize: '12px', color: '#7c3aed', border: '1px solid #c4b5fd', background: '#f5f3ff', padding: '5px 12px', borderRadius: '7px', cursor: 'pointer' }}>
                        Select all ({filteredBank.length})
                      </button>
                      {selectedBankIds.size > 0 && (
                        <div style={{ flex: 1, padding: '8px 14px', background: '#f5f3ff', border: '1px solid #c4b5fd', borderRadius: '8px', display: 'flex', alignItems: 'center', gap: '7px' }}>
                          <CheckCircle2 size={13} style={{ color: '#7c3aed', flexShrink: 0 }} />
                          <span style={{ fontSize: '12px', color: '#5b21b6' }}>
                            <strong>{selectedBankIds.size}</strong> question{selectedBankIds.size !== 1 ? 's' : ''} selected — AI will derive new questions from these
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Footer nav */}
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '28px', paddingTop: '4px' }}>
              <button onClick={() => setStep(sourceTab === 'questions' ? 3 : 2)} disabled={!canProceedStep1()}
                style={{
                  display: 'flex', alignItems: 'center', gap: '6px',
                  padding: '10px 22px', borderRadius: '9px', border: 'none',
                  background: canProceedStep1() ? '#3b5bdb' : '#e8eaed',
                  color: canProceedStep1() ? '#fff' : '#9ca3af',
                  fontSize: '14px', fontWeight: 600, cursor: canProceedStep1() ? 'pointer' : 'not-allowed',
                }}>
                Next <ChevronRight size={15} />
              </button>
            </div>
          </div>
        )}

        {/* ── STEP 2 ── */}
        {step === 2 && (
          <div>
            <h2 style={{ fontSize: '20px', fontWeight: 700, color: '#0f0f23', margin: '0 0 4px' }}>
              {sourceTab === 'exam' ? 'Customize Question Requirements' : 'Configure Questions'}
            </h2>
            <p style={{ fontSize: '13px', color: '#6b7280', marginBottom: '24px' }}>
              {sourceTab === 'exam'
                ? 'Configure matching strategy and difficulty level; AI will generate targeted questions accordingly.'
                : sourceTab === 'textbook'
                  ? 'Textbook and grade are selected in Step 1. Configure types, difficulty, and illustrations here.'
                  : 'Configure question types, difficulty, and illustrations.'}
            </p>

            {/* ── Exam Paper simplified config ── */}
            {sourceTab === 'exam' && (
              <div>
                {/* 题目匹配方式 */}
                <div style={{ background: '#fff', border: '1px solid #e8eaed', borderRadius: '12px', padding: '20px 22px', marginBottom: '16px' }}>
                  <div style={{ fontSize: '13px', fontWeight: 600, color: '#374151', marginBottom: '14px' }}>Question Matching Mode</div>
                  <div style={{ display: 'flex', gap: '12px' }}>
                    {([
                      {
                        id: 'type' as const,
                        label: 'Match Question Type',
                        desc: `Generate questions with the same type as wrong questions (5 targeted review questions per wrong question)`,
                      },
                      {
                        id: 'knowledge' as const,
                        label: 'Match Knowledge Point',
                        desc: `Target the same knowledge points with flexible question types (5 targeted review questions per wrong question)`,
                      },
                    ]).map(m => {
                      const active = examMatchMode === m.id;
                      return (
                        <button
                          key={m.id}
                          onClick={() => setExamMatchMode(m.id)}
                          style={{
                            flex: 1, padding: '18px 20px', borderRadius: '12px',
                            cursor: 'pointer', textAlign: 'center',
                            border: `1.5px solid ${active ? '#3b5bdb' : '#e8eaed'}`,
                            background: active ? '#eff6ff' : '#fff',
                            boxShadow: active ? '0 0 0 3px #bfdbfe55' : 'none',
                            transition: 'all 0.15s', outline: 'none',
                          }}
                        >
                          <div style={{ fontSize: '15px', fontWeight: 700, color: active ? '#3b5bdb' : '#374151', marginBottom: '8px' }}>
                            {m.label}
                          </div>
                          <div style={{ fontSize: '12px', color: active ? '#3b5bdb' : '#9ca3af', lineHeight: 1.6, opacity: active ? 0.85 : 1 }}>
                            {m.desc}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* 难度级别 */}
                <div style={{ background: '#fff', border: '1px solid #e8eaed', borderRadius: '12px', padding: '20px 22px', marginBottom: '28px' }}>
                  <div style={{ fontSize: '13px', fontWeight: 600, color: '#374151', marginBottom: '14px' }}>Difficulty Level</div>
                  <div style={{ display: 'flex', gap: '12px' }}>
                    {([
                      { id: 'basic' as const,    label: 'Basic', sub: 'Reinforce core concepts' },
                      { id: 'solid' as const,    label: 'Solid', sub: 'Strengthen understanding through practice' },
                      { id: 'advanced' as const, label: 'Advanced', sub: 'Challenge higher-order thinking' },
                    ]).map(d => {
                      const active = examDifficulty === d.id;
                      return (
                        <button
                          key={d.id}
                          onClick={() => setExamDifficulty(d.id)}
                          style={{
                            flex: 1, padding: '16px 12px', borderRadius: '12px',
                            cursor: 'pointer', textAlign: 'center',
                            border: `1.5px solid ${active ? '#3b5bdb' : '#e8eaed'}`,
                            background: active ? '#eff6ff' : '#fff',
                            boxShadow: active ? '0 0 0 3px #bfdbfe55' : 'none',
                            transition: 'all 0.15s', outline: 'none',
                          }}
                        >
                          <div style={{ fontSize: '15px', fontWeight: 700, color: active ? '#3b5bdb' : '#374151', marginBottom: '6px' }}>
                            {d.label}
                          </div>
                          <div style={{ fontSize: '12px', color: active ? '#3b5bdb' : '#9ca3af', opacity: active ? 0.85 : 1 }}>
                            {d.sub}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Footer nav */}
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <button onClick={() => setStep(1)}
                    style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '10px 22px', borderRadius: '9px', border: '1px solid #e8eaed', background: '#fff', color: '#374151', fontSize: '14px', cursor: 'pointer' }}>
                    <ChevronLeft size={15} /> Back
                  </button>
                  <button onClick={() => setStep(3)}
                    style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '10px 22px', borderRadius: '9px', border: 'none', background: '#3b5bdb', color: '#fff', fontSize: '14px', fontWeight: 600, cursor: 'pointer' }}>
                    Next <ChevronRight size={15} />
                  </button>
                </div>
              </div>
            )}

            {/* ── Non-exam full config ── */}
            {sourceTab !== 'exam' && (<>

            {/* Grade/subject/semester：仅教材来源在 Step 1 中选择，上传等来源不在此填写 */}

            {/* Question types */}
            <div style={{ background: '#fff', border: '1px solid #e8eaed', borderRadius: '12px', overflow: 'hidden', marginBottom: '16px' }}>
              <div style={{ fontSize: '13px', fontWeight: 600, color: '#374151', padding: '18px 22px 14px', borderBottom: '1px solid #f0f2f5' }}>
                Question Types &amp; Quantity
              </div>
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                {qTypes.map((qt, idx) => (
                  <div key={qt.key} onClick={() => toggleQType(qt.key)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: '14px',
                      padding: '16px 22px',
                      borderBottom: idx < qTypes.length - 1 ? '1px solid #f0f2f5' : 'none',
                      cursor: 'pointer',
                      background: qt.active ? '#fafbff' : '#fff',
                      transition: 'background 0.12s',
                    }}
                    onMouseEnter={e => { if (!qt.active) (e.currentTarget as HTMLElement).style.background = '#f9fafb'; }}
                    onMouseLeave={e => { if (!qt.active) (e.currentTarget as HTMLElement).style.background = '#fff'; }}
                  >
                    {/* Checkbox */}
                    <div style={{ width: '20px', height: '20px', borderRadius: '6px', flexShrink: 0, border: `2px solid ${qt.active ? '#3b5bdb' : '#d1d5db'}`, background: qt.active ? '#3b5bdb' : '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.15s' }}>
                      {qt.active && <Check size={11} style={{ color: '#fff', strokeWidth: 3 }} />}
                    </div>
                    {/* Label */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: '14px', fontWeight: 600, color: qt.active ? '#0f0f23' : '#6b7280', marginBottom: '2px', transition: 'color 0.15s' }}>{qt.label}</div>
                      <div style={{ fontSize: '12px', color: '#9ca3af', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{qt.desc}</div>
                    </div>
                    {/* Count input */}
                    {qt.active && (
                      <div onClick={e => e.stopPropagation()} style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', border: '1.5px solid #d1d5db', borderRadius: '9px', overflow: 'hidden', background: '#fff' }}>
                          <button onClick={e => { e.stopPropagation(); setQTypeCount(qt.key, qt.count - 1); }}
                            style={{ width: '34px', height: '36px', border: 'none', background: 'transparent', color: '#6b7280', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = '#f3f4f6'; }}
                            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}>
                            <Minus size={12} />
                          </button>
                          <input type="number" value={qt.count}
                            onChange={e => { e.stopPropagation(); setQTypeCount(qt.key, Number(e.target.value)); }}
                            onClick={e => e.stopPropagation()}
                            style={{ width: '52px', height: '36px', border: 'none', borderLeft: '1px solid #e8eaed', borderRight: '1px solid #e8eaed', textAlign: 'center', fontSize: '15px', fontWeight: 700, color: '#3b5bdb', background: '#fff', outline: 'none', fontFamily: 'inherit' }}
                          />
                          <button onClick={e => { e.stopPropagation(); setQTypeCount(qt.key, qt.count + 1); }}
                            style={{ width: '34px', height: '36px', border: 'none', background: 'transparent', color: '#6b7280', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = '#f3f4f6'; }}
                            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}>
                            <Plus size={12} />
                          </button>
                        </div>
                        <span style={{ fontSize: '13px', color: '#6b7280', minWidth: '18px' }}>Qs</span>
                      </div>
                    )}
                  </div>
                ))}
              </div>
              {/* Total bar */}
              <div style={{ padding: '14px 22px', background: '#f0f4ff', borderTop: '1px solid #dbe4ff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <span style={{ fontSize: '14px', fontWeight: 600, color: '#3b5bdb' }}>
                  Total Questions:&nbsp;<span style={{ fontSize: '18px', fontWeight: 800 }}>{totalQ()}</span>
                </span>
              </div>
            </div>

            {/* Difficulty */}
            <div style={{ background: '#fff', border: '1px solid #e8eaed', borderRadius: '12px', padding: '20px 22px', marginBottom: '16px' }}>
              <div style={{ fontSize: '13px', fontWeight: 600, color: '#374151', marginBottom: '12px' }}>Difficulty Level</div>
              <div style={{ display: 'flex', gap: '10px' }}>
                {(['easy', 'medium', 'hard'] as const).map(d => {
                  const dc = DIFFICULTY_COLORS[d];
                  return (
                    <button key={d} onClick={() => setDifficulty(d)}
                      style={{ flex: 1, padding: '10px', borderRadius: '9px', cursor: 'pointer', border: `1.5px solid ${difficulty === d ? dc.dot : '#e8eaed'}`, background: difficulty === d ? dc.bg : '#fff', color: difficulty === d ? dc.color : '#9ca3af', fontSize: '13px', fontWeight: difficulty === d ? 600 : 400, textTransform: 'capitalize', transition: 'all 0.12s' }}>
                      {d}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* ── Illustration Settings ── */}
            <div style={{ background: '#fff', border: `1.5px solid ${illustEnabled ? '#c4b5fd' : '#e8eaed'}`, borderRadius: '12px', overflow: 'hidden', marginBottom: '28px', transition: 'border-color 0.2s' }}>
              {/* Header row with toggle */}
              <div style={{ padding: '18px 22px', display: 'flex', alignItems: 'center', gap: '12px', cursor: 'pointer', borderBottom: illustEnabled ? '1px solid #f0f2f5' : 'none' }}
                onClick={() => setIllustEnabled(!illustEnabled)}>
                <div style={{ width: '36px', height: '36px', borderRadius: '9px', background: illustEnabled ? '#f5f3ff' : '#f3f4f6', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, transition: 'background 0.2s' }}>
                  {illustEnabled ? <Image size={17} style={{ color: '#7c3aed' }} /> : <ImageOff size={17} style={{ color: '#9ca3af' }} />}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: '14px', fontWeight: 600, color: illustEnabled ? '#4c1d95' : '#374151', transition: 'color 0.2s' }}>Question Illustrations</div>
                  <div style={{ fontSize: '12px', color: '#9ca3af', marginTop: '2px' }}>AI generates a contextual image for selected question types</div>
                </div>
                <Toggle checked={illustEnabled} onChange={setIllustEnabled} />
              </div>

              {/* Expanded settings */}
              {illustEnabled && (
                <div style={{ padding: '20px 22px', display: 'flex', flexDirection: 'column', gap: '20px' }}>

                  {/* Style picker */}
                  <div>
                    <div style={{ fontSize: '13px', fontWeight: 600, color: '#374151', marginBottom: '10px' }}>Illustration Style</div>
                    <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                      {ILLUST_STYLES.map(s => {
                        const Icon = s.icon;
                        const isActive = illustStyle === s.id;
                        return (
                          <button key={s.id} onClick={() => setIllustStyle(s.id)}
                            style={{
                              display: 'flex', alignItems: 'center', gap: '7px',
                              padding: '9px 14px', borderRadius: '10px', cursor: 'pointer',
                              border: `1.5px solid ${isActive ? s.color : '#e8eaed'}`,
                              background: isActive ? `${s.color}12` : '#fff',
                              color: isActive ? s.color : '#6b7280',
                              fontSize: '13px', fontWeight: isActive ? 600 : 400,
                              transition: 'all 0.12s',
                            }}>
                            <Icon size={14} />
                            <div style={{ textAlign: 'left' }}>
                              <div style={{ lineHeight: 1 }}>{s.label}</div>
                              <div style={{ fontSize: '10px', color: isActive ? s.color : '#9ca3af', marginTop: '2px', opacity: 0.8 }}>{s.desc}</div>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Question type selector */}
                  <div>
                    <div style={{ fontSize: '13px', fontWeight: 600, color: '#374151', marginBottom: '10px' }}>
                      Apply to Question Types
                      <span style={{ marginLeft: '8px', fontSize: '11px', fontWeight: 400, color: '#9ca3af' }}>Only active types shown</span>
                    </div>
                    <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                      {qTypes.filter(t => t.active).map(qt => {
                        const isOn = illustTypes.has(qt.key);
                        return (
                          <button key={qt.key} onClick={() => toggleIllustType(qt.key)}
                            style={{
                              display: 'flex', alignItems: 'center', gap: '7px',
                              padding: '7px 14px', borderRadius: '8px', cursor: 'pointer',
                              border: `1.5px solid ${isOn ? '#7c3aed' : '#e8eaed'}`,
                              background: isOn ? '#f5f3ff' : '#fff',
                              color: isOn ? '#6d28d9' : '#6b7280',
                              fontSize: '12px', fontWeight: isOn ? 600 : 400, transition: 'all 0.12s',
                            }}>
                            <div style={{ width: '16px', height: '16px', borderRadius: '4px', border: `2px solid ${isOn ? '#7c3aed' : '#d1d5db'}`, background: isOn ? '#7c3aed' : '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                              {isOn && <Check size={9} style={{ color: '#fff', strokeWidth: 3 }} />}
                            </div>
                            {qt.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Optional prompt */}
                  <div>
                    <div style={{ fontSize: '13px', fontWeight: 600, color: '#374151', marginBottom: '6px' }}>
                      Style Description <span style={{ fontSize: '11px', fontWeight: 400, color: '#9ca3af' }}>optional</span>
                    </div>
                    <input
                      value={illustPrompt} onChange={e => setIllustPrompt(e.target.value)}
                      placeholder='e.g. "Clean whiteboard-style scientific diagrams with labeled arrows, blue on white"'
                      style={{ width: '100%', boxSizing: 'border-box', padding: '9px 12px', border: '1px solid #e8eaed', borderRadius: '8px', fontSize: '13px', color: '#374151', outline: 'none', fontFamily: 'inherit' }}
                      onFocus={e => { e.currentTarget.style.borderColor = '#7c3aed'; }}
                      onBlur={e => { e.currentTarget.style.borderColor = '#e8eaed'; }}
                    />
                  </div>

                  {/* Info note */}
                  <div style={{ padding: '10px 14px', background: '#f5f3ff', border: '1px solid #ddd6fe', borderRadius: '8px', fontSize: '12px', color: '#5b21b6', display: 'flex', gap: '7px', alignItems: 'flex-start' }}>
                    <Sparkles size={13} style={{ flexShrink: 0, marginTop: '1px' }} />
                    Illustrations are generated after questions. Each image is tailored to its question's content. You can regenerate individual images in Step 3.
                  </div>
                </div>
              )}
            </div>

            {/* Footer nav */}
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <button onClick={() => setStep(1)}
                style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '10px 22px', borderRadius: '9px', border: '1px solid #e8eaed', background: '#fff', color: '#374151', fontSize: '14px', cursor: 'pointer' }}>
                <ChevronLeft size={15} /> Back
              </button>
              <button onClick={() => setStep(3)} disabled={!canProceedStep2()}
                style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '10px 22px', borderRadius: '9px', border: 'none', background: canProceedStep2() ? '#3b5bdb' : '#e8eaed', color: canProceedStep2() ? '#fff' : '#9ca3af', fontSize: '14px', fontWeight: 600, cursor: canProceedStep2() ? 'pointer' : 'not-allowed' }}>
                Next <ChevronRight size={15} />
              </button>
            </div>
            </>)}
          </div>
        )}

        {/* ── STEP 3 ── */}
        {step === 3 && (
          <div>
            <h2 style={{ fontSize: '20px', fontWeight: 700, color: '#0f0f23', margin: '0 0 4px' }}>Generate & Review</h2>
            <p style={{ fontSize: '13px', color: '#6b7280', marginBottom: '24px' }}>
              Confirm your configuration and let AI generate the questions{illustEnabled ? ' and illustrations' : ''}.
            </p>

            {/* Config summary — flat, no nested boxes */}
            {!genDone && (
              <div style={{ marginBottom: '24px', paddingBottom: '20px', borderBottom: '1px solid #e8eaed' }}>
                <div style={{ fontSize: '12px', fontWeight: 600, color: '#6b7280', marginBottom: '14px' }}>Summary</div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', columnGap: '20px', rowGap: '14px' }}>
                  {[
                    { label: 'Source', val: sourceTab === 'questions' ? `From Questions (${deriveMode})` : SOURCE_TABS.find(t => t.id === sourceTab)?.label ?? '—' },
                    ...(sourceTab === 'textbook'
                      ? [{ label: 'Grade & Subject', val: `${tbGrade || '—'} · ${tbSubject || '—'}` }]
                      : []),
                    { label: 'Difficulty', val: difficulty },
                    { label: 'Illustrations', val: illustEnabled ? `${ILLUST_STYLES.find(s => s.id === illustStyle)?.label} · ${illustTypes.size} type(s)` : 'Disabled' },
                    ...qTypes.filter(t => t.active).map(t => ({ label: t.label, val: `${t.count} questions` })),
                  ].map((row, i) => (
                    <div key={i} style={{ minWidth: 0 }}>
                      <div style={{ fontSize: '10px', color: '#9ca3af', marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{row.label}</div>
                      <div style={{ fontSize: '13px', fontWeight: 500, color: '#111827', lineHeight: 1.4, wordBreak: 'break-word' }}>{row.val}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Generate / progress */}
            {!genDone ? (
              generating ? (
                <div style={{ background: '#fafafa', borderRadius: '12px', padding: '28px 20px', textAlign: 'center', marginBottom: '20px' }}>
                  <Loader2 size={32} style={{ color: '#3b5bdb', animation: 'spin 1s linear infinite', marginBottom: '16px' }} />

                  {/* Phase 1: Questions */}
                  <div style={{ marginBottom: illustEnabled ? '20px' : '0' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px', alignItems: 'center' }}>
                      <span style={{ fontSize: '13px', fontWeight: 600, color: genPhase === 'questions' ? '#0f0f23' : '#9ca3af' }}>
                        {genPhase === 'questions' ? 'Generating questions…' : 'Questions generated'}
                      </span>
                      <span style={{ fontSize: '12px', color: '#6b7280' }}>{genPhase === 'questions' ? genProgress : 100}%</span>
                    </div>
                    <div style={{ height: '6px', background: '#e8eaed', borderRadius: '99px', overflow: 'hidden' }}>
                      <div style={{ height: '100%', width: `${genPhase === 'questions' ? genProgress : 100}%`, background: '#3b5bdb', borderRadius: '99px', transition: 'width 0.4s ease' }} />
                    </div>
                  </div>

                  {/* Phase 2: Illustrations */}
                  {illustEnabled && (
                    <div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px', alignItems: 'center' }}>
                        <span style={{ fontSize: '13px', fontWeight: 600, color: genPhase === 'illustrations' ? '#0f0f23' : genPhase === 'done' ? '#9ca3af' : '#d1d5db' }}>
                          {genPhase === 'illustrations' ? 'Generating illustrations…' : genPhase === 'done' ? 'Illustrations generated' : 'Illustrations (pending)'}
                        </span>
                        <span style={{ fontSize: '12px', color: '#6b7280' }}>
                          {genPhase === 'illustrations' ? illustProgress : genPhase === 'done' ? 100 : 0}%
                        </span>
                      </div>
                      <div style={{ height: '6px', background: '#e8eaed', borderRadius: '99px', overflow: 'hidden' }}>
                        <div style={{ height: '100%', width: `${genPhase === 'illustrations' ? illustProgress : genPhase === 'done' ? 100 : 0}%`, background: '#7c3aed', borderRadius: '99px', transition: 'width 0.4s ease' }} />
                      </div>
                    </div>
                  )}

                  <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
                </div>
              ) : (
                <div style={{ textAlign: 'center', marginBottom: '20px' }}>
                  <button onClick={handleGenerate}
                    style={{ display: 'inline-flex', alignItems: 'center', gap: '10px', padding: '14px 32px', borderRadius: '12px', border: 'none', background: 'linear-gradient(135deg, #3b5bdb, #7c3aed)', color: '#fff', fontSize: '15px', fontWeight: 700, cursor: 'pointer', boxShadow: '0 4px 18px rgba(59,91,219,0.35)' }}>
                    <Sparkles size={18} />
                    Generate {totalQ()} Questions{illustEnabled ? ' + Illustrations' : ''}
                  </button>
                  <p style={{ fontSize: '12px', color: '#9ca3af', marginTop: '10px' }}>
                    Estimated time: ~{illustEnabled ? '25–40' : '10–20'} seconds
                  </p>
                </div>
              )
            ) : (
              /* Results */
              <div>
                {/* Done banner */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '14px 20px', background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '12px', marginBottom: '20px' }}>
                  <CheckCircle2 size={20} style={{ color: '#16a34a', flexShrink: 0 }} />
                  <div>
                    <div style={{ fontSize: '14px', fontWeight: 600, color: '#15803d' }}>
                      {questions.length} questions generated{illustEnabled ? ' with illustrations' : ''}
                    </div>
                    <div style={{ fontSize: '12px', color: '#16a34a' }}>
                      Review each question below, then save selected ones to your Question Bank.
                    </div>
                  </div>
                  <button onClick={handleGenerate}
                    style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '5px', padding: '7px 14px', borderRadius: '8px', border: '1px solid #bbf7d0', background: '#fff', color: '#15803d', fontSize: '12px', cursor: 'pointer' }}>
                    <RefreshCw size={12} /> Regenerate
                  </button>
                </div>

                {/* Question cards */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '24px' }}>
                  {questions.map((q, i) => {
                    const dc = DIFFICULTY_COLORS[q.difficulty];
                    const isExpanded = expandedQ === q.id;
                    const isSaved = savedIds.has(q.id);
                    return (
                      <div key={q.id}
                        style={{ background: '#fff', border: `1.5px solid ${isSaved ? '#bbf7d0' : '#e8eaed'}`, borderRadius: '12px', overflow: 'hidden', transition: 'border-color 0.2s' }}>
                        {/* Card header */}
                        <div style={{ padding: '16px 18px', cursor: 'pointer', display: 'flex', gap: '12px', alignItems: 'flex-start' }}
                          onClick={() => setExpandedQ(isExpanded ? null : q.id)}>
                          <div style={{ width: '28px', height: '28px', borderRadius: '7px', background: '#f3f4f6', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '12px', fontWeight: 700, color: '#6b7280', flexShrink: 0 }}>
                            {i + 1}
                          </div>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            {/* Derived-from badge */}
                            {q.derivedFrom && (
                              <div style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '10px', fontWeight: 600, padding: '2px 7px', borderRadius: '4px', background: '#f5f3ff', color: '#6d28d9', marginBottom: '6px' }}>
                                <Layers size={9} /> Derived from: {q.derivedFrom}
                              </div>
                            )}
                            <div style={{ fontSize: '14px', color: '#0f0f23', lineHeight: 1.5 }}>{q.prompt}</div>
                          </div>
                          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '6px', flexShrink: 0 }}>
                            <div style={{ display: 'flex', gap: '5px', alignItems: 'center' }}>
                              <span style={{ fontSize: '10px', padding: '2px 8px', borderRadius: '5px', background: '#f3f4f6', color: '#6b7280', fontWeight: 600 }}>{q.type}</span>
                              <span style={{ fontSize: '10px', padding: '2px 8px', borderRadius: '5px', background: dc.bg, color: dc.color, fontWeight: 600 }}>{q.difficulty}</span>
                              {q.hasImage && <span style={{ fontSize: '10px', padding: '2px 8px', borderRadius: '5px', background: '#f5f3ff', color: '#6d28d9', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '3px' }}><Image size={9} /> img</span>}
                            </div>
                          </div>
                        </div>

                        {/* Expanded body */}
                        {isExpanded && (
                          <div style={{ padding: '0 18px 18px', borderTop: '1px solid #f0f2f5' }}>
                            {/* MCQ options */}
                            {q.options && (
                              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', paddingTop: '14px' }}>
                                {q.options.map(opt => (
                                  <div key={opt.key} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 12px', borderRadius: '8px', background: opt.correct ? '#f0fdf4' : '#f9fafb', border: `1px solid ${opt.correct ? '#bbf7d0' : '#f0f2f5'}` }}>
                                    <span style={{ fontSize: '12px', fontWeight: 700, color: opt.correct ? '#16a34a' : '#9ca3af', width: '16px' }}>{opt.key}.</span>
                                    <span style={{ fontSize: '13px', color: opt.correct ? '#15803d' : '#374151' }}>{opt.text}</span>
                                    {opt.correct && <CheckCircle2 size={13} style={{ color: '#16a34a', marginLeft: 'auto' }} />}
                                  </div>
                                ))}
                              </div>
                            )}
                            {/* TF / Fill answer */}
                            {q.answer && !q.options && (
                              <div style={{ marginTop: '12px', padding: '10px 14px', background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '8px', fontSize: '13px', color: '#15803d' }}>
                                <strong>Answer:</strong> {q.answer}
                              </div>
                            )}
                            {/* Illustration placeholder */}
                            {q.hasImage && (
                              <IllustPlaceholder qIndex={i} style={q.imageStyle ?? 'auto'} />
                            )}
                            {/* Explanation */}
                            <div style={{ marginTop: '12px', padding: '12px 14px', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: '8px' }}>
                              <div style={{ fontSize: '11px', fontWeight: 700, color: '#92400e', marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Explanation</div>
                              <div style={{ fontSize: '13px', color: '#78350f', lineHeight: 1.6 }}>{q.explanation}</div>
                            </div>
                            {/* Save button */}
                            <div style={{ marginTop: '12px', display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                              <button onClick={() => setSavedIds(prev => { const n = new Set(prev); n.has(q.id) ? n.delete(q.id) : n.add(q.id); return n; })}
                                style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '7px 16px', borderRadius: '8px', border: `1.5px solid ${isSaved ? '#16a34a' : '#3b5bdb'}`, background: isSaved ? '#f0fdf4' : '#eff6ff', color: isSaved ? '#16a34a' : '#3b5bdb', fontSize: '12px', fontWeight: 600, cursor: 'pointer' }}>
                                {isSaved ? <><CheckCircle2 size={13} /> Saved</> : <><Plus size={13} /> Save to Bank</>}
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>

                {/* Bottom actions */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 20px', background: '#fff', border: '1px solid #e8eaed', borderRadius: '12px' }}>
                  <span style={{ fontSize: '13px', color: '#6b7280' }}>
                    {savedIds.size} of {questions.length} saved to Question Bank
                  </span>
                  <div style={{ display: 'flex', gap: '10px' }}>
                    <button onClick={() => setSavedIds(new Set(questions.map(q => q.id)))}
                      style={{ padding: '8px 16px', borderRadius: '8px', border: '1px solid #e8eaed', background: '#fff', color: '#374151', fontSize: '13px', cursor: 'pointer' }}>
                      Save All
                    </button>
                    <button onClick={handleCreateExamPaper}
                      disabled={creatingPaper}
                      style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 18px', borderRadius: '8px', border: 'none', background: '#3b5bdb', color: '#fff', fontSize: '13px', fontWeight: 600, cursor: 'pointer' }}>
                      <FileText size={13} /> {creatingPaper ? 'Creating...' : 'Create Exam Paper'}
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Footer nav */}
            <div style={{ display: 'flex', justifyContent: 'flex-start', marginTop: '24px' }}>
              <button onClick={() => setStep(sourceTab === 'questions' ? 1 : 2)}
                style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '10px 22px', borderRadius: '9px', border: '1px solid #e8eaed', background: '#fff', color: '#374151', fontSize: '14px', cursor: 'pointer' }}>
                <ChevronLeft size={15} /> Back
              </button>
            </div>
          </div>
        )}
        </div>
      </div>
    </div>
  );
}
