import { Team, createTeam } from '../types';

interface TBATeamSimple {
  team_number: number;
  nickname: string;
  key: string;
}

export async function getTeamsAtEvent(eventCode: string, apiKey: string): Promise<Team[]> {
  const url = `https://www.thebluealliance.com/api/v3/event/${eventCode}/teams/simple`;
  const response = await fetch(url, {
    headers: {
      'X-TBA-Auth-Key': apiKey,
      'User-Agent': 'FantasyFirstSlackBot/1.0',
    },
  });

  if (!response.ok) {
    throw new Error(`TBA API error for event "${eventCode}": HTTP ${response.status}`);
  }

  const data = (await response.json()) as TBATeamSimple[];
  return data
    .map(t => createTeam(String(t.team_number), t.nickname || String(t.team_number)))
    .sort((a, b) => parseInt(a.number) - parseInt(b.number));
}

export function parseTeamList(input: string): Team[] {
  const teams: Team[] = [];
  const seen = new Set<string>();

  for (const raw of input.split(',')) {
    const num = raw.trim();
    if (!num || !/^\d+$/.test(num) || seen.has(num)) continue;
    seen.add(num);
    teams.push(createTeam(num));
  }

  return teams.sort((a, b) => parseInt(a.number) - parseInt(b.number));
}
