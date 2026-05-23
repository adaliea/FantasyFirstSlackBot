import { Prisma, PrismaClient } from '@prisma/client';
import { Game } from '../game/Game';
import { getAllGamesMap, getWorkspaceGames } from '../state';
import { pMap } from './pMap';
import { scoreGame, ScoringResponse, ScoringUnavailableResponse } from './scoreGame';
import { TbaCachedClient } from './tbaCachedClient';

const PER_GAME_TTL_MS = 30_000;
const AGGREGATE_TTL_MS = 30_000;
const SCORE_CONCURRENCY = 5;

interface PerGameCacheEntry {
  result: ScoringResponse;
  cachedAt: number;
  // If the entry came from final_game_scores (or scoreGame's isFinal=true),
  // it's frozen and never expires until explicitly invalidated.
  sticky: boolean;
}

interface AggregateCacheEntry {
  workspaceId: string;
  cachedAt: number;
  hasAnyNonFinal: boolean;
  payload: LeaderboardResponse;
}

export interface LeaderboardBreakdownEntry {
  gameUuid: string;
  gameName: string;
  eventCode: string;
  points: number;
  isFinal: boolean;
}

export interface LeaderboardPlayer {
  slackId: string;
  name: string;
  totalPoints: number;
  gamesPlayed: number;
  breakdown: LeaderboardBreakdownEntry[];
}

export interface LeaderboardResponse {
  workspaceId: string;
  computedAt: string;
  players: LeaderboardPlayer[];
  skipped: {
    noEventCode: number;
    eventNotFound: number;
  };
}

export interface LeaderboardOptions {
  finalizedOnly?: boolean;
}

type ScoringOutcome =
  | { kind: 'scored'; result: ScoringResponse }
  | { kind: 'skipped'; reason: 'noEventCode' | 'eventNotFound' };

/**
 * Two-tier scoring cache for the workspace leaderboard.
 *
 * Layer 1 (in-memory, per game): hot-path cache keyed by gameUuid. Live games
 * expire after PER_GAME_TTL_MS; finalized games are sticky until explicitly
 * invalidated.
 *
 * Layer 2 (Postgres `final_game_scores`): on first observation of
 * `isFinal=true`, the ScoringResponse is snapshotted. Future cold-starts
 * (process restart) read from this table instead of re-fetching TBA.
 *
 * Layer 3 (in-memory aggregate, per workspace): the assembled
 * LeaderboardResponse is cached briefly so that bursty refreshes from a
 * single page render don't re-aggregate.
 *
 * In-flight dedup at both tiers prevents thundering-herd recomputation.
 */
export class ScoringCache {
  private readonly perGame = new Map<string, PerGameCacheEntry>();
  private readonly perGameInflight = new Map<string, Promise<ScoringOutcome>>();
  private readonly aggregate = new Map<string, AggregateCacheEntry>();
  private readonly aggregateInflight = new Map<
    string,
    Promise<LeaderboardResponse>
  >();

  constructor(
    private readonly prisma: PrismaClient,
    private readonly tba: TbaCachedClient,
  ) {}

  /** Bust the per-game cache (and any workspace aggregate that contained it). */
  invalidateGame(gameUuid: string): void {
    this.perGame.delete(gameUuid);
    this.aggregate.clear();
  }

  /**
   * Called by saveGame() when a game is upserted. If the game's eventCode has
   * changed since we snapshotted its final score, the snapshot is no longer
   * valid — drop it so it gets recomputed.
   */
  async onGameSaved(gameUuid: string, eventCode: string | null): Promise<void> {
    this.invalidateGame(gameUuid);
    try {
      const snapshot = await this.prisma.finalGameScore.findUnique({
        where: { gameUuid },
        select: { eventCode: true },
      });
      if (snapshot && snapshot.eventCode !== (eventCode ?? '')) {
        await this.prisma.finalGameScore.delete({ where: { gameUuid } });
      }
    } catch {
      // Best-effort; a stale snapshot will be corrected next time a final
      // recompute happens.
    }
  }

  async onGameDeleted(gameUuid: string): Promise<void> {
    this.invalidateGame(gameUuid);
    try {
      await this.prisma.finalGameScore.deleteMany({ where: { gameUuid } });
    } catch {
      // Best-effort.
    }
  }

  async getWorkspaceLeaderboard(
    workspaceId: string,
    options: LeaderboardOptions = {},
  ): Promise<LeaderboardResponse> {
    const cacheKey = `${workspaceId}|${options.finalizedOnly ? 'final' : 'all'}`;
    const cached = this.aggregate.get(cacheKey);
    if (cached) {
      // Non-final games update on every match — short TTL. Pure-final
      // workspaces can be served sticky-fresh until invalidated.
      if (!cached.hasAnyNonFinal) return cached.payload;
      if (Date.now() - cached.cachedAt < AGGREGATE_TTL_MS) return cached.payload;
    }

    const existing = this.aggregateInflight.get(cacheKey);
    if (existing) return existing;

    const promise = this.computeWorkspaceLeaderboard(workspaceId, options);
    this.aggregateInflight.set(cacheKey, promise);
    try {
      return await promise;
    } finally {
      this.aggregateInflight.delete(cacheKey);
    }
  }

