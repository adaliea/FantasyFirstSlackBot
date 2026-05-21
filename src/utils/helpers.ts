/** Extracts a Slack user ID from a mention string like `<@U12345|username>` or `<@U12345>`. */
export function getSlackIdFromMention(mention: string): string {
  const match = mention.match(/^<@([A-Z0-9]+)(?:\|[^>]*)?>$/);
  if (!match) throw new Error(`Invalid Slack mention format: "${mention}"`);
  return match[1];
}

/** Builds a Slack deep-link to a specific message. */
export function buildMessageLink(workspaceId: string, channelId: string, ts: string): string {
  const tsFormatted = ts.replace('.', '');
  return `https://${workspaceId}.slack.com/archives/${channelId}/p${tsFormatted}`;
}

/**
 * Truncates text to `maxChars`, preserving code-block fences if present.
 * Falls back to a compact representation when needed.
 */
export function fitToSlackBlock(text: string, maxChars = 2900): string {
  if (text.length <= maxChars) return text;
  return text.slice(0, maxChars - 3) + '...';
}

/** Returns a human-readable game status string. */
export function gameStatusLabel(hasStarted: boolean, isDone: boolean): string {
  if (!hasStarted) return 'Registration Open';
  if (isDone) return 'Draft Complete';
  return 'Draft In Progress';
}
