import { App, ExpressReceiver, LogLevel } from '@slack/bolt';
import express from 'express';
import { registerAppHomeHandler } from './slack/handlers/appHome';
import { registerCreateEventHandlers } from './slack/handlers/createEvent';
import { registerJoinLeaveHandlers } from './slack/handlers/joinLeave';
import { registerStartGameHandler } from './slack/handlers/startGame';
import { registerPickTeamHandlers } from './slack/handlers/pickTeam';
import { registerAdminHandler } from './slack/handlers/admin';
import { initializeState } from './state';
import { loadAllGames, prisma, setGameWriteHook } from './utils/persistence';
import { PORT } from './constants';
import { createWebRouter } from './web/router';
import { TbaCachedClient } from './scoring/tbaCachedClient';
import { ScoringCache } from './scoring/scoringCache';

const isSingleWorkspace = Boolean(process.env.SLACK_BOT_TOKEN);
const signingSecret = process.env.SLACK_SIGNING_SECRET!;

const receiver = new ExpressReceiver({ signingSecret });

const tbaClient = new TbaCachedClient(process.env.TBA_API_KEY ?? '');
const scoringCache = new ScoringCache(prisma, tbaClient);
setGameWriteHook({
  onSaved: (uuid, eventCode) => scoringCache.onGameSaved(uuid, eventCode),
  onDeleted: (uuid) => scoringCache.onGameDeleted(uuid),
});

// Mount custom routes before Slack handlers
receiver.app.use(express.json());
receiver.app.use(createWebRouter({ tbaClient, scoringCache }));

const app = new App(
  isSingleWorkspace
    ? {
        token: process.env.SLACK_BOT_TOKEN,
        receiver,
        logLevel: LogLevel.INFO,
      }
    : {
        receiver,
        clientId: process.env.SLACK_CLIENT_ID!,
        clientSecret: process.env.SLACK_CLIENT_SECRET!,
        stateSecret: process.env.SLACK_STATE_SECRET!,
        scopes: [
          'chat:write',
          'chat:write.public',
          'users:read',
          'commands',
          'app_mentions:read',
        ],
        logLevel: LogLevel.INFO,
      },
);

registerAppHomeHandler(app);
registerCreateEventHandlers(app);
registerJoinLeaveHandlers(app);
registerStartGameHandler(app);
registerPickTeamHandlers(app);
registerAdminHandler(app);

async function main(): Promise<void> {
  const allGames = await loadAllGames();
  initializeState(allGames);

  await app.start(PORT);
  console.log(`⚡️  Fantasy First Slack Bot running on port ${PORT}`);
  console.log(`    Mode: ${isSingleWorkspace ? 'single-workspace' : 'multi-workspace (OAuth)'}`);
}

main().catch(async (err) => {
  console.error('Fatal startup error', err);
  await prisma.$disconnect();
  process.exit(1);
});

process.on('SIGTERM', async () => {
  console.log('SIGTERM received, shutting down');
  await app.stop();
  await prisma.$disconnect();
  process.exit(0);
});
