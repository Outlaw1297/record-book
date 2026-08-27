export type CsvTable = {
  headers: string[];
  rows: string[][];
};

function splitLine(line: string, delimiter: string): string[] {
  const cells: string[] = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }
    if (char === delimiter && !inQuotes) {
      cells.push(current.trim());
      current = '';
      continue;
    }
    current += char;
  }
  cells.push(current.trim());
  return cells;
}

export function detectDelimiter(text: string): string {
  const first = text.split(/\r?\n/).find((line) => line.trim()) ?? '';
  const commas = (first.match(/,/g) ?? []).length;
  const tabs = (first.match(/\t/g) ?? []).length;
  const semis = (first.match(/;/g) ?? []).length;
  if (tabs > commas && tabs >= semis) return '\t';
  if (semis > commas && semis >= tabs) return ';';
  return ',';
}

export function parseCsv(text: string, delimiter = detectDelimiter(text)): CsvTable {
  const lines = text.replace(/^\uFEFF/, '').split(/\r?\n/);
  const rows: string[][] = [];
  for (const line of lines) {
    if (!line.trim()) continue;
    rows.push(splitLine(line, delimiter));
  }
  if (rows.length === 0) return { headers: [], rows: [] };
  const width = Math.max(...rows.map((row) => row.length));
  const padded = rows.map((row) => {
    const next = row.slice();
    while (next.length < width) next.push('');
    return next;
  });
  return { headers: padded[0], rows: padded.slice(1) };
}

export function toCsv(headers: string[], rows: Array<Array<string | number | undefined>>): string {
  const escape = (value: string | number | undefined) => {
    const text = value == null ? '' : String(value);
    if (/[",\n\r]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
    return text;
  };
  return [headers.map(escape).join(','), ...rows.map((row) => row.map(escape).join(','))].join(
    '\r\n',
  );
}

export function decodeSpreadsheetBytes(bytes: Uint8Array): string {
  if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe) {
    return new TextDecoder('utf-16le').decode(bytes);
  }
  if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) {
    return new TextDecoder('utf-16be').decode(bytes);
  }
  if (bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
    return new TextDecoder('utf-8').decode(bytes);
  }
  const utf8 = new TextDecoder('utf-8', { fatal: false }).decode(bytes);
  const nul = bytes.filter((byte) => byte === 0).length;
  if (nul > bytes.length / 8) {
    return new TextDecoder('utf-16le').decode(bytes);
  }
  return utf8;
}
