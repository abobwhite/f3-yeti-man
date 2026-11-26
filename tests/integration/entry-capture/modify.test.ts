import assert from 'node:assert/strict';
import test from 'node:test';
import type { EntryDraft } from '../../../src/modules/entry-capture/drafts.ts';
import {
  createMessageViews,
  provisionMessageViewIndexes,
} from '../../../src/modules/entry-capture/message-views.ts';
import { createSummaryDelivery } from '../../../src/modules/entry-capture/summary-delivery.ts';
import { createSummaryOutbox } from '../../../src/modules/entry-ledger/summary-outbox.ts';
import { manualDatabase } from '../../fixtures/manual-database.ts';

type Fixture = Awaited<ReturnType<typeof manualDatabase>>;
async function seed(s: Fixture, date = s.values.localDate, pax = ['UPAX']) {
  const receipt = await s.entries.saveEntry(
    s.context,
    {
      reference: {
        ...s.values,
        localDate: date,
        timezone: 'UTC',
        offset: '+00:00',
        paxUserIds: pax,
      },
      temperatureF: 20,
      reason: 'Initial',
      source: {
        channelId: 'CSOURCE',
        messageTs: date === s.values.localDate ? '100.100' : '100.101',
        role: 'backblast',
        qUserIds: ['UQ'],
      },
    },
    0,
    1,
    `initial:${date}`,
  );
  return receipt.entryId;
}
function state(s: Fixture, draft: EntryDraft, values = draft.values) {
  const raw: Record<string, unknown> = s.state({
    ...values,
    paxUserIds: values.paxUserIds.filter((id) => !draft.historicalPaxUserIds?.includes(id)),
  });
  (draft.historicalPaxUserIds ?? []).forEach((_, index) => {
    if (index % 10) return;
    raw[`historical_${index / 10}`] = {
      value: {
        selected_options: draft.historicalPaxUserIds
          ?.slice(index, index + 10)
          .filter((id) => values.paxUserIds.includes(id))
          .map((value) => ({ value })),
      },
    };
  });
  return raw;
}
async function save(s: Fixture, draft: EntryDraft, context = s.context, values = draft.values) {
  const queued = await s.capture.submit(
    context,
    draft._id,
    draft.version,
    state(s, draft, values),
    'VMODIFY',
  );
  return s.capture.process(
    context,
    draft._id,
    queued.operationKey ?? assert.fail('Missing operation key'),
    s.slack,
  );
}
test('two private editors preserve public facts; stale Save requires explicit review and Cancel cannot replay committed state', async () => {
  const s = await manualDatabase();
  try {
    const id = await seed(s);
    const before = await s.entries.getEntry(s.context, id);
    const a = (await s.capture.modify(s.context, id, 'CAO', s.slack)).draft;
    const b = (await s.capture.modify(s.other, id, 'CGENERAL', s.slack)).draft;
    await assert.rejects(s.drafts.get(s.other, a._id), /FORBIDDEN/);
    await assert.rejects(s.capture.modify(s.context, id, 'COTHER', s.slack), /ORIGIN/);
    assert.deepEqual(await s.entries.getEntry(s.context, id), before);
    const first = await save(s, a, s.context, { ...a.values, temperatureF: '10' });
    assert.equal(first.entry.version, 2);
    await assert.rejects(
      save(s, b, s.other, { ...b.values, temperatureF: '-20' }),
      /VERSION_CONFLICT/,
    );
    let retained = await s.drafts.get(s.other, b._id);
    assert.equal(retained.values.temperatureF, '-20');
    assert.equal((await s.capture.reopen(s.other, b._id)).draft.expectedEntryVersion, 1);
    await s.capture.review(s.other, b._id, retained.version, state(s, retained));
    retained = await s.drafts.get(s.other, b._id);
    assert.equal(retained.expectedEntryVersion, 1);
    await assert.rejects(
      s.capture.submit(s.other, b._id, retained.version, state(s, retained), 'V'),
      /REVIEW/,
    );
    await s.capture.review(s.other, b._id, retained.version, state(s, retained));
    retained = await s.drafts.get(s.other, b._id);
    assert.equal(retained.expectedEntryVersion, 2);
    const second = await save(s, retained, s.other);
    assert.equal(second.entry.entryId, id);
    assert.equal(second.entry.createdBy, 'UADMIN');
    assert.equal(second.entry.updatedBy, 'UOTHER');
    assert.deepEqual(second.entry.sourceQUserIds, ['UQ']);
    await s.capture.cancel(s.other, b._id, 1);
    assert.equal((await s.drafts.get(s.other, b._id)).status, 'saved');
    assert.equal(
      (
        await s.entries.findBySource(s.context, {
          channelId: 'CSOURCE',
          messageTs: '100.100',
          role: 'backblast',
        })
      )?.entryId,
      id,
    );
    assert.equal(await s.db.collection('entries').countDocuments({}), 1);
    const cancelled = (await s.capture.modify(s.context, id, 'CAO', s.slack)).draft;
    await s.capture.cancel(s.context, cancelled._id, cancelled.version);
    assert.deepEqual(await s.entries.getEntry(s.context, id), second.entry);
    assert.equal(await s.db.collection('messageOutbox').countDocuments({}), 3);
  } finally {
    await s.harness.close();
  }
});
test('Modify checks config and locks at commit, keeps proposals, and cannot edit archived or expired records', async () => {
  const s = await manualDatabase();
  try {
    const id = await seed(s);
    const draft = (await s.capture.modify(s.context, id, 'CAO', s.slack)).draft;
    await s.db
      .collection('regionConfigurations')
      .updateOne({ teamId: 'TONE' }, { $inc: { revision: 1, fence: 1 } });
    await assert.rejects(
      save(s, draft, s.context, { ...draft.values, temperatureF: '-30' }),
      /CONFIGURATION/,
    );
    let retained = await s.drafts.get(s.context, draft._id);
    assert.equal(retained.values.temperatureF, '-30');
    for (let i = 0; i < 2; i++) {
      await s.capture.review(s.context, draft._id, retained.version, state(s, retained));
      retained = await s.drafts.get(s.context, draft._id);
    }
    const queued = await s.capture.submit(
      s.context,
      draft._id,
      retained.version,
      state(s, retained),
      'V',
    );
    await s.seasons.setSeasonLock(s.context, s.seasonId, true, 1, 'lock', 'Final');
    await assert.rejects(
      s.capture.process(
        s.context,
        draft._id,
        queued.operationKey ?? assert.fail('Missing operation key'),
        s.slack,
      ),
      /LOCKED/,
    );
    await assert.rejects(s.capture.modify(s.context, id, 'CAO', s.slack), /LOCKED/);
    assert.equal((await s.entries.getEntry(s.context, id)).version, 1);
    await s.seasons.setSeasonLock(s.context, s.seasonId, false, 2, 'unlock', 'Reopen');
    const expiring = (await s.capture.modify(s.context, id, 'CAO', s.slack)).draft;
    s.advance();
    await assert.rejects(save(s, expiring), /EXPIRED/);
    await s.db.collection('entries').updateOne({ entryId: id }, { $set: { status: 'archived' } });
    await assert.rejects(s.capture.modify(s.context, id, 'CAO', s.slack), /ARCHIVED/);
    assert.equal(await s.db.collection('entryRevisions').countDocuments({}), 1);
  } finally {
    await s.harness.close();
  }
});
test('committed AO/date correction relocates app-owned inline summary; drafts and Cancel send nothing', async () => {
  const s = await manualDatabase();
  try {
    const id = await seed(s);
    await provisionMessageViewIndexes(s.db);
    const views = createMessageViews(s.db);
    await views.registerInline(s.context, id, { channelId: 'CAO', messageTs: '200.100' });
    const sends: { mode: string; channel: string; text: string }[] = [];
    const delivery = createSummaryDelivery({
      views,
      outbox: createSummaryOutbox(s.db),
      loadState: s.entries.getSummaryState,
      authorizeDestination: async () => {},
      reserveSlot: async () => 0,
      deferSlot: async () => {},
      now: () => s.now,
      slack: async () => ({
        post: async (channel, message) => {
          sends.push({ mode: 'post', channel, text: message.text });
          return { channelId: channel, messageTs: '300.100' };
        },
        update: async (ref, message) => {
          sends.push({ mode: 'update', channel: ref.channelId, text: message.text });
        },
      }),
    });
    await delivery.deliver(s.context, `initial:${s.values.localDate}`);
    sends.length = 0;
    const cancelled = (await s.capture.modify(s.context, id, 'CGENERAL', s.slack)).draft;
    await s.capture.cancel(s.context, cancelled._id, 1);
    assert.equal(sends.length, 0);
    const draft = (await s.capture.modify(s.other, id, 'CGENERAL', s.slack)).draft;
    const result = await save(s, draft, s.other, {
      ...draft.values,
      aoId: s.otherAoId,
      localDate: '2026-11-22',
    });
    assert.equal(sends.length, 0);
    await delivery.deliver(
      s.other,
      result.draft.operationKey ?? assert.fail('Missing operation key'),
    );
    assert.deepEqual(
      sends.map((send) => [send.mode, send.channel]),
      [
        ['post', 'COTHER'],
        ['update', 'CAO'],
      ],
    );
    assert.match(sends[0].text, /2026-11-22/);
    assert.match(sends[0].text, /Last modified by <@UOTHER>/);
    assert.match(sends[1].text, /View current entry/);
    assert.equal((await views.get(s.context, id))?.canonical?.channelId, 'COTHER');
    assert.ok(sends.every((send) => send.channel !== 'CSOURCE'));
    sends.length = 0;
    const next = (await s.capture.modify(s.context, id, 'CGENERAL', s.slack)).draft;
    const movedAgain = await save(s, next, s.context, { ...next.values, aoId: s.aoId });
    await delivery.deliver(s.context, movedAgain.draft.operationKey ?? assert.fail('Missing key'));
    assert.deepEqual(
      sends.map((send) => [send.mode, send.channel]),
      [
        ['post', 'CAO'],
        ['update', 'CAO'],
        ['update', 'COTHER'],
      ],
    );
    assert.ok(sends.slice(1).every((send) => send.text.includes('id=CAO')));
  } finally {
    await s.harness.close();
  }
});
test('historical inactive PAX/AO can be retained or removed; reference collisions never replace another entry', async () => {
  const s = await manualDatabase();
  try {
    const originalInfo = s.slack.users.info;
    s.slack.users.info = async (args) => ({
      ok: true,
      user: { id: args.user, team_id: 'TONE', deleted: false },
    });
    const id = await seed(s, s.values.localDate, ['UPAX', 'UINACTIVE']);
    s.slack.users.info = originalInfo;
    await s.db
      .collection('regionConfigurations')
      .updateOne({ teamId: 'TONE' }, { $set: { 'aos.0.active': false } });
    const draft = (await s.capture.modify(s.context, id, 'CAO', s.slack)).draft;
    const saved = await save(s, draft);
    assert.deepEqual(new Set(saved.entry.paxUserIds), new Set(['UINACTIVE', 'UPAX']));
    const remove = (await s.capture.modify(s.context, id, 'CGENERAL', s.slack)).draft;
    const removed = await save(s, remove, s.context, { ...remove.values, paxUserIds: ['UPAX'] });
    assert.deepEqual(removed.entry.paxUserIds, ['UPAX']);
    await s.db
      .collection('regionConfigurations')
      .updateOne({ teamId: 'TONE' }, { $set: { 'aos.0.active': true } });
    const otherId = await seed(s, '2026-11-22');
    const collision = (await s.capture.modify(s.context, id, 'CGENERAL', s.slack)).draft;
    await assert.rejects(
      save(s, collision, s.context, { ...collision.values, localDate: '2026-11-22' }),
      /ENTRY_REFERENCE_CONFLICT/,
    );
    assert.equal((await s.entries.getEntry(s.context, id)).version, 3);
    assert.equal((await s.entries.getEntry(s.context, otherId)).version, 1);
  } finally {
    await s.harness.close();
  }
});
test('moving between seasons fences the source and destination locks', async () => {
  const s = await manualDatabase();
  try {
    await s.seasons.configureSeason(
      s.context,
      {
        selector: 'test',
        label: 'Test',
        timezone: 'UTC',
        startDate: '2026-11-01',
        endDate: '2026-11-22',
      },
      1,
      'split',
      'Split',
      s.seasonId,
    );
    const destination = await s.seasons.configureSeason(
      s.context,
      {
        selector: 'next',
        label: 'Next',
        timezone: 'UTC',
        startDate: '2026-11-23',
        endDate: '2026-12-31',
      },
      undefined,
      'next',
      'Next',
    );
    const id = await seed(s, '2026-11-20');
    const draft = (await s.capture.modify(s.context, id, 'CGENERAL', s.slack)).draft;
    const queued = await s.capture.submit(
      s.context,
      draft._id,
      1,
      state(s, draft, { ...draft.values, localDate: '2026-11-23' }),
      'V',
    );
    await s.seasons.setSeasonLock(s.context, destination.seasonId, true, 1, 'lock-next', 'Final');
    await assert.rejects(
      s.capture.process(
        s.context,
        draft._id,
        queued.operationKey ?? assert.fail('Missing operation key'),
        s.slack,
      ),
      /LOCKED/,
    );
    await s.seasons.setSeasonLock(
      s.context,
      destination.seasonId,
      false,
      2,
      'unlock-next',
      'Reopen',
    );
    const retained = await s.drafts.get(s.context, draft._id);
    await s.seasons.setSeasonLock(s.context, s.seasonId, true, 2, 'lock-source', 'Final');
    await assert.rejects(save(s, retained), /LOCKED/);
    assert.equal(
      (await s.entries.getEntry(s.context, id)).workoutReference.localDate,
      '2026-11-20',
    );
    await s.seasons.setSeasonLock(s.context, s.seasonId, false, 3, 'unlock-source', 'Reopen');
    const retry = await s.drafts.get(s.context, draft._id);
    const moved = await save(s, retry);
    assert.equal(moved.entry.seasonId, destination.seasonId);
    assert.equal(moved.entry.version, 2);
  } finally {
    await s.harness.close();
  }
});
