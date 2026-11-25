import assert from 'node:assert/strict';
import test from 'node:test';
import type {
  createMessageViews,
  MessageView,
} from '../../../src/modules/entry-capture/message-views.ts';
import {
  renderSummary,
  type SummaryState,
  savedConfirmation,
  summaryLink,
} from '../../../src/modules/entry-capture/summary.ts';
import {
  createSummaryDelivery,
  retryDelay,
} from '../../../src/modules/entry-capture/summary-delivery.ts';
import type { SummaryJob } from '../../../src/modules/entry-ledger/summary-outbox.ts';

const entryId = crypto.randomUUID();
const regionId = crypto.randomUUID();
const now = new Date('2026-11-01T00:00:00Z');
export function summaryFixture(): SummaryState {
  return {
    aoName: 'AO <test>',
    channelId: 'CAO',
    locked: false,
    warnings: ['Unresolved <name>'],
    entry: {
      _id: entryId,
      entryId,
      schemaVersion: 1,
      teamId: 'TONE',
      regionId,
      seasonId: crypto.randomUUID(),
      workoutReference: {
        aoId: crypto.randomUUID(),
        localDate: '2026-10-01',
        localStartTime: '05:30',
        timezone: 'UTC',
        offset: '+00:00',
        startAtUtc: now,
      },
      temperatureF: 20,
      pointsPerPax: 2,
      paxUserIds: ['UPAX'],
      sourceQUserIds: ['UQ'],
      status: 'active',
      version: 2,
      scoringPolicyId: crypto.randomUUID(),
      scoringPolicyRevision: 1,
      generationId: 'published',
      createdBy: 'UORIGINAL',
      createdAt: now,
      updatedBy: 'UMODIFIER',
      updatedAt: now,
    },
  };
}

test('summary includes complete fallback content and safe Modify identity', () => {
  const state = summaryFixture();
  const summary = renderSummary(state);
  for (const text of [
    'AO &lt;test&gt;',
    '2026-10-01',
    '05:30 UTC',
    '20°F',
    '2 points per PAX',
    '<@UPAX>',
    '<@UORIGINAL>',
    '<@UMODIFIER>',
    'Source Qs: <@UQ>',
    'Unresolved &lt;name&gt;',
  ])
    assert.ok(summary.text.includes(text), text);
  const last = summary.blocks.at(-1);
  assert.equal(last?.type, 'actions');
  if (last?.type === 'actions') assert.equal(last.elements[0].value, entryId);
  assert.equal(
    renderSummary({ ...state, locked: true }).blocks.some((block) => block.type === 'actions'),
    false,
  );
  assert.match(renderSummary({ ...state, locked: true }).text, /Season locked/);
  assert.match(
    renderSummary({ ...state, entry: { ...state.entry, status: 'archived', sourceQUserIds: [] } })
      .text,
    /Archived/,
  );
  assert.equal(
    renderSummary({ ...state, entry: { ...state.entry, status: 'archived' } }).blocks.some(
      (block) => block.type === 'actions',
    ),
    false,
  );
});

test('large rosters split sections while oversized messages reject before delivery', () => {
  const state = summaryFixture();
  const many = {
    ...state,
    entry: { ...state.entry, paxUserIds: Array.from({ length: 600 }, (_, i) => `U${i}`) },
  };
  const message = renderSummary(many);
  for (const block of message.blocks)
    if (block.type === 'section') assert.ok(block.text.text.length <= 3000);
  assert.throws(
    () => renderSummary({ ...state, warnings: ['x'.repeat(40000)] }),
    /SUMMARY_TOO_LARGE/,
  );
  assert.match(savedConfirmation().text, /Saved; message update pending/);
  assert.match(savedConfirmation(summaryLink('TONE', 'CAO', '123.456')).text, /View entry/);
  assert.equal(savedConfirmation().response_type, 'ephemeral');
});

test('retry classification honors bounded Retry-After and treats other outcomes as unknown', () => {
  assert.equal(retryDelay({ retryAfter: '2' }), 2000);
  assert.equal(retryDelay({ retryAfter: 999 }), 300000);
  for (const error of [null, new Error('timeout'), { retryAfter: 0 }, { retryAfter: 'no' }])
    assert.equal(retryDelay(error), null);
});

