import type { ModalView } from '@slack/bolt';
import { CREATE_EVENT_CALLBACK_ID, PICK_TEAM_CALLBACK_ID } from '../constants';

export const CREATE_EVENT_MODAL: ModalView = {
  type: 'modal',
  callback_id: CREATE_EVENT_CALLBACK_ID,
  title: { type: 'plain_text', text: 'Create an Event', emoji: true },
  submit: { type: 'plain_text', text: 'Submit', emoji: true },
  close: { type: 'plain_text', text: 'Cancel', emoji: true },
  blocks: [
    {
      type: 'input',
      label: { type: 'plain_text', text: 'Event Name', emoji: true },
      element: { type: 'plain_text_input', action_id: 'event_name' },
    },
    {
      type: 'input',
      label: {
        type: 'plain_text',
        text: 'TBA event code or comma-separated team list (e.g. 254,1678,7157)',
        emoji: true,
      },
      element: { type: 'plain_text_input', multiline: true, action_id: 'teams' },
    },
    {
      type: 'input',
      label: { type: 'plain_text', text: 'Channel', emoji: true },
      element: { type: 'channels_select', action_id: 'channel' },
    },
    {
      type: 'input',
      label: { type: 'plain_text', text: 'Teams per player (alliance size)', emoji: true },
      element: { type: 'number_input', is_decimal_allowed: false, action_id: 'teams_per_alliance' },
    },
    {
      type: 'input',
      label: { type: 'plain_text', text: 'Target players per draft (0 = auto)', emoji: true },
      element: { type: 'number_input', is_decimal_allowed: false, action_id: 'target_player_count_per_game' },
    },
    {
      type: 'context',
      elements: [{
        type: 'mrkdwn',
        text: 'Setting *0* for target players auto-sizes based on available teams. Otherwise players are split into drafts of approximately that size.',
      }],
    },
  ],
};

export function buildPickATeamModal(callbackId: string, playerMention: string, availableTeams: string): ModalView {
  return {
    type: 'modal',
    callback_id: callbackId,
    title: { type: 'plain_text', text: 'Pick A Team', emoji: true },
    submit: { type: 'plain_text', text: 'Submit Pick', emoji: true },
    close: { type: 'plain_text', text: 'Cancel', emoji: true },
    blocks: [
      { type: 'divider' },
      {
        type: 'section',
        text: { type: 'mrkdwn', text: `*It's ${playerMention}'s turn to pick!*` },
      },
      { type: 'divider' },
      {
        type: 'context',
        elements: [{ type: 'mrkdwn', text: '*Available Teams:*' }],
      },
      {
        type: 'context',
        elements: [{ type: 'plain_text', text: availableTeams, emoji: true }],
      },
      {
        type: 'input',
        element: { type: 'number_input', is_decimal_allowed: false, action_id: PICK_TEAM_CALLBACK_ID },
        label: { type: 'plain_text', text: 'Enter your pick (e.g. 254)', emoji: true },
      },
      {
        type: 'section',
        text: { type: 'plain_text', text: 'If you cannot submit, verify the team number is available and it is your turn.', emoji: true },
      },
    ],
  };
}

export function buildPickATeamErrorModal(
  callbackId: string,
  playerMention: string,
  availableTeams: string,
  errorMessage: string,
): ModalView {
  return {
    ...buildPickATeamModal(callbackId, playerMention, availableTeams),
    blocks: [
      ...buildPickATeamModal(callbackId, playerMention, availableTeams).blocks!,
      {
        type: 'context',
        elements: [
          {
            type: 'image',
            image_url: 'https://api.slack.com/img/blocks/bkb_template_images/notificationsWarningIcon.png',
            alt_text: 'warning',
          },
          { type: 'mrkdwn', text: `*${errorMessage}*` },
        ],
      },
    ],
  };
}
