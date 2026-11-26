import type { ClientSession } from 'mongodb';
import type { createEntryProvider, SaveReceipt } from '../entry-ledger/entries.ts';
import {
  type ChannelClient,
  requirePublicLocalDestination,
} from '../workspace-foundation/channels.ts';
import type { createConfigurationProvider } from '../workspace-foundation/configuration.ts';
import type { WorkspaceContext } from '../workspace-foundation/context.ts';
import { requireMember } from '../workspace-foundation/members.ts';
import type { createDraftRepository, EntryDraft } from './drafts.ts';
import {
  editorView,
  localToday,
  readEditorValues,
  refreshDraft,
  scheduleTimes,
  validateSubmission,
} from './editor.ts';
import { assertEditOrigin, assertModifiable, modifySeed, reviewModification } from './modify.ts';

export function assertEditingDraft(draft: EntryDraft, version: number, now: Date): void {
  if (draft.status !== 'editing' || draft.version !== version)
    throw new Error('DRAFT_VERSION_CONFLICT');
  if (draft.expiresAt <= now) throw new Error('DRAFT_EXPIRED');
}
export function manualCommandKind(text: string): 'capture' | 'configure' | 'help' {
  const command = text.trim().toLowerCase();
  return command === '' || command === 'log'
    ? 'capture'
    : command === 'configure'
      ? 'configure'
      : 'help';
}
export const captureHelp =
  'Use /yeti or /yeti log to enter a workout privately. Use /yeti edit <entry ID> to open a saved entry; run it outside an AO channel to correct the AO. Review the AO, workout date/time, whole actual temperature (-40 to 120°F), and local PAX. Only open configured seasons count; workouts cannot start in the future. Patch threshold: 40 points. /yeti configure opens admin setup. Reporting commands will be added separately.';

