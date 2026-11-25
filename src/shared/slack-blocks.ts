/** Small typed builders for the Block Kit shapes shared by Home and modal views. */
export const plainText = (text: string) => ({ type: 'plain_text' as const, text });
export const markdownText = (text: string) => ({ type: 'mrkdwn' as const, text });

export const headerBlock = (text: string) => ({
  type: 'header' as const,
  text: plainText(text),
});

export const sectionBlock = (text: string) => ({
  type: 'section' as const,
  text: markdownText(text),
});

export const button = (text: string, actionId: string, value?: string) => ({
  type: 'button' as const,
  text: plainText(text),
  action_id: actionId,
  ...(value === undefined ? {} : { value }),
});

export const actionBlock = (...elements: ReturnType<typeof button>[]) => ({
  type: 'actions' as const,
  elements,
});

export const textInputBlock = (
  blockId: string,
  label: string,
  initialValue = '',
  multiline = false,
  optional = false,
) => ({
  type: 'input' as const,
  block_id: blockId,
  label: plainText(label),
  element: {
    type: 'plain_text_input' as const,
    action_id: 'value',
    initial_value: initialValue,
    ...(multiline ? { multiline: true } : {}),
  },
  ...(optional ? { optional: true } : {}),
});
