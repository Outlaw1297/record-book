import type { Animal, AnimalStatus } from '../db/schema';
import { EidCapture } from '../eid/EidCapture';
import {
  BODY_CONDITION_CHOICES,
  CHUTE_SCORE_CHOICES,
} from '../lib/choices';
import { COW_SENSE_STATUS, COW_SENSE_TYPE, cowSenseSex, cowSenseStatus } from '../interop/fields';
import { Field } from './Field';
import { SuggestSelect } from './SuggestSelect';

export const ANIMAL_FIELD_TABS = [
  { id: 'identity', label: 'Identity' },
  { id: 'traits', label: 'Traits' },
  { id: 'performance', label: 'Performance' },
  { id: 'notes', label: 'Notes' },
] as const;

export type AnimalFieldTab = (typeof ANIMAL_FIELD_TABS)[number]['id'];

export type AnimalChoiceOptions = {
  location: string[];
  group: string[];
  color: string[];
  breed: string[];
  tagColor: string[];
  tattooLoc: string[];
};

export function AnimalRecordFields({
  animal,
  patch,
  tab,
  error,
  herdIds,
  options,
  excludeAnimalId,
  listId = 'herd-ids',
  includeDatalist = true,
  requireHerdId = true,
}: {
  animal: Animal;
  patch: (partial: Partial<Animal>) => void;
  tab: AnimalFieldTab;
  error?: string;
  herdIds: string[];
  options: AnimalChoiceOptions;
  excludeAnimalId?: string;
  listId?: string;
  includeDatalist?: boolean;
  requireHerdId?: boolean;
}) {
  const sexWord = cowSenseSex(animal.sex, animal.animalType) || '';

  if (tab === 'identity') {
    return (
      <>
        <Field label="Visual ID" error={error && !animal.herdId.trim() ? error : undefined}>
          <input
            value={animal.herdId}
            onChange={(e) => patch({ herdId: e.target.value })}
            autoCapitalize="characters"
            autoCorrect="off"
            spellCheck={false}
            required={requireHerdId}
          />
        </Field>
        <div className="form-row">
          <Field label="Sex">
            <select
              value={sexWord}
              onChange={(e) => {
                const value = e.target.value;
                const next: Partial<Animal> = {
                  sex: value === 'Cow' || value === 'Heifer' ? 'F' : value ? 'M' : '',
                };
                if (value === 'Cow' && !animal.animalType) next.animalType = 'Cow';
                if (value === 'Steer') next.animalType = animal.animalType || 'Steer';
                patch(next);
              }}
            >
              <option value="">Select</option>
              <option value="Heifer">Heifer</option>
              <option value="Cow">Cow</option>
              <option value="Bull">Bull</option>
              <option value="Steer">Steer</option>
            </select>
          </Field>
          <Field label="Type">
            <select
              value={animal.animalType || ''}
              onChange={(e) => patch({ animalType: e.target.value })}
            >
              <option value="">Select</option>
              {animal.animalType &&
              !(COW_SENSE_TYPE as readonly string[]).includes(animal.animalType) ? (
                <option value={animal.animalType}>{animal.animalType}</option>
              ) : null}
              {COW_SENSE_TYPE.map((type) => (
                <option key={type} value={type}>
                  {type}
                </option>
              ))}
            </select>
          </Field>
        </div>
        <Field label="Status">
          <select
            value={cowSenseStatus(animal.status)}
            onChange={(e) => {
              const value = e.target.value as (typeof COW_SENSE_STATUS)[number];
              const map: Record<string, AnimalStatus> = {
                Active: 'active',
                Sold: 'sold',
                Dead: 'dead',
                Culled: 'culled',
                Disposed: 'culled',
                Reference: 'reference',
                Open: 'open',
              };
              patch({ status: map[value] || 'active' });
            }}
          >
            {COW_SENSE_STATUS.map((status) => (
              <option key={status} value={status}>
                {status}
              </option>
            ))}
          </select>
        </Field>
        <div className="form-row">
          <Field label="Birth date">
            <input
              type="date"
              value={animal.birthDate || ''}
              onChange={(e) =>
                patch({
                  birthDate: e.target.value || undefined,
                  yearBorn: e.target.value
                    ? Number(e.target.value.slice(0, 4))
                    : animal.yearBorn,
                })
              }
            />
          </Field>
          <Field label="Birth year">
            <input
              type="number"
              inputMode="numeric"
              value={animal.yearBorn ?? ''}
              onChange={(e) =>
                patch({ yearBorn: e.target.value ? Number(e.target.value) : undefined })
              }
            />
          </Field>
        </div>
        <div className="form-row">
          <SuggestSelect
            label="Location"
            value={animal.location || ''}
            onChange={(value) => patch({ location: value || undefined })}
            options={options.location}
          />
          <SuggestSelect
            label="Group"
            value={animal.groupName || ''}
            onChange={(value) => patch({ groupName: value || undefined })}
            options={options.group}
          />
        </div>
        <div className="field">
          <span className="field-label">Electronic ID</span>
          <EidCapture
            variant="fill"
            value={animal.electronicId || ''}
            onChange={(eid) => patch({ electronicId: eid.trim() || undefined })}
            excludeAnimalId={excludeAnimalId ?? animal.id}
          />
        </div>
        <div className="form-row">
          <Field label="Sire">
            <input
              value={animal.sireId || ''}
              onChange={(e) => patch({ sireId: e.target.value || undefined })}
              list={listId}
              autoCapitalize="characters"
            />
          </Field>
          <Field label="Dam">
            <input
              value={animal.damId || ''}
              onChange={(e) => patch({ damId: e.target.value || undefined })}
              list={listId}
              autoCapitalize="characters"
            />
          </Field>
        </div>
        {includeDatalist ? (
          <datalist id={listId}>
            {herdIds.map((id) => (
              <option key={id} value={id} />
            ))}
          </datalist>
        ) : null}
        <Field label="Name">
          <input
            value={animal.name || ''}
            onChange={(e) => patch({ name: e.target.value || undefined })}
          />
        </Field>
        <div className="form-row">
          <Field label="Registration - Primary">
            <input
              value={animal.registration || ''}
              onChange={(e) => patch({ registration: e.target.value || undefined })}
            />
          </Field>
          <Field label="Tattoo 1">
            <input
              value={animal.tattoo || ''}
              onChange={(e) => patch({ tattoo: e.target.value || undefined })}
            />
          </Field>
        </div>
        <div className="form-row">
          <SuggestSelect
            label="Tattoo 1 Loc"
            value={animal.tattooLoc || ''}
            onChange={(value) => patch({ tattooLoc: value || undefined })}
            options={options.tattooLoc}
            autoCapitalize="characters"
          />
          <Field label="Brand">
            <input
              value={animal.brand || ''}
              onChange={(e) => patch({ brand: e.target.value || undefined })}
            />
          </Field>
        </div>
      </>
    );
  }

  if (tab === 'traits') {
    return (
      <>
        <div className="form-row">
          <SuggestSelect
            label="Color"
            value={animal.color || ''}
            onChange={(value) => patch({ color: value || undefined })}
            options={options.color}
          />
          <SuggestSelect
            label="Breed 1"
            value={animal.breed || ''}
            onChange={(value) => patch({ breed: value || undefined })}
            options={options.breed}
          />
        </div>
        <div className="form-row">
          <Field label="Horn Code">
            <select
              value={animal.horned || ''}
              onChange={(e) => patch({ horned: e.target.value || undefined })}
            >
              <option value="">Select</option>
              <option value="Horned">Horned</option>
              <option value="Polled">Polled</option>
              <option value="Scurred">Scurred</option>
            </select>
          </Field>
          <Field label="Twin Code">
            <select
              value={animal.birthType || ''}
              onChange={(e) => patch({ birthType: e.target.value || undefined })}
            >
              <option value="">Select</option>
              <option value="Single">Single</option>
              <option value="Twin to heifer calf">Twin to heifer calf</option>
              <option value="Twin to a bull calf">Twin to a bull calf</option>
              <option value="Multiple Birth">Multiple Birth</option>
            </select>
          </Field>
        </div>
        <Field label="Calving Ease">
          <select
            value={animal.calvingEase || ''}
            onChange={(e) => patch({ calvingEase: e.target.value || undefined })}
          >
            <option value="">Select</option>
            <option value="No difficulty - no assistance">No difficulty - no assistance</option>
            <option value="Minor difficulty - some assistance">
              Minor difficulty - some assistance
            </option>
            <option value="Major difficulty - mechanical assistance">
              Major difficulty - mechanical assistance
            </option>
            <option value="Cesarean section or other surgery">
              Cesarean section or other surgery
            </option>
            <option value="Abnormal presentation">Abnormal presentation</option>
          </select>
        </Field>
        <Field label="Service Type">
          <select
            value={animal.serviceType || ''}
            onChange={(e) => patch({ serviceType: e.target.value || undefined })}
          >
            <option value="">Select</option>
            <option value="Natural">Natural</option>
            <option value="AI">AI</option>
            <option value="ET">ET</option>
          </select>
        </Field>
        <div className="form-row">
          <SuggestSelect
            label="Chute Score"
            value={animal.disposition || ''}
            onChange={(value) => patch({ disposition: value || undefined })}
            options={CHUTE_SCORE_CHOICES}
            allowOther={false}
          />
          <SuggestSelect
            label="Body Condition"
            value={animal.bodyCondition || ''}
            onChange={(value) => patch({ bodyCondition: value || undefined })}
            options={BODY_CONDITION_CHOICES}
            allowOther={false}
          />
        </div>
        <Field label="Identity comment / phenotype">
          <input
            value={animal.phenotype || ''}
            onChange={(e) => patch({ phenotype: e.target.value || undefined })}
          />
        </Field>
        <SuggestSelect
          label="Tag color"
          value={animal.tagColor || ''}
          onChange={(value) => patch({ tagColor: value || undefined })}
          options={options.tagColor}
        />
      </>
    );
  }

  if (tab === 'performance') {
    return (
      <>
        <Field label="Birth weight">
          <input
            value={animal.birthWeight || ''}
            onChange={(e) => patch({ birthWeight: e.target.value || undefined })}
            inputMode="decimal"
          />
        </Field>
        <div className="form-row">
          <Field label="Weaning weight">
            <input
              value={animal.weaningWeight || ''}
              onChange={(e) => patch({ weaningWeight: e.target.value || undefined })}
              inputMode="decimal"
            />
          </Field>
          <Field label="Weaning date">
            <input
              type="date"
              value={animal.weaningDate || ''}
              onChange={(e) => patch({ weaningDate: e.target.value || undefined })}
            />
          </Field>
        </div>
        <div className="form-row">
          <Field label="Yearling weight">
            <input
              value={animal.yearlingWeight || ''}
              onChange={(e) => patch({ yearlingWeight: e.target.value || undefined })}
              inputMode="decimal"
            />
          </Field>
          <Field label="Yearling date">
            <input
              type="date"
              value={animal.yearlingDate || ''}
              onChange={(e) => patch({ yearlingDate: e.target.value || undefined })}
            />
          </Field>
        </div>
      </>
    );
  }

  return (
    <Field label="Notes">
      <textarea
        value={animal.notes || ''}
        onChange={(e) => patch({ notes: e.target.value || undefined })}
      />
    </Field>
  );
}
