import type { App } from '@slack/bolt';
import { Game } from '../../game/Game';
import { addGame, getAllGamesMap, getGame, getWorkspaceGames, removeGame } from '../../state';
import { deleteGame, saveGame } from '../../utils/persistence';
import { createPlayer } from '../../types';
import { getSlackIdFromMention } from '../../utils/helpers';
import { ADMIN_USER_ID } from '../../constants';

const HELP = `
*Fantasy First Admin Commands*
\`/debug help\`                          — Show this message
\`/debug games\`                         — List your games in this workspace
\`/debug all\`                           — List ALL games in workspace (admin only)
\`/debug game <uuid> info\`              — Show full game details
\`/debug game <uuid> players\`           — List players
\`/debug game <uuid> teams\`             — List available teams
\`/debug game <uuid> add @user ...\`     — Add one or more players
\`/debug game <uuid> kick @user\`        — Remove a player
\`/debug game <uuid> unstart\`           — Reset draft to registration
\`/debug game <uuid> reprint\`           — Post game message to channel again
\`/debug game <uuid> set target <n>\`   — Set target players per draft
\`/debug game <uuid> set alliance <n>\` — Set alliance (teams per player) size
\`/debug game <uuid> rename <name>\`     — Rename the game
\`/debug game <uuid> split-preview\`    — Preview how players would be split
\`/debug game <uuid> delete\`            — Permanently delete the game
`.trim();

