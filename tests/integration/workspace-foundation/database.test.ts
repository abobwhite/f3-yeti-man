import assert from 'node:assert/strict';
import test from 'node:test';
import { MongoServerError } from 'mongodb';
import { openIntegrationDatabase } from '../database-harness.ts';

test('replica set commits and rolls back multi-document writes with uniqueness', async () => {
  const harness = await openIntegrationDatabase();
  const { client, db } = harness.connection;
  try {
    const hello = await db.admin().command({ hello: 1 });
    assert.equal(typeof hello.setName, 'string');

    const entries = db.collection<{ key: string; value: number }>('entries');
    const revisions = db.collection<{ key: string; value: number }>('revisions');
    await entries.createIndex({ key: 1 }, { unique: true });

    await client.withSession((session) =>
      session.withTransaction(async () => {
        await entries.insertOne({ key: 'committed', value: 1 }, { session });
        await revisions.insertOne({ key: 'committed', value: 1 }, { session });
      }),
    );
    assert.equal(await entries.countDocuments({ key: 'committed' }), 1);
    assert.equal(await revisions.countDocuments({ key: 'committed' }), 1);

    await assert.rejects(
      client.withSession((session) =>
        session.withTransaction(async () => {
          await entries.insertOne({ key: 'rolled-back', value: 2 }, { session });
          await revisions.insertOne({ key: 'rolled-back', value: 2 }, { session });
          throw new Error('force rollback');
        }),
      ),
      /force rollback/,
    );
    assert.equal(await entries.countDocuments({ key: 'rolled-back' }), 0);
    assert.equal(await revisions.countDocuments({ key: 'rolled-back' }), 0);

    await assert.rejects(
      entries.insertOne({ key: 'committed', value: 3 }),
      (error: unknown) => error instanceof MongoServerError && error.code === 11000,
    );
  } finally {
    await harness.close();
  }
  assert.equal(harness.connection.isClosed(), true);
});
