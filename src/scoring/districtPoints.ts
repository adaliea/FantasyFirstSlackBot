import { erfinv } from './erfinv';
import { TbaAlliance, TbaAward, TbaMatchSimple, TbaRankingsResponse, TbaTeamSimple } from './tbaTypes';

export interface DistrictPoints {
  teamNumber: string;
  qualPoints: number;
  alliancePoints: number;
  elimsPoints: number;
  awardPoints: number;
  total: number;
}

// --- Internal parsed types (mirrors the Python dataclasses) ---

interface AllianceInfo {
  allianceNumber: number;
  teams: string[];      // team numbers, captain first
  wins: number;
  placement: number;    // 1=winner, 2=runner-up, 3, 4, 6, 8, -1=unknown
}

type MatchWinner = 'red' | 'blue' | 'tie';

interface MatchInfo {
  redAlliance: string[];
  blueAlliance: string[];
  winner: MatchWinner;
  isQuals: boolean;
  isFinals: boolean;
}

type AwardType = 'impact' | 'engineering_inspiration' | 'rookie_all_star' | 'other';

interface AwardInfo {
  teamNumber: string;
  awardType: AwardType;
}

// --- TBA parsing helpers ---

function teamKey(key: string): string {
  return key.replace('frc', '').trim();
}

function allianceKeyToNumber(key: string | number | undefined, index: number): number {
  if (typeof key === 'number') return key + 1;
  if (!key) return index + 1;
  const s = String(key).toLowerCase().replace(/\s/g, '').replace('alliance', '');
  const n = parseFloat(s);
  return isNaN(n) ? index + 1 : n;
}

export function parseRankings(raw: TbaRankingsResponse | null): string[] {
  if (!raw || !raw.rankings) return [];
  const sorted = [...raw.rankings].sort((a, b) => a.rank - b.rank);
  return sorted.map(r => teamKey(r.team_key));
}

export function parseAlliances(raw: TbaAlliance[]): AllianceInfo[] {
  return raw.map((a, i) => {
    const allianceNumber = allianceKeyToNumber(a.name, i);
    const teams = a.picks.map(teamKey);
    const wins = a.status?.record?.wins ?? 0;

    let placement = -1;
    switch (a.status?.double_elim_round) {
      case 'Finals':   placement = 1; break;
      case 'Round 5':  placement = 3; break;
      case 'Round 4':  placement = 4; break;
      case 'Round 3':  placement = 6; break;
      case 'Round 2':  placement = 8; break;
    }
    if (placement === 1 && a.status?.status === 'eliminated') placement = 2;

    return { allianceNumber, teams, wins, placement };
  }).sort((a, b) => a.allianceNumber - b.allianceNumber);
}

export function parseMatches(raw: TbaMatchSimple[]): MatchInfo[] {
  return raw.map(m => {
    let winner: MatchWinner = 'tie';
    if (m.winning_alliance === 'red') winner = 'red';
    else if (m.winning_alliance === 'blue') winner = 'blue';
    return {
      redAlliance: m.alliances.red.team_keys.map(teamKey),
      blueAlliance: m.alliances.blue.team_keys.map(teamKey),
      winner,
      isQuals: m.comp_level === 'qm',
      isFinals: m.comp_level === 'f',
    };
  });
}

export function parseAwards(raw: TbaAward[]): AwardInfo[] {
  const out: AwardInfo[] = [];
  for (const award of raw) {
    // Skip: Impact Award (1), EI trophy (2), Rookie All-Star (68)
    if ([1, 2, 68].includes(award.award_type)) continue;

    let awardType: AwardType;
    switch (award.award_type) {
      case 0:  awardType = 'impact'; break;
      case 9:  awardType = 'engineering_inspiration'; break;
      case 10: awardType = 'rookie_all_star'; break;
      default: awardType = 'other';
    }

    for (const recipient of award.recipient_list) {
      if (!recipient.team_key) continue;
      if (recipient.awardee) continue;  // individual award, not team
      out.push({ teamNumber: teamKey(recipient.team_key), awardType });
    }
  }
  return out;
}

export function parseTeamNames(raw: TbaTeamSimple[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const t of raw) {
    map.set(String(t.team_number), t.nickname || String(t.team_number));
  }
  return map;
}

// --- Scoring functions (ported 1:1 from Python) ---

const A = 1.07;

function calculateQualPoints(rankings: string[]): Record<string, number> {
  const n = rankings.length;
  if (n === 0) return {};
  const normalizer = erfinv(1 / A);

  const out: Record<string, number> = {};
  for (let i = 0; i < rankings.length; i++) {
    const r = i + 1;
    const x = (n - 2 * r + 2) / (A * n);
    const raw = erfinv(x);
    const pts = 12 + (10 / normalizer) * raw;
    out[rankings[i]] = Math.ceil(pts);
  }
  return out;
}

function allianceSize(alliances: AllianceInfo[]): number {
  let min = Number.MAX_SAFE_INTEGER;
  for (const a of alliances) min = Math.min(min, a.teams.length);
  return min === Number.MAX_SAFE_INTEGER ? 0 : min;
}

function calculateAllianceCaptainPoints(alliances: AllianceInfo[]): Record<string, number> {
  const size = allianceSize(alliances);
  const maxPoints = (size - 1) * alliances.length + 1;
  const out: Record<string, number> = {};
  for (const a of alliances) {
    const captain = a.teams[0];
    out[captain] = maxPoints - a.allianceNumber;
  }
  return out;
}

