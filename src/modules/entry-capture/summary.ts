import { actionBlock, button, headerBlock, sectionBlock } from '../../shared/slack-blocks.ts';
import type { Entry } from '../entry-ledger/entries.ts';

export interface SummaryState {
  entry: Entry;
  aoName: string;
  channelId: string;
  locked: boolean;
  warnings: readonly string[];
}
const escapeSlackText = (text: string) =>
  text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');

export function renderSummary({ entry, aoName, locked, warnings }: SummaryState) {
  const reference = entry.workoutReference;
  const lines = [
    `${escapeSlackText(aoName)} · ${reference.localDate} · ${reference.localStartTime} ${escapeSlackText(reference.timezone)}`,
    `Actual starting temperature: ${entry.temperatureF}°F · ${entry.pointsPerPax} points per PAX`,
    `Attendance: ${entry.paxUserIds.map((id) => `<@${id}>`).join(', ')}`,
    `Submitted by <@${entry.createdBy}> · ${entry.createdAt.toISOString()}`,
    `Last modified by <@${entry.updatedBy}> · ${entry.updatedAt.toISOString()}`,
    `Entry ID: ${entry.entryId} · Correct the AO privately with /yeti edit ${entry.entryId} outside an AO channel.`,
    `Source Qs: ${entry.sourceQUserIds.length ? entry.sourceQUserIds.map((id) => `<@${id}>`).join(', ') : 'None recorded'}`,
    ...warnings.map((warning) => `Warning: ${escapeSlackText(warning)}`),
    ...(entry.status === 'archived' ? ['Archived — excluded from competition credit.'] : []),
    ...(locked ? ['Season locked — modifications unavailable.'] : []),
  ];
  // Keep each section within Slack's 3000-character limit, including large rosters.
  const sections = lines.flatMap((line) => {
    if (line.length <= 2900) return [line];
    const words = line.split(' ');
    const chunks: string[] = [];
    for (const word of words) {
      if (!chunks.length || chunks[chunks.length - 1].length + word.length > 2900)
        chunks.push(word);
      else chunks[chunks.length - 1] += ` ${word}`;
    }
    return chunks;
  });
  if (
    sections.length > 47 ||
    lines.join('\n').length > 39_000 ||
    sections.some((line) => line.length > 3000)
  )
    throw new Error('SUMMARY_TOO_LARGE');
  return {
    text: ['Yeti Man entry', ...lines].join('\n'),
    blocks: [
      headerBlock('Yeti Man entry'),
      ...sections.map(sectionBlock),
      ...(entry.status === 'active' && !locked
        ? [actionBlock(button('Modify', 'yeti_entry_modify', entry.entryId))]
        : []),
    ],
  };
}

export function summaryLink(teamId: string, channelId: string, messageTs: string): string {
  return `slack://channel?team=${encodeURIComponent(teamId)}&id=${encodeURIComponent(channelId)}&message=${encodeURIComponent(messageTs)}`;
}

export function savedConfirmation(link?: string) {
  return {
    response_type: 'ephemeral' as const,
    text: link ? `Saved. <${link}|View entry>` : 'Saved; message update pending.',
  };
}
