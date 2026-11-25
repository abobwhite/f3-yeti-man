import { type ScoringBand, scoringBandSchema, temperatureSchema } from './types.ts';

export const defaultScoringBands: readonly ScoringBand[] = Object.freeze([
  { minF: -40, maxF: 0, points: 5 },
  { minF: 1, maxF: 10, points: 4 },
  { minF: 11, maxF: 18, points: 3 },
  { minF: 19, maxF: 25, points: 2 },
  { minF: 26, maxF: 32, points: 1 },
  { minF: 33, maxF: 120, points: 0 },
]);

export function parseTemperature(input: unknown): number {
  if (typeof input === 'number') return temperatureSchema.parse(input);
  if (typeof input !== 'string' || !/^[+-]?\d+$/.test(input.trim())) {
    throw new RangeError('Enter a whole temperature from -40 to 120°F.');
  }
  return temperatureSchema.parse(Number(input.trim()));
}

export function validateScoringBands(input: unknown): readonly ScoringBand[] {
  const bands = scoringBandSchema
    .array()
    .min(1)
    .parse(input)
    .sort((a, b) => a.minF - b.minF);
  let next = -40;
  for (const band of bands) {
    if (band.minF > band.maxF) throw new RangeError('A scoring band has reversed bounds.');
    if (band.minF !== next) {
      throw new RangeError(
        band.minF < next
          ? `Scoring bands overlap at ${band.minF}°F.`
          : `Scoring bands leave a gap from ${next}°F to ${band.minF - 1}°F.`,
      );
    }
    next = band.maxF + 1;
  }
  if (next !== 121) throw new RangeError(`Scoring bands leave a gap from ${next}°F to 120°F.`);
  return Object.freeze(bands.map((band) => Object.freeze(band)));
}

export function pointsForTemperature(temperature: unknown, bands: readonly ScoringBand[]): number {
  const value = parseTemperature(temperature);
  const band = bands.find(({ minF, maxF }) => value >= minF && value <= maxF);
  if (!band) throw new Error('Scoring configuration does not cover this temperature.');
  return band.points;
}

export function sumPoints(points: readonly number[]): number {
  let total = 0;
  for (const value of points) {
    if (!Number.isSafeInteger(value) || value < 0 || !Number.isSafeInteger(total + value)) {
      throw new RangeError('Scoring total exceeds safe integer limits.');
    }
    total += value;
  }
  return total;
}

export function qualifyingDates(
  attendances: readonly { localDate: string; points: number; status: 'active' | 'archived' }[],
): readonly string[] {
  return [
    ...new Set(
      attendances
        .filter(({ points, status }) => status === 'active' && points > 0)
        .map(({ localDate }) => localDate),
    ),
  ].sort();
}

export function hasEarnedPatch(seasonPoints: number): boolean {
  if (!Number.isSafeInteger(seasonPoints) || seasonPoints < 0) {
    throw new RangeError('Season points must be a nonnegative safe integer.');
  }
  return seasonPoints >= 40;
}
