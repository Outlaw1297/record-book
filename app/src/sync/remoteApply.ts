import {
  db,
  newId,
  nowIso,
  type OutboxChange,
} from '../db/schema';
import { decideWrite, mergeRemoteSettings, parseJsonl } from './apply';
import {
  animalNaturalKey,
  breedingNaturalKey,
  cowCalfNaturalKey,
  pastureAnimalNaturalKey,
  pastureNaturalKey,
  pickIdentityWinner,
  saleNaturalKey,
  treatmentNaturalKey,
} from './identity';
import type { ChangeLine } from './types';

type RecordWithMeta = {
  id: string;
  updatedAt: string;
  deletedAt?: string;
};

function asMeta(rows: Array<{ id: string; updatedAt: string; deletedAt?: string }>): RecordWithMeta[] {
  return rows;
}

const ENTITY_TABLES = [
  'animals',
  'cowCalf',
  'breeding',
  'pastures',
  'pastureAnimals',
  'sales',
  'treatments',
] as const;

export type RecordEntity = (typeof ENTITY_TABLES)[number];

export const SNAPSHOT_WRITE_CHUNK = 250;

function yieldToUi(): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, 0);
  });
}

function isRecordEntity(entity: OutboxChange['entity']): entity is RecordEntity {
  return (ENTITY_TABLES as readonly string[]).includes(entity);
}

function tableFor(entity: RecordEntity) {
  switch (entity) {
    case 'animals':
      return db.animals;
    case 'cowCalf':
      return db.cowCalf;
    case 'breeding':
      return db.breeding;
    case 'pastures':
      return db.pastures;
    case 'pastureAnimals':
      return db.pastureAnimals;
    case 'sales':
      return db.sales;
    case 'treatments':
      return db.treatments;
  }
}

async function logConflict(input: {
  entity: string;
  entityId: string;
  kept: 'local' | 'remote';
  localUpdatedAt?: string;
  remoteUpdatedAt: string;
  operatorName?: string;
  deviceName?: string;
}): Promise<void> {
  await db.syncConflicts.put({
    id: newId(),
    entity: input.entity,
    entityId: input.entityId,
    kept: input.kept,
    localUpdatedAt: input.localUpdatedAt,
    remoteUpdatedAt: input.remoteUpdatedAt,
    createdAt: nowIso(),
    operatorName: input.operatorName,
    deviceName: input.deviceName,
  });
}

function newest(rows: RecordWithMeta[]): RecordWithMeta | undefined {
  return rows.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0];
}

export function naturalKeyFor(
  entity: RecordEntity,
  payload: Record<string, unknown> | RecordWithMeta,
): string | undefined {
  const row = payload as Record<string, unknown>;
  switch (entity) {
    case 'animals': {
      const herdId = String(row.herdId ?? '');
      return herdId.trim() ? animalNaturalKey(herdId) : undefined;
    }
    case 'cowCalf':
      return cowCalfNaturalKey({
        year: Number(row.year),
        cowId: String(row.cowId ?? ''),
        calfId: typeof row.calfId === 'string' ? row.calfId : '',
        openWithoutCalf: Boolean(row.openWithoutCalf),
      });
    case 'breeding':
      return breedingNaturalKey({
        year: Number(row.year),
        cowId: String(row.cowId ?? ''),
        kind: String(row.kind ?? ''),
      });
    case 'pastures':
      return pastureNaturalKey({
        year: Number(row.year),
        pastureName: String(row.pastureName ?? ''),
      });
    case 'pastureAnimals':
      return pastureAnimalNaturalKey({
        exposureId: String(row.exposureId ?? ''),
        animalHerdId: String(row.animalHerdId ?? ''),
        role: String(row.role ?? ''),
      });
    case 'sales':
      return saleNaturalKey({
        year: Number(row.year),
        calfId: String(row.calfId ?? ''),
      });
    case 'treatments':
      return treatmentNaturalKey({
        animalHerdId: String(row.animalHerdId ?? ''),
        date: typeof row.date === 'string' ? row.date : '',
        product: typeof row.product === 'string' ? row.product : '',
      });
  }
}