export function createManualCapture(options: {
  drafts: ReturnType<typeof createDraftRepository>;
  configuration: Pick<ReturnType<typeof createConfigurationProvider>, 'assertConfigured'>;
  entries: Pick<
    ReturnType<typeof createEntryProvider>,
    'saveEntry' | 'getEntry' | 'getSaveReceipt' | 'getSummaryState'
  >;
  entryLink?(context: WorkspaceContext, entryId: string): Promise<string | undefined>;
  assertActive(context: WorkspaceContext): Promise<unknown>;
  enqueue(
    context: WorkspaceContext,
    input: { operationKey: string; type: string; payloadRef: string },
    session: ClientSession,
  ): Promise<unknown>;
  now?: () => Date;
}) {
  const now = options.now ?? (() => new Date());
  async function current(context: WorkspaceContext, id: string, version: number) {
    await options.assertActive(context);
    const draft = await options.drafts.get(context, id);
    assertEditingDraft(draft, version, now());
    return draft;
  }
  return {
    async modify(
      context: WorkspaceContext,
      entryId: string,
      originChannelId: string,
      slack: ChannelClient,
    ) {
      await requireMember(context, context.actorUserId, slack, options.assertActive);
      const config = await options.configuration.assertConfigured(context);
      const state = await options.entries.getSummaryState(context, entryId);
      const seed = modifySeed(state.entry, state.locked, config, originChannelId, now());
      if (seed.fixedAoId)
        await requirePublicLocalDestination(
          context,
          originChannelId,
          context.actorUserId,
          slack,
          options.assertActive,
        );
      const draft = await options.drafts.create(context, seed);
      return { draft, view: editorView(draft, config) };
    },
    async open(context: WorkspaceContext, originChannelId: string, slack: ChannelClient) {
      await requireMember(context, context.actorUserId, slack, options.assertActive);
      const config = await options.configuration.assertConfigured(context);
      const mapped = config.aos.find((ao) => ao.channelId === originChannelId);
      if (mapped && !mapped.active) throw new Error('AO_NOT_ACTIVE');
      if (mapped)
        await requirePublicLocalDestination(
          context,
          mapped.channelId,
          context.actorUserId,
          slack,
          options.assertActive,
        );
      const localDate = localToday(now(), config.timezone);
      const times = mapped ? scheduleTimes(config, mapped.aoId, localDate) : [];
      const draft = await options.drafts.create(context, {
        originChannelId,
        ...(mapped ? { fixedAoId: mapped.aoId } : {}),
        configurationRevision: config.revision,
        values: {
          aoId: mapped?.aoId ?? '',
          localDate,
          localStartTime: times.length === 1 ? times[0] : '',
          temperatureF: '',
          paxUserIds: [],
          offset: '',
        },
        timeOrigin: times.length === 1 ? 'schedule' : 'required',
        timeGeneration: 0,
        createdAt: now(),
        expiresAt: new Date(now().getTime() + 30 * 60_000),
      });
      return { draft, view: editorView(draft, config) };
    },
    async change(
      context: WorkspaceContext,
      id: string,
      version: number,
      raw: unknown,
      changedBlockId: string,
    ) {
      const draft = await current(context, id, version);
      const config = await options.configuration.assertConfigured(
        context,
        draft.configurationRevision,
      );
      const updated = refreshDraft(
        draft,
        readEditorValues(raw, draft),
        changedBlockId,
        config,
        now(),
      );
      const view = editorView(updated, config);
      await options.drafts.replace(context, draft, updated);
      return view;
    },
    async review(context: WorkspaceContext, id: string, version: number, raw: unknown) {
      const draft = await current(context, id, version);
      const config = await options.configuration.assertConfigured(context);
      const { errorCode: _previousError, ...retained } = draft;
      const values = readEditorValues(raw, draft);
      let reviewed = { ...retained, values, configurationRevision: config.revision };
      if (draft.entryId) {
        const state = await options.entries.getSummaryState(context, draft.entryId);
        assertModifiable(state.entry, state.locked);
        reviewed = reviewModification(draft, values, state.entry, config);
      }
      const updated = {
        ...reviewed,
        version: draft.version + 1,
        expiresAt: new Date(now().getTime() + 30 * 60_000),
      };
      const view = editorView(updated, config);
      await options.drafts.replace(context, draft, updated);
      return view;
    },
    async submit(
      context: WorkspaceContext,
      id: string,
      version: number,
      raw: unknown,
      viewId: string,
    ) {
      const draft = await current(context, id, version);
      const config = await options.configuration.assertConfigured(context);
      if (draft.reviewTarget) throw new Error('REVIEW_CURRENT_ENTRY');
      const values = readEditorValues(raw, draft);
      assertEditOrigin(draft, config);
      // A stale configuration must reach the private review path even if it invalidates the proposed AO.
      if (config.revision === draft.configurationRevision)
        validateSubmission(values, draft, config);
      const operationKey = `manual:${draft._id}:${draft.version}`;
      const queued: EntryDraft = {
        ...draft,
        values,
        status: 'queued',
        viewId,
        operationKey,
        version: draft.version + 1,
      };
      await options.drafts.queue(
        context,
        draft,
        queued,
        (session) =>
          options.enqueue(
            context,
            { operationKey, type: 'manual-entry-save', payloadRef: draft._id },
            session,
          ),
        now(),
      );
      return queued;
    },
    async cancel(context: WorkspaceContext, id: string, version: number) {
      await options.assertActive(context);
      const draft = await options.drafts.get(context, id);
      if (draft.status !== 'editing' || draft.version !== version) return;
      await options.drafts.replace(context, draft, {
        ...draft,
        status: 'cancelled',
        version: draft.version + 1,
      });
    },
    async process(
      context: WorkspaceContext,
      id: string,
      operationKey: string,
      slack: ChannelClient,
    ) {
      const draft = await options.drafts.get(context, id);
      if (draft.operationKey !== operationKey) throw new Error('DRAFT_OPERATION_MISMATCH');
      if (draft.status === 'saved' && draft.receiptEntryId)
        return {
          draft,
          entry: await options.entries.getEntry(context, draft.receiptEntryId),
          duplicate: draft.duplicate ?? false,
        };
      if (draft.status !== 'queued') throw new Error('DRAFT_NOT_QUEUED');
      let receipt: SaveReceipt;
      try {
        await requireMember(context, context.actorUserId, slack, options.assertActive);
        const committed = await options.entries.getSaveReceipt(context, operationKey);
        if (committed) receipt = committed;
        else {
          const config = await options.configuration.assertConfigured(
            context,
            draft.configurationRevision,
          );
          validateSubmission(draft.values, draft, config);
          const values = draft.values;
          receipt = await options.entries.saveEntry(
            context,
            {
              ...(draft.entryId ? { entryId: draft.entryId } : {}),
              reference: {
                aoId: values.aoId,
                localDate: values.localDate,
                localStartTime: values.localStartTime,
                timezone: config.timezone,
                paxUserIds: values.paxUserIds,
                ...(values.offset ? { offset: values.offset } : {}),
              },
              temperatureF: values.temperatureF,
              reason: draft.entryId ? 'Private entry correction' : 'Manual entry',
            },
            draft.expectedEntryVersion ?? 0,
            draft.configurationRevision,
            operationKey,
          );
        }
      } catch (error) {
        // A retry after a crash uses the same ledger receipt and cannot award credit twice.
        if (
          error instanceof Error &&
          /ENTRY_SAVE_CONFLICT_RETRY|RETRY_REQUIRED/.test(error.message)
        )
          throw error;
        const conflictId =
          error instanceof Error
            ? /^ENTRY_REFERENCE_CONFLICT:([0-9a-f-]{36})$/i.exec(error.message)?.[1]
            : undefined;
        let conflictLink: string | undefined;
        if (conflictId && options.entryLink) {
          try {
            conflictLink = await options.entryLink(context, conflictId);
          } catch {
            /* A pending summary still has the private edit-command fallback. */
          }
        }
        const { conflictLink: _previousLink, ...retained } = draft;
        const failure: EntryDraft = {
          ...retained,
          ...(conflictLink ? { conflictLink } : {}),
          status: 'editing',
          version: draft.version + 1,
          errorCode: error instanceof Error ? error.message.slice(0, 200) : 'SAVE_RETRY_REQUIRED',
        };
        await options.drafts.replace(context, draft, failure);
        throw error;
      }
      const saved: EntryDraft = {
        ...draft,
        status: 'saved',
        receiptEntryId: receipt.entryId,
        duplicate: receipt.outcome === 'duplicate',
        version: draft.version + 1,
      };
      await options.drafts.replace(context, draft, saved);
      return {
        draft: saved,
        entry: await options.entries.getEntry(context, receipt.entryId),
        duplicate: receipt.outcome === 'duplicate',
      };
    },
    async reopen(context: WorkspaceContext, id: string) {
      const draft = await options.drafts.get(context, id);
      const config = await options.configuration.assertConfigured(context);
      return { draft, view: editorView(draft, config) };
    },
  };
}
