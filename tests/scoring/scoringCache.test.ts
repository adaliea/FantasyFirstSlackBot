jest.mock('../../src/scoring/scoreGame');

import { ScoringCache } from '../../src/scoring/scoringCache';
import { scoreGame } from '../../src/scoring/scoreGame';
import { Game } from '../../src/game/Game';
import { initializeState } from '../../src/state';
import type { ScoringResponse } from '../../src/scoring/scoreGame';

const mockedScoreGame = scoreGame as jest.MockedFunction<typeof scoreGame>;

function makeGame(opts: { name: string; eventCode?: string; players?: { slackId: string; name: string }[] }): Game {
  const g = Game.create({
    channelId: 'C123',
    allianceSize: 3,
    teams: [{ name: '254', number: '254', uuid: 't254' }],
    gameOwnerSlackId: 'U_OWNER',
    gameName: opts.name,
    eventCode: opts.eventCode,
  });
  for (const p of opts.players ?? []) {
    g.players.push({ slackId: p.slackId, name: p.name, selectedTeams: [] });
  }
  return g;
}

function makeScoringResponse(opts: {
  game: Game;
  eventCode: string;
  isFinal: boolean;
  players: { slackId: string; name: string; totalPoints: number }[];
}): ScoringResponse {
  return {
    game: {
      uuid: opts.game.uuid,
      gameName: opts.game.gameName,
      eventCode: opts.eventCode,
      allianceSize: opts.game.allianceSize,
      channelId: opts.game.channelId,
    },
    event: { code: opts.eventCode, isFinal: opts.isFinal },
    districtPoints: {},
    players: opts.players.map((p) => ({
      slackId: p.slackId,
      name: p.name,
      totalPoints: p.totalPoints,
      picks: [],
    })),
  };
}

function makePrismaMock(): {
  finalGameScore: {
    findUnique: jest.Mock;
    upsert: jest.Mock;
    delete: jest.Mock;
    deleteMany: jest.Mock;
  };
} {
  return {
    finalGameScore: {
      findUnique: jest.fn().mockResolvedValue(null),
      upsert: jest.fn().mockResolvedValue({}),
      delete: jest.fn().mockResolvedValue({}),
      deleteMany: jest.fn().mockResolvedValue({}),
    },
  };
}

const fakeTbaClient = {} as never;

