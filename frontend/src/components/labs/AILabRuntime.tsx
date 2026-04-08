/**
 * AILabRuntime — executes AI-generated TSX render code via new Function().
 *
 * Architecture:
 *   LLM (lab_service) generates a complete TSX component string → stored in
 *   LabDefinition.render_code → fetched by frontend → passed to AILabRuntime.
 *
 *   AILabRuntime calls new Function() to create the React component, injects
 *   Canvas2D helpers (ctx_arrow, ctx_grid, etc.) and molecule data, then
 *   renders it like any normal React component.
 *
 * Fallback chain:
 *   renderCode present → AILabRuntime executes it
 *   renderCode absent → caller falls back to StructuredLabRenderer / GenericDynamicRenderer
 */

import React, {
  useEffect, useState, useCallback, useRef, useMemo, createElement, type ComponentType,
} from 'react';
import type { LabState } from './types';

// ── Execution environment helpers (injected into new Function) ──────────────

function ctx_arrow(ctx: CanvasRenderingContext2D, x1: number, y1: number, x2: number, y2: number, color: string, lw = 2) {
  const dx = x2 - x1, dy = y2 - y1;
  const len = Math.sqrt(dx * dx + dy * dy);
  if (len < 2) return;
  const ux = dx / len, uy = dy / len;
  const hs = 8;
  ctx.strokeStyle = color; ctx.fillStyle = color; ctx.lineWidth = lw;
  ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(x2, y2);
  ctx.lineTo(x2 - ux * hs - uy * hs * 0.5, y2 - uy * hs + ux * hs * 0.5);
  ctx.lineTo(x2 - ux * hs + uy * hs * 0.5, y2 - uy * hs - ux * hs * 0.5);
  ctx.closePath(); ctx.fill();
}

function ctx_grid(ctx: CanvasRenderingContext2D, W: number, H: number, color = '#1e293b') {
  ctx.strokeStyle = color; ctx.lineWidth = 0.5;
  for (let x = 0; x < W; x += 40) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke(); }
  for (let y = 0; y < H; y += 40) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }
}

function ctx_battery(ctx: CanvasRenderingContext2D, x: number, y: number, value: number, unit: string, label: string, color: string) {
  ctx.strokeStyle = color; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(x - 2, y - 8); ctx.lineTo(x - 2, y + 2); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(x + 6, y - 4); ctx.lineTo(x + 6, y + 4); ctx.stroke();
  ctx.fillStyle = color; ctx.font = '9px monospace'; ctx.textAlign = 'left';
  ctx.fillText(label + (unit ? `=${value}${unit}` : `=${value}`), x + 10, y + 4);
  ctx.font = 'bold 9px monospace';
  ctx.fillText('+', x - 6, y - 10); ctx.fillText('-', x + 4, y + 6);
}

function ctx_resistor(ctx: CanvasRenderingContext2D, x: number, y: number, value: number, unit: string, label: string, dir: string, color: string) {
  ctx.strokeStyle = color; ctx.lineWidth = 2;
  const arm = 12, segW = 10;
  if (dir === 'h') {
    ctx.beginPath(); ctx.moveTo(x - arm, y);
    for (let i = 0; i < 6; i++) ctx.lineTo(x - arm + (i + 0.5) * segW, y + (i % 2 === 0 ? -6 : 6));
    ctx.lineTo(x + arm, y); ctx.stroke();
  } else {
    ctx.beginPath(); ctx.moveTo(x, y - arm);
    for (let i = 0; i < 6; i++) ctx.lineTo(x + (i % 2 === 0 ? -6 : 6), y - arm + (i + 0.5) * segW);
    ctx.lineTo(x, y + arm); ctx.stroke();
  }
  ctx.fillStyle = '#9ca3af'; ctx.font = '9px monospace'; ctx.textAlign = 'center';
  ctx.fillText(label + (unit ? `=${value}${unit}` : `=${value}`), x, y + (dir === 'h' ? 16 : 0));
}

