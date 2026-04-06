/**
 * StructuredLabRenderer — AI-driven lab rendering via renderSpec.
 *
 * Priority order:
 *   1. definition.visual_hint.renderSpec  (AI provided in LabComponentDefinition JSON)
 *   2. llmResult.render_spec              (AI inferred by classify-render service)
 *   3. None                               → fallback to generic drawXxx in DynamicLabHost
 *
 * Rendering strategy (per spec present):
 *   A. drawing_commands → Canvas2D commands (axes, guides, custom paths)
 *   B. components + wires → grid-placed symbols (battery, lens, …)
 *   C. annotations → numeric overlays bound to state keys
 *
 * A and B both run when present (commands first, then components). Previously, non-empty
 * drawing_commands caused an early return and skipped B — a common reason lenses/rays
 * “disappeared” when the model only emitted axis lines in drawing_commands.
 *
 * Note: `topology` (e.g. lens_array) is metadata only; the renderer does not auto-generate
 * rays or lenses from topology + initial_state — those must appear in components or drawing_commands.
 *
 * The renderer is stateless — all state comes from `spec`, `state`, and `fields`.
 * Animation time `t` is passed through so drawing_commands can use it.
 */
import type {
  RenderSpec,
  RenderSpecComponent,
  RenderSpecWire,
  RenderSpecDrawingCommand,
  RenderSpecAnnotation,
} from './types';

// ── Shared helpers ───────────────────────────────────────────────────────────────

function px(norm: number, total: number, pad = 0): number {
  return pad + norm * (total - pad * 2);
}

function py(norm: number, total: number, pad = 0): number {
  return total - pad - norm * (total - pad * 2); // y is inverted
}

function resolveValue(valueKey: string | undefined, state: Record<string, unknown>): number {
  if (!valueKey) return 0;
  const v = state[valueKey];
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string') { const n = parseFloat(v); if (Number.isFinite(n)) return n; }
  return 0;
}

// ── Arrow helper (mirrors DynamicLabHost.drawArrow) ──────────────────────────

function drawArrow(
  ctx: CanvasRenderingContext2D,
  x1: number, y1: number,
  x2: number, y2: number,
  color: string,
  lw = 2,
) {
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

// ── Standard component drawers ───────────────────────────────────────────────────

function drawResistor(
  ctx: CanvasRenderingContext2D,
  x: number, y: number,
  dir: 'h' | 'v' | 'h_flip' | 'v_flip',
  label: string | undefined,
  value: number,
  unit: string | undefined,
  color = '#60a5fa',
  lw = 2,
) {
  ctx.strokeStyle = color; ctx.lineWidth = lw;
  const arm = 12, segW = 10;
  if (dir === 'h' || dir === 'h_flip') {
    const flip = dir === 'h_flip' ? -1 : 1;
    ctx.beginPath();
    ctx.moveTo(x - arm, y);
    for (let i = 0; i < 6; i++) {
      ctx.lineTo(x - arm + (i + 0.5) * segW, y + flip * (i % 2 === 0 ? -6 : 6));
    }
    ctx.lineTo(x + arm, y);
    ctx.stroke();
  } else {
    const flip = dir === 'v_flip' ? -1 : 1;
    ctx.beginPath();
    ctx.moveTo(x, y - arm);
    for (let i = 0; i < 6; i++) {
      ctx.lineTo(x + flip * (i % 2 === 0 ? -6 : 6), y - arm + (i + 0.5) * segW);
    }
    ctx.lineTo(x, y + arm);
    ctx.stroke();
  }
  ctx.fillStyle = '#9ca3af'; ctx.font = '9px monospace'; ctx.textAlign = 'center';
  const display = unit ? `${value}${unit}` : `${value}`;
  ctx.fillText(label ? `${label}=${display}` : display, x, y + (dir === 'h' || dir === 'h_flip' ? 16 : 0));
}

function drawBattery(
  ctx: CanvasRenderingContext2D,
  x: number, y: number,
  label: string | undefined,
  value: number,
  unit: string | undefined,
  color = '#fbbf24',
) {
  ctx.strokeStyle = color; ctx.lineWidth = 2;
  // Long line (positive)
  ctx.beginPath(); ctx.moveTo(x - 2, y - 8); ctx.lineTo(x - 2, y + 2); ctx.stroke();
  // Short line (negative)
  ctx.beginPath(); ctx.moveTo(x + 6, y - 4); ctx.lineTo(x + 6, y + 4); ctx.stroke();
  // Labels
  ctx.fillStyle = color; ctx.font = '9px monospace'; ctx.textAlign = 'left';
  const display = unit ? `${value}${unit}` : `${value}`;
  ctx.fillText(label ? `${label}=${display}` : display, x + 10, y + 4);
  // +/- signs
  ctx.font = 'bold 9px monospace';
  ctx.fillText('+', x - 6, y - 10);
  ctx.fillText('-', x + 4, y + 6);
}

function drawCapacitor(
  ctx: CanvasRenderingContext2D,
  x: number, y: number,
  dir: 'h' | 'v' | 'h_flip' | 'v_flip',
  label: string | undefined,
  value: number,
  unit: string | undefined,
  color = '#a78bfa',
) {
  ctx.strokeStyle = color; ctx.lineWidth = 2;
  const gap = 12;
  if (dir === 'h' || dir === 'h_flip') {
    ctx.beginPath(); ctx.moveTo(x - gap - 4, y - 6); ctx.lineTo(x - gap - 4, y + 6); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x - gap, y - 6); ctx.lineTo(x - gap, y + 6); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x + gap, y - 6); ctx.lineTo(x + gap, y + 6); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x + gap + 4, y - 6); ctx.lineTo(x + gap + 4, y + 6); ctx.stroke();
    ctx.strokeRect(x - gap - 4, y - 6, 4, 12);
    ctx.strokeRect(x + gap, y - 6, 4, 12);
  } else {
    ctx.beginPath(); ctx.moveTo(x - 6, y - gap - 4); ctx.lineTo(x + 6, y - gap - 4); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x - 6, y - gap); ctx.lineTo(x + 6, y - gap); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x - 6, y + gap); ctx.lineTo(x + 6, y + gap); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x - 6, y + gap + 4); ctx.lineTo(x + 6, y + gap + 4); ctx.stroke();
    ctx.strokeRect(x - 6, y - gap - 4, 12, 4);
    ctx.strokeRect(x - 6, y + gap, 12, 4);
  }
  ctx.fillStyle = '#9ca3af'; ctx.font = '9px monospace'; ctx.textAlign = 'center';
  const display = unit ? `${value}${unit}` : `${value}`;
  ctx.fillText(label ? `${label}=${display}` : display, x, y + (dir === 'h' || dir === 'h_flip' ? 16 : 0));
}

