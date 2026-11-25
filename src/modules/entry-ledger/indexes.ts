import type { Db } from 'mongodb';

export async function provisionEntryIndexes(db: Db): Promise<void> {
  await db
    .collection('messageOutbox')
    .createIndexes([{ key: { kind: 1, status: 1, availableAt: 1, leaseUntil: 1, createdAt: 1 } }]);
  await db.collection('entries').createIndexes([
    { key: { teamId: 1, regionId: 1, entryId: 1 }, unique: true },
    {
      key: {
        teamId: 1,
        regionId: 1,
        'workoutReference.aoId': 1,
        'workoutReference.localDate': 1,
        'workoutReference.localStartTime': 1,
      },
      unique: true,
    },
  ]);
  for (const [collection, key] of [
    ['entrySources', { teamId: 1, regionId: 1, channelId: 1, messageTs: 1 }],
    ['entryRevisions', { teamId: 1, regionId: 1, entryId: 1, version: 1 }],
    ['operationReceipts', { teamId: 1, regionId: 1, operationKey: 1 }],
    ['messageOutbox', { teamId: 1, regionId: 1, operationKey: 1 }],
    [
      'entryScoreGenerations',
      { teamId: 1, regionId: 1, entryId: 1, factVersion: 1, generationId: 1 },
    ],
  ] as const)
    await db.collection(collection).createIndexes([{ key, unique: true }]);
}
