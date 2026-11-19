import request from 'supertest';
import { setupTestApp } from './helpers/testApp';

type Ctx = Awaited<ReturnType<typeof setupTestApp>>;

describe('RBAC and account status management', () => {
  let t: Ctx;
  beforeAll(async () => {
    t = await setupTestApp();
  });
  beforeEach(() => t.reset());
  afterAll(() => t.close());

  const api = () => request(t.app);
  const signIn = async (phone: string, password = 'Password1') =>
    (await api().post('/api/v1/auth/login').send({ identifier: phone, password })).body as { accessToken: string; refreshToken: string };
  const setStatus = (token: string, id: string, body: object) =>
    api().patch(`/api/v1/admin/users/${id}/status`).set('Authorization', `Bearer ${token}`).send(body);

  it('blocks unauthenticated callers from admin routes (401)', async () => {
    const res = await api().patch('/api/v1/admin/users/3f2b8a52-1c4d-4f64-9d5e-0a1b2c3d4e5f/status').send({ status: 'active' });
    expect(res.status).toBe(401);
  });

  it.each(['customer', 'manager'] as const)('forbids a %s from admin routes (403)', async (role) => {
    await t.createUser({ role, phone: '+249911000001' });
    const victim = await t.createUser({ phone: '+249911000002' });
    const { accessToken } = await signIn('+249911000001');
    const res = await setStatus(accessToken, victim.id, { status: 'suspended', reason: 'testing' });
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
  });

  it('lets a super admin suspend a user, which immediately blocks every credential they hold', async () => {
    await t.createUser({ role: 'super_admin', phone: '+249911000009' });
    const victim = await t.createUser({ phone: '+249911000002' });
    const admin = await signIn('+249911000009');
    const session = await signIn('+249911000002');

    const res = await setStatus(admin.accessToken, victim.id, { status: 'suspended', reason: 'Fake payment screenshots' });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('suspended');

    // existing access token, refresh token and a new login are all refused
    expect((await api().get('/api/v1/users/me').set('Authorization', `Bearer ${session.accessToken}`)).status).toBe(403);
    expect((await api().post('/api/v1/auth/refresh').send({ refreshToken: session.refreshToken })).status).toBe(401);
    expect((await api().post('/api/v1/auth/login').send({ identifier: '+249911000002', password: 'Password1' })).status).toBe(403);

    const log = await t.pg.query<{ metadata: { to: string; reason: string } }>(
      `SELECT metadata FROM activity_logs WHERE action = 'user.status_changed'`);
    expect(log.rows).toHaveLength(1);
    expect(log.rows[0]!.metadata).toMatchObject({ to: 'suspended', reason: 'Fake payment screenshots' });
  });

  it('reactivates a user, who can then sign in again', async () => {
    await t.createUser({ role: 'super_admin', phone: '+249911000009' });
    const victim = await t.createUser({ phone: '+249911000002' });
    const admin = await signIn('+249911000009');
    await setStatus(admin.accessToken, victim.id, { status: 'suspended', reason: 'review' });

    const res = await setStatus(admin.accessToken, victim.id, { status: 'active' });
    expect(res.status).toBe(200);
    expect((await api().post('/api/v1/auth/login').send({ identifier: '+249911000002', password: 'Password1' })).status).toBe(200);
  });

  it('requires a reason to suspend, validates the id, and 404s unknown users', async () => {
    await t.createUser({ role: 'super_admin', phone: '+249911000009' });
    const victim = await t.createUser({ phone: '+249911000002' });
    const { accessToken } = await signIn('+249911000009');

    expect((await setStatus(accessToken, victim.id, { status: 'suspended' })).status).toBe(422);
    expect((await setStatus(accessToken, 'not-a-uuid', { status: 'active' })).status).toBe(422);
    expect((await setStatus(accessToken, '3f2b8a52-1c4d-4f64-9d5e-0a1b2c3d4e5f', { status: 'active' })).status).toBe(404);
    expect((await setStatus(accessToken, victim.id, { status: 'deactivated' })).status).toBe(422);
  });

  it('prevents admins from suspending themselves or other super admins', async () => {
    const self = await t.createUser({ role: 'super_admin', phone: '+249911000009' });
    const other = await t.createUser({ role: 'super_admin', phone: '+249911000008' });
    const { accessToken } = await signIn('+249911000009');

    expect((await setStatus(accessToken, self.id, { status: 'suspended', reason: 'oops' })).status).toBe(403);
    expect((await setStatus(accessToken, other.id, { status: 'suspended', reason: 'coup' })).status).toBe(403);
  });
});
