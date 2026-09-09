import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { findAnimalByElectronicId, type Animal } from '../db/schema';
import { Segmented } from '../ui/Field';
import { formatEidGroups } from './parseEid';
import { useEidReader } from './useEidReader';
import { rememberScannedEid } from './wand';

export type EidMethod = 'type' | 'photo' | 'wand';

const METHOD_LABEL: Record<EidMethod, string> = {
  type: 'Type',
  photo: 'Photo',
  wand: 'Wand',
};

export function EidCapture({
  value,
  onChange,
  variant,
  methods,
  excludeAnimalId,
  autoOpen,
  onOpenAnimal,
}: {
  value: string;
  onChange: (eid: string) => void;
  variant: 'fill' | 'lookup';
  methods?: EidMethod[];
  excludeAnimalId?: string;
  autoOpen?: boolean;
  onOpenAnimal?: (animal: Animal) => void;
}) {
  const options: EidMethod[] =
    methods ?? (variant === 'fill' ? ['type', 'photo', 'wand'] : ['photo', 'wand', 'type']);
  const [method, setMethod] = useState<EidMethod>(options[0] ?? 'type');
  const [match, setMatch] = useState<Animal | null | undefined>(undefined);
  const [owner, setOwner] = useState<Animal | null>(null);
  const openedFor = useRef('');
  const onOpenAnimalRef = useRef(onOpenAnimal);
  const reader = useEidReader(onChange);

  useEffect(() => {
    onOpenAnimalRef.current = onOpenAnimal;
  }, [onOpenAnimal]);

  useEffect(() => {
    const digits = value.replace(/\D/g, '');
    if (digits.length < 8) {
      setMatch(undefined);
      setOwner(null);
      return;
    }
    let cancelled = false;
    void findAnimalByElectronicId(value).then((animal) => {
      if (cancelled) return;
      setMatch(animal ?? null);
      if (animal && animal.id !== excludeAnimalId) setOwner(animal);
      else setOwner(null);
      if (autoOpen && animal && openedFor.current !== digits) {
        openedFor.current = digits;
        onOpenAnimalRef.current?.(animal);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [value, excludeAnimalId, autoOpen]);

  const showInput = options.includes('type') && (variant === 'fill' || method === 'type');

  return (
    <div className={`eid-capture eid-capture-${variant}`}>
      {variant === 'fill' ? (
        <input
          value={value}
          onChange={(event) => onChange(event.target.value)}
          inputMode="numeric"
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
          placeholder="982 003 123 456 789"
          autoComplete="off"
          aria-label="Electronic ID"
        />
      ) : showInput ? (
        <input
          value={value}
          onChange={(event) => onChange(event.target.value)}
          inputMode="numeric"
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
          placeholder="Type the 15 digits"
          aria-label="Electronic ID to find"
        />
      ) : null}

      <Segmented
        ariaLabel="How to enter the EID"
        value={method}
        onChange={setMethod}
        options={options.map((id) => ({ value: id, label: METHOD_LABEL[id] }))}
      />

      {method === 'type' && variant === 'fill' ? (
        <p className="hint">Type the number printed on the yellow disc.</p>
      ) : null}

      {method === 'photo' ? (
        <div className="eid-capture-tools">
          <p className="hint">
            Fill the frame with the yellow disc. Square to the tag works better than from the side.
          </p>
          <div className="eid-actions">
            <button
              type="button"
              className="btn primary"
              disabled={Boolean(reader.photoBusy)}
              onClick={reader.openCamera}
            >
              Take photo
            </button>
            <button
              type="button"
              className="btn secondary"
              disabled={Boolean(reader.photoBusy)}
              onClick={reader.openFile}
            >
              Choose photo
            </button>
          </div>
          <input
            ref={reader.cameraRef}
            className="sr-only"
            type="file"
            accept="image/*"
            capture="environment"
            onChange={(event) => void reader.onPhoto(event.target.files?.[0])}
          />
          <input
            ref={reader.fileRef}
            className="sr-only"
            type="file"
            accept="image/*"
            onChange={(event) => void reader.onPhoto(event.target.files?.[0])}
          />
          {reader.photoBusy ? <p className="hint">{reader.photoBusy}</p> : null}
          {reader.photoError ? <p className="field-error">{reader.photoError}</p> : null}
          {reader.preview ? (
            <img className="eid-preview" src={reader.preview} alt="Tag photo" />
          ) : null}
        </div>
      ) : null}

      {method === 'wand' ? (
        <div className="eid-capture-tools">
          <p className="hint">
            On the XRS2i: Bluetooth → Slave, profile <strong>HID</strong> (or HID Smart). Pair it
            in Android like a keyboard, then scan into this box.
          </p>
          <input
            ref={reader.hidRef}
            className="eid-hid"
            inputMode="numeric"
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
            placeholder="Waiting for wand…"
            aria-label="Wand number"
            autoFocus
            onFocus={() => reader.hidRef.current?.select()}
            onChange={(event) => reader.onHidChange(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                reader.onHidEnter();
              }
            }}
          />
          <p className="hint">{reader.wandStatus}</p>
          {reader.bleAvailable ? (
            <button
              type="button"
              className="btn secondary"
              disabled={reader.wandBusy}
              onClick={() => void reader.onBle()}
            >
              {reader.wandBusy ? 'Connecting…' : 'Connect wand over Bluetooth'}
            </button>
          ) : (
            <p className="hint">
              This screen uses the wand as a keyboard. BLE connect needs Chrome on Android if HID
              pairing is not available.
            </p>
          )}
        </div>
      ) : null}

      {variant === 'fill' && owner ? (
        <p className="eid-owner warn">
          Already on <Link to={`/herd/${encodeURIComponent(owner.herdId)}`}>{owner.herdId}</Link>
          {owner.animalType ? ` · ${owner.animalType}` : ''}.
        </p>
      ) : null}

      {variant === 'lookup' && value.replace(/\D/g, '').length >= 8 ? (
        <div className="eid-result" aria-live="polite">
          <p className="due-kicker">Electronic ID</p>
          <p className="eid-digits">{formatEidGroups(value)}</p>
          {match === undefined ? (
            <p className="hint">Looking in this ranch’s herd…</p>
          ) : match ? (
            <>
              <p>
                This tag belongs to <strong>{match.herdId}</strong>
                {match.animalType ? ` · ${match.animalType}` : ''}
                {match.name ? ` · ${match.name}` : ''}.
              </p>
              <div className="eid-actions">
                <button
                  type="button"
                  className="btn primary"
                  onClick={() => onOpenAnimal?.(match)}
                >
                  Open {match.herdId}
                </button>
              </div>
            </>
          ) : (
            <>
              <p>No animal in this book has that EID yet.</p>
              <div className="eid-actions">
                <Link
                  className="btn primary"
                  to="/herd/new"
                  onClick={() => rememberScannedEid(value.replace(/\D/g, ''))}
                >
                  Start a new record
                </Link>
              </div>
            </>
          )}
        </div>
      ) : null}
    </div>
  );
}
