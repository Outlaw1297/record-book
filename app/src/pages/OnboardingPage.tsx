import { useState, type FormEvent } from 'react';
import { db, ensureSettings, queueChange } from '../db/schema';
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
    const next = {
      ...settings,
      ranchName: ranchName.trim(),
      operatorName: operatorName.trim(),
      currentYear,
      onboardingComplete: true,
      updatedAt: new Date().toISOString(),
    };
    await db.settings.put(next);
    await queueChange('settings', '1', 'upsert', next);
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
              Log calves in the pasture with big, simple fields. Everything stays
              on this device until you have signal.
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
                placeholder="Flying J"
                autoComplete="organization"
                autoFocus
              />
            </Field>
            <Field label="Your name">
              <input
                value={operatorName}
                onChange={(e) => setOperatorName(e.target.value)}
                placeholder="Dalton"
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
              Same herd either way. Phone is tuned for gloves and one-handed
              calf entry.
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
