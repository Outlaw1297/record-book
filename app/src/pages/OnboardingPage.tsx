import { useState, type FormEvent } from 'react';
import { db, ensureSettings } from '../db/schema';
import { defaultDeviceName } from '../sync/identity';
import { Field, Segmented } from '../ui/Field';

const STEPS = 3;

export function OnboardingPage({ onDone }: { onDone: () => void }) {
  const [step, setStep] = useState(0);
  const [ranchName, setRanchName] = useState('');
  const [operatorName, setOperatorName] = useState('');
  const [currentYear, setCurrentYear] = useState(new Date().getFullYear());
  const [role, setRole] = useState<'phone' | 'desk'>('phone');
  const [error, setError] = useState('');

  async function finish(e: FormEvent) {
    e.preventDefault();
    if (!ranchName.trim()) {
      setError('Ranch name is required.');
      return;
    }
    const settings = await ensureSettings();
    await db.settings.put({
      ...settings,
      ranchName: ranchName.trim(),
      operatorName: operatorName.trim(),
      currentYear,
      deviceKind: role,
      deviceName: defaultDeviceName(role, operatorName),
      onboardingComplete: true,
      updatedAt: new Date().toISOString(),
    });
    onDone();
  }

  return (
    <div className="onboard">
      <div className="onboard-card">
        <div className="progress-dots" aria-hidden="true">
          {Array.from({ length: STEPS }, (_, index) => (
            <span key={index} className={index <= step ? 'on' : undefined} />
          ))}
        </div>

        {step === 0 && (
          <>
            <h1 className="page-header" style={{ fontFamily: 'var(--font-display)' }}>
              Record Book
            </h1>
            <p className="lede">
              Log calves in the pasture with big, simple fields. This phone keeps
              YOUR ranch’s book. Other ranches who install Record Book keep
              theirs separately.
            </p>
            <div className="sticky-actions" style={{ gridTemplateColumns: '1fr' }}>
              <button type="button" className="btn primary" onClick={() => setStep(1)}>
                Get started
              </button>
            </div>
          </>
        )}

        {step === 1 && (
          <form
            className="form"
            onSubmit={(e) => {
              e.preventDefault();
              if (!ranchName.trim()) {
                setError('Ranch name is required.');
                return;
              }
              setError('');
              setStep(2);
            }}
          >
            <h1 className="page-header" style={{ fontFamily: 'var(--font-display)' }}>
              Your ranch
            </h1>
            <Field label="Ranch name" error={error}>
              <input
                value={ranchName}
                onChange={(e) => setRanchName(e.target.value)}
                placeholder="Spring Creek"
                autoComplete="organization"
                autoFocus
              />
            </Field>
            <Field label="Your name">
              <input
                value={operatorName}
                onChange={(e) => setOperatorName(e.target.value)}
                placeholder="Alex"
                autoComplete="name"
              />
            </Field>
            <Field label="Working year">
              <input
                type="number"
                inputMode="numeric"
                value={currentYear}
                onChange={(e) => setCurrentYear(Number(e.target.value))}
              />
            </Field>
            <div className="sticky-actions">
              <button type="button" className="btn ghost" onClick={() => setStep(0)}>
                Back
              </button>
              <button type="submit" className="btn primary">
                Continue
              </button>
            </div>
          </form>
        )}

        {step === 2 && (
          <form className="form" onSubmit={finish}>
            <h1 className="page-header" style={{ fontFamily: 'var(--font-display)' }}>
              How you will use it
            </h1>
            <p className="lede">
              Phone is for gloves and one-handed calf entry. To share this
              ranch’s herd, sign in to YOUR Google Drive or Dropbox, or run
              YOUR own Docker server. Do not use another ranch’s account or
              NAS.
            </p>
            <Segmented
              ariaLabel="Device"
              value={role}
              onChange={setRole}
              options={[
                { value: 'phone', label: 'In the field' },
                { value: 'desk', label: 'Office desk' },
              ]}
            />
            <div className="sticky-actions">
              <button type="button" className="btn ghost" onClick={() => setStep(1)}>
                Back
              </button>
              <button type="submit" className="btn primary">
                Open record book
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
