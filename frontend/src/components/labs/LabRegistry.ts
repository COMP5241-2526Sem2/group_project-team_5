import type { RegistryEntry, LabComponentDefinition, RendererProfile } from './types';

// ── Static Registry ───────────────────────────────────────────────────────────
// Populated lazily to avoid circular imports; components register themselves.

class WidgetRegistryClass {
  private static_ = new Map<string, RegistryEntry>();
  private dynamic_ = new Map<string, LabComponentDefinition>();

  register(entry: RegistryEntry) {
    this.static_.set(entry.widgetType, entry);
  }

  registerDynamic(def: LabComponentDefinition) {
    this.dynamic_.set(def.registryKey, def);
  }

  get(widgetType: string): RegistryEntry | LabComponentDefinition | null {
    return this.static_.get(widgetType) ?? this.dynamic_.get(widgetType) ?? null;
  }

  getStatic(widgetType: string): RegistryEntry | null {
    return this.static_.get(widgetType) ?? null;
  }

  getDynamic(registryKey: string): LabComponentDefinition | null {
    return this.dynamic_.get(registryKey) ?? null;
  }

  isDynamic(widgetType: string): boolean {
    return this.dynamic_.has(widgetType);
  }

  listStatic(): RegistryEntry[] {
    return Array.from(this.static_.values());
  }

  listDynamic(): LabComponentDefinition[] {
    return Array.from(this.dynamic_.values());
  }

  hasDynamic(key: string) { return this.dynamic_.has(key); }
}

export const WidgetRegistry = new WidgetRegistryClass();

// ── Pre-seeded dynamic Lab examples (simulating DB fetch) ─────────────────────
export const MOCK_DYNAMIC_DEFS: LabComponentDefinition[] = [
  {
    registryKey: 'dynamic_ph_slider',
    subjectLab: 'chemistry',
    title: 'pH Indicator',
    description: 'Drag the pH slider and watch the colour of the indicator change in real time.',
    rendererProfile: 'generic_2d',
    initialState: {
      ph: 7,
      showScale: true,
      indicatorColor: '#22c55e',
    },
    reducerSpec: { allowedCommands: ['SET_PARAM'] },
    metadata: { grade: 'Grade 9', topic: 'Acid–Base', version: 1 },
    status: 'published',
  },
  {
    registryKey: 'dynamic_snells_law',
    subjectLab: 'physics',
    title: 'Snell\'s Law — Refraction',
    description: 'Adjust incidence angle and refractive index; see refracted ray update in real time.',
    rendererProfile: 'generic_2d',
    initialState: {
      n1: 1.0,
      n2: 1.5,
      theta1: 30,
    },
    reducerSpec: { allowedCommands: ['SET_PARAM'] },
    metadata: { grade: 'Grade 10', topic: 'Optics', version: 1 },
    status: 'published',
  },
];
