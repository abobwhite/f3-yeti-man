import { createHash, randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { ReadyConfiguration } from '../workspace-foundation/configuration.ts';
import type { WorkspaceContext } from '../workspace-foundation/context.ts';
import { type Entry, entrySchema, type SaveReceipt, sourceSchema } from './entry-repository.ts';
import { parseTemperature, pointsForTemperature, sumPoints } from './scoring.ts';
import { type ValidatedEntryFacts, workoutReferenceInputSchema } from './types.ts';

const inputSchema = z.object({
  entryId: z.uuid().optional(),
  reference: workoutReferenceInputSchema,
  temperatureF: z.union([z.number(), z.string()]),
  reason: z.string().trim().min(1).max(500),
  source: sourceSchema.optional(),
});

export function configuredAo(config: ReadyConfiguration, aoId: string, previousAoId?: string) {
  const ao = config.aos.find(
    (item) => item.aoId === aoId && (item.active || previousAoId === item.aoId),
  );
  if (!ao) throw new Error('NOT_FOUND_OR_FORBIDDEN');
  return ao;
}

export function assertSaveRetryAllowed(
  attempt: number,
  deadline: number,
  currentTime: number,
): void {
  if (attempt > 5 || currentTime > deadline) throw new Error('ENTRY_SAVE_RETRY_REQUIRED');
}
export function parseSaveCommand(
  raw: unknown,
  expectedVersion: number,
  expectedConfigurationRevision: number,
  operationKey: string,
) {
  const input = inputSchema.parse(raw);
  z.number().int().nonnegative().parse(expectedVersion);
  z.number().int().positive().parse(expectedConfigurationRevision);
  z.string().min(1).max(200).parse(operationKey);
  const temperatureF = parseTemperature(input.temperatureF);
  const payloadHash = createHash('sha256')
    .update(JSON.stringify({ input, expectedVersion, expectedConfigurationRevision }))
    .digest('hex');
  return { input, temperatureF, payloadHash };
}

export function assertReceiptMatches(
  receipt: SaveReceipt,
  actorUserId: string,
  payloadHash: string,
): void {
  if (receipt.actorUserId !== actorUserId || receipt.payloadHash !== payloadHash)
    throw new Error('OPERATION_KEY_CONFLICT');
}

export function assertEditableEntry(
  before: Entry | null,
  input: ReturnType<typeof parseSaveCommand>['input'],
  expectedVersion: number,
): void {
  if (input.entryId && !before) throw new Error('NOT_FOUND_OR_FORBIDDEN');
  if (before?.status === 'archived') throw new Error('ENTRY_ARCHIVED');
  if ((before?.version ?? 0) !== expectedVersion) throw new Error('VERSION_CONFLICT');
  if (before && input.source) throw new Error('SOURCE_ATTACHMENT_REQUIRES_SEPARATE_COMMAND');
}

export function assertSeasonEligibility(
  season: { timezone: string } | null,
  configTimezone: string,
  workoutTimezone: string,
): void {
  if (!season) throw new Error('WORKOUT_OUTSIDE_CONFIGURED_SEASONS');
  if (season.timezone !== configTimezone || workoutTimezone !== season.timezone)
    throw new Error('WORKOUT_TIMEZONE_CONFLICT');
}

export function duplicateEntry(before: Entry | null, collision: Entry | null): Entry | null {
  if (!collision || collision.entryId === before?.entryId) return null;
  if (before) throw new Error(`ENTRY_REFERENCE_CONFLICT:${collision.entryId}`);
  return collision;
}

export function buildSavedEntry(
  context: WorkspaceContext,
  before: Entry | null,
  facts: ValidatedEntryFacts,
  input: ReturnType<typeof parseSaveCommand>['input'],
  temperatureF: number,
  config: ReadyConfiguration,
  seasonId: string,
  timestamp: Date,
): Entry {
  const entryId = before?.entryId ?? randomUUID();
  const pointsPerPax = pointsForTemperature(temperatureF, config.scoringBands);
  sumPoints(facts.paxUserIds.map(() => pointsPerPax));
  const after = entrySchema.parse({
    _id: entryId,
    schemaVersion: 1,
    teamId: context.teamId,
    regionId: context.regionId,
    entryId,
    seasonId,
    ...facts,
    temperatureF,
    sourceQUserIds: before?.sourceQUserIds ?? [...new Set(input.source?.qUserIds ?? [])],
    pointsPerPax,
    scoringPolicyId: config.scoringPolicyId,
    scoringPolicyRevision: config.scoringPolicyRevision,
    generationId: `policy:${config.scoringPolicyId}`,
    status: 'active',
    version: (before?.version ?? 0) + 1,
    createdBy: before?.createdBy ?? context.actorUserId,
    createdAt: before?.createdAt ?? timestamp,
    updatedBy: context.actorUserId,
    updatedAt: timestamp,
  });
  return after;
}
