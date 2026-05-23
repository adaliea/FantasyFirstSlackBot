import React from 'react';
import useSWR from 'swr';
import { fetchLeaderboard, getWorkspaceIdFromPath } from '../lib/api';
import type { LeaderboardPlayer, LeaderboardResponse } from '../types';

const POLL_INTERVAL = 30_000;

function formatAge(ms: number): string {
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s ago`;
  return `${Math.floor(s / 60)}m ago`;
}

export function LeaderboardPage(): JSX.Element {
  const workspaceId = getWorkspaceIdFromPath();
  const [finalizedOnly, setFinalizedOnly] = React.useState(false);
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

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="sticky top-0 z-10 bg-white border-b border-gray-200 shadow-sm">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <h1 className="font-bold text-gray-800 text-base leading-tight">All-Time Leaderboard</h1>
            <div className="text-xs text-gray-400 truncate">
              Workspace {workspaceId} · {data.players.length} players · {totalScored} game-entries
            </div>
          </div>
          <div className="flex items-center gap-3 shrink-0">
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
        ) : (
          <LeaderboardTable
            players={data.players}
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
  expanded: Set<string>;
  onToggle: (slackId: string) => void;
}): JSX.Element {
  return (
    <div className="bg-white border border-gray-200 rounded-lg overflow-hidden shadow-sm">
      <table className="w-full text-sm">
        <thead className="bg-gray-50 text-gray-500 text-xs uppercase tracking-wide">
          <tr>
            <th className="text-right px-3 py-2 w-12">#</th>
            <th className="text-left px-3 py-2">Player</th>
            <th className="text-right px-3 py-2 w-24 tabular-nums">Points</th>
            <th className="text-right px-3 py-2 w-20 tabular-nums">Games</th>
            <th className="w-8" />
          </tr>
        </thead>
        <tbody>
          {props.players.map((player, idx) => {
            const open = props.expanded.has(player.slackId);
            return (
              <React.Fragment key={player.slackId}>
                <tr
                  className="border-t border-gray-100 hover:bg-gray-50 cursor-pointer"
                  onClick={() => props.onToggle(player.slackId)}
                >
                  <td className="text-right px-3 py-2 text-gray-400 tabular-nums">{idx + 1}</td>
                  <td className="px-3 py-2 font-medium text-gray-800">{player.name}</td>
                  <td className="text-right px-3 py-2 tabular-nums font-semibold text-gray-800">
                    {player.totalPoints.toFixed(0)}
                  </td>
                  <td className="text-right px-3 py-2 tabular-nums text-gray-500">{player.gamesPlayed}</td>
                  <td className="text-center px-2 text-gray-400">{open ? '▾' : '▸'}</td>
                </tr>
                {open && (
                  <tr className="bg-gray-50/60">
                    <td />
                    <td colSpan={4} className="px-3 py-2">
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
