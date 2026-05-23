import React from 'react';
import { ScoringPlayer, DistrictPoints } from '../types';
import { TeamChip } from './TeamChip';

interface DraftTableProps {
  players: ScoringPlayer[];
  districtPoints: Record<string, DistrictPoints>;
}

export function DraftTable({ players, districtPoints }: DraftTableProps): JSX.Element {
  return (
    <div className="space-y-4">
      {players.map(player => (
        <div key={player.slackId} className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
          <div className="font-semibold text-gray-800 mb-2">
            {player.name}
            <span className="ml-2 text-sm text-gray-400 font-normal font-mono">
              {player.totalPoints.toFixed(1)} pts
            </span>
          </div>
          <div className="flex flex-wrap gap-2">
            {player.picks.length === 0 ? (
              <span className="text-gray-400 text-sm italic">No picks yet</span>
            ) : (
              player.picks.map((pick, i) => (
                <TeamChip
                  key={i}
                  pick={pick}
                  points={districtPoints[pick.teamNumber]}
                />
              ))
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
