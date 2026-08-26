import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';

export function Field({
  label,
  children,
  error,
}: {
  label: string;
  children: ReactNode;
  error?: string;
}) {
  return (
    <label className="field">
      <span className="field-label">{label}</span>
      {children}
      {error ? <span className="field-error">{error}</span> : null}
    </label>
  );
}

export function EmptyState({
  title,
  body,
  actionTo,
  actionLabel,
}: {
  title: string;
  body: string;
  actionTo?: string;
  actionLabel?: string;
}) {
  return (
    <div className="empty-state">
      <h2>{title}</h2>
      <p className="lede" style={{ marginInline: 'auto' }}>
        {body}
      </p>
      {actionTo && actionLabel ? (
        <p style={{ marginTop: '1rem' }}>
          <Link className="btn primary" to={actionTo}>
            {actionLabel}
          </Link>
        </p>
      ) : null}
    </div>
  );
}

export function Segmented<T extends string>({
  value,
  onChange,
  options,
  ariaLabel,
}: {
  value: T;
  onChange: (value: T) => void;
  options: Array<{ value: T; label: string }>;
  ariaLabel: string;
}) {
  return (
    <div className="segmented" role="group" aria-label={ariaLabel}>
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          aria-pressed={value === option.value}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
