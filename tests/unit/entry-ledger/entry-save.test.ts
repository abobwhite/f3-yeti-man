import assert from 'node:assert/strict';
import test from 'node:test';
import type { SaveReceipt } from '../../../src/modules/entry-ledger/entry-repository.ts';
import {
  assertEditableEntry,
  assertReceiptMatches,
  assertSaveRetryAllowed,
  assertSeasonEligibility,
  buildSavedEntry,
  configuredAo,
  duplicateEntry,
  parseSaveCommand,
} from '../../../src/modules/entry-ledger/entry-rules.ts';
import { defaultScoringBands } from '../../../src/modules/entry-ledger/scoring.ts';
import { validateWorkoutReference } from '../../../src/modules/entry-ledger/workout-reference.ts';
import type { ReadyConfiguration } from '../../../src/modules/workspace-foundation/configuration.ts';

const aoId = crypto.randomUUID();
const regionId = crypto.randomUUID();
const policyId = crypto.randomUUID();
const seasonId = crypto.randomUUID();
const context = { teamId: 'TONE', regionId, actorUserId: 'UACTOR', installationId: 'TONE' };
const now = new Date('2026-03-01T00:00:00Z');
const raw = {
  reference: {
    aoId,
    localDate: '2026-01-10',
    localStartTime: '05:30',
    timezone: 'UTC',
    paxUserIds: ['UPAX', 'UPAX'],
  },
  temperatureF: '20',
  reason: '  Initial entry  ',
};
const config: ReadyConfiguration = {
  _id: 'TONE',
  teamId: 'TONE',
  regionId,
  regionName: 'Test',
  timezone: 'UTC',
  aos: [{ aoId, name: 'AO', channelId: 'CAO', schedule: { mon: ['05:30'] }, active: true }],
  scoringBands: [...defaultScoringBands],
  automaticBackblastRepliesEnabled: false,
  revision: 1,
  scoringPolicyId: policyId,
  scoringPolicyRevision: 1,
  confirmedBy: 'UADMIN',
  confirmedAt: now,
  fence: 0,
};
const command = parseSaveCommand(raw, 0, 1, 'save');
const facts = validateWorkoutReference(raw.reference, new Set([aoId]), new Set(['UPAX']), now);
function initial() {
  return buildSavedEntry(
    context,
    null,
    facts,
    command.input,
    command.temperatureF,
    config,
    seasonId,
    now,
  );
}

test('save boundary validates versions, operation keys, required facts and strict temperature', () => {
  assert.equal(command.temperatureF, 20);
  assert.equal(command.input.reason, 'Initial entry');
  for (const change of [
    { reason: '' },
    { reason: '   ' },
    { entryId: 'not-an-id' },
    { reference: { ...raw.reference, paxUserIds: [] } },
    { reference: { ...raw.reference, localStartTime: '24:00' } },
    { source: { channelId: 'bad', messageTs: 1, role: 'backblast' } },
  ])
    assert.throws(() => parseSaveCommand({ ...raw, ...change }, 0, 1, 'save'));
  for (const value of ['', '20F', '2e1', '20.0', '121', -41, 1.5, NaN, Infinity])
    assert.throws(() => parseSaveCommand({ ...raw, temperatureF: value }, 0, 1, 'save'));
  for (const version of [-1, 0.5, NaN])
    assert.throws(() => parseSaveCommand(raw, version, 1, 'save'));
  for (const revision of [0, -1, 1.5])
    assert.throws(() => parseSaveCommand(raw, 0, revision, 'save'));
  for (const key of ['', 'x'.repeat(201)]) assert.throws(() => parseSaveCommand(raw, 0, 1, key));
});

