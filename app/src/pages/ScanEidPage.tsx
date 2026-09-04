import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { findAnimalByElectronicId, type Animal } from '../db/schema';
import { formatEidGroups } from '../eid/parseEid';
import { readEidFromPhoto } from '../eid/tagPhoto';
import {
  bluetoothAvailable,
  connectBleWand,
  createHidEidBuffer,
  rememberScannedEid,
} from '../eid/wand';
import { Field } from '../ui/Field';
import { useToast } from '../ui/Toast';

export function ScanEidPage() {
  const navigate = useNavigate();
  const toast = useToast();
  const [params] = useSearchParams();
  const returnTo = params.get('return') || '';
  const hidRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const stopBle = useRef<(() => void) | undefined>(undefined);
  const hid = useRef(createHidEidBuffer(onEid));

  const [eid, setEid] = useState('');
  const [preview, setPreview] = useState('');
  const [photoBusy, setPhotoBusy] = useState('');
  const [photoError, setPhotoError] = useState('');
  const [wandStatus, setWandStatus] = useState(
    'Pair the XRS2i as a keyboard (HID), then scan into the box.',
  );
  const [wandBusy, setWandBusy] = useState(false);
  const [match, setMatch] = useState<Animal | null | undefined>(undefined);

  function onEid(next: string): void {
    setEid(next);
    setPhotoError('');
    void findAnimalByElectronicId(next).then((animal) => setMatch(animal ?? null));
    if (hidRef.current) hidRef.current.value = next;
  }

  useEffect(() => {
    hid.current = createHidEidBuffer(onEid);
    return () => {
      hid.current.dispose();
      stopBle.current?.();
      if (preview) URL.revokeObjectURL(preview);
    };
    // preview cleaned when replaced
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function onPhoto(file: File | undefined): Promise<void> {
    if (!file) return;
    setPhotoError('');
    setPhotoBusy('Reading photo…');
    try {
      const result = await readEidFromPhoto(file, setPhotoBusy);
      if (preview) URL.revokeObjectURL(preview);
      setPreview(result.previewUrl);
      onEid(result.eid);
    } catch (error) {
      setPhotoError(error instanceof Error ? error.message : 'Could not read the photo.');
    } finally {
      setPhotoBusy('');
    }
  }

  async function onBle(): Promise<void> {
    setWandBusy(true);
    try {
      stopBle.current?.();
      stopBle.current = await connectBleWand(onEid, setWandStatus);
    } catch (error) {
      setWandStatus(error instanceof Error ? error.message : 'Could not open Bluetooth.');
    } finally {
      setWandBusy(false);
    }
  }

  function useEid(): void {
    if (!eid) return;
    rememberScannedEid(eid);
    if (returnTo.startsWith('/')) {
      navigate(returnTo);
      return;
    }
    if (match) {
      navigate(`/herd/${encodeURIComponent(match.herdId)}`);
      return;
    }
    navigate('/herd/new');
  }

  return (
    <div className="page">
      <header className="page-header">
        <h1>Read EID tag</h1>
        <p className="lede">
          Photo the yellow Allflex disc, or scan with a Tru-Test / Datamars wand
          (XRS2i, SRS2i, AWR250).
        </p>
      </header>

      <section className="eid-panel">
        <h2>Photo</h2>
        <p className="hint">
          Fill the frame with the yellow disc. Square to the tag works better
          than from the side.
        </p>
        <div className="eid-actions">
          <button
            type="button"
            className="btn primary"
            disabled={Boolean(photoBusy)}
            onClick={() => cameraRef.current?.click()}
          >
            Take photo
          </button>
          <button
            type="button"
            className="btn secondary"
            disabled={Boolean(photoBusy)}
            onClick={() => fileRef.current?.click()}
          >
            Choose photo
          </button>
        </div>
        <input
          ref={cameraRef}
          className="sr-only"
          type="file"
          accept="image/*"
          capture="environment"
          onChange={(event) => void onPhoto(event.target.files?.[0])}
        />
        <input
          ref={fileRef}
          className="sr-only"
          type="file"
          accept="image/*"
          onChange={(event) => void onPhoto(event.target.files?.[0])}
        />
        {photoBusy ? <p className="hint">{photoBusy}</p> : null}
        {photoError ? <p className="field-error">{photoError}</p> : null}
        {preview ? (
          <img className="eid-preview" src={preview} alt="Tag photo" />
        ) : null}
      </section>

      <section className="eid-panel">
        <h2>Wand</h2>
        <p className="hint">
          On the XRS2i: Bluetooth → Slave, profile <strong>HID</strong> (or HID
          Smart). Pair it in Android like a keyboard, open this page, then scan.
        </p>
        <Field label="Wand number">
          <input
            ref={hidRef}
            className="eid-hid"
            inputMode="numeric"
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
            placeholder="Waiting for wand…"
            onFocus={() => hidRef.current?.select()}
            onChange={(event) => hid.current.replace(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                hid.current.pushKey('Enter');
              }
            }}
          />
        </Field>
        <p className="hint">{wandStatus}</p>
        {bluetoothAvailable() ? (
          <button
            type="button"
            className="btn secondary"
            disabled={wandBusy}
            onClick={() => void onBle()}
          >
            {wandBusy ? 'Connecting…' : 'Connect wand over Bluetooth'}
          </button>
        ) : (
          <p className="hint">
            This screen uses the wand as a keyboard. BLE connect needs Chrome
            on Android if HID pairing is not available.
          </p>
        )}
      </section>

      {eid ? (
        <section className="eid-result" aria-live="polite">
          <p className="due-kicker">Electronic ID</p>
          <p className="eid-digits">{formatEidGroups(eid)}</p>
          {match === undefined ? (
            <p className="hint">Looking in this ranch’s herd…</p>
          ) : match ? (
            <p>
              Already on <strong>{match.herdId}</strong>
              {match.animalType ? ` · ${match.animalType}` : ''}.
            </p>
          ) : (
            <p>No animal in this book has that EID yet.</p>
          )}
          <div className="eid-actions">
            <button type="button" className="btn primary" onClick={useEid}>
              {returnTo
                ? 'Use on this animal'
                : match
                  ? `Open ${match.herdId}`
                  : 'Save on a new animal'}
            </button>
            <button
              type="button"
              className="btn ghost"
              onClick={() => {
                void navigator.clipboard.writeText(eid).then(
                  () => toast('Copied the EID.'),
                  () => toast('Could not copy.'),
                );
              }}
            >
              Copy
            </button>
          </div>
        </section>
      ) : null}

      <p style={{ marginTop: '1.25rem' }}>
        <Link to={returnTo.startsWith('/') ? returnTo : '/herd'}>Back</Link>
      </p>
    </div>
  );
}
