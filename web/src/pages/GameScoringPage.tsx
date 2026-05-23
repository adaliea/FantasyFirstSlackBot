import React from 'react';
import useSWR from 'swr';
import { fetchScoring, getGameUuid } from '../lib/api';
import { isScoringAvailable, ApiResponse } from '../types';
import { PlayerScoreboard } from '../components/PlayerScoreboard';
import { DraftTable } from '../components/DraftTable';

const POLL_INTERVAL = 15_000;

function formatAge(ms: number): string {
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s ago`;
  return `${Math.floor(s / 60)}m ago`;
}

export function GameScoringPage(): JSX.Element {
  const uuid = getGameUuid();
  const [lastUpdated, setLastUpdated] = React.useState<number | null>(null);
  const { data, error, isLoading } = useSWR<ApiResponse, Error>(
    uuid ? uuid : null,
    fetchScoring,
    {
      refreshInterval: POLL_INTERVAL,
      revalidateOnFocus: true,
      onSuccess: () => setLastUpdated(Date.now()),
    },
  );

  const now = Date.now();
  const age = lastUpdated ? now - lastUpdated : null;

  if (!uuid) {
    return <ErrorState message="No game UUID in URL." />;
  }

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-gray-400 animate-pulse">Loading scoring data…</div>
      </div>
    );
  }

  if (error) {
    return <ErrorState message={`Failed to load: ${error.message}`} />;
  }

  if (!data) return <></>;

  if (!isScoringAvailable(data)) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
        <div className="max-w-md text-center space-y-3">
          <div className="text-4xl">📊</div>
          <h1 className="text-xl font-semibold text-gray-800">Scoring not yet available</h1>
          <p className="text-gray-500">{data.reason}</p>
        </div>
      </div>
    );
  }

  const { game, event, players, districtPoints } = data;

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Sticky header */}
      <header className="sticky top-0 z-10 bg-white border-b border-gray-200 shadow-sm">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between">
          <div>
            <h1 className="font-bold text-gray-800 text-base leading-tight">{game.gameName}</h1>
            <div className="text-xs text-gray-400">
              Event {event.code.toUpperCase()}
              {event.isFinal && <span className="ml-2 text-emerald-600 font-medium">· Final</span>}
            </div>
          </div>
          {age !== null && (
            <div className="text-xs text-gray-400 tabular-nums">
              Updated {formatAge(age)}
            </div>
          )}
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-6">
        {/* Color legend */}
        <div className="mb-4 flex flex-wrap gap-2 text-xs">
          {[
            { label: 'Top 10%', cls: 'bg-emerald-500 text-white' },
            { label: 'Top 25%', cls: 'bg-green-400 text-gray-900' },
            { label: 'Top 50%', cls: 'bg-yellow-300 text-gray-900' },
            { label: 'Top 75%', cls: 'bg-orange-400 text-white' },
            { label: 'Bottom 25%', cls: 'bg-red-500 text-white' },
          ].map(({ label, cls }) => (
            <span key={label} className={`px-2 py-0.5 rounded-full font-medium ${cls}`}>{label}</span>
          ))}
        </div>

        {/* Responsive layout: scoreboard left + draft grid right on md+ */}
        <div className="md:grid md:grid-cols-[280px_1fr] md:gap-6 space-y-6 md:space-y-0">
          <PlayerScoreboard players={players} />
          <DraftTable players={players} districtPoints={districtPoints} />
        </div>
      </main>
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
