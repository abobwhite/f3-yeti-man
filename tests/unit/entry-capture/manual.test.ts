import assert from 'node:assert/strict';
import test from 'node:test';
import {
  editorErrorMessage,
  editorView,
  localToday,
  privateStatusView,
  readEditorValues,
  readMetadata,
  refreshDraft,
  scheduleTimes,
  validateSubmission,
} from '../../../src/modules/entry-capture/editor.ts';
import {
  assertEditingDraft,
  captureHelp,
  manualCommandKind,
} from '../../../src/modules/entry-capture/manual-command.ts';
import { manualFixture } from '../../fixtures/manual-entry.ts';

test('manual entry command routes blank/log, configure and help without accepting stray arguments', () => {
  for (const value of ['', 'log', ' LOG ']) assert.equal(manualCommandKind(value), 'capture');
  assert.equal(manualCommandKind(' configure '), 'configure');
  for (const value of ['help', 'unknown', 'log 20', 'leaderboard'])
    assert.equal(manualCommandKind(value), 'help');
  assert.match(captureHelp, /40 points/);
});

test('suggested dates use region timezone and schedules preserve multiple/no-default days', () => {
  const f = manualFixture();
  assert.equal(localToday(new Date('2026-11-23T01:00:00Z'), 'America/Chicago'), '2026-11-22');
  assert.deepEqual(scheduleTimes(f.config, f.aoId, '2026-11-23'), ['05:30']);
  assert.deepEqual(scheduleTimes(f.config, f.aoId, '2026-11-25'), ['05:30', '06:30']);
  assert.deepEqual(scheduleTimes(f.config, f.aoId, '2026-11-24'), []);
  assert.deepEqual(scheduleTimes(f.config, 'foreign', '2026-11-23'), []);
  assert.deepEqual(scheduleTimes(f.config, f.aoId, 'bad'), []);
});

test('full submission state supplies temperature and roster and cannot forge fixed AO', () => {
  const f = manualFixture();
  assert.deepEqual(readEditorValues(f.state(f.values), f.draft), f.values);
  const cleared = {
    ...f.state(f.values),
    date: { manual_field: { selected_date: null } },
    time_0: { manual_field: { selected_time: null } },
  };
  const empty = readEditorValues(cleared, f.draft);
  assert.equal(empty.localDate, '');
  assert.equal(empty.localStartTime, '');
  assert.throws(() => validateSubmission(empty, f.draft, f.config));

  assert.deepEqual(
    readEditorValues(f.state({ ...f.values, temperatureF: '', paxUserIds: [] }), f.draft)
      .paxUserIds,
    [],
  );
  assert.throws(
    () => readEditorValues(f.state({ ...f.values, aoId: f.otherAoId }), f.draft),
    /FIXED_AO/,
  );
  assert.throws(() => readEditorValues({ pax: { value: { selected_users: 'UPAX' } } }, f.draft));
  assert.deepEqual(readMetadata(JSON.stringify({ id: f.draft._id, version: 1 })), {
    id: f.draft._id,
    version: 1,
  });
  for (const value of ['', '{}', '{"id":"foreign","version":1}'])
    assert.throws(() => readMetadata(value));
});

test('untouched defaults follow AO/date changes, missing or ambiguous defaults require a new selection', () => {
  const f = manualFixture();
  const selectable = { ...f.draft, fixedAoId: undefined };
  const changed = refreshDraft(
    selectable,
    { ...f.values, aoId: f.otherAoId },
    'ao',
    f.config,
    f.now,
  );
  assert.equal(changed.values.localStartTime, '06:00');
  assert.equal(changed.timeGeneration, 1);
  for (const date of ['2026-11-24', '2026-11-25']) {
    const ambiguous = refreshDraft(
      f.draft,
      { ...f.values, localDate: date },
      'date',
      f.config,
      f.now,
    );
    assert.equal(ambiguous.values.localStartTime, '');
    assert.equal(ambiguous.timeOrigin, 'required');
    assert.throws(() => validateSubmission(ambiguous.values, ambiguous, f.config), /TIME_REQUIRED/);
  }
  assert.throws(
    () => refreshDraft(selectable, { ...f.values, aoId: 'foreign' }, 'ao', f.config, f.now),
    /AO_NOT_CONFIGURED/,
  );
});

