/**
 * DynamicLabHost — 动态实验宿主（强制走 render_code）。
 *
 * 规则：
 * - `definition.renderCode` 可用 → 交给 `AILabRuntime` 执行（并提供 `t` 动画时间）
 * - 不可用 → 显示缺少 render_code 的提示（不再走旧的 Canvas / profile / fallback）
 */
import React, { useEffect, useRef, useState } from 'react';
import type { LabComponentDefinition, LabWidgetProps } from './types';
import AILabRuntime from './AILabRuntime';
import { isUsableRenderCode } from '../../api/labs';

function MissingRenderCodePlaceholder({ height }: { height?: number }) {
  return (
    <div
      style={{
        background: '#0b1120',
        borderRadius: '10px',
        padding: '22px 18px',
        height: height ? `${height}px` : undefined,
        color: '#94a3b8',
        fontFamily: 'monospace',
        fontSize: '12px',
        lineHeight: 1.6,
      }}
    >
      <div style={{ color: '#f97316', fontWeight: 700, marginBottom: '8px' }}>缺少 render_code</div>
      <div>当前已配置为 <span style={{ color: '#e2e8f0' }}>强制使用 render_code</span> 渲染。</div>
      <div>该实验定义未提供可执行的 <span style={{ color: '#e2e8f0' }}>render_code</span>，因此不会渲染。</div>
    </div>
  );
}

function RenderCodeLabBranch({
  definition,
  state,
  onStateChange,
  readonly,
  height,
  driveRemountEpoch = 0,
}: LabWidgetProps & { definition: LabComponentDefinition; driveRemountEpoch?: number }) {
  const renderCode = isUsableRenderCode(definition.renderCode) ? definition.renderCode! : '';
  const [t, setT] = useState(0);
  const tRef = useRef(0);
  const rafRef = useRef(0);

  useEffect(() => {
    // readonly 下也允许动画（仅影响视觉），但避免不必要的刷新可按需关闭
    let last = 0;
    const tick = (ts: number) => {
      const dt = last === 0 ? 0 : Math.min((ts - last) / 1000, 0.05);
      last = ts;
      tRef.current += dt;
      setT(tRef.current);
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, []);

  const runtimeKey = `${renderCode.length}:${renderCode.slice(0, 96)}`;
  return (
    <div
      key={runtimeKey}
      style={{
        borderRadius: '10px',
        overflow: 'hidden',
        display: 'inline-block',
        verticalAlign: 'top',
        width: 'max-content',
        maxWidth: '100%',
        height: height != null ? `${height}px` : 'auto',
        minHeight: 0,
      }}
    >
      <AILabRuntime
        renderCode={renderCode}
        state={state}
        onStateChange={onStateChange}
        readonly={readonly}
        t={t}
        driveRemountEpoch={driveRemountEpoch}
      />
    </div>
  );
}

export default function DynamicLabHost({
  state,
  onStateChange,
  readonly,
  height,
  definition,
  driveRemountEpoch = 0,
}: LabWidgetProps & { definition: LabComponentDefinition; driveRemountEpoch?: number }) {
  if (!isUsableRenderCode(definition.renderCode)) {
    return <MissingRenderCodePlaceholder height={height} />;
  }

  return (
    <RenderCodeLabBranch
      definition={definition}
      state={state}
      onStateChange={onStateChange}
      readonly={readonly}
      height={height}
      driveRemountEpoch={driveRemountEpoch}
    />
  );
}
