import { inputBlock as input, sectionBlock } from '../../shared/slack-blocks.ts';
import type { EntryDraft } from './drafts.ts';

export function historicalPaxBlocks(draft: EntryDraft) {
  const ids = draft.historicalPaxUserIds ?? [];
  if (ids.length > 800) throw new Error('EDITOR_ROSTER_TOO_LARGE');
  return ids.flatMap((_, index) => {
    if (index % 10) return [];
    const choices = ids
      .slice(index, index + 10)
      .map((id) => ({ text: { type: 'mrkdwn' as const, text: `<@${id}>` }, value: id }));
    const selected = choices.filter((option) => draft.values.paxUserIds.includes(option.value));
    return [
      {
        ...input(`historical_${index / 10}`, 'Saved PAX (uncheck to remove)', {
          type: 'checkboxes' as const,
          action_id: 'value',
          options: choices,
          ...(selected.length ? { initial_options: selected } : {}),
        }),
        optional: true,
      },
    ];
  });
}
export function reviewSections(text: string) {
  // Bound every block without splitting a Slack mention.
  const chunks: string[] = [];
  for (const word of text.split(' ')) {
    if (!chunks.length || chunks[chunks.length - 1].length + word.length > 2800) chunks.push(word);
    else chunks[chunks.length - 1] += ` ${word}`;
  }
  if (chunks.length > 5) throw new Error('EDITOR_ROSTER_TOO_LARGE');
  return chunks.map(sectionBlock);
}
export function editorErrorMessage(code: string, entryId?: string): string {
  if (/ORIGIN_CHANGED/.test(code))
    return `The channel AO mapping changed. Reopen this saved entry with /yeti edit ${entryId ?? '<entry ID>'} from the intended channel.`;
  if (/VERSION_CONFLICT|REVIEW_CURRENT_ENTRY/.test(code))
    return 'The saved entry may have changed. Proposed values are preserved. Review the latest saved entry and current settings before retrying; no changes have been committed.';
  if (/ENTRY_REFERENCE_CONFLICT/.test(code))
    return `Another entry already exists for that AO and workout time. No attendance was replaced. Review it privately with /yeti edit ${code.match(/[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}/i)?.[0] ?? '<entry ID>'}.`;
  if (/ARCHIVED/.test(code)) return 'This entry is archived and cannot be modified.';
  if (/CONFIGURATION|CONFIG_VERSION/.test(code))
    return 'Settings changed. Your proposed values are preserved. Review current settings before saving again.';
  if (/EXPIRED/.test(code))
    return entryId
      ? `This private form expired. Reopen the saved entry with /yeti edit ${entryId}.`
      : 'This private form expired. Use /yeti edit <entry ID> for a saved entry or /yeti log for a new entry.';
  if (/LOCKED/.test(code)) return 'The season is locked. Your proposed values have not been saved.';
  if (/eligible local|FORBIDDEN/.test(code))
    return 'Verify the AO, local PAX membership and channel access. No entry was saved.';
  if (/future|workout|WORKOUT|date|time|offset/i.test(code))
    return 'Review the workout date/time and season. If the local time repeats at DST, enter its UTC offset.';
  return 'Review the required fields, whole temperature (-40 to 120°F), and local PAX. No entry was saved.';
}
