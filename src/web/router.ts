import { Router, Request, Response, static as serveStatic } from 'express';
import path from 'path';
import { getGameByUuid } from '../state';
import { scoreGame } from '../scoring/scoreGame';
import { TbaCachedClient } from '../scoring/tbaCachedClient';

const tbaClient = new TbaCachedClient(process.env.TBA_API_KEY ?? '');

const WEB_DIST = path.join(__dirname, '..', '..', 'web', 'dist');

export function createWebRouter(): Router {
  const router = Router();

  // Static assets (immutable, long-lived)
  router.use('/assets', serveStatic(path.join(WEB_DIST, 'assets'), {
    maxAge: '1y',
    immutable: true,
  }));

  // SPA shell for /game/:uuid
  router.get('/game/:uuid', (_req: Request, res: Response) => {
    res.sendFile(path.join(WEB_DIST, 'index.html'));
  });

  // Scoring API
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

  return router;
}
