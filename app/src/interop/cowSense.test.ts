import { describe, expect, it } from 'vitest';
import { exportCowSenseAnimalsCsv } from './export';
import { cowSenseSex, sexFromCowSense, statusFromCowSense } from './fields';
import { parseCowSenseBytes, parseCowSenseText } from './parse';

const SAMPLE = `Visual ID,Sex,Type,Status,Birth Date,Location,Sire,Dam,Color,Breed 1,Birth Weight,EID,Notes
67Y,Heifer,Calf,Active,3/12/2025,North,Houdini,Helen,Black,Hereford,78,840003001,poll
Helen,Cow,Cow,Active,4/2/2018,North,Legend,90BK,Red,Hereford,,,donor
Houdini,Bull,Herd Sire,Active,2/10/2017,Bull pen,,,,Hereford,,
Steer1,Steer,Steer,Sold,1/8/2024,Yard,,,,,`;

describe('Cow Sense value maps', () => {
  it('maps Cow Sense sex words, not H/B letters only', () => {
    expect(sexFromCowSense('Heifer')).toBe('F');
    expect(sexFromCowSense('Cow')).toBe('F');
    expect(sexFromCowSense('Bull')).toBe('M');
    expect(sexFromCowSense('Steer')).toBe('M');
    expect(sexFromCowSense('H')).toBe('F');
    expect(cowSenseSex('F', 'Cow')).toBe('Cow');
    expect(cowSenseSex('F', 'Calf')).toBe('Heifer');
    expect(cowSenseSex('M', 'Steer')).toBe('Steer');
  });

  it('maps status words Cow Sense Import Tool expects', () => {
    expect(statusFromCowSense('Active')).toBe('active');
    expect(statusFromCowSense('Sold')).toBe('sold');
    expect(statusFromCowSense('Dead')).toBe('dead');
    expect(statusFromCowSense('Culled')).toBe('culled');
  });
});

describe('parseCowSenseText', () => {
  it('imports a Cow Sense animal list and builds calf rows from dam + birth date', () => {
    const parsed = parseCowSenseText(SAMPLE);
    expect(parsed.animals.map((row) => row.herdId)).toEqual([
      '67Y',
      'Helen',
      'Houdini',
      'Steer1',
    ]);
    const calf = parsed.animals.find((row) => row.herdId === '67Y');
    expect(calf?.sex).toBe('F');
    expect(calf?.animalType).toBe('Calf');
    expect(calf?.birthDate).toBe('2025-03-12');
    expect(calf?.damId).toBe('Helen');
    expect(calf?.sireId).toBe('Houdini');
    expect(calf?.electronicId).toBe('840003001');
    expect(calf?.location).toBe('North');
    expect(parsed.cowCalf).toHaveLength(2);
    expect(parsed.cowCalf.map((row) => row.calfId).sort()).toEqual(['67Y', 'Helen']);
    expect(parsed.cowCalf.find((row) => row.calfId === '67Y')?.cowId).toBe('Helen');
    expect(parsed.animals.find((row) => row.herdId === 'Steer1')?.status).toBe('sold');
  });

  it('round-trips Sex Type Status as Cow Sense words', () => {
    const parsed = parseCowSenseText(SAMPLE);
    const csv = exportCowSenseAnimalsCsv(parsed.animals);
    expect(csv).toContain('Visual ID,Electronic ID,Name,Sex,Type,Status');
    expect(csv).toContain('67Y,840003001,,Heifer,Calf,Active,2025-03-12');
    expect(csv).toContain('Helen,,,Cow,Cow,Active');
    expect(csv).toContain('Steer1,,,Steer,Steer,Sold');
    const again = parseCowSenseText(csv);
    expect(again.animals).toHaveLength(4);
    expect(again.animals.find((row) => row.herdId === '67Y')?.damId).toBe('Helen');
  });

  it('imports treatments and breeding sheets from headers', () => {
    const treatments = parseCowSenseText(
      `Visual ID,Date,Product,Dose,Route\n67Y,2025-04-01,Calf Guard,2cc,SQ`,
    );
    expect(treatments.treatments).toHaveLength(1);
    expect(treatments.treatments[0]?.product).toBe('Calf Guard');
    const breeding = parseCowSenseText(
      `Cow,Sire,Service Date,Service Type\nHelen,Houdini,6/1/2025,AI`,
    );
    expect(breeding.breeding).toHaveLength(1);
    expect(breeding.breeding[0]?.kind).toBe('ai1');
    expect(breeding.breeding[0]?.serviceDate).toBe('2025-06-01');
  });
});

describe('parseCowSenseBytes', () => {
  it('reads UTF-8 CSV bytes and reports binary .csh magic when it is not a spreadsheet', () => {
    const csv = parseCowSenseBytes(new TextEncoder().encode(SAMPLE), 'Nygaaard.csv');
    expect(csv.animals).toHaveLength(4);
    const binary = parseCowSenseBytes(new Uint8Array([0x00, 0x01, 0x02, 0x03, 0xc0, 0xde]), 'Nygaaard.csh');
    expect(binary.animals).toHaveLength(0);
    expect(binary.warnings[0]).toMatch(/Manage > List/i);
    expect(binary.magic).toContain('00 01 02 03');
  });

  it('detects SQLite herd files', () => {
    const header = 'SQLite format 3\0';
    const bytes = new Uint8Array(32);
    bytes.set(new TextEncoder().encode(header));
    const parsed = parseCowSenseBytes(bytes, 'Nygaaard.csh');
    expect(parsed.format).toBe('sqlite');
    expect(parsed.warnings[0]).toMatch(/SQLite/i);
  });
});
