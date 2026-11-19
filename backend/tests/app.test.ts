import express from 'express';
import request from 'supertest';
import { z } from 'zod';
import { createApp } from '../src/app';
import { pool } from '../src/database/pool';
import { errorHandler, notFoundHandler } from '../src/middleware/errorHandler';
import { validate } from '../src/middleware/validate';
import { ConflictError, ForbiddenError, NotFoundError } from '../src/utils/errors';

describe('app foundation', () => {
  const app = createApp();

  it('GET /health returns ok', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(res.headers['x-request-id']).toBeTruthy();
    expect(res.headers['x-powered-by']).toBeUndefined();
  });

  it('GET /health/ready is 200 when the database answers', async () => {
    const spy = jest.spyOn(pool, 'query').mockResolvedValueOnce({ rows: [{}] } as never);
    const res = await request(app).get('/health/ready');
    expect(res.status).toBe(200);
    spy.mockRestore();
  });

  it('GET /health/ready is 503 when the database is down', async () => {
    const spy = jest.spyOn(pool, 'query').mockImplementationOnce((() => Promise.reject(new Error('connection refused'))) as never);
    const res = await request(app).get('/health/ready');
    expect(res.status).toBe(503);
    expect(res.body.error.code).toBe('SERVICE_UNAVAILABLE');
    expect(JSON.stringify(res.body)).not.toContain('connection refused');
    spy.mockRestore();
  });

  it('returns a JSON 404 envelope for unknown routes', async () => {
    const res = await request(app).get('/api/v1/nope');
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });

  it('returns 400 for malformed JSON', async () => {
    const res = await request(app).post('/api/v1/nope').set('Content-Type', 'application/json').send('{bad');
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('BAD_REQUEST');
  });

  it('serves the OpenAPI document', async () => {
    const res = await request(app).get('/docs.json');
    expect(res.status).toBe(200);
    expect(res.body.openapi).toBe('3.0.3');
  });

  it('sets secure headers and rejects unlisted CORS origins', async () => {
    const res = await request(app).get('/health').set('Origin', 'https://evil.example');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['access-control-allow-origin']).toBeUndefined();
  });
});

describe('validation and error mapping', () => {
  const app = express();
  app.use(express.json());
  app.post(
    '/items/:id',
    validate({
      params: z.object({ id: z.string().uuid() }),
      body: z.object({ qty: z.coerce.number().int().positive() }).strict(),
    }),
    (req, res) => res.json({ qty: (req.body as { qty: number }).qty }),
  );
  app.get('/forbidden', (_req, _res, next) => next(new ForbiddenError()));
  app.get('/missing', (_req, _res, next) => next(new NotFoundError('No such pitch')));
  app.get('/conflict', (_req, _res, next) => next(new ConflictError('dup')));
  app.get('/pg-exclusion', (_req, _res, next) => next(Object.assign(new Error('x'), { code: '23P01', constraint: 'bookings_no_overlap_active' })));
  app.get('/pg-unique', (_req, _res, next) => next(Object.assign(new Error('x'), { code: '23505' })));
  app.get('/boom', (_req, _res, next) => next(new Error('secret internals')));
  app.use(notFoundHandler);
  app.use(errorHandler);

  const id = '3f2b8a52-1c4d-4f64-9d5e-0a1b2c3d4e5f';

  it('coerces and passes valid input', async () => {
    const res = await request(app).post(`/items/${id}`).send({ qty: '3' });
    expect(res.status).toBe(200);
    expect(res.body.qty).toBe(3);
  });

  it('rejects invalid input with 422 and details', async () => {
    const res = await request(app).post('/items/not-a-uuid').send({ qty: -1, extra: true });
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(res.body.error.details.length).toBeGreaterThanOrEqual(2);
  });

  it('maps AppErrors', async () => {
    expect((await request(app).get('/forbidden')).status).toBe(403);
    const missing = await request(app).get('/missing');
    expect(missing.status).toBe(404);
    expect(missing.body.error.message).toBe('No such pitch');
    expect((await request(app).get('/conflict')).status).toBe(409);
  });

  it('maps PostgreSQL exclusion violations to 409 SLOT_TAKEN', async () => {
    const res = await request(app).get('/pg-exclusion');
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('SLOT_TAKEN');
  });

  it('maps unique violations to 409 CONFLICT', async () => {
    const res = await request(app).get('/pg-unique');
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('CONFLICT');
  });

  it('hides internals of unexpected errors in production-like responses', async () => {
    const res = await request(app).get('/boom');
    expect(res.status).toBe(500);
    expect(res.body.error.code).toBe('INTERNAL_ERROR');
  });
});
