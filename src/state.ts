import { Game } from './game/Game';
import { GameData } from './types';

const games = new Map<string, Map<string, Game>>();

export function initializeState(allGames: Record<string, GameData[]>): void {
  for (const [workspaceId, workspaceGames] of Object.entries(allGames)) {
    const wsMap = new Map<string, Game>();
    for (const data of workspaceGames) {
      wsMap.set(data.uuid, Game.fromData(data));
    }
    games.set(workspaceId, wsMap);
  }
}

export function getWorkspaceGames(workspaceId: string): Map<string, Game> {
  if (!games.has(workspaceId)) {
    games.set(workspaceId, new Map());
  }
  return games.get(workspaceId)!;
}

export function getGame(workspaceId: string, gameId: string): Game | undefined {
  return getWorkspaceGames(workspaceId).get(gameId);
}

export function addGame(workspaceId: string, game: Game): void {
  getWorkspaceGames(workspaceId).set(game.uuid, game);
}

export function removeGame(workspaceId: string, gameId: string): void {
  getWorkspaceGames(workspaceId).delete(gameId);
}

export function getAllGamesMap(): Map<string, Map<string, Game>> {
  return games;
}
