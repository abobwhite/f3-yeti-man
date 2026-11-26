import assert from 'node:assert/strict';
import test from 'node:test';
import { editorView } from '../../../src/modules/entry-capture/editor.ts';
import { registerManualCapture } from '../../../src/modules/entry-capture/manual-runtime.ts';
import { manualFixture } from '../../fixtures/manual-entry.ts';

type Listener = (args: Record<string, unknown>) => Promise<unknown>;
function setup() {
  const f = manualFixture();
  const listeners = new Map<string, Listener>();
  const calls: string[] = [];
  const responses: unknown[] = [];
  const updated: unknown[] = [];
  let ready = true;
  let admin = true;
  let failure = false;
  let pending = false;
  let duplicate = false;
  let archived = false;
  let status = 'editing';
  const context = {
    teamId: 'TONE',
    regionId: f.config.regionId,
    actorUserId: 'UADMIN',
    installationId: 'TONE',
  };
  const client = {
    views: {
      async open() {
        calls.push('modal-open');
        return { view: { id: 'VONE' } };
      },
      async update(args: unknown) {
        updated.push(args);
      },
    },
  };
  const app = {
    client,
    logger: { info() {} },
    command(name: string, listener: Listener) {
      listeners.set(name, listener);
    },
    action(name: string, listener: Listener) {
      listeners.set(name, listener);
    },
    view(criteria: { callback_id: string; type: string }, listener: Listener) {
      listeners.set(`${criteria.callback_id}:${criteria.type}`, listener);
    },
  };
  const capture = {
    async modify() {
      calls.push('modify');
      return { draft: f.draft, view: editorView(f.draft, f.config) };
    },
    async open() {
      calls.push('capture-open');
      if (failure) throw new Error('OPEN_FAILED');
      return { draft: f.draft, view: editorView(f.draft, f.config) };
    },
    async change(_context: unknown, _id: string, _v: number, raw: unknown) {
      assert.deepEqual(raw, f.state(f.values));
      if (failure) throw new Error('STALE');
      calls.push('change');
      return editorView(f.draft, f.config);
    },
    async review() {
      calls.push('review');
      return editorView(f.draft, f.config);
    },
    async submit(_context: unknown, _id: string, _v: number, raw: unknown, viewId: string) {
      assert.deepEqual(raw, f.state(f.values));
      assert.equal(viewId, 'VONE');
      if (failure) throw new Error('DRAFT_EXPIRED');
      calls.push('submit');
    },
    async cancel() {
      calls.push('cancel');
    },
    async process() {
      calls.push('process');
      if (failure) throw new Error('VALIDATION');
      return {
        draft: { ...f.draft, viewId: 'VONE' },
        entry: { entryId: f.draft._id, status: archived ? 'archived' : 'active' },
        duplicate,
      };
    },
    async reopen() {
      return { draft: f.draft, view: editorView(f.draft, f.config) };
    },
  };
  const handle = registerManualCapture({
    app: app as never,
    appId: 'AAPP',
    capture: capture as never,
    contexts: {
      async resolveWorkspaceContext() {
        return context;
      },
      async requireAdmin() {
        if (!admin) throw new Error('FORBIDDEN');
      },
    } as never,
    configuration: {
      async getSetupStatus() {
        return { ready, missingSettings: ready ? [] : ['Competition start/end dates'] };
      },
    } as never,
    drafts: {
      async operationActor() {
        return 'UADMIN';
      },
      async get() {
        return { ...f.draft, status, viewId: 'VONE' };
      },
    } as never,
    tenantSlack: {
      async token() {
        return 'test-token';
      },
      async channels() {
        return {};
      },
    } as never,
    summaries: {
      delivery: {
        async deliver() {
          calls.push('deliver');
        },
        async confirmation() {
          return {
            text: pending
              ? 'Saved; message update pending.'
              : 'Saved. <slack://channel?id=CAO|View entry>',
          };
        },
      },
    } as never,
  });
  const view = {
    id: 'VONE',
    hash: 'hash',
    private_metadata: JSON.stringify({ id: f.draft._id, version: 1 }),
    state: { values: f.state(f.values) },
  };
  const body = {
    team: { id: 'TONE' },
    user: { id: 'UADMIN' },
    view,
    actions: [{ block_id: 'date' }],
  };
  const ack = async (response?: unknown) => {
    calls.push('ack');
    if (response) responses.push(response);
  };
  async function invoke(name: string, extra: Record<string, unknown> = {}) {
    const listener = listeners.get(name);
    assert.ok(listener);
    return listener({
      ack,
      body,
      view,
      client,
      respond: async (response: unknown) => {
        responses.push(response);
      },
      command: {
        team_id: 'TONE',
        user_id: 'UADMIN',
        channel_id: 'CAO',
        trigger_id: 'TRIGGER',
        text: 'log',
      },
      ...extra,
    });
  }
  return {
    ...f,
    calls,
    responses,
    updated,
    invoke,
    handle,
    setReady(value: boolean) {
      ready = value;
    },
    setAdmin(value: boolean) {
      admin = value;
    },
    setFailure(value: boolean) {
      failure = value;
    },
    setPending(value: boolean) {
      pending = value;
    },
    setDuplicate(value: boolean) {
      duplicate = value;
    },
    setArchived(value: boolean) {
      archived = value;
    },
    setStatus(value: string) {
      status = value;
    },
  };
}