function drawSwitch(
  ctx: CanvasRenderingContext2D,
  x: number, y: number,
  closed: boolean,
  color = '#34d399',
) {
  ctx.strokeStyle = closed ? '#34d399' : '#ef4444'; ctx.lineWidth = 2;
  // Fixed contacts
  ctx.beginPath(); ctx.arc(x - 8, y, 3, 0, Math.PI * 2); ctx.stroke();
  ctx.beginPath(); ctx.arc(x + 8, y, 3, 0, Math.PI * 2); ctx.stroke();
  // Switch arm
  ctx.beginPath();
  if (closed) {
    ctx.moveTo(x - 8, y); ctx.lineTo(x + 8, y);
  } else {
    ctx.moveTo(x - 8, y); ctx.lineTo(x + 2, y - 10);
  }
  ctx.stroke();
  // Label
  ctx.fillStyle = ctx.strokeStyle; ctx.font = '8px monospace'; ctx.textAlign = 'center';
  ctx.fillText(closed ? 'ON' : 'OFF', x, y + 14);
}

function drawBulb(
  ctx: CanvasRenderingContext2D,
  x: number, y: number,
  label: string | undefined,
  value: number,
  unit: string | undefined,
  color = '#fbbf24',
) {
  ctx.strokeStyle = color; ctx.lineWidth = 2;
  // Bulb circle
  ctx.beginPath(); ctx.arc(x, y, 10, 0, Math.PI * 2); ctx.stroke();
  // Filament
  ctx.beginPath();
  ctx.moveTo(x - 5, y + 4); ctx.lineTo(x - 2, y - 4); ctx.lineTo(x + 2, y + 4); ctx.lineTo(x + 5, y - 4);
  ctx.stroke();
  // Base lines
  ctx.beginPath(); ctx.moveTo(x - 8, y + 10); ctx.lineTo(x + 8, y + 10); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(x - 6, y + 13); ctx.lineTo(x + 6, y + 13); ctx.stroke();
  // Label
  ctx.fillStyle = '#9ca3af'; ctx.font = '9px monospace'; ctx.textAlign = 'center';
  const display = unit ? `${value}${unit}` : `${value}`;
  ctx.fillText(label ? `${label}=${display}` : display, x, y + 24);
}

