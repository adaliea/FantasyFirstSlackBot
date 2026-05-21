export interface DistrictPoints {
  teamNumber: string;
  qualPoints: number;
  alliancePoints: number;
  elimsPoints: number;
  awardPoints: number;
  total: number;
}

export interface ScoringPickResult {
  round: number;
  pickIndex: number;
  teamNumber: string;
  teamName?: string;
  pointsContributed: number;
  rankAmongAvailable: number;
  poolSize: number;
  percentile: number;
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

export type ApiResponse = ScoringResponse | ScoringUnavailableResponse;

export function isScoringAvailable(r: ApiResponse): r is ScoringResponse {
  return (r as ScoringUnavailableResponse).scoringAvailable !== false;
}
