import { createHash, randomUUID } from 'node:crypto';
import type { ClientSession, Db } from 'mongodb';
import { assertWorkspaceContext, type WorkspaceContext } from '../workspace-foundation/context.ts';
import {
  createSeasonRepository,
  type Season,
  type SeasonInput,
  seasonInputSchema,
  seasonSchema,
} from './season-repository.ts';

type AdminBoundary = {
  assertActive(context: WorkspaceContext, session?: ClientSession): Promise<unknown>;
  requireAdmin(context: WorkspaceContext, session?: ClientSession): Promise<void>;
  withAdminCommit<T>(
    context: WorkspaceContext,
    action: (session: ClientSession) => Promise<T>,
  ): Promise<T>;
};

export function suggestWinterSeason(startYear: number, timezone: string): SeasonInput {
  if (!Number.isInteger(startYear) || startYear < 1000 || startYear > 9998)
    throw new RangeError('Invalid season year.');
  const endYear = startYear + 1;
  const februaryLastDay = new Date(Date.UTC(endYear, 2, 0)).getUTCDate();
  return {
    selector: `${startYear}-${endYear}`,
    label: `${startYear}–${endYear}`,
    startDate: `${startYear}-12-01`,
    endDate: `${endYear}-02-${februaryLastDay}`,
    timezone,
  };
}

function validateInput(input: unknown): SeasonInput {
  const value = seasonInputSchema.parse(input);
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: value.timezone });
  } catch {
    throw new RangeError('Enter a valid IANA timezone.');
  }
  return value;
}

function requireReason(reason: string): string {
  const value = reason.trim();
  if (!value) throw new Error('A reason is required.');
  return value;
}

