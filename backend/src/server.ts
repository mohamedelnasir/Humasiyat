import { createApp } from './app';
import { env } from './config/env';
import { logger } from './config/logger';
import { closePool } from './database/pool';

const app = createApp();
const server = app.listen(env.PORT, () => {
  logger.info(`Humasiyat API listening on port ${env.PORT} (${env.NODE_ENV})`);
});

let shuttingDown = false;
async function shutdown(signal: string) {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info(`${signal} received, shutting down`);
  server.close(async () => {
    await closePool().catch((err) => logger.error({ err }, 'Error closing database pool'));
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10_000).unref();
}

process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('unhandledRejection', (reason) => {
  logger.error({ reason }, 'Unhandled promise rejection');
});
