import { z } from 'zod';
import type { Entry } from '../entry-ledger/entries.ts';
import type { ReadyConfiguration } from '../workspace-foundation/configuration.ts';
import type { EditorValues, EntryDraft } from './drafts.ts';

/** Only call after Bolt has authenticated the action payload. */
export function verifiedEditOrigin(raw: unknown): string {
  const parsed = z
    .object({
      container: z.object({ type: z.string(), channel_id: z.string().optional() }),
      view: z.object({ type: z.string() }).optional(),
    })
    .safeParse(raw);
  if (!parsed.success) throw new Error('EDIT_ORIGIN_REQUIRED');
  const body = parsed.data;
  if (body.container.type === 'message')
    return z
      .string()
      .regex(/^[A-Z][A-Z0-9]+$/)
      .parse(body.container.channel_id);
  if (body.container.type === 'view' && body.view?.type === 'home') return 'home';
  throw new Error('EDIT_ORIGIN_REQUIRED');
}
export function assertEditOrigin(draft: EntryDraft, config: ReadyConfiguration) {
  if (!draft.entryId) return;
  const mapped = config.aos.find((ao) => ao.channelId === draft.originChannelId);
  if (mapped?.aoId !== draft.fixedAoId) throw new Error('EDIT_ORIGIN_CHANGED_REOPEN');
}
export function assertModifiable(entry: Entry, locked: boolean) {
  if (entry.status !== 'active') throw new Error('ENTRY_ARCHIVED');
  if (locked) throw new Error('SEASON_LOCKED');
}
export function modifySeed(
  entry: Entry,
  locked: boolean,
  config: ReadyConfiguration,
  originChannelId: string,
  now: Date,
) {
  assertModifiable(entry, locked);
  const mapped = config.aos.find((ao) => ao.channelId === originChannelId);
  if (mapped && mapped.aoId !== entry.workoutReference.aoId)
    throw new Error('EDIT_ORIGIN_AO_MISMATCH');
  const reference = entry.workoutReference;
  return {
    originChannelId,
    ...(mapped ? { fixedAoId: mapped.aoId } : {}),
    entryId: entry.entryId,
    expectedEntryVersion: entry.version,
    originalAoId: reference.aoId,
    historicalPaxUserIds: entry.paxUserIds,
    configurationRevision: config.revision,
    values: {
      aoId: reference.aoId,
      localDate: reference.localDate,
      localStartTime: reference.localStartTime,
      temperatureF: String(entry.temperatureF),
      paxUserIds: entry.paxUserIds,
      offset: reference.offset ?? '',
    },
    timeOrigin: 'user' as const,
    timeGeneration: 0,
    createdAt: now,
    expiresAt: new Date(now.getTime() + 30 * 60_000),
  };
}
export function reviewModification(
  draft: EntryDraft,
  values: EditorValues,
  entry: Entry,
  config: ReadyConfiguration,
): EntryDraft {
  assertEditOrigin(draft, config);
  const { errorCode: _error, reviewTarget: previous, ...retained } = draft;
  // Accept only versions already displayed to this actor. A concurrent change gets a new preview.
  if (
    previous?.entryVersion === entry.version &&
    previous.configurationRevision === config.revision
  )
    return {
      ...retained,
      values,
      expectedEntryVersion: entry.version,
      configurationRevision: config.revision,
      originalAoId: entry.workoutReference.aoId,
    };
  const ref = entry.workoutReference;
  return {
    ...retained,
    values,
    errorCode: 'REVIEW_CURRENT_ENTRY',
    reviewTarget: {
      entryVersion: entry.version,
      configurationRevision: config.revision,
      summary: `Current saved entry v${entry.version}: ${ref.localDate} ${ref.localStartTime} ${ref.timezone}, AO ${ref.aoId}, ${entry.temperatureF}°F; PAX: ${entry.paxUserIds.map((id) => `<@${id}>`).join(', ')}. Current configuration v${config.revision}. Your proposed form values below will replace this entry only after Save.`,
    },
  };
}