function ctx_switch(ctx: CanvasRenderingContext2D, x: number, y: number, label: string, closed: boolean, _onClick?: () => void) {
  ctx.strokeStyle = closed ? '#34d399' : '#ef4444'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.arc(x - 8, y, 3, 0, Math.PI * 2); ctx.stroke();
  ctx.beginPath(); ctx.arc(x + 8, y, 3, 0, Math.PI * 2); ctx.stroke();
  ctx.beginPath();
  if (closed) { ctx.moveTo(x - 8, y); ctx.lineTo(x + 8, y); }
  else { ctx.moveTo(x - 8, y); ctx.lineTo(x + 2, y - 10); }
  ctx.stroke();
  ctx.fillStyle = ctx.strokeStyle; ctx.font = '8px monospace'; ctx.textAlign = 'center';
  ctx.fillText(closed ? 'ON' : 'OFF', x, y + 14);
  // Register click in global map (canvas onClick uses this)
  CLICK_MAP.set(`${x},${y}`, _onClick ?? (() => { }));
}

function ctx_bulb(ctx: CanvasRenderingContext2D, x: number, y: number, value: number, unit: string, label: string, lit: boolean, color: string) {
  if (lit) {
    const g = ctx.createRadialGradient(x, y, 5, x, y, 30);
    g.addColorStop(0, 'rgba(251,191,36,0.3)'); g.addColorStop(1, 'transparent');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, 30, 0, Math.PI * 2); ctx.fill();
  }
  ctx.strokeStyle = lit ? color : '#374151'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.arc(x, y, 10, 0, Math.PI * 2); ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(x - 5, y + 4); ctx.lineTo(x - 2, y - 4); ctx.lineTo(x + 2, y + 4); ctx.lineTo(x + 5, y - 4);
  ctx.stroke();
  ctx.fillStyle = '#9ca3af'; ctx.font = '9px monospace'; ctx.textAlign = 'center';
  ctx.fillText(label + (unit ? `=${value}${unit}` : `=${value}`), x, y + 24);
}

// ── Global click map for circuit interactions ────────────────────────────────
export const CLICK_MAP = new Map<string, () => void>();

// ── Molecule data (chemistry experiments) ───────────────────────────────────
const ATOM_COLOR: Record<string, string> = {
  H: '#e2e8f0', O: '#ef4444', C: '#4b5563', N: '#3b5bdb',
  Cl: '#22c55e', S: '#eab308', P: '#f97316',
};
const ATOM_R: Record<string, number> = {
  H: 13, O: 20, C: 20, N: 18, Cl: 24, S: 22, P: 21,
};

interface MolAtom { id: string; el: string; x: number; y: number; z: number; }
interface MolBond { a: string; b: string; order: 1 | 2 | 3; }
interface MolData { name: string; formula: string; atoms: MolAtom[]; bonds: MolBond[]; }

