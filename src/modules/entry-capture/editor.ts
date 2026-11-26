import { z } from 'zod';
import {
  actionBlock,
  button,
  plainText,
  sectionBlock,
  textInputBlock,
} from '../../shared/slack-blocks.ts';
import { parseTemperature, pointsForTemperature } from '../entry-ledger/scoring.ts';
import type { ReadyConfiguration } from '../workspace-foundation/configuration.ts';
import type { EditorValues, EntryDraft } from './drafts.ts';

export function localToday(now: Date, timezone: string): string {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    })
      .formatToParts(now)
      .map(({ type, value }) => [type, value]),
  );
  return `${parts.year}-${parts.month}-${parts.day}`;
}
export function scheduleTimes(
  config: ReadyConfiguration,
  aoId: string,
  localDate: string,
): string[] {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(localDate)) return [];
  const weekday = new Date(`${localDate}T12:00:00Z`).getUTCDay();
  const day = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'][
    weekday
  ] as keyof ReadyConfiguration['aos'][number]['schedule'];
  return config.aos.find((ao) => ao.aoId === aoId)?.schedule[day] ?? [];
}
export const draftMetadata = z.object({ id: z.uuid(), version: z.number().int().positive() });
export function readMetadata(value: string) {
  return draftMetadata.parse(JSON.parse(value));
}
const fieldState = z
  .object({
    value: z.string().nullable().optional(),
    selected_date: z.string().nullable().optional(),
    selected_time: z.string().nullable().optional(),
    selected_users: z.array(z.string()).nullable().optional(),
    selected_option: z.object({ value: z.string() }).nullable().optional(),
    type: z.string().optional(),
  })
  .passthrough();
