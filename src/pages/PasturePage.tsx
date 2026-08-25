import { useState } from 'react'
import { AnimalChip } from '../components/AnimalChip.tsx'
import { formatDisplayDate } from '../lib/dates.ts'
import { animalFromToken, animalShortLabel, findAnimal, newId, upsertAnimal } from '../lib/ids.ts'
import { useBook } from '../store.tsx'
import type { ListingKind, PastureExposure, PastureMember, RecordBook } from '../types.ts'

export function PasturePage() {
  const { book, replaceBook, removePasture } = useBook()
  const [editing, setEditing] = useState<PastureExposure | null>(null)

  return (
    <>
      <h2 className="page-title">Pasture Exposure</h2>
      <p className="lede">
        Pasture, bull in/out dates, and the cow (or bull) list. Page 81 is the OLD COWS turnout of
        13 bulls on 7-19-26. Page 83 is the 2+3&apos;s cull list.
      </p>
      <p>
        <button
          className="btn"
          type="button"
          onClick={() =>
            setEditing({
              id: newId('pasture'),
              year: book.year,
              pasture: '',
              listingKind: 'cows',
              members: [],
            })
          }
        >
          Add pasture page
        </button>
      </p>
      {editing && (
        <PastureForm
          key={editing.id}
          record={editing}
          onCancel={() => setEditing(null)}
          onSave={(record) => {
            let animals = book.animals
            for (const member of record.members) {
              animals = upsertAnimal(animals, animalFromToken(member.animalId))
            }
            const saved: PastureExposure = {
              ...record,
              members: record.members.map((member) => ({
                ...member,
                animalId: animalFromToken(member.animalId).id,
              })),
            }
            replaceBook({
              ...book,
              animals,
              pastures: upsertById(book.pastures, saved),
            })
            setEditing(null)
          }}
        />
      )}
      <div className="grid-2">
        {book.pastures.map((pasture) => (
          <article key={pasture.id} className="card">
            <h3>
              {pasture.pasture} {pasture.listingTitle ? `· ${pasture.listingTitle}` : ''}
            </h3>
            <p className="muted">
              p{pasture.page ?? '—'} · {pasture.listingKind}
              {pasture.dateIn ? ` · in ${formatDisplayDate(pasture.dateIn)}` : ''}
              {pasture.dateOut ? ` · out ${formatDisplayDate(pasture.dateOut)}` : ''}
            </p>
            {pasture.bullNote && <p>{pasture.bullNote}</p>}
            <ol>
              {pasture.members.map((member) => {
                const animal = findAnimal(book.animals, member.animalId)
                return (
                  <li key={member.animalId} style={{ marginBottom: 6 }}>
                    {animal ? (
                      <AnimalChip animal={animal} circled={member.circled} />
                    ) : (
                      member.animalId
                    )}
                    {member.epd != null ? ` +${member.epd.toFixed(1)}` : ''}
                    {member.notes ? ` ${member.notes}` : ''}
                  </li>
                )
              })}
            </ol>
            <div className="row-actions">
              <button
                className="btn secondary"
                type="button"
                onClick={() => setEditing(toFormPasture(pasture, book))}
              >
                Edit
              </button>
              <button className="btn danger" type="button" onClick={() => removePasture(pasture.id)}>
                Delete
              </button>
            </div>
          </article>
        ))}
      </div>
    </>
  )
}

function toFormPasture(pasture: PastureExposure, book: RecordBook): PastureExposure {
  return {
    ...pasture,
    members: pasture.members.map((member) => {
      const animal = findAnimal(book.animals, member.animalId)
      return { ...member, animalId: animal ? animalShortLabel(animal) : member.animalId }
    }),
  }
}