// _is_serpentine: IRI events are not serpentine, but function is otherwise unused.
// Ported for parity.
export function isSerpentine(eventCode: string): boolean {
  return !eventCode.includes('iri');
}

function teamsAcceptedByOrder(alliances: AllianceInfo[]): string[] {
  const size = allianceSize(alliances);
  if (size <= 1) return [];

  // Flatten picks (excluding captains at index 0), column by column
  const flatPicks: string[] = [];
  for (let pickCol = 1; pickCol < size; pickCol++) {
    for (const a of alliances) {
      if (a.teams.length > pickCol) flatPicks.push(a.teams[pickCol]);
    }
  }

  const pickCount = size - 1;
  const allianceCount = alliances.length;
  let reverseSection = false;
  const out: string[] = [];

  for (let i = 0; i < pickCount; i++) {
    const start = i * allianceCount;
    const end = (i + 1) * allianceCount;
    let section = flatPicks.slice(start, end);
    if (reverseSection) section = [...section].reverse();
    out.push(...section);
    reverseSection = !reverseSection;
  }
  return out;
}

function calculateDraftAcceptancePoints(alliances: AllianceInfo[]): Record<string, number> {
  const size = allianceSize(alliances);
  const maxPoints = (size - 1) * alliances.length + 1;
  const out: Record<string, number> = {};
  const ordered = teamsAcceptedByOrder(alliances);
  for (let i = 0; i < ordered.length; i++) {
    out[ordered[i]] = maxPoints - (i + 1);
  }
  return out;
}

function calculateElimsPoints(alliances: AllianceInfo[], matches: MatchInfo[]): Record<string, number> {
  const allianceLookup = new Map<string, AllianceInfo>();
  const elimsWon = new Map<string, number>();
  const finalsWon = new Map<string, number>();
  const out: Record<string, number> = {};

  for (const a of alliances) {
    for (const team of a.teams) {
      allianceLookup.set(team, a);
      elimsWon.set(team, 0);
      finalsWon.set(team, 0);
      out[team] = 0;
    }
  }

  for (const match of matches) {
    if (match.isQuals || match.winner === 'tie') continue;
    const winners = match.winner === 'red' ? match.redAlliance : match.blueAlliance;
    for (const team of winners) {
      elimsWon.set(team, (elimsWon.get(team) ?? 0) + 1);
      if (match.isFinals) finalsWon.set(team, (finalsWon.get(team) ?? 0) + 1);
    }
  }

  for (const [team, wins] of elimsWon) {
    const alliance = allianceLookup.get(team);
    if (!alliance || !alliance.wins) continue;

    let alliancePoints = 0;
    switch (alliance.placement) {
      case 1: case 2: alliancePoints = 20; break;
      case 3: alliancePoints = 13; break;
      case 4: alliancePoints = 7; break;
      default: alliancePoints = 0;
    }
    out[team] = (wins / alliance.wins) * alliancePoints;
  }

  // Finals bonus for the winning alliance only
  for (const [team, fwins] of finalsWon) {
    const alliance = allianceLookup.get(team);
    if (!alliance || alliance.placement !== 1) continue;
    out[team] += Math.min(10, fwins * 5);
  }

  return out;
}

function calculateAwardPoints(awards: AwardInfo[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const award of awards) {
    let pts: number;
    switch (award.awardType) {
      case 'impact': pts = 10; break;
      case 'engineering_inspiration': pts = 8; break;
      case 'rookie_all_star': pts = 8; break;
      default: pts = 5;
    }
    out[award.teamNumber] = (out[award.teamNumber] ?? 0) + pts;
  }
  return out;
}

// --- Public entry point ---

export function calculateDistrictPoints(input: {
  rankings: string[];
  alliances: TbaAlliance[];
  matches: TbaMatchSimple[];
  awards: TbaAward[];
  teams: TbaTeamSimple[];
}): Record<string, DistrictPoints> {
  const parsedAlliances = parseAlliances(input.alliances);
  const parsedMatches = parseMatches(input.matches);
  const parsedAwards = parseAwards(input.awards);

  // Merge team list and rankings so teams not in rankings still appear
  const allTeamNumbers = new Set<string>();
  for (const t of input.teams) allTeamNumbers.add(String(t.team_number));
  for (const r of input.rankings) allTeamNumbers.add(r);

  const qualPts = calculateQualPoints(input.rankings);
  const captainPts = calculateAllianceCaptainPoints(parsedAlliances);
  const acceptancePts = calculateDraftAcceptancePoints(parsedAlliances);
  const elimsPts = calculateElimsPoints(parsedAlliances, parsedMatches);
  const awardPts = calculateAwardPoints(parsedAwards);

  const out: Record<string, DistrictPoints> = {};
  for (const teamNumber of allTeamNumbers) {
    const alliancePoints = (captainPts[teamNumber] ?? 0) + (acceptancePts[teamNumber] ?? 0);
    const elimsPoints = elimsPts[teamNumber] ?? 0;
    const awardPoints = awardPts[teamNumber] ?? 0;
    const qualPoints = qualPts[teamNumber] ?? 0;
    out[teamNumber] = {
      teamNumber,
      qualPoints,
      alliancePoints,
      elimsPoints,
      awardPoints,
      total: qualPoints + alliancePoints + elimsPoints + awardPoints,
      // team_age_points intentionally excluded from total, per Python source
    };
  }
  return out;
}