function drawInductor(
  ctx: CanvasRenderingContext2D,
  x: number, y: number,
  dir: 'h' | 'v' | 'h_flip' | 'v_flip',
  label: string | undefined,
  value: number,
  unit: string | undefined,
  color = '#60a5fa',
) {
  ctx.strokeStyle = color; ctx.lineWidth = 1.5;
  const loops = 4, r = 5;
  if (dir === 'h' || dir === 'h_flip') {
    const startX = x - loops * r;
    ctx.beginPath();
    ctx.arc(startX, y, r, 0, Math.PI, false);
    ctx.stroke();
    for (let i = 1; i < loops; i++) {
      ctx.beginPath();
      ctx.arc(startX + i * r * 2, y, r, Math.PI, 0, false);
      ctx.stroke();
    }
    ctx.beginPath();
    ctx.moveTo(x + loops * r, y); ctx.lineTo(x + loops * r + 8, y); ctx.stroke();
  } else {
    const startY = y - loops * r;
    ctx.beginPath();
    ctx.arc(x, startY, r, Math.PI / 2, -Math.PI / 2, false);
    ctx.stroke();
    for (let i = 1; i < loops; i++) {
      ctx.beginPath();
      ctx.arc(x, startY + i * r * 2, r, -Math.PI / 2, Math.PI / 2, false);
      ctx.stroke();
    }
    ctx.beginPath();
    ctx.moveTo(x, y + loops * r); ctx.lineTo(x, y + loops * r + 8); ctx.stroke();
  }
  ctx.fillStyle = '#9ca3af'; ctx.font = '9px monospace'; ctx.textAlign = 'center';
  const display = unit ? `${value}${unit}` : `${value}`;
  ctx.fillText(label ? `${label}=${display}` : display, x, y + (dir === 'h' || dir === 'h_flip' ? 18 : 0));
}

