import { Game } from '../game/Game';

export interface PickRecord {
  playerSlackId: string;
  playerName: string;
  round: number;         // 1-indexed
  pickIndex: number;     // 0-indexed within the player's selectedTeams
  teamNumber: string;
  poolBefore: string[];  // team numbers available immediately before this pick
}

export function reconstructPicks(game: Game): PickRecord[] {
  const players = game.players;
  const allianceSize = game.allianceSize;
  if (!game.hasStarted || players.length === 0) return [];

  // Rebuild the full team pool at draft start = available now + all selected
  const pool = new Set<string>();
  for (const t of game.availableTeams) pool.add(t.number);
  for (const p of players) {
    for (const t of p.selectedTeams) pool.add(t.number);
  }

  const picks: PickRecord[] = [];

  for (let round = 1; round <= allianceSize; round++) {
    const playerOrder = round % 2 === 0
      ? [...players].reverse()
      : [...players];

    for (const player of playerOrder) {
      const pickIndex = round - 1;
      if (player.selectedTeams.length <= pickIndex) continue; // player didn't pick this round

      const team = player.selectedTeams[pickIndex];
      picks.push({
        playerSlackId: player.slackId,
        playerName: player.name,
        round,
        pickIndex,
        teamNumber: team.number,
        poolBefore: [...pool],
      });
      pool.delete(team.number);
    }
  }

  return picks;
}
