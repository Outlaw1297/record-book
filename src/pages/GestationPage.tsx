import { useMemo, useState } from 'react'
import { dueDateFromService, formatDisplayDate, shortMonth, GESTATION_DAYS } from '../lib/dates.ts'
import { gestationTable } from '../lib/gestation.ts'

export function GestationPage() {
  const year = 2026
  const [service, setService] = useState('2026-04-02')
  const due = service ? dueDateFromService(service) : ''
  const table = useMemo(() => gestationTable(year, false), [year])

  return (
    <>
      <h2 className="page-title">Gestation table</h2>
      <p className="lede">
        Find date of service in the upper line. Second line is the date due. This book uses a
        fixed {GESTATION_DAYS}-day gestation (the paper table assumes a 28-day February).
      </p>
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="form-grid">
          <label className="field">
            Date of service
            <input type="date" value={service} onChange={(event) => setService(event.target.value)} />
          </label>
          <label className="field">
            Date due
            <input readOnly value={due} />
          </label>
        </div>
        {due && (
          <p className="due">
            {formatDisplayDate(service)} + {GESTATION_DAYS} days = {formatDisplayDate(due)}
          </p>
        )}
      </div>
      {table.map((block) => (
        <div className="gestation-block" key={block.serviceMonth}>
          <h3>
            {shortMonth(block.serviceMonth)} service → {shortMonth(block.dueMonth)} due
          </h3>
          <div className="mini-table">
            {block.days.map((day) => (
              <div key={day.serviceDay}>
                <div className="cell svc">{day.serviceDay}</div>
                <div className="cell due-cell">{day.dueDay}</div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </>
  )
}