export const MOLECULES: Record<string, MolData> = {
  water: {
    name: 'Water', formula: 'H₂O',
    atoms: [{ id: 'O', el: 'O', x: 0, y: 0, z: 0 }, { id: 'H1', el: 'H', x: -78, y: -58, z: -18 }, { id: 'H2', el: 'H', x: 78, y: -58, z: -18 }],
    bonds: [{ a: 'O', b: 'H1', order: 1 }, { a: 'O', b: 'H2', order: 1 }],
  },
  co2: {
    name: 'CO₂', formula: 'Linear',
    atoms: [{ id: 'C', el: 'C', x: 0, y: 0, z: 0 }, { id: 'O1', el: 'O', x: -115, y: 0, z: 0 }, { id: 'O2', el: 'O', x: 115, y: 0, z: 0 }],
    bonds: [{ a: 'C', b: 'O1', order: 2 }, { a: 'C', b: 'O2', order: 2 }],
  },
  ammonia: {
    name: 'NH₃', formula: 'Trigonal pyramidal',
    atoms: [{ id: 'N', el: 'N', x: 0, y: 28, z: 0 }, { id: 'H1', el: 'H', x: -80, y: -36, z: 56 }, { id: 'H2', el: 'H', x: 80, y: -36, z: 56 }, { id: 'H3', el: 'H', x: 0, y: -36, z: -82 }],
    bonds: [{ a: 'N', b: 'H1', order: 1 }, { a: 'N', b: 'H2', order: 1 }, { a: 'N', b: 'H3', order: 1 }],
  },
  methane: {
    name: 'CH₄', formula: 'Tetrahedral',
    atoms: [{ id: 'C', el: 'C', x: 0, y: 0, z: 0 }, { id: 'H1', el: 'H', x: 72, y: 72, z: 72 }, { id: 'H2', el: 'H', x: 72, y: -72, z: -72 }, { id: 'H3', el: 'H', x: -72, y: 72, z: -72 }, { id: 'H4', el: 'H', x: -72, y: -72, z: 72 }],
    bonds: [{ a: 'C', b: 'H1', order: 1 }, { a: 'C', b: 'H2', order: 1 }, { a: 'C', b: 'H3', order: 1 }, { a: 'C', b: 'H4', order: 1 }],
  },
  ethanol: {
    name: 'Ethanol', formula: 'C₂H₅OH',
    atoms: [{ id: 'C1', el: 'C', x: -82, y: 0, z: 0 }, { id: 'C2', el: 'C', x: 42, y: 0, z: 0 }, { id: 'O', el: 'O', x: 118, y: -52, z: 0 }, { id: 'H1', el: 'H', x: -132, y: -60, z: 36 }, { id: 'H2', el: 'H', x: -132, y: -60, z: -36 }, { id: 'H3', el: 'H', x: -92, y: 80, z: 0 }, { id: 'H4', el: 'H', x: 52, y: 72, z: 46 }, { id: 'H5', el: 'H', x: 52, y: 72, z: -46 }, { id: 'H6', el: 'H', x: 172, y: -52, z: 0 }],
    bonds: [{ a: 'C1', b: 'C2', order: 1 }, { a: 'C2', b: 'O', order: 1 }, { a: 'C1', b: 'H1', order: 1 }, { a: 'C1', b: 'H2', order: 1 }, { a: 'C1', b: 'H3', order: 1 }, { a: 'C2', b: 'H4', order: 1 }, { a: 'C2', b: 'H5', order: 1 }, { a: 'O', b: 'H6', order: 1 }],
  },
};

// ── Props ────────────────────────────────────────────────────────────────────

export interface AILabRuntimeProps {
  /** AI 生成的 TSX 渲染组件代码字符串 */
  renderCode: string;
  /** 当前实验状态 */
  state: LabState;
  /** 状态变更回调 */
  onStateChange?: (patch: Partial<LabState>) => void;
  /** 只读模式（隐藏交互控件） */
  readonly?: boolean;
  /** 动画时间（秒），由 DynamicLabHost 递增传入 */
  t?: number;
}

interface LabRendererProps {
  state: Record<string, unknown>;
  /**
   * LLM 常写 `props.initial_state` / `props.initialState`，与运行时 `state` 同义（initialState 的当前值）。
   */
  initial_state?: Record<string, unknown>;
  initialState?: Record<string, unknown>;
  /**
   * LLM 常写 `const { createElement: h } = props`，须从外部注入 React.createElement。
   */
  createElement?: typeof createElement;
  onStateChange?: (patch: Partial<Record<string, unknown>>) => void;
  readonly?: boolean;
  t: number;
}

// ── AILabRuntime component ───────────────────────────────────────────────────

const LEADING_INVISIBLE_RE = /^[\uFEFF\u200B\u200C\u200D\u2060]+/;

/**
 * LLM often stores render_code as if it were inside a JSON string: literal `\\`` and `\\${`
 * instead of template literals. `new Function()` parses real JS — those backslashes cause
 * "Invalid or unexpected token".
 */
function fixJsonEscapedTemplateLiterals(s: string): string {
  return s.replace(/\\\$\{/g, '${').replace(/\\`/g, '`');
}

/**
 * Word processors / LLM output sometimes use Unicode quotes. Inside JS source they break
 * tokenization → "Invalid or unexpected token" in `new Function`.
 */
function normalizeSmartQuotesAndJsSeparators(s: string): string {
  return s
    .replace(/\u2018/g, "'")
    .replace(/\u2019/g, "'")
    .replace(/\u201c/g, '"')
    .replace(/\u201d/g, '"')
    .replace(/\u2028/g, '\n')
    .replace(/\u2029/g, '\n');
}

/**
 * Copy-paste / outer template wrapper sometimes leaves `` `; `` after the closing `}` of
 * `export default function ...`.
 */
function stripTrailingStrayBackticksAfterClosingBrace(s: string): string {
  const t = s.trimEnd();
  if (/}\s*`+\s*;?\s*$/.test(t)) {
    return t.replace(/}\s*`+\s*;?\s*$/, '}').trimEnd();
  }
  return s;
}

