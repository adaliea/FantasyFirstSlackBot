import React from 'react';
import { ScoringPlayer } from '../types';

const MEDALS = ['🥇', '🥈', '🥉'];

interface PlayerScoreboardProps {
  players: ScoringPlayer[];
}

export function PlayerScoreboard({ players }: PlayerScoreboardProps): JSX.Element {
  const sorted = [...players].sort((a, b) => b.totalPoints - a.totalPoints);

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-100">
        <h2 className="font-semibold text-gray-700 text-sm uppercase tracking-wide">Standings</h2>
      </div>
      <ul className="divide-y divide-gray-50">
        {sorted.map((player, idx) => (
          <li key={player.slackId} className="flex items-center justify-between px-4 py-3">
            <span className="flex items-center gap-2">
              <span className="text-lg w-7 text-center">{MEDALS[idx] ?? `${idx + 1}.`}</span>
              <span className="font-medium text-gray-800">{player.name}</span>
            </span>
            <span className="font-mono font-semibold text-gray-700">{player.totalPoints.toFixed(1)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
