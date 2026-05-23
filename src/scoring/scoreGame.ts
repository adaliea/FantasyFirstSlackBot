import { Game } from '../game/Game';
import { TbaCachedClient } from './tbaCachedClient';
import { calculateDistrictPoints, DistrictPoints, parseTeamNames } from './districtPoints';
import { reconstructPicks } from './draftHistory';

export interface ScoringPickResult {
  round: number;
  pickIndex: number;
  teamNumber: string;
  teamName?: string;
  pointsContributed: number;
  rankAmongAvailable: number;  // 1 = best possible pick
  poolSize: number;
  percentile: number;          // (poolSize - rank + 1) / poolSize; 1.0 = best
}

export interface ScoringPlayer {
  slackId: string;
  name: string;
  totalPoints: number;
  picks: ScoringPickResult[];
}

export interface ScoringResponse {
  game: {
    uuid: string;
    gameName: string;
    eventCode: string;
    allianceSize: number;
    channelId: string;
  };
  event: {
    code: string;
    isFinal: boolean;
  };
  districtPoints: Record<string, DistrictPoints>;
  players: ScoringPlayer[];
}

export interface ScoringUnavailableResponse {
  scoringAvailable: false;
  reason: string;
}

export async function scoreGame(
  game: Game,
  tbaClient: TbaCachedClient,
): Promise<ScoringResponse | ScoringUnavailableResponse> {
  const eventCode = game.eventCode;
  if (!eventCode) {
    return { scoringAvailable: false, reason: 'No event code attached to this game. Use /debug game <uuid> set event-code <code> to enable scoring.' };
  }

  const [tbaTeams, tbaRankings, tbaAlliances, tbaMatches, tbaAwards] = await Promise.all([
    tbaClient.getTeams(eventCode),
    tbaClient.getRankings(eventCode),
    tbaClient.getAlliances(eventCode),
    tbaClient.getMatches(eventCode),
    tbaClient.getAwards(eventCode),
  ]);

  const districtPoints = calculateDistrictPoints({
    rankings: tbaRankings ? tbaRankings.rankings.sort((a, b) => a.rank - b.rank).map(r => r.team_key.replace('frc', '')) : [],
    alliances: tbaAlliances,
    matches: tbaMatches,
    awards: tbaAwards,
    teams: tbaTeams,
  });

  const teamNames = parseTeamNames(tbaTeams);

  const picks = reconstructPicks(game);
  // Group picks by player
  const picksByPlayer = new Map<string, typeof picks>();
  for (const pick of picks) {
    if (!picksByPlayer.has(pick.playerSlackId)) picksByPlayer.set(pick.playerSlackId, []);
    picksByPlayer.get(pick.playerSlackId)!.push(pick);
  }

  const players: ScoringPlayer[] = game.players.map(player => {
    const playerPicks = picksByPlayer.get(player.slackId) ?? [];
    let totalPoints = 0;

    const scoredPicks: ScoringPickResult[] = playerPicks.map(pick => {
      const pts = districtPoints[pick.teamNumber];
      const pointsContributed = pts?.total ?? 0;
      totalPoints += pointsContributed;

      // Rank among available: sort pool by total desc, ties broken by team number asc
      const poolSorted = pick.poolBefore
        .map(tn => ({ tn, total: districtPoints[tn]?.total ?? 0 }))
        .sort((a, b) => b.total - a.total || parseInt(a.tn) - parseInt(b.tn));

      const rankAmongAvailable = poolSorted.findIndex(p => p.tn === pick.teamNumber) + 1;
      const poolSize = pick.poolBefore.length;
      const percentile = poolSize > 0 ? (poolSize - rankAmongAvailable + 1) / poolSize : 1;

      return {
        round: pick.round,
        pickIndex: pick.pickIndex,
        teamNumber: pick.teamNumber,
        teamName: teamNames.get(pick.teamNumber),
        pointsContributed,
        rankAmongAvailable: rankAmongAvailable || 1,
        poolSize,
        percentile,
      };
    });

    return { slackId: player.slackId, name: player.name, totalPoints, picks: scoredPicks };
  });

  const isFinal = tbaAlliances.length > 0 &&
    tbaAlliances.every(a => a.status?.status === 'won' || a.status?.status === 'eliminated');

  return {
    game: {
      uuid: game.uuid,
      gameName: game.gameName,
      eventCode,
      allianceSize: game.allianceSize,
      channelId: game.channelId,
    },
    event: { code: eventCode, isFinal },
    districtPoints,
    players,
  };
}