/**
 * LLM / manual DB edits often add: markdown fences, outer \`...\`, zero-width chars, or blank lines
 * before `export default`. Strip so `stripImportsAndExportDefault` can match ^export.
 */
/**
 * LLM 常在对象字面量里写未加引号的 SVG 属性名，如 marker-end: 'url(#a)'。
 * JS 会解析成 marker - end（减法），导致 new Function 报 Unexpected token '-'。
 * 仅替换「前一个字符不是引号」的匹配，避免破坏已写好的 'stroke-width':。
 */
function fixUnquotedHyphenatedSvgKeysInRenderCode(src: string): string {
  const keys = [
    'marker-end', 'marker-start', 'marker-mid', 'clip-path',
    'stroke-width', 'stroke-linecap', 'stroke-linejoin', 'stroke-dasharray', 'stroke-dashoffset',
    'fill-opacity', 'stroke-opacity', 'font-size', 'font-family', 'font-weight',
    'text-anchor', 'dominant-baseline', 'alignment-baseline', 'pointer-events',
    'stroke-miterlimit', 'flood-opacity', 'stop-color', 'stop-opacity',
  ];
  let s = src;
  for (const key of keys) {
    const esc = key.replace(/-/g, '\\-');
    s = s.replace(new RegExp(`(?<![\\\\'"])\\b${esc}\\s*:`, 'g'), `'${key}':`);
  }
  return s;
}

/** 与 AILabRuntime 注入的 React createElement 不兼容，且常伴随 return 真实 DOM。
 *  注意：此检查在 rewriteDocumentCreateElementNS 之后运行，此时 document.* 已消除。 */
function assertNoBrowserDomCreateElement(src: string): void {
  if (/\bdocument\.createElement(NS)?\b/.test(src)) {
    throw new Error(
      'render_code 使用了 document.createElement / createElementNS。前端仅支持 React 的 createElement(\'svg\'|\'div\'|…)。请从 props 解构 state/onStateChange/readonly/t，勿返回 DOM 节点。',
    );
  }
}

/**
 * 将 LLM 生成的 `document.createElementNS` / `document.createTextNode` 翻译成
 * 前端注入的 `createElement`，使旧版 render_code 无需修改即可在 AILabRuntime 中运行。
 *
 * 典型 LLM 输出模式:
 *   const createElement = (tag, attrs, children) => {
 *     const el = document.createElementNS('http://www.w3.org/2000/svg', tag);
 *     Object.entries(attrs).forEach(([k, v]) => el.setAttribute(k, String(v)));
 *     children.forEach(c => el.appendChild(c));
 *     return el;
 *   };
 *   const text = (x, y, content, attrs) =>
 *     createElement('text', { x, y, fill: '#fff' }, [document.createTextNode(content)]);
 *
 *  → 去除 document.createElementNS / document.createTextNode，保留业务逻辑函数。
 *  → `svg.appendChild(...)` 由 Proxy 兜底，无需改写。
 */
/**
 * LLM 有时写 `const h = globalThis.createElement ?? …`。浏览器里 globalThis 上没有 React 的
 * createElement（只有注入的局部 createElement），会得到 null → "h is not a function"。
 * 统一替换为注入的 createElement。
 */
function rewriteGlobalThisCreateElementAlias(src: string): string {
  return src
    .replace(/\bglobalThis\.createElement\b/g, 'createElement')
    .replace(/\bwindow\.createElement\b/g, 'createElement');
}

