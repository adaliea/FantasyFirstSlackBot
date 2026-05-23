export interface TbaTeamSimple {
  team_number: number;
  nickname: string;
  key: string;
}

export interface TbaRankingsResponse {
  rankings: Array<{
    team_key: string;
    rank: number;
  }>;
}

export interface TbaAllianceStatus {
  record: { wins: number; losses: number; ties: number };
  status: string;
  double_elim_round?: string;
}

export interface TbaAlliance {
  name?: string;
  picks: string[];
  status: TbaAllianceStatus;
}

export interface TbaMatchSimple {
  alliances: {
    red: { team_keys: string[]; score: number };
    blue: { team_keys: string[]; score: number };
  };
  winning_alliance: 'red' | 'blue' | '';
  comp_level: string;
}

export interface TbaAwardRecipient {
  team_key: string | null;
  awardee: string | null;
}

export interface TbaAward {
  award_type: number;
  recipient_list: TbaAwardRecipient[];
}