async function findNaturalDuplicate(
  entity: RecordEntity,
  payload: Record<string, unknown>,
  remoteId: string,
): Promise<RecordWithMeta | undefined> {
  const key = naturalKeyFor(entity, payload);
  if (!key) return undefined;
  const matches = asMeta(
    ((await tableFor(entity).filter((row) => row.id !== remoteId).toArray()) as RecordWithMeta[]).filter(
      (row) => naturalKeyFor(entity, row) === key,
    ),
  );
  return newest(matches);
}

async function tombstone(
  entity: RecordEntity,
  row: RecordWithMeta,
  at: string,
): Promise<void> {
  const table = tableFor(entity);
  await table.put({
    ...row,
    id: row.id,
    updatedAt: at,
    deletedAt: row.deletedAt ?? at,
  } as never);
}

async function retargetPastureAnimals(
  fromId: string,
  toId: string,
  at: string,
): Promise<void> {
  if (fromId === toId) return;
  const rows = await db.pastureAnimals
    .filter((row) => row.exposureId === fromId)
    .toArray();
  for (const row of rows) {
    const next = { ...row, exposureId: toId, updatedAt: at };
    const clash = await db.pastureAnimals
      .filter(
        (other) =>
          other.id !== row.id &&
          pastureAnimalNaturalKey(other) === pastureAnimalNaturalKey(next),
      )
      .first();
    if (clash) {
      const winner = pickIdentityWinner(clash, next);
      if (winner === 'local') {
        await db.pastureAnimals.put({
          ...row,
          exposureId: toId,
          updatedAt: at,
          deletedAt: row.deletedAt ?? at,
        });
      } else {
        await db.pastureAnimals.put(next);
        await db.pastureAnimals.put({
          ...clash,
          updatedAt: at,
          deletedAt: clash.deletedAt ?? at,
        });
      }
    } else {
      await db.pastureAnimals.put(next);
    }
  }
}

export async function applyRemoteChange(
  change: ChangeLine,
): Promise<'applied' | 'skipped' | 'conflict'> {
  if (change.entity === 'settings') {
    const local = await db.settings.get(1);
    if (!local) return 'skipped';
    if (!local.lastSyncedAt) {
      await db.settings.put(mergeRemoteSettings(local, change.payload));
      return 'applied';
    }
    const decision = decideWrite(local.updatedAt, change.updatedAt);
    if (decision === 'keep-local') {
      await logConflict({
        entity: 'settings',
        entityId: '1',
        kept: 'local',
        localUpdatedAt: local.updatedAt,
        remoteUpdatedAt: change.updatedAt,
        operatorName: change.operatorName,
        deviceName: change.deviceName,
      });
      return 'conflict';
    }
    if (local.updatedAt && local.updatedAt !== change.updatedAt) {
      await logConflict({
        entity: 'settings',
        entityId: '1',
        kept: 'remote',
        localUpdatedAt: local.updatedAt,
        remoteUpdatedAt: change.updatedAt,
        operatorName: change.operatorName,
        deviceName: change.deviceName,
      });
    }
    await db.settings.put(mergeRemoteSettings(local, change.payload));
    return local.updatedAt && local.updatedAt !== change.updatedAt
      ? 'conflict'
      : 'applied';
  }

  if (!isRecordEntity(change.entity)) return 'skipped';

  const table = tableFor(change.entity);
  const payload =
    change.payload && typeof change.payload === 'object'
      ? (change.payload as Record<string, unknown>)
      : {};
  const localById = (await table.get(change.entityId)) as
    | RecordWithMeta
    | undefined;
  const duplicate =
    change.op === 'upsert'
      ? await findNaturalDuplicate(change.entity, payload, change.entityId)
      : undefined;
  const candidates = [localById, duplicate].filter(
    (row, index, rows): row is RecordWithMeta =>
      Boolean(row) && rows.findIndex((other) => other?.id === row?.id) === index,
  );

  let bestLocal: RecordWithMeta | undefined;
  for (const candidate of candidates) {
    if (!bestLocal) bestLocal = candidate;
    else if (pickIdentityWinner(bestLocal, candidate) === 'remote') {
      bestLocal = candidate;
    }
  }

  const remoteMeta = { id: change.entityId, updatedAt: change.updatedAt };
  if (
    bestLocal &&
    bestLocal.id === change.entityId &&
    bestLocal.updatedAt === change.updatedAt
  ) {
    return 'applied';
  }
  if (bestLocal && pickIdentityWinner(bestLocal, remoteMeta) === 'local') {
    await logConflict({
      entity: change.entity,
      entityId: change.entityId,
      kept: 'local',
      localUpdatedAt: bestLocal.updatedAt,
      remoteUpdatedAt: change.updatedAt,
      operatorName: change.operatorName,
      deviceName: change.deviceName,
    });
    for (const candidate of candidates) {
      if (candidate.id !== bestLocal.id) {
        await tombstone(change.entity, candidate, bestLocal.updatedAt);
      }
    }
    return 'conflict';
  }

  const hadDifferentLocal =
    bestLocal && bestLocal.updatedAt && bestLocal.updatedAt !== change.updatedAt;

  if (change.op === 'delete') {
    await table.put({
      ...(bestLocal ?? { id: change.entityId }),
      ...payload,
      id: change.entityId,
      updatedAt: change.updatedAt,
      deletedAt:
        (typeof payload.deletedAt === 'string' && payload.deletedAt) ||
        change.updatedAt,
    } as never);
  } else if (Object.keys(payload).length > 0) {
    await table.put({
      ...payload,
      id: change.entityId,
      updatedAt: change.updatedAt,
    } as never);
  } else {
    return 'skipped';
  }

  for (const candidate of candidates) {
    if (candidate.id === change.entityId) continue;
    if (change.entity === 'pastures') {
      await retargetPastureAnimals(candidate.id, change.entityId, change.updatedAt);
    }
    await tombstone(change.entity, candidate, change.updatedAt);
  }

  if (hadDifferentLocal) {
    await logConflict({
      entity: change.entity,
      entityId: change.entityId,
      kept: 'remote',
      localUpdatedAt: bestLocal?.updatedAt,
      remoteUpdatedAt: change.updatedAt,
      operatorName: change.operatorName,
      deviceName: change.deviceName,
    });
    return 'conflict';
  }

  return 'applied';
}