function rewriteDocumentCreateElementNS(src: string): string {
  let s = src;

  // 1. 移除 LLM 自己定义的 createElement 包装函数（前端已注入同名函数）。
  //    匹配多行箭头函数体中的 document.createElementNS。
  s = s.replace(
    /const\s+createElement\s*=\s*\([^)]*\)\s*=>\s*\{[\s\S]*?document\.createElementNS[\s\S]*?\n\s*\};?/g,
    '',
  );

  // 2. 替换 document.createElementNS('...svg...', 'tag', attrs?, children?)
  //    → createElement('tag', attrs, children?)
  //    同时处理 document.createTextNode(var) → var（React text children 即字符串）
  //
  //    正则匹配 4 种调用形式（attrs/children 可省略）：
  //      (a) document.createElementNS('...', 'tag')
  //      (b) document.createElementNS('...', 'tag', attrs)
  //      (c) document.createElementNS('...', 'tag', attrs, children)
  //      (d) document.createElementNS('...', 'tag', attrs, children, extra)
  //
  //    替换为: createElement('tag', attrs || null, ...children)
  s = s.replace(
    /document\.createElementNS\s*\(\s*['"]http:\/\/www\.w3\.org\/2000\/svg['"]\s*,\s*['"]([a-zA-Z][a-zA-Z0-9]*)['"]\s*(?:,\s*(\w+(?:\.\w+)?(?:\s*\.\s*\w+)*))?\s*(?:,\s*(\[[\s\S]*?\]))?\s*(?:,\s*([\s\S]+?))?\s*\)/g,
    (_m, tag, attrs, childrenBracket, restChildren) => {
      const tagStr = `'${tag}'`;
      // attrs：可能是变量名（如 props）或对象字面量 { x, y }
      const attrsStr = attrs ? attrs.trim() : 'null';
      // children：方括号数组 [a, b]、或展开 [...args]、或单变量
      // 如果有 childrenBracket 或 restChildren，拼出来；否则无 children
      let allChildren = '';
      if (childrenBracket !== undefined && childrenBracket) {
        // 处理 document.createTextNode(x) → x
        const cleanedChildren = childrenBracket
          .replace(/document\.createTextNode\s*\(\s*(\w+)\s*\)/g, '$1')
          .trim();
        allChildren = cleanedChildren;
      }
      if (restChildren !== undefined && restChildren) {
        const cleanedRest = restChildren
          .replace(/document\.createTextNode\s*\(\s*(\w+)\s*\)/g, '$1')
          .trim();
        allChildren = allChildren ? `${allChildren}, ${cleanedRest}` : cleanedRest;
      }
      return allChildren
        ? `createElement(${tagStr}, ${attrsStr}, ${allChildren})`
        : `createElement(${tagStr}, ${attrsStr})`;
    },
  );

  return s;
}

/**
 * Some LLM outputs define their own `createElement` that returns a plain object
 * like `{ tag, attrs, children }`. That shadows the injected React `createElement`
 * and crashes React with:
 *   "Objects are not valid as a React child (found: object with keys {tag, attrs, children})".
 *
 * We strip those local `createElement` definitions so all code uses the injected one,
 * and additionally rewrite common `h(tag, attrs, children)` helpers that return
 * `{tag, attrs, children}` into React `createElement(tag, attrs, ...children)` calls.
 */
function rewritePlainObjectVdomFactories(src: string): string {
  let s = src;

  // 1) Strip any top-level `function createElement(...) { ... }`
  //    and `const createElement = (...) => ...` definitions (non-module script runtime).
  //    Keep this intentionally broad: injected `createElement` is the only supported one.
  s = s.replace(
    /(^|\n)\s*function\s+createElement\s*\([\s\S]*?\)\s*\{[\s\S]*?\}\s*/g,
    '\n',
  );
  s = s.replace(
    /(^|\n)\s*const\s+createElement\s*=\s*\([\s\S]*?\)\s*=>\s*\{[\s\S]*?\}\s*;?/g,
    '\n',
  );
  s = s.replace(
    /(^|\n)\s*const\s+createElement\s*=\s*\([\s\S]*?\)\s*=>\s*\([\s\S]*?\)\s*;?/g,
    '\n',
  );

  // 2) Rewrite common `h(tag, attrs, children)` factories that return `{ tag, attrs, children }`.
  //    Example:
  //      const h = (tag, attrs, children) => ({ tag, attrs, children });
  //    → const h = (tag, attrs, children) => createElement(tag, attrs ?? null, ...(Array.isArray(children) ? children : (children != null ? [children] : [])));
  s = s.replace(
    /const\s+([a-zA-Z_$][\w$]*)\s*=\s*\(\s*tag\s*,\s*attrs\s*,\s*children\s*\)\s*=>\s*\(\s*\{\s*tag\s*,\s*attrs\s*,\s*children\s*\}\s*\)\s*;?/g,
    (_m, name) =>
      `const ${name} = (tag, attrs, children) => createElement(tag, attrs ?? null, ...(Array.isArray(children) ? children : (children != null ? [children] : [])));`,
  );
  s = s.replace(
    /function\s+([a-zA-Z_$][\w$]*)\s*\(\s*tag\s*,\s*attrs\s*,\s*children\s*\)\s*\{\s*return\s*\{\s*tag\s*,\s*attrs\s*,\s*children\s*\}\s*;\s*\}/g,
    (_m, name) =>
      `function ${name}(tag, attrs, children) { return createElement(tag, attrs ?? null, ...(Array.isArray(children) ? children : (children != null ? [children] : []))); }`,
  );

  return s;
}

function normalizeRenderCodeSource(raw: string): string {
  let s = raw.trim().replace(/^\uFEFF/, '');
  s = s.replace(LEADING_INVISIBLE_RE, '').trim();

  const mdOpen = /^```(?:tsx?|typescript|javascript|js|jsx)?\s*\r?\n?/i;
  const mdClose = /\r?\n```\s*$/;
  if (mdOpen.test(s) && mdClose.test(s)) {
    s = s.replace(mdOpen, '').replace(mdClose, '').trim();
  }

  for (let i = 0; i < 3; i++) {
    if (s.length >= 2 && s.startsWith('`') && s.endsWith('`')) {
      s = s.slice(1, -1).trim();
    } else break;
  }
  s = s.replace(LEADING_INVISIBLE_RE, '').trim();
  s = fixJsonEscapedTemplateLiterals(s);
  s = normalizeSmartQuotesAndJsSeparators(s);
  s = stripTrailingStrayBackticksAfterClosingBrace(s);
  return s;
}

/** Narrow / exotic spaces break `^export\\s+default` matching; normalize for stripping only. */
function normalizeSpacesForModuleStrip(s: string): string {
  return s.replace(/[\u00A0\u1680\u2000-\u200A\u202F\u205F\u3000]/g, ' ');
}

/** When `export default` is not at string start (leading comments / blank lines). */
function sliceFromFirstExportDefault(s: string): string {
  const lines = s.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const t = normalizeSpacesForModuleStrip(lines[i]).replace(/^[\uFEFF\u200B\u200C\u200D\u2060\s]+/, '');
    if (/^export\s+default\s+/.test(t)) {
      return [t, ...lines.slice(i + 1)].join('\n');
    }
  }
  return s;
}