export function registerAdminHandler(app: App): void {
  app.command('/debug', async ({ command, ack, respond, client, logger }) => {
    await ack();

    const workspaceId = command.team_id;
    const userId = command.user_id;
    const isAdmin = userId === ADMIN_USER_ID;
    const args = command.text.trim().split(/\s+/);

    const sub = args[0]?.toLowerCase();

    try {
      if (!sub || sub === 'help') {
        await respond({ text: HELP, response_type: 'ephemeral' });
        return;
      }

      if (sub === 'games') {
        const wsGames = [...getWorkspaceGames(workspaceId).values()];
        const owned = wsGames.filter(g => g.gameOwnerSlackId === userId);
        const text = owned.length === 0
          ? 'You have no games.'
          : owned.map(g => `• \`${g.uuid}\`  *${g.gameName}*  (${g.hasStarted ? 'started' : 'open'})`).join('\n');
        await respond({ text, response_type: 'ephemeral' });
        return;
      }

      if (sub === 'all') {
        if (!isAdmin) { await respond({ text: 'Admin only.', response_type: 'ephemeral' }); return; }
        const allMap = getAllGamesMap();
        const lines: string[] = [];
        for (const [wsId, wsMap] of allMap) {
          for (const g of wsMap.values()) {
            lines.push(`• \`${g.uuid}\`  *${g.gameName}*  ws:\`${wsId}\``);
          }
        }
        await respond({ text: lines.join('\n') || 'No games.', response_type: 'ephemeral' });
        return;
      }

      if (sub === 'game' && args.length >= 3) {
        const gameId = args[1];
        const game = getGame(workspaceId, gameId);
        if (!game) { await respond({ text: `Game \`${gameId}\` not found.`, response_type: 'ephemeral' }); return; }

        const isOwner = game.gameOwnerSlackId === userId;
        if (!isOwner && !isAdmin) {
          await respond({ text: 'You are not the owner of this game.', response_type: 'ephemeral' });
          return;
        }

        const cmd = args[2].toLowerCase();

        if (cmd === 'info') {
          await respond({ text: `\`\`\`${JSON.stringify(game.toData(), null, 2)}\`\`\``, response_type: 'ephemeral' });
          return;
        }

        if (cmd === 'players') {
          const text = game.players.map(p => `• ${p.name} (\`${p.slackId}\`)`).join('\n') || 'No players.';
          await respond({ text, response_type: 'ephemeral' });
          return;
        }

        if (cmd === 'teams') {
          const text = `Available teams: ${game.availableTeams.map(t => t.number).join(', ') || 'none'}`;
          await respond({ text, response_type: 'ephemeral' });
          return;
        }

        if (cmd === 'add' && args.length >= 4) {
          const added: string[] = [];
          for (const mention of args.slice(3)) {
            try {
              const playerId = getSlackIdFromMention(mention);
              if (game.isPlayerInGame(playerId)) continue;
              const info = await client.users.info({ user: playerId });
              const name = info.user?.profile?.real_name || info.user?.name || playerId;
              game.addPlayer(createPlayer(playerId, name));
              added.push(name);
            } catch {
              logger.warn('Could not resolve mention: %s', mention);
            }
          }
          await saveGame(workspaceId, game.toData());
          await respond({ text: `Added: ${added.join(', ') || 'none'}`, response_type: 'ephemeral' });
          return;
        }

        if (cmd === 'kick' && args.length >= 4) {
          const playerId = getSlackIdFromMention(args[3]);
          game.removePlayer(playerId);
          await saveGame(workspaceId, game.toData());
          await respond({ text: `Removed <@${playerId}>.`, response_type: 'ephemeral' });
          return;
        }

        if (cmd === 'unstart') {
          game.unStart();
          await saveGame(workspaceId, game.toData());
          await respond({ text: 'Game reset to registration phase.', response_type: 'ephemeral' });
          return;
        }

        if (cmd === 'reprint') {
          const tsList: string[] = [];
          if (game.hasStarted) {
            for (const blocks of game.getDraftingBlocks()) {
              const r = await client.chat.postMessage({ channel: game.channelId, blocks, text: game.gameName });
              if (r.ts) tsList.push(r.ts);
            }
          } else {
            const r = await client.chat.postMessage({
              channel: game.channelId,
              blocks: game.getGameRegistrationBlocks(),
              text: `Fantasy First: ${game.gameName}`,
            });
            if (r.ts) tsList.push(r.ts);
          }
          game.lastMessagesTsArray = tsList;
          await saveGame(workspaceId, game.toData());
          await respond({ text: 'Reprinted.', response_type: 'ephemeral' });
          return;
        }

        if (cmd === 'set' && args.length >= 5) {
          const field = args[3].toLowerCase();
          const value = parseInt(args[4], 10);
          if (isNaN(value)) { await respond({ text: 'Value must be a number.', response_type: 'ephemeral' }); return; }
          if (field === 'target') {
            game.targetPlayersPerGame = value;
          } else if (field === 'alliance') {
            game.allianceSize = value;
          } else {
            await respond({ text: `Unknown field "${field}". Use "target" or "alliance".`, response_type: 'ephemeral' });
            return;
          }
          await saveGame(workspaceId, game.toData());
          await respond({ text: `Set ${field} to ${value}.`, response_type: 'ephemeral' });
          return;
        }

        if (cmd === 'rename' && args.length >= 4) {
          const newName = args.slice(3).join(' ');
          game.gameName = newName;
          await saveGame(workspaceId, game.toData());
          await respond({ text: `Renamed to "${newName}".`, response_type: 'ephemeral' });
          return;
        }

        if (cmd === 'split-preview') {
          const groups = game.splitPlayers();
          const preview = groups.map((g, i) => `Group ${i + 1}: ${g.map(p => p.name).join(', ')}`).join('\n');
          await respond({ text: `\`\`\`${preview}\`\`\``, response_type: 'ephemeral' });
          return;
        }

        if (cmd === 'delete') {
          removeGame(workspaceId, gameId);
          await deleteGame(gameId);
          await respond({ text: `Game \`${gameId}\` deleted.`, response_type: 'ephemeral' });
          return;
        }

        await respond({ text: `Unknown subcommand "${cmd}". Try \`/debug help\`.`, response_type: 'ephemeral' });
        return;
      }

      await respond({ text: 'Unrecognized command. Try `/debug help`.', response_type: 'ephemeral' });
    } catch (error) {
      logger.error('Error in /debug command', error);
      await respond({ text: 'Something went wrong.', response_type: 'ephemeral' });
    }
  });
}
