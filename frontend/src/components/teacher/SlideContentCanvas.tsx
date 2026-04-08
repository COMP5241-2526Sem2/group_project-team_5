import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { WhiteboardLayout, WBItem, WBTextItem } from '@/pages/teacher/whiteboardLayout';
import {
  patchItemGeometry,
  patchTextContent,
  removeItemById,
  bumpZOrder,
  bringItemToFront,
} from '@/pages/teacher/whiteboardLayout';
import { snapMoveRect, snapResizeRect } from '@/pages/teacher/whiteboardSnap';
import { Layers, Trash2, ChevronUp, ChevronDown, ArrowUpToLine } from 'lucide-react';

const MIN_P = 6;

function clamp(v: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, v));
}

type DragState = {
  id: string;
  mode: 'move' | 'resize';
  startX: number;
  startY: number;
  orig: Pick<WBItem, 'x' | 'y' | 'w' | 'h'>;
};

export type SlideContentCanvasProps = {
  slideKey: string;
  layout: WhiteboardLayout;
  onLayoutChange: (next: WhiteboardLayout) => void;
  imageUrls: string[];
  onRemoveImage?: (index: number) => void;
  widgetType?: string;
  labSlot: React.ReactNode | null;
  readonly?: boolean;
  theme?: 'light' | 'dark';
  toolbar?: React.ReactNode;
  onAddTextBox?: () => void;
  /** 删除实验图层时由父级清除 widgetType，仅删白板项会导致 sync 再次插入默认实验块 */
  onRemoveLab?: (nextLayout: WhiteboardLayout) => void;
};