/** Migrated TSX in DB uses JSX; `new Function` cannot parse `<`. Rewrite common canvas return. */
function rewriteLegacyCanvasJsx(src: string): string {
  const mid =
    '<canvas\\s+ref=\\{\\s*canvasRef\\s*\\}\\s+width=\\{\\s*(\\d+)\\s*\\}\\s+height=\\{\\s*(\\d+)\\s*\\}\\s+style=\\{\\{\\s*width:\\s*[\'"]100%[\'"],\\s*display:\\s*[\'"]block[\'"]\\s*\\}\\}\\s*\\/>';
  const repl = (_: string, w: string, h: string) =>
    `return createElement('canvas', { ref: canvasRef, width: ${w}, height: ${h}, style: { width: '100%', display: 'block' } });`;
  return src
    .replace(new RegExp(`return\\s*\\(\\s*\\r?\\n\\s*${mid}\\s*\\r?\\n\\s*\\)\\s*;?`, 'g'), repl)
    .replace(new RegExp(`return\\s*\\(\\s*${mid}\\s*\\)\\s*;?`, 'g'), repl);
}

/** `new Function()` runs as a script, not an ES module — `import` / `export` are syntax errors. */
function stripImportsAndExportDefault(src: string): { inner: string; returnStmt: string } {
  let s = normalizeSpacesForModuleStrip(src.trim().replace(/^\uFEFF/, ''));
  const lines = s.split('\n');
  let start = 0;
  while (start < lines.length && /^\s*import\s/.test(normalizeSpacesForModuleStrip(lines[start]))) start++;
  s = lines.slice(start).join('\n').trim();
  s = sliceFromFirstExportDefault(s);
  s = normalizeSpacesForModuleStrip(s).trim();

  // Optional `async` (must be before `function`); preserve it — stripping to bare `function` breaks `await` in body.
  const named = s.match(/^export\s+default\s+(?:async\s+)?function\s+(\w+)\s*\(/);
  if (named) {
    const name = named[1];
    const inner = s.replace(
      /^export\s+default\s+((?:async\s+)?)function\s+(\w+)\s*\(/,
      (_m, asyncPart: string, fnName: string) => `${asyncPart || ''}function ${fnName}(`,
    );
    return { inner, returnStmt: `return ${name};` };
  }
  if (/^export\s+default\s+(?:async\s+)?function\s*\(/.test(s)) {
    const inner = s.replace(
      /^export\s+default\s+((?:async\s+)?)function\s*\(/,
      (_m, asyncPart: string) => `${asyncPart || ''}function _AILabDefaultComponent(`,
    );
    return { inner, returnStmt: 'return _AILabDefaultComponent;' };
  }
  if (/^export\s+default\s+/.test(s)) {
    let inner = s.replace(/^export\s+default\s+/, 'const _AILabDefaultComponent = ');
    inner = inner.replace(/;+\s*$/, '');
    inner = `${inner};`;
    return { inner, returnStmt: 'return _AILabDefaultComponent;' };
  }
  throw new Error('render_code: 未找到 export default（无法在非 module 环境下执行）');
}

/**
 * LLM 有时在 default 导出后追加 `export { … }` / `export const …`，在 script 目标下会报 Unexpected token 'export'。
 * 仅删除「整行且为简单 export 声明」的行，避免误伤字符串内的文本。
 */
function stripStrayTopLevelExportLines(inner: string): string {
  return inner
    .split('\n')
    .filter((line) => {
      const t = normalizeSpacesForModuleStrip(line).replace(/^[\uFEFF\u200B\u200C\u200D\u2060\s]+/, '');
      if (!t || /^\/\//.test(t)) return true;
      if (/^export\s*\{/.test(t)) return false;
      if (/^export\s+(?:const|let|var|class|function|async\s+function|type|interface)\b/.test(t)) return false;
      if (/^export\s*;?\s*$/.test(t)) return false;
      return true;
    })
    .join('\n');
}

type AILabVNode = {
  __ailab_vnode: true;
  type: unknown;
  props: Record<string, unknown> | null;
  children: unknown[];
};

function isAILabVNode(v: unknown): v is AILabVNode {
  return typeof v === 'object' && v !== null && (v as { __ailab_vnode?: unknown }).__ailab_vnode === true;
}

function toReactNode(v: unknown): unknown {
  if (v == null) return v;
  if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') return v;
  if (Array.isArray(v)) return v.map(toReactNode);
  if (React.isValidElement(v)) return v;
  if (isAILabVNode(v)) {
    const children = (v.children ?? []).map(toReactNode);
    return React.createElement(v.type as any, v.props as any, ...children);
  }
  // Unknown plain object: don't crash the whole app; render nothing.
  return null;
}

function compileRenderCode(renderCode: string): ComponentType<LabRendererProps> {
  const normalized = rewriteLegacyCanvasJsx(
    rewriteDocumentCreateElementNS(
      rewriteGlobalThisCreateElementAlias(
        rewritePlainObjectVdomFactories(
          fixUnquotedHyphenatedSvgKeysInRenderCode(normalizeRenderCodeSource(renderCode)),
        ),
      ),
    ),
  );
  assertNoBrowserDomCreateElement(normalized);
  const { inner, returnStmt } = stripImportsAndExportDefault(normalized);
  const innerStripped = stripStrayTopLevelExportLines(inner);

  // Only pass `React` as the hooks bag — do NOT also name parameters `useEffect`, etc.
  // or `const { useEffect } = React` in the body throws "Identifier 'useEffect' has already been declared".
  // `createElement` is required: eval'd code must not contain JSX (`Unexpected token '<'`).
  //
  // LLM 常对 createElement 返回值调用 svg.appendChild（DOM API）。React 元素无此方法。
  // React 19 可能冻结元素，Object.defineProperty 会失败；改用 Proxy 拦截 appendChild，始终可用。
  const factory = new Function(
    'React',
    'ctx_arrow', 'ctx_grid', 'ctx_battery', 'ctx_resistor', 'ctx_switch', 'ctx_bulb',
    'CLICK_MAP', 'MOLECULES', 'ATOM_COLOR', 'ATOM_R',
    `
    const { useEffect, useRef, useState, useCallback, useMemo, Fragment: _Fragment, createElement: _reactCreateElement } = React;
    // IMPORTANT: In React 19, element/props may be frozen. Many LLM render_code snippets
    // use imperative svg.appendChild(...) which would silently fail if we try to mutate
    // element.props.children. To support that pattern, we build a small mutable VNode tree
    // here, and the outer runtime converts it to real React elements after the component runs.
    function createElement(type, props) {
      var rest = Array.prototype.slice.call(arguments, 2);
      var node = {
        __ailab_vnode: true,
        type: type,
        props: props != null ? props : null,
        children: rest || [],
      };
      return new Proxy(node, {
        get: function (target, prop) {
          if (prop === 'appendChild') {
            return function (child) {
              if (child == null) return child;
              target.children.push(child);
              return child;
            };
          }
          return target[prop];
        },
      });
    }
    ${innerStripped}
    ${returnStmt}
    `,
  );

  const component = factory(
    { useEffect, useRef, useState, useCallback, useMemo, Fragment: null, createElement },
    ctx_arrow, ctx_grid, ctx_battery, ctx_resistor, ctx_switch, ctx_bulb,
    CLICK_MAP, MOLECULES, ATOM_COLOR, ATOM_R,
  );

  if (!component) throw new Error('render_code factory returned null component');
  const Raw = component as ComponentType<LabRendererProps>;
  const Wrapped: ComponentType<LabRendererProps> = (props) => {
    const out = Raw(props);
    return toReactNode(out) as any;
  };
  return Wrapped;
}

export default function AILabRuntime({
  renderCode,
  state,
  onStateChange,
  readonly = false,
  t: externalT = 0,
}: AILabRuntimeProps) {
  const [error, setError] = useState<string | null>(null);
  const [Compiled, setCompiled] = useState<ComponentType<LabRendererProps> | null>(null);

  // Never call setState during render — compile in an effect only (fixes infinite re-renders).
  useEffect(() => {
    let cancelled = false;
    setError(null);
    setCompiled(null);
    try {
      const Comp = compileRenderCode(renderCode);
      if (!cancelled) setCompiled(() => Comp);
    } catch (e) {
      if (!cancelled) {
        setCompiled(null);
        setError(e instanceof Error ? e.message : String(e));
      }
    }
    return () => {
      cancelled = true;
    };
  }, [renderCode]);

  const stableOnPatch = useCallback(
    (patch: Partial<Record<string, unknown>>) => {
      onStateChange?.(patch as Partial<LabState>);
    },
    [onStateChange],
  );

  if (error) {
    return (
      <div style={{ background: '#0b1120', borderRadius: '10px', padding: '16px', color: '#ef4444', fontFamily: 'monospace', fontSize: '12px' }}>
        <div style={{ marginBottom: '8px', color: '#f97316' }}>[render_code 执行错误]</div>
        <div style={{ color: '#ef4444', whiteSpace: 'pre-wrap', wordBreak: 'break-all', fontSize: '11px' }}>{error}</div>
      </div>
    );
  }

  if (!Compiled) {
    return (
      <div style={{ background: '#0b1120', borderRadius: '10px', height: '300px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#6b7280', fontFamily: 'monospace', fontSize: '12px' }}>
        正在编译渲染组件…
      </div>
    );
  }

  const stateObj = state as Record<string, unknown>;
  return (
    <div style={{ display: 'inline-block', verticalAlign: 'top', width: 'fit-content', maxWidth: '100%' }}>
      <Compiled
        state={stateObj}
        initial_state={stateObj}
        initialState={stateObj}
        createElement={createElement}
        onStateChange={stableOnPatch}
        readonly={readonly}
        t={externalT}
      />
    </div>
  );
}