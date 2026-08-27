import {
  db,
  newId,
  nowIso,
  type OutboxChange,
} from '../db/schema';
import { decideWrite, mergeRemoteSettings, parseJsonl } from './apply';
import {
  breedingNaturalKey,
  cowCalfNaturalKey,
  normId,
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

type RecordEntity = (typeof ENTITY_TABLES)[number];

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

async function findNaturalDuplicate(
  entity: RecordEntity,
  payload: Record<string, unknown>,
  remoteId: string,
): Promise<RecordWithMeta | undefined> {
  switch (entity) {
    case 'animals': {
      const herdId = String(payload.herdId ?? '');
      if (!herdId.trim()) return undefined;
      const key = normId(herdId);
      const matches = asMeta(
        await db.animals
          .filter((row) => row.id !== remoteId && normId(row.herdId) === key)
          .toArray(),
      );
      return newest(matches);
    }
    case 'cowCalf': {
      const key = cowCalfNaturalKey({
        year: Number(payload.year),
        cowId: String(payload.cowId ?? ''),
        calfId: typeof payload.calfId === 'string' ? payload.calfId : '',
        openWithoutCalf: Boolean(payload.openWithoutCalf),
      });
      const matches = asMeta(
        await db.cowCalf
          .filter((row) => row.id !== remoteId && cowCalfNaturalKey(row) === key)
          .toArray(),
      );
      return newest(matches);
    }
    case 'breeding': {
      const key = breedingNaturalKey({
        year: Number(payload.year),
        cowId: String(payload.cowId ?? ''),
        kind: String(payload.kind ?? ''),
      });
      const matches = asMeta(
        await db.breeding
          .filter((row) => row.id !== remoteId && breedingNaturalKey(row) === key)
          .toArray(),
      );
      return newest(matches);
    }
    case 'pastures': {
      const key = pastureNaturalKey({
        year: Number(payload.year),
        pastureName: String(payload.pastureName ?? ''),
      });
      const matches = asMeta(
        await db.pastures
          .filter((row) => row.id !== remoteId && pastureNaturalKey(row) === key)
          .toArray(),
      );
      return newest(matches);
    }
    case 'pastureAnimals': {
      const key = pastureAnimalNaturalKey({
        exposureId: String(payload.exposureId ?? ''),
        animalHerdId: String(payload.animalHerdId ?? ''),
        role: String(payload.role ?? ''),
      });
      const matches = asMeta(
        await db.pastureAnimals
          .filter(
            (row) => row.id !== remoteId && pastureAnimalNaturalKey(row) === key,
          )
          .toArray(),
      );
      return newest(matches);
    }
    case 'sales': {
      const key = saleNaturalKey({
        year: Number(payload.year),
        calfId: String(payload.calfId ?? ''),
      });
      const matches = asMeta(
        await db.sales
          .filter((row) => row.id !== remoteId && saleNaturalKey(row) === key)
          .toArray(),
      );
      return newest(matches);
    }
    case 'treatments': {
      const key = treatmentNaturalKey({
        animalHerdId: String(payload.animalHerdId ?? ''),
        date: typeof payload.date === 'string' ? payload.date : '',
        product: typeof payload.product === 'string' ? payload.product : '',
      });
      const matches = asMeta(
        await db.treatments
          .filter((row) => row.id !== remoteId && treatmentNaturalKey(row) === key)
          .toArray(),
      );
      return newest(matches);
    }
  }
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

export async function applySnapshotRows(
  entity: RecordEntity,
  rows: unknown[],
): Promise<{ applied: number; conflicts: number }> {
  let applied = 0;
  let conflicts = 0;
  for (const row of rows) {
    if (!row || typeof row !== 'object' || !('id' in row)) continue;
    const record = row as RecordWithMeta;
    const result = await applyRemoteChange({
      v: 1,
      deviceId: 'snapshot',
      entity,
      entityId: record.id,
      op: record.deletedAt ? 'delete' : 'upsert',
      updatedAt: record.updatedAt || nowIso(),
      payload: record,
    });
    if (result === 'applied') applied += 1;
    if (result === 'conflict') conflicts += 1;
  }
  return { applied, conflicts };
}
