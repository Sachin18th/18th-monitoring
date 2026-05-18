import React, { useId, useState } from 'react';
import { Eye, EyeOff, Copy, Check } from 'lucide-react';

export const FormSection = ({
  title,
  description,
  icon,
  dangerouslyRed = false,
  children,
  style,
}: any) => {
  return (
    <fieldset
      style={{
        background: 'var(--bg-surface)',
        border: `1px solid ${
          dangerouslyRed
            ? 'color-mix(in srgb, var(--error) 22%, var(--border-subtle))'
            : 'var(--border-subtle)'
        }`,
        borderRadius: '24px',
        padding: 'clamp(1.25rem, 3vw, 2rem)',
        boxShadow: 'var(--shadow-sm)',
        margin: 0,
        display: 'flex',
        flexDirection: 'column',
        gap: '1.5rem',
        ...style,
      }}
    >
      <legend
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '0.75rem',
          padding: '0 0.35rem',
          color: dangerouslyRed ? 'var(--error)' : 'var(--text-primary)',
          fontSize: '1.05rem',
          fontWeight: 800,
          letterSpacing: '-0.02em',
        }}
      >
        {icon ? <span style={{ display: 'inline-flex', alignItems: 'center' }}>{icon}</span> : null}
        {title}
      </legend>
      {description ? (
        <p
          style={{
            margin: 0,
            marginTop: '-0.25rem',
            color: 'var(--text-secondary)',
            fontSize: '0.92rem',
            lineHeight: 1.6,
          }}
        >
          {description}
        </p>
      ) : null}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>{children}</div>
    </fieldset>
  );
};

export const FormGroup = ({ children, style }: any) => (
  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.45rem', ...style }}>{children}</div>
);

export const FormLabel = ({ children, required, htmlFor }: any) => (
  <label
    htmlFor={htmlFor}
    style={{
      fontSize: '0.86rem',
      fontWeight: 800,
      color: 'var(--text-primary)',
      lineHeight: 1.4,
    }}
  >
    {children} {required ? <span style={{ color: 'var(--error)' }}>*</span> : null}
  </label>
);

export const FormHelper = ({ children, error }: any) => {
  if (!children) return null;
  return (
    <div
      style={{
        fontSize: '0.78rem',
        lineHeight: 1.5,
        color: error ? 'var(--error-text)' : 'var(--text-secondary)',
        fontWeight: error ? 700 : 500,
      }}
    >
      {children}
    </div>
  );
};

const inputBaseStyle: React.CSSProperties = {
  width: '100%',
  minHeight: '46px',
  padding: '0.8rem 0.95rem',
  background: 'color-mix(in srgb, var(--bg-muted) 68%, var(--bg-surface))',
  border: '1px solid var(--border-subtle)',
  borderRadius: '14px',
  color: 'var(--text-primary)',
  fontSize: '0.95rem',
  fontWeight: 600,
  outline: 'none',
  transition: 'border-color 160ms ease, box-shadow 160ms ease, background 160ms ease',
};

export const FormInput = ({ error, style, rightElement, id, ...props }: any) => {
  const generatedId = useId();
  const inputId = id ?? generatedId;

  return (
    <div style={{ position: 'relative', width: '100%' }}>
      <input
        id={inputId}
        {...props}
        style={{
          ...inputBaseStyle,
          borderColor: error ? 'color-mix(in srgb, var(--error) 24%, var(--border-subtle))' : 'var(--border-subtle)',
          boxShadow: error ? '0 0 0 4px color-mix(in srgb, var(--error) 10%, transparent)' : 'none',
          paddingRight: rightElement ? '3rem' : inputBaseStyle.padding,
          ...style,
        }}
        onFocus={(e: any) => {
          if (!error) {
            e.target.style.borderColor = 'var(--primary)';
            e.target.style.boxShadow = '0 0 0 4px color-mix(in srgb, var(--primary) 12%, transparent)';
          }
          props.onFocus?.(e);
        }}
        onBlur={(e: any) => {
          if (!error) {
            e.target.style.borderColor = 'var(--border-subtle)';
            e.target.style.boxShadow = 'none';
          }
          props.onBlur?.(e);
        }}
      />
      {rightElement ? (
        <div
          style={{
            position: 'absolute',
            right: '0.9rem',
            top: '50%',
            transform: 'translateY(-50%)',
            display: 'inline-flex',
            alignItems: 'center',
          }}
        >
          {rightElement}
        </div>
      ) : null}
    </div>
  );
};