test('user-selected times survive AO/date changes, including explicit selection equal to the original default', () => {
  const f = manualFixture();
  const user = refreshDraft(
    f.draft,
    { ...f.values, localStartTime: '07:00' },
    'time_0',
    f.config,
    f.now,
  );
  assert.equal(user.timeOrigin, 'user');
  const moved = refreshDraft(
    { ...user, fixedAoId: undefined },
    { ...user.values, aoId: f.otherAoId, localDate: '2026-11-25' },
    'date',
    f.config,
    f.now,
  );
  assert.equal(moved.values.localStartTime, '07:00');
  assert.equal(moved.timeGeneration, 0);
  const same = refreshDraft(f.draft, f.values, 'time_0', f.config, f.now);
  assert.equal(
    refreshDraft(same, { ...same.values, localDate: '2026-11-25' }, 'date', f.config, f.now).values
      .localStartTime,
    '05:30',
  );
});

test('server validation rejects empty/invalid rosters, unconfigured AOs, bad times/offsets and noninteger temperatures', () => {
  const f = manualFixture();
  for (const temperatureF of ['-40', '120', '  +020  '])
    assert.doesNotThrow(() => validateSubmission({ ...f.values, temperatureF }, f.draft, f.config));
  for (const temperatureF of ['-41', '121', '20F', '1.5', '', '2e1'])
    assert.throws(() => validateSubmission({ ...f.values, temperatureF }, f.draft, f.config));
  for (const values of [
    { ...f.values, paxUserIds: [] },
    { ...f.values, paxUserIds: ['bad id'] },
    { ...f.values, offset: 'bad' },
    { ...f.values, localStartTime: '24:00' },
    { ...f.values, localDate: 'invalid' },
  ])
    assert.throws(() => validateSubmission(values, f.draft, f.config));
  assert.throws(
    () => validateSubmission({ ...f.values, aoId: f.otherAoId }, f.draft, f.config),
    /FIXED_AO/,
  );
  assert.throws(
    () =>
      validateSubmission(
        { ...f.values, aoId: 'foreign' },
        { ...f.draft, fixedAoId: undefined },
        f.config,
      ),
    /AO_NOT_CONFIGURED/,
  );
});

test('draft lifecycle rejects expired, cancelled, queued and stale actions', () => {
  const f = manualFixture();
  assert.doesNotThrow(() => assertEditingDraft(f.draft, 1, f.now));
  assert.throws(() => assertEditingDraft(f.draft, 2, f.now), /VERSION/);
  assert.throws(() => assertEditingDraft(f.draft, 1, f.draft.expiresAt), /EXPIRED/);
  for (const status of ['cancelled', 'queued', 'saved'] as const)
    assert.throws(() => assertEditingDraft({ ...f.draft, status }, 1, f.now), /VERSION/);
});

test('editor uses private modal widgets, fixed text and finite configured options without truncating PAX', () => {
  const f = manualFixture();
  const fixed = editorView(f.draft, f.config);
  assert.match(JSON.stringify(fixed), /2 points per PAX/);
  assert.equal(fixed.type, 'modal');
  assert.equal(fixed.notify_on_close, true);
  assert.equal(
    fixed.blocks.some((block) => block.type === 'input' && block.block_id === 'ao'),
    false,
  );
  const selectable = editorView(
    {
      ...f.draft,
      fixedAoId: undefined,
      values: { ...f.values, aoId: '', paxUserIds: ['UPAX', 'UOTHER'] },
    },
    f.config,
  );
  const serialized = JSON.stringify(selectable);
  for (const widget of [
    'static_select',
    'datepicker',
    'timepicker',
    'plain_text_input',
    'multi_users_select',
  ])
    assert.ok(serialized.includes(widget));
  assert.ok(serialized.includes('UOTHER'));
  assert.match(
    JSON.stringify(
      editorView({ ...f.draft, errorCode: 'CONFIGURATION_REVISION_CONFLICT' }, f.config),
    ),
    /Review current settings/,
  );
  assert.throws(() => editorView(f.draft, { ...f.config, aos: [] }), /AO_CONFIGURATION_LIMIT/);
  assert.match(editorErrorMessage('SEASON_LOCKED'), /locked/);
  assert.match(editorErrorMessage('DRAFT_EXPIRED'), /expired/);
  assert.match(editorErrorMessage('NOT_FOUND_OR_FORBIDDEN'), /membership/);
  assert.match(editorErrorMessage('future workout'), /date\/time/);
  assert.equal('submit' in privateStatusView('Saved'), false);
});
