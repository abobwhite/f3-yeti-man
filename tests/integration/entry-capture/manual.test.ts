import assert from 'node:assert/strict';
import test from 'node:test';
import { manualDatabase } from '../../fixtures/manual-database.ts';

test('manual draft is gated and never opens capture or writes facts before setup', async () => {
  const s = await manualDatabase(false);
  try {
    await assert.rejects(s.capture.open(s.context, 'CAO', s.slack), /SETUP_REQUIRED/);
    assert.equal(await s.db.collection('entryDrafts').countDocuments({}), 0);
    assert.equal(await s.db.collection('entries').countDocuments({}), 0);
  } finally {
    await s.harness.close();
  }
});

test('AO origin fixes the AO; Save durably queues before worker validates and commits once', async () => {
  const s = await manualDatabase();
  try {
    const { draft, view } = await s.capture.open(s.context, 'CAO', s.slack);
    assert.equal(draft.fixedAoId, s.aoId);
    assert.equal(view.type, 'modal');
    assert.equal(draft.values.localStartTime, '05:30');
    assert.equal(draft.values.temperatureF, '');
    assert.equal(await s.db.collection('messageOutbox').countDocuments({}), 0);
    await assert.rejects(
      s.capture.submit(
        s.context,
        draft._id,
        1,
        s.state({ ...s.values, aoId: s.otherAoId }),
        'VMODAL',
      ),
      /FIXED_AO/,
    );
    const queued = await s.capture.submit(
      s.context,
      draft._id,
      1,
      s.state({ ...s.values, temperatureF: '-40' }),
      'VMODAL',
    );
    assert.equal(await s.db.collection('entries').countDocuments({}), 0);
    assert.equal(
      await s.db.collection('operationalJobs').countDocuments({ type: 'manual-entry-save' }),
      1,
    );
    assert.ok(queued.operationKey);
    const saved = await s.capture.process(s.context, queued._id, queued.operationKey, s.slack);
    assert.equal(saved.entry.temperatureF, -40);
    assert.equal(saved.entry.paxUserIds.length, 1);
    assert.equal(await s.db.collection('entries').countDocuments({}), 1);
    assert.equal(await s.db.collection('messageOutbox').countDocuments({}), 1);
    await s.capture.process(s.context, queued._id, queued.operationKey, s.slack);
    assert.equal(await s.db.collection('entryRevisions').countDocuments({}), 1);
    await s.capture.cancel(s.context, draft._id, 1);
    assert.equal((await s.drafts.get(s.context, draft._id)).status, 'saved');
  } finally {
    await s.harness.close();
  }
});

test('non-AO origin requires finite AO selection and preserves user time across date and AO changes', async () => {
  const s = await manualDatabase();
  try {
    const { draft } = await s.capture.open(s.context, 'CGENERAL', s.slack);
    assert.equal(draft.fixedAoId, undefined);
    assert.equal(draft.values.aoId, '');
    await assert.rejects(
      s.capture.submit(s.context, draft._id, 1, s.state({ ...s.values, aoId: '' }), 'VMODAL'),
      /AO_NOT_CONFIGURED/,
    );
    await s.capture.change(s.context, draft._id, 1, s.state(s.values), 'ao');
    let changed = await s.drafts.get(s.context, draft._id);
    await s.capture.change(
      s.context,
      draft._id,
      changed.version,
      s.state({ ...changed.values, localStartTime: '07:00' }, changed.timeGeneration),
      `time_${changed.timeGeneration}`,
    );
    changed = await s.drafts.get(s.context, draft._id);
    await s.capture.change(
      s.context,
      draft._id,
      changed.version,
      s.state(
        { ...changed.values, aoId: s.otherAoId, localDate: '2026-11-22' },
        changed.timeGeneration,
      ),
      'date',
    );
    changed = await s.drafts.get(s.context, draft._id);
    assert.equal(changed.values.localStartTime, '07:00');
    assert.equal(changed.values.temperatureF, '20');
    const queued = await s.capture.submit(
      s.context,
      changed._id,
      changed.version,
      s.state({ ...changed.values, temperatureF: '120' }, changed.timeGeneration),
      'VMODAL',
    );
    assert.ok(queued.operationKey);
    const saved = await s.capture.process(s.context, queued._id, queued.operationKey, s.slack);
    assert.equal(saved.entry.temperatureF, 120);
    assert.equal(saved.entry.workoutReference.aoId, s.otherAoId);
  } finally {
    await s.harness.close();
  }
});

