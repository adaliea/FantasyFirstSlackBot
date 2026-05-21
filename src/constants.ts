export const ADMIN_USER_ID = process.env.ADMIN_USER_ID ?? '';
export const PORT = parseInt(process.env.PORT ?? '3000', 10);

export const CREATE_EVENT_CALLBACK_ID = 'createEventButton';
export const PICK_TEAM_CALLBACK_ID = 'team_pick_number';

export const ACTION_JOIN_GAME = 'joinGame';
export const ACTION_LEAVE_GAME = 'leaveGame';
export const ACTION_START_GAME = 'startGame';
export const ACTION_PICK_TEAM_BUTTON = 'pick_team_button';
