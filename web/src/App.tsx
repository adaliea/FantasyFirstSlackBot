import React from 'react';
import { GameScoringPage } from './pages/GameScoringPage';
import { LeaderboardPage } from './pages/LeaderboardPage';

export function App(): JSX.Element {
  const path = window.location.pathname;
  if (/^\/workspace\/[^/]+\/leaderboard\/?$/.test(path)) {
    return <LeaderboardPage />;
  }
  return <GameScoringPage />;
}
