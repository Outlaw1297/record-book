import { describe, expect, it } from 'vitest';
import {
  decideWrite,
  mergeRemoteSettings,
  parseJsonl,
  serializeJsonl,
  snapshotSettings,
} from './apply';
import {
  cowCalfNaturalKey,
  defaultDeviceName,
  parseBookConfig,
  pickIdentityWinner,
  upsertRoster,
} from './identity';
import type { AppSettings } from '../db/schema';

const local: AppSettings = {
  id: 1,
  ranchName: 'Home Place',
  operatorName: 'Pat',
  currentYear: 2026,
  syncProvider: 'google-drive',
  lastSyncedAt: '2026-08-01T00:00:00.000Z',
  deviceId: 'device-local',
  deviceName: "Pat's phone",
  deviceKind: 'phone',
  onboardingComplete: true,
  updatedAt: '2026-08-20T12:00:00.000Z',
};

describe('decideWrite', () => {
  it('applies when there is no local row', () => {
    expect(decideWrite(undefined, '2026-08-21T00:00:00.000Z')).toBe('apply');
  });

  it('keeps the newer local row', () => {
    expect(
      decideWrite('2026-08-22T00:00:00.000Z', '2026-08-21T00:00:00.000Z'),
    ).toBe('keep-local');
  });

  it('applies an equal or newer remote row', () => {
    expect(
      decideWrite('2026-08-21T00:00:00.000Z', '2026-08-21T00:00:00.000Z'),
    ).toBe('apply');
    expect(
      decideWrite('2026-08-20T00:00:00.000Z', '2026-08-21T00:00:00.000Z'),
    ).toBe('apply');
  });
});

describe('settings sanitization', () => {
  it('never copies device id, operator, tokens, or provider from the cloud', () => {
    const merged = mergeRemoteSettings(local, {
      ranchName: 'Summer Camp',
      operatorName: 'Kim',
      currentYear: 2027,
      deviceId: 'attacker-device',
      deviceName: "Kim's office",
      syncProvider: 'none',
      lastSyncedAt: '1999-01-01T00:00:00.000Z',
      accessToken: 'secret',
    });
    expect(merged.deviceId).toBe('device-local');
    expect(merged.operatorName).toBe('Pat');
    expect(merged.deviceName).toBe("Pat's phone");
    expect(merged.syncProvider).toBe('google-drive');
    expect(merged.lastSyncedAt).toBe('2026-08-01T00:00:00.000Z');
    expect(merged.ranchName).toBe('Summer Camp');
    expect(merged.currentYear).toBe(2027);
    expect(merged).not.toHaveProperty('accessToken');
  });

  it('omits per-device identity from snapshot settings', () => {
    expect(snapshotSettings(local)).toEqual({
      ranchName: 'Home Place',
      currentYear: 2026,
      updatedAt: '2026-08-20T12:00:00.000Z',
    });
  });
});

describe('jsonl', () => {
  it('round-trips change lines and skips junk', () => {
    const text = serializeJsonl([
      {
        v: 1,
        deviceId: 'phone',
        deviceName: "Pat's phone",
        operatorName: 'Pat',
        entity: 'cowCalf',
        entityId: 'abc',
        op: 'upsert',
        updatedAt: '2026-08-21T00:00:00.000Z',
        payload: { id: 'abc' },
      },
    ]);
    const parsed = parseJsonl(`${text}\nnot-json\n{"v":2}\n`);
    expect(parsed).toHaveLength(1);
    expect(parsed[0]?.entityId).toBe('abc');
    expect(parsed[0]?.operatorName).toBe('Pat');
  });
});

describe('shared-book identity', () => {
  it('treats the same cow/calf logged on two devices as one row', () => {
    expect(
      cowCalfNaturalKey({
        year: 2026,
        cowId: 'Helen',
        calfId: '67Y',
      }),
    ).toBe(
      cowCalfNaturalKey({
        year: 2026,
        cowId: 'helen',
        calfId: '67y',
      }),
    );
  });

  it('picks a stable winner when two devices create the same animal', () => {
    expect(
      pickIdentityWinner(
        { id: 'aaa', updatedAt: '2026-08-21T00:00:00.000Z' },
        { id: 'bbb', updatedAt: '2026-08-22T00:00:00.000Z' },
      ),
    ).toBe('remote');
    expect(
      pickIdentityWinner(
        { id: 'ccc', updatedAt: '2026-08-21T00:00:00.000Z' },
        { id: 'aaa', updatedAt: '2026-08-21T00:00:00.000Z' },
      ),
    ).toBe('remote');
  });

  it('keeps other devices when this device checks in', () => {
    const next = upsertRoster(
      {
        bookId: 'book-1',
        updatedAt: '2026-08-20T00:00:00.000Z',
        devices: [
          {
            deviceId: 'office',
            deviceName: 'Office desk',
            operatorName: 'Kim',
            lastSeenAt: '2026-08-20T00:00:00.000Z',
          },
        ],
      },
      'book-1',
      {
        deviceId: 'phone',
        deviceName: "Pat's phone",
        operatorName: 'Pat',
        lastSeenAt: '2026-08-21T00:00:00.000Z',
      },
    );
    expect(next.devices).toHaveLength(2);
    expect(next.devices.map((device) => device.deviceId).sort()).toEqual([
      'office',
      'phone',
    ]);
  });

  it('reuses an existing book id from config.json', () => {
    const parsed = parseBookConfig(
      JSON.stringify({
        app: 'record-book',
        format: 1,
        createdAt: '2026-08-01T00:00:00.000Z',
        bookId: 'shared-book',
      }),
      'device-local',
    );
    expect(parsed.existed).toBe(true);
    expect(parsed.config.bookId).toBe('shared-book');
    expect(parsed.config.format).toBe(2);
  });

  it('names a field phone after the operator', () => {
    expect(defaultDeviceName('phone', 'Dalton')).toBe("Dalton's phone");
    expect(defaultDeviceName('desk', 'Dalton')).toBe("Dalton's office");
  });
});
