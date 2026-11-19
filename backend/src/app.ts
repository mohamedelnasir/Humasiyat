import cors from 'cors';
import express, { Express } from 'express';
import helmet from 'helmet';
import pinoHttp from 'pino-http';
import swaggerUi from 'swagger-ui-express';
import { env, isTest } from './config/env';
import { logger } from './config/logger';
import { checkDatabase } from './database/pool';
import { openApiDocument } from './docs/openapi';
import { errorHandler, notFoundHandler } from './middleware/errorHandler';
import { globalRateLimiter } from './middleware/rateLimit';
import { requestId } from './middleware/requestId';
import { apiRouter } from './modules';
import { AppError, ErrorCodes } from './utils/errors';

export function createApp(): Express {
  const app = express();

  app.disable('x-powered-by');
  app.set('trust proxy', env.TRUST_PROXY);

  app.use(requestId);
  app.use(
    helmet({
      // Swagger UI needs inline scripts/styles; the JSON API itself is locked down.
      contentSecurityPolicy: env.ENABLE_DOCS ? false : undefined,
    }),
  );
  app.use(
    cors({
      origin(origin, callback) {
        // Native mobile clients send no Origin header. Browsers must be allow-listed.
        if (!origin || env.CORS_ORIGINS.includes(origin)) return callback(null, true);
        return callback(null, false);
      },
      credentials: false,
      maxAge: 600,
    }),
  );
  app.use(express.json({ limit: '1mb' }));

  if (!isTest) {
    app.use(
      pinoHttp({
        logger,
        genReqId: (req) => (req as unknown as { id: string }).id,
        autoLogging: { ignore: (req) => req.url?.startsWith('/health') ?? false },
      }),
    );
  }

  // Health checks (outside rate limiting and versioned API).
  app.get('/health', (_req, res) => {
    res.json({ status: 'ok', uptime: process.uptime() });
  });
  app.get('/health/ready', async (_req, res, next) => {
    try {
      await checkDatabase();
      res.json({ status: 'ready' });
    } catch (err) {
      logger.error({ err }, 'Readiness check failed');
      next(new AppError(503, ErrorCodes.SERVICE_UNAVAILABLE, 'Database is not reachable'));
    }
  });

  if (env.ENABLE_DOCS) {
    app.get('/docs.json', (_req, res) => {
      res.json(openApiDocument);
    });
    app.use('/docs', swaggerUi.serve, swaggerUi.setup(openApiDocument));
  }

  app.use('/api/v1', globalRateLimiter, apiRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
