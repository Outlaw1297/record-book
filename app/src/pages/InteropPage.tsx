import { useRef, useState, type DragEvent, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/schema';
import { applyCowSenseImport, type ImportMode } from '../interop/applyImport';
import {
  downloadTextFile,
  exportCowSenseAnimalsCsv,
  exportCowSenseBreedingCsv,
  exportCowSenseCalvingCsv,
  exportCowSenseSalesCsv,
  exportCowSenseTreatmentsCsv,
} from '../interop/export';
import { countRows, parseCowSenseBytes, type ParsedHerd } from '../interop/parse';
import { Field, Segmented } from '../ui/Field';
import { useToast } from '../ui/Toast';

export function InteropPage() {
  const toast = useToast();
  const inputRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState('');
  const [parsed, setParsed] = useState<ParsedHerd | null>(null);
  const [mode, setMode] = useState<ImportMode>('merge');
  const [busy, setBusy] = useState<'read' | 'import' | null>(null);
  const [drag, setDrag] = useState(false);

  const live = useLiveQuery(async () => {
    const [animals, cowCalf, breeding, treatments, sales] = await Promise.all([
      db.animals.filter((row) => !row.deletedAt).toArray(),
      db.cowCalf.filter((row) => !row.deletedAt).toArray(),
      db.breeding.filter((row) => !row.deletedAt).toArray(),
      db.treatments.filter((row) => !row.deletedAt).toArray(),
      db.sales.filter((row) => !row.deletedAt).toArray(),
    ]);
    return { animals, cowCalf, breeding, treatments, sales };
  });

  async function readFile(file: File) {
    setBusy('read');
    setFileName(file.name);
    try {
      const buffer = new Uint8Array(await file.arrayBuffer());
      const next = parseCowSenseBytes(buffer, file.name);
      setParsed(next);
      if (countRows(next) === 0) {
        toast(next.warnings[0] || 'No herd rows in that file.');
      } else {
        toast(
          `Read ${next.animals.length} animals` +
            (next.cowCalf.length ? `, ${next.cowCalf.length} calving` : '') +
            (next.treatments.length ? `, ${next.treatments.length} treatments` : '') +
            '.',
        );
      }
    } catch (error) {
      toast(error instanceof Error ? error.message : 'Could not read that file.');
      setParsed(null);
    }
    setBusy(null);
  }

  function onDrop(event: DragEvent) {
    event.preventDefault();
    setDrag(false);
    const file = event.dataTransfer.files[0];
    if (file) void readFile(file);
  }

  async function onImport(event: FormEvent) {
    event.preventDefault();
    if (!parsed || countRows(parsed) === 0) {
      toast('Choose a Cow Sense CSV or TXT first.');
      return;
    }
    setBusy('import');
    try {
      const result = await applyCowSenseImport(parsed, mode);
      toast(
        `Imported ${result.animals} animals` +
          (result.cowCalf ? `, ${result.cowCalf} calving` : '') +
          (result.treatments ? `, ${result.treatments} treatments` : '') +
          '. They stay on this ranch’s book.',
      );
    } catch (error) {
      toast(error instanceof Error ? error.message : 'Import failed.');
    }
    setBusy(null);
  }

  function exportAnimals() {
    const rows = live?.animals ?? [];
    if (rows.length === 0) {
      toast('No animals to export yet.');
      return;
    }
    downloadTextFile(
      `cowsense-animals-${new Date().toISOString().slice(0, 10)}.csv`,
      exportCowSenseAnimalsCsv(rows),
    );
    toast('CSV uses Cow Sense Sex, Type, and Status words. In Cow Sense: Tools > Import.');
  }

  return (
    <div className="page">
      <header className="page-header">
        <h1>Cow Sense</h1>
        <p className="lede">
          Pull this ranch’s herd in from Cow Sense, edit it here, then send a CSV
          back through Cow Sense Tools → Import.
        </p>
      </header>

      <form className="form" onSubmit={onImport} style={{ marginTop: '1rem' }}>
        <div
          className={drag ? 'dropzone drag' : 'dropzone'}
          onDragOver={(event) => {
            event.preventDefault();
            setDrag(true);
          }}
          onDragLeave={() => setDrag(false)}
          onDrop={onDrop}
        >
          <p className="due-kicker">Import</p>
          <h2>{fileName || 'Nygaaard.csh or a Cow Sense CSV'}</h2>
          <p>
            Drop the herd file here, or a CSV/TXT from Manage → List. .csh is
            Cow Sense’s private database; if that file is not a spreadsheet, export
            List as CSV in Cow Sense and drop that too.
          </p>
          <button
            type="button"
            className="btn secondary"
            disabled={busy !== null}
            onClick={() => inputRef.current?.click()}
          >
            {busy === 'read' ? 'Reading…' : 'Choose file'}
          </button>
          <input
            ref={inputRef}
            className="sr-only"
            type="file"
            accept=".csh,.csv,.txt,.tsv,.json,text/csv,text/plain"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void readFile(file);
              event.target.value = '';
            }}
          />
        </div>

        {parsed ? (
          <div className="preview-card">
            <p className="due-kicker">
              {parsed.format} {parsed.magic ? `· ${parsed.magic.slice(0, 48)}` : ''}
            </p>
            <p>
              {parsed.animals.length} animals · {parsed.cowCalf.length} calving ·{' '}
              {parsed.breeding.length} breeding · {parsed.treatments.length} treatments ·{' '}
              {parsed.sales.length} sales
            </p>
            {parsed.warnings.map((warning) => (
              <p className="hint" key={warning}>
                {warning}
              </p>
            ))}
            {parsed.unmappedColumns.length > 0 ? (
              <p className="hint">
                Extra columns kept on each animal: {parsed.unmappedColumns.join(', ')}
              </p>
            ) : null}
            {parsed.animals.slice(0, 8).length > 0 ? (
              <div className="table-wrap" style={{ marginTop: '0.75rem' }}>
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Visual ID</th>
                      <th>Sex</th>
                      <th>Type</th>
                      <th>Status</th>
                      <th>Dam</th>
                    </tr>
                  </thead>
                  <tbody>
                    {parsed.animals.slice(0, 8).map((animal) => (
                      <tr key={animal.id}>
                        <td>{animal.herdId}</td>
                        <td>{animal.sex || '—'}</td>
                        <td>{animal.animalType || '—'}</td>
                        <td>{animal.status}</td>
                        <td>{animal.damId || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : null}
          </div>
        ) : null}

        <Field label="If a Visual ID already exists">
          <Segmented
            ariaLabel="Import mode"
            value={mode}
            onChange={setMode}
            options={[
              { value: 'merge', label: 'Merge' },
              { value: 'replace', label: 'Replace herd' },
            ]}
          />
        </Field>
        <p className="hint">
          Merge fills empty fields and updates mapped columns. Replace marks
          current animals gone, then loads this file.
        </p>
        <div className="sticky-actions">
          <Link className="btn secondary" to="/herd">
            Open herd
          </Link>
          <button
            type="submit"
            className="btn primary"
            disabled={busy !== null || !parsed || countRows(parsed) === 0}
          >
            {busy === 'import' ? 'Importing…' : 'Import into this ranch'}
          </button>
        </div>
      </form>

      <section className="sync-panel" style={{ marginTop: '1.5rem' }}>
        <h2>Send back to Cow Sense</h2>
        <p className="hint">
          Cow Sense will not open a Record Book file. Download CSV, then in Cow
          Sense use Tools → Import. Sex must be Heifer/Cow/Bull/Steer, and Type
          and Status are required. These buttons write those words.
        </p>
        <p className="hint">
          On this device now: {live?.animals.length ?? 0} animals ·{' '}
          {live?.treatments.length ?? 0} treatments
        </p>
        <div className="provider-actions">
          <button type="button" className="btn primary" onClick={exportAnimals}>
            Download animals CSV
          </button>
          <button
            type="button"
            className="btn secondary"
            onClick={() =>
              downloadTextFile(
                `cowsense-calving-${new Date().toISOString().slice(0, 10)}.csv`,
                exportCowSenseCalvingCsv(live?.cowCalf ?? []),
              )
            }
          >
            Calving CSV
          </button>
        </div>
        <div className="provider-actions">
          <button
            type="button"
            className="btn ghost"
            onClick={() =>
              downloadTextFile(
                `cowsense-breeding-${new Date().toISOString().slice(0, 10)}.csv`,
                exportCowSenseBreedingCsv(live?.breeding ?? []),
              )
            }
          >
            Breeding CSV
          </button>
          <button
            type="button"
            className="btn ghost"
            onClick={() =>
              downloadTextFile(
                `cowsense-treatments-${new Date().toISOString().slice(0, 10)}.csv`,
                exportCowSenseTreatmentsCsv(live?.treatments ?? []),
              )
            }
          >
            Treatments CSV
          </button>
          <button
            type="button"
            className="btn ghost"
            onClick={() =>
              downloadTextFile(
                `cowsense-sales-${new Date().toISOString().slice(0, 10)}.csv`,
                exportCowSenseSalesCsv(live?.sales ?? []),
              )
            }
          >
            Sales CSV
          </button>
        </div>
      </section>
    </div>
  );
}