describe('ScoringCache', () => {
  beforeEach(() => {
    mockedScoreGame.mockReset();
    // Reset world state between tests.
    initializeState({});
  });

  it('aggregates scores across games and dedupes per slackId', async () => {
    const g1 = makeGame({ name: 'Game A', eventCode: '2026new', players: [
      { slackId: 'U1', name: 'Alice' },
      { slackId: 'U2', name: 'Bob' },
    ]});
    const g2 = makeGame({ name: 'Game B', eventCode: '2026new', players: [
      { slackId: 'U1', name: 'Alice' },
    ]});
    initializeState({ T1: [g1.toData(), g2.toData()] });

    mockedScoreGame.mockImplementation(async (game) => {
      if (game.uuid === g1.uuid) return makeScoringResponse({ game: g1, eventCode: '2026new', isFinal: true, players: [
        { slackId: 'U1', name: 'Alice', totalPoints: 30 },
        { slackId: 'U2', name: 'Bob', totalPoints: 12 },
      ]});
      return makeScoringResponse({ game: g2, eventCode: '2026new', isFinal: true, players: [
        { slackId: 'U1', name: 'Alice', totalPoints: 20 },
      ]});
    });

    const prisma = makePrismaMock();
    const cache = new ScoringCache(prisma as never, fakeTbaClient);
    const lb = await cache.getWorkspaceLeaderboard('T1');

    expect(lb.players).toHaveLength(2);
    expect(lb.players[0]).toMatchObject({ slackId: 'U1', totalPoints: 50, gamesPlayed: 2 });
    expect(lb.players[1]).toMatchObject({ slackId: 'U2', totalPoints: 12, gamesPlayed: 1 });
    expect(lb.skipped).toEqual({ noEventCode: 0, eventNotFound: 0 });
  });

  it('skips games without an event code and reports the count', async () => {
    const g1 = makeGame({ name: 'Game A', eventCode: '2026new', players: [{ slackId: 'U1', name: 'Alice' }] });
    const g2 = makeGame({ name: 'No Event', players: [{ slackId: 'U1', name: 'Alice' }] });
    initializeState({ T1: [g1.toData(), g2.toData()] });

    mockedScoreGame.mockResolvedValue(
      makeScoringResponse({ game: g1, eventCode: '2026new', isFinal: true, players: [
        { slackId: 'U1', name: 'Alice', totalPoints: 30 },
      ]}),
    );

    const cache = new ScoringCache(makePrismaMock() as never, fakeTbaClient);
    const lb = await cache.getWorkspaceLeaderboard('T1');
    expect(lb.skipped.noEventCode).toBe(1);
    expect(mockedScoreGame).toHaveBeenCalledTimes(1);
  });

  it('upserts a final_game_scores snapshot when isFinal=true', async () => {
    const g1 = makeGame({ name: 'Game A', eventCode: '2026new', players: [{ slackId: 'U1', name: 'Alice' }] });
    initializeState({ T1: [g1.toData()] });

    mockedScoreGame.mockResolvedValue(
      makeScoringResponse({ game: g1, eventCode: '2026new', isFinal: true, players: [
        { slackId: 'U1', name: 'Alice', totalPoints: 30 },
      ]}),
    );

    const prisma = makePrismaMock();
    const cache = new ScoringCache(prisma as never, fakeTbaClient);
    await cache.getWorkspaceLeaderboard('T1');

    expect(prisma.finalGameScore.upsert).toHaveBeenCalledTimes(1);
    const call = prisma.finalGameScore.upsert.mock.calls[0][0];
    expect(call.where).toEqual({ gameUuid: g1.uuid });
    expect(call.create.workspaceId).toBe('T1');
    expect(call.create.eventCode).toBe('2026new');
  });

  it('does NOT upsert a snapshot when the event is not yet final', async () => {
    const g1 = makeGame({ name: 'In Progress', eventCode: '2026new', players: [{ slackId: 'U1', name: 'Alice' }] });
    initializeState({ T1: [g1.toData()] });

    mockedScoreGame.mockResolvedValue(
      makeScoringResponse({ game: g1, eventCode: '2026new', isFinal: false, players: [
        { slackId: 'U1', name: 'Alice', totalPoints: 10 },
      ]}),
    );

    const prisma = makePrismaMock();
    const cache = new ScoringCache(prisma as never, fakeTbaClient);
    await cache.getWorkspaceLeaderboard('T1');

    expect(prisma.finalGameScore.upsert).not.toHaveBeenCalled();
  });

  it('serves a finalized game from the persisted snapshot without calling scoreGame', async () => {
    const g1 = makeGame({ name: 'Game A', eventCode: '2026new', players: [{ slackId: 'U1', name: 'Alice' }] });
    initializeState({ T1: [g1.toData()] });

    const snapshot = makeScoringResponse({ game: g1, eventCode: '2026new', isFinal: true, players: [
      { slackId: 'U1', name: 'Alice', totalPoints: 30 },
    ]});

    const prisma = makePrismaMock();
    prisma.finalGameScore.findUnique.mockResolvedValueOnce({
      gameUuid: g1.uuid,
      workspaceId: 'T1',
      eventCode: '2026new',
      scoring: snapshot,
    });

    const cache = new ScoringCache(prisma as never, fakeTbaClient);
    const lb = await cache.getWorkspaceLeaderboard('T1');

    expect(mockedScoreGame).not.toHaveBeenCalled();
    expect(lb.players[0]).toMatchObject({ slackId: 'U1', totalPoints: 30 });
  });

  it('dedupes concurrent leaderboard requests onto a single scoreGame call', async () => {
    const g1 = makeGame({ name: 'Game A', eventCode: '2026new', players: [{ slackId: 'U1', name: 'Alice' }] });
    initializeState({ T1: [g1.toData()] });

    let resolveFn!: (r: ScoringResponse) => void;
    const pending = new Promise<ScoringResponse>((r) => { resolveFn = r; });
    mockedScoreGame.mockReturnValue(pending);

    const cache = new ScoringCache(makePrismaMock() as never, fakeTbaClient);
    const a = cache.getWorkspaceLeaderboard('T1');
    const b = cache.getWorkspaceLeaderboard('T1');

    resolveFn(makeScoringResponse({ game: g1, eventCode: '2026new', isFinal: true, players: [
      { slackId: 'U1', name: 'Alice', totalPoints: 30 },
    ]}));

    const [ra, rb] = await Promise.all([a, b]);
    expect(ra).toBe(rb);
    expect(mockedScoreGame).toHaveBeenCalledTimes(1);
  });

  it('deletes the snapshot when a saved game changes eventCode', async () => {
    const prisma = makePrismaMock();
    prisma.finalGameScore.findUnique.mockResolvedValueOnce({ eventCode: '2026new' });

    const cache = new ScoringCache(prisma as never, fakeTbaClient);
    await cache.onGameSaved('game-uuid', '2026hop');

    expect(prisma.finalGameScore.delete).toHaveBeenCalledWith({ where: { gameUuid: 'game-uuid' } });
  });

  it('keeps the snapshot when eventCode is unchanged', async () => {
    const prisma = makePrismaMock();
    prisma.finalGameScore.findUnique.mockResolvedValueOnce({ eventCode: '2026new' });

    const cache = new ScoringCache(prisma as never, fakeTbaClient);
    await cache.onGameSaved('game-uuid', '2026new');

    expect(prisma.finalGameScore.delete).not.toHaveBeenCalled();
  });

  it('respects the finalizedOnly filter', async () => {
    const gFinal = makeGame({ name: 'Final', eventCode: '2026new', players: [{ slackId: 'U1', name: 'Alice' }] });
    const gLive = makeGame({ name: 'Live', eventCode: '2026hop', players: [{ slackId: 'U1', name: 'Alice' }] });
    initializeState({ T1: [gFinal.toData(), gLive.toData()] });

    mockedScoreGame.mockImplementation(async (game) => {
      if (game.uuid === gFinal.uuid) return makeScoringResponse({ game: gFinal, eventCode: '2026new', isFinal: true, players: [
        { slackId: 'U1', name: 'Alice', totalPoints: 30 },
      ]});
      return makeScoringResponse({ game: gLive, eventCode: '2026hop', isFinal: false, players: [
        { slackId: 'U1', name: 'Alice', totalPoints: 7 },
      ]});
    });

    const cache = new ScoringCache(makePrismaMock() as never, fakeTbaClient);
    const lb = await cache.getWorkspaceLeaderboard('T1', { finalizedOnly: true });

    expect(lb.players).toHaveLength(1);
    expect(lb.players[0].totalPoints).toBe(30); // only the final game contributes
  });
});
