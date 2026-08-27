import { existsSync, readFileSync, statSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { exportCowSenseAnimalsCsv } from './export';
import { cowSenseSex, sexFromCowSense, statusFromCowSense } from './fields';
import { mapCowSenseJetTables } from './jet';
import { parseCowSenseBytes, parseCowSenseText } from './parse';

const SAMPLE = `Visual ID,Sex,Type,Status,Birth Date,Location,Sire,Dam,Color,Breed 1,Birth Weight,EID,Notes
67Y,Heifer,Calf,Active,3/12/2025,North,Houdini,Helen,Black,Hereford,78,840003001,poll
Helen,Cow,Cow,Active,4/2/2018,North,Legend,90BK,Red,Hereford,,,donor
Houdini,Bull,Herd Sire,Active,2/10/2017,Bull pen,,,,Hereford,,
Steer1,Steer,Steer,Sold,1/8/2024,Yard,,,,,`;

const LOCAL_COPY = '/tmp/cowsense-readonly-copy/Nygaaard.csh';

describe('Cow Sense value maps', () => {
  it('maps Cow Sense sex words, not H/B letters only', () => {
    expect(sexFromCowSense('Heifer')).toBe('F');
    expect(sexFromCowSense('Cow')).toBe('F');
    expect(sexFromCowSense('Bull')).toBe('M');
    expect(sexFromCowSense('Steer')).toBe('M');
    expect(sexFromCowSense('H')).toBe('F');
    expect(cowSenseSex('F', 'Cow')).toBe('Cow');
    expect(cowSenseSex('F', 'Calf')).toBe('Heifer');
    expect(cowSenseSex('F', 'Breeding Cow')).toBe('Cow');
    expect(cowSenseSex('M', 'Steer')).toBe('Steer');
    expect(cowSenseSex('M', 'Breeding Bull')).toBe('Bull');
  });

  it('maps Active/Disposed plus disposal type from this ranch’s herd file', () => {
    expect(statusFromCowSense('Active')).toBe('active');
    expect(statusFromCowSense('Sold')).toBe('sold');
    expect(statusFromCowSense('Dead')).toBe('dead');
    expect(statusFromCowSense('Culled')).toBe('culled');
    expect(statusFromCowSense('Disposed', 'Marketing')).toBe('sold');
    expect(statusFromCowSense('Disposed', 'Culling')).toBe('culled');
    expect(statusFromCowSense('Disposed', 'Death loss')).toBe('dead');
    expect(statusFromCowSense('Reference')).toBe('reference');
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
    expect(csv).toContain('Visual ID,Electronic ID,Name,Sex,Type,Status,Disposal Type');
    expect(csv).toContain('67Y,840003001,,Heifer,Calf,Active,,2025-03-12');
    expect(csv).toContain('Helen,,,Cow,Cow,Active');
    expect(csv).toContain('Steer1,,,Steer,Steer,Disposed,Marketing');
    const again = parseCowSenseText(csv);
    expect(again.animals).toHaveLength(4);
    expect(again.animals.find((row) => row.herdId === '67Y')?.damId).toBe('Helen');
    expect(again.animals.find((row) => row.herdId === 'Steer1')?.status).toBe('sold');
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
    expect(binary.warnings[0]).toMatch(/Manage/i);
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

describe('Cow Sense Jet tables', () => {
  it('joins Identity, Traits, Measures, and treatments by GUID without touching Dropbox', () => {
    const parsed = mapCowSenseJetTables({
      Animal_Identity: [
        {
          GUID: 'G-COW',
          VisualTag: '1248Y',
          Name: '',
          Sex: 'Cow',
          Type: 'Breeding Cow',
          Status: 'Active',
          BirthDate: '04/17/12 00:00:00',
          EID: '982000469654470',
          LinkSire: 'G-SIRE',
          LinkDam: 'G-DAM',
          Comment: '55 BWF',
        },
        {
          GUID: 'G-SIRE',
          VisualTag: 'OC',
          Name: 'OLD COW MISC',
          Sex: 'Bull',
          Type: 'Multi Sire',
          Status: 'Active',
        },
        {
          GUID: 'G-DAM',
          VisualTag: '0846Y',
          Name: '0846Y',
          Sex: 'Cow',
          Type: 'Breeding Cow',
          Status: 'Disposed',
          DisposalType: 'Culling',
          BirthDate: '04/10/08 00:00:00',
        },
        {
          GUID: 'G-OLD',
          VisualTag: '1248Y',
          Sex: 'Heifer',
          Type: 'Weaned Calf',
          Status: 'Disposed',
          DisposalType: 'Marketing',
          BirthDate: '03/08/86 00:00:00',
        },
      ],
      Anim_Traits: [
        {
          LinkIdentity: 'G-COW',
          ColorCode: 'BWF',
          Brd1: 'ANGUS X HEREFORD',
          HornCode: 'P',
          TwinCode: 'Single',
          CalvingEase: '1',
        },
      ],
      Anim_Measures: [
        {
          LinkIdentity: 'G-COW',
          SourceField: 'Birth Weight',
          MeasureValue: '72',
          MeasureDate: '04/17/12 00:00:00',
        },
        {
          LinkIdentity: 'G-COW',
          SourceField: 'Current Wt',
          MeasureValue: '1570',
          MeasureDate: '10/27/25 00:00:00',
        },
      ],
      Anim_Breeding: [
        {
          BreedingGUID: 'B1',
          LinkIdentity: 'G-COW',
          LinkSire: 'G-SIRE',
          BreedingType: 'Natural',
          BreedingDate: '06/01/13 00:00:00',
        },
      ],
      Anim_Notes: [{ LinkIdentity: 'G-COW', NoteDate: '10/27/25 00:00:00', NoteText: 'pulled' }],
      Treat_Header: [
        {
          TreatGUID: 'T1',
          TreatTag: 'Pre-Calving',
          TreatDate: '03/01/26 00:00:00',
          TreatNote: '',
        },
      ],
      Treat_Detail: [
        {
          Index: '33',
          LinkTreatHeader: 'T1',
          ItemID: 'MultiMin',
          ItemDosage: '5',
          ItemRoute: 'SC',
          ItemLocation: 'LN',
          DetailNote: 'Lori gave',
        },
      ],
      Treat_Index: [{ LinkIdentity: 'G-COW', LinkTreatHeader: 'T1', EntryType: 'Ind' }],
    });
    const cow = parsed.animals.find((row) => row.herdId === '1248Y');
    expect(cow?.animalType).toBe('Breeding Cow');
    expect(cow?.status).toBe('active');
    expect(cow?.sireId).toBe('OC');
    expect(cow?.damId).toBe('0846Y');
    expect(cow?.color).toBe('BWF');
    expect(cow?.breed).toBe('ANGUS X HEREFORD');
    expect(cow?.birthWeight).toBe('72');
    expect(cow?.birthDate).toBe('2012-04-17');
    expect(cow?.notes).toMatch(/pulled/);
    expect(parsed.animals.find((row) => row.herdId === '0846Y')?.status).toBe('culled');
    expect(parsed.animals.some((row) => row.herdId !== '1248Y' && row.herdId.startsWith('1248Y'))).toBe(
      true,
    );
    expect(parsed.breeding).toHaveLength(1);
    expect(parsed.breeding[0]?.kind).toBe('pasture');
    expect(parsed.treatments[0]?.product).toBe('MultiMin');
    expect(parsed.treatments[0]?.dose).toBe('5');
    expect(parsed.cowCalf.find((row) => row.calfId === '1248Y')?.cowId).toBe('0846Y');
  });
});

describe('local read-only Nygaaard.csh copy', () => {
  it.skipIf(!existsSync(LOCAL_COPY))(
    'parses the /tmp copy and never needs the Dropbox original',
    { timeout: 120_000 },
    () => {
      const mode = statSync(LOCAL_COPY).mode;
      expect(mode & 0o222).toBe(0);
      const bytes = new Uint8Array(readFileSync(LOCAL_COPY));
      expect(bytes.byteLength).toBe(168660992);
      const parsed = parseCowSenseBytes(bytes, 'Nygaaard.csh');
      expect(parsed.format).toBe('access');
      expect(parsed.animals.length).toBe(9802);
      expect(parsed.animals.filter((row) => row.status === 'active').length).toBeGreaterThanOrEqual(930);
      const cow = parsed.animals.find((row) => row.herdId === '1248Y');
      expect(cow?.animalType).toBe('Breeding Cow');
      expect(cow?.electronicId).toBe('982000469654470');
      expect(cow?.sireId).toBe('OC');
      expect(cow?.damId).toBe('0846Y');
      expect(cow?.color).toBe('BWF');
      expect(parsed.treatments.length).toBeGreaterThan(300);
      expect(parsed.breeding.length).toBeGreaterThan(1000);
    },
  );
});