const stateSchema = z.record(z.string(), z.record(z.string(), fieldState));
export function readEditorValues(raw: unknown, draft: EntryDraft): EditorValues {
  const state = stateSchema.parse(raw);
  const field = (id: string) => state[id]?.manual_field ?? state[id]?.value;
  const aoField = field('ao');
  const aoId =
    aoField?.selected_option === null ? '' : (aoField?.selected_option?.value ?? draft.values.aoId);
  if (draft.fixedAoId && aoId !== draft.fixedAoId) throw new Error('FIXED_AO_REQUIRED');
  return {
    aoId,
    localDate:
      field('date')?.selected_date === null
        ? ''
        : (field('date')?.selected_date ?? draft.values.localDate),
    localStartTime:
      field(`time_${draft.timeGeneration}`)?.selected_time === null
        ? ''
        : (field(`time_${draft.timeGeneration}`)?.selected_time ?? draft.values.localStartTime),
    temperatureF: field('temperature')?.value ?? '',
    paxUserIds: field('pax')?.selected_users ?? [],
    offset: field('offset')?.value ?? '',
  };
}
export function refreshDraft(
  draft: EntryDraft,
  values: EditorValues,
  changedBlockId: string,
  config: ReadyConfiguration,
  now: Date,
): EntryDraft {
  if (!config.aos.some((ao) => ao.active && ao.aoId === values.aoId) && values.aoId)
    throw new Error('AO_NOT_CONFIGURED');
  const userTime =
    draft.timeOrigin === 'user' ||
    changedBlockId.startsWith('time_') ||
    values.localStartTime !== draft.values.localStartTime;
  let timeOrigin = draft.timeOrigin;
  let timeGeneration = draft.timeGeneration;
  if (userTime) timeOrigin = values.localStartTime ? 'user' : 'required';
  else if (values.aoId !== draft.values.aoId || values.localDate !== draft.values.localDate) {
    const times = scheduleTimes(config, values.aoId, values.localDate);
    values = { ...values, localStartTime: times.length === 1 ? times[0] : '' };
    timeOrigin = times.length === 1 ? 'schedule' : 'required';
    timeGeneration++;
  }
  return {
    ...draft,
    values,
    timeOrigin,
    timeGeneration,
    version: draft.version + 1,
    expiresAt: new Date(now.getTime() + 30 * 60_000),
  };
}
export function validateSubmission(
  values: EditorValues,
  draft: EntryDraft,
  config: ReadyConfiguration,
) {
  if (draft.fixedAoId && values.aoId !== draft.fixedAoId) throw new Error('FIXED_AO_REQUIRED');
  if (!config.aos.some((ao) => ao.active && ao.aoId === values.aoId))
    throw new Error('AO_NOT_CONFIGURED');
  parseTemperature(values.temperatureF);
  z.array(z.string().regex(/^[A-Z][A-Z0-9]+$/))
    .min(1)
    .parse(values.paxUserIds);
  z.string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .parse(values.localDate);
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(values.localStartTime))
    throw new Error('WORKOUT_TIME_REQUIRED');
  if (values.offset && !/^[+-](?:0\d|1[0-4]):[0-5]\d$/.test(values.offset))
    throw new Error('WORKOUT_OFFSET_INVALID');
}
const input = <T>(blockId: string, label: string, element: T, dispatch = false) => ({
  type: 'input' as const,
  block_id: blockId,
  label: plainText(label),
  element,
  ...(dispatch ? { dispatch_action: true } : {}),
});
export function editorView(draft: EntryDraft, config: ReadyConfiguration) {
  const aos = config.aos.filter((ao) => ao.active);
  if (aos.length === 0 || aos.length > 100) throw new Error('AO_CONFIGURATION_LIMIT');
  const choices = aos.map((ao) => ({ text: plainText(ao.name.slice(0, 75)), value: ao.aoId }));
  const selected = choices.find((option) => option.value === draft.values.aoId);
  let scoringPreview = 'Enter a whole actual temperature to calculate points.';
  try {
    scoringPreview = `At this temperature, current settings award ${pointsForTemperature(parseTemperature(draft.values.temperatureF), config.scoringBands)} points per PAX.`;
  } catch {
    /* Incomplete form values are expected. */
  }
  return {
    type: 'modal' as const,
    callback_id: 'yeti_manual_submit',
    notify_on_close: true,
    private_metadata: JSON.stringify({ id: draft._id, version: draft.version }),
    title: plainText('Yeti Man entry'),
    submit: plainText('Save'),
    close: plainText('Cancel'),
    blocks: [
      sectionBlock(
        `${config.regionName.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')} · ${config.timezone}\n${scoringPreview}`,
      ),
      ...(draft.errorCode
        ? [
            sectionBlock(editorErrorMessage(draft.errorCode)),
            actionBlock(button('Review current settings', 'yeti_manual_review')),
          ]
        : []),
      ...(draft.fixedAoId
        ? [
            sectionBlock(
              `AO: ${
                config.aos
                  .find((ao) => ao.aoId === draft.fixedAoId)
                  ?.name.replaceAll('&', '&amp;')
                  .replaceAll('<', '&lt;')
                  .replaceAll('>', '&gt;') ?? 'Unavailable'
              }`,
            ),
          ]
        : [
            input(
              'ao',
              'AO',
              {
                type: 'static_select' as const,
                action_id: 'manual_field',
                options: choices,
                ...(selected ? { initial_option: selected } : {}),
              },
              true,
            ),
          ]),
      input(
        'date',
        'Workout date',
        {
          type: 'datepicker' as const,
          action_id: 'manual_field',
          initial_date: draft.values.localDate,
        },
        true,
      ),
      input(
        `time_${draft.timeGeneration}`,
        'Workout start time',
        {
          type: 'timepicker' as const,
          action_id: 'manual_field',
          ...(draft.values.localStartTime ? { initial_time: draft.values.localStartTime } : {}),
        },
        true,
      ),
      sectionBlock(
        draft.timeOrigin === 'schedule'
          ? 'Time default: AO schedule. Review before Save.'
          : draft.timeOrigin === 'user'
            ? 'Time: user entry; retained across AO/date changes.'
            : 'No unique schedule default. Choose and confirm the workout start time.',
      ),
      textInputBlock(
        'temperature',
        'Actual starting temperature °F (-40 to 120)',
        draft.values.temperatureF,
      ),
      input('pax', 'PAX attendance', {
        type: 'multi_users_select' as const,
        action_id: 'value',
        ...(draft.values.paxUserIds.length ? { initial_users: draft.values.paxUserIds } : {}),
      }),
      textInputBlock(
        'offset',
        'UTC offset (only required for repeated DST times, e.g. -06:00)',
        draft.values.offset,
        false,
        true,
      ),
      sectionBlock(
        'Only selected, verified local PAX receive points. Unresolved attendees/FNGs without local Slack IDs receive no credit until added through Modify.',
      ),
    ],
  };
}
export function editorErrorMessage(code: string): string {
  if (/CONFIGURATION|CONFIG_VERSION/.test(code))
    return 'Settings changed. Your proposed values are preserved. Review current settings before saving again.';
  if (/EXPIRED/.test(code))
    return 'This private form expired. Run /yeti log to reopen from current settings.';
  if (/LOCKED/.test(code)) return 'The season is locked. Your proposed values have not been saved.';
  if (/eligible local|FORBIDDEN/.test(code))
    return 'Verify the AO, local PAX membership and channel access. No entry was saved.';
  if (/future|workout|WORKOUT|date|time|offset/i.test(code))
    return 'Review the workout date/time and season. If the local time repeats at DST, enter its UTC offset.';
  return 'Review the required fields, whole temperature (-40 to 120°F), and local PAX. No entry was saved.';
}
export function privateStatusView(text: string) {
  return {
    type: 'modal' as const,
    callback_id: 'yeti_manual_status',
    title: plainText('Yeti Man entry'),
    close: plainText('Close'),
    blocks: [sectionBlock(text)],
  };
}
