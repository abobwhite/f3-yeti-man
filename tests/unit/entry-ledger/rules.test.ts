import assert from 'node:assert/strict';
import test from 'node:test';
import {
  defaultScoringBands,
  hasEarnedPatch,
  parseTemperature,
  pointsForTemperature,
  qualifyingDates,
  sumPoints,
  validateScoringBands,
} from '../../../src/modules/entry-ledger/scoring.ts';
import { validateWorkoutReference } from '../../../src/modules/entry-ledger/workout-reference.ts';

test('default and custom policies score every supported Fahrenheit integer', () => {
  const defaults = validateScoringBands(defaultScoringBands);
  const custom = validateScoringBands([
    { minF: 10, maxF: 120, points: 0 },
    { minF: -40, maxF: 9, points: 17 },
  ]);
  for (let temperature = -40; temperature <= 120; temperature++) {
    const expected =
      temperature <= 0
        ? 5
        : temperature <= 10
          ? 4
          : temperature <= 18
            ? 3
            : temperature <= 25
              ? 2
              : temperature <= 32
                ? 1
                : 0;
    assert.equal(pointsForTemperature(temperature, defaults), expected);
    assert.equal(pointsForTemperature(temperature, custom), temperature < 10 ? 17 : 0);
  }
  assert.equal(parseTemperature('  +020  '), 20);
  for (const input of [
    '',
    ' ',
    '2°F',
    '2.0',
    '2e1',
    'NaN',
    'Infinity',
    '-41',
    '121',
    -41,
    121,
    1.5,
    NaN,
    Infinity,
    null,
  ]) {
    assert.throws(() => parseTemperature(input));
  }
});

test('policy partitions reject gaps, overlaps and unsafe values', () => {
  const base = [
    { minF: -40, maxF: 0, points: 1 },
    { minF: 1, maxF: 120, points: 0 },
  ];
  assert.throws(() => validateScoringBands([{ ...base[0], maxF: -1 }, base[1]]), /gap/);
  assert.throws(() => validateScoringBands([base[0], { ...base[1], minF: 0 }]), /overlap/);
  assert.throws(() => validateScoringBands([{ ...base[0], maxF: -41 }, base[1]]));
  assert.throws(() => validateScoringBands([{ ...base[0], points: -1 }, base[1]]));
  assert.throws(() => validateScoringBands([{ ...base[0], points: 1.5 }, base[1]]));
  assert.throws(() =>
    validateScoringBands([{ ...base[0], points: Number.MAX_SAFE_INTEGER + 1 }, base[1]]),
  );
  assert.equal(sumPoints([2, 2, 0]), 4);
  assert.throws(() => sumPoints([Number.MAX_SAFE_INTEGER, 1]), /safe integer/);
});

test('positive points qualify each local date once and patch starts at 40', () => {
  assert.deepEqual(
    qualifyingDates([
      { localDate: '2026-12-02', points: 0, status: 'active' },
      { localDate: '2026-12-01', points: 2, status: 'active' },
      { localDate: '2026-12-01', points: 2, status: 'active' },
      { localDate: '2026-12-02', points: 1, status: 'active' },
      { localDate: '2026-12-03', points: 5, status: 'archived' },
    ]),
    ['2026-12-01', '2026-12-02'],
  );
  assert.equal(hasEarnedPatch(39), false);
  assert.equal(hasEarnedPatch(40), true);
  assert.equal(hasEarnedPatch(41), true);
});

const aoIds = new Set(['ao-1']);
const paxIds = new Set(['U123', 'U456']);
const baseReference = {
  aoId: 'ao-1',
  paxUserIds: ['U123', 'U123', 'U456'],
  localDate: '2024-02-29',
  localStartTime: '06:00',
  timezone: 'America/Chicago',
};

test('workout reference keeps local facts and resolves a UTC instant independently of submission time', () => {
  const reference = validateWorkoutReference(
    baseReference,
    aoIds,
    paxIds,
    new Date('2024-02-29T12:00:00Z'),
  );
  assert.deepEqual(reference.paxUserIds, ['U123', 'U456']);
  assert.equal(reference.workoutReference.startAtUtc.toISOString(), '2024-02-29T12:00:00.000Z');
  assert.equal(reference.workoutReference.offset, '-06:00');
  assert.equal('externalReference' in reference.workoutReference, false);
  assert.equal('createdAt' in reference.workoutReference, false);
  assert.throws(
    () => validateWorkoutReference(baseReference, aoIds, paxIds, new Date('2024-02-29T11:59:59Z')),
    /future/,
  );
  const midnight = validateWorkoutReference(
    { ...baseReference, localDate: '2024-03-01', localStartTime: '00:15' },
    aoIds,
    paxIds,
    new Date('2024-03-01T12:00:00Z'),
  );
  assert.equal(midnight.workoutReference.startAtUtc.toISOString(), '2024-03-01T06:15:00.000Z');
  const tokyo = validateWorkoutReference(
    { ...baseReference, timezone: 'Asia/Tokyo', localDate: '2024-03-01', localStartTime: '00:15' },
    aoIds,
    paxIds,
    new Date('2024-02-29T15:15:00Z'),
  );
  assert.equal(tokyo.workoutReference.startAtUtc.toISOString(), '2024-02-29T15:15:00.000Z');
});

test('reference validation rejects invalid identity, calendar and DST time', () => {
  const now = new Date('2025-01-01T00:00:00Z');
  for (const change of [
    { aoId: 'foreign' },
    { aoId: '' },
    { paxUserIds: [] },
    { paxUserIds: ['U999'] },
    { paxUserIds: ['bad id'] },
    { localDate: '2023-02-29' },
    { localDate: '2024-13-01' },
    { localStartTime: '24:00' },
    { timezone: 'Mars/Olympus' },
  ])
    assert.throws(() =>
      validateWorkoutReference({ ...baseReference, ...change }, aoIds, paxIds, now),
    );

  assert.throws(
    () =>
      validateWorkoutReference(
        { ...baseReference, localDate: '2024-03-10', localStartTime: '02:30' },
        aoIds,
        paxIds,
        now,
      ),
    /does not exist/,
  );
  const repeated = { ...baseReference, localDate: '2024-11-03', localStartTime: '01:30' };
  assert.throws(() => validateWorkoutReference(repeated, aoIds, paxIds, now), /ambiguous/);
  assert.equal(
    validateWorkoutReference(
      { ...repeated, offset: '-05:00' },
      aoIds,
      paxIds,
      now,
    ).workoutReference.startAtUtc.toISOString(),
    '2024-11-03T06:30:00.000Z',
  );
  assert.equal(
    validateWorkoutReference(
      { ...repeated, offset: '-06:00' },
      aoIds,
      paxIds,
      now,
    ).workoutReference.startAtUtc.toISOString(),
    '2024-11-03T07:30:00.000Z',
  );
  assert.throws(
    () => validateWorkoutReference({ ...repeated, offset: '+00:00' }, aoIds, paxIds, now),
    /ambiguous/,
  );
});
