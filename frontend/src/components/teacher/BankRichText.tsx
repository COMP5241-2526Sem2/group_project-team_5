import React from 'react';
import katex from 'katex';
import 'katex/dist/katex.min.css';

type MathChunk = { kind: 'text' | 'inline' | 'display'; value: string };

function backslashRunLengthBefore(s: string, index: number): number {
  let c = 0;
  for (let k = index - 1; k >= 0 && s[k] === '\\'; k--) c += 1;
  return c;
}

/** Odd number of `\` immediately before this index → escaped `$` (e.g. `\$`). */
function dollarEscaped(s: string, i: number): boolean {
  return backslashRunLengthBefore(s, i) % 2 === 1;
}

/**
 * Split on `$$...$$` (display) and `$...$` (inline). Respects `\$` as literal dollar.
 */
export function splitTextWithMath(raw: string): MathChunk[] {
  const chunks: MathChunk[] = [];
  let i = 0;
  const n = raw.length;

  while (i < n) {
    if (i <= n - 2 && raw[i] === '$' && raw[i + 1] === '$' && !dollarEscaped(raw, i)) {
      const bodyStart = i + 2;
      let j = bodyStart;
      let closed = false;
      while (j <= n - 2) {
        if (raw[j] === '$' && raw[j + 1] === '$' && !dollarEscaped(raw, j)) {
          chunks.push({ kind: 'display', value: raw.slice(bodyStart, j) });
          i = j + 2;
          closed = true;
          break;
        }
        j += 1;
      }
      if (!closed) {
        chunks.push({ kind: 'text', value: raw.slice(i) });
        break;
      }
      continue;
    }

    if (raw[i] === '$' && !dollarEscaped(raw, i)) {
      const bodyStart = i + 1;
      let j = bodyStart;
      while (j < n) {
        if (raw[j] === '$' && !dollarEscaped(raw, j)) {
          chunks.push({ kind: 'inline', value: raw.slice(bodyStart, j) });
          i = j + 1;
          break;
        }
        j += 1;
      }
      if (j >= n) {
        chunks.push({ kind: 'text', value: raw.slice(i) });
        break;
      }
      continue;
    }

    let k = i;
    while (k < n) {
      if (raw[k] === '$' && !dollarEscaped(raw, k)) break;
      k += 1;
    }
    const text = raw.slice(i, k);
    if (text.length > 0) chunks.push({ kind: 'text', value: text });
    i = k;
  }

  return chunks;
}

function renderBoldSegments(text: string, keyBase: string): React.ReactNode {
  const re = /\*\*([^*]+)\*\*/g;
  const nodes: React.ReactNode[] = [];
  let last = 0;
  let m: RegExpExecArray | null;
  let k = 0;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) {
      nodes.push(<React.Fragment key={`${keyBase}-t-${k++}`}>{text.slice(last, m.index)}</React.Fragment>);
    }
    nodes.push(<strong key={`${keyBase}-b-${k++}`}>{m[1]}</strong>);
    last = m.index + m[0].length;
  }
  if (last < text.length) {
    nodes.push(<React.Fragment key={`${keyBase}-t-${k++}`}>{text.slice(last)}</React.Fragment>);
  }
  return nodes.length > 0 ? nodes : text;
}

function renderTextWithBoldAndImages(text: string, keyBase: string): React.ReactNode {
  const parts: React.ReactNode[] = [];
  let last = 0;
  let m: RegExpExecArray | null;
  let i = 0;
  const re = /!\[([^\]]*)\]\((\/math_figures\/[a-zA-Z0-9._-]+\.(?:svg|png|webp|gif))\)/gi;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) {
      parts.push(
        <React.Fragment key={`${keyBase}-t-${i}`}>
          {renderBoldSegments(text.slice(last, m.index), `${keyBase}-b-${i}`)}
        </React.Fragment>,
      );
    }
    parts.push(
      <img
        key={`${keyBase}-img-${i++}`}
        src={m[2]}
        alt={m[1] || 'Figure'}
        loading="lazy"
        style={{
          maxWidth: '100%',
          height: 'auto',
          display: 'block',
          margin: '10px 0',
          borderRadius: 8,
          border: '1px solid #e5e7eb',
          background: '#fafafa',
        }}
      />,
    );
    last = m.index + m[0].length;
  }
  if (last < text.length) {
    parts.push(
      <React.Fragment key={`${keyBase}-tail`}>
        {renderBoldSegments(text.slice(last), `${keyBase}-btail`)}
      </React.Fragment>,
    );
  }
  if (parts.length === 0) return renderBoldSegments(text, keyBase);
  return <>{parts}</>;
}

function katexToHtml(tex: string, displayMode: boolean): string {
  const t = tex.trim();
  if (!t) return '';
  try {
    return katex.renderToString(t, {
      throwOnError: false,
      displayMode,
      strict: 'ignore',
      trust: false,
    });
  } catch {
    return t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }
}

function KaTeXBlock({ tex, display }: { tex: string; display: boolean }) {
  const html = katexToHtml(tex, display);
  if (display) {
    return (
      <div
        className="bank-rich-math-display"
        style={{
          margin: '8px 0',
          overflowX: 'auto',
          maxWidth: '100%',
          lineHeight: 1.25,
        }}
        dangerouslySetInnerHTML={{ __html: html }}
      />
    );
  }
  return (
    <span
      className="bank-rich-math-inline"
      style={{ display: 'inline-block', verticalAlign: 'middle', margin: '0 1px' }}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

/**
 * Question bank rich text: `**bold**`, `![alt](/math_figures/*.svg)`, newlines (`pre-line`),
 * and LaTeX via KaTeX (`$…$`, `$$…$$`).
 */
export function BankRichText({ text }: { text: string }): React.ReactNode {
  if (!text) return null;
  const parts = splitTextWithMath(text);
  return (
    <div style={{ whiteSpace: 'pre-line' }}>
      {parts.map((p, idx) => {
        const key = `c-${idx}`;
        if (p.kind === 'text') {
          return (
            <React.Fragment key={key}>{renderTextWithBoldAndImages(p.value, key)}</React.Fragment>
          );
        }
        if (p.kind === 'inline') {
          return <KaTeXBlock key={key} tex={p.value} display={false} />;
        }
        return <KaTeXBlock key={key} tex={p.value} display />;
      })}
    </div>
  );
}
