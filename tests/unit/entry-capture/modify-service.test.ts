import assert from 'node:assert/strict';
import test from 'node:test';
import type { EntryDraft } from '../../../src/modules/entry-capture/drafts.ts';
import { createManualCapture } from '../../../src/modules/entry-capture/manual-command.ts';
import { createWorkspaceContextProvider } from '../../../src/modules/workspace-foundation/context.ts';
import { manualFixture } from '../../fixtures/manual-entry.ts';

async function setup() {
  const f = manualFixture();
  const id = crypto.randomUUID();
  const entry = {
    entryId: id,
    status: 'active',
    version: 7,
    workoutReference: { ...f.values, timezone: 'UTC' },
    temperatureF: 20,
    paxUserIds: ['UPAX'],
  };
  let stored: EntryDraft;
  let locked = false;
  let code = '';
  let receipt: unknown;
  let linkFailure = false;
  const saves: unknown[][] = [];
  const contexts = createWorkspaceContextProvider(
    {
      collection: (name: string) => ({
        findOne: async () =>
          name === 'installations'
            ? {
                _id: 'TONE',
                teamId: 'TONE',
                appId: 'AAPP',
                installerUserId: 'UADMIN',
                active: true,
                botToken: {},
              }
            : {
                _id: 'TONE',
                teamId: 'TONE',
                regionId: f.config.regionId,
                adminUserIds: ['UADMIN'],
              },
        updateOne: async () => {},
      }),
    } as never,
    {} as never,
    'AAPP',
  );
  const context = await contexts.resolveWorkspaceContext({
    teamId: 'TONE',
    actorUserId: 'UADMIN',
    appId: 'AAPP',
  });
  const slack = {
    users: {
      info: async () => ({ ok: true, user: { id: 'UADMIN', team_id: 'TONE', deleted: false } }),
    },
    conversations: {
      info: async () => ({
        ok: true,
        channel: {
          id: 'CAO',
          context_team_id: 'TONE',
          is_channel: true,
          is_private: false,
          is_member: true,
        },
      }),
      members: async () => ({ ok: true, members: ['UADMIN'] }),
    },
  };
  const capture = createManualCapture({
    now: () => f.now,
    assertActive: async () => {},
    configuration: {
      assertConfigured: async (_context: unknown, revision?: number) => {
        if (revision !== undefined && revision !== f.config.revision)
          throw new Error('CONFIGURATION_REVISION_CONFLICT');
        return f.config;
      },
    },
    drafts: {
      create: async (_ctx: unknown, seed: EntryDraft) => {
        stored = { ...seed, ...context, _id: crypto.randomUUID(), version: 1, status: 'editing' };
        return stored;
      },
      get: async () => stored,
      replace: async (_ctx: unknown, _before: EntryDraft, after: EntryDraft) => {
        stored = after;
      },
      queue: async (_ctx: unknown, _before: EntryDraft, after: EntryDraft) => {
        stored = after;
      },
    } as never,
    entries: {
      getSummaryState: async () => ({ entry, locked }),
      getEntry: async () => entry,
      getSaveReceipt: async () => receipt,
      saveEntry: async (...args: unknown[]) => {
        saves.push(args);
        if (code) throw new Error(code);
        return { entryId: id, outcome: 'saved' };
      },
    } as never,
    enqueue: async () => {},
    entryLink: async () => {
      if (linkFailure) throw new Error('Unavailable');
      return 'slack://channel?team=TONE&id=CAO&message=100.100';
    },
  });
  return {
    ...f,
    id,
    entry,
    context: context as never,
    slack: slack as never,
    capture,
    saves,
    stored: () => stored,
    setCode(value: string) {
      code = value;
    },
    setLinkFailure(value: boolean) {
      linkFailure = value;
    },
    setLocked(value: boolean) {
      locked = value;
    },
    setReceipt(value: unknown) {
      receipt = value;
    },
  };
}
test('Modify orchestration seeds committed version, passes same ID to ledger, and replays receipt without replacing again', async () => {
  const h = await setup();
  const { draft } = await h.capture.modify(h.context, h.id, 'CGENERAL', h.slack);
  assert.equal(draft.expectedEntryVersion, 7);
  assert.equal(draft.fixedAoId, undefined);
  const queued = await h.capture.submit(h.context, draft._id, 1, h.state(draft.values), 'V');
  const key = queued.operationKey ?? assert.fail('Missing key');
  await h.capture.process(h.context, draft._id, key, h.slack);
  assert.equal((h.saves[0][1] as { entryId: string }).entryId, h.id);
  assert.equal(h.saves[0][2], 7);
  await h.capture.process(h.context, draft._id, key, h.slack);
  assert.equal(h.saves.length, 1);
});
test('Modify commit failures retain proposals; review never approves a newly changed version silently', async () => {
  const h = await setup();
  const { draft } = await h.capture.modify(h.context, h.id, 'CGENERAL', h.slack);
  const proposed = { ...draft.values, temperatureF: '-40' };
  const queued = await h.capture.submit(h.context, draft._id, 1, h.state(proposed), 'V');
  h.setCode('VERSION_CONFLICT');
  await assert.rejects(
    h.capture.process(h.context, draft._id, queued.operationKey ?? '', h.slack),
    /VERSION_CONFLICT/,
  );
  assert.equal(h.stored().values.temperatureF, '-40');
  assert.equal(h.stored().status, 'editing');
  h.entry.version = 8;
  await h.capture.review(h.context, draft._id, h.stored().version, h.state(proposed));
  assert.equal(h.stored().expectedEntryVersion, 7);
  h.entry.version = 9;
  await h.capture.review(h.context, draft._id, h.stored().version, h.state(proposed));
  assert.equal(h.stored().expectedEntryVersion, 7);
  assert.equal(h.stored().reviewTarget?.entryVersion, 9);
  h.setLocked(true);
  await assert.rejects(
    h.capture.review(h.context, draft._id, h.stored().version, h.state(proposed)),
    /LOCKED/,
  );
});
test('crash recovery uses committed Modify receipt before mutable configuration/entry versions', async () => {
  const h = await setup();
  const { draft } = await h.capture.modify(h.context, h.id, 'CGENERAL', h.slack);
  const queued = await h.capture.submit(h.context, draft._id, 1, h.state(draft.values), 'V');
  h.setReceipt({ entryId: h.id, outcome: 'saved' });
  h.setCode('VERSION_CONFLICT');
  await h.capture.process(h.context, draft._id, queued.operationKey ?? '', h.slack);
  assert.equal(h.saves.length, 0);
  assert.equal(h.stored().status, 'saved');
});

