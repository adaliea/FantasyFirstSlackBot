import { randomUUID } from 'crypto';

export interface Team {
  name: string;
  number: string;
  uuid: string;
}

export function createTeam(number: string, name?: string): Team {
  return { name: name ?? number, number, uuid: randomUUID() };
}

export interface Player {
  slackId: string;
  name: string;
  selectedTeams: Team[];
}

export function createPlayer(slackId: string, name: string): Player {
  return { slackId, name, selectedTeams: [] };
}

export interface GameData {
  uuid: string;
  channelId: string;
  allianceSize: number;
  availableTeams: Team[];
  players: Player[];
  gameOwnerSlackId: string;
  gameName: string;
  hasStarted: boolean;
  turnCount: number;
  lastMessagesTsArray: string[];
  targetPlayersPerGame: number;
  eventCode?: string;
}
