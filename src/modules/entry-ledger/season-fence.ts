import type { ClientSession } from 'mongodb';
import type { WorkspaceContext } from '../workspace-foundation/context.ts';
import type { createSeasonRepository } from './season-repository.ts';

/** Call inside the same transaction and session as every entry/source/archive write. */
export async function fenceOpenSeasons(
  repository: ReturnType<typeof createSeasonRepository>,
  context: WorkspaceContext,
  seasonIds: readonly string[],
  session: ClientSession,
  confirmConfiguration: (session: ClientSession) => Promise<void>,
): Promise<void> {
  await confirmConfiguration(session);
  for (const seasonId of [...new Set(seasonIds)].sort()) {
    await repository.fenceOpen(context.teamId, context.regionId, seasonId, session);
  }
}
