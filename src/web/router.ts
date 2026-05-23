import { Router, Request, Response, static as serveStatic } from 'express';
import path from 'path';
import { getGameByUuid } from '../state';
import { scoreGame } from '../scoring/scoreGame';
import { ScoringCache } from '../scoring/scoringCache';
import { TbaCachedClient } from '../scoring/tbaCachedClient';

const WEB_DIST = path.join(__dirname, '..', '..', 'web', 'dist');

export interface WebRouterDeps {
  tbaClient: TbaCachedClient;
  scoringCache: ScoringCache;
}

export function createWebRouter(deps: WebRouterDeps): Router {
  const { tbaClient, scoringCache } = deps;
  const router = Router();

  // Static assets (immutable, long-lived)
  router.use('/assets', serveStatic(path.join(WEB_DIST, 'assets'), {
    maxAge: '1y',
    immutable: true,
  }));

  // SPA shell — both per-game and leaderboard routes serve the same shell.
  const sendSpa = (_req: Request, res: Response): void => {
    res.sendFile(path.join(WEB_DIST, 'index.html'));
  };
  router.get('/game/:uuid', sendSpa);
  router.get('/workspace/:workspaceId/leaderboard', sendSpa);

  // Per-game scoring API
  router.get('/api/games/:uuid/scoring', async (req: Request, res: Response) => {
    const { uuid } = req.params;
    const game = getGameByUuid(uuid);
    if (!game) {
      res.status(404).json({ error: 'Game not found' });
      return;
    }

    try {
      const result = await scoreGame(game, tbaClient);
      res.setHeader('Cache-Control', 'public, max-age=15');
      res.json(result);
    } catch (err) {
      console.error('Error scoring game', err);
      res.status(500).json({ error: 'Failed to compute scoring' });
    }
  });

  // Workspace leaderboard API
  router.get('/api/workspaces/:workspaceId/leaderboard', async (req: Request, res: Response) => {
    const { workspaceId } = req.params;
    const finalizedOnly = req.query.finalizedOnly === 'true';
    try {
      const result = await scoringCache.getWorkspaceLeaderboard(workspaceId, {
        finalizedOnly,
      });
      res.setHeader('Cache-Control', 'public, max-age=15');
      res.json(result);
    } catch (err) {
      console.error('Error computing leaderboard', err);
      res.status(500).json({ error: 'Failed to compute leaderboard' });
    }
  });

  return router;
}