export default function SlideContentCanvas({
  slideKey,
  layout,
  onLayoutChange,
  imageUrls,
  onRemoveImage,
  widgetType,
  labSlot,
  readonly = false,
  theme = 'light',
  toolbar,
  onAddTextBox,
  onRemoveLab,
}: SlideContentCanvasProps) {
  const boardRef = useRef<HTMLDivElement>(null);
  const layoutRef = useRef(layout);
  layoutRef.current = layout;
  const dragDraftRef = useRef<WhiteboardLayout | null>(null);
  const [drag, setDrag] = useState<DragState | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [guides, setGuides] = useState<{ v: number[]; h: number[] }>({ v: [], h: [] });

  const isDark = theme === 'dark';
  const bg = isDark ? '#0b1220' : '#f8fafc';
  const border = isDark ? '#1e293b' : '#e2e8f0';
  const fg = isDark ? '#e2e8f0' : '#1e293b';
  const muted = isDark ? '#94a3b8' : '#64748b';
  const handleBg = isDark ? 'rgba(15,23,42,0.92)' : 'rgba(255,255,255,0.95)';

  const sorted = useMemo(
    () => [...layout.items].sort((a, b) => a.z - b.z),
    [layout.items],
  );

  const layerList = useMemo(
    () => [...layout.items].sort((a, b) => b.z - a.z),
    [layout.items],
  );

  const applyLayout = useCallback(
    (next: WhiteboardLayout) => {
      dragDraftRef.current = next;
      onLayoutChange(next);
    },
    [onLayoutChange],
  );

  const bringToFront = useCallback(
    (id: string) => {
      const base = dragDraftRef.current ?? layoutRef.current;
      const next = bringItemToFront(base, id);
      dragDraftRef.current = next;
      onLayoutChange(next);
    },
    [onLayoutChange],
  );

  const applyGeom = useCallback(
    (id: string, next: { x: number; y: number; w: number; h: number }) => {
      const base = dragDraftRef.current ?? layoutRef.current;
      const patched = patchItemGeometry(base, id, next);
      dragDraftRef.current = patched;
      onLayoutChange(patched);
    },
    [onLayoutChange],
  );

  const setTextFor = useCallback(
    (id: string, content: string) => {
      const base = dragDraftRef.current ?? layoutRef.current;
      const patched = patchTextContent(base, id, content);
      dragDraftRef.current = patched;
      onLayoutChange(patched);
    },
    [onLayoutChange],
  );

  const onPointerDown = useCallback(
    (e: React.PointerEvent, item: WBItem, mode: 'move' | 'resize') => {
      if (readonly) return;
      e.preventDefault();
      e.stopPropagation();
      dragDraftRef.current = null;
      setGuides({ v: [], h: [] });
      bringToFront(item.id);
      setSelectedId(item.id);
      setDrag({
        id: item.id,
        mode,
        startX: e.clientX,
        startY: e.clientY,
        orig: { x: item.x, y: item.y, w: item.w, h: item.h },
      });
    },
    [readonly, bringToFront],
  );

  useEffect(() => {
    if (!drag || !boardRef.current) return;
    const onMove = (e: PointerEvent) => {
      if (!boardRef.current) return;
      const rect = boardRef.current.getBoundingClientRect();
      const dx = ((e.clientX - drag.startX) / rect.width) * 100;
      const dy = ((e.clientY - drag.startY) / rect.height) * 100;
      const { orig, mode, id } = drag;
      const baseLayout = dragDraftRef.current ?? layoutRef.current;

      if (mode === 'move') {
        let nx = clamp(orig.x + dx, 0, 100 - orig.w);
        let ny = clamp(orig.y + dy, 0, 100 - orig.h);
        const snapped = snapMoveRect(baseLayout, id, nx, ny, orig.w, orig.h);
        nx = snapped.x;
        ny = snapped.y;
        setGuides({ v: snapped.guidesV, h: snapped.guidesH });
        applyGeom(id, { x: nx, y: ny, w: orig.w, h: orig.h });
      } else {
        let nw = clamp(orig.w + dx, MIN_P, 100 - orig.x);
        let nh = clamp(orig.h + dy, MIN_P, 100 - orig.y);
        const snapped = snapResizeRect(baseLayout, id, orig.x, orig.y, nw, nh);
        nw = snapped.w;
        nh = snapped.h;
        setGuides({ v: snapped.guidesV, h: snapped.guidesH });
        applyGeom(id, { x: orig.x, y: orig.y, w: nw, h: nh });
      }
    };
    const onUp = () => {
      dragDraftRef.current = null;
      setDrag(null);
      setGuides({ v: [], h: [] });
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
  }, [drag, applyGeom]);

  function layerLabel(it: WBItem): string {
    if (it.kind === 'text') {
      const texts = layout.items.filter((x): x is WBTextItem => x.kind === 'text').sort((a, b) => a.z - b.z);
      const ti = texts.findIndex(t => t.id === it.id) + 1;
      return `文字 ${ti || 1}`;
    }
    if (it.kind === 'image') return `图片 ${it.i + 1}`;
    return '实验';
  }

  function deleteLayer(it: WBItem) {
    if (readonly) return;
    if (it.kind === 'image' && onRemoveImage) {
      onRemoveImage(it.i);
      return;
    }
    if (it.kind === 'lab' && onRemoveLab) {
      const base = layoutRef.current;
      onRemoveLab(removeItemById(base, it.id, slideKey));
      return;
    }
    const base = layoutRef.current;
    applyLayout(removeItemById(base, it.id, slideKey));
  }

  function reorderLayer(id: string, dir: 'up' | 'down') {
    if (readonly) return;
    const base = dragDraftRef.current ?? layoutRef.current;
    applyLayout(bumpZOrder(base, id, dir));
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {toolbar}
      <div
        ref={boardRef}
        onClick={() => !readonly && setSelectedId(null)}
        style={{
          position: 'relative',
          width: '100%',
          aspectRatio: '16 / 9',
          background: bg,
          border: `1px solid ${border}`,
          borderRadius: 10,
          overflow: 'hidden',
          boxSizing: 'border-box',
        }}
      >
        {guides.v.map((gx, i) => (
          <div
            key={`gv-${i}-${gx}`}
            style={{
              position: 'absolute',
              left: `${gx}%`,
              top: 0,
              bottom: 0,
              width: 1,
              background: isDark ? '#38bdf8' : '#3b5bdb',
              opacity: 0.85,
              pointerEvents: 'none',
              zIndex: 9998,
              transform: 'translateX(-50%)',
            }}
          />
        ))}
        {guides.h.map((gy, i) => (
          <div
            key={`gh-${i}-${gy}`}
            style={{
              position: 'absolute',
              top: `${gy}%`,
              left: 0,
              right: 0,
              height: 1,
              background: isDark ? '#38bdf8' : '#3b5bdb',
              opacity: 0.85,
              pointerEvents: 'none',
              zIndex: 9998,
              transform: 'translateY(-50%)',
            }}
          />
        ))}

        {sorted.map(item => {
          const sel = selectedId === item.id;
          const base: React.CSSProperties = {
            position: 'absolute',
            left: `${item.x}%`,
            top: `${item.y}%`,
            width: `${item.w}%`,
            height: `${item.h}%`,
            zIndex: item.z,
            boxSizing: 'border-box',
            border: sel ? `2px solid ${isDark ? '#60a5fa' : '#3b5bdb'}` : `1px solid ${border}`,
            borderRadius: 8,
            overflow: 'hidden',
            background: isDark ? '#0f172a' : '#fff',
          };

          if (item.kind === 'text') {
            const t = item as WBTextItem;
            return (
              <div
                key={item.id}
                style={base}
                onClick={e => e.stopPropagation()}
                onPointerDown={e => {
                  if (readonly) return;
                  if ((e.target as HTMLElement).closest('textarea')) return;
                  bringToFront(item.id);
                  setSelectedId(item.id);
                }}
              >
                {!readonly && (
                  <div
                    onPointerDown={e => onPointerDown(e, item, 'move')}
                    style={{
                      height: 22,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '0 8px',
                      cursor: 'grab',
                      background: handleBg,
                      borderBottom: `1px solid ${border}`,
                      fontSize: 10,
                      color: muted,
                      flexShrink: 0,
                    }}
                  >
                    <span>文字</span>
                    <span style={{ opacity: 0.6 }}>拖拽移动</span>
                  </div>
                )}
                {readonly ? (
                  <p style={{ margin: 0, padding: 10, fontSize: 15, color: fg, lineHeight: 1.55, height: 'calc(100% - 0px)', overflow: 'auto', whiteSpace: 'pre-wrap' }}>
                    {t.content ?? ''}
                  </p>
                ) : (
                  <textarea
                    value={t.content ?? ''}
                    onChange={e => setTextFor(item.id, e.target.value)}
                    placeholder="输入正文…"
                    style={{
                      width: '100%',
                      height: 'calc(100% - 22px)',
                      border: 'none',
                      outline: 'none',
                      resize: 'none',
                      padding: 10,
                      fontSize: 14,
                      color: fg,
                      lineHeight: 1.55,
                      fontFamily: 'inherit',
                      background: 'transparent',
                      boxSizing: 'border-box',
                    }}
                  />
                )}
                {!readonly && (
                  <div
                    onPointerDown={e => onPointerDown(e, item, 'resize')}
                    style={{
                      position: 'absolute',
                      right: 2,
                      bottom: 2,
                      width: 14,
                      height: 14,
                      zIndex: 12,
                      cursor: 'nwse-resize',
                      borderRadius: 3,
                      background: isDark ? '#334155' : '#cbd5e1',
                    }}
                  />
                )}
              </div>
            );
          }

          if (item.kind === 'image') {
            const url = imageUrls[item.i];
            if (!url) return null;
            return (
              <div key={item.id} style={base} onClick={e => e.stopPropagation()}>
                {!readonly && (
                  <div
                    onPointerDown={e => onPointerDown(e, item, 'move')}
                    style={{
                      height: 20,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '0 6px',
                      cursor: 'grab',
                      background: handleBg,
                      borderBottom: `1px solid ${border}`,
                      fontSize: 10,
                      color: muted,
                    }}
                  >
                    <span>图片 {item.i + 1}</span>
                    {onRemoveImage && (
                      <button
                        type="button"
                        onClick={e => {
                          e.stopPropagation();
                          onRemoveImage(item.i);
                        }}
                        style={{ fontSize: 10, border: 'none', background: 'transparent', color: '#ef4444', cursor: 'pointer', padding: '0 4px' }}
                      >
                        移除
                      </button>
                    )}
                  </div>
                )}
                <div style={{ height: readonly ? '100%' : 'calc(100% - 20px)', display: 'flex', alignItems: 'center', justifyContent: 'center', background: isDark ? '#020617' : '#f1f5f9' }}>
                  <img src={url} alt="" style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} />
                </div>
                {!readonly && (
                  <div
                    onPointerDown={e => onPointerDown(e, item, 'resize')}
                    style={{
                      position: 'absolute',
                      right: 2,
                      bottom: 2,
                      width: 14,
                      height: 14,
                      zIndex: 12,
                      cursor: 'nwse-resize',
                      borderRadius: 3,
                      background: isDark ? '#334155' : '#cbd5e1',
                    }}
                  />
                )}
              </div>
            );
          }

          if (item.kind === 'lab') {
            if (!widgetType || !labSlot) return null;
            const labShell: React.CSSProperties = {
              ...base,
              display: 'flex',
              flexDirection: 'column',
              overflow: 'hidden',
              /* 与实验深色区一致，避免出现大块白底；边框略弱化 */
              background: '#0b1120',
              border: sel ? `2px solid ${isDark ? '#60a5fa' : '#3b5bdb'}` : `1px solid ${isDark ? '#334155' : '#94a3b8'}`,
            };
            const labBarBg = isDark ? 'rgba(15,23,42,0.92)' : 'rgba(241,245,249,0.95)';
            return (
              <div key={item.id} style={labShell} onClick={e => e.stopPropagation()}>
                {!readonly && (
                  <div
                    onPointerDown={e => onPointerDown(e, item, 'move')}
                    style={{
                      height: 18,
                      flexShrink: 0,
                      display: 'flex',
                      alignItems: 'center',
                      padding: '0 6px',
                      cursor: 'grab',
                      background: labBarBg,
                      borderBottom: `1px solid ${isDark ? '#1e293b' : '#e2e8f0'}`,
                      fontSize: 10,
                      color: muted,
                    }}
                  >
                    <span>实验</span>
                  </div>
                )}
                <div
                  style={{
                    flex: 1,
                    minHeight: 0,
                    width: '100%',
                    overflow: 'hidden',
                    display: 'flex',
                    flexDirection: 'column',
                    background: '#0b1120',
                  }}
                >
                  {labSlot}
                </div>
                {!readonly && (
                  <div
                    onPointerDown={e => onPointerDown(e, item, 'resize')}
                    style={{
                      position: 'absolute',
                      right: 2,
                      bottom: 2,
                      width: 14,
                      height: 14,
                      zIndex: 12,
                      cursor: 'nwse-resize',
                      borderRadius: 3,
                      background: isDark ? '#334155' : '#cbd5e1',
                    }}
                  />
                )}
              </div>
            );
          }

          return null;
        })}
      </div>

      {!readonly && (
        <div
          style={{
            border: `1px solid ${border}`,
            borderRadius: 10,
            padding: '10px 12px',
            background: isDark ? '#0f172a' : '#fafafa',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, fontSize: 12, fontWeight: 600, color: fg }}>
            <Layers size={14} /> 图层
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 160, overflowY: 'auto' }}>
            {layerList.map(it => (
              <div
                key={it.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  padding: '4px 6px',
                  borderRadius: 6,
                  background: selectedId === it.id ? (isDark ? '#1e3a5f' : '#eff6ff') : 'transparent',
                  fontSize: 11,
                  color: muted,
                }}
              >
                <button
                  type="button"
                  onClick={() => {
                    setSelectedId(it.id);
                    bringToFront(it.id);
                  }}
                  style={{ flex: 1, textAlign: 'left', border: 'none', background: 'none', cursor: 'pointer', color: fg, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                >
                  {layerLabel(it)} · z{it.z}
                </button>
                <button type="button" title="置顶" onClick={() => bringToFront(it.id)} style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: muted, padding: 2 }}>
                  <ArrowUpToLine size={12} />
                </button>
                <button type="button" title="上移" onClick={() => reorderLayer(it.id, 'up')} style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: muted, padding: 2 }}>
                  <ChevronUp size={12} />
                </button>
                <button type="button" title="下移" onClick={() => reorderLayer(it.id, 'down')} style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: muted, padding: 2 }}>
                  <ChevronDown size={12} />
                </button>
                <button
                  type="button"
                  title="删除"
                  onClick={() => deleteLayer(it)}
                  style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: '#ef4444', padding: 2 }}
                >
                  <Trash2 size={12} />
                </button>
              </div>
            ))}
          </div>
          {onAddTextBox && (
            <button
              type="button"
              onClick={onAddTextBox}
              style={{ marginTop: 8, width: '100%', padding: '6px', fontSize: 12, border: `1px dashed ${border}`, borderRadius: 8, background: 'transparent', cursor: 'pointer', color: muted }}
            >
              + 添加文字框
            </button>
          )}
        </div>
      )}

      {!readonly && (
        <p style={{ fontSize: 11, color: muted, margin: 0 }}>
          拖拽标题栏移动，右下角缩放；靠近画布中心或其它块边缘时会吸附对齐（显示蓝线）。使用图层列表调整叠放顺序。
        </p>
      )}
    </div>
  );
}