export const FormSelect = ({ error, style, id, children, ...props }: any) => {
  const generatedId = useId();
  const selectId = id ?? generatedId;

  return (
    <select
      id={selectId}
      {...props}
      style={{
        ...inputBaseStyle,
        appearance: 'none',
        borderColor: error ? 'color-mix(in srgb, var(--error) 24%, var(--border-subtle))' : 'var(--border-subtle)',
        ...style,
      }}
    >
      {children}
    </select>
  );
};

export const FormCheckboxItem = ({ checked, onChange, title, description }: any) => (
  <button
    type="button"
    onClick={() => onChange(!checked)}
    style={{
      padding: '1rem 1rem 1rem 1.1rem',
      background: checked ? 'color-mix(in srgb, var(--primary) 7%, var(--bg-surface))' : 'var(--bg-surface)',
      border: `1px solid ${
        checked ? 'color-mix(in srgb, var(--primary) 24%, var(--border-subtle))' : 'var(--border-subtle)'
      }`,
      borderRadius: '16px',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: '1rem',
      cursor: 'pointer',
      textAlign: 'left',
      width: '100%',
    }}
  >
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
      <span style={{ fontSize: '0.92rem', fontWeight: 800, color: 'var(--text-primary)' }}>{title}</span>
      {description ? <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>{description}</span> : null}
    </div>
    <input
      type="checkbox"
      checked={checked}
      readOnly
      style={{ width: '1.15rem', height: '1.15rem', accentColor: 'var(--primary)', pointerEvents: 'none' }}
    />
  </button>
);

export const MaskedRevealInput = ({ value, label }: any) => {
  const [visible, setVisible] = useState(false);
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '0.7rem',
        padding: '1rem',
        background: 'color-mix(in srgb, var(--bg-muted) 72%, var(--bg-surface))',
        border: '1px solid var(--border-subtle)',
        borderRadius: '18px',
      }}
    >
      {label ? (
        <div style={{ fontSize: '0.7rem', fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
          {label}
        </div>
      ) : null}

      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '0.75rem',
          padding: '0.85rem 1rem',
          borderRadius: '14px',
          border: '1px solid var(--border-subtle)',
          background: 'var(--bg-surface)',
        }}
      >
        <div
          style={{
            flex: 1,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
            letterSpacing: visible ? 'normal' : '0.22em',
            fontWeight: 700,
          }}
        >
          {visible ? value : value.replace(/./g, '•')}
        </div>
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}>
          <button
            type="button"
            onClick={() => setVisible((open) => !open)}
            aria-label={visible ? 'Hide secret' : 'Reveal secret'}
            style={{ background: 'transparent', border: 0, color: 'var(--text-secondary)', cursor: 'pointer' }}
          >
            {visible ? <EyeOff size={16} /> : <Eye size={16} />}
          </button>
          <button
            type="button"
            onClick={handleCopy}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.45rem',
              minHeight: '34px',
              padding: '0 0.8rem',
              borderRadius: '999px',
              border: '1px solid var(--border-subtle)',
              background: copied ? 'var(--success)' : 'var(--bg-muted)',
              color: copied ? '#fff' : 'var(--text-primary)',
              fontSize: '0.75rem',
              fontWeight: 800,
              cursor: 'pointer',
            }}
          >
            {copied ? <Check size={14} /> : <Copy size={14} />}
            {copied ? 'Copied' : 'Copy'}
          </button>
        </div>
      </div>
    </div>
  );
};
