import { z } from 'zod';

export type { ScoringBand } from '../../shared/scoring-bands.ts';
export { scoringBandSchema, temperatureSchema } from '../../shared/scoring-bands.ts';

export const workoutReferenceInputSchema = z.object({
  aoId: z.string().min(1),
  paxUserIds: z.array(z.string().regex(/^[A-Z][A-Z0-9]+$/)).min(1),
  localDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  localStartTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  timezone: z.string().min(1),
  offset: z
    .string()
    .regex(/^[+-](?:0\d|1[0-4]):[0-5]\d$/)
    .optional(),
});

export const workoutReferenceSchema = workoutReferenceInputSchema
  .omit({
    paxUserIds: true,
    offset: true,
  })
  .extend({ startAtUtc: z.date(), offset: z.string() });

export type WorkoutReference = z.infer<typeof workoutReferenceSchema>;

export const validatedEntryFactsSchema = z.object({
  workoutReference: workoutReferenceSchema,
  paxUserIds: workoutReferenceInputSchema.shape.paxUserIds,
});

export type ValidatedEntryFacts = z.infer<typeof validatedEntryFactsSchema>;
