/** 白板布局：百分比坐标相对画布（0–100），便于缩放与放映。 */

export type WBTextItem = {
  kind: 'text';
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  z: number;
  /** 该文字框内容；旧课仅有顶层 slide.text 时由 sync 填入 */
  content?: string;
};

export type WBImageItem = {
  kind: 'image';
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  z: number;
  i: number;
};

export type WBLabItem = {
  kind: 'lab';
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  z: number;
};

export type WBItem = WBTextItem | WBImageItem | WBLabItem;

export type WhiteboardLayout = { v: 1; items: WBItem[] };

function rid(slideKey: string) {
  return `wb-t-${slideKey}-${Math.random().toString(36).slice(2, 9)}`;
}

/** 同一幻灯内稳定的默认 id（首个文字框） */
function stableIds(slideKey: string) {
  return {
    text: `wb-text-${slideKey}`,
    img: (i: number) => `wb-img-${slideKey}-${i}`,
    lab: `wb-lab-${slideKey}`,
  };
}

function wbVersionOk(v: unknown): boolean {
  return v === 1 || v === '1' || Number(v) === 1;
}

export function isWhiteboardLayout(x: unknown): x is WhiteboardLayout {
  if (typeof x !== 'object' || x === null) return false;
  const o = x as WhiteboardLayout;
  return wbVersionOk((o as unknown as { v?: unknown }).v) && Array.isArray(o.items);
}

/**
 * 解析 API 返回的 slide_layout（extra_payload.wb）。
 * 兼容严格 v:1 结构，以及仅含 items 的裸对象（补全 v:1）。
 */
export function parseSlideLayoutPayload(raw: unknown): WhiteboardLayout | null {
  if (raw == null || raw === '') return null;
  if (typeof raw === 'string') {
    try {
      return parseSlideLayoutPayload(JSON.parse(raw));
    } catch {
      return null;
    }
  }
  if (isWhiteboardLayout(raw)) {
    const o = raw as WhiteboardLayout;
    return { v: 1, items: o.items };
  }
  if (typeof raw !== 'object' || raw === null) return null;
  const o = raw as Record<string, unknown>;
  if (!Array.isArray(o.items)) return null;
  if (o.items.length === 0) return { v: 1, items: [] };
  const first = o.items[0] as Record<string, unknown> | undefined;
  if (!first || typeof first.kind !== 'string') return null;
  return { v: 1, items: o.items as WhiteboardLayout['items'] };
}

/** 后端 slide.text 字段：多段文字用双换行拼接，便于检索与旧版只读展示 */
export function flattenTextForBackend(layout: WhiteboardLayout): string {
  const texts = layout.items
    .filter((x): x is WBTextItem => x.kind === 'text')
    .sort((a, b) => a.z - b.z || a.id.localeCompare(b.id));
  return texts.map(t => t.content ?? '').join('\n\n');
}

/** 与当前幻灯数据对齐：多文字框、图片、实验块增删 */
export function syncWhiteboardLayout(
  slide: { text?: string; imageUrls?: string[]; widgetType?: string | undefined },
  prev: WhiteboardLayout | null | undefined,
  slideKey: string,
): WhiteboardLayout {
  const n = slide.imageUrls?.length ?? 0;
  const hasLab = !!slide.widgetType;
  const prevItems = prev && prev.v === 1 && Array.isArray(prev.items) ? [...prev.items] : [];
  const sid = stableIds(slideKey);
  const legacyText = slide.text ?? '';

  let textItems: WBTextItem[] = prevItems.filter((x): x is WBTextItem => x.kind === 'text');

  if (textItems.length === 0) {
    textItems = [{ kind: 'text', id: sid.text, x: 3, y: 4, w: 94, h: 24, z: 1, content: legacyText }];
  } else {
    const onlyOne = textItems.length === 1;
    textItems = textItems.map((t, idx) => {
      const hasContent = t.content != null && t.content !== '';
      if (!hasContent && legacyText && (onlyOne || idx === 0)) {
        return { ...t, content: legacyText };
      }
      return { ...t, content: t.content ?? '' };
    });
  }

  const oldImages = prevItems.filter((x): x is WBImageItem => x.kind === 'image');
  const oldSorted = [...oldImages].sort((a, b) => a.i - b.i);
  const imageItems: WBImageItem[] = [];
  for (let i = 0; i < n; i++) {
    const existing = i < oldSorted.length ? oldSorted[i] : undefined;
    if (existing) {
      imageItems.push({ ...existing, i });
    } else {
      const col = i % 2;
      const row = Math.floor(i / 2);
      imageItems.push({
        kind: 'image',
        id: sid.img(i),
        x: 3 + col * 48,
        y: 28 + row * 34,
        w: 46,
        h: 30,
        z: 2 + i,
        i,
      });
    }
  }

  let labItem: WBLabItem | undefined;
  const oldLab = prevItems.find((x): x is WBLabItem => x.kind === 'lab');
  if (hasLab) {
    labItem = oldLab ?? { kind: 'lab', id: sid.lab, x: 3, y: 62, w: 94, h: 34, z: 10 };
  }

  const items: WBItem[] = [...textItems, ...imageItems];
  if (labItem) items.push(labItem);
  return { v: 1, items };
}

