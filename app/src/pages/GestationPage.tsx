import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  GESTATION_DAYS,
  dueDateFromService,
  formatDisplayDate,
} from '../lib/gestation';

export function GestationPage() {
  const [serviceDate, setServiceDate] = useState('');
  const dueDate = useMemo(
    () => (serviceDate ? dueDateFromService(serviceDate) : null),
    [serviceDate],
  );

  return (
    <div className="page narrow">
      <header className="page-header">
        <h1>Gestation table</h1>
        <p className="lede">
          Same lookup as the printed GESTATION TABLE: find the date of service,
          then read the due date. This app uses service plus {GESTATION_DAYS}{' '}
          days.
        </p>
      </header>

      <form className="form" onSubmit={(e) => e.preventDefault()}>
        <label>
          Date of service
          <input
            type="date"
            value={serviceDate}
            onChange={(e) => setServiceDate(e.target.value)}
          />
        </label>
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
        <p className="hint">Pick a service date to see the due date.</p>
      )}

      <p className="hint">
        Breeding rows also show this due date.{' '}
        <Link to="/breeding">Open breeding</Link>
      </p>
    </div>
  );
}
