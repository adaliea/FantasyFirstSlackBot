import type { App, BlockAction, ButtonAction } from '@slack/bolt';
import { getGame } from '../../state';
import { saveGame } from '../../utils/persistence';
import { buildPickATeamErrorModal, buildPickATeamModal } from '../../views/screens';
import { ACTION_PICK_TEAM_BUTTON, PICK_TEAM_CALLBACK_ID } from '../../constants';

export function registerPickTeamHandlers(app: App): void {
  // "Pick A Team" button → opens the number-input modal
  app.action<BlockAction<ButtonAction>>(ACTION_PICK_TEAM_BUTTON, async ({ body, ack, respond, client, logger }) => {
    await ack();
    try {
      const workspaceId = body.team?.id ?? '';
      const userId = body.user.id;
      const gameId = body.actions[0].value ?? '';
      const game = getGame(workspaceId, gameId);

      if (!game) { await respond({ text: 'Game not found.', response_type: 'ephemeral' }); return; }

      const nextPlayer = game.getNextPlayerInDraft();
      if (!nextPlayer) { await respond({ text: 'The draft is already over.', response_type: 'ephemeral' }); return; }
      if (nextPlayer.slackId !== userId) { await respond({ text: 'It is not your turn to pick.', response_type: 'ephemeral' }); return; }

      const teamsStr = game.availableTeams.map(t => t.number).join(', ');
      const callbackId = `${PICK_TEAM_CALLBACK_ID},${gameId}`;

      await client.views.open({
        trigger_id: (body as { trigger_id: string }).trigger_id,
        view: buildPickATeamModal(callbackId, `<@${nextPlayer.slackId}>`, teamsStr),
      });
    } catch (error) {
      logger.error('Error opening pick team modal', error);
      await respond({ text: 'Something went wrong.', response_type: 'ephemeral' });
    }
  });

  // Modal submission: player typed a team number
  app.view(new RegExp(`^${PICK_TEAM_CALLBACK_ID},.+$`), async ({ body, ack, view, client, logger }) => {
    try {
      const workspaceId = body.team?.id ?? body.enterprise?.id ?? '';
      const userId = body.user.id;
      const callbackId = view.callback_id;
      const gameId = callbackId.split(',')[1];
      const game = getGame(workspaceId, gameId);

      if (!game) {
        await ack({ response_action: 'errors', errors: { [PICK_TEAM_CALLBACK_ID]: 'Game not found.' } });
        return;
      }

      const teamNumber = extractValue(view.state.values, PICK_TEAM_CALLBACK_ID) ?? '';
      const teamsStr = game.availableTeams.map(t => t.number).join(', ');
      const nextPlayer = game.getNextPlayerInDraft();

      if (!nextPlayer || nextPlayer.slackId !== userId) {
        await ack({ response_action: 'errors', errors: { [PICK_TEAM_CALLBACK_ID]: 'It\'s not your turn to pick.' } });
        return;
      }

      const pickedTeam = game.pickTeamByNumber(teamNumber);
      if (!pickedTeam) {
        await ack({
          response_action: 'update',
          view: buildPickATeamErrorModal(
            callbackId,
            `<@${nextPlayer.slackId}>`,
            teamsStr,
            'That team is not available. Please choose from the list.',
          ),
        });
        return;
      }

      await ack();

      const pickerName = nextPlayer.name;
      const newTsList: string[] = [];

      for (const blocks of game.getDraftingBlocks()) {
        const result = await client.chat.postMessage({
          channel: game.channelId,
          blocks,
          text: `${game.gameName}: ${pickerName} picked ${pickedTeam.name}`,
        });
        if (result.ts) newTsList.push(result.ts);
      }

      // Collapse the previous drafting message(s) into a single summary line
      if (game.lastMessagesTsArray.length > 0) {
        await client.chat.update({
          channel: game.channelId,
          ts: game.lastMessagesTsArray[0],
          blocks: [{
            type: 'section',
            text: { type: 'mrkdwn', text: `${game.gameName}: *${pickerName}* picked ${pickedTeam.name}` },
          }],
          text: `${game.gameName}: ${pickerName} picked ${pickedTeam.name}`,
        });
        for (const ts of game.lastMessagesTsArray.slice(1)) {
          await client.chat.delete({ channel: game.channelId, ts });
        }
      }

      game.lastMessagesTsArray = newTsList;
      await saveGame(workspaceId, game.toData());
    } catch (error) {
      logger.error('Error processing team pick', error);
    }
  });
}

function extractValue(values: Record<string, Record<string, { value?: string | null }>>, actionId: string): string | undefined {
  for (const block of Object.values(values)) {
    if (block[actionId]?.value != null) return block[actionId].value ?? undefined;
  }
  return undefined;
}
