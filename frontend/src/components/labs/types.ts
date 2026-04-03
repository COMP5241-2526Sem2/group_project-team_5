// ── Lab 类型系统 ─────────────────────────────────────────────────────────────

export type SubjectLab = 'math' | 'physics' | 'chemistry' | 'biology' | 'dynamic';

// ── LabCommand 协议 ───────────────────────────────────────────────────────────
export type LabCommandType =
  // 通用
  | 'SET_PARAM'
  | 'RESET'
  | 'SET_STATE'
  // 电路专项
  | 'ADD_COMPONENT'
  | 'REMOVE_COMPONENT'
  | 'TOGGLE_SWITCH'
  | 'SET_RESISTANCE'
  | 'CONNECT'
  | 'DISCONNECT'
  // 函数图像
  | 'SET_FUNCTION'
  | 'ADD_CURVE'
  | 'REMOVE_CURVE'
  // 几何
  | 'SET_SHAPE'
  | 'SET_ANGLE'
  // 分子
  | 'HIGHLIGHT_ATOM'
  | 'SET_MOLECULE'
  // 细胞
  | 'HIGHLIGHT_ORGANELLE'
  | 'TOGGLE_LAYER';

export interface LabCommand {
  type: LabCommandType;
  payload?: Record<string, unknown>;
  description?: string; // human-readable description for the log
}

// ── Lab State 基础 ────────────────────────────────────────────────────────────
export interface LabState {
  [key: string]: unknown;
}

// ── LabComponentDefinition（动态 Lab 用）────────────────────────────────────
export type RendererProfile =
  | 'circuit_2d'
  | 'function_2d'
  | 'geometry_3d'
  | 'molecule_3d'
  | 'cell_3d'
  | 'mechanics_3d'
  | 'generic_2d';

export interface LabComponentDefinition {
  registryKey: string;
  subjectLab: SubjectLab;
  title: string;
  description?: string;
  rendererProfile: RendererProfile;
  initialState: LabState;
  reducerSpec?: {
    allowedCommands: LabCommandType[];
    maxNodes?: number;
  };
  metadata?: {
    grade?: string;
    topic?: string;
    createdBy?: string;
    version?: number;
  };
  status: 'draft' | 'published' | 'deprecated';
}

// ── Slide & Deck ──────────────────────────────────────────────────────────────
export type BlockType = 'text' | 'interactive' | 'exercise_walkthrough' | 'image';
export type DeckSource = 'kb_ai' | 'ppt_import' | 'hybrid' | 'manual';

export interface TextBlock {
  id: string;
  type: 'text';
  content: string;
}

export interface InteractiveBlock {
  id: string;
  type: 'interactive';
  widgetType: string; // e.g. 'physics.circuit' or dynamic registryKey
  labInstanceId: string;
  initialState: LabState;
  subjectLab: SubjectLab;
  allowedCommands?: LabCommandType[];
}

export interface ExerciseWalkthroughBlock {
  id: string;
  type: 'exercise_walkthrough';
  question: string;
  steps: Array<{
    id: string;
    text: string;
    labInstanceId?: string;
    targetState?: LabState;
  }>;
}

export type SlideBlock = TextBlock | InteractiveBlock | ExerciseWalkthroughBlock;

export interface LabEntry {
  label: string;
  widgetType: string;
  labInstanceId?: string;
  initialState?: LabState;
  presentationMode?: 'fullscreen' | 'split';
}

export interface Slide {
  id: string;
  title: string;
  blocks: SlideBlock[];
  labEntry?: LabEntry;
  notes?: string;
}

export interface LessonDeck {
  id: string;
  title: string;
  subject: SubjectLab | string;
  grade: string;
  deckSource: DeckSource;
  status: 'draft' | 'published';
  slides: Slide[];
  createdAt: string;
  updatedAt: string;
  teacherId: string;
  thumbnail?: string;
}

// ── AI Chat message ───────────────────────────────────────────────────────────
export type ChatRole = 'user' | 'assistant' | 'system';
export type ChatMode = 'drive_lab' | 'generate_lab';

export interface ChatMessage {
  id: string;
  role: ChatRole;
  content: string;
  commands?: LabCommand[];
  definition?: LabComponentDefinition;
  timestamp: number;
  streaming?: boolean;
}

// ── Registry entry ────────────────────────────────────────────────────────────
export interface RegistryEntry {
  widgetType: string;
  component: React.ComponentType<LabWidgetProps>;
  subject: SubjectLab;
  label: string;
  description: string;
  defaultState: LabState;
  thumbnail?: string; // emoji or icon identifier
}

export interface LabWidgetProps {
  state: LabState;
  onStateChange?: (patch: Partial<LabState>) => void;
  dispatch?: (cmd: LabCommand) => void;
  readonly?: boolean;
  height?: number;
}
