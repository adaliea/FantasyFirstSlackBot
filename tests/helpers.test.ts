import { getSlackIdFromMention, buildMessageLink, fitToSlackBlock, gameStatusLabel } from '../src/utils/helpers';

describe('getSlackIdFromMention', () => {
  it('extracts ID from full mention with display name', () => {
    expect(getSlackIdFromMention('<@U12345|username>')).toBe('U12345');
  });

  it('extracts ID from mention without display name', () => {
    expect(getSlackIdFromMention('<@U12345>')).toBe('U12345');
  });

  it('throws for an invalid mention format', () => {
    expect(() => getSlackIdFromMention('not-a-mention')).toThrow();
    expect(() => getSlackIdFromMention('@user')).toThrow();
  });
});

describe('buildMessageLink', () => {
  it('builds the correct Slack archive link', () => {
    const link = buildMessageLink('T12345', 'C67890', '1234567890.123456');
    expect(link).toBe('https://T12345.slack.com/archives/C67890/p1234567890123456');
  });

  it('removes the dot from the timestamp', () => {
    const link = buildMessageLink('TEAM', 'CHAN', '111.222');
    expect(link).toContain('p111222');
  });
});

describe('fitToSlackBlock', () => {
  it('returns text unchanged when within limit', () => {
    const text = 'short text';
    expect(fitToSlackBlock(text, 100)).toBe(text);
  });

  it('truncates text exceeding the limit', () => {
    const text = 'a'.repeat(200);
    const result = fitToSlackBlock(text, 100);
    expect(result.length).toBeLessThanOrEqual(100);
    expect(result.endsWith('...')).toBe(true);
  });
});

describe('gameStatusLabel', () => {
  it('returns Registration Open when not started', () => {
    expect(gameStatusLabel(false, false)).toBe('Registration Open');
  });

  it('returns Draft Complete when started and done', () => {
    expect(gameStatusLabel(true, true)).toBe('Draft Complete');
  });

  it('returns Draft In Progress when started and not done', () => {
    expect(gameStatusLabel(true, false)).toBe('Draft In Progress');
  });
});