test('historical app-owned views require local writable bot access without requiring the editor to join the old AO', async () => {
  const { requirePublicLocalChannel } = await import(
    '../../../src/modules/workspace-foundation/channels.ts'
  );
  const h = await setup();
  const channel = {
    id: 'COLD',
    context_team_id: 'TONE',
    is_channel: true,
    is_private: false,
    is_ext_shared: false,
    is_pending_ext_shared: false,
    is_shared: false,
    is_member: true,
  };
  const client = {
    conversations: {
      info: async () => ({ ok: true, channel }),
      members: async () => {
        throw new Error('Actor membership must not be requested for historical app views');
      },
    },
  };
  assert.equal(
    (await requirePublicLocalChannel(h.context, 'COLD', client as never, async () => {})).channelId,
    'COLD',
  );
  channel.context_team_id = 'TTWO';
  await assert.rejects(
    requirePublicLocalChannel(h.context, 'COLD', client as never, async () => {}),
    /local public/,
  );
  channel.context_team_id = 'TONE';
  channel.is_private = true;
  await assert.rejects(
    requirePublicLocalChannel(h.context, 'COLD', client as never, async () => {}),
    /local public/,
  );
});

test('duplicate collision retains canonical link when available and edit-ID fallback when publication is unavailable', async () => {
  for (const unavailable of [false, true]) {
    const h = await setup();
    h.setLinkFailure(unavailable);
    const { draft } = await h.capture.modify(h.context, h.id, 'CGENERAL', h.slack);
    const queued = await h.capture.submit(h.context, draft._id, 1, h.state(draft.values), 'V');
    h.setCode(`ENTRY_REFERENCE_CONFLICT:${h.id}`);
    await assert.rejects(
      h.capture.process(h.context, draft._id, queued.operationKey ?? '', h.slack),
      /ENTRY_REFERENCE_CONFLICT/,
    );
    const { view } = await h.capture.reopen(h.context, draft._id);
    assert.match(JSON.stringify(view), new RegExp(`yeti edit ${h.id}`));
    assert.equal(!!h.stored().conflictLink, !unavailable);
    if (!unavailable) assert.match(JSON.stringify(view), /View existing entry/);
  }
});

test('stale configuration accepts proposals durably for explicit review even when their selected AO was deactivated', async () => {
  const h = await setup();
  const { draft } = await h.capture.modify(h.context, h.id, 'CGENERAL', h.slack);
  h.config.revision++;
  const other = h.config.aos.find((ao) => ao.aoId === h.otherAoId);
  assert.ok(other);
  other.active = false;
  const values = { ...draft.values, aoId: h.otherAoId };
  const queued = await h.capture.submit(h.context, draft._id, 1, h.state(values), 'V');
  assert.equal(queued.values.aoId, h.otherAoId);
  await assert.rejects(
    h.capture.process(h.context, draft._id, queued.operationKey ?? '', h.slack),
    /CONFIGURATION/,
  );
  assert.equal(h.stored().values.aoId, h.otherAoId);
  assert.match(
    JSON.stringify((await h.capture.reopen(h.context, draft._id)).view),
    /Review latest saved entry/,
  );
});