test('retry digest binds validated payload and reviewed entry/configuration versions', () => {
  assert.equal(parseSaveCommand({ ...raw }, 0, 1, 'another-key').payloadHash, command.payloadHash);
  assert.equal(
    parseSaveCommand({ ...raw, reason: 'Initial entry' }, 0, 1, 'save').payloadHash,
    command.payloadHash,
  );
  for (const changed of [
    parseSaveCommand({ ...raw, temperatureF: 0 }, 0, 1, 'save'),
    parseSaveCommand(
      { ...raw, reference: { ...raw.reference, paxUserIds: ['UOTHER'] } },
      0,
      1,
      'save',
    ),
    parseSaveCommand(raw, 1, 1, 'save'),
    parseSaveCommand(raw, 0, 2, 'save'),
  ])
    assert.notEqual(changed.payloadHash, command.payloadHash);
  const receipt: SaveReceipt = {
    teamId: 'TONE',
    regionId,
    operationKey: 'save',
    actorUserId: 'UACTOR',
    payloadHash: command.payloadHash,
    entryId: crypto.randomUUID(),
    version: 1,
    outcome: 'saved',
    committedAt: now,
  };
  assert.doesNotThrow(() => assertReceiptMatches(receipt, 'UACTOR', command.payloadHash));
  assert.throws(
    () => assertReceiptMatches(receipt, 'UOTHER', command.payloadHash),
    /OPERATION_KEY_CONFLICT/,
  );
  assert.throws(
    () => assertReceiptMatches(receipt, 'UACTOR', 'different'),
    /OPERATION_KEY_CONFLICT/,
  );
});

test('edit guards require current active record and keep source attachment separate', () => {
  const before = initial();
  const edit = { ...command.input, entryId: before.entryId };
  assert.doesNotThrow(() => assertEditableEntry(null, command.input, 0));
  assert.doesNotThrow(() => assertEditableEntry(before, edit, 1));
  assert.throws(() => assertEditableEntry(null, edit, 0), /NOT_FOUND_OR_FORBIDDEN/);
  assert.throws(
    () => assertEditableEntry({ ...before, status: 'archived' }, edit, 1),
    /ENTRY_ARCHIVED/,
  );
  assert.throws(() => assertEditableEntry(before, edit, 0), /VERSION_CONFLICT/);
  assert.throws(() => assertEditableEntry(null, command.input, 1), /VERSION_CONFLICT/);
  assert.throws(
    () =>
      assertEditableEntry(
        before,
        {
          ...edit,
          source: { channelId: 'CAO', messageTs: '123.456', role: 'backblast', qUserIds: [] },
        },
        1,
      ),
    /SOURCE_ATTACHMENT_REQUIRES_SEPARATE_COMMAND/,
  );
});

test('season eligibility requires a configured interval and consistent region/workout timezone', () => {
  assert.doesNotThrow(() => assertSeasonEligibility({ timezone: 'UTC' }, 'UTC', 'UTC'));
  assert.throws(
    () => assertSeasonEligibility(null, 'UTC', 'UTC'),
    /WORKOUT_OUTSIDE_CONFIGURED_SEASONS/,
  );
  assert.throws(
    () => assertSeasonEligibility({ timezone: 'America/Chicago' }, 'UTC', 'America/Chicago'),
    /WORKOUT_TIMEZONE_CONFLICT/,
  );
  assert.throws(
    () => assertSeasonEligibility({ timezone: 'UTC' }, 'UTC', 'America/Chicago'),
    /WORKOUT_TIMEZONE_CONFLICT/,
  );
});

test('initial collisions return retained identity while edits reject a different identity', () => {
  const before = initial();
  const other = initial();
  assert.equal(duplicateEntry(null, null), null);
  assert.equal(duplicateEntry(before, null), null);
  assert.equal(duplicateEntry(before, before), null);
  assert.equal(duplicateEntry(null, other), other);
  const archived = { ...other, status: 'archived' as const };
  assert.equal(duplicateEntry(null, archived), archived);
  assert.throws(
    () => duplicateEntry(before, other),
    new RegExp(`ENTRY_REFERENCE_CONFLICT:${other.entryId}`),
  );
});

