/**
 * Coerce LLM / legacy drive commands into shapes LabHost applies (SET_PARAM, SET_STATE, RESET).
 */

function pickKey(candidates: string[], stateKeys: Set<string>): string | undefined {
  for (const c of candidates) {
    if (stateKeys.has(c)) return c;
  }
  return undefined;
}

/** 当固定候选对不上时，按子串匹配 state 里真实存在的键（各实验命名差异大） */
function firstStateKeyMatching(stateKeys: Set<string>, patterns: RegExp[]): string | undefined {
  for (const sk of stateKeys) {
    for (const re of patterns) {
      if (re.test(sk)) return sk;
    }
  }
  return undefined;
}

/**
 * Map LLM-written param keys (Chinese labels, synonyms) to keys that exist on `state`.
 * Without this, Drive emits e.g. `水` or wrong optics keys while the lab uses `water`.
 */
function resolveSetParamKey(rawKey: string, stateKeys: Set<string>): string | undefined {
  const k = rawKey.trim();
  if (!k) return undefined;
  if (stateKeys.size === 0) return k;
  if (stateKeys.has(k)) return k;
  const lower = k.toLowerCase();
  for (const sk of stateKeys) {
    if (sk.toLowerCase() === lower) return sk;
  }
  // Biology / photosynthesis — must run before optics "water → n2" heuristics
  if (/水|水分|灌溉|water|h2o/i.test(k)) {
    const hit = pickKey(
      ['water', 'waterLevel', 'h2o', 'moisture', 'irrigation', 'water_supply', 'waterSupply'],
      stateKeys,
    );
    if (hit) return hit;
  }
  if (/光|光照|光强|亮度|illumination|lux|^light$/i.test(k)) {
    const hit = pickKey(
      [
        'light', 'lightIntensity', 'light_intensity', 'lightLevel', 'light_level',
        'illumination', 'illuminationIntensity', 'sunlight', 'lux', 'photosynthesis_light',
        'par', 'brightness', 'I', 'L',
        '光照强度', '光照', '光强', '亮度',
      ],
      stateKeys,
    );
    if (hit) return hit;
    const fuzzy = firstStateKeyMatching(stateKeys, [
      /^light/i,
      /light/i,
      /^lux$/i,
      /illum/i,
      /^par$/i,
      /brightness/i,
      /光/,
      /照/,
    ]);
    if (fuzzy) return fuzzy;
  }
  if (/^light$/i.test(k) || /^lux$/i.test(k) || /^illum/i.test(k)) {
    const zhLight = pickKey(['光照强度', '光照', '光强', '亮度'], stateKeys);
    if (zhLight) return zhLight;
  }
  if (/co2|co₂|二氧化碳|二氧/i.test(k)) {
    const hit = pickKey(['co2', 'carbonDioxide', 'co2Level', 'carbon_dioxide', 'co2_concentration'], stateKeys);
    if (hit) return hit;
    const fuzzy = firstStateKeyMatching(stateKeys, [/^co2/i, /carbon/i, /二氧化碳/, /CO2/i]);
    if (fuzzy) return fuzzy;
  }
  if (/温|温度|temp/i.test(k)) {
    const hit = pickKey(['temperature', 'temp', 't', 'heat'], stateKeys);
    if (hit) return hit;
  }
  if (/叶绿|chlorophyll/i.test(k)) {
    const hit = pickKey(['chlorophyll', 'chlorophyllActivity', 'chlorophyll_activity'], stateKeys);
    if (hit) return hit;
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

  if (/光|光照|光强|亮度|illum|lux/i.test(target) || /光|光照|光强/.test(propertyName)) {
    const hit = pickKey(
      [
        'light', 'lightIntensity', 'light_intensity', 'lightLevel', 'light_level',
        'illumination', 'lux', 'par', 'brightness',
        '光照强度', '光照', '光强', '亮度',
      ],
      stateKeys,
    ) ?? firstStateKeyMatching(stateKeys, [/^light/i, /light/i, /lux$/i, /illum/i, /par$/i, /光/, /照/]);
    if (hit) return hit;
  }

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
    const kBio = pickKey(
      ['water', 'waterLevel', 'h2o', 'moisture', 'irrigation', 'water_supply', 'waterSupply'],
      stateKeys,
    );
    if (kBio) return kBio;
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

/** 将 SET_STATE 里中文/别名键映射到 state 上存在的键 */
function coerceSetStatePayload(
  payload: Record<string, unknown>,
  stateKeys: Set<string>,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [rawKey, val] of Object.entries(payload)) {
    const resolved =
      resolveSetParamKey(rawKey, stateKeys) ??
      (stateKeys.has(rawKey) ? rawKey : undefined);
    if (resolved !== undefined && (stateKeys.size === 0 || stateKeys.has(resolved))) {
      out[resolved] = val;
    }
  }
  return out;
}

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
          const resolved = resolveSetParamKey(String(p.key), stateKeys) ?? String(p.key);
          if (stateKeys.size === 0 || stateKeys.has(resolved)) {
            out.push({ type: 'SET_PARAM', payload: { key: resolved, value: p.value } });
          }
          continue;
        }
      }
      if (cmd.key != null && cmd.value !== undefined) {
        const resolved = resolveSetParamKey(String(cmd.key), stateKeys) ?? String(cmd.key);
        if (stateKeys.size === 0 || stateKeys.has(resolved)) {
          out.push({ type: 'SET_PARAM', payload: { key: resolved, value: cmd.value } });
        }
        continue;
      }
    }

    if (t === 'SET_STATE' && cmd.payload && typeof cmd.payload === 'object') {
      const rawPl = cmd.payload as Record<string, unknown>;
      const mapped =
        stateKeys.size === 0
          ? { ...rawPl }
          : coerceSetStatePayload(rawPl, stateKeys);
      out.push({ type: 'SET_STATE', payload: mapped });
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

    if (value !== undefined && typeof keyFlat === 'string') {
      const resolvedFlat = resolveSetParamKey(keyFlat, stateKeys) ?? (stateKeys.has(keyFlat) ? keyFlat : undefined);
      if (resolvedFlat !== undefined && (stateKeys.size === 0 || stateKeys.has(resolvedFlat))) {
        out.push({ type: 'SET_PARAM', payload: { key: resolvedFlat, value } });
        continue;
      }
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
