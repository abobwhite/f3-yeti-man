import assert from 'node:assert/strict';
import test from 'node:test';
import { createWorkspaceContextProvider } from '../../../src/modules/workspace-foundation/context.ts';
import { createOperationDispatcher } from '../../../src/modules/workspace-foundation/dispatcher.ts';
import type { Operation } from '../../../src/modules/workspace-foundation/operations.ts';
import {
  createOperationRepository,
  provisionOperationIndexes,
} from '../../../src/modules/workspace-foundation/operations.ts';
import { createSlackDeliveryHandler } from '../../../src/modules/workspace-foundation/slack-delivery.ts';
import { openIntegrationDatabase } from '../database-harness.ts';

test('intent is transactional, tenant keyed, deduplicated and leased across workers', async () => {
  const harness = await openIntegrationDatabase();
  try {
    const { db, client } = harness.connection;
    await provisionOperationIndexes(db);
    const provider = createWorkspaceContextProvider(db, client, 'AAPP1');
    for (const teamId of ['TONE', 'TTWO']) {
      await db.collection('installations').insertOne({
        _id: teamId,
        teamId,
        appId: 'AAPP1',
        installerUserId: 'UONE',
        active: true,
        botToken: { encrypted: true },
      });
    }
    const first = await provider.resolveWorkspaceContext({
      teamId: 'TONE',
      actorUserId: 'UONE',
      appId: 'AAPP1',
    });
    const second = await provider.resolveWorkspaceContext({
      teamId: 'TTWO',
      actorUserId: 'UONE',
      appId: 'AAPP1',
    });
    const repo = createOperationRepository(db, provider.assertActive);
    const input = { operationKey: 'save-1', type: 'test', payloadRef: 'entry:1' };
    const session = client.startSession();
    try {
      await assert.rejects(
        session.withTransaction(async () => {
          await repo.enqueue(first, input, session);
          throw new Error('rollback');
        }),
        /rollback/,
      );
    } finally {
      await session.endSession();
    }
    assert.equal(await db.collection('operationalJobs').countDocuments({}), 0);
    const receipt = await repo.enqueue(first, input);
    assert.deepEqual(await repo.enqueue(first, input), receipt);
    await assert.rejects(repo.enqueue(first, { ...input, payloadRef: 'entry:2' }), /conflicts/);
    await repo.enqueue(second, input);
    const time = new Date();
    const a = await repo.claim(time, 1000);
    assert.ok(a);
    assert.equal(await repo.reserveDeliverySlot(a, time, 1100), 0);
    assert.ok((await repo.reserveDeliverySlot(a, time, 1100)) >= 1000);
    await repo.deferDeliverySlot(a, new Date(time.getTime() + 5000));
    assert.equal(await repo.reserveDeliverySlot(a, time, 1100), 5000);
    assert.equal((await repo.claim(time, 1000))?.teamId, 'TTWO');
    const recovered = await repo.claim(new Date(time.getTime() + 1001), 1000);
    assert.ok(recovered);
    assert.equal(recovered._id, a._id);
    assert.equal(await repo.finish(a, { status: 'succeeded', resultCode: 'STALE' }), false);
    assert.equal(await repo.finish(recovered, { status: 'succeeded', resultCode: 'OK' }), true);
    const otherRecovered = await repo.claim(new Date(time.getTime() + 2002), 1000);
    assert.equal(otherRecovered?.teamId, 'TTWO');
    assert.equal(await repo.claim(new Date(time.getTime() + 2002), 1000), null);
    await db.collection('installations').updateOne({ _id: 'TONE' }, { $set: { active: false } });
    await assert.rejects(
      repo.enqueue(first, { ...input, operationKey: 'save-2' }),
      /No active installation/,
    );
  } finally {
    await harness.close();
  }
});

test('lost Slack response and expired remote lease never repost', async () => {
  const harness = await openIntegrationDatabase();
  try {
    const { db, client } = harness.connection;
    await provisionOperationIndexes(db);
    await db.collection('installations').insertOne({
      _id: 'TONE',
      teamId: 'TONE',
      appId: 'AAPP1',
      installerUserId: 'UONE',
      active: true,
      botToken: { encrypted: true },
    });
    const provider = createWorkspaceContextProvider(db, client, 'AAPP1');
    const context = await provider.resolveWorkspaceContext({
      teamId: 'TONE',
      actorUserId: 'UONE',
      appId: 'AAPP1',
    });
    const repo = createOperationRepository(db, provider.assertActive);
    let sends = 0;
    const handler = createSlackDeliveryHandler({
      assertActive: async (job) => {
        const installation = await db
          .collection('installations')
          .findOne({ _id: job.teamId, active: true });
        if (!installation) throw new Error('revoked');
      },
      markSending: repo.markSending,
      reserveSlot: repo.reserveDeliverySlot,
      deferSlot: repo.deferDeliverySlot,
      loadIntent: async () => ({ channelId: 'CONE', text: 'summary', mode: 'post', version: 1 }),
      send: async () => {
        sends++;
        throw new Error('response lost');
      },
    });
    const dispatcher = createOperationDispatcher({
      repository: repo,
      handlers: { slack: handler },
    });
    await repo.enqueue(context, { operationKey: 'post-1', type: 'slack', payloadRef: 'entry:1' });
    assert.equal(await dispatcher.runOnce(), true);
    assert.equal(sends, 1);
    assert.equal(await dispatcher.runOnce(), false);
    assert.equal(
      (await db.collection('operationalJobs').findOne({ operationKey: 'post-1' }))?.status,
      'uncertain',
    );
    assert.equal(await repo.resolveUncertain(context, 'post-1', 'CONE:123.456'), true);

    await repo.enqueue(context, { operationKey: 'post-2', type: 'slack', payloadRef: 'entry:2' });
    const claimed = await repo.claim(new Date(), 1000);
    assert.ok(claimed);
    assert.equal(await repo.markSending(claimed), true);
    assert.equal(await repo.claim(new Date(Date.now() + 2000), 1000), null);
    assert.equal(
      (await db.collection('operationalJobs').findOne({ operationKey: 'post-2' }))?.status,
      'uncertain',
    );
    assert.equal(sends, 1);
  } finally {
    await harness.close();
  }
});

