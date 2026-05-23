import React from 'react';
import useSWR from 'swr';
import { fetchLeaderboard, getWorkspaceIdFromPath } from '../lib/api';
import type { LeaderboardPlayer, LeaderboardResponse } from '../types';

const POLL_INTERVAL = 30_000;

type SortMode = 'total' | 'average';

function formatAge(ms: number): string {
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s ago`;
  return `${Math.floor(s / 60)}m ago`;
}

export function LeaderboardPage(): JSX.Element {
  const workspaceId = getWorkspaceIdFromPath();
  const [finalizedOnly, setFinalizedOnly] = React.useState(false);
  const [sortMode, setSortMode] = React.useState<SortMode>('total');
  const [minGames, setMinGames] = React.useState(1);
  const [expanded, setExpanded] = React.useState<Set<string>>(new Set());
  const [lastUpdated, setLastUpdated] = React.useState<number | null>(null);

  const swrKey = workspaceId ? `leaderboard:${workspaceId}:${finalizedOnly}` : null;
  const { data, error, isLoading } = useSWR<LeaderboardResponse, Error>(
    swrKey,
    () => fetchLeaderboard(workspaceId, finalizedOnly),
    {
      refreshInterval: POLL_INTERVAL,
      revalidateOnFocus: true,
      onSuccess: () => setLastUpdated(Date.now()),
    },
  );

  if (!workspaceId) {
    return <ErrorState message="No workspace ID in URL." />;
  }
  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-gray-400 animate-pulse">Loading leaderboard…</div>
      </div>
    );
  }
  if (error) {
    return <ErrorState message={`Failed to load: ${error.message}`} />;
  }
  if (!data) return <></>;

  const age = lastUpdated ? Date.now() - lastUpdated : null;
  const totalScored = data.players.reduce((sum, p) => sum + p.gamesPlayed, 0);
  const maxGamesPlayed = data.players.reduce((m, p) => Math.max(m, p.gamesPlayed), 0);

  const visiblePlayers = [...data.players]
    .filter((p) => p.gamesPlayed >= minGames)
    .sort((a, b) => {
      const av = sortMode === 'average' ? a.totalPoints / Math.max(a.gamesPlayed, 1) : a.totalPoints;
      const bv = sortMode === 'average' ? b.totalPoints / Math.max(b.gamesPlayed, 1) : b.totalPoints;
      return bv - av || a.name.localeCompare(b.name);
    });

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="sticky top-0 z-10 bg-white border-b border-gray-200 shadow-sm">
        <div className="max-w-5xl mx-auto px-4 py-3 flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <h1 className="font-bold text-gray-800 text-base leading-tight">All-Time Leaderboard</h1>
            <div className="text-xs text-gray-400 truncate">
              Workspace {workspaceId} · {data.players.length} players · {totalScored} game-entries
              {minGames > 1 && (
                <span> · showing {visiblePlayers.length} with ≥{minGames} games</span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-3 shrink-0 flex-wrap">
            <label className="text-xs text-gray-500 flex items-center gap-1.5 select-none">
              Sort by
              <select
                value={sortMode}
                onChange={(e) => setSortMode(e.target.value as SortMode)}
                className="rounded border border-gray-300 bg-white text-gray-700 px-1.5 py-0.5 text-xs"
              >
                <option value="total">Total points</option>
                <option value="average">Average / game</option>
              </select>
            </label>
            <label className="text-xs text-gray-500 flex items-center gap-1.5 select-none">
              Min games
              <input
                type="number"
                min={1}
                max={Math.max(maxGamesPlayed, 1)}
                value={minGames}
                onChange={(e) => {
                  const n = parseInt(e.target.value, 10);
                  setMinGames(Number.isFinite(n) && n >= 1 ? n : 1);
                }}
                className="w-14 rounded border border-gray-300 bg-white text-gray-700 px-1.5 py-0.5 text-xs tabular-nums"
              />
            </label>
            <label className="text-xs text-gray-500 flex items-center gap-1.5 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={finalizedOnly}
                onChange={(e) => setFinalizedOnly(e.target.checked)}
                className="rounded border-gray-300"
              />
              Finalized only
            </label>
            {age !== null && (
              <div className="text-xs text-gray-400 tabular-nums">Updated {formatAge(age)}</div>
            )}
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-6">
        {(data.skipped.noEventCode > 0 || data.skipped.eventNotFound > 0) && (
          <div className="mb-4 text-xs text-gray-500 bg-amber-50 border border-amber-200 rounded px-3 py-2">
            {data.skipped.noEventCode > 0 && (
              <span>{data.skipped.noEventCode} game{data.skipped.noEventCode === 1 ? '' : 's'} not scored (no event code set). </span>
            )}
            {data.skipped.eventNotFound > 0 && (
              <span>{data.skipped.eventNotFound} game{data.skipped.eventNotFound === 1 ? '' : 's'} skipped (TBA event not found).</span>
            )}
          </div>
        )}

        {data.players.length === 0 ? (
          <EmptyState />
        ) : visiblePlayers.length === 0 ? (
          <FilteredOutState minGames={minGames} maxGamesPlayed={maxGamesPlayed} />
        ) : (
          <LeaderboardTable
            players={visiblePlayers}
            sortMode={sortMode}
            expanded={expanded}
            onToggle={(slackId) => {
              setExpanded((prev) => {
                const next = new Set(prev);
                if (next.has(slackId)) next.delete(slackId);
                else next.add(slackId);
                return next;
              });
            }}
          />
        )}
      </main>
    </div>
  );
}

function LeaderboardTable(props: {
  players: LeaderboardPlayer[];
  sortMode: SortMode;
  expanded: Set<string>;
  onToggle: (slackId: string) => void;
}): JSX.Element {
  const totalActive = props.sortMode === 'total';
  const headerCls = (active: boolean): string =>
    `text-right px-3 py-2 w-24 tabular-nums ${active ? 'text-gray-700 font-semibold' : ''}`;
  return (
    <div className="bg-white border border-gray-200 rounded-lg overflow-hidden shadow-sm">
      <table className="w-full text-sm">
        <thead className="bg-gray-50 text-gray-500 text-xs uppercase tracking-wide">
          <tr>
            <th className="text-right px-3 py-2 w-12">#</th>
            <th className="text-left px-3 py-2">Player</th>
            <th className={headerCls(totalActive)}>Points</th>
            <th className={headerCls(!totalActive)}>Avg</th>
            <th className="text-right px-3 py-2 w-20 tabular-nums">Games</th>
            <th className="w-8" />
          </tr>
        </thead>
        <tbody>
          {props.players.map((player, idx) => {
            const open = props.expanded.has(player.slackId);
            const avg = player.totalPoints / Math.max(player.gamesPlayed, 1);
            return (
              <React.Fragment key={player.slackId}>
                <tr
                  className="border-t border-gray-100 hover:bg-gray-50 cursor-pointer"
                  onClick={() => props.onToggle(player.slackId)}
                >
                  <td className="text-right px-3 py-2 text-gray-400 tabular-nums">{idx + 1}</td>
                  <td className="px-3 py-2 font-medium text-gray-800">{player.name}</td>
                  <td
                    className={`text-right px-3 py-2 tabular-nums ${totalActive ? 'font-semibold text-gray-800' : 'text-gray-500'}`}
                  >
                    {player.totalPoints.toFixed(0)}
                  </td>
                  <td
                    className={`text-right px-3 py-2 tabular-nums ${totalActive ? 'text-gray-500' : 'font-semibold text-gray-800'}`}
                  >
                    {avg.toFixed(1)}
                  </td>
                  <td className="text-right px-3 py-2 tabular-nums text-gray-500">{player.gamesPlayed}</td>
                  <td className="text-center px-2 text-gray-400">{open ? '▾' : '▸'}</td>
                </tr>
                {open && (
                  <tr className="bg-gray-50/60">
                    <td />
                    <td colSpan={5} className="px-3 py-2">
                      <BreakdownList breakdown={player.breakdown} />
                    </td>
                  </tr>
                )}
              </React.Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function FilteredOutState(props: { minGames: number; maxGamesPlayed: number }): JSX.Element {
  return (
    <div className="text-center py-16 text-gray-500">
      <div className="text-3xl mb-2">🔎</div>
      <p>No players have played ≥{props.minGames} games yet.</p>
      <p className="text-xs mt-1">Most games played by anyone: {props.maxGamesPlayed}.</p>
    </div>
  );
}

function BreakdownList(props: { breakdown: LeaderboardPlayer['breakdown'] }): JSX.Element {
  if (props.breakdown.length === 0) {
    return <div className="text-xs text-gray-400">No games yet.</div>;
  }
  return (
    <ul className="divide-y divide-gray-200">
      {props.breakdown.map((b) => (
        <li key={b.gameUuid} className="py-1.5 flex items-center justify-between text-xs">
          <a
            href={`/game/${b.gameUuid}`}
            className="text-gray-700 hover:text-blue-600 truncate"
          >
            {b.gameName}{' '}
            <span className="text-gray-400">· {b.eventCode.toUpperCase()}</span>
            {!b.isFinal && <span className="ml-1 text-amber-600">· in progress</span>}
          </a>
          <span className="tabular-nums font-medium text-gray-700">{b.points.toFixed(0)}</span>
        </li>
      ))}
    </ul>
  );
}

function EmptyState(): JSX.Element {
  return (
    <div className="text-center py-16 text-gray-500">
      <div className="text-4xl mb-2">🏁</div>
      <p>No scored games yet in this workspace.</p>
      <p className="text-xs mt-1">Set an event code on a game (<code>/debug game &lt;uuid&gt; set event-code &lt;code&gt;</code>) to include it.</p>
    </div>
  );
}

function ErrorState({ message }: { message: string }): JSX.Element {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
      <div className="max-w-md text-center space-y-3">
        <div className="text-4xl">⚠️</div>
        <h1 className="text-xl font-semibold text-gray-800">Something went wrong</h1>
        <p className="text-gray-500 text-sm">{message}</p>
      </div>
    </div>
  );
}
