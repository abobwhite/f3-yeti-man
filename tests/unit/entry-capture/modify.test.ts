import assert from 'node:assert/strict';
import test from 'node:test';
import {
  editorView,
  readEditorValues,
  validateSubmission,
} from '../../../src/modules/entry-capture/editor.ts';
import {
  modifySeed,
  reviewModification,
  verifiedEditOrigin,
} from '../../../src/modules/entry-capture/modify.ts';
import { manualFixture } from '../../fixtures/manual-entry.ts';

function fixture() {
  const f = manualFixture();
  const entry = {
    entryId: crypto.randomUUID(),
    version: 3,
    status: 'active',
    workoutReference: {
      aoId: f.aoId,
      localDate: f.values.localDate,
      localStartTime: '05:30',
      timezone: 'UTC',
    },
    temperatureF: 20,
    paxUserIds: ['UINACTIVE', 'UPAX'],
  };
  return { ...f, entry };
}
test('Modify seeds committed values and versions; channel context fixes only the matching AO', () => {
  const f = fixture();
  const seed = modifySeed(f.entry as never, false, f.config, 'CAO', f.now);
  assert.equal(seed.entryId, f.entry.entryId);
  assert.equal(seed.expectedEntryVersion, 3);
  assert.equal(seed.fixedAoId, f.aoId);
  assert.equal(seed.timeOrigin, 'user');
  assert.deepEqual(seed.values.paxUserIds, f.entry.paxUserIds);
  assert.equal(
    modifySeed(f.entry as never, false, f.config, 'CGENERAL', f.now).fixedAoId,
    undefined,
  );
  assert.throws(() => modifySeed(f.entry as never, false, f.config, 'COTHER', f.now), /ORIGIN/);
  assert.throws(() => modifySeed(f.entry as never, true, f.config, 'CAO', f.now), /LOCKED/);
  assert.throws(
    () => modifySeed({ ...f.entry, status: 'archived' } as never, false, f.config, 'CAO', f.now),
    /ARCHIVED/,
  );
});
test('trusted action origin uses the message container or Home, never an arbitrary modal', () => {
  assert.equal(verifiedEditOrigin({ container: { type: 'message', channel_id: 'CAO' } }), 'CAO');
  assert.equal(verifiedEditOrigin({ container: { type: 'view' }, view: { type: 'home' } }), 'home');
  assert.throws(
    () => verifiedEditOrigin({ channel: { id: 'CAO' }, view: { type: 'modal' } }),
    /ORIGIN/,
  );
});
test('stale review preserves proposals and requires a second explicit action on the displayed versions', () => {
  const f = fixture();
  const draft = {
    ...f.draft,
    fixedAoId: undefined,
    ...modifySeed(f.entry as never, false, f.config, 'CGENERAL', f.now),
    errorCode: 'VERSION_CONFLICT',
  };
  const proposed = { ...draft.values, temperatureF: '-20' };
  const latest = { ...f.entry, version: 4, temperatureF: 40 };
  const preview = reviewModification(draft, proposed, latest as never, f.config);
  assert.equal(preview.expectedEntryVersion, 3);
  assert.match(preview.reviewTarget?.summary ?? '', /40/);
  assert.equal(preview.values.temperatureF, '-20');
  const accepted = reviewModification(preview, proposed, latest as never, f.config);
  assert.equal(accepted.expectedEntryVersion, 4);
  assert.equal(accepted.errorCode, undefined);
  assert.equal(accepted.reviewTarget, undefined);
  const raced = reviewModification(preview, proposed, { ...latest, version: 5 } as never, f.config);
  assert.equal(raced.expectedEntryVersion, 3);
  assert.equal(raced.reviewTarget?.entryVersion, 5);
});
test('historical identities have explicit retain/remove controls; inactive AO may be retained only', () => {
  const f = fixture();
  const draft = {
    ...f.draft,
    fixedAoId: undefined,
    ...modifySeed(f.entry as never, false, f.config, 'CGENERAL', f.now),
  };
  const config = {
    ...f.config,
    aos: f.config.aos.map((ao) => ({ ...ao, active: ao.aoId !== f.aoId })),
  };
  validateSubmission(draft.values, draft, config);
  const view = editorView(draft, config);
  assert.match(JSON.stringify(view), /historical_0/);
  const state = {
    ...f.state({ ...draft.values, paxUserIds: ['UNEW'] }),
    historical_0: { value: { selected_options: [{ value: 'UINACTIVE' }] } },
  };
  assert.deepEqual(readEditorValues(state, draft).paxUserIds, ['UNEW', 'UINACTIVE']);
  assert.deepEqual(
    readEditorValues({ ...state, historical_0: { value: { selected_options: [] } } }, draft)
      .paxUserIds,
    ['UNEW'],
  );
  assert.throws(
    () =>
      readEditorValues(
        { ...state, historical_0: { value: { selected_options: [{ value: 'UFORGED' }] } } },
        draft,
      ),
    /HISTORICAL/,
  );
});

test('channel mapping changes require reopening; historical review blocks remain within Slack limits', () => {
  const f = fixture();
  const draft = {
    ...f.draft,
    fixedAoId: undefined,
    ...modifySeed(f.entry as never, false, f.config, 'CGENERAL', f.now),
  };
  const remapped = {
    ...f.config,
    aos: f.config.aos.map((ao) => (ao.aoId === f.aoId ? { ...ao, channelId: 'CGENERAL' } : ao)),
  };
  assert.throws(() => validateSubmission(draft.values, draft, remapped), /ORIGIN_CHANGED/);
  assert.throws(
    () => reviewModification(draft, draft.values, f.entry as never, remapped),
    /ORIGIN_CHANGED/,
  );
  const paxUserIds = Array.from({ length: 500 }, (_, i) => `ULONGUSER${i}`);
  const large = { ...f.entry, paxUserIds };
  const preview = reviewModification(
    { ...draft, historicalPaxUserIds: paxUserIds, values: { ...draft.values, paxUserIds } },
    { ...draft.values, paxUserIds },
    large as never,
    f.config,
  );
  const view = editorView(preview, f.config);
  assert.ok(view.blocks.length <= 100);
  for (const block of view.blocks) {
    if (block.type === 'section') assert.ok(block.text.text.length <= 3000);
  }
});
