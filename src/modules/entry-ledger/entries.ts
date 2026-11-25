import { type ClientSession, type Db, type MongoClient, MongoServerError } from 'mongodb';
import { z } from 'zod';
import {
  type ChannelClient,
  requirePublicLocalDestination,
} from '../workspace-foundation/channels.ts';
import type { ReadyConfiguration } from '../workspace-foundation/configuration.ts';
import { assertWorkspaceContext, type WorkspaceContext } from '../workspace-foundation/context.ts';
import { requireMember, validateNewAttendees } from '../workspace-foundation/members.ts';
import { createEntryRepository, type SaveReceipt, sourceSchema } from './entry-repository.ts';
import {
  assertEditableEntry,
  assertReceiptMatches,
  assertSaveRetryAllowed,
  assertSeasonEligibility,
  buildSavedEntry,
  configuredAo,
  duplicateEntry,
  parseSaveCommand,
} from './entry-rules.ts';
import { fenceOpenSeasons } from './season-fence.ts';
import { createSeasonRepository } from './season-repository.ts';
import { workoutReferenceInputSchema } from './types.ts';
import { validateWorkoutReference } from './workout-reference.ts';

type Dependencies = {
  client: MongoClient;
  db: Db;
  foundation: {
    assertActive(context: WorkspaceContext, session?: ClientSession): Promise<unknown>;
    fenceActive(context: WorkspaceContext, session: ClientSession): Promise<void>;
    assertConfigured(
      context: WorkspaceContext,
      revision?: number,
      session?: ClientSession,
    ): Promise<ReadyConfiguration>;
  };
  slack: ChannelClient;
  now?: () => Date;
};

export function createEntryProvider({
  db,
  client,
  foundation,
  slack,
  now = () => new Date(),
}: Dependencies) {
  const repository = createEntryRepository(db);
  const seasons = createSeasonRepository(db);
  async function authorize(context: WorkspaceContext) {
    assertWorkspaceContext(context);
    await requireMember(context, context.actorUserId, slack, foundation.assertActive);
  }
  return {
    async getEntry(context: WorkspaceContext, entryId: string) {
      await authorize(context);
      const entry = await repository.get(context, z.uuid().parse(entryId));
      if (!entry) throw new Error('NOT_FOUND_OR_FORBIDDEN');
      return entry;
    },
    async findByWorkoutReference(
      context: WorkspaceContext,
      reference: { aoId: string; localDate: string; localStartTime: string },
    ) {
      await authorize(context);
      return repository.byReference(
        context,
        workoutReferenceInputSchema
          .pick({ aoId: true, localDate: true, localStartTime: true })
          .parse(reference),
      );
    },
    async findBySource(context: WorkspaceContext, source: unknown) {
      await authorize(context);
      return repository.bySource(context, sourceSchema.parse(source));
    },
    async saveEntry(
      context: WorkspaceContext,
      raw: unknown,
      expectedVersion: number,
      expectedConfigurationRevision: number,
      operationKey: string,
    ): Promise<SaveReceipt> {
      await authorize(context);
      const { input, temperatureF, payloadHash } = parseSaveCommand(
        raw,
        expectedVersion,
        expectedConfigurationRevision,
        operationKey,
      );
      const committed = await repository.receipt(context, operationKey);
      if (committed) {
        assertReceiptMatches(committed, context.actorUserId, payloadHash);
        return committed;
      }
      const priorEntry = input.entryId ? await repository.get(context, input.entryId) : null;
      await validateNewAttendees(
        context,
        input.reference.paxUserIds,
        priorEntry?.paxUserIds ?? [],
        slack,
        foundation.assertActive,
      );
      const reviewed = await foundation.assertConfigured(context, expectedConfigurationRevision);
      const ao = configuredAo(reviewed, input.reference.aoId, priorEntry?.workoutReference.aoId);
      await requirePublicLocalDestination(
        context,
        ao.channelId,
        context.actorUserId,
        slack,
        foundation.assertActive,
      );
      const session = client.startSession();
      const deadline = Date.now() + 10_000;
      let attempts = 0;
      try {
        return await session.withTransaction(
          async () => {
            assertSaveRetryAllowed(++attempts, deadline, Date.now());
            // No remote calls inside this retryable transaction.
            await foundation.fenceActive(context, session);
            const priorReceipt = await repository.receipt(context, operationKey, session);
            if (priorReceipt) {
              assertReceiptMatches(priorReceipt, context.actorUserId, payloadHash);
              return priorReceipt;
            }
            const config = await foundation.assertConfigured(
              context,
              expectedConfigurationRevision,
              session,
            );
            const before = input.entryId
              ? await repository.get(context, input.entryId, session)
              : null;
            assertEditableEntry(before, input, expectedVersion);
            const facts = validateWorkoutReference(
              input.reference,
              new Set(
                config.aos
                  .filter((item) => item.active || before?.workoutReference.aoId === item.aoId)
                  .map((item) => item.aoId),
              ),
              new Set(input.reference.paxUserIds),
              now(),
            );
            const season = await seasons.byDate(
              context.teamId,
              context.regionId,
              facts.workoutReference.localDate,
              session,
            );
            assertSeasonEligibility(season, config.timezone, facts.workoutReference.timezone);
            if (!season) throw new Error('WORKOUT_OUTSIDE_CONFIGURED_SEASONS');
            await fenceOpenSeasons(
              seasons,
              context,
              [season.seasonId, ...(before ? [before.seasonId] : [])],
              session,
              async () => {},
            );
            const collision =
              (input.source ? await repository.bySource(context, input.source, session) : null) ??
              (await repository.byReference(context, facts.workoutReference, session));
            const timestamp = now();
            const duplicate = duplicateEntry(before, collision);
            if (duplicate) {
              const receipt: SaveReceipt = {
                teamId: context.teamId,
                regionId: context.regionId,
                operationKey,
                actorUserId: context.actorUserId,
                payloadHash,
                entryId: duplicate.entryId,
                version: duplicate.version,
                outcome: 'duplicate',
                committedAt: timestamp,
              };
              await repository.recordReceipt(context, receipt, session);
              return receipt;
            }
            const after = buildSavedEntry(
              context,
              before,
              facts,
              input,
              temperatureF,
              config,
              season.seasonId,
              timestamp,
            );
            const entryId = after.entryId;
            const receipt: SaveReceipt = {
              teamId: context.teamId,
              regionId: context.regionId,
              operationKey,
              actorUserId: context.actorUserId,
              payloadHash,
              entryId,
              version: after.version,
              outcome: 'saved',
              committedAt: timestamp,
            };
            await repository.save(context, before, after, session);
            await repository.recordEffects(
              context,
              before,
              after,
              receipt,
              input.reason,
              ao.channelId,
              input.source,
              session,
            );
            await repository.recordReceipt(context, receipt, session);
            return receipt;
          },
          { maxCommitTimeMS: 5000 },
        );
      } catch (error) {
        if (error instanceof MongoServerError) throw new Error('ENTRY_SAVE_CONFLICT_RETRY');
        throw error;
      } finally {
        await session.endSession();
      }
    },
  };
}
