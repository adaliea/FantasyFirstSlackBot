import type { App, BlockAction, ButtonAction } from '@slack/bolt';
import { getGame } from '../../state';
import { saveGame } from '../../utils/persistence';
import { createPlayer } from '../../types';
import { ACTION_JOIN_GAME, ACTION_LEAVE_GAME } from '../../constants';

export function registerJoinLeaveHandlers(app: App): void {
  app.action<BlockAction<ButtonAction>>(ACTION_JOIN_GAME, async ({ body, ack, respond, client, logger }) => {
    await ack();
    try {
      const workspaceId = body.team?.id ?? '';
      const userId = body.user.id;
      const gameId = body.actions[0].value ?? '';
      const game = getGame(workspaceId, gameId);

      if (!game) { await respond({ text: 'Game not found.', response_type: 'ephemeral' }); return; }
      if (game.isFull()) { await respond({ text: 'This game is full.', response_type: 'ephemeral' }); return; }
      if (game.isPlayerInGame(userId)) { await respond({ text: 'You are already in this game.', response_type: 'ephemeral' }); return; }

      const userInfo = await client.users.info({ user: userId });
      const name = userInfo.user?.profile?.real_name || userInfo.user?.name || userId;

      game.addPlayer(createPlayer(userId, name));
      await saveGame(workspaceId, game.toData());
      await updateGameMessage(game, workspaceId, body, client, logger);
    } catch (error) {
      logger.error('Error in joinGame', error);
      await respond({ text: 'Something went wrong.', response_type: 'ephemeral' });
    }
  });

  app.action<BlockAction<ButtonAction>>(ACTION_LEAVE_GAME, async ({ body, ack, respond, client, logger }) => {
    await ack();
    try {
      const workspaceId = body.team?.id ?? '';
      const userId = body.user.id;
      const gameId = body.actions[0].value ?? '';
      const game = getGame(workspaceId, gameId);

      if (!game) { await respond({ text: 'Game not found.', response_type: 'ephemeral' }); return; }

      game.removePlayer(userId);
      await saveGame(workspaceId, game.toData());
      await updateGameMessage(game, workspaceId, body, client, logger);
    } catch (error) {
      logger.error('Error in leaveGame', error);
      await respond({ text: 'Something went wrong.', response_type: 'ephemeral' });
    }
  });
}

async function updateGameMessage(
  game: NonNullable<ReturnType<typeof getGame>>,
  workspaceId: string,
  body: BlockAction<ButtonAction>,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  client: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  logger: any,
): Promise<void> {
  try {
    if (game.hasStarted) {
      for (const blocks of game.getDraftingBlocks()) {
        await client.chat.postMessage({
          channel: game.channelId,
          blocks,
          text: `${game.gameName}: draft update`,
        });
      }
    } else {
      const messageTs = (body.message as { ts?: string } | undefined)?.ts;
      if (messageTs) {
        await client.chat.update({
          channel: game.channelId,
          ts: messageTs,
          blocks: game.getGameRegistrationBlocks(),
          text: `Fantasy First: ${game.gameName}`,
        });
      }
    }
  } catch (error) {
    logger.error('Error updating game message', error);
  }
}
