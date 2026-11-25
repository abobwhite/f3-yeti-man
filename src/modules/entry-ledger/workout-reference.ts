import {
  type ValidatedEntryFacts,
  validatedEntryFactsSchema,
  workoutReferenceInputSchema,
} from './types.ts';

function utcMillis(year: number, month: number, day: number, hour = 0, minute = 0): number {
  const date = new Date(0);
  date.setUTCFullYear(year, month - 1, day);
  date.setUTCHours(hour, minute, 0, 0);
  return date.getTime();
}

function offsetText(minutes: number): string {
  const sign = minutes < 0 ? '-' : '+';
  const absolute = Math.abs(minutes);
  return `${sign}${String(Math.floor(absolute / 60)).padStart(2, '0')}:${String(absolute % 60).padStart(2, '0')}`;
}

export function validateWorkoutReference(
  input: unknown,
  configuredAoIds: ReadonlySet<string>,
  eligiblePaxUserIds: ReadonlySet<string>,
  now: Date,
): ValidatedEntryFacts {
  const value = workoutReferenceInputSchema.parse(input);
  if (!configuredAoIds.has(value.aoId)) throw new Error('NOT_FOUND_OR_FORBIDDEN');
  if (value.paxUserIds.some((userId) => !eligiblePaxUserIds.has(userId))) {
    throw new Error('NOT_FOUND_OR_FORBIDDEN');
  }
  const [year, month, day] = value.localDate.split('-').map(Number);
  const [hour, minute] = value.localStartTime.split(':').map(Number);
  const localMillis = utcMillis(year, month, day, hour, minute);
  const calendar = new Date(localMillis);
  if (
    year < 1 ||
    calendar.getUTCFullYear() !== year ||
    calendar.getUTCMonth() + 1 !== month ||
    calendar.getUTCDate() !== day
  ) {
    throw new RangeError('Enter a real workout date.');
  }
  if (!Number.isFinite(now.getTime())) throw new RangeError('Current time is invalid.');

  let formatter: Intl.DateTimeFormat;
  try {
    formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: value.timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    });
  } catch {
    throw new RangeError('Enter a valid IANA timezone.');
  }

  const candidates = new Map<number, number>();
  // Offset transitions near the requested local time can yield zero, one or two instants.
  for (
    let sample = localMillis - 36 * 3_600_000;
    sample <= localMillis + 36 * 3_600_000;
    sample += 3_600_000
  ) {
    const parts = Object.fromEntries(
      formatter.formatToParts(sample).map(({ type, value: part }) => [type, part]),
    );
    const offsetMinutes =
      (utcMillis(
        Number(parts.year),
        Number(parts.month),
        Number(parts.day),
        Number(parts.hour),
        Number(parts.minute),
      ) -
        sample) /
      60_000;
    if (!Number.isInteger(offsetMinutes)) continue;
    const instant = localMillis - offsetMinutes * 60_000;
    const actual = Object.fromEntries(
      formatter.formatToParts(instant).map(({ type, value: part }) => [type, part]),
    );
    if (
      Number(actual.year) === year &&
      Number(actual.month) === month &&
      Number(actual.day) === day &&
      Number(actual.hour) === hour &&
      Number(actual.minute) === minute
    )
      candidates.set(instant, offsetMinutes);
  }
  if (candidates.size === 0)
    throw new RangeError('Workout start time does not exist in this timezone.');
  const matching = [...candidates].filter(
    ([, offset]) => !value.offset || offsetText(offset) === value.offset,
  );
  if (matching.length !== 1) {
    throw new RangeError('Select the UTC offset for this ambiguous workout start time.');
  }
  const [instant, offset] = matching[0];
  if (instant > now.getTime()) throw new RangeError('Workout start cannot be in the future.');
  return validatedEntryFactsSchema.parse({
    paxUserIds: [...new Set(value.paxUserIds)],
    workoutReference: {
      aoId: value.aoId,
      localDate: value.localDate,
      localStartTime: value.localStartTime,
      timezone: value.timezone,
      startAtUtc: new Date(instant),
      offset: offsetText(offset),
    },
  });
}
