/**
 * LabHost — universal router: dispatches to the right static or dynamic lab component.
 * Default states are defined inline here so the heavy lab files (R3F etc.)
 * are ONLY loaded lazily when the component is actually rendered.
 */
import { lazy, Suspense, useState, useCallback, useTransition, useEffect, useMemo } from 'react';
import type { LabWidgetProps, LabState } from './types';
import { WidgetRegistry, MOCK_DYNAMIC_DEFS } from './LabRegistry';
import { normalizeDriveCommandsForLabHost } from './normalizeDriveCommands';

// ── Lazy-load each lab — NO static imports from these files ──────────────────
const FunctionGraph  = lazy(() => import('./mathLab/FunctionGraph'));
const Geometry3D     = lazy(() => import('./mathLab/Geometry3D'));
const CircuitLab     = lazy(() => import('./physicsLab/CircuitLab'));
const Mechanics3D    = lazy(() => import('./physicsLab/Mechanics3D'));
const MoleculeViewer = lazy(() => import('./chemLab/MoleculeViewer'));
const CellViewer     = lazy(() => import('./bioLab/CellViewer'));
const DynamicLabHost = lazy(() => import('./DynamicLabHost'));

// ── Default states (inlined to avoid eager R3F imports) ───────────────────────
const DEFAULT_FUNC_STATE: LabState = {
  a: 1, b: 1, c: 0, d: 0,
  xMin: -6.28, xMax: 6.28, yMin: -3, yMax: 3,
  showGrid: true, showTangent: false, tangentX: 0,
  curves: [{ id: 'c1', label: 'f(x)', color: '#3b5bdb', expr: 'a*sin(b*x+c)+d' }],
  activeId: 'c1',
};

const DEFAULT_GEO_STATE: LabState = {
  shape: 'cube', color: '#3b5bdb', wireframe: false,
  showAxes: true, showGrid: true, scale: 1, rotateSpeed: 0.4, showUnfold: false,
};

const DEFAULT_CIRCUIT_STATE: LabState = {
  voltage: 9, showValues: true, showCurrentFlow: true, animOffset: 0, mode: 'series',
  components: [
    { id: 'bat', type: 'battery', label: 'Battery', value: 9, unit: 'V', x: 0, y: 1 },
    { id: 'sw1', type: 'switch',  label: 'S₁', closed: true, x: 1, y: 0 },
    { id: 'r1',  type: 'resistor', label: 'R₁', value: 10, unit: 'Ω', x: 2, y: 0 },
    { id: 'r2',  type: 'resistor', label: 'R₂', value: 20, unit: 'Ω', x: 3, y: 0 },
    { id: 'bul', type: 'bulb',    label: 'L₁', value: 6, unit: 'W', x: 4, y: 0 },
  ],
  wires: [
    { id: 'w1', from: { x: 0, y: 0 }, to: { x: 1, y: 0 } },
    { id: 'w2', from: { x: 1, y: 0 }, to: { x: 2, y: 0 } },
    { id: 'w3', from: { x: 2, y: 0 }, to: { x: 3, y: 0 } },
    { id: 'w4', from: { x: 3, y: 0 }, to: { x: 4, y: 0 } },
    { id: 'w5', from: { x: 4, y: 0 }, to: { x: 5, y: 0 } },
    { id: 'w6', from: { x: 5, y: 0 }, to: { x: 5, y: 2 } },
    { id: 'w7', from: { x: 5, y: 2 }, to: { x: 0, y: 2 } },
    { id: 'w8', from: { x: 0, y: 2 }, to: { x: 0, y: 1 } },
  ],
};

const DEFAULT_MECHANICS_STATE: LabState = {
  angle: 30, mass: 2, friction: 0.2, gravity: 9.8,
  showForces: true, showDecomp: true, animTime: 0, isSliding: false,
};

const DEFAULT_MOLECULE_STATE: LabState = {
  moleculeKey: 'water', showLabels: true, highlighted: null, zoom: 1,
};

const DEFAULT_CELL_STATE: LabState = {
  showMembrane: true, highlighted: null, autoRotate: false,
  visibleLayers: {
    nucleus: true, mitochondria1: true, mitochondria2: true,
    er_rough: true, er_smooth: true, golgi: true,
    lysosome: true, vacuole: true, ribosome1: true,
    ribosome2: true, centriole: true,
  },
};

// ── Static widget catalogue ───────────────────────────────────────────────────
export const STATIC_WIDGETS: {
  widgetType: string; label: string; subject: string; emoji: string; defaultState: LabState;
}[] = [
  { widgetType: 'math.function_graph', label: 'Function Graph',  subject: 'Math',     emoji: '📈', defaultState: DEFAULT_FUNC_STATE },
  { widgetType: 'math.geometry_3d',   label: '3D Geometry',     subject: 'Math',     emoji: '🧊', defaultState: DEFAULT_GEO_STATE },
  { widgetType: 'physics.circuit',    label: 'Circuit Lab',     subject: 'Physics',  emoji: '⚡', defaultState: DEFAULT_CIRCUIT_STATE },
  { widgetType: 'physics.mechanics',  label: 'Mechanics 3D',    subject: 'Physics',  emoji: '🏔️', defaultState: DEFAULT_MECHANICS_STATE },
  { widgetType: 'chem.molecule',      label: 'Molecule Viewer', subject: 'Chemistry',emoji: '⚗️', defaultState: DEFAULT_MOLECULE_STATE },
  { widgetType: 'bio.cell',           label: 'Cell Viewer',     subject: 'Biology',  emoji: '🔬', defaultState: DEFAULT_CELL_STATE },
];

