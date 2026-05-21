import { parseTeamList, getTeamsAtEvent } from '../src/api/tba';

describe('parseTeamList', () => {
  it('parses a comma-separated list of team numbers', () => {
    const teams = parseTeamList('254, 1678, 7157');
    expect(teams.map(t => t.number)).toEqual(['254', '1678', '7157']);
  });

  it('sorts teams numerically', () => {
    const teams = parseTeamList('7157,254,1678');
    expect(teams.map(t => t.number)).toEqual(['254', '1678', '7157']);
  });

  it('ignores empty entries and whitespace', () => {
    const teams = parseTeamList('254, , 1678,  ');
    expect(teams.map(t => t.number)).toEqual(['254', '1678']);
  });

  it('ignores duplicate team numbers', () => {
    const teams = parseTeamList('254,254,1678');
    expect(teams).toHaveLength(2);
  });

  it('ignores non-numeric entries', () => {
    const teams = parseTeamList('254,abc,1678');
    expect(teams.map(t => t.number)).toEqual(['254', '1678']);
  });

  it('sets team name equal to number', () => {
    const [team] = parseTeamList('254');
    expect(team.name).toBe('254');
    expect(team.number).toBe('254');
  });

  it('assigns unique UUIDs to each team', () => {
    const teams = parseTeamList('254,1678,7157');
    const uuids = new Set(teams.map(t => t.uuid));
    expect(uuids.size).toBe(3);
  });
});

describe('getTeamsAtEvent', () => {
  const mockFetch = jest.fn();

  beforeAll(() => {
    global.fetch = mockFetch;
  });

  afterEach(() => {
    mockFetch.mockReset();
  });

  it('returns teams sorted by number', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => [
        { team_number: 7157, nickname: 'Team 7157', key: 'frc7157' },
        { team_number: 254, nickname: 'The Cheesy Poofs', key: 'frc254' },
        { team_number: 1678, nickname: 'Citrus Circuits', key: 'frc1678' },
      ],
    });

    const teams = await getTeamsAtEvent('2024cala', 'fake-key');
    expect(teams.map(t => t.number)).toEqual(['254', '1678', '7157']);
    expect(teams.find(t => t.number === '254')?.name).toBe('The Cheesy Poofs');
  });

  it('uses the team nickname as the team name', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => [{ team_number: 254, nickname: 'The Cheesy Poofs', key: 'frc254' }],
    });

    const teams = await getTeamsAtEvent('2024cala', 'fake-key');
    expect(teams[0].name).toBe('The Cheesy Poofs');
  });

  it('falls back to number when nickname is empty', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => [{ team_number: 254, nickname: '', key: 'frc254' }],
    });

    const teams = await getTeamsAtEvent('2024cala', 'fake-key');
    expect(teams[0].name).toBe('254');
  });

  it('throws when the API returns a non-OK response', async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 404 });

    await expect(getTeamsAtEvent('badcode', 'fake-key')).rejects.toThrow('HTTP 404');
  });

  it('passes the API key and correct URL', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => [],
    });

    await getTeamsAtEvent('2024cala', 'MY-KEY');

    expect(mockFetch).toHaveBeenCalledWith(
      'https://www.thebluealliance.com/api/v3/event/2024cala/teams/simple',
      expect.objectContaining({
        headers: expect.objectContaining({ 'X-TBA-Auth-Key': 'MY-KEY' }),
      }),
    );
  });
});
