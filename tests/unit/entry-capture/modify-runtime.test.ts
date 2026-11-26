import assert from 'node:assert/strict';
import test from 'node:test';
import {
  editCommandId,
  registerModifyHandlers,
} from '../../../src/modules/entry-capture/modify-runtime.ts';

test('edit command accepts only an explicit UUID and leaves other commands alone', () => {
  const id = crypto.randomUUID();
  assert.equal(editCommandId(`edit ${id}`), id);
  assert.equal(editCommandId('log'), undefined);
  assert.throws(() => editCommandId('edit'), /ENTRY_ID/);
  assert.throws(() => editCommandId('edit invalid'));
  assert.throws(() => editCommandId(`edit ${id} extra`), /ENTRY_ID/);
});
test('Modify action acknowledges first, binds trusted origin/actor and updates only the private modal', async () => {
  let listener: (args: Record<string, unknown>) => Promise<void> = async () => {};
  const calls: string[] = [];
  const updates: unknown[] = [];
  const id = crypto.randomUUID();
  let failure = false;
  let available = true;
  const client = {
    views: {
      open: async () => {
        calls.push('open');
        return { view: available ? { id: 'VPRIVATE' } : undefined };
      },
      update: async (args: unknown) => {
        updates.push(args);
      },
    },
  };
  const open = registerModifyHandlers({
    app: {
      action: (_id: string, fn: typeof listener) => {
        listener = fn;
      },
      logger: { info() {} },
    } as never,
    resolve: async (teamId, actorUserId) => ({ teamId, actorUserId }) as never,
    capture: {
      modify: async (context: { actorUserId: string }, entryId: string, origin: string) => {
        assert.equal(context.actorUserId, 'UPAX');
        assert.equal(entryId, id);
        assert.equal(origin, 'CAO');
        calls.push('load');
        if (failure) throw new Error('SEASON_LOCKED');
        return { view: { type: 'modal', blocks: [] } };
      },
    } as never,
  });
  const args = {
    ack: async () => {
      calls.push('ack');
    },
    client,
    body: {
      team: { id: 'TONE' },
      user: { id: 'UPAX' },
      trigger_id: 'TRIGGER',
      container: { type: 'message', channel_id: 'CAO' },
      actions: [{ value: id }],
    },
  };
  await listener(args);
  assert.deepEqual(calls, ['ack', 'open', 'load']);
  assert.match(JSON.stringify(updates), /VPRIVATE/);
  failure = true;
  await listener(args);
  assert.match(JSON.stringify(updates.at(-1)), /locked/);
  const count = updates.length;
  await listener({
    ...args,
    body: { ...args.body, container: { type: 'view' }, view: { type: 'modal' } },
  });
  assert.equal(updates.length, count);
  available = false;
  await open({ actorUserId: 'UPAX' } as never, id, 'CAO', 'TRIGGER', client as never);
  assert.equal(updates.length, count);
  await listener({ ...args, body: {} });
});