  private async computeWorkspaceLeaderboard(
    workspaceId: string,
    options: LeaderboardOptions,
  ): Promise<LeaderboardResponse> {
    const games = [...getWorkspaceGames(workspaceId).values()];

    const outcomes = await pMap(
      games,
      async (game) => this.scoreOneGame(game),
      SCORE_CONCURRENCY,
    );

    const skipped = { noEventCode: 0, eventNotFound: 0 };
    const playerAgg = new Map<string, LeaderboardPlayer>();
    let hasAnyNonFinal = false;

    for (let i = 0; i < games.length; i++) {
      const game = games[i];
      const outcome = outcomes[i];

      if (outcome.kind === 'skipped') {
        skipped[outcome.reason]++;
        continue;
      }

      const scoring = outcome.result;
      const isFinal = scoring.event.isFinal;
      if (!isFinal) hasAnyNonFinal = true;
      if (options.finalizedOnly && !isFinal) continue;

      for (const player of scoring.players) {
        let entry = playerAgg.get(player.slackId);
        if (!entry) {
          entry = {
            slackId: player.slackId,
            name: player.name,
            totalPoints: 0,
            gamesPlayed: 0,
            breakdown: [],
          };
          playerAgg.set(player.slackId, entry);
        }
        // Latest game we observed for this player overrides the display name
        // (best-effort: pick the most-recently-updated game we encounter).
        entry.name = player.name;
        entry.totalPoints += player.totalPoints;
        entry.gamesPlayed += 1;
        entry.breakdown.push({
          gameUuid: game.uuid,
          gameName: game.gameName,
          eventCode: scoring.event.code,
          points: player.totalPoints,
          isFinal,
        });
      }
    }

    const players = [...playerAgg.values()]
      .sort((a, b) => b.totalPoints - a.totalPoints || a.name.localeCompare(b.name));
    for (const p of players) {
      p.breakdown.sort((a, b) => b.points - a.points);
    }

    const payload: LeaderboardResponse = {
      workspaceId,
      computedAt: new Date().toISOString(),
      players,
      skipped,
    };

    const cacheKey = `${workspaceId}|${options.finalizedOnly ? 'final' : 'all'}`;
    this.aggregate.set(cacheKey, {
      workspaceId,
      cachedAt: Date.now(),
      hasAnyNonFinal,
      payload,
    });
    return payload;
  }

  private async scoreOneGame(game: Game): Promise<ScoringOutcome> {
    if (!game.eventCode) {
      return { kind: 'skipped', reason: 'noEventCode' };
    }

    const cached = this.perGame.get(game.uuid);
    if (cached && (cached.sticky || Date.now() - cached.cachedAt < PER_GAME_TTL_MS)) {
      return { kind: 'scored', result: cached.result };
    }

    const existing = this.perGameInflight.get(game.uuid);
    if (existing) return existing;

    const promise = this.computeOneGame(game);
    this.perGameInflight.set(game.uuid, promise);
    try {
      return await promise;
    } finally {
      this.perGameInflight.delete(game.uuid);
    }
  }

  private async computeOneGame(game: Game): Promise<ScoringOutcome> {
    // Layer 2: persisted snapshot of a previously-finalized event.
    const snapshot = await this.prisma.finalGameScore.findUnique({
      where: { gameUuid: game.uuid },
    });
    if (snapshot && snapshot.eventCode === game.eventCode) {
      const result = snapshot.scoring as unknown as ScoringResponse;
      this.perGame.set(game.uuid, { result, cachedAt: Date.now(), sticky: true });
      return { kind: 'scored', result };
    }

    let result: ScoringResponse | ScoringUnavailableResponse;
    try {
      result = await scoreGame(game, this.tba);
    } catch (err) {
      console.error(`scoreGame failed for ${game.uuid}:`, err);
      return { kind: 'skipped', reason: 'eventNotFound' };
    }

    if ('scoringAvailable' in result && result.scoringAvailable === false) {
      return { kind: 'skipped', reason: 'eventNotFound' };
    }
    const scoring = result as ScoringResponse;

    this.perGame.set(game.uuid, {
      result: scoring,
      cachedAt: Date.now(),
      sticky: scoring.event.isFinal,
    });

    if (scoring.event.isFinal) {
      try {
        await this.prisma.finalGameScore.upsert({
          where: { gameUuid: game.uuid },
          create: {
            gameUuid: game.uuid,
            workspaceId: this.workspaceIdForGame(game.uuid) ?? '',
            eventCode: scoring.event.code,
            scoring: scoring as unknown as Prisma.InputJsonValue,
          },
          update: {
            workspaceId: this.workspaceIdForGame(game.uuid) ?? '',
            eventCode: scoring.event.code,
            scoring: scoring as unknown as Prisma.InputJsonValue,
            computedAt: new Date(),
          },
        });
      } catch (err) {
        // Snapshot persistence is best-effort; the in-memory cache still
        // serves the result for this process lifetime.
        console.error(`final_game_scores upsert failed for ${game.uuid}:`, err);
      }
    }

    return { kind: 'scored', result: scoring };
  }

  private workspaceIdForGame(gameUuid: string): string | null {
    // The Game itself doesn't carry workspaceId; resolve via state.
    for (const [workspaceId, wsMap] of getAllGamesMap().entries()) {
      if (wsMap.has(gameUuid)) return workspaceId;
    }
    return null;
  }
}