function PastureForm({
  record,
  onSave,
  onCancel,
}: {
  record: PastureExposure
  onSave: (record: PastureExposure) => void
  onCancel: () => void
}) {
  const [draft, setDraft] = useState(record)
  const [memberLine, setMemberLine] = useState(
    draft.members.map((member) => formatMemberLine(member)).join('\n'),
  )
  return (
    <form
      className="card"
      onSubmit={(event) => {
        event.preventDefault()
        const members = memberLine
          .split('\n')
          .map((line) => line.trim())
          .filter(Boolean)
          .map(parseMemberLine)
        onSave({ ...draft, members })
      }}
    >
      <div className="form-grid">
        <label className="field">
          Pasture
          <input
            required
            value={draft.pasture}
            onChange={(event) => setDraft({ ...draft, pasture: event.target.value })}
          />
        </label>
        <label className="field">
          Listing title
          <input
            value={draft.listingTitle ?? ''}
            onChange={(event) => setDraft({ ...draft, listingTitle: event.target.value })}
          />
        </label>
        <label className="field">
          Kind
          <select
            value={draft.listingKind}
            onChange={(event) => setDraft({ ...draft, listingKind: event.target.value as ListingKind })}
          >
            <option value="cows">Cows</option>
            <option value="bulls">Bulls</option>
            <option value="culls">Culls</option>
          </select>
        </label>
        <label className="field">
          Date in
          <input
            type="date"
            value={draft.dateIn ?? ''}
            onChange={(event) => setDraft({ ...draft, dateIn: event.target.value || undefined })}
          />
        </label>
        <label className="field">
          Date out
          <input
            type="date"
            value={draft.dateOut ?? ''}
            onChange={(event) => setDraft({ ...draft, dateOut: event.target.value || undefined })}
          />
        </label>
        <label className="field span-2">
          Members (one per line: ID notes +EPD)
          <textarea
            rows={8}
            value={memberLine}
            onChange={(event) => setMemberLine(event.target.value)}
          />
        </label>
      </div>
      <div className="row-actions">
        <button className="btn" type="submit">
          Save pasture
        </button>
        <button className="btn secondary" type="button" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  )
}

const COLOR_WORD =
  /^(yellow|white|green|pink|teal|purple|purp|pur|orange|org|blue|pk|by|[ywg])$/i
const BREED_WORD = /^(BLK|BWF|BBF|RWF|Red|BHFD)$/i

function formatMemberLine(member: PastureMember): string {
  const id = member.circled ? `(${member.animalId})` : member.animalId
  const epd = member.epd != null ? `+${member.epd}` : undefined
  return [id, member.notes, epd].filter(Boolean).join(' ')
}

function parseMemberLine(line: string): PastureMember {
  const circled = line.includes('(')
  const epdMatch = line.match(/\+(\d+(?:\.\d+)?)/)
  const token = line.replace(/[()]/g, '').replace(/\+\d+(?:\.\d+)?/, '').trim()
  const parts = token.split(/\s+/).filter(Boolean)

  let take = 1
  if (parts[0] && BREED_WORD.test(parts[0])) take += 1
  const core = parts[take - 1]
  if (parts[take] && COLOR_WORD.test(parts[take])) {
    take += 1
  } else if (core && /^\d+$/.test(core) && parts[take] && /^[A-Za-z][A-Za-z'-]*$/.test(parts[take])) {
    take += 1
  } else if (parts[0] && /^[A-Za-z]{1,3}$/.test(parts[0]) && !BREED_WORD.test(parts[0])) {
    for (let i = take; i <= parts.length; i++) {
      if (animalFromToken(parts.slice(0, i).join(' ')).tagColor) take = i
    }
  }

  const idToken = parts.slice(0, take).join(' ') || token
  const notes = parts.slice(take).join(' ')
  return {
    animalId: idToken,
    notes: notes || undefined,
    epd: epdMatch ? Number(epdMatch[1]) : undefined,
    circled,
  }
}

function upsertById<T extends { id: string }>(list: T[], record: T): T[] {
  const index = list.findIndex((item) => item.id === record.id)
  if (index === -1) return [...list, record]
  const next = [...list]
  next[index] = record
  return next
}
