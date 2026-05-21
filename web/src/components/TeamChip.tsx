import React from 'react';
import { ScoringPickResult, DistrictPoints } from '../types';
import { pickColor } from '../lib/colors';
import { Tooltip } from './Tooltip';

interface TeamChipProps {
  pick: ScoringPickResult;
  points: DistrictPoints | undefined;
}

export function TeamChip({ pick, points }: TeamChipProps): JSX.Element {
  const colors = pickColor(pick.percentile);
  const label = pick.teamName ? `${pick.teamNumber}` : pick.teamNumber;

  const tooltipContent = (
    <div className="space-y-1">
      <div className="font-semibold">
        Team {pick.teamNumber}{pick.teamName ? ` — ${pick.teamName}` : ''}
      </div>
      <div className="text-gray-500 text-xs">
        +{pick.pointsContributed.toFixed(1)} pts contributed
      </div>
      <div className="text-gray-500 text-xs">
        Pick quality: #{pick.rankAmongAvailable} of {pick.poolSize} available
      </div>
      {points && (
        <table className="mt-2 w-full text-xs border-t border-gray-100 pt-1">
          <tbody>
            <tr><td className="py-0.5 text-gray-500">Qual</td><td className="text-right font-mono">{points.qualPoints}</td></tr>
            <tr><td className="py-0.5 text-gray-500">Alliance</td><td className="text-right font-mono">{points.alliancePoints}</td></tr>
            <tr><td className="py-0.5 text-gray-500">Elims</td><td className="text-right font-mono">{points.elimsPoints.toFixed(1)}</td></tr>
            <tr><td className="py-0.5 text-gray-500">Awards</td><td className="text-right font-mono">{points.awardPoints}</td></tr>
          </tbody>
        </table>
      )}
    </div>
  );

  return (
    <Tooltip content={tooltipContent}>
      <span
        className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-semibold ring-1 ring-inset select-none ${colors.bg} ${colors.text} ${colors.ring}`}
        title={pick.teamName}
      >
        {label}
      </span>
    </Tooltip>
  );
}