test('dispatcher bounds retries and classifies missing or throwing handlers', async () => {
  const now = new Date();
  const base: Operation = {
    _id: '00000000-0000-4000-8000-000000000000',
    schemaVersion: 1,
    teamId: 'TONE',
    regionId: '00000000-0000-4000-8000-000000000001',
    operationKey: 'test',
    type: 'work',
    payloadRef: 'ref',
    status: 'leased',
    attempts: 1,
    availableAt: now,
    leaseId: '00000000-0000-4000-8000-000000000002',
    leaseUntil: new Date(now.getTime() + 30_000),
    createdAt: now,
    updatedAt: now,
  };
  const jobs = [
    base,
    { ...base, attempts: 2 },
    { ...base, type: 'missing' },
    { ...base, type: 'throw' },
  ];
  const outcomes: Array<{ status: string; resultCode: string; availableAt?: Date }> = [];
  const dispatcher = createOperationDispatcher({
    repository: {
      claim: async () => jobs.shift() ?? null,
      finish: async (_job, outcome) => {
        outcomes.push(outcome);
        return true;
      },
    },
    handlers: {
      work: async () => ({ status: 'pending', resultCode: 'SAFE_RETRY', retryAfterMs: 2000 }),
      throw: async () => {
        throw new Error('private payload');
      },
    },
    now: () => now,
    maxAttempts: 2,
  });
  for (let i = 0; i < 4; i++) assert.equal(await dispatcher.runOnce(), true);
  assert.equal(await dispatcher.runOnce(), false);
  assert.equal(outcomes[0]?.availableAt?.getTime(), now.getTime() + 2000);
  assert.deepEqual(
    outcomes.map(({ status, resultCode }) => ({ status, resultCode })),
    [
      { status: 'pending', resultCode: 'SAFE_RETRY' },
      { status: 'failed', resultCode: 'RETRY_EXHAUSTED' },
      { status: 'failed', resultCode: 'UNKNOWN_OPERATION_TYPE' },
      { status: 'uncertain', resultCode: 'HANDLER_OUTCOME_UNKNOWN' },
    ],
  );
});

test('Slack delivery checks current authorization, intent, rate limit and outcome', async () => {
  const now = new Date();
  const job: Operation = {
    _id: '00000000-0000-4000-8000-000000000000',
    schemaVersion: 1,
    teamId: 'TONE',
    regionId: '00000000-0000-4000-8000-000000000001',
    operationKey: 'post',
    type: 'slack',
    payloadRef: 'ref',
    status: 'leased',
    attempts: 1,
    availableAt: now,
    leaseId: '00000000-0000-4000-8000-000000000002',
    leaseUntil: new Date(now.getTime() + 30_000),
    createdAt: now,
    updatedAt: now,
  };
  let active = true;
  let hasIntent = true;
  let slotWait = 0;
  let canSend = true;
  let error: unknown;
  let sent = 0;
  let deferredUntil: Date | undefined;
  const handler = createSlackDeliveryHandler({
    assertActive: async () => {
      if (!active) throw new Error('revoked');
    },
    loadIntent: async () =>
      hasIntent ? { channelId: 'CONE', text: 'safe', mode: 'post', version: 1 } : null,
    reserveSlot: async () => slotWait,
    deferSlot: async (_job, until) => {
      deferredUntil = until;
    },
    markSending: async () => canSend,
    send: async () => {
      sent++;
      if (error) throw error;
      return { channelId: 'CONE', messageTs: '123.456' };
    },
    now: () => now,
  });
  active = false;
  assert.equal((await handler(job)).resultCode, 'INSTALLATION_OR_CONFIG_UNAVAILABLE');
  active = true;
  hasIntent = false;
  assert.equal((await handler(job)).resultCode, 'MESSAGE_INTENT_UNAVAILABLE');
  hasIntent = true;
  slotWait = 3000;
  assert.deepEqual(await handler(job), {
    status: 'pending',
    resultCode: 'INSTALLATION_RATE_LIMIT',
    retryAfterMs: 3000,
  });
  slotWait = 0;
  canSend = false;
  assert.equal((await handler(job)).resultCode, 'LEASE_LOST_BEFORE_SEND');
  canSend = true;
  error = { retryAfter: 2 };
  assert.deepEqual(await handler(job), {
    status: 'pending',
    resultCode: 'SLACK_RATE_LIMIT',
    retryAfterMs: 2000,
  });
  assert.equal(deferredUntil?.getTime(), now.getTime() + 2000);
  error = undefined;
  assert.deepEqual(await handler(job), {
    status: 'succeeded',
    resultCode: 'SLACK_ACCEPTED',
    resultRef: 'CONE:123.456',
  });
  assert.equal(sent, 2);
});
