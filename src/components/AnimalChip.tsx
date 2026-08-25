import { TAG_COLORS, type Animal, type AnimalStatus } from '../types.ts'
import { animalShortLabel } from '../lib/ids.ts'
import { navigate } from '../lib/routes.ts'
import { statusLabel } from '../lib/status.ts'

export function AnimalChip({
  animal,
  circled,
  markedX,
  toAnimal = true,
}: {
  animal: Animal
  circled?: boolean
  markedX?: boolean
  toAnimal?: boolean
}) {
  const color = animal.tagColor ? TAG_COLORS[animal.tagColor] : undefined
  const className = `chip${circled ? ' circled' : ''}`
  const body = (
    <>
      {markedX ? <span className="xmark">×</span> : null}
      <span
        className="swatch"
        style={{ background: color?.hex ?? '#cfc3a3' }}
        title={color?.label ?? 'No tag color'}
      />
      <span>
        {animal.breed ? `${animal.breed} ` : ''}
        {animalShortLabel(animal)}
        {animal.name && animal.name.toLowerCase() !== animal.number.toLowerCase()
          ? ` ${animal.name}`
          : ''}
      </span>
    </>
  )

  if (!toAnimal) return <span className={className}>{body}</span>

  return (
    <a
      className={className}
      href={`#/herd/${encodeURIComponent(animal.id)}`}
      onClick={(event) => {
        event.preventDefault()
        navigate({ page: 'animal', animalId: animal.id })
      }}
    >
      {body}
    </a>
  )
}

export function StatusBadge({ status }: { status: AnimalStatus }) {
  return <span className={`badge ${status}`}>{statusLabel(status)}</span>
}
