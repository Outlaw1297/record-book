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

export type SnapshotConflictLog = {
  entity: string;
  entityId: string;
  kept: 'local' | 'remote';
  localUpdatedAt?: string;
  remoteUpdatedAt: string;
};

export type SnapshotApplyPlan = {
  puts: RecordWithMeta[];
  applied: number;
  conflicts: number;
  retargets: Array<{ fromId: string; toId: string; at: string }>;
  conflictLogs: SnapshotConflictLog[];
};

/** In-memory merge so a 10k-animal ranch copy is O(n), not a table scan per row. */
export function planSnapshotApply(
  entity: RecordEntity,
  localRows: RecordWithMeta[],
  remoteRows: unknown[],
  now: string,
): SnapshotApplyPlan {
  const byId = new Map<string, RecordWithMeta>();
  const byKey = new Map<string, RecordWithMeta>();

  function rememberKey(row: RecordWithMeta): void {
    const key = naturalKeyFor(entity, row);
    if (!key) return;
    const prev = byKey.get(key);
    if (!prev || prev.id === row.id) {
      byKey.set(key, row);
      return;
    }
    if (Boolean(row.deletedAt) !== Boolean(prev.deletedAt)) {
      if (!row.deletedAt) byKey.set(key, row);
      return;
    }
    if (pickIdentityWinner(prev, row) === 'remote') byKey.set(key, row);
  }

  for (const row of localRows) {
    byId.set(row.id, row);
    rememberKey(row);
  }

  const puts: RecordWithMeta[] = [];
  const retargets: SnapshotApplyPlan['retargets'] = [];
  const conflictLogs: SnapshotConflictLog[] = [];
  let applied = 0;
  let conflicts = 0;

  function write(row: RecordWithMeta): void {
    puts.push(row);
    byId.set(row.id, row);
    rememberKey(row);
  }

  for (const raw of remoteRows) {
    if (!raw || typeof raw !== 'object' || !('id' in raw)) continue;
    const record = raw as RecordWithMeta;
    if (!record.id) continue;
    const updatedAt = record.updatedAt || now;
    const localById = byId.get(record.id);
    const key = naturalKeyFor(entity, record);
    const keyed = key ? byKey.get(key) : undefined;
    const duplicate = keyed && keyed.id !== record.id ? keyed : undefined;
    const candidates = [localById, duplicate].filter(
      (row, index, rows): row is RecordWithMeta =>
        Boolean(row) && rows.findIndex((other) => other?.id === row?.id) === index,
    );

    let bestLocal: RecordWithMeta | undefined;
    for (const candidate of candidates) {
      if (!bestLocal) bestLocal = candidate;
      else if (pickIdentityWinner(bestLocal, candidate) === 'remote') bestLocal = candidate;
    }

    if (bestLocal && bestLocal.id === record.id && bestLocal.updatedAt === updatedAt) {
      applied += 1;
      continue;
    }

    const remoteMeta = { id: record.id, updatedAt };
    if (bestLocal && pickIdentityWinner(bestLocal, remoteMeta) === 'local') {
      conflicts += 1;
      conflictLogs.push({
        entity,
        entityId: record.id,
        kept: 'local',
        localUpdatedAt: bestLocal.updatedAt,
        remoteUpdatedAt: updatedAt,
      });
      for (const candidate of candidates) {
        if (candidate.id !== bestLocal.id) {
          write({
            ...candidate,
            updatedAt: bestLocal.updatedAt,
            deletedAt: candidate.deletedAt ?? bestLocal.updatedAt,
          });
        }
      }
      continue;
    }

    const hadDifferentLocal =
      Boolean(bestLocal?.updatedAt) && bestLocal?.updatedAt !== updatedAt;
    const next: RecordWithMeta = record.deletedAt
      ? {
          ...(bestLocal ?? { id: record.id, updatedAt }),
          ...record,
          id: record.id,
          updatedAt,
          deletedAt: record.deletedAt || updatedAt,
        }
      : { ...record, id: record.id, updatedAt };
    write(next);

    for (const candidate of candidates) {
      if (candidate.id === record.id) continue;
      if (entity === 'pastures') {
        retargets.push({ fromId: candidate.id, toId: record.id, at: updatedAt });
      }
      write({
        ...candidate,
        updatedAt,
        deletedAt: candidate.deletedAt ?? updatedAt,
      });
    }

    if (hadDifferentLocal) {
      conflicts += 1;
      conflictLogs.push({
        entity,
        entityId: record.id,
        kept: 'remote',
        localUpdatedAt: bestLocal?.updatedAt,
        remoteUpdatedAt: updatedAt,
      });
    } else {
      applied += 1;
    }
  }

  return { puts, applied, conflicts, retargets, conflictLogs };
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

const SNAPSHOT_PUT_CHUNK = 400;

export async function applySnapshotRows(
  entity: RecordEntity,
  rows: unknown[],
): Promise<{ applied: number; conflicts: number }> {
  const table = tableFor(entity) as unknown as {
    toArray: () => Promise<RecordWithMeta[]>;
    bulkPut: (items: RecordWithMeta[]) => Promise<unknown>;
  };
  const localRows = asMeta(await table.toArray());
  const plan = planSnapshotApply(entity, localRows, rows, nowIso());
  for (let index = 0; index < plan.puts.length; index += SNAPSHOT_PUT_CHUNK) {
    await table.bulkPut(plan.puts.slice(index, index + SNAPSHOT_PUT_CHUNK));
  }
  if (entity === 'pastures') {
    for (const move of plan.retargets) {
      await retargetPastureAnimals(move.fromId, move.toId, move.at);
    }
  }
  for (const item of plan.conflictLogs) {
    await logConflict(item);
  }
  return { applied: plan.applied, conflicts: plan.conflicts };
}