test('new entries derive scoring and identity without trusting caller points or actor fields', () => {
  const input = parseSaveCommand(
    {
      ...raw,
      pointsPerPax: 999,
      createdBy: 'UFORGED',
      source: {
        channelId: 'CAO',
        messageTs: '123.456',
        role: 'backblast',
        qUserIds: ['UQ', 'UQ'],
      },
    },
    0,
    1,
    'save',
  );
  const entry = buildSavedEntry(
    context,
    null,
    facts,
    input.input,
    input.temperatureF,
    config,
    seasonId,
    now,
  );
  assert.notEqual(entry.entryId, initial().entryId);
  assert.equal(entry._id, entry.entryId);
  assert.equal(entry.version, 1);
  assert.equal(entry.status, 'active');
  assert.equal(entry.pointsPerPax, 2);
  assert.equal(entry.scoringPolicyId, policyId);
  assert.equal(entry.generationId, `policy:${policyId}`);
  assert.deepEqual(entry.paxUserIds, ['UPAX']);
  assert.deepEqual(entry.sourceQUserIds, ['UQ']);
  assert.equal(entry.createdBy, 'UACTOR');
  assert.equal(entry.updatedBy, 'UACTOR');
  assert.equal(entry.createdAt, now);
  assert.equal(entry.teamId, context.teamId);
  assert.equal(entry.regionId, regionId);
});

test('Modify replaces facts and scores while retaining original attribution and Q provenance', () => {
  const before = { ...initial(), sourceQUserIds: ['UQ'] };
  const changedFacts = validateWorkoutReference(
    { ...raw.reference, localDate: '2026-02-12', paxUserIds: ['UOTHER'] },
    new Set([aoId]),
    new Set(['UOTHER']),
    now,
  );
  const timestamp = new Date('2026-03-02T00:00:00Z');
  const destination = crypto.randomUUID();
  const entry = buildSavedEntry(
    { ...context, actorUserId: 'UMODIFIER' },
    before,
    changedFacts,
    { ...command.input, entryId: before.entryId },
    0,
    config,
    destination,
    timestamp,
  );
  assert.equal(entry.entryId, before.entryId);
  assert.equal(entry.version, 2);
  assert.equal(entry.seasonId, destination);
  assert.equal(entry.workoutReference.localDate, '2026-02-12');
  assert.deepEqual(entry.paxUserIds, ['UOTHER']);
  assert.equal(entry.temperatureF, 0);
  assert.equal(entry.pointsPerPax, 5);
  assert.equal(entry.createdBy, before.createdBy);
  assert.equal(entry.createdAt, before.createdAt);
  assert.equal(entry.updatedBy, 'UMODIFIER');
  assert.equal(entry.updatedAt, timestamp);
  assert.deepEqual(entry.sourceQUserIds, ['UQ']);
  assert.equal(before.version, 1);
  assert.deepEqual(before.paxUserIds, ['UPAX']);
  const unsafe = {
    ...config,
    scoringBands: [{ minF: -40, maxF: 120, points: Number.MAX_SAFE_INTEGER }],
  };
  assert.throws(
    () =>
      buildSavedEntry(
        context,
        null,
        { ...facts, paxUserIds: ['UPAX', 'UOTHER'] },
        command.input,
        20,
        unsafe,
        seasonId,
        now,
      ),
    /safe integer/,
  );
});

test('AO selection permits active AOs and retained inactive references only', () => {
  assert.equal(configuredAo(config, aoId).channelId, 'CAO');
  assert.throws(() => configuredAo(config, crypto.randomUUID()), /NOT_FOUND_OR_FORBIDDEN/);
  const inactive = { ...config, aos: [{ ...config.aos[0], active: false }] };
  assert.throws(() => configuredAo(inactive, aoId), /NOT_FOUND_OR_FORBIDDEN/);
  assert.equal(configuredAo(inactive, aoId, aoId).aoId, aoId);
  assert.throws(() => configuredAo(inactive, aoId, crypto.randomUUID()), /NOT_FOUND_OR_FORBIDDEN/);
});

test('transaction retries stop at the attempt and time limits', () => {
  assert.doesNotThrow(() => assertSaveRetryAllowed(1, 10_000, 0));
  assert.doesNotThrow(() => assertSaveRetryAllowed(5, 10_000, 10_000));
  assert.throws(() => assertSaveRetryAllowed(6, 10_000, 0), /ENTRY_SAVE_RETRY_REQUIRED/);
  assert.throws(() => assertSaveRetryAllowed(1, 10_000, 10_001), /ENTRY_SAVE_RETRY_REQUIRED/);
});
