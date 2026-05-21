import { App, ExpressReceiver, LogLevel } from '@slack/bolt';
import express from 'express';
import { registerAppHomeHandler } from './slack/handlers/appHome';
import { registerCreateEventHandlers } from './slack/handlers/createEvent';
import { registerJoinLeaveHandlers } from './slack/handlers/joinLeave';
import { registerStartGameHandler } from './slack/handlers/startGame';
import { registerPickTeamHandlers } from './slack/handlers/pickTeam';
import { registerAdminHandler } from './slack/handlers/admin';
import { initializeState } from './state';
import { loadAllGames, prisma } from './utils/persistence';
import { PORT } from './constants';
import { createWebRouter } from './web/router';

const isSingleWorkspace = Boolean(process.env.SLACK_BOT_TOKEN);
const signingSecret = process.env.SLACK_SIGNING_SECRET!;

const receiver = new ExpressReceiver({ signingSecret });

// Mount custom routes before Slack handlers
receiver.app.use(express.json());
receiver.app.use(createWebRouter());

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
