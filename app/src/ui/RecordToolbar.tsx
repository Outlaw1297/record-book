import type { ReactNode } from 'react';
import { IconSearch } from './icons';

export function RecordToolbar({
  query,
  onQuery,
  placeholder,
  year,
  onYear,
  years,
  children,
}: {
  query: string;
  onQuery: (value: string) => void;
  placeholder: string;
  year?: 'all' | number;
  onYear?: (value: 'all' | number) => void;
  years?: number[];
  children?: ReactNode;
}) {
  return (
    <div className="record-toolbar">
      <label className="search-wrap">
        <span className="sr-only">Search</span>
        <IconSearch />
        <input
          className="search-input"
          value={query}
          onChange={(event) => onQuery(event.target.value)}
          placeholder={placeholder}
          autoCapitalize="characters"
          autoCorrect="off"
          spellCheck={false}
        />
      </label>
      {onYear || children ? (
        <div className="record-filters">
          {onYear ? (
            <label className="filter-field">
              <span className="sr-only">Year</span>
              <select
                value={year === 'all' || year == null ? 'all' : String(year)}
                onChange={(event) =>
                  onYear(event.target.value === 'all' ? 'all' : Number(event.target.value))
                }
              >
                <option value="all">All years</option>
                {(years ?? []).map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          {children}
        </div>
      ) : null}
    </div>
  );
}

export function matchesQuery(hay: Array<string | number | undefined>, query: string): boolean {
  const needle = query.trim().toLowerCase();
  if (!needle) return true;
  return hay
    .filter((part) => part !== undefined && part !== '')
    .join(' ')
    .toLowerCase()
    .includes(needle);
}

export function matchesYear(rowYear: number | undefined, year: 'all' | number): boolean {
  if (year === 'all') return true;
  return rowYear === year;
}
