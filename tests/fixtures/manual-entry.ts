import type { EditorValues, EntryDraft } from '../../src/modules/entry-capture/drafts.ts';
import type { ReadyConfiguration } from '../../src/modules/workspace-foundation/configuration.ts';
export function manualFixture() {
  const now = new Date('2026-11-23T12:00:00Z');
  const aoId = crypto.randomUUID();
  const otherAoId = crypto.randomUUID();
  const regionId = crypto.randomUUID();
  const config: ReadyConfiguration = {
    _id: 'TONE',
    teamId: 'TONE',
    regionId,
    regionName: 'Region',
    timezone: 'UTC',
    aos: [
      {
        aoId,
        name: 'Test AO',
        channelId: 'CAO',
        active: true,
        schedule: { mon: ['05:30'], wed: ['05:30', '06:30'] },
      },
      {
        aoId: otherAoId,
        name: 'Other AO',
        channelId: 'COTHER',
        active: true,
        schedule: { mon: ['06:00'] },
      },
    ],
    scoringBands: [{ minF: -40, maxF: 120, points: 2 }],
    automaticBackblastRepliesEnabled: false,
    revision: 1,
    scoringPolicyId: crypto.randomUUID(),
    scoringPolicyRevision: 1,
    confirmedBy: 'UADMIN',
    confirmedAt: now,
    fence: 0,
  };
  const values: EditorValues = {
    aoId,
    localDate: '2026-11-23',
    localStartTime: '05:30',
    temperatureF: '20',
    paxUserIds: ['UPAX'],
    offset: '',
  };
  const draft: EntryDraft = {
    _id: crypto.randomUUID(),
    teamId: 'TONE',
    regionId,
    actorUserId: 'UADMIN',
    originChannelId: 'CAO',
    fixedAoId: aoId,
    configurationRevision: 1,
    version: 1,
    status: 'editing',
    values,
    timeOrigin: 'schedule',
    timeGeneration: 0,
    createdAt: now,
    expiresAt: new Date(now.getTime() + 30 * 60_000),
  };
  const state = (input: EditorValues, generation = 0) => ({
    ao: { manual_field: { selected_option: { value: input.aoId } } },
    date: { manual_field: { selected_date: input.localDate } },
    [`time_${generation}`]: { manual_field: { selected_time: input.localStartTime || null } },
    temperature: { value: { value: input.temperatureF } },
    pax: { value: { selected_users: input.paxUserIds } },
    offset: { value: { value: input.offset } },
  });
  return { now, aoId, otherAoId, config, draft, values, state };
}
