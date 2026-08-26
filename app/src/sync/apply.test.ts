import { describe, expect, it } from 'vitest';
import {
  decideWrite,
  mergeRemoteSettings,
  parseJsonl,
  serializeJsonl,
  snapshotSettings,
} from './apply';
import type { AppSettings } from '../db/schema';

const local: AppSettings = {
  id: 1,
  ranchName: 'Home Place',
  operatorName: 'Pat',
  currentYear: 2026,
  syncProvider: 'google-drive',
  lastSyncedAt: '2026-08-01T00:00:00.000Z',
  deviceId: 'device-local',
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
  it('never copies device id, tokens, or provider from the cloud', () => {
    const merged = mergeRemoteSettings(local, {
      ranchName: 'Summer Camp',
      operatorName: 'Kim',
      currentYear: 2027,
      deviceId: 'attacker-device',
      syncProvider: 'none',
      lastSyncedAt: '1999-01-01T00:00:00.000Z',
      accessToken: 'secret',
    });
    expect(merged.deviceId).toBe('device-local');
    expect(merged.syncProvider).toBe('google-drive');
    expect(merged.lastSyncedAt).toBe('2026-08-01T00:00:00.000Z');
    expect(merged.ranchName).toBe('Summer Camp');
    expect(merged.currentYear).toBe(2027);
    expect(merged).not.toHaveProperty('accessToken');
  });

  it('omits secrets from snapshot settings', () => {
    expect(snapshotSettings(local)).toEqual({
      ranchName: 'Home Place',
      operatorName: 'Pat',
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
  });
});
