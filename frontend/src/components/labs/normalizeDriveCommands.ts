/**
 * Coerce LLM / legacy drive commands into shapes LabHost applies (SET_PARAM, SET_STATE, RESET).
 */

function pickKey(candidates: string[], stateKeys: Set<string>): string | undefined {
  for (const c of candidates) {
    if (stateKeys.has(c)) return c;
  }
  return undefined;
}

function resolveParamKey(
  target: string,
  propertyName: string,
  innerCommand: string,
  stateKeys: Set<string>,
): string | undefined {
  const blob = `${target} ${propertyName} ${innerCommand}`.toLowerCase();

  if (
    target.includes('介质2') ||
    target.includes('介质二') ||
    target.includes('第二介质') ||
    target.includes('下层') ||
    blob.includes('second medium')
  ) {
    const k = pickKey(['n2', 'n2_medium', 'refractive_index_2'], stateKeys);
    if (k) return k;
  }

  if (/\bn2\b|n₂|n_2/i.test(target)) {
    const k = pickKey(['n2', 'n2_medium', 'refractive_index_2'], stateKeys);
    if (k) return k;
  }

  if (
    target.includes('介质1') ||
    target.includes('介质一') ||
    target.includes('第一介质') ||
    target.includes('上层') ||
    blob.includes('first medium')
  ) {
    const k = pickKey(['n1', 'n1_medium', 'refractive_index_1'], stateKeys);
    if (k) return k;
  }

  const tl = target.trim().toLowerCase();
  if (tl === 'n1' || tl === 'n₁') {
    const k = pickKey(['n1', 'n1_medium', 'refractive_index_1'], stateKeys);
    if (k) return k;
  }

  if (target.includes('水') || blob.includes('water')) {
    const k = pickKey(['n2', 'n2_medium'], stateKeys);
    if (k) return k;
  }

  const tTrim = target.trim();
  if (tTrim && stateKeys.has(tTrim)) return tTrim;
  const pTrim = propertyName.trim();
  if (pTrim && stateKeys.has(pTrim)) return pTrim;

  const innerU = innerCommand.toUpperCase();
  if (innerU.includes('CHANGE_MATERIAL') || innerU.includes('MATERIAL')) {
    const k = pickKey(['n2', 'n2_medium'], stateKeys);
    if (k) return k;
  }

  return undefined;
}

export type NormalizedLabCommand =
  | { type: 'SET_PARAM'; payload: { key: string; value: unknown } }
  | { type: 'SET_STATE'; payload: Record<string, unknown> }
  | { type: 'RESET' };

export function normalizeDriveCommandsForLabHost(
  rawList: unknown[],
  stateKeyList: string[],
): NormalizedLabCommand[] {
  const stateKeys = new Set(stateKeyList);
  const out: NormalizedLabCommand[] = [];

  for (const item of rawList) {
    if (!item || typeof item !== 'object') continue;
    const cmd = item as Record<string, unknown>;
    const t = cmd.type;

    if (t === 'SET_PARAM') {
      const pl = cmd.payload;
      if (pl && typeof pl === 'object') {
        const p = pl as Record<string, unknown>;
        if (p.key != null && p.value !== undefined) {
          out.push({ type: 'SET_PARAM', payload: { key: String(p.key), value: p.value } });
          continue;
        }
      }
      if (cmd.key != null && cmd.value !== undefined) {
        out.push({ type: 'SET_PARAM', payload: { key: String(cmd.key), value: cmd.value } });
        continue;
      }
    }

    if (t === 'SET_STATE' && cmd.payload && typeof cmd.payload === 'object') {
      out.push({ type: 'SET_STATE', payload: { ...(cmd.payload as Record<string, unknown>) } });
      continue;
    }

    if (t === 'RESET') {
      out.push({ type: 'RESET' });
      continue;
    }

    const value = cmd.value;
    const target = cmd.target != null ? String(cmd.target) : '';
    const prop = cmd.property != null ? String(cmd.property) : '';
    const inner = cmd.command != null ? String(cmd.command) : '';
    const keyFlat = cmd.key;

    if (value !== undefined && typeof keyFlat === 'string' && stateKeys.has(keyFlat)) {
      out.push({ type: 'SET_PARAM', payload: { key: keyFlat, value } });
      continue;
    }

    if (value !== undefined) {
      const resolved = resolveParamKey(target, prop, inner, stateKeys);
      if (resolved) {
        out.push({ type: 'SET_PARAM', payload: { key: resolved, value } });
        continue;
      }
      if (prop && stateKeys.has(prop)) {
        out.push({ type: 'SET_PARAM', payload: { key: prop, value } });
      }
    }
  }

  return out;
}