test('slash handler acknowledges promptly, gates all capture/help paths, and opens only private views', async () => {
  const h = setup();
  h.setReady(false);
  await h.invoke('/yeti');
  assert.deepEqual(h.calls, ['ack']);
  assert.match(JSON.stringify(h.responses), /Competition start\/end dates/);
  h.setReady(true);
  await h.invoke('/yeti');
  assert.deepEqual(h.calls.slice(-3), ['ack', 'modal-open', 'capture-open']);
  assert.equal((h.updated[0] as { view: { type: string } }).view.type, 'modal');
  await h.invoke('/yeti', { command: { team_id: 'TONE', user_id: 'UADMIN', text: 'help' } });
  assert.match(JSON.stringify(h.responses), /40 points/);
  h.setAdmin(false);
  await h.invoke('/yeti', { command: { team_id: 'TONE', user_id: 'UADMIN', text: 'configure' } });
  assert.match(JSON.stringify(h.responses), /designated/);
  h.setFailure(true);
  await h.invoke('/yeti');
  assert.match(JSON.stringify(h.updated.at(-1)), /No entry was saved/);
});

test('submission passes the complete view state to durable queue and keeps invalid values in the modal', async () => {
  const h = setup();
  await h.invoke('yeti_manual_submit:view_submission');
  assert.deepEqual(h.calls, ['submit', 'ack']);
  assert.match(JSON.stringify(h.responses), /not confirmed yet/);
  h.setFailure(true);
  await h.invoke('yeti_manual_submit:view_submission');
  assert.match(JSON.stringify(h.responses.at(-1)), /errors/);
  assert.match(JSON.stringify(h.responses.at(-1)), /expired/);
  await h.invoke('yeti_manual_submit:view_closed');
  assert.equal(h.calls.at(-1), 'cancel');
});

test('field/review actions preserve current state and use Slack view hash protection', async () => {
  const h = setup();
  await h.invoke('manual_field');
  await h.invoke('yeti_manual_review');
  assert.equal((h.updated[0] as { hash: string }).hash, 'hash');
  assert.ok(h.calls.includes('change'));
  assert.ok(h.calls.includes('review'));
  h.setFailure(true);
  await h.invoke('manual_field');
  assert.equal(h.updated.length, 2);
});

test('worker renders durable saved/duplicate/archived/pending results and reopens failures privately', async () => {
  const h = setup();
  const job = {
    teamId: 'TONE',
    regionId: h.config.regionId,
    payloadRef: h.draft._id,
    operationKey: 'manual',
  };
  assert.equal((await h.handle(job as never)).status, 'succeeded');
  assert.ok(h.calls.includes('deliver'));
  h.setPending(true);
  assert.equal((await h.handle(job as never)).status, 'pending');
  h.setPending(false);
  h.setDuplicate(true);
  assert.equal((await h.handle(job as never)).resultCode, 'ENTRY_ALREADY_EXISTS');
  assert.match(JSON.stringify(h.updated.at(-1)), /No attendance was replaced/);
  h.setArchived(true);
  await h.handle(job as never);
  assert.match(JSON.stringify(h.updated.at(-1)), /archived entry/);
  h.setFailure(true);
  assert.equal((await h.handle(job as never)).status, 'failed');
  assert.equal(
    (h.updated.at(-1) as { view: { callback_id: string } }).view.callback_id,
    'yeti_manual_submit',
  );
  h.setStatus('queued');
  assert.equal((await h.handle(job as never)).status, 'pending');
});

test('slash edit opens the saved-entry path and rejects invalid IDs privately', async () => {
  const h = setup();
  await h.invoke('/yeti', {
    command: {
      team_id: 'TONE',
      user_id: 'UADMIN',
      channel_id: 'CGENERAL',
      trigger_id: 'TRIGGER',
      text: `edit ${h.draft._id}`,
    },
  });
  assert.deepEqual(h.calls, ['ack', 'modal-open', 'modify']);
  await h.invoke('/yeti', {
    command: { team_id: 'TONE', user_id: 'UADMIN', text: 'edit invalid' },
  });
  assert.match(JSON.stringify(h.responses), /Find the ID/);
});