test('drafts bind actor, expiry, cancel and submitted state; invalid and foreign rosters cannot earn credit', async () => {
  const s = await manualDatabase();
  try {
    const { draft } = await s.capture.open(s.context, 'CAO', s.slack);
    await assert.rejects(s.drafts.get(s.other, draft._id), /FORBIDDEN/);
    for (const temperatureF of ['-41', '121', '20F', '1.5', '2e1'])
      await assert.rejects(
        s.capture.submit(s.context, draft._id, 1, s.state({ ...s.values, temperatureF }), 'VMODAL'),
      );
    await assert.rejects(
      s.capture.submit(s.context, draft._id, 1, s.state({ ...s.values, paxUserIds: [] }), 'VMODAL'),
    );
    for (const user of ['UFOREIGN', 'UBOT', 'UINACTIVE']) {
      const current = await s.drafts.get(s.context, draft._id);
      const queued = await s.capture.submit(
        s.context,
        current._id,
        current.version,
        s.state({ ...s.values, paxUserIds: [user] }),
        'VMODAL',
      );
      assert.ok(queued.operationKey);
      await assert.rejects(
        s.capture.process(s.context, queued._id, queued.operationKey, s.slack),
        /eligible local/,
      );
      const failed = await s.drafts.get(s.context, draft._id);
      assert.equal(failed.status, 'editing');
      assert.deepEqual(failed.values.paxUserIds, [user]);
    }
    const current = await s.drafts.get(s.context, draft._id);
    await s.capture.cancel(s.context, current._id, current.version);
    await assert.rejects(
      s.capture.submit(s.context, current._id, current.version, s.state(s.values), 'VMODAL'),
      /VERSION/,
    );
    const expiring = await s.capture.open(s.context, 'CAO', s.slack);
    s.advance();
    await assert.rejects(
      s.capture.submit(s.context, expiring.draft._id, 1, s.state(s.values), 'VMODAL'),
      /EXPIRED/,
    );
    assert.equal(await s.db.collection('entries').countDocuments({}), 0);
    assert.equal(await s.db.collection('messageOutbox').countDocuments({}), 0);
  } finally {
    await s.harness.close();
  }
});

test('two actors submitting the same workout converge without replacing attendance', async () => {
  const s = await manualDatabase();
  try {
    const first = await s.capture.open(s.context, 'CAO', s.slack);
    const second = await s.capture.open(s.other, 'CAO', s.slack);
    const a = await s.capture.submit(s.context, first.draft._id, 1, s.state(s.values), 'VONE');
    const b = await s.capture.submit(
      s.other,
      second.draft._id,
      1,
      s.state({ ...s.values, paxUserIds: ['UOTHER'] }),
      'VTWO',
    );
    assert.ok(a.operationKey);
    assert.ok(b.operationKey);
    const outcomes = await Promise.all([
      s.capture.process(s.context, a._id, a.operationKey, s.slack),
      s.capture.process(s.other, b._id, b.operationKey, s.slack),
    ]);
    assert.equal(outcomes[0].entry.entryId, outcomes[1].entry.entryId);
    assert.equal(outcomes.filter((outcome) => outcome.duplicate).length, 1);
    assert.equal(await s.db.collection('entries').countDocuments({}), 1);
    assert.equal(await s.db.collection('entryRevisions').countDocuments({}), 1);
  } finally {
    await s.harness.close();
  }
});

