import { describe, expect, it } from 'vitest';
import {
  breedingKey,
  cowCalfKey,
  mergeIncomingAnimal,
  saleKey,
  treatmentKey,
} from './applyImport';
import { importJobDone, importJobTotal } from './importJob';
import type { Animal, ImportJob } from '../db/schema';

function animal(partial: Partial<Animal> & Pick<Animal, 'id' | 'herdId'>): Animal {
  return {
    sex: '',
    status: 'active',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...partial,
  };
}

describe('Cow Sense import merge', () => {
  it('keeps the live animal id and fills empty fields on merge', () => {
    const existing = animal({
      id: 'live',
      herdId: '67Y',
      name: 'Helen',
      color: 'Red',
    });
    const incoming = animal({
      id: 'from-file',
      herdId: '67Y',
      name: '',
      color: 'Black',
      breed: 'Hereford',
    });
    const merged = mergeIncomingAnimal(incoming, existing, 'merge', '2026-09-04T00:00:00.000Z');
    expect(merged.id).toBe('live');
    expect(merged.herdId).toBe('67Y');
    expect(merged.color).toBe('Black');
    expect(merged.breed).toBe('Hereford');
    expect(merged.name).toBe('Helen');
  });

  it('replaces with a new stamp but reuses the tagged animal id', () => {
    const existing = animal({ id: 'live', herdId: '67Y', name: 'Old' });
    const incoming = animal({ id: 'from-file', herdId: '67Y', name: 'New' });
    const replaced = mergeIncomingAnimal(incoming, existing, 'replace', '2026-09-04T00:00:00.000Z');
    expect(replaced.id).toBe('live');
    expect(replaced.name).toBe('New');
    expect(replaced.updatedAt).toBe('2026-09-04T00:00:00.000Z');
  });

  it('keys calving, breeding, treatments, and sales without scanning the whole table', () => {
    expect(cowCalfKey({ year: 2026, cowId: 'Helen', calfId: '67Y' })).toBe('2026|helen|67y');
    expect(breedingKey({ year: 2026, cowId: 'Helen', kind: 'ai1', serviceDate: '2026-06-01' })).toBe(
      '2026|helen|ai1|2026-06-01',
    );
    expect(treatmentKey({ animalHerdId: '67Y', date: '2026-04-01', product: 'Calf Guard' })).toBe(
      '67y|2026-04-01|calf guard',
    );
    expect(saleKey({ year: 2026, calfId: '67Y' })).toBe('2026|67y');
  });
});

describe('import job cursor', () => {
  it('counts rows already saved so a closed tab can resume mid-table', () => {
    const job: ImportJob = {
      id: 'active',
      fileName: 'Nygaaard.csh',
      fileSize: 1,
      mode: 'merge',
      phase: 'applying',
      applyTable: 'treatments',
      applyIndex: 250,
      replaceCleared: true,
      counts: {
        animals: 9802,
        cowCalf: 4000,
        breeding: 1000,
        treatments: 8000,
        sales: 100,
      },
      createdAt: '2026-09-01T00:00:00.000Z',
      updatedAt: '2026-09-01T00:00:00.000Z',
    };
    expect(importJobTotal(job)).toBe(22902);
    expect(importJobDone(job)).toBe(9802 + 4000 + 1000 + 250);
  });
});
