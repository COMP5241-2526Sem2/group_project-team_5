import { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from 'react';
import type { LabComponentDefinition } from './types';
import { MOCK_DYNAMIC_DEFS, WidgetRegistry } from './LabRegistry';
import { labsApi } from '@/api/labs';
import { fromBackend } from '@/api/labs';

/** Lab source: how it entered the system */
export type LabSource = 'builtin' | 'uploaded' | 'ai';

/** Full lab entry tracked by the context */
export interface LabEntry {
  def: LabComponentDefinition;
  source: LabSource;
}

interface LabsContextValue {
  /** All labs (draft + published), keyed by registryKey */
  allLabs: Map<string, LabEntry>;
  /** Published labs only */
  publishedLabs: LabEntry[];
  /** Draft labs only (status = draft) */
  draftLabs: LabEntry[];
  /**
   * Drafts 页列表：上传 + AI 实验，含草稿与已发布（发布后仍保留在此列表）
   */
  workspaceLabs: LabEntry[];
  /** Save a lab as draft (or update if already exists) */
  saveDraft: (def: LabComponentDefinition, source: LabSource) => void;
  /** Merge a lab into the context after backend confirm (also registers WidgetRegistry) */
  mergeLab: (def: LabComponentDefinition, source: LabSource) => void;
  /** Promote to published（尽量同步后端 PATCH；无记录则仅更新前端） */
  publishLab: (registryKey: string) => Promise<void>;
  /** Demote a published lab back to draft */
  demoteToDraft: (registryKey: string) => void;
  /** Delete a lab (backend then frontend state) */
  deleteLab: (registryKey: string) => Promise<void>;
}

const LabsContext = createContext<LabsContextValue | null>(null);

const DELETED_KEYS_KEY = 'lab:deleted_keys';

function buildInitialAllLabs(): Map<string, LabEntry> {
  const map = new Map<string, LabEntry>();
  try {
    const deleted: string[] = JSON.parse(sessionStorage.getItem(DELETED_KEYS_KEY) ?? '[]');
    MOCK_DYNAMIC_DEFS.forEach(def => {
      if (!deleted.includes(def.registryKey)) {
        map.set(def.registryKey, { def, source: 'ai' });
      }
    });
  } catch {
    MOCK_DYNAMIC_DEFS.forEach(def => {
      map.set(def.registryKey, { def, source: 'ai' });
    });
  }
  return map;
}

export function LabsProvider({ children }: { children: ReactNode }) {
  const [allLabs, setAllLabs] = useState<Map<string, LabEntry>>(buildInitialAllLabs);

  // ── Upsert helpers ──────────────────────────────────────────────────────────

  /** Insert-or-replace a lab in allLabs (used after confirm from AI). */
  const mergeLab = useCallback((def: LabComponentDefinition, source: LabSource) => {
    WidgetRegistry.registerDynamic(def);
    setAllLabs(prev => {
      const next = new Map(prev);
      next.set(def.registryKey, { def, source });
      return next;
    });
  }, []);

  // ── Backend load on mount ──────────────────────────────────────────────────
  useEffect(() => {
    labsApi.list({ type: 'ai_generated', page_size: 100 }).then(
      (res: { items: unknown[] }) => {
        res.items.forEach((item: unknown) => {
          try {
            const def = fromBackend(item as Parameters<typeof fromBackend>[0]);
            mergeLab(def, 'ai');
          } catch { /* ignore malformed items */ }
        });
      },
      () => { /* backend offline — fine, use MOCK_DYNAMIC_DEFS only */ }
    );
  }, [mergeLab]);

  const saveDraft = useCallback((def: LabComponentDefinition, source: LabSource) => {
    mergeLab({ ...def, status: 'draft' }, source);
  }, [mergeLab]);

  const publishLab = useCallback(async (registryKey: string) => {
    try {
      const lab = await labsApi.get(registryKey);
      const id = (lab as { id?: number }).id;
      if (typeof id === 'number') {
        try {
          await labsApi.updateStatus(id, 'published');
        } catch {
          /* 仍更新本地，避免仅因网络失败卡住 UI */
        }
      }
    } catch {
      /* 未落库的实验：仅前端标记为已发布 */
    }
    setAllLabs(prev => {
      const entry = prev.get(registryKey);
      if (!entry) return prev;
      const next = new Map(prev);
      next.set(registryKey, { ...entry, def: { ...entry.def, status: 'published' } });
      return next;
    });
  }, []);

  const demoteToDraft = useCallback((registryKey: string) => {
    setAllLabs(prev => {
      const entry = prev.get(registryKey);
      if (!entry) return prev;
      const next = new Map(prev);
      next.set(registryKey, { ...entry, def: { ...entry.def, status: 'draft' } });
      return next;
    });
  }, []);

  const deleteLab = useCallback(async (registryKey: string) => {
    try {
      const lab = await labsApi.get(registryKey);
      await labsApi.delete((lab as Record<string, unknown>).id as number);
    } catch {
      // Not in backend — fine, still remove from frontend
    }
    setAllLabs(prev => {
      const next = new Map(prev);
      next.delete(registryKey);
      return next;
    });
    try {
      const deleted: string[] = JSON.parse(sessionStorage.getItem(DELETED_KEYS_KEY) ?? '[]');
      if (!deleted.includes(registryKey)) {
        sessionStorage.setItem(DELETED_KEYS_KEY, JSON.stringify([...deleted, registryKey]));
      }
    } catch { /* ignore */ }
  }, []);

  const publishedLabs = Array.from(allLabs.values()).filter(
    e => e.def.status === 'published'
  );
  const draftLabs = Array.from(allLabs.values()).filter(
    e => e.def.status === 'draft'
  );
  const workspaceLabs = Array.from(allLabs.values()).filter(
    e => e.source === 'uploaded' || e.source === 'ai'
  );

  return (
    <LabsContext.Provider
      value={{
        allLabs,
        publishedLabs,
        draftLabs,
        workspaceLabs,
        saveDraft,
        mergeLab,
        publishLab,
        demoteToDraft,
        deleteLab,
      }}
    >
      {children}
    </LabsContext.Provider>
  );
}

export function useLabs(): LabsContextValue {
  const ctx = useContext(LabsContext);
  if (!ctx) throw new Error('useLabs must be used within <LabsProvider>');
  return ctx;
}
