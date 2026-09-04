import { useState } from 'react';
import { Field } from './Field';

/** Native dropdown of common and already-used answers, with Other to type a new one. */
export function SuggestSelect({
  label,
  value,
  onChange,
  options,
  allowOther = true,
  placeholder = 'Select',
  error,
  autoCapitalize,
}: {
  label: string;
  value: string;
  onChange: (next: string) => void;
  options: string[];
  allowOther?: boolean;
  placeholder?: string;
  error?: string;
  autoCapitalize?: 'characters' | 'off';
}) {
  const [otherMode, setOtherMode] = useState(false);
  const inList = options.some((option) => option === value);
  const unmatched = Boolean(value) && !inList;
  const showingOther = allowOther && (unmatched || (otherMode && !inList));
  const selectValue = showingOther ? '__other' : value;

  if (options.length === 0) {
    return (
      <Field label={label} error={error}>
        <input
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder={placeholder}
          autoCapitalize={autoCapitalize}
          autoCorrect="off"
          spellCheck={false}
        />
      </Field>
    );
  }

  return (
    <Field label={label} error={error}>
      <select
        value={selectValue}
        onChange={(event) => {
          const next = event.target.value;
          if (next === '__other') {
            setOtherMode(true);
            onChange(inList ? '' : value);
            return;
          }
          setOtherMode(false);
          onChange(next);
        }}
      >
        <option value="">{placeholder}</option>
        {!allowOther && unmatched ? <option value={value}>{value}</option> : null}
        {options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
        {allowOther ? <option value="__other">Other…</option> : null}
      </select>
      {showingOther ? (
        <input
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder="Type it"
          autoCapitalize={autoCapitalize}
          autoCorrect="off"
          spellCheck={false}
        />
      ) : null}
    </Field>
  );
}