function drawComponent(
  ctx: CanvasRenderingContext2D,
  comp: RenderSpecComponent,
  x: number, y: number,
  state: Record<string, unknown>,
) {
  const value = resolveValue(comp.value_key, state);
  const dir = comp.direction ?? 'h';

  switch (comp.type) {
    case 'resistor':  drawResistor(ctx, x, y, dir, comp.label, value, comp.unit); break;
    case 'battery':   drawBattery(ctx, x, y, comp.label, value, comp.unit); break;
    case 'capacitor': drawCapacitor(ctx, x, y, dir, comp.label, value, comp.unit); break;
    case 'inductor':   drawInductor(ctx, x, y, dir, comp.label, value, comp.unit); break;
    case 'bulb':      drawBulb(ctx, x, y, comp.label, value, comp.unit); break;
    case 'switch': {
      const swState = comp.value_key ? !!state[comp.value_key] : true;
      drawSwitch(ctx, x, y, swState); break;
    }
    case 'wire': {
      ctx.strokeStyle = '#4b5563'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(x, y, 4, 0, Math.PI * 2); ctx.fill();
      break;
    }
    case 'ammeter': {
      ctx.strokeStyle = '#f87171'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(x, y, 10, 0, Math.PI * 2); ctx.stroke();
      ctx.fillStyle = '#f87171'; ctx.font = 'bold 9px monospace'; ctx.textAlign = 'center';
      ctx.fillText('A', x, y + 3);
      break;
    }
    case 'voltmeter': {
      ctx.strokeStyle = '#34d399'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(x, y, 10, 0, Math.PI * 2); ctx.stroke();
      ctx.fillStyle = '#34d399'; ctx.font = 'bold 9px monospace'; ctx.textAlign = 'center';
      ctx.fillText('V', x, y + 3);
      break;
    }
    case 'ground': {
      ctx.strokeStyle = '#6b7280'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(x, y - 8); ctx.lineTo(x, y + 4); ctx.stroke();
      for (let i = -1; i <= 1; i++) {
        ctx.beginPath(); ctx.moveTo(x + i * 6, y + 4); ctx.lineTo(x + i * 6, y + 10); ctx.stroke();
      }
      break;
    }
    // Optics elements
    case 'wave_source': {
      ctx.fillStyle = '#3b82f6';
      ctx.beginPath(); ctx.arc(x, y, 8, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#fff'; ctx.font = 'bold 8px monospace'; ctx.textAlign = 'center';
      ctx.fillText('~', x, y + 3);
      break;
    }
    case 'prism': {
      ctx.fillStyle = 'rgba(168,85,247,0.3)'; ctx.strokeStyle = '#a855f7'; ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(x, y - 30); ctx.lineTo(x + 26, y + 20); ctx.lineTo(x - 26, y + 20); ctx.closePath();
      ctx.fill(); ctx.stroke();
      break;
    }
    case 'lens': {
      ctx.strokeStyle = '#60a5fa'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(x, y - 35); ctx.lineTo(x, y + 35); ctx.stroke();
      // Thin lens symbol with arrows
      ctx.beginPath();
      ctx.moveTo(x, y - 35); ctx.lineTo(x - 6, y - 30); ctx.lineTo(x, y - 25); ctx.lineTo(x - 4, y - 20);
      ctx.moveTo(x, y - 20); ctx.lineTo(x, y - 15); ctx.lineTo(x + 4, y - 10); ctx.lineTo(x, y - 5);
      ctx.stroke();
      break;
    }
    case 'mirror': {
      ctx.strokeStyle = '#9ca3af'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(x, y - 35); ctx.lineTo(x, y + 35); ctx.stroke();
      ctx.strokeStyle = '#4b5563'; ctx.lineWidth = 1;
      ctx.setLineDash([4, 4]);
      ctx.beginPath(); ctx.moveTo(x - 10, y - 35); ctx.lineTo(x + 10, y + 35); ctx.stroke();
      ctx.setLineDash([]);
      break;
    }
    case 'screen': {
      ctx.fillStyle = '#1e293b'; ctx.strokeStyle = '#475569'; ctx.lineWidth = 2;
      ctx.fillRect(x - 30, y - 20, 60, 40); ctx.strokeRect(x - 30, y - 20, 60, 40);
      ctx.fillStyle = '#9ca3af'; ctx.font = '9px monospace'; ctx.textAlign = 'center';
      ctx.fillText('screen', x, y + 5);
      break;
    }
    case 'slit': {
      ctx.strokeStyle = '#94a3b8'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(x - 2, y - 25); ctx.lineTo(x - 2, y + 25); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(x + 2, y - 25); ctx.lineTo(x + 2, y + 25); ctx.stroke();
      break;
    }
    case 'normal': {
      ctx.strokeStyle = '#64748b'; ctx.lineWidth = 1; ctx.setLineDash([3, 3]);
      ctx.beginPath(); ctx.moveTo(x, y - 40); ctx.lineTo(x, y + 40); ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = '#64748b'; ctx.font = '8px monospace'; ctx.textAlign = 'left';
      ctx.fillText('N', x + 2, y - 42);
      break;
    }
    // Mechanics
    case 'pendulum_bob': {
      ctx.fillStyle = '#fbbf24'; ctx.strokeStyle = '#d97706'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(x, y, 14, 0, Math.PI * 2);
      ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#fff'; ctx.font = 'bold 9px monospace'; ctx.textAlign = 'center';
      const m = comp.properties?.mass;
      ctx.fillText(typeof m === 'number' ? `${m}kg` : 'm', x, y + 3);
      break;
    }
    case 'pivot': {
      ctx.fillStyle = '#6b7280';
      ctx.beginPath(); ctx.arc(x, y, 6, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#374151'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.arc(x, y, 3, 0, Math.PI * 2); ctx.stroke();
      break;
    }
    // Generic arrow
    case 'arrow': {
      const ax1 = (comp.properties?.x1 as number) ?? 0;
      const ay1 = (comp.properties?.y1 as number) ?? 0;
      const ax2 = (comp.properties?.x2 as number) ?? 0;
      const ay2 = (comp.properties?.y2 as number) ?? 0;
      const acolor = (comp.properties?.color as string) ?? '#fbbf24';
      const aw = (comp.properties?.lineWidth as number) ?? 2;
      const px1 = px(ax1, 480), py1 = py(ay1, 320), px2 = px(ax2, 480), py2 = py(ay2, 320);
      drawArrow(ctx, px1, py1, px2, py2, acolor, aw);
      break;
    }
    // Cell biology
    case 'cell_membrane': {
      ctx.strokeStyle = '#34d399'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(x, y, 20, 0, Math.PI * 2); ctx.stroke();
      ctx.fillStyle = 'rgba(52,211,153,0.05)';
      ctx.beginPath(); ctx.arc(x, y, 19, 0, Math.PI * 2); ctx.fill();
      break;
    }
    // Molecule
    case 'particle': {
      ctx.fillStyle = comp.properties?.color ? String(comp.properties.color) : '#3b82f6';
      ctx.beginPath(); ctx.arc(x, y, comp.properties?.r ? Number(comp.properties.r) : 4, 0, Math.PI * 2); ctx.fill();
      break;
    }
    default: {
      // Draw as labeled circle for unknown types
      ctx.strokeStyle = '#475569'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(x, y, 10, 0, Math.PI * 2); ctx.stroke();
      ctx.fillStyle = '#9ca3af'; ctx.font = '7px monospace'; ctx.textAlign = 'center';
      ctx.fillText(String(comp.type).slice(0, 4), x, y + 3);
    }
  }
}

// ── Annotation drawer ────────────────────────────────────────────────────────────

function drawAnnotation(
  ctx: CanvasRenderingContext2D,
  ann: RenderSpecAnnotation,
  W: number, H: number,
  state: Record<string, unknown>,
) {
  const value = resolveValue(ann.key, state);
  const absX = ann.px ?? px(ann.x ?? 0.8, W);
  const absY = ann.py ?? py(ann.y ?? 0.1, H);

  ctx.save();
  if (ann.formula) {
    // Draw formula text (simplified: no LaTeX, just Unicode approximation)
    ctx.fillStyle = ann.color ?? '#9ca3af'; ctx.font = `${ann.fontSize ?? 11}px monospace`;
    ctx.textAlign = ann.x !== undefined ? 'left' : 'center';
    ctx.fillText(`${ann.label} = ${value.toFixed(2)}`, absX, absY);
    if (ann.formula !== ann.label) {
      ctx.font = `${(ann.fontSize ?? 10) - 1}px monospace`;
      ctx.fillStyle = ann.color ? `${ann.color}99` : '#64748b';
      ctx.fillText(ann.formula, absX, absY + (ann.fontSize ?? 11) + 2);
    }
  } else {
    ctx.fillStyle = ann.color ?? '#9ca3af'; ctx.font = `${ann.fontSize ?? 11}px monospace`;
    ctx.textAlign = ann.x !== undefined ? 'left' : 'center';
    ctx.fillText(`${ann.label} = ${value.toFixed(2)}`, absX, absY);
  }
  ctx.restore();
}

// ── Drawing command executor ────────────────────────────────────────────────────

function executeCommand(
  ctx: CanvasRenderingContext2D,
  cmd: RenderSpecDrawingCommand,
  W: number, H: number,
  state: Record<string, unknown>,
) {
  const a = cmd.attrs;
  const toAbs = (v: number | string | undefined, def: number): number => {
    if (typeof v === 'number') return v;
    if (typeof v === 'string' && v.endsWith('%')) return (parseFloat(v) / 100) * (a.y !== undefined ? H : W);
    if (typeof v === 'string') { const n = parseFloat(v); if (Number.isFinite(n)) return n; }
    return def;
  };
  const x = toAbs(a.x, W / 2), y = toAbs(a.y, H / 2);
  const x1 = toAbs(a.x1, 0), y1 = toAbs(a.y1, 0);
  const x2 = toAbs(a.x2, W), y2 = toAbs(a.y2, H);
  const r = toAbs(a.r, 30);
  const w = toAbs(a.width, 100), h = toAbs(a.height, 50);

  if (cmd.stroke) ctx.strokeStyle = cmd.stroke;
  if (cmd.fill) ctx.fillStyle = cmd.fill;
  if (cmd.lineWidth) ctx.lineWidth = cmd.lineWidth;
  if (cmd.dash) ctx.setLineDash(cmd.dash);

  switch (cmd.type) {
    case 'line': {
      ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke(); break;
    }
    case 'dashedLine': {
      ctx.setLineDash(cmd.dash ?? [6, 4]); ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke(); ctx.setLineDash([]); break;
    }
    case 'arrow': {
      drawArrow(ctx, x1, y1, x2, y2, cmd.stroke ?? '#fbbf24', cmd.lineWidth ?? 2); break;
    }
    case 'circle': {
      ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2);
      if (cmd.fill) ctx.fill(); if (cmd.stroke) ctx.stroke(); break;
    }
    case 'filledCircle': {
      ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill(); break;
    }
    case 'arc': {
      const sa = typeof a.startAngle === 'number' ? a.startAngle : 0;
      const ea = typeof a.endAngle === 'number' ? a.endAngle : Math.PI * 2;
      ctx.beginPath(); ctx.arc(x, y, r, sa, ea); ctx.stroke(); break;
    }
    case 'filledArc': {
      const sa2 = typeof a.startAngle === 'number' ? a.startAngle : 0;
      const ea2 = typeof a.endAngle === 'number' ? a.endAngle : Math.PI * 2;
      ctx.beginPath(); ctx.arc(x, y, r, sa2, ea2); ctx.fill(); break;
    }
    case 'arcPath': {
      const sa3 = typeof a.startAngle === 'number' ? a.startAngle : 0;
      const ea3 = typeof a.endAngle === 'number' ? a.endAngle : Math.PI * 2;
      ctx.beginPath(); ctx.moveTo(x, y);
      ctx.arc(x, y, r, sa3, ea3); ctx.closePath();
      if (cmd.fill) ctx.fill(); if (cmd.stroke) ctx.stroke(); break;
    }
    case 'rect': {
      ctx.strokeRect(x, y, w, h); break;
    }
    case 'filledRect': {
      ctx.fillRect(x, y, w, h); break;
    }
    case 'gradientRect': {
      if (!cmd.fill) break;
      const grad = ctx.createLinearGradient(x, y, x + w, y + h);
      // Parse fill as two colors separated by comma
      const colors = cmd.fill.split(',');
      grad.addColorStop(0, colors[0] ?? cmd.fill);
      grad.addColorStop(1, colors[1] ?? colors[0] ?? cmd.fill);
      ctx.fillStyle = grad; ctx.fillRect(x, y, w, h); break;
    }
    case 'doubleLine': {
      ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
      ctx.strokeStyle = '#6b7280'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(x1, y1 + 4); ctx.lineTo(x2, y2 + 4); ctx.stroke();
      break;
    }
    case 'path': {
      if (!cmd.d) break;
      const p2d = new Path2D(cmd.d);
      if (cmd.fill) ctx.fill(p2d, x, y); if (cmd.stroke) ctx.stroke(p2d); break;
    }
    case 'polygon': {
      const pts = (a.points as string | undefined)?.split(',').map(Number) ?? [];
      if (pts.length < 4) break;
      ctx.beginPath();
      ctx.moveTo(toAbs(pts[0], W), toAbs(pts[1], H));
      for (let i = 2; i < pts.length; i += 2) ctx.lineTo(toAbs(pts[i], W), toAbs(pts[i + 1], H));
      ctx.closePath();
      if (cmd.fill) ctx.fill(); if (cmd.stroke) ctx.stroke(); break;
    }
    case 'curve': {
      const cp1x = toAbs(a.cp1x, W * 0.75), cp1y = toAbs(a.cp1y, H * 0.75);
      const cp2x = toAbs(a.cp2x, W * 0.25), cp2y = toAbs(a.cp2y, H * 0.25);
      ctx.beginPath(); ctx.moveTo(x1, y1);
      ctx.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, x2, y2); ctx.stroke(); break;
    }
    case 'bezier': {
      ctx.beginPath(); ctx.moveTo(x1, y1);
      const cpx = toAbs(a.cpx, W / 2), cpy = toAbs(a.cpy, H / 2);
      ctx.quadraticCurveTo(cpx, cpy, x2, y2); ctx.stroke(); break;
    }
    case 'spring': {
      // Simple coil spring
      const sx1 = toAbs(a.sx1, x1), sy1 = toAbs(a.sy1, y1);
      const sx2 = toAbs(a.sx2, x2), sy2 = toAbs(a.sy2, y2);
      const coils = typeof a.coils === 'number' ? a.coils : 6;
      const amp = typeof a.amplitude === 'number' ? a.amplitude : 8;
      ctx.beginPath(); ctx.moveTo(sx1, sy1);
      for (let i = 0; i <= coils * 4; i++) {
        const t = i / (coils * 4);
        const nx = sx1 + (sx2 - sx1) * t + (i % 2 === 0 ? 0 : amp * Math.cos((i % 4 < 2 ? 1 : -1) * Math.PI));
        const ny = sy1 + (sy2 - sy1) * t;
        ctx.lineTo(nx, ny);
      }
      ctx.lineTo(sx2, sy2); ctx.stroke(); break;
    }
    case 'label': {
      const lb = cmd.label;
      if (!lb) break;
      ctx.fillStyle = lb.color ?? '#9ca3af';
      ctx.font = `${lb.fontSize ?? 12}px ${lb.fontFamily ?? 'monospace'}`;
      ctx.textAlign = lb.align ?? 'left';
      ctx.fillText(lb.text, lb.x, lb.y); break;
    }
    case 'formula': {
      const fm = cmd.formula;
      if (!fm) break;
      ctx.fillStyle = fm.color ?? '#9ca3af';
      ctx.font = `${fm.fontSize ?? 12}px monospace`;
      ctx.textAlign = 'left';
      ctx.fillText(fm.text, fm.x, fm.y); break;
    }
    case 'dimension': {
      // Dimension line with arrows at ends and text in middle
      ctx.strokeStyle = cmd.stroke ?? '#475569'; ctx.lineWidth = 1;
      ctx.setLineDash([2, 2]);
      ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
      ctx.setLineDash([]);
      const mx = (x1 + x2) / 2, my = (y1 + y2) / 2;
      const dx2 = x2 - x1, dy2 = y2 - y1, len = Math.sqrt(dx2 * dx2 + dy2 * dy2);
      if (len > 0) {
        const ux = dx2 / len, uy = dy2 / len;
        const hs = 6;
        ctx.fillStyle = cmd.stroke ?? '#475569';
        ctx.beginPath();
        ctx.moveTo(x1, y1); ctx.lineTo(x1 - ux * hs - uy * hs * 0.5, y1 - uy * hs + ux * hs * 0.5);
        ctx.lineTo(x1 - ux * hs + uy * hs * 0.5, y1 - uy * hs - ux * hs * 0.5); ctx.closePath(); ctx.fill();
        ctx.beginPath();
        ctx.moveTo(x2, y2); ctx.lineTo(x2 - ux * hs + uy * hs * 0.5, y2 - uy * hs - ux * hs * 0.5);
        ctx.lineTo(x2 - ux * hs - uy * hs * 0.5, y2 - uy * hs + ux * hs * 0.5); ctx.closePath(); ctx.fill();
      }
      ctx.fillStyle = '#64748b'; ctx.font = '10px monospace'; ctx.textAlign = 'center';
      const dLabel = typeof a.label === 'string' ? a.label : '';
      ctx.fillText(dLabel, mx, my - 4); break;
    }
    case 'angleArc': {
      const cx2 = toAbs(a.cx, W / 2), cy2 = toAbs(a.cy, H / 2);
      const rs = typeof a.rs === 'number' ? a.rs : 30;
      const sa4 = typeof a.startAngle === 'number' ? a.startAngle : 0;
      const ea4 = typeof a.endAngle === 'number' ? a.endAngle : Math.PI / 4;
      ctx.strokeStyle = cmd.stroke ?? '#3b82f6'; ctx.lineWidth = 1;
      ctx.setLineDash([3, 3]);
      ctx.beginPath(); ctx.arc(cx2, cy2, rs, sa4, ea4); ctx.stroke();
      ctx.setLineDash([]);
      break;
    }
    case 'pendulumString': {
      const psx = toAbs(a.sx, x1), psy = toAbs(a.sy, y1);
      const pex = toAbs(a.ex, x2), pey = toAbs(a.ey, y2);
      ctx.strokeStyle = '#9ca3af'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(psx, psy); ctx.lineTo(pex, pey); ctx.stroke();
      // Bob at end
      const bm = typeof a.bobMass === 'number' ? a.bobMass : 2;
      ctx.fillStyle = '#fbbf24'; ctx.strokeStyle = '#d97706'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(pex, pey, 10 + bm, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#fff'; ctx.font = 'bold 9px monospace'; ctx.textAlign = 'center';
      ctx.fillText(`${bm}kg`, pex, pey + 3); break;
    }
    default: break;
  }

  ctx.setLineDash([]);
}

// ── Grid / axis helpers ─────────────────────────────────────────────────────────

function drawGrid(
  ctx: CanvasRenderingContext2D,
  W: number, H: number,
  spec: RenderSpec,
) {
  const g = spec.grid;
  if (g?.show === false) return;
  const spacing = g?.spacing ?? 40;
  const color = g?.color ?? '#1e293b';
  ctx.strokeStyle = color; ctx.lineWidth = 0.5;
  for (let x = 0; x < W; x += spacing) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke(); }
  for (let y = 0; y < H; y += spacing) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }
}

function drawAxis(
  ctx: CanvasRenderingContext2D,
  W: number, H: number,
  spec: RenderSpec,
) {
  const ax = spec.axis;
  if (ax?.show === false) return;
  ctx.strokeStyle = '#334155'; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.moveTo(20, H - 20); ctx.lineTo(W - 10, H - 20); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(20, H - 20); ctx.lineTo(20, 10); ctx.stroke();
  ctx.fillStyle = '#4b5563'; ctx.font = '11px monospace';
  ctx.fillText(ax?.xLabel ?? 'x', W - 18, H - 12);
  ctx.fillText(ax?.yLabel ?? 'y', 28, 18);
  if (ax?.origin !== false) {
    ctx.fillStyle = '#64748b'; ctx.font = '9px monospace';
    ctx.fillText('0', 22, H - 8);
  }
}

// ── Wire renderer ───────────────────────────────────────────────────────────────

function drawWires(
  ctx: CanvasRenderingContext2D,
  wires: RenderSpecWire[],
  components: RenderSpecComponent[],
  cellW: number,
  cellH: number,
  pad: number,
  W: number,
  H: number,
) {
  const nodeMap = new Map<string, { x: number; y: number }>();
  for (const c of components) {
    if (c.x !== undefined && c.y !== undefined) {
      nodeMap.set(c.id, { x: pad + c.x * cellW, y: pad + c.y * cellH });
    }
  }

  for (const wire of wires) {
    const fromNode = nodeMap.get(wire.from.split('.')[0]);
    const toNode = nodeMap.get(wire.to.split('.')[0]);
    if (!fromNode || !toNode) continue;

    ctx.strokeStyle = '#4b5563';
    ctx.lineWidth = 2;
    if (wire.style === 'dashed') { ctx.setLineDash([6, 4]); }
    else if (wire.style === 'bold') { ctx.lineWidth = 3; }

    ctx.beginPath();
    ctx.moveTo(fromNode.x, fromNode.y);
    ctx.lineTo(toNode.x, toNode.y);
    ctx.stroke();
    ctx.setLineDash([]);

    // Junction dot
    ctx.fillStyle = '#6b7280';
    ctx.beginPath(); ctx.arc(fromNode.x, fromNode.y, 3, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(toNode.x, toNode.y, 3, 0, Math.PI * 2); ctx.fill();

    if (wire.label) {
      const mx = (fromNode.x + toNode.x) / 2, my = (fromNode.y + toNode.y) / 2 - 6;
      ctx.fillStyle = '#9ca3af'; ctx.font = '9px monospace'; ctx.textAlign = 'center';
      ctx.fillText(wire.label, mx, my);
    }
  }
}

// ── Main public API ────────────────────────────────────────────────────────────

/**
 * Main rendering entry point. Called from GenericDynamicRenderer when a renderSpec is present.
 *
 * Strategy:
 *   A. drawing_commands → direct Canvas2D execution
 *   B. components + wires → topology-aware circuit / optics renderer
 *   C. annotations overlay (always last)
 *
 * @param ctx Canvas2D context
 * @param W   Canvas width (px)
 * @param H   Canvas height (px)
 * @param spec  The renderSpec (from definition.visual_hint.renderSpec or llmResult.render_spec)
 * @param state Current lab state (from definition.initialState)
 * @param bgColor Background color override (from visual_config.bg_color or LLM result)
 */
export function renderFromSpec(
  ctx: CanvasRenderingContext2D,
  W: number, H: number,
  spec: RenderSpec,
  state: Record<string, unknown>,
  bgColor = '#0b1120',
) {
  // Background
  ctx.fillStyle = bgColor;
  ctx.fillRect(0, 0, W, H);

  // Grid + axis
  drawGrid(ctx, W, H, spec);
  drawAxis(ctx, W, H, spec);

  // ── A. Direct drawing commands (background / axes / custom paths) ─────────
  if (spec.drawing_commands?.length) {
    for (const cmd of spec.drawing_commands) {
      executeCommand(ctx, cmd, W, H, state);
    }
  }

  // ── B. Component + wire based rendering ───────────────────────────────────
  const components = spec.components ?? [];
  const wires = spec.wires ?? [];

  if (components.length || wires.length) {
    const layout = spec.layout ?? {};
    const cols = layout.cols ?? 5;
    const rows = layout.rows ?? 3;
    // Use full W/H for grid calculation — avoids squashing circuits to min(W,H) cell size
    const cellW = (W - 2 * (layout.padding ?? 20)) / cols;
    const cellH = (H - 2 * (layout.padding ?? 20)) / rows;
    const pad = layout.padding ?? 20;

    // Draw wires first (background)
    drawWires(ctx, wires, components, cellW, cellH, pad, W, H);

    // Draw components — use cellW for x (horizontal) and cellH for y (vertical)
    for (const comp of components) {
      const cx = pad + (comp.x ?? 0) * cellW;
      const cy = pad + (comp.y ?? 0) * cellH;
      drawComponent(ctx, comp, cx, cy, state);
    }
  }

  // ── C. Annotations overlay (single pass, on top of A + B) ─────────────────
  if (spec.annotations?.length) {
    for (const ann of spec.annotations) {
      drawAnnotation(ctx, ann, W, H, state);
    }
  }
}
