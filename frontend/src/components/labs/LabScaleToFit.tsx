import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';

export type LabScalePin = 'center' | 'top-left';

/**
 * 将实验整体视为一块「设计尺寸」内容，在父容器内按 min(宽比, 高比) 等比例缩放（类似 object-fit: contain）。
 * @param pin `top-left`：从左上角对齐，留白主要在右下，视觉上更贴「实验核心」；`center`：居中留白。
 */
export default function LabScaleToFit({
  children,
  pin = 'top-left',
}: {
  children: ReactNode;
  pin?: LabScalePin;
}) {
  const outerRef = useRef<HTMLDivElement>(null);
  const innerRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);

  useLayoutEffect(() => {
    const outer = outerRef.current;
    const inner = innerRef.current;
    if (!outer || !inner) return;

    const fit = () => {
      const ow = outer.clientWidth;
      const oh = outer.clientHeight;
      if (ow < 2 || oh < 2) return;
      const iw = inner.offsetWidth || inner.scrollWidth;
      const ih = inner.offsetHeight || inner.scrollHeight;
      if (iw < 2 || ih < 2) return;
      setScale(Math.min(ow / iw, oh / ih));
    };

    const ro = new ResizeObserver(() => {
      requestAnimationFrame(() => requestAnimationFrame(fit));
    });
    ro.observe(outer);
    requestAnimationFrame(() => requestAnimationFrame(fit));
    return () => ro.disconnect();
  }, [children]);

  const pinTopLeft = pin === 'top-left';
  return (
    <div
      ref={outerRef}
      style={{
        width: '100%',
        height: '100%',
        minHeight: 0,
        overflow: 'hidden',
        display: 'flex',
        alignItems: pinTopLeft ? 'flex-start' : 'center',
        justifyContent: pinTopLeft ? 'flex-start' : 'center',
        position: 'relative',
      }}
    >
      <div
        style={{
          transform: `scale(${scale})`,
          transformOrigin: pinTopLeft ? '0 0' : 'center center',
          willChange: 'transform',
        }}
      >
        <div ref={innerRef} style={{ display: 'inline-block', verticalAlign: 'top' }}>
          {children}
        </div>
      </div>
    </div>
  );
}
