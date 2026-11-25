import { z } from 'zod';

export const temperatureSchema = z.number().int().min(-40).max(120);
export const scoringBandSchema = z.object({
  minF: temperatureSchema,
  maxF: temperatureSchema,
  points: z.number().int().nonnegative().safe(),
});
export type ScoringBand = z.infer<typeof scoringBandSchema>;

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
