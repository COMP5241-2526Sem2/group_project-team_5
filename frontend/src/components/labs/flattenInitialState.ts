/**
 * flattenInitialState — recursively flattens any nested AI-generated initial_state
 * into a top-level flat key/value map that GenericDynamicRenderer can consume.
 *
 * AI models tend to generate nested structures like:
 *   { panels: [{ type: "slider", value: 45, label: "Angle" }] }
 *   { controls: { temperature: { value: 25 } } }
 *
 * This function normalises them to:
 *   { panel_0_value: 45 }
 *   { panel_0_label: "Angle" }
 *   { controls_temperature_value: 25 }
 *
 * which introspectField then picks up as numeric/bool/string fields.
 */

/**
 * Converts a value that may be a pure scalar array (e.g. [1, 2, 3]) into a
 * comma-separated string so introspectField treats it as an options field.
 */
function scalarArrayToString(arr: unknown[]): string {
  return arr.map(v => String(v)).join(',');
}

/**
 * Main flatten function.  Recursively traverses `obj` and emits only top-level
 * scalar (number / boolean / string) entries.  Nested objects and arrays are
 * flattened with underscore-separated keys.
 */
export function flattenInitialState(
  obj: unknown,
  prefix = '',
): Record<string, unknown> {
  const result: Record<string, unknown> = {};

  if (obj === null || obj === undefined || typeof obj !== 'object') {
    return result;
  }

  if (Array.isArray(obj)) {
    // Pure scalar array → comma-separated string (options)
    if (obj.length > 0 && obj.every(v => typeof v === 'number' || typeof v === 'boolean' || typeof v === 'string')) {
      if (prefix) result[prefix] = scalarArrayToString(obj);
      return result;
    }
    // Mixed / object array → flatten each element with numeric index prefix
    obj.forEach((item, i) => {
      if (typeof item === 'object' && item !== null) {
        Object.assign(result, flattenInitialState(item, `${prefix}_${i}`));
      }
    });
    return result;
  }

  for (const [key, val] of Object.entries(obj as Record<string, unknown>)) {
    const fullKey = prefix ? `${prefix}_${key}` : key;

    if (val === null || val === undefined) continue;

    // Plain object → recurse
    if (typeof val === 'object' && !Array.isArray(val)) {
      Object.assign(result, flattenInitialState(val, fullKey));
      continue;
    }

    // Array (handled above, but guard here for safety)
    if (Array.isArray(val)) {
      if (val.length > 0 && val.every(v => typeof v === 'number' || typeof v === 'boolean' || typeof v === 'string')) {
        result[fullKey] = scalarArrayToString(val);
        continue;
      }
      val.forEach((item, i) => {
        if (typeof item === 'object' && item !== null) {
          Object.assign(result, flattenInitialState(item, `${fullKey}_${i}`));
        }
      });
      continue;
    }

    // Scalar — keep as-is
    result[fullKey] = val;
  }

  return result;
}

/**
 * Attempts to extract numeric min/max range from a flattened state key that
 * looks like `slider_name_rangeMin`.  This is a heuristic used by introspectField
 * to set slider range bounds when the AI provides them alongside the value.
 */
export function extractRange(
  state: Record<string, unknown>,
  valueKey: string,
): { min?: number; max?: number } {
  const base = valueKey.replace(/_rangeMin$|_rangeMax$/, '');
  const minKey = `${base}_rangeMin`;
  const maxKey = `${base}_rangeMax`;
  return {
    min: typeof state[minKey] === 'number' ? (state[minKey] as number) : undefined,
    max: typeof state[maxKey] === 'number' ? (state[maxKey] as number) : undefined,
  };
}
