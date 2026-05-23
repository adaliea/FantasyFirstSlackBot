import type { App, BlockAction, ButtonAction } from '@slack/bolt';
import { Game } from '../../game/Game';
import { addGame, getGame } from '../../state';
import { saveGame } from '../../utils/persistence';
import { ACTION_START_GAME, ADMIN_USER_ID } from '../../constants';

export function registerStartGameHandler(app: App): void {
  app.action<BlockAction<ButtonAction>>(ACTION_START_GAME, async ({ body, ack, respond, client, logger }) => {
    await ack();
    try {
      const workspaceId = body.team?.id ?? '';
      const userId = body.user.id;
      const gameId = body.actions[0].value ?? '';
      const game = getGame(workspaceId, gameId);

      if (!game) { await respond({ text: 'Game not found.', response_type: 'ephemeral' }); return; }
      if (game.gameOwnerSlackId !== userId && userId !== ADMIN_USER_ID) {
        await respond({ text: 'Only the game creator can start this draft.', response_type: 'ephemeral' });
        return;
      }
      if (game.players.length === 0) {
        await respond({ text: 'At least one player must join before starting.', response_type: 'ephemeral' });
        return;
      }
      if (game.hasStarted) {
        await respond({ text: 'This draft has already started.', response_type: 'ephemeral' });
        return;
      }

      const splitGroups = game.splitPlayers();

      // Assign first group to the original game
      game.players.length = 0;
      game.players.push(...splitGroups[0]);

      const allGames: Game[] = [game];

      // Create sibling games for additional groups
      for (let i = 1; i < splitGroups.length; i++) {
        const sibling = Game.create({
          channelId: game.channelId,
          allianceSize: game.allianceSize,
          teams: [...game.availableTeams],
          gameOwnerSlackId: game.gameOwnerSlackId,
          gameName: `${game.gameName} ${i + 1}`,
          targetPlayersPerGame: game.targetPlayersPerGame,
          eventCode: game.eventCode,
        });
        sibling.players.push(...splitGroups[i]);
        addGame(workspaceId, sibling);
        allGames.push(sibling);
      }

      if (splitGroups.length > 1) {
        game.gameName = `${game.gameName} 1`;
      }

      for (const g of allGames) {
        g.start();
        const tsList: string[] = [];
        for (const blocks of g.getDraftingBlocks()) {
          const result = await client.chat.postMessage({
            channel: g.channelId,
            blocks,
            text: `${g.gameName}: draft started`,
          });
          if (result.ts) tsList.push(result.ts);
        }
        g.lastMessagesTsArray = tsList;
        await saveGame(workspaceId, g.toData());
      }
    } catch (error) {
      logger.error('Error starting game', error);
      await respond({ text: 'Something went wrong starting the draft.', response_type: 'ephemeral' });
    }
  });
}
