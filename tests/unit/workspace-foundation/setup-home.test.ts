import assert from 'node:assert/strict';
import test from 'node:test';
import { defaultScoringBands } from '../../../src/modules/entry-ledger/scoring.ts';
import type { SetupInput } from '../../../src/modules/workspace-foundation/configuration.ts';
import {
  parseSetupFields,
  setupHome,
  setupModal,
} from '../../../src/modules/workspace-foundation/setup-home.ts';
import { setupRequiredMessage } from '../../../src/modules/workspace-foundation/setup-status.ts';

test('setup Home keeps incomplete guidance private and limits configuration to admins', () => {
  const status = { ready: false, missingSettings: ['Competition start/end dates'] };
  assert.match(setupRequiredMessage(status), /Competition start\/end dates/);
  assert.equal(setupHome(status, false).blocks.length, 2);
  assert.equal(setupHome(status, true).blocks.length, 3);
  assert.equal(
    setupHome({ ready: true, missingSettings: [], configurationRevision: 1 }, true).blocks.length,
    2,
  );
});

test('setup form preserves independent AO schedules and rejects unreviewed reply mode', () => {
  const suggested: SetupInput = {
    regionName: '',
    timezone: 'America/New_York',
    aos: [
      {
        aoId: crypto.randomUUID(),
        name: '',
        channelId: 'C00000000',
        schedule: { mon: ['05:30'] },
        active: true,
      },
    ],
    scoringBands: [...defaultScoringBands],
    automaticBackblastRepliesEnabled: true,
  };
  const input = {
    ...suggested,
    regionName: 'Region',
    timezone: 'America/Chicago',
    aos: [
      {
        ...suggested.aos[0],
        name: 'The AO',
        channelId: 'C12345',
        schedule: { mon: ['05:30', '06:00'], sat: ['07:00'] },
      },
    ],
    automaticBackblastRepliesEnabled: false,
  };
  const view = setupModal(
    input,
    suggested,
    { selector: 'test', label: 'Test', startDate: '2026-11-01', endDate: '2026-11-30' },
    1,
  );
  const values = Object.fromEntries(
    view.blocks.map((block) => [block.block_id, { value: { value: block.element.initial_value } }]),
  );
  const parsed = parseSetupFields(values, input);
  assert.deepEqual(parsed.configuration.aos[0].schedule, {
    mon: ['05:30', '06:00'],
    sat: ['07:00'],
  });
  assert.equal(parsed.configuration.aos[0].aoId, input.aos[0].aoId);
  assert.equal(parsed.configuration.automaticBackblastRepliesEnabled, false);
  assert.equal(parsed.season.startDate, '2026-11-01');
  assert.throws(
    () => parseSetupFields({ ...values, replies: { value: { value: 'maybe' } } }, input),
    /ON or OFF/,
  );
});
