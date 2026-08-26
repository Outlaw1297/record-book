import {
  db,
  newId,
  nowIso,
  type OutboxChange,
} from '../db/schema';
import { decideWrite, mergeRemoteSettings, parseJsonl } from './apply';
import type { ChangeLine } from './types';

type RecordWithMeta = { id: string; updatedAt: string; deletedAt?: string };

function changeTimestamp(change: ChangeLine): string {
  if (change.payload && typeof change.payload === 'object') {
    const value = (change.payload as { updatedAt?: unknown }).updatedAt;
    if (typeof value === 'string' && value) return value;
  }
  return change.updatedAt;
}

const ENTITY_TABLES = [
  'animals',
  'cowCalf',
  'breeding',
  'pastures',
  'pastureAnimals',
  'sales',
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
  }
}

async function logConflict(input: {
  entity: string;
  entityId: string;
  kept: 'local' | 'remote';
  localUpdatedAt?: string;
  remoteUpdatedAt: string;
}): Promise<void> {
  await db.syncConflicts.put({
    id: newId(),
    entity: input.entity,
    entityId: input.entityId,
    kept: input.kept,
    localUpdatedAt: input.localUpdatedAt,
    remoteUpdatedAt: input.remoteUpdatedAt,
    createdAt: nowIso(),
  });
}

export async function applyRemoteChange(change: ChangeLine): Promise<'applied' | 'skipped' | 'conflict'> {
  const remoteUpdatedAt = changeTimestamp(change);
  if (change.entity === 'settings') {
    const local = await db.settings.get(1);
    if (!local) return 'skipped';
    const decision = decideWrite(local.updatedAt, remoteUpdatedAt);
    if (decision === 'keep-local') {
      await logConflict({
        entity: 'settings',
        entityId: '1',
        kept: 'local',
        localUpdatedAt: local.updatedAt,
        remoteUpdatedAt,
      });
      return 'conflict';
    }
    if (local.updatedAt && local.updatedAt !== remoteUpdatedAt) {
      await logConflict({
        entity: 'settings',
        entityId: '1',
        kept: 'remote',
        localUpdatedAt: local.updatedAt,
        remoteUpdatedAt,
      });
      await db.settings.put(mergeRemoteSettings(local, change.payload));
      return 'conflict';
    }
    await db.settings.put(mergeRemoteSettings(local, change.payload));
    return 'applied';
  }

  if (!isRecordEntity(change.entity)) return 'skipped';

  const table = tableFor(change.entity);
  const local = (await table.get(change.entityId)) as RecordWithMeta | undefined;
  const decision = decideWrite(local?.updatedAt, remoteUpdatedAt);

  if (decision === 'keep-local') {
    await logConflict({
      entity: change.entity,
      entityId: change.entityId,
      kept: 'local',
      localUpdatedAt: local?.updatedAt,
      remoteUpdatedAt,
    });
    return 'conflict';
  }

  const hadDifferentLocal =
    local && local.updatedAt && local.updatedAt !== remoteUpdatedAt;

  if (change.op === 'delete') {
    const payload =
      change.payload && typeof change.payload === 'object'
        ? (change.payload as RecordWithMeta)
        : undefined;
    await table.put({
      ...(local ?? { id: change.entityId }),
      ...(payload ?? {}),
      id: change.entityId,
      updatedAt: remoteUpdatedAt,
      deletedAt: payload?.deletedAt ?? remoteUpdatedAt,
    } as never);
  } else if (change.payload && typeof change.payload === 'object') {
    await table.put({
      ...(change.payload as object),
      id: change.entityId,
      updatedAt: remoteUpdatedAt,
    } as never);
  } else {
    return 'skipped';
  }

  if (hadDifferentLocal) {
    await logConflict({
      entity: change.entity,
      entityId: change.entityId,
      kept: 'remote',
      localUpdatedAt: local?.updatedAt,
      remoteUpdatedAt,
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
