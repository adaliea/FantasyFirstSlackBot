import type { App, KnownBlock } from '@slack/bolt';
import { Game } from '../../game/Game';
import { getWorkspaceGames } from '../../state';
import { buildMessageLink, fitToSlackBlock, gameStatusLabel } from '../../utils/helpers';
import { CREATE_EVENT_CALLBACK_ID } from '../../constants';

const SLACK_BLOCK_TEXT_LIMIT = 2900;

function buildGameCard(game: Game, workspaceId: string): KnownBlock[] {
  const nextPlayer = game.getNextPlayerInDraft();
  const isDone = game.hasStarted && nextPlayer === null;
  const status = gameStatusLabel(game.hasStarted, isDone);

  const link = game.lastMessagesTsArray.length > 0
    ? `<${buildMessageLink(workspaceId, game.channelId, game.lastMessagesTsArray[0])}|View Game>`
    : '_no message link_';

  const headerText = [
    `*${game.gameName}*  ·  ${status}`,
    `${link}  ·  \`${game.uuid}\``,
    `Players: ${game.players.length}  ·  Teams per player: ${game.allianceSize}`,
  ].join('\n');

  const blocks: KnownBlock[] = [
    { type: 'section', text: { type: 'mrkdwn', text: headerText } },
  ];

  if (game.players.length > 0) {
    const table = game.getMarkdownTable();
    if (table.length <= SLACK_BLOCK_TEXT_LIMIT) {
      blocks.push({ type: 'section', text: { type: 'mrkdwn', text: table } });
    } else {
      // Fall back to compact list, chunking if still needed
      const compact = '```\n' + game.getCompactPlayerList() + '\n```';
      const chunks = chunkText(compact, SLACK_BLOCK_TEXT_LIMIT);
      for (const chunk of chunks) {
        blocks.push({ type: 'section', text: { type: 'mrkdwn', text: chunk } });
      }
    }
  }

  blocks.push({ type: 'divider' });
  return blocks;
}

function chunkText(text: string, maxLen: number): string[] {
  if (text.length <= maxLen) return [text];
  const lines = text.split('\n');
  const chunks: string[] = [];
  let current = '';
  for (const line of lines) {
    const addition = current.length > 0 ? '\n' + line : line;
    if (current.length + addition.length > maxLen) {
      if (current.length > 0) chunks.push(current);
      current = fitToSlackBlock(line, maxLen);
    } else {
      current += addition;
    }
  }
  if (current.length > 0) chunks.push(current);
  return chunks;
}

export function registerAppHomeHandler(app: App): void {
  app.event('app_home_opened', async ({ event, client, logger }) => {
    try {
      const userId = event.user;
      const workspaceId = (event as unknown as { team: string }).team;
      const wsGames = getWorkspaceGames(workspaceId);

      const ownedGames = [...wsGames.values()].filter(g => g.gameOwnerSlackId === userId);
      const participatingGames = [...wsGames.values()].filter(
        g => g.gameOwnerSlackId !== userId && g.isPlayerInGame(userId),
      );

      const blocks: KnownBlock[] = [
        {
          type: 'actions',
          elements: [{
            type: 'button',
            text: { type: 'plain_text', text: 'Create Event', emoji: true },
            action_id: CREATE_EVENT_CALLBACK_ID,
          }],
        },
      ];

      if (ownedGames.length > 0) {
        blocks.push(
          { type: 'header', text: { type: 'plain_text', text: 'Your Games', emoji: true } },
          { type: 'divider' },
        );
        for (const game of ownedGames) {
          blocks.push(...buildGameCard(game, workspaceId));
        }
      }

      if (participatingGames.length > 0) {
        blocks.push(
          { type: 'header', text: { type: 'plain_text', text: 'Games You\'re Playing In', emoji: true } },
          { type: 'divider' },
        );
        for (const game of participatingGames) {
          blocks.push(...buildGameCard(game, workspaceId));
        }
      }

      if (ownedGames.length === 0 && participatingGames.length === 0) {
        blocks.push({
          type: 'section',
          text: { type: 'mrkdwn', text: '_You have no active games. Click *Create Event* to get started!_' },
        });
      }

      // Slack App Home has a 100-block limit
      const cappedBlocks = blocks.slice(0, 100);

      await client.views.publish({
        user_id: userId,
        view: { type: 'home', blocks: cappedBlocks },
      });
    } catch (error) {
      logger.error('Error rendering App Home', error);
    }
  });
}