function harness() {
  const state = summaryFixture();
  const context = { teamId: 'TONE', regionId, actorUserId: 'UMODIFIER', installationId: 'TONE' };
  let view: MessageView = {
    _id: 'view',
    teamId: 'TONE',
    regionId,
    entryId,
    status: 'idle',
    previous: [],
    version: 0,
  };
  const outcomes: string[] = [];
  const calls: string[] = [];
  let error: unknown;
  let wait = 0;
  let loadError = false;
  const job: SummaryJob = {
    teamId: 'TONE',
    regionId,
    operationKey: 'job',
    entryId,
    desiredRevision: 1,
    destination: 'COLD',
    kind: 'entry-summary',
    status: 'leased',
    createdAt: now,
    attempts: 1,
  };
  const views = {
    async get() {
      return view;
    },
    async claim() {
      if (view.status !== 'idle') return null;
      view = { ...view, status: 'leased', leaseId: crypto.randomUUID() };
      return { ...view };
    },
    async markSending() {
      view.status = 'sending';
      return true;
    },
    async checkpoint(
      _c: unknown,
      _v: unknown,
      canonical: MessageView['canonical'],
      previous: MessageView['previous'],
      version: number,
    ) {
      Object.assign(view, { canonical, previous, version });
    },
    async release(_c: unknown, original: MessageView, status: MessageView['status']) {
      if (view.leaseId === original.leaseId) {
        view.status = status;
        delete view.leaseId;
      }
    },
  } as unknown as ReturnType<typeof createMessageViews>;
  const delivery = createSummaryDelivery({
    views,
    now: () => now,
    outbox: {
      async claim() {
        return job;
      },
      async finish(_c, _j, status) {
        outcomes.push(status);
      },
    },
    async loadState() {
      if (loadError) throw new Error('setup');
      calls.push('load');
      return state;
    },
    async authorizeDestination(_c, channel) {
      calls.push(`authorize:${channel}`);
    },
    async deferSlot(_context, until) {
      calls.push(`defer:${until.getTime() - now.getTime()}`);
    },
    async reserveSlot() {
      return wait;
    },
    async slack() {
      return {
        async post(channel, message) {
          calls.push(`post:${channel}:${message.text.includes('2 points')}`);
          if (error) throw error;
          return { channelId: channel, messageTs: '123.456' };
        },
        async update(reference, message) {
          calls.push(`update:${reference.channelId}:${message.text.startsWith('Entry moved')}`);
          if (error) throw error;
        },
      };
    },
  });
  return {
    state,
    context,
    delivery,
    calls,
    outcomes,
    view: () => view,
    setError(value: unknown) {
      error = value;
    },
    setWait(value: number) {
      wait = value;
    },
    setLoadError() {
      loadError = true;
    },
  };
}

test('delivery reloads current state and destination and refreshes canonical views in place', async () => {
  const h = harness();
  await h.delivery.deliver(h.context, 'job');
  assert.ok(h.calls.includes('post:CAO:true'));
  assert.equal(h.view().version, 2);
  assert.deepEqual(h.outcomes, ['succeeded']);
  await h.delivery.deliver(h.context, 'older-job');
  assert.equal(h.calls.filter((call) => call.startsWith('post')).length, 1);
  assert.ok(h.calls.includes('update:CAO:false'));
  assert.match((await h.delivery.confirmation(h.context, entryId)).text, /View entry/);
});

test('AO relocation checkpoints new canonical and replaces old view with current-entry link', async () => {
  const h = harness();
  h.view().canonical = { channelId: 'COLD', messageTs: '111.222' };
  await h.delivery.deliver(h.context, 'move');
  assert.equal(h.view().canonical?.channelId, 'CAO');
  assert.ok(h.calls.includes('update:COLD:true'));
  assert.deepEqual(h.view().previous, []);
});

test('rate limits retry safely, unknown post outcome blocks blind reposting', async () => {
  const rate = harness();
  rate.setError({ retryAfter: 2 });
  await rate.delivery.deliver(rate.context, 'rate');
  assert.deepEqual(rate.outcomes, ['pending']);
  assert.ok(rate.calls.includes('defer:2000'));
  assert.equal(rate.view().status, 'idle');
  const unknown = harness();
  unknown.setError(new Error('Lost response'));
  await unknown.delivery.deliver(unknown.context, 'uncertain');
  assert.equal(unknown.view().status, 'uncertain');
  assert.deepEqual(unknown.outcomes, ['uncertain']);
  await unknown.delivery.deliver(unknown.context, 'retry');
  assert.equal(unknown.calls.filter((call) => call.startsWith('post')).length, 1);
  assert.match((await unknown.delivery.confirmation(unknown.context, entryId)).text, /pending/);
});

test('preflight failures, installation pacing and fixed-AO mismatch initiate no remote send', async () => {
  for (const scenario of ['setup', 'rate', 'fixed']) {
    const h = harness();
    if (scenario === 'setup') h.setLoadError();
    if (scenario === 'rate') h.setWait(1100);
    if (scenario === 'fixed') h.view().fixedChannelId = 'COTHER';
    await h.delivery.deliver(h.context, scenario);
    assert.deepEqual(h.outcomes, ['pending']);
    assert.equal(
      h.calls.some((call) => call.startsWith('post') || call.startsWith('update')),
      false,
    );
    assert.equal(h.view().status, 'idle');
    if (scenario === 'setup')
      assert.match(
        (await h.delivery.confirmation(h.context, entryId)).text,
        /Saved; message update pending/,
      );
  }
});

test('summary worker prevents overlapping runs, reports failures and stops cleanly', async (t) => {
  const { startSummaryWorker } = await import(
    '../../../src/modules/entry-capture/summary-delivery.ts'
  );
  t.mock.timers.enable({ apis: ['setInterval'] });
  let calls = 0;
  let errors = 0;
  let release: () => void = () => {};
  const stop = startSummaryWorker(
    async () => {
      calls++;
      if (calls === 1)
        await new Promise<void>((resolve) => {
          release = resolve;
        });
      else throw new Error('unavailable');
    },
    () => {
      errors++;
    },
  );
  t.mock.timers.tick(1000);
  assert.equal(calls, 1);
  t.mock.timers.tick(1000);
  assert.equal(calls, 1);
  release();
  await new Promise<void>((resolve) => setImmediate(resolve));
  t.mock.timers.tick(1000);
  await new Promise<void>((resolve) => setImmediate(resolve));
  assert.equal(calls, 2);
  assert.equal(errors, 1);
  stop();
  t.mock.timers.tick(1000);
  assert.equal(calls, 2);
});
