import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  GESTATION_DAYS,
  dueDateFromService,
  formatDisplayDate,
} from '../lib/gestation';
import { Field } from '../ui/Field';

export function GestationPage() {
  const [serviceDate, setServiceDate] = useState('');
  const dueDate = useMemo(
    () => (serviceDate ? dueDateFromService(serviceDate) : null),
    [serviceDate],
  );

  return (
    <div className="page">
      <header className="page-header">
        <h1>Due dates</h1>
        <p className="lede">
          Printed gestation table: service plus {GESTATION_DAYS} days.
        </p>
      </header>

      <form className="form" onSubmit={(e) => e.preventDefault()} style={{ marginTop: '1rem' }}>
        <Field label="Date of service">
          <input
            type="date"
            value={serviceDate}
            onChange={(e) => setServiceDate(e.target.value)}
          />
        </Field>
      </form>

      {dueDate ? (
        <div className="due-card" role="status">
          <p className="due-kicker">Date due</p>
          <p className="due-date">{formatDisplayDate(dueDate)}</p>
          <p className="hint">
            {formatDisplayDate(serviceDate)} + {GESTATION_DAYS} days
          </p>
        </div>
      ) : (
        <p className="hint" style={{ marginTop: '1rem' }}>
          Pick a service date to see the due date.
        </p>
      )}

      <p className="hint">
        Breeding rows show this too. <Link to="/breeding">Open breeding</Link>
      </p>
    </div>
  );
}
