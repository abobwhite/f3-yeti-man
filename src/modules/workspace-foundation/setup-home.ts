import {
  actionBlock,
  button,
  headerBlock,
  plainText,
  sectionBlock,
  textInputBlock,
} from '../../shared/slack-blocks.ts';
import type { SetupInput } from './configuration.ts';
import type { SetupStatus } from './setup-status.ts';
import { setupRequiredMessage } from './setup-status.ts';

export function setupHome(status: SetupStatus, isAdmin: boolean) {
  return {
    type: 'home' as const,
    blocks: [
      headerBlock('F3 Yeti Man setup'),
      sectionBlock(status.ready ? 'Competition setup is confirmed.' : setupRequiredMessage(status)),
      ...(isAdmin && !status.ready
        ? [actionBlock(button('Configure setup', 'yeti_setup_open'))]
        : []),
    ],
  };
}

export function setupModal(
  config: SetupInput | undefined,
  suggested: SetupInput,
  season: { selector: string; label: string; startDate: string; endDate: string },
  revision?: number,
) {
  const value = config ?? suggested;
  const aoLines = value.aos
    .map(
      (ao) =>
        `${ao.name} | ${ao.channelId} | ${Object.entries(ao.schedule)
          .map(([day, times]) => `${day}=${times?.join(',')}`)
          .join(';')}`,
    )
    .join('\n');
  const bands = value.scoringBands
    .map((band) => `${band.minF}:${band.maxF}:${band.points}`)
    .join('\n');
  return {
    type: 'modal' as const,
    callback_id: 'yeti_setup_submit',
    private_metadata: String(revision ?? 0),
    title: plainText('Yeti setup'),
    submit: plainText('Confirm setup'),
    close: plainText('Cancel'),
    blocks: [
      textInputBlock('region', 'Region name', value.regionName),
      textInputBlock('timezone', 'IANA timezone', value.timezone),
      textInputBlock('aos', 'AOs: name | channel ID | mon=05:30,06:00;wed=05:30', aoLines, true),
      textInputBlock(
        'season',
        'Season: selector | label | YYYY-MM-DD | YYYY-MM-DD',
        `${season.selector} | ${season.label} | ${season.startDate} | ${season.endDate}`,
      ),
      textInputBlock('bands', 'Scoring bands: min:max:points per line', bands, true),
      textInputBlock(
        'replies',
        'Automatic Backblast replies: ON or OFF',
        value.automaticBackblastRepliesEnabled ? 'ON' : 'OFF',
      ),
      textInputBlock(
        'source',
        'F3 bot user ID (required when replies ON)',
        value.trustedF3BotUserId ?? '',
        false,
        true,
      ),
    ],
  };
}

export function parseSetupFields(
  values: Record<string, { value?: { value?: string } }>,
  suggested: SetupInput,
) {
  const read = (id: string) => values[id]?.value?.value?.trim() ?? '';
  const aos = read('aos')
    .split('\n')
    .filter(Boolean)
    .map((line, index) => {
      const [name, channelId, scheduleText] = line.split('|').map((part) => part.trim());
      const schedule: Record<string, string[]> = {};
      for (const item of (scheduleText ?? '').split(';').filter(Boolean)) {
        const [day, times] = item.split('=');
        schedule[day.trim().toLowerCase()] = (times ?? '').split(',').map((time) => time.trim());
      }
      return {
        aoId: suggested.aos[index]?.aoId ?? crypto.randomUUID(),
        name,
        channelId,
        schedule,
        active: true,
      };
    });
  const scoringBands = read('bands')
    .split('\n')
    .filter(Boolean)
    .map((line) => {
      const [minF, maxF, points] = line.split(':').map((part) => Number(part.trim()));
      return { minF, maxF, points };
    });
  const [selector, label, startDate, endDate] = read('season')
    .split('|')
    .map((part) => part.trim());
  const replyMode = read('replies').toUpperCase();
  if (replyMode !== 'ON' && replyMode !== 'OFF')
    throw new Error('Reply setting must be ON or OFF.');
  return {
    configuration: {
      regionName: read('region'),
      timezone: read('timezone'),
      aos,
      scoringBands,
      automaticBackblastRepliesEnabled: replyMode === 'ON',
      ...(read('source') ? { trustedF3BotUserId: read('source') } : {}),
    },
    season: { selector, label, startDate, endDate, timezone: read('timezone') },
  };
}
