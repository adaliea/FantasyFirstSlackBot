import { PrismaClient, Prisma } from '@prisma/client';
import { GameData, Player, Team } from '../types';

type JsonValue = Prisma.InputJsonValue;

export const prisma = new PrismaClient();

function toGameData(row: {
  uuid: string;
  workspaceId: string;
  channelId: string;
  allianceSize: number;
  availableTeams: unknown;
  players: unknown;
  gameOwnerSlackId: string;
  gameName: string;
  hasStarted: boolean;
  turnCount: number;
  lastMessagesTsArray: unknown;
  targetPlayersPerGame: number;
}): GameData {
  return {
    uuid: row.uuid,
    channelId: row.channelId,
    allianceSize: row.allianceSize,
    availableTeams: row.availableTeams as Team[],
    players: row.players as Player[],
    gameOwnerSlackId: row.gameOwnerSlackId,
    gameName: row.gameName,
    hasStarted: row.hasStarted,
    turnCount: row.turnCount,
    lastMessagesTsArray: row.lastMessagesTsArray as string[],
    targetPlayersPerGame: row.targetPlayersPerGame,
  };
}

export async function loadAllGames(): Promise<Record<string, GameData[]>> {
  const rows = await prisma.game.findMany();
  const result: Record<string, GameData[]> = {};
  for (const row of rows) {
    if (!result[row.workspaceId]) result[row.workspaceId] = [];
    result[row.workspaceId].push(toGameData(row));
  }
  return result;
}

export async function saveGame(workspaceId: string, game: GameData): Promise<void> {
  const toJson = (v: unknown) => v as JsonValue;

  const payload = {
    uuid: game.uuid,
    workspaceId,
    channelId: game.channelId,
    allianceSize: game.allianceSize,
    availableTeams: toJson(game.availableTeams),
    players: toJson(game.players),
    gameOwnerSlackId: game.gameOwnerSlackId,
    gameName: game.gameName,
    hasStarted: game.hasStarted,
    turnCount: game.turnCount,
    lastMessagesTsArray: toJson(game.lastMessagesTsArray),
    targetPlayersPerGame: game.targetPlayersPerGame,
  };

  await prisma.$transaction([
    prisma.workspace.upsert({
      where: { id: workspaceId },
      create: { id: workspaceId },
      update: {},
    }),
    prisma.game.upsert({
      where: { uuid: game.uuid },
      create: payload,
      update: {
        availableTeams: toJson(game.availableTeams),
        players: toJson(game.players),
        gameName: game.gameName,
        hasStarted: game.hasStarted,
        turnCount: game.turnCount,
        lastMessagesTsArray: toJson(game.lastMessagesTsArray),
        targetPlayersPerGame: game.targetPlayersPerGame,
        allianceSize: game.allianceSize,
        channelId: game.channelId,
      },
    }),
  ]);
}

export async function deleteGame(gameId: string): Promise<void> {
  await prisma.game.delete({ where: { uuid: gameId } });
}