export function patchItemGeometry(
  layout: WhiteboardLayout,
  id: string,
  patch: Partial<Pick<WBTextItem, 'x' | 'y' | 'w' | 'h' | 'z'>>,
): WhiteboardLayout {
  return {
    v: 1,
    items: layout.items.map(it => (it.id === id ? { ...it, ...patch } as WBItem : it)),
  };
}

export function patchTextContent(layout: WhiteboardLayout, id: string, content: string): WhiteboardLayout {
  return {
    v: 1,
    items: layout.items.map(it =>
      it.id === id && it.kind === 'text' ? { ...it, content } as WBItem : it,
    ),
  };
}

export function removeItemById(layout: WhiteboardLayout, id: string, slideKey: string): WhiteboardLayout {
  const next = layout.items.filter(it => it.id !== id);
  const texts = next.filter((x): x is WBTextItem => x.kind === 'text');
  if (texts.length === 0) {
    const sid = stableIds(slideKey);
    return {
      v: 1,
      items: [
        { kind: 'text', id: sid.text, x: 3, y: 4, w: 94, h: 20, z: 1, content: '' },
        ...next,
      ],
    };
  }
  return { v: 1, items: next };
}

export function addTextBox(layout: WhiteboardLayout, slideKey: string): WhiteboardLayout {
  const mz = layout.items.reduce((m, it) => Math.max(m, it.z), 0);
  const n = layout.items.filter((x): x is WBTextItem => x.kind === 'text').length;
  const item: WBTextItem = {
    kind: 'text',
    id: rid(slideKey),
    x: 8 + (n % 3) * 8,
    y: 8 + (n % 2) * 12,
    w: 42,
    h: 22,
    z: mz + 1,
    content: '',
  };
  return { v: 1, items: [...layout.items, item] };
}

/** 与相邻图层交换 z（列表里「上移」= 更靠近顶层） */
export function bumpZOrder(layout: WhiteboardLayout, id: string, dir: 'up' | 'down'): WhiteboardLayout {
  const sorted = [...layout.items].sort((a, b) => a.z - b.z);
  const idx = sorted.findIndex(x => x.id === id);
  if (idx < 0) return layout;
  const swapWith = dir === 'up' ? idx + 1 : idx - 1;
  if (swapWith < 0 || swapWith >= sorted.length) return layout;
  const a = sorted[idx];
  const b = sorted[swapWith];
  const za = a.z;
  const zb = b.z;
  return {
    v: 1,
    items: layout.items.map(it => {
      if (it.id === a.id) return { ...it, z: zb } as WBItem;
      if (it.id === b.id) return { ...it, z: za } as WBItem;
      return it;
    }),
  };
}

export function bringItemToFront(layout: WhiteboardLayout, id: string): WhiteboardLayout {
  const mz = layout.items.reduce((m, it) => Math.max(m, it.z), 0);
  return {
    v: 1,
    items: layout.items.map(it => (it.id === id ? { ...it, z: mz + 1 } as WBItem : it)),
  };
}