export function createSeasonProvider(db: Db, admin: AdminBoundary, now = () => new Date()) {
  const repository = createSeasonRepository(db);
  async function read(context: WorkspaceContext) {
    assertWorkspaceContext(context);
    await admin.assertActive(context);
  }
  async function commit(
    context: WorkspaceContext,
    action: 'create' | 'configure' | 'lock' | 'unlock',
    seasonId: string | undefined,
    input: SeasonInput | undefined,
    locked: boolean | undefined,
    expectedVersion: number | undefined,
    operationKey: string,
    reason: string,
  ): Promise<Season> {
    assertWorkspaceContext(context);
    const validReason = requireReason(reason);
    if (!operationKey.trim()) throw new Error('An operation key is required.');
    const payload = createHash('sha256')
      .update(
        JSON.stringify({
          actor: context.actorUserId,
          action,
          seasonId,
          input,
          locked,
          expectedVersion,
          reason: validReason,
        }),
      )
      .digest('hex');
    try {
      return await admin.withAdminCommit(context, async (session) => {
        const priorOperation = await repository.operation(
          context.teamId,
          context.regionId,
          operationKey,
          session,
        );
        if (priorOperation) {
          if (priorOperation.payload !== payload) throw new Error('OPERATION_KEY_CONFLICT');
          return seasonSchema.parse(priorOperation.result);
        }
        const before = seasonId
          ? await repository.get(context.teamId, context.regionId, seasonId, session)
          : null;
        if (seasonId && !before) throw new Error('SEASON_NOT_FOUND');
        if (before && before.version !== expectedVersion) throw new Error('VERSION_CONFLICT');
        if (!before && expectedVersion !== undefined) throw new Error('VERSION_CONFLICT');
        if (action !== 'create' && !before) throw new Error('SEASON_NOT_FOUND');
        if (action === 'create' && before) throw new Error('SEASON_EXISTS');
        if (action === 'configure' && before?.locked) throw new Error('SEASON_LOCKED');
        if (action === 'unlock' && !before?.locked) throw new Error('SEASON_ALREADY_OPEN');
        if (action === 'lock' && before?.locked) throw new Error('SEASON_ALREADY_LOCKED');
        if (action === 'create' || action === 'configure') {
          await repository.fenceCatalog(context.teamId, context.regionId, session);
          if (!input) throw new Error('Season configuration is required.');
          const overlap = await repository.overlap(
            context.teamId,
            context.regionId,
            input.startDate,
            input.endDate,
            seasonId,
            session,
          );
          if (overlap) throw new Error('SEASON_OVERLAP');
          if (before) {
            const excluded = await repository.retainedOutside(
              context.teamId,
              context.regionId,
              before.seasonId,
              input.startDate,
              input.endDate,
              session,
            );
            if (excluded.length)
              throw new Error(
                `SEASON_RETAINED_ENTRIES:${excluded.map((entry) => String(entry.entryId ?? entry._id)).join(',')}`,
              );
          }
        }
        const timestamp = now();
        const id = before?.seasonId ?? randomUUID();
        const after = seasonSchema.parse({
          ...(before ?? {}),
          ...(input ?? {}),
          _id: id,
          teamId: context.teamId,
          regionId: context.regionId,
          seasonId: id,
          locked: locked ?? before?.locked ?? false,
          version: (before?.version ?? 0) + 1,
          mutationFence: (before?.mutationFence ?? 0) + 1,
          createdAt: before?.createdAt ?? timestamp,
          createdBy: before?.createdBy ?? context.actorUserId,
          updatedAt: timestamp,
          updatedBy: context.actorUserId,
        });
        if (before) await repository.update(before, after, session);
        else await repository.insert(after, session);
        await repository.audit(
          {
            teamId: context.teamId,
            regionId: context.regionId,
            seasonId: id,
            version: after.version,
            operationKey,
            action,
            actorUserId: context.actorUserId,
            reason: validReason,
            committedAt: timestamp,
            before,
            after,
          },
          session,
        );
        await repository.saveOperation(
          context.teamId,
          context.regionId,
          operationKey,
          payload,
          after,
          session,
        );
        return after;
      });
    } catch (error) {
      if (error instanceof Error && /E11000/.test(error.message))
        throw new Error('SEASON_SELECTOR_OR_OPERATION_CONFLICT');
      throw error;
    }
  }
  return {
    repository,
    async getSeason(context: WorkspaceContext, selector: string) {
      await read(context);
      return repository.bySelector(context.teamId, context.regionId, selector);
    },
    async findSeasonByDate(context: WorkspaceContext, localDate: string) {
      await read(context);
      return repository.byDate(context.teamId, context.regionId, localDate);
    },
    async listSeasons(context: WorkspaceContext) {
      await read(context);
      return repository.list(context.teamId, context.regionId);
    },
    async rawSeasonReadiness(context: WorkspaceContext) {
      await read(context);
      return (await repository.list(context.teamId, context.regionId)).length > 0;
    },
    async getSeasonLockPreview(context: WorkspaceContext, seasonId: string) {
      assertWorkspaceContext(context);
      await admin.requireAdmin(context);
      const season = await repository.get(context.teamId, context.regionId, seasonId);
      if (!season) throw new Error('SEASON_NOT_FOUND');
      return {
        season,
        ...(await repository.lockCounts(context.teamId, context.regionId, seasonId)),
      };
    },
    configureSeason(
      context: WorkspaceContext,
      input: unknown,
      expectedVersion: number | undefined,
      operationKey: string,
      reason: string,
      seasonId?: string,
    ) {
      return commit(
        context,
        seasonId ? 'configure' : 'create',
        seasonId,
        validateInput(input),
        undefined,
        expectedVersion,
        operationKey,
        reason,
      );
    },
    setSeasonLock(
      context: WorkspaceContext,
      seasonId: string,
      locked: boolean,
      expectedVersion: number,
      operationKey: string,
      reason: string,
    ) {
      return commit(
        context,
        locked ? 'lock' : 'unlock',
        seasonId,
        undefined,
        locked,
        expectedVersion,
        operationKey,
        reason,
      );
    },
  };
}

export type SeasonAdminPanel = {
  list(context: WorkspaceContext): Promise<Season[]>;
  lockPreview: ReturnType<typeof createSeasonProvider>['getSeasonLockPreview'];
  configure: ReturnType<typeof createSeasonProvider>['configureSeason'];
  setLock: ReturnType<typeof createSeasonProvider>['setSeasonLock'];
};

export function registerSeasonAdminPanel(
  register: (panel: SeasonAdminPanel) => void,
  provider: ReturnType<typeof createSeasonProvider>,
): void {
  register({
    list: provider.listSeasons,
    lockPreview: provider.getSeasonLockPreview,
    configure: provider.configureSeason,
    setLock: provider.setSeasonLock,
  });
}
