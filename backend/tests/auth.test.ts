import jwt from 'jsonwebtoken';
import request from 'supertest';
import { setMessenger } from '../src/services/messenger';
import { setupTestApp } from './helpers/testApp';

type Ctx = Awaited<ReturnType<typeof setupTestApp>>;

describe('authentication', () => {
  let t: Ctx;
  const sent: { token: string; to: { phone: string | null; email: string | null } }[] = [];

  beforeAll(async () => {
    t = await setupTestApp();
    setMessenger({
      sendPasswordReset: async ({ to, token }) => {
        sent.push({ token, to });
      },
    });
  });
  beforeEach(async () => {
    await t.reset();
    sent.length = 0;
  });
  afterAll(() => t.close());

  const api = () => request(t.app);
  const register = (body: Record<string, unknown> = {}) =>
    api().post('/api/v1/auth/register').send({ fullName: 'Ahmed Ali', phone: '0912345678', password: 'Secret123', ...body });
  const login = (identifier: string, password = 'Secret123') =>
    api().post('/api/v1/auth/login').send({ identifier, password });
  const count = async (action: string) =>
    Number((await t.pg.query<{ n: string }>(`SELECT count(*)::text AS n FROM activity_logs WHERE action = $1`, [action])).rows[0]!.n);

  describe('registration', () => {
    it('registers with a phone number, normalises it and returns a session', async () => {
      const res = await register();
      expect(res.status).toBe(201);
      expect(res.body.user).toMatchObject({ fullName: 'Ahmed Ali', phone: '+249912345678', role: 'customer', status: 'active', preferredLanguage: 'ar' });
      expect(res.body.user.passwordHash).toBeUndefined();
      expect(res.body.accessToken).toEqual(expect.any(String));
      expect(res.body.refreshToken).toEqual(expect.any(String));
      expect(res.body.expiresIn).toBeGreaterThan(0);
      expect(await count('user.registered')).toBe(1);
    });

    it('registers with an email (case-insensitive) and stores an Argon2id hash', async () => {
      const res = await register({ phone: undefined, email: 'Ahmed@Example.COM' });
      expect(res.status).toBe(201);
      expect(res.body.user.email).toBe('ahmed@example.com');
      const { rows } = await t.pg.query<{ password_hash: string }>('SELECT password_hash FROM users');
      expect(rows[0]!.password_hash.startsWith('$argon2id$')).toBe(true);
      expect(rows[0]!.password_hash).not.toContain('Secret123');
    });

    it('ignores a client-supplied role (mass-assignment is rejected)', async () => {
      const res = await register({ role: 'super_admin' });
      expect(res.status).toBe(422);
      expect(await t.pg.query('SELECT 1 FROM users')).toMatchObject({ rows: [] });
    });

    it('rejects duplicates with 409, even in a different phone format', async () => {
      await register();
      const res = await register({ phone: '+249912345678' });
      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('ACCOUNT_EXISTS');
    });

    it.each([
      ['no identifier', { phone: undefined }],
      ['weak password', { password: 'short1' }],
      ['password without digit', { password: 'onlyletters' }],
      ['invalid phone', { phone: 'abc' }],
      ['invalid email', { phone: undefined, email: 'not-an-email' }],
      ['short name', { fullName: 'A' }],
    ])('rejects %s with 422', async (_label, body) => {
      const res = await register(body);
      expect(res.status).toBe(422);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('login', () => {
    beforeEach(async () => {
      await register({ email: 'ahmed@example.com' });
    });

    it.each(['0912345678', '+249912345678', '912345678', 'ahmed@example.com', 'AHMED@example.com'])(
      'accepts identifier %s',
      async (identifier) => {
        const res = await login(identifier);
        expect(res.status).toBe(200);
        expect(res.body.user.fullName).toBe('Ahmed Ali');
      },
    );

    it('returns the same generic error for a wrong password and an unknown account', async () => {
      const wrong = await login('0912345678', 'Wrong12345');
      const unknown = await login('0999999999');
      expect(wrong.status).toBe(401);
      expect(unknown.status).toBe(401);
      expect(wrong.body.error).toEqual(unknown.body.error);
      expect(wrong.body.error.code).toBe('INVALID_CREDENTIALS');
      expect(await count('auth.login_failed')).toBe(1);
    });

    it('blocks suspended accounts with 403', async () => {
      await t.pg.query(`UPDATE users SET status = 'suspended'`);
      const res = await login('0912345678');
      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('ACCOUNT_INACTIVE');
    });

    it('records last login and an audit entry', async () => {
      await login('0912345678');
      expect(await count('auth.login')).toBe(1);
      const { rows } = await t.pg.query<{ last_login_at: Date | null }>('SELECT last_login_at FROM users');
      expect(rows[0]!.last_login_at).not.toBeNull();
    });
  });

  describe('access tokens', () => {
    it('GET /users/me requires a valid bearer token', async () => {
      const { body } = await register();
      expect((await api().get('/api/v1/users/me')).status).toBe(401);
      expect((await api().get('/api/v1/users/me').set('Authorization', 'Bearer garbage')).status).toBe(401);

      const me = await api().get('/api/v1/users/me').set('Authorization', `Bearer ${body.accessToken}`);
      expect(me.status).toBe(200);
      expect(me.body).toMatchObject({ id: body.user.id, fullName: 'Ahmed Ali', role: 'customer' });
      expect(me.body.passwordHash).toBeUndefined();
    });

    it('reports TOKEN_EXPIRED for an expired token', async () => {
      const { body } = await register();
      const expired = jwt.sign({}, process.env.JWT_ACCESS_SECRET!, {
        subject: body.user.id, issuer: 'humasiyat', audience: 'humasiyat-api', expiresIn: -10,
      });
      const res = await api().get('/api/v1/users/me').set('Authorization', `Bearer ${expired}`);
      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('TOKEN_EXPIRED');
    });

    it('rejects tokens signed with another secret, algorithm "none", or the wrong audience', async () => {
      const { body } = await register();
      const wrongSecret = jwt.sign({}, 'x'.repeat(40), { subject: body.user.id, issuer: 'humasiyat', audience: 'humasiyat-api' });
      const wrongAudience = jwt.sign({}, process.env.JWT_ACCESS_SECRET!, { subject: body.user.id, issuer: 'humasiyat', audience: 'other' });
      const none = `${Buffer.from('{"alg":"none","typ":"JWT"}').toString('base64url')}.${Buffer.from(JSON.stringify({ sub: body.user.id, iss: 'humasiyat', aud: 'humasiyat-api' })).toString('base64url')}.`;
      for (const token of [wrongSecret, wrongAudience, none]) {
        expect((await api().get('/api/v1/users/me').set('Authorization', `Bearer ${token}`)).status).toBe(401);
      }
    });

    it('ignores any role claim inside the token: the role comes from the database', async () => {
      const { body } = await register();
      const forged = jwt.sign({ role: 'super_admin' }, process.env.JWT_ACCESS_SECRET!, {
        subject: body.user.id, issuer: 'humasiyat', audience: 'humasiyat-api',
      });
      const res = await api().patch(`/api/v1/admin/users/${body.user.id}/status`).set('Authorization', `Bearer ${forged}`).send({ status: 'active' });
      expect(res.status).toBe(403);
    });
  });

  describe('refresh tokens', () => {
    it('rotates the refresh token and issues a working access token', async () => {
      const { body } = await register();
      const res = await api().post('/api/v1/auth/refresh').send({ refreshToken: body.refreshToken });
      expect(res.status).toBe(200);
      expect(res.body.refreshToken).not.toBe(body.refreshToken);
      const me = await api().get('/api/v1/users/me').set('Authorization', `Bearer ${res.body.accessToken}`);
      expect(me.status).toBe(200);
    });

    it('stores only a hash of the refresh token', async () => {
      const { body } = await register();
      const { rows } = await t.pg.query<{ token_hash: string }>('SELECT token_hash FROM refresh_tokens');
      expect(rows[0]!.token_hash).not.toBe(body.refreshToken);
      expect(rows[0]!.token_hash).toMatch(/^[0-9a-f]{64}$/);
    });

    it('detects reuse of a rotated token and revokes the whole family', async () => {
      const { body } = await register();
      const rotated = await api().post('/api/v1/auth/refresh').send({ refreshToken: body.refreshToken });
      expect(rotated.status).toBe(200);

      const replay = await api().post('/api/v1/auth/refresh').send({ refreshToken: body.refreshToken });
      expect(replay.status).toBe(401);
      expect(replay.body.error.code).toBe('INVALID_REFRESH_TOKEN');

      const legit = await api().post('/api/v1/auth/refresh').send({ refreshToken: rotated.body.refreshToken });
      expect(legit.status).toBe(401); // family revoked: re-login required
      expect(await count('auth.refresh_reuse_detected')).toBeGreaterThanOrEqual(1); // replay + the revoked sibling both logged
    });

    it('rejects unknown and expired refresh tokens', async () => {
      const unknown = await api().post('/api/v1/auth/refresh').send({ refreshToken: 'x'.repeat(48) });
      expect(unknown.status).toBe(401);

      const { body } = await register();
      await t.pg.query(`UPDATE refresh_tokens SET expires_at = now() - interval '1 minute'`);
      expect((await api().post('/api/v1/auth/refresh').send({ refreshToken: body.refreshToken })).status).toBe(401);
    });

    it('keeps sessions on different devices independent', async () => {
      await register();
      const a = await login('0912345678');
      const b = await login('0912345678');
      await api().post('/api/v1/auth/logout').send({ refreshToken: a.body.refreshToken });
      expect((await api().post('/api/v1/auth/refresh').send({ refreshToken: a.body.refreshToken })).status).toBe(401);
      expect((await api().post('/api/v1/auth/refresh').send({ refreshToken: b.body.refreshToken })).status).toBe(200);
    });
  });

  describe('logout', () => {
    it('revokes the session and is idempotent', async () => {
      const { body } = await register();
      expect((await api().post('/api/v1/auth/logout').send({ refreshToken: body.refreshToken })).status).toBe(204);
      expect((await api().post('/api/v1/auth/logout').send({ refreshToken: body.refreshToken })).status).toBe(204);
      expect((await api().post('/api/v1/auth/logout').send({ refreshToken: 'y'.repeat(48) })).status).toBe(204);
      expect((await api().post('/api/v1/auth/refresh').send({ refreshToken: body.refreshToken })).status).toBe(401);
    });
  });

  describe('forgot / reset password', () => {
    it('answers identically for known and unknown accounts, and only delivers for real ones', async () => {
      await register();
      const known = await api().post('/api/v1/auth/forgot-password').send({ identifier: '0912345678' });
      const unknown = await api().post('/api/v1/auth/forgot-password').send({ identifier: '0900000000' });
      expect(known.status).toBe(200);
      expect(unknown.status).toBe(200);
      expect(known.body).toEqual(unknown.body);
      expect(sent).toHaveLength(1);
      expect(sent[0]!.to.phone).toBe('+249912345678');
    });

    it('resets the password with a single-use token and signs out every device', async () => {
      const { body } = await register();
      await api().post('/api/v1/auth/forgot-password').send({ identifier: '0912345678' });
      const token = sent[0]!.token;

      const res = await api().post('/api/v1/auth/reset-password').send({ token, newPassword: 'Brandnew99' });
      expect(res.status).toBe(204);

      expect((await login('0912345678', 'Secret123')).status).toBe(401);
      expect((await login('0912345678', 'Brandnew99')).status).toBe(200);
      expect((await api().post('/api/v1/auth/refresh').send({ refreshToken: body.refreshToken })).status).toBe(401);

      const again = await api().post('/api/v1/auth/reset-password').send({ token, newPassword: 'Another123' });
      expect(again.status).toBe(400);
      expect(again.body.error.code).toBe('INVALID_RESET_TOKEN');
      expect(await count('auth.password_reset_completed')).toBe(1);
    });

    it('rejects expired and superseded tokens', async () => {
      await register();
      await api().post('/api/v1/auth/forgot-password').send({ identifier: '0912345678' });
      await api().post('/api/v1/auth/forgot-password').send({ identifier: '0912345678' });
      const [first, second] = sent;

      const superseded = await api().post('/api/v1/auth/reset-password').send({ token: first!.token, newPassword: 'Brandnew99' });
      expect(superseded.status).toBe(400);

      await t.pg.query(`UPDATE password_reset_tokens SET expires_at = now() - interval '1 minute'`);
      const expired = await api().post('/api/v1/auth/reset-password').send({ token: second!.token, newPassword: 'Brandnew99' });
      expect(expired.status).toBe(400);
    });

    it('enforces the password policy on reset', async () => {
      await register();
      await api().post('/api/v1/auth/forgot-password').send({ identifier: '0912345678' });
      const res = await api().post('/api/v1/auth/reset-password').send({ token: sent[0]!.token, newPassword: 'weak' });
      expect(res.status).toBe(422);
    });

    it('does not store the reset token in plain text', async () => {
      await register();
      await api().post('/api/v1/auth/forgot-password').send({ identifier: '0912345678' });
      const { rows } = await t.pg.query<{ token_hash: string }>('SELECT token_hash FROM password_reset_tokens');
      expect(rows[0]!.token_hash).not.toBe(sent[0]!.token);
    });
  });

  describe('change password', () => {
    it('requires authentication', async () => {
      const res = await api().post('/api/v1/auth/change-password').send({ currentPassword: 'a', newPassword: 'Newpass123' });
      expect(res.status).toBe(401);
    });

    it('rejects a wrong current password with 400 (not 401)', async () => {
      const { body } = await register();
      const res = await api().post('/api/v1/auth/change-password').set('Authorization', `Bearer ${body.accessToken}`)
        .send({ currentPassword: 'Wrong12345', newPassword: 'Newpass123' });
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('INVALID_CURRENT_PASSWORD');
    });

    it('rejects reusing the current password', async () => {
      const { body } = await register();
      const res = await api().post('/api/v1/auth/change-password').set('Authorization', `Bearer ${body.accessToken}`)
        .send({ currentPassword: 'Secret123', newPassword: 'Secret123' });
      expect(res.status).toBe(400);
    });

    it('changes the password, revokes other sessions and keeps this device signed in', async () => {
      const { body } = await register();
      const other = await login('0912345678');

      const res = await api().post('/api/v1/auth/change-password').set('Authorization', `Bearer ${body.accessToken}`)
        .send({ currentPassword: 'Secret123', newPassword: 'Newpass123' });
      expect(res.status).toBe(200);

      expect((await api().post('/api/v1/auth/refresh').send({ refreshToken: other.body.refreshToken })).status).toBe(401);
      expect((await api().post('/api/v1/auth/refresh').send({ refreshToken: res.body.refreshToken })).status).toBe(200);
      expect((await login('0912345678', 'Newpass123')).status).toBe(200);
      expect((await login('0912345678', 'Secret123')).status).toBe(401);
    });
  });

  it('rejects unexpected fields on credential endpoints', async () => {
    const res = await api().post('/api/v1/auth/login').send({ identifier: '0912345678', password: 'x', extra: 1 });
    expect(res.status).toBe(422);
  });
});