// ── Loading skeleton ──────────────────────────────────────────────────────────
function LabSkeleton({ height = 380 }: { height?: number }) {
  return (
    <div style={{ height, background: '#0b1120', borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: '10px' }}>
      <div style={{ width: '36px', height: '36px', border: '3px solid #3b5bdb', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      <span style={{ fontSize: '12px', color: '#6b7280', fontFamily: 'monospace' }}>Loading Lab…</span>
    </div>
  );
}

// ── LabHost ───────────────────────────────────────────────────────────────────
interface LabHostProps {
  widgetType: string;
  initialState?: LabState;
  readonly?: boolean;
  height?: number;
  /** AI commands from ChatContext — applied automatically when present */
  pendingCommands?: Array<{ type: string; payload?: Record<string, unknown> }>;
  /** Called after applying pending commands so ChatContext can clear them */
  onConsumeCommands?: () => void;
}

export default function LabHost({
  widgetType, initialState, readonly, height,
  pendingCommands, onConsumeCommands,
}: LabHostProps) {
  // Defer widgetType transitions so lazy-load suspense never fires synchronously
  const [activeType, setActiveType] = useState(widgetType);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    if (widgetType !== activeType) {
      startTransition(() => {
        setActiveType(widgetType);
        // Also reset lab state so the new widget never receives the old widget's state shape
        const newMeta = STATIC_WIDGETS.find(w => w.widgetType === widgetType);
        const newDynamic =
          MOCK_DYNAMIC_DEFS.find(d => d.registryKey === widgetType) ??
          WidgetRegistry.getDynamic(widgetType);
        setState(initialState ?? newMeta?.defaultState ?? newDynamic?.initialState ?? {});
      });
    }
  }, [widgetType]); // eslint-disable-line react-hooks/exhaustive-deps

  const staticMeta = STATIC_WIDGETS.find(w => w.widgetType === activeType);
  const dynamicDef = MOCK_DYNAMIC_DEFS.find(d => d.registryKey === activeType)
    ?? WidgetRegistry.getDynamic(activeType);

  const baseState = initialState ?? staticMeta?.defaultState ?? dynamicDef?.initialState ?? {};
  const [state, setState] = useState<LabState>(baseState);

  /** 同一 registryKey 下迭代生成（render_code / initialState 变化）时需重置运行时 state，否则预览仍用旧参数 */
  const dynamicRevision = useMemo(() => {
    if (!dynamicDef) return '';
    const rc = (dynamicDef as { renderCode?: string }).renderCode?.length ?? 0;
    return `${dynamicDef.registryKey}:${rc}:${JSON.stringify(dynamicDef.initialState)}`;
  }, [dynamicDef]);

  useEffect(() => {
    if (!dynamicDef || widgetType !== activeType) return;
    setState(initialState ?? staticMeta?.defaultState ?? dynamicDef.initialState ?? {});
  }, [dynamicRevision, widgetType, activeType, dynamicDef, initialState, staticMeta]);

  // Apply AI commands from ChatContext（含 LLM 非标准 JSON 的兜底规范化）
  useEffect(() => {
    if (!pendingCommands?.length || readonly) return;
    const normalized = normalizeDriveCommandsForLabHost(
      pendingCommands as unknown[],
      Object.keys(state),
    );
    if (normalized.length === 0) {
      onConsumeCommands?.();
      return;
    }
    setState(prev => {
      let next: LabState = { ...prev };
      for (const cmd of normalized) {
        if (cmd.type === 'RESET') {
          next = { ...baseState };
        } else if (cmd.type === 'SET_STATE' && cmd.payload) {
          next = { ...next, ...cmd.payload };
        } else if (cmd.type === 'SET_PARAM' && cmd.payload) {
          const { key, value } = cmd.payload;
          if (key && value !== undefined) {
            next = { ...next, [key]: value };
          }
        }
      }
      return next;
    });
    onConsumeCommands?.();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingCommands]);

  const onStateChange = useCallback((patch: Partial<LabState>) => {
    if (readonly) return;
    setState(prev => ({ ...prev, ...patch }));
  }, [readonly]);

  const props: LabWidgetProps = { state, onStateChange, readonly, height };

  function renderLab() {
    switch (activeType) {
      case 'math.function_graph': return <FunctionGraph {...props} />;
      case 'math.geometry_3d':   return <Geometry3D {...props} />;
      case 'physics.circuit':    return <CircuitLab {...props} />;
      case 'physics.mechanics':  return <Mechanics3D {...props} />;
      case 'chem.molecule':      return <MoleculeViewer {...props} />;
      case 'bio.cell':           return <CellViewer {...props} />;
      default:
        if (dynamicDef) return <DynamicLabHost {...props} definition={dynamicDef} />;
        return (
          <div style={{ background: '#0b1120', borderRadius: '10px', padding: '48px', textAlign: 'center', color: '#6b7280' }}>
            <div style={{ fontSize: '32px', marginBottom: '12px' }}>❓</div>
            <div style={{ fontFamily: 'monospace', fontSize: '13px' }}>Unknown lab: {activeType}</div>
          </div>
        );
    }
  }

  return (
    <Suspense fallback={<LabSkeleton height={height} />}>
      <div style={{ opacity: isPending ? 0.6 : 1, transition: 'opacity 0.2s' }}>
        {renderLab()}
      </div>
    </Suspense>
  );
}