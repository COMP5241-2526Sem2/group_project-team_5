import type { WhiteboardLayout, WBItem } from './whiteboardLayout';

const DEFAULT_TH = 1.25;

/** 吸附移动：返回位置与用于绘制的参考线（竖线 x%、横线 y%） */
export function snapMoveRect(
  layout: WhiteboardLayout,
  movingId: string,
  nx: number,
  ny: number,
  w: number,
  h: number,
  threshold = DEFAULT_TH,
): { x: number; y: number; guidesV: number[]; guidesH: number[] } {
  const others = layout.items.filter(i => i.id !== movingId);

  type Snap1D = { value: number; line: number };

  const xSnaps: Snap1D[] = [];
  const addX = (value: number, line: number) => xSnaps.push({ value, line });

  addX(0, 0);
  addX(50 - w / 2, 50);
  addX(100 - w, 100);
  for (const o of others) {
    const b = o as WBItem;
    addX(b.x, b.x);
    addX(b.x + b.w - w, b.x + b.w);
    addX(b.x + b.w / 2 - w / 2, b.x + b.w / 2);
  }

  const ySnaps: Snap1D[] = [];
  const addY = (value: number, line: number) => ySnaps.push({ value, line });

  addY(0, 0);
  addY(50 - h / 2, 50);
  addY(100 - h, 100);
  for (const o of others) {
    const b = o as WBItem;
    addY(b.y, b.y);
    addY(b.y + b.h - h, b.y + b.h);
    addY(b.y + b.h / 2 - h / 2, b.y + b.h / 2);
  }

  let bestX = nx;
  let bestXd = threshold + 1;
  let lineVX: number[] = [];
  for (const s of xSnaps) {
    const d = Math.abs(nx - s.value);
    if (d < bestXd && d <= threshold) {
      bestXd = d;
      bestX = s.value;
      lineVX = [s.line];
    }
  }

  let bestY = ny;
  let bestYd = threshold + 1;
  let lineHY: number[] = [];
  for (const s of ySnaps) {
    const d = Math.abs(ny - s.value);
    if (d < bestYd && d <= threshold) {
      bestYd = d;
      bestY = s.value;
      lineHY = [s.line];
    }
  }

  return {
    x: Math.max(0, Math.min(100 - w, bestX)),
    y: Math.max(0, Math.min(100 - h, bestY)),
    guidesV: bestXd <= threshold ? lineVX : [],
    guidesH: bestYd <= threshold ? lineHY : [],
  };
}

/** 吸附缩放：右下角靠齐画布边缘或其它块边 */
export function snapResizeRect(
  layout: WhiteboardLayout,
  movingId: string,
  x: number,
  y: number,
  nw: number,
  nh: number,
  threshold = DEFAULT_TH,
): { w: number; h: number; guidesV: number[]; guidesH: number[] } {
  const others = layout.items.filter(i => i.id !== movingId);
  let w2 = Math.max(6, Math.min(100 - x, nw));
  let h2 = Math.max(6, Math.min(100 - y, nh));
  const guidesV: number[] = [];
  const guidesH: number[] = [];

  const right = x + w2;
  const bottom = y + h2;

  if (Math.abs(right - 100) <= threshold) {
    w2 = 100 - x;
    guidesV.push(100);
  }
  for (const o of others) {
    const b = o as WBItem;
    const line = b.x;
    if (Math.abs(right - line) <= threshold && line > x + 6) {
      w2 = line - x;
      guidesV.push(line);
      break;
    }
    const lineR = b.x + b.w;
    if (Math.abs(right - lineR) <= threshold) {
      w2 = lineR - x;
      guidesV.push(lineR);
      break;
    }
  }

  if (Math.abs(bottom - 100) <= threshold) {
    h2 = 100 - y;
    guidesH.push(100);
  }
  for (const o of others) {
    const b = o as WBItem;
    if (Math.abs(bottom - b.y) <= threshold && b.y > y + 6) {
      h2 = b.y - y;
      guidesH.push(b.y);
      break;
    }
    const bot = b.y + b.h;
    if (Math.abs(bottom - bot) <= threshold) {
      h2 = bot - y;
      guidesH.push(bot);
      break;
    }
  }

  return {
    w: Math.max(6, Math.min(100 - x, w2)),
    h: Math.max(6, Math.min(100 - y, h2)),
    guidesV,
    guidesH,
  };
}
