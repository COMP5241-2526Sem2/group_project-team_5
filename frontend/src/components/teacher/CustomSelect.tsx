import { useState, useRef, useEffect } from 'react';
import { ChevronDown, ChevronUp, Check } from 'lucide-react';

interface CustomSelectProps {
  options: string[];
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  label?: string;
  width?: string | number;
  minWidth?: string | number;
  disabled?: boolean;
}

export function CustomSelect({
  options,
  value,
  onChange,
  placeholder,
  label,
  width,
  minWidth = 140,
  disabled = false,
}: CustomSelectProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Close when clicking outside
  useEffect(() => {
    if (!open) return;
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const displayValue = value || placeholder || options[0] || '';

  return (
    <div style={{ width, minWidth, position: 'relative' }} ref={ref}>
      {label && (
        <div style={{ fontSize: '12px', fontWeight: 600, color: '#374151', marginBottom: '6px' }}>
          {label}
        </div>
      )}

      {/* Trigger */}
      <button
        type="button"
        disabled={disabled}
        onClick={() => !disabled && setOpen(o => !o)}
        style={{
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '8px',
          padding: '8px 12px',
          background: disabled ? '#f9fafb' : '#fff',
          border: `1.5px solid ${open ? '#3b5bdb' : '#a5b4fc'}`,
          borderRadius: '8px',
          cursor: disabled ? 'not-allowed' : 'pointer',
          fontSize: '13px',
          color: '#3b5bdb',
          textAlign: 'left',
          transition: 'border-color 0.15s, box-shadow 0.15s',
          boxShadow: open ? '0 0 0 3px rgba(59,91,219,0.10)' : 'none',
          outline: 'none',
          whiteSpace: 'nowrap',
          overflow: 'hidden',
        }}
      >
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', flex: 1 }}>
          {displayValue}
        </span>
        {open
          ? <ChevronUp size={14} style={{ flexShrink: 0, color: '#3b5bdb' }} />
          : <ChevronDown size={14} style={{ flexShrink: 0, color: '#3b5bdb' }} />
        }
      </button>

      {/* Dropdown panel */}
      {open && (
        <div
          style={{
            position: 'absolute',
            top: 'calc(100% + 4px)',
            left: 0,
            right: 0,
            zIndex: 9999,
            background: '#fff',
            border: '1px solid #e8eaed',
            borderRadius: '10px',
            boxShadow: '0 8px 24px rgba(0,0,0,0.10), 0 2px 6px rgba(0,0,0,0.05)',
            overflow: 'hidden',
            minWidth: '100%',
          }}
        >
          {options.map((opt, i) => {
            const isSelected = opt === value;
            return (
              <button
                key={opt || `opt-${i}`}
                type="button"
                onClick={() => { onChange(opt); setOpen(false); }}
                style={{
                  width: '100%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: '8px',
                  padding: '10px 14px',
                  background: isSelected ? '#eef2ff' : 'transparent',
                  borderTop: 'none',
                  borderRight: 'none',
                  borderBottom: 'none',
                  borderLeft: 'none',
                  cursor: 'pointer',
                  fontSize: '13px',
                  color: isSelected ? '#3b5bdb' : '#374151',
                  fontWeight: isSelected ? 600 : 400,
                  textAlign: 'left',
                  transition: 'background 0.1s',
                }}
                onMouseEnter={e => {
                  if (!isSelected) (e.currentTarget as HTMLElement).style.background = '#f5f7ff';
                }}
                onMouseLeave={e => {
                  if (!isSelected) (e.currentTarget as HTMLElement).style.background = 'transparent';
                }}
              >
                <span>{opt}</span>
                {isSelected && (
                  <Check size={14} style={{ color: '#3b5bdb', flexShrink: 0 }} />
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ── SelectField: labelled wrapper matching the existing API ─────────────── */
interface SelectFieldProps {
  label: string;
  options: string[];
  placeholder?: string;
  value?: string;
  onChange?: (v: string) => void;
}

export function SelectField({ label, options, placeholder, value, onChange }: SelectFieldProps) {
  const all = placeholder ? [placeholder, ...options] : options;
  return (
    <CustomSelect
      label={label}
      options={all}
      value={value ?? ''}
      onChange={v => {
        if (v === placeholder) onChange?.('');
        else onChange?.(v);
      }}
      width="100%"
    />
  );
}