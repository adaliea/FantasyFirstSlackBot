import {
  parseRankings,
  parseAlliances,
  parseMatches,
  parseAwards,
  calculateDistrictPoints,
  isSerpentine,
} from '../../src/scoring/districtPoints';
import type { TbaAlliance, TbaMatchSimple, TbaAward, TbaRankingsResponse, TbaTeamSimple } from '../../src/scoring/tbaTypes';

// ---------------------------------------------------------------------------
// Fixture helpers
// ---------------------------------------------------------------------------

function mkRankings(teams: string[]): TbaRankingsResponse {
  return { rankings: teams.map((t, i) => ({ team_key: `frc${t}`, rank: i + 1 })) };
}

function mkAlliance(num: number, picks: string[], wins: number, round: string, status = 'playing'): TbaAlliance {
  return {
    name: `Alliance ${num}`,
    picks: picks.map(p => `frc${p}`),
    status: {
      record: { wins, losses: 0, ties: 0 },
      status,
      double_elim_round: round,
    },
  };
}

function mkMatch(red: string[], blue: string[], winner: 'red' | 'blue', level: string): TbaMatchSimple {
  return {
    alliances: {
      red: { team_keys: red.map(t => `frc${t}`), score: 100 },
      blue: { team_keys: blue.map(t => `frc${t}`), score: 50 },
    },
    winning_alliance: winner,
    comp_level: level,
  };
}

function mkTeams(nums: string[]): TbaTeamSimple[] {
  return nums.map(n => ({ team_number: parseInt(n), nickname: `Team ${n}`, key: `frc${n}` }));
}

// ---------------------------------------------------------------------------
// Parse helpers
// ---------------------------------------------------------------------------

describe('parseRankings', () => {
  test('returns team numbers sorted by rank', () => {
    const raw = mkRankings(['254', '1678', '4414']);
    expect(parseRankings(raw)).toEqual(['254', '1678', '4414']);
  });

  test('handles null input', () => {
    expect(parseRankings(null)).toEqual([]);
  });
});

describe('parseAlliances', () => {
  test('extracts alliance number, teams, wins, placement', () => {
    const raw = [mkAlliance(1, ['1', '2', '3'], 5, 'Finals', 'won')];
    const parsed = parseAlliances(raw);
    expect(parsed[0].allianceNumber).toBe(1);
    expect(parsed[0].teams).toEqual(['1', '2', '3']);
    expect(parsed[0].wins).toBe(5);
    expect(parsed[0].placement).toBe(1);
  });

  test('runner-up has placement 2', () => {
    const raw = [mkAlliance(2, ['4', '5', '6'], 2, 'Finals', 'eliminated')];
    expect(parseAlliances(raw)[0].placement).toBe(2);
  });

  test('Round 5 → placement 3', () => {
    const raw = [mkAlliance(3, ['7', '8', '9'], 3, 'Round 5', 'eliminated')];
    expect(parseAlliances(raw)[0].placement).toBe(3);
  });
});

describe('parseMatches', () => {
  test('detects quals and finals', () => {
    const matches = parseMatches([
      mkMatch(['1', '2', '3'], ['4', '5', '6'], 'red', 'qm'),
      mkMatch(['1', '2', '3'], ['4', '5', '6'], 'blue', 'f'),
    ]);
    expect(matches[0].isQuals).toBe(true);
    expect(matches[0].isFinals).toBe(false);
    expect(matches[1].isQuals).toBe(false);
    expect(matches[1].isFinals).toBe(true);
    expect(matches[1].winner).toBe('blue');
  });
});

