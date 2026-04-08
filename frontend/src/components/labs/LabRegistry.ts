import type { RegistryEntry, LabComponentDefinition } from './types';

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
