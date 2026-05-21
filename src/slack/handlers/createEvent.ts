import type { App, ButtonAction } from '@slack/bolt';
import { Game } from '../../game/Game';
import { addGame } from '../../state';
import { saveGame } from '../../utils/persistence';
import { getTeamsAtEvent, parseTeamList } from '../../api/tba';
import { CREATE_EVENT_MODAL } from '../../views/screens';
import { CREATE_EVENT_CALLBACK_ID } from '../../constants';

export function registerCreateEventHandlers(app: App): void {
  app.action(CREATE_EVENT_CALLBACK_ID, async ({ ack, body, client, logger }) => {
    await ack();
    try {
      await client.views.open({
        trigger_id: (body as { trigger_id: string }).trigger_id,
        view: CREATE_EVENT_MODAL,
      });
    } catch (error) {
      logger.error('Error opening create event modal', error);
    }
  });

  app.view(CREATE_EVENT_CALLBACK_ID, async ({ ack, body, view, client, logger }) => {
    const values = view.state.values;
    const workspaceId = body.team?.id ?? body.enterprise?.id ?? '';
    const userId = body.user.id;

    const teamListValue = extractValue(values, 'teams') ?? '';
    const selectedChannel = extractSelectedChannel(values, 'channel') ?? '';
    const allianceSize = parseInt(extractValue(values, 'teams_per_alliance') ?? '3', 10);
    const targetPlayerCount = parseInt(extractValue(values, 'target_player_count_per_game') ?? '0', 10);
    const gameName = extractValue(values, 'event_name') ?? 'Fantasy First';

    if (!selectedChannel) {
      await ack({ response_action: 'errors', errors: { channel: 'Please select a channel' } });
      return;
    }
    if (isNaN(allianceSize) || allianceSize < 1) {
      await ack({ response_action: 'errors', errors: { teams_per_alliance: 'Must be at least 1' } });
      return;
    }

    await ack();

    try {
      const tbaApiKey = process.env.TBA_API_KEY ?? '';
      const teams = teamListValue.includes(',')
        ? parseTeamList(teamListValue)
        : await getTeamsAtEvent(teamListValue.trim(), tbaApiKey);

      if (teams.length === 0) {
        logger.warn('No teams found for input: %s', teamListValue);
        return;
      }

      const game = Game.create({
        channelId: selectedChannel,
        allianceSize,
        teams,
        gameOwnerSlackId: userId,
        gameName,
        targetPlayersPerGame: targetPlayerCount,
      });

      addGame(workspaceId, game);

      const result = await client.chat.postMessage({
        channel: selectedChannel,
        blocks: game.getGameRegistrationBlocks(),
        text: `Fantasy First game created: ${gameName}`,
      });

      game.lastMessagesTsArray = result.ts ? [result.ts] : [];
      await saveGame(workspaceId, game.toData());
    } catch (error) {
      logger.error('Error creating game', error);
    }
  });
}

function extractValue(values: Record<string, Record<string, { value?: string | null }>>, actionId: string): string | undefined {
  for (const block of Object.values(values)) {
    if (block[actionId]?.value != null) return block[actionId].value ?? undefined;
  }
  return undefined;
}

function extractSelectedChannel(values: Record<string, Record<string, { selected_channel?: string | null }>>, actionId: string): string | undefined {
  for (const block of Object.values(values)) {
    if (block[actionId]?.selected_channel != null) return block[actionId].selected_channel ?? undefined;
  }
  return undefined;
}