describe('parseAwards', () => {
  test('skips excluded award types 1, 2, 68', () => {
    const raw: TbaAward[] = [
      { award_type: 1, recipient_list: [{ team_key: 'frc1', awardee: null }] },
      { award_type: 2, recipient_list: [{ team_key: 'frc2', awardee: null }] },
      { award_type: 68, recipient_list: [{ team_key: 'frc3', awardee: null }] },
    ];
    expect(parseAwards(raw)).toHaveLength(0);
  });

  test('maps award types correctly', () => {
    const raw: TbaAward[] = [
      { award_type: 0, recipient_list: [{ team_key: 'frc1', awardee: null }] },
      { award_type: 9, recipient_list: [{ team_key: 'frc2', awardee: null }] },
      { award_type: 10, recipient_list: [{ team_key: 'frc3', awardee: null }] },
      { award_type: 5, recipient_list: [{ team_key: 'frc4', awardee: null }] },
    ];
    const parsed = parseAwards(raw);
    expect(parsed[0].awardType).toBe('impact');
    expect(parsed[1].awardType).toBe('engineering_inspiration');
    expect(parsed[2].awardType).toBe('rookie_all_star');
    expect(parsed[3].awardType).toBe('other');
  });

  test('skips individual-person awardees', () => {
    const raw: TbaAward[] = [
      { award_type: 5, recipient_list: [{ team_key: 'frc1', awardee: 'John Doe' }] },
    ];
    expect(parseAwards(raw)).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// calculateDistrictPoints — golden output tests
// ---------------------------------------------------------------------------

describe('calculateDistrictPoints', () => {
  // A minimal 4-team, 2-alliance event to keep fixtures manageable.
  // Teams: '1' (rank 1), '2' (rank 2), '3' (rank 3), '4' (rank 4)
  // Alliances: A1 = [1, 3], A2 = [2, 4]  (2-team alliances for simplicity)
  // Playoffs: A1 wins 2 matches (Finals), A2 loses 1 final match
  // A1 wins = 2, A2 wins = 1 (they won one match before losing)
  // Awards: team '1' gets Impact Award (type 0)

  const rawRankings = mkRankings(['1', '2', '3', '4']);
  const rankings = parseRankings(rawRankings);
  const alliances: TbaAlliance[] = [
    mkAlliance(1, ['1', '3'], 2, 'Finals', 'won'),
    mkAlliance(2, ['2', '4'], 1, 'Finals', 'eliminated'),
  ];
  const matches: TbaMatchSimple[] = [
    // A2 won a semifinal (their 1 win in the tournament record)
    mkMatch(['2', '4'], ['1', '3'], 'red', 'sf'),
    // Finals: A1 wins both (A2 eliminated)
    mkMatch(['1', '3'], ['2', '4'], 'red', 'f'),
    mkMatch(['1', '3'], ['2', '4'], 'red', 'f'),
  ];
  const awards: TbaAward[] = [
    { award_type: 0, recipient_list: [{ team_key: 'frc1', awardee: null }] },
  ];
  const teams = mkTeams(['1', '2', '3', '4']);

  let pts: ReturnType<typeof calculateDistrictPoints>;

  beforeAll(() => {
    pts = calculateDistrictPoints({ rankings, alliances, matches, awards, teams });
  });


  test('all teams present in output', () => {
    expect(Object.keys(pts)).toEqual(expect.arrayContaining(['1', '2', '3', '4']));
  });

  test('qual points decrease with rank', () => {
    expect(pts['1'].qualPoints).toBeGreaterThan(pts['2'].qualPoints);
    expect(pts['2'].qualPoints).toBeGreaterThan(pts['3'].qualPoints);
    expect(pts['3'].qualPoints).toBeGreaterThan(pts['4'].qualPoints);
  });

  test('alliance captain points: A1 captain > A2 captain', () => {
    // A1 captain is team '1', A2 captain is team '2'
    // max_points = (alliance_size - 1) * num_alliances + 1 = (2-1)*2+1 = 3
    // A1 captain: 3 - 1 = 2; A2 captain: 3 - 2 = 1
    // '3' gets acceptance as first pick of A1: max_points - 1 = 2 (position 1 in serpentine)
    // '4' gets acceptance as first pick of A2: max_points - 2 = 1 (position 2)
    // Alliance points for '1' (captain only, no acceptance): 2
    // Alliance points for '3' (acceptance pick 1): 2  (position 1 of 1 in first pick round)
    expect(pts['1'].alliancePoints).toBeGreaterThan(pts['2'].alliancePoints);
  });

  test('impact award adds 10 points', () => {
    expect(pts['1'].awardPoints).toBe(10);
    expect(pts['2'].awardPoints).toBe(0);
  });

  test('winner gets elims points (placement=1, + finals bonus)', () => {
    // A1 won 2 finals matches → elims: (2/2)*20 = 20, finals bonus: min(10, 2*5) = 10 → 30
    expect(pts['1'].elimsPoints).toBeCloseTo(30, 1);
    expect(pts['3'].elimsPoints).toBeCloseTo(30, 1);
  });

  test('runner-up gets elims points (placement=2, no finals bonus)', () => {
    // A2 had 1 win, placement=2 → alliance_points=20
    // team '2': (1/1)*20=20; no finals bonus (placement≠1)
    expect(pts['2'].elimsPoints).toBeCloseTo(20, 1);
    expect(pts['4'].elimsPoints).toBeCloseTo(20, 1);
  });

  test('total = qual + alliance + elims + award (no team_age)', () => {
    for (const team of ['1', '2', '3', '4']) {
      const p = pts[team];
      expect(p.total).toBeCloseTo(p.qualPoints + p.alliancePoints + p.elimsPoints + p.awardPoints, 5);
    }
  });

  test('partial event (rankings only, no alliances/matches/awards)', () => {
    const partial = calculateDistrictPoints({
      rankings: parseRankings(rawRankings),
      alliances: [],
      matches: [],
      awards: [],
      teams,
    });
    expect(partial['1'].alliancePoints).toBe(0);
    expect(partial['1'].elimsPoints).toBe(0);
    expect(partial['1'].awardPoints).toBe(0);
    expect(partial['1'].qualPoints).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// isSerpentine
// ---------------------------------------------------------------------------

describe('isSerpentine', () => {
  test('returns true for normal events', () => {
    expect(isSerpentine('2024cala')).toBe(true);
  });

  test('returns false for IRI events', () => {
    expect(isSerpentine('2024iri')).toBe(false);
  });
});
