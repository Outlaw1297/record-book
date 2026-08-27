import type { DeviceKind } from '../db/schema';

export function normId(value: string): string {
  return value.trim().toLowerCase();
}

export function animalNaturalKey(herdId: string): string {
  return `animal:${normId(herdId)}`;
}

export function cowCalfNaturalKey(row: {
  year: number;
  cowId: string;
  calfId?: string;
  openWithoutCalf?: boolean;
}): string {
  const calf = row.calfId?.trim()
    ? normId(row.calfId)
    : row.openWithoutCalf
      ? 'open'
      : '';
  return `cowCalf:${row.year}|${normId(row.cowId)}|${calf}`;
}

export function breedingNaturalKey(row: {
  year: number;
  cowId: string;
  kind: string;
}): string {
  return `breeding:${row.year}|${normId(row.cowId)}|${row.kind}`;
}

export function pastureNaturalKey(row: {
  year: number;
  pastureName: string;
}): string {
  return `pasture:${row.year}|${normId(row.pastureName)}`;
}

export function pastureAnimalNaturalKey(row: {
  exposureId: string;
  animalHerdId: string;
  role: string;
}): string {
  return `pastureAnimal:${row.exposureId}|${normId(row.animalHerdId)}|${row.role}`;
}

export function saleNaturalKey(row: { year: number; calfId: string }): string {
  return `sale:${row.year}|${normId(row.calfId)}`;
}

export function treatmentNaturalKey(row: {
  animalHerdId: string;
  date?: string;
  product?: string;
}): string {
  return `treatment:${normId(row.animalHerdId)}|${row.date || ''}|${normId(row.product || '')}`;
}

export function pickIdentityWinner(
  local: { id: string; updatedAt: string },
  remote: { id: string; updatedAt: string },
): 'local' | 'remote' {
  if (local.updatedAt > remote.updatedAt) return 'local';
  if (remote.updatedAt > local.updatedAt) return 'remote';
  return local.id <= remote.id ? 'local' : 'remote';
}

export type DeviceRosterEntry = {
  deviceId: string;
  deviceName: string;
  operatorName?: string;
  kind?: DeviceKind;
  lastSeenAt: string;
};

export type DeviceRoster = {
  bookId: string;
  updatedAt: string;
  devices: DeviceRosterEntry[];
};

export type BookConfig = {
  app: 'record-book';
  format: number;
  bookId: string;
  createdAt: string;
};

export function defaultDeviceName(
  kind?: DeviceKind,
  operatorName?: string,
): string {
  const who = operatorName?.trim();
  if (kind === 'desk') return who ? `${who}'s office` : 'Office desk';
  if (kind === 'phone') return who ? `${who}'s phone` : 'Field phone';
  return who ? `${who}'s device` : 'This device';
}

export function upsertRoster(
  roster: DeviceRoster | null,
  bookId: string,
  entry: DeviceRosterEntry,
): DeviceRoster {
  const devices = (roster?.devices ?? []).filter(
    (device) => device.deviceId !== entry.deviceId,
  );
  devices.push(entry);
  devices.sort((a, b) => a.deviceName.localeCompare(b.deviceName));
  return {
    bookId: roster?.bookId || bookId,
    updatedAt: entry.lastSeenAt,
    devices,
  };
}

export function parseBookConfig(
  text: string | null,
  fallbackBookId: string,
): { config: BookConfig; existed: boolean; upgraded: boolean } {
  if (!text) {
    const now = new Date().toISOString();
    return {
      existed: false,
      upgraded: false,
      config: {
        app: 'record-book',
        format: 2,
        bookId: fallbackBookId,
        createdAt: now,
      },
    };
  }
  try {
    const parsed = JSON.parse(text) as Partial<BookConfig>;
    const bookId =
      typeof parsed.bookId === 'string' && parsed.bookId.trim()
        ? parsed.bookId
        : fallbackBookId;
    const upgraded = parsed.format !== 2 || parsed.bookId !== bookId;
    return {
      existed: true,
      upgraded: upgraded || parsed.format == null,
      config: {
        app: 'record-book',
        format: 2,
        bookId,
        createdAt:
          typeof parsed.createdAt === 'string'
            ? parsed.createdAt
            : new Date().toISOString(),
      },
    };
  } catch {
    return parseBookConfig(null, fallbackBookId);
  }
}

export function parseRoster(text: string | null, bookId: string): DeviceRoster {
  if (!text) {
    return { bookId, updatedAt: new Date().toISOString(), devices: [] };
  }
  try {
    const parsed = JSON.parse(text) as DeviceRoster;
    const devices = Array.isArray(parsed.devices)
      ? parsed.devices.filter(
          (device) =>
            device &&
            typeof device.deviceId === 'string' &&
            typeof device.deviceName === 'string',
        )
      : [];
    return {
      bookId:
        typeof parsed.bookId === 'string' && parsed.bookId.trim()
          ? parsed.bookId
          : bookId,
      updatedAt:
        typeof parsed.updatedAt === 'string'
          ? parsed.updatedAt
          : new Date().toISOString(),
      devices,
    };
  } catch {
    return { bookId, updatedAt: new Date().toISOString(), devices: [] };
  }
}

export function devicesFromChangePaths(
  keys: string[],
  roster: DeviceRoster,
): DeviceRoster {
  const known = new Set(roster.devices.map((device) => device.deviceId));
  const extra: DeviceRosterEntry[] = [];
  for (const key of keys) {
    const match = key.match(/^changes\/([^/]+)\//);
    const deviceId = match?.[1];
    if (!deviceId || known.has(deviceId)) continue;
    known.add(deviceId);
    extra.push({
      deviceId,
      deviceName: `Device ${deviceId.slice(0, 8)}`,
      lastSeenAt: roster.updatedAt,
    });
  }
  if (extra.length === 0) return roster;
  return {
    ...roster,
    devices: [...roster.devices, ...extra].sort((a, b) =>
      a.deviceName.localeCompare(b.deviceName),
    ),
  };
}