test('queued saves recheck locks/configuration and explicit review preserves proposed values', async () => {
  const s = await manualDatabase();
  try {
    const { draft } = await s.capture.open(s.context, 'CAO', s.slack);
    const queued = await s.capture.submit(s.context, draft._id, 1, s.state(s.values), 'VMODAL');
    assert.ok(queued.operationKey);
    await s.db
      .collection('regionConfigurations')
      .updateOne({ teamId: s.context.teamId }, { $inc: { revision: 1, fence: 1 } });
    await assert.rejects(
      s.capture.process(s.context, draft._id, queued.operationKey, s.slack),
      /CONFIGURATION/,
    );
    const retained = await s.drafts.get(s.context, draft._id);
    assert.deepEqual(retained.values, s.values);
    await s.capture.review(s.context, retained._id, retained.version, s.state(retained.values));
    const reviewed = await s.drafts.get(s.context, retained._id);
    assert.equal(reviewed.errorCode, undefined);
    assert.equal(reviewed.configurationRevision, 2);
    const again = await s.capture.submit(
      s.context,
      reviewed._id,
      reviewed.version,
      s.state(reviewed.values),
      'VMODAL',
    );
    assert.ok(again.operationKey);
    await s.seasons.setSeasonLock(s.context, s.seasonId, true, 1, 'lock', 'Final');
    await assert.rejects(
      s.capture.process(s.context, again._id, again.operationKey, s.slack),
      /LOCKED/,
    );
    assert.equal(await s.db.collection('entries').countDocuments({}), 0);
    assert.equal(await s.db.collection('messageOutbox').countDocuments({}), 0);
  } finally {
    await s.harness.close();
  }
});

test('crash recovery returns committed credit even when configuration changes before draft finalization', async () => {
  const s = await manualDatabase();
  try {
    const { draft } = await s.capture.open(s.context, 'CAO', s.slack);
    const queued = await s.capture.submit(s.context, draft._id, 1, s.state(s.values), 'VMODAL');
    assert.ok(queued.operationKey);
    const saved = await s.capture.process(s.context, queued._id, queued.operationKey, s.slack);
    // Simulate the durable draft state just before finalization after the ledger committed.
    await s.db.collection('entryDrafts').replaceOne({ _id: queued._id }, queued);
    await s.db
      .collection('regionConfigurations')
      .updateOne({ teamId: s.context.teamId }, { $inc: { revision: 1, fence: 1 } });
    const recovered = await s.capture.process(s.context, queued._id, queued.operationKey, s.slack);
    assert.equal(recovered.entry.entryId, saved.entry.entryId);
    assert.equal(recovered.draft.status, 'saved');
    assert.equal(await s.db.collection('entryRevisions').countDocuments({}), 1);
    assert.equal(await s.db.collection('messageOutbox').countDocuments({}), 1);
    await assert.rejects(s.entries.getSaveReceipt(s.other, queued.operationKey), /FORBIDDEN/);
  } finally {
    await s.harness.close();
  }
});

test('failed durable enqueue rolls back the queued draft and leaves no entry credit', async () => {
  const s = await manualDatabase();
  try {
    const { createManualCapture } = await import(
      '../../../src/modules/entry-capture/manual-command.ts'
    );
    const broken = createManualCapture({
      drafts: s.drafts,
      configuration: s.configuration,
      entries: s.entries,
      assertActive: s.contexts.assertActive,
      now: () => s.now,
      async enqueue(_context, _input, session) {
        assert.equal(session.inTransaction(), true);
        throw new Error('FORCED_ENQUEUE_FAILURE');
      },
    });
    const { draft } = await broken.open(s.context, 'CAO', s.slack);
    await assert.rejects(
      broken.submit(s.context, draft._id, 1, s.state(s.values), 'VMODAL'),
      /FORCED_ENQUEUE_FAILURE/,
    );
    const retained = await s.drafts.get(s.context, draft._id);
    assert.equal(retained.status, 'editing');
    assert.equal(retained.version, 1);
    assert.equal(await s.db.collection('operationalJobs').countDocuments({}), 0);
    assert.equal(await s.db.collection('entries').countDocuments({}), 0);
  } finally {
    await s.harness.close();
  }
});