export async function applyRemoteFile(
  fileKey: string,
  text: string,
  provider: string,
): Promise<{ applied: number; conflicts: number }> {
  const existing = await db.syncApplied.get(fileKey);
  if (existing) return { applied: 0, conflicts: 0 };

  const changes = parseJsonl(text);
  let applied = 0;
  let conflicts = 0;
  for (const change of changes) {
    const result = await applyRemoteChange(change);
    if (result === 'applied') applied += 1;
    if (result === 'conflict') conflicts += 1;
  }
  await db.syncApplied.put({
    fileKey,
    appliedAt: nowIso(),
    provider,
  });
  return { applied, conflicts };
}

export function naturalKeyFromRecord(
  entity: RecordEntity,
  record: Record<string, unknown>,
): string | null {
  return naturalKeyFor(entity, record) ?? null;
}

function preferKeyHolder(a: RecordWithMeta, b: RecordWithMeta): RecordWithMeta {
  if (a.deletedAt && !b.deletedAt) return b;
  if (b.deletedAt && !a.deletedAt) return a;
  return pickIdentityWinner(a, b) === 'remote' ? b : a;
}

export function planSnapshotMerge(
  entity: RecordEntity,
  locals: RecordWithMeta[],
  remotes: unknown[],
): {
  puts: RecordWithMeta[];
  retargets: Array<{ fromId: string; toId: string; at: string }>;
  applied: number;
  conflicts: number;
} {
  const byId = new Map<string, RecordWithMeta>();
  const byKey = new Map<string, RecordWithMeta>();

  const indexKey = (record: RecordWithMeta) => {
    const key = naturalKeyFromRecord(entity, record as Record<string, unknown>);
    if (!key) return;
    const existing = byKey.get(key);
    byKey.set(key, existing ? preferKeyHolder(existing, record) : record);
  };

  for (const local of locals) {
    byId.set(local.id, local);
    indexKey(local);
  }

  const putsById = new Map<string, RecordWithMeta>();
  const retargets: Array<{ fromId: string; toId: string; at: string }> = [];
  let applied = 0;
  let conflicts = 0;

  const queuePut = (record: RecordWithMeta) => {
    putsById.set(record.id, record);
    byId.set(record.id, record);
    indexKey(record);
  };

  const tombstoneLocal = (row: RecordWithMeta, at: string) => {
    queuePut({
      ...row,
      updatedAt: at,
      deletedAt: row.deletedAt ?? at,
    });
  };

  for (const row of remotes) {
    if (!row || typeof row !== 'object' || !('id' in row)) continue;
    const remote = row as RecordWithMeta;
    const updatedAt = remote.updatedAt || nowIso();
    const op = remote.deletedAt ? 'delete' : 'upsert';

    const localById = byId.get(remote.id);
    const remoteKey =
      op === 'upsert'
        ? naturalKeyFromRecord(entity, remote as Record<string, unknown>)
        : null;
    const duplicate = remoteKey ? byKey.get(remoteKey) : undefined;
    const duplicateIfOther =
      duplicate && duplicate.id !== remote.id ? duplicate : undefined;
    const candidates = [localById, duplicateIfOther].filter(
      (candidate, index, rows): candidate is RecordWithMeta =>
        Boolean(candidate) &&
        rows.findIndex((other) => other?.id === candidate?.id) === index,
    );

    let bestLocal: RecordWithMeta | undefined;
    for (const candidate of candidates) {
      if (!bestLocal) bestLocal = candidate;
      else if (pickIdentityWinner(bestLocal, candidate) === 'remote') {
        bestLocal = candidate;
      }
    }

    const remoteMeta = { id: remote.id, updatedAt };
    if (
      bestLocal &&
      bestLocal.id === remote.id &&
      bestLocal.updatedAt === updatedAt
    ) {
      applied += 1;
      continue;
    }
    if (bestLocal && pickIdentityWinner(bestLocal, remoteMeta) === 'local') {
      conflicts += 1;
      for (const candidate of candidates) {
        if (candidate.id !== bestLocal.id) {
          tombstoneLocal(candidate, bestLocal.updatedAt);
        }
      }
      continue;
    }

    const hadDifferentLocal =
      Boolean(bestLocal && bestLocal.updatedAt && bestLocal.updatedAt !== updatedAt);

    if (op === 'delete') {
      queuePut({
        ...(bestLocal ?? { id: remote.id }),
        ...remote,
        id: remote.id,
        updatedAt,
        deletedAt: remote.deletedAt || updatedAt,
      });
    } else {
      queuePut({ ...remote, id: remote.id, updatedAt });
    }

    for (const candidate of candidates) {
      if (candidate.id === remote.id) continue;
      if (entity === 'pastures') {
        retargets.push({ fromId: candidate.id, toId: remote.id, at: updatedAt });
      }
      tombstoneLocal(candidate, updatedAt);
    }

    if (hadDifferentLocal) conflicts += 1;
    else applied += 1;
  }

  return { puts: [...putsById.values()], retargets, applied, conflicts };
}

export async function applySnapshotRows(
  entity: RecordEntity,
  rows: unknown[],
  onChunk?: (written: number, planned: number) => void,
): Promise<{ applied: number; conflicts: number }> {
  const table = tableFor(entity);
  if (!table) return { applied: 0, conflicts: 0 };

  const locals = (await table.toArray()) as RecordWithMeta[];
  const planned = planSnapshotMerge(entity, locals, rows);
  let written = 0;
  for (let i = 0; i < planned.puts.length; i += SNAPSHOT_WRITE_CHUNK) {
    const chunk = planned.puts.slice(i, i + SNAPSHOT_WRITE_CHUNK);
    await (
      table as unknown as {
        bulkPut: (items: readonly RecordWithMeta[]) => Promise<unknown>;
      }
    ).bulkPut(chunk);
    written += chunk.length;
    onChunk?.(written, planned.puts.length);
    await yieldToUi();
  }
  for (const retarget of planned.retargets) {
    await retargetPastureAnimals(retarget.fromId, retarget.toId, retarget.at);
  }
  return { applied: planned.applied, conflicts: planned.conflicts };
}
