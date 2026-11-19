import { loadMigrations } from './helpers/migrations';
import { createMigratedDb } from './helpers/testDb';

type PGlite = Awaited<ReturnType<typeof createMigratedDb>>;

const EXPECTED_TABLES = [
  'users', 'refresh_tokens', 'password_reset_tokens', 'manager_applications', 'pitches', 'pitch_images',
  'pitch_facilities', 'pitch_operating_hours', 'pitch_pricing', 'pitch_blocks', 'bookings', 'payments',
  'payment_receipts', 'notifications', 'device_tokens', 'reviews', 'activity_logs', 'platform_settings',
];

describe('database migrations', () => {
  let db: PGlite;
  let managerId: string;
  let customerA: string;
  let customerB: string;
  let pitchId: string;

  beforeAll(async () => {
    db = await createMigratedDb();
    const ins = async (name: string, phone: string, role: string) =>
      (await db.query<{ id: string }>(
        `INSERT INTO users (full_name, phone, password_hash, role) VALUES ($1,$2,'hash',$3) RETURNING id`,
        [name, phone, role],
      )).rows[0]!.id;
    managerId = await ins('Manager One', '+249911000001', 'manager');
    customerA = await ins('Customer A', '+249911000002', 'customer');
    customerB = await ins('Customer B', '+249911000003', 'customer');
    pitchId = (await db.query<{ id: string }>(
      `INSERT INTO pitches (manager_id, name, address, city) VALUES ($1,'Pitch 1','Street 1','Khartoum') RETURNING id`,
      [managerId],
    )).rows[0]!.id;
  });

  afterAll(async () => {
    await db.close();
  });

  const book = (customerId: string, start: string, end: string, status: string, hold = 'now() + interval \'15 minutes\'') =>
    db.query(
      `INSERT INTO bookings (pitch_id, customer_id, starts_at, ends_at, total_price, status, hold_expires_at)
       VALUES ($1,$2,$3,$4,5000,$5,${status === 'awaiting_payment' ? hold : 'NULL'})`,
      [pitchId, customerId, start, end, status],
    );

  it('creates every required table', async () => {
    const { rows } = await db.query<{ table_name: string }>(
      `SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'`,
    );
    const names = rows.map((r) => r.table_name);
    for (const t of EXPECTED_TABLES) expect(names).toContain(t);
  });

  it('seeds platform settings including the payment hold', async () => {
    const { rows } = await db.query<{ value: number }>(`SELECT value FROM platform_settings WHERE key='payment_hold_minutes'`);
    expect(rows[0]!.value).toBe(15);
  });

  it('requires an email or a phone number and validates phone format', async () => {
    await expect(db.query(`INSERT INTO users (full_name, password_hash) VALUES ('No Id','h')`)).rejects.toThrow();
    await expect(db.query(`INSERT INTO users (full_name, phone, password_hash) VALUES ('Bad','0911','h')`)).rejects.toThrow();
  });

  it('treats email as case-insensitive unique', async () => {
    await db.query(`INSERT INTO users (full_name, email, password_hash) VALUES ('E1','Test@Example.com','h')`);
    await expect(db.query(`INSERT INTO users (full_name, email, password_hash) VALUES ('E2','test@example.com','h')`)).rejects.toThrow();
  });

  describe('double-booking prevention', () => {
    it('rejects an overlapping confirmed booking (exclusion violation 23P01)', async () => {
      await book(customerA, '2027-01-10T18:00:00Z', '2027-01-10T19:00:00Z', 'confirmed');
      await expect(book(customerB, '2027-01-10T18:30:00Z', '2027-01-10T19:30:00Z', 'confirmed')).rejects.toMatchObject({ code: '23P01' });
    });

    it('rejects a booking overlapping an active payment hold', async () => {
      await book(customerA, '2027-01-11T18:00:00Z', '2027-01-11T19:00:00Z', 'awaiting_payment');
      await expect(book(customerB, '2027-01-11T18:00:00Z', '2027-01-11T19:00:00Z', 'awaiting_payment')).rejects.toMatchObject({ code: '23P01' });
    });

    it('allows back-to-back bookings (end is exclusive)', async () => {
      await book(customerA, '2027-01-12T18:00:00Z', '2027-01-12T19:00:00Z', 'confirmed');
      await expect(book(customerB, '2027-01-12T19:00:00Z', '2027-01-12T20:00:00Z', 'confirmed')).resolves.toBeDefined();
    });

    it('does not block competing pending requests, but only one can be approved', async () => {
      await book(customerA, '2027-01-13T18:00:00Z', '2027-01-13T19:00:00Z', 'pending_manager_approval');
      await book(customerB, '2027-01-13T18:00:00Z', '2027-01-13T19:00:00Z', 'pending_manager_approval');
      const { rows } = await db.query<{ id: string }>(
        `SELECT id FROM bookings WHERE pitch_id=$1 AND starts_at='2027-01-13T18:00:00Z' ORDER BY created_at, id`, [pitchId]);
      expect(rows).toHaveLength(2);
      const approve = (id: string) =>
        db.query(`UPDATE bookings SET status='awaiting_payment', hold_expires_at = now() + interval '15 minutes' WHERE id=$1`, [id]);
      await approve(rows[0]!.id);
      await expect(approve(rows[1]!.id)).rejects.toMatchObject({ code: '23P01' });
    });

    it('frees the slot once a hold is expired, rejected or cancelled', async () => {
      await book(customerA, '2027-01-14T18:00:00Z', '2027-01-14T19:00:00Z', 'awaiting_payment');
      await db.query(`UPDATE bookings SET status='expired' WHERE pitch_id=$1 AND starts_at='2027-01-14T18:00:00Z'`, [pitchId]);
      await expect(book(customerB, '2027-01-14T18:00:00Z', '2027-01-14T19:00:00Z', 'confirmed')).resolves.toBeDefined();
    });

    it('is not fooled by other pitches', async () => {
      const other = (await db.query<{ id: string }>(
        `INSERT INTO pitches (manager_id, name, address, city) VALUES ($1,'Pitch 2','Street 2','Khartoum') RETURNING id`, [managerId])).rows[0]!.id;
      await db.query(
        `INSERT INTO bookings (pitch_id, customer_id, starts_at, ends_at, total_price, status)
         VALUES ($1,$2,'2027-01-10T18:00:00Z','2027-01-10T19:00:00Z',5000,'confirmed')`, [other, customerB]);
    });

    it('lets managers create manual (walk-in) bookings that also block the slot', async () => {
      await db.query(
        `INSERT INTO bookings (pitch_id, guest_name, guest_phone, source, starts_at, ends_at, total_price, status, created_by)
         VALUES ($1,'Walk-in Ali','+249911999999','manual','2027-01-15T18:00:00Z','2027-01-15T19:00:00Z',5000,'confirmed',$2)`,
        [pitchId, managerId]);
      await expect(book(customerA, '2027-01-15T18:00:00Z', '2027-01-15T19:00:00Z', 'confirmed')).rejects.toMatchObject({ code: '23P01' });
    });

    it('rejects online bookings without a customer, and holds without an expiry', async () => {
      await expect(db.query(
        `INSERT INTO bookings (pitch_id, starts_at, ends_at, total_price) VALUES ($1,'2027-02-01T10:00:00Z','2027-02-01T11:00:00Z',1)`, [pitchId],
      )).rejects.toThrow();
      await expect(db.query(
        `INSERT INTO bookings (pitch_id, customer_id, starts_at, ends_at, total_price, status)
         VALUES ($1,$2,'2027-02-01T10:00:00Z','2027-02-01T11:00:00Z',1,'awaiting_payment')`, [pitchId, customerA],
      )).rejects.toThrow();
    });

    it('rejects an invalid time range', async () => {
      await expect(book(customerA, '2027-02-02T11:00:00Z', '2027-02-02T10:00:00Z', 'confirmed')).rejects.toThrow();
    });
  });

  describe('pitch blocks', () => {
    it('prevents overlapping blocks', async () => {
      await db.query(`INSERT INTO pitch_blocks (pitch_id, starts_at, ends_at, reason) VALUES ($1,'2027-03-01T08:00:00Z','2027-03-01T12:00:00Z','maintenance')`, [pitchId]);
      await expect(db.query(
        `INSERT INTO pitch_blocks (pitch_id, starts_at, ends_at) VALUES ($1,'2027-03-01T11:00:00Z','2027-03-01T13:00:00Z')`, [pitchId],
      )).rejects.toMatchObject({ code: '23P01' });
    });
  });

  describe('payments', () => {
    it('allows only one open and one verified payment per booking', async () => {
      const bookingId = (await db.query<{ id: string }>(
        `SELECT id FROM bookings WHERE pitch_id=$1 AND starts_at='2027-01-10T18:00:00Z' AND status='confirmed'`, [pitchId])).rows[0]!.id;
      await db.query(`INSERT INTO payments (booking_id, amount, status) VALUES ($1,5000,'submitted')`, [bookingId]);
      await expect(db.query(`INSERT INTO payments (booking_id, amount, status) VALUES ($1,5000,'awaiting_payment')`, [bookingId])).rejects.toMatchObject({ code: '23505' });
      await db.query(`UPDATE payments SET status='verified' WHERE booking_id=$1`, [bookingId]);
      await expect(db.query(`INSERT INTO payments (booking_id, amount, status) VALUES ($1,5000,'verified')`, [bookingId])).rejects.toMatchObject({ code: '23505' });
    });

    it('restricts receipt file types', async () => {
      const paymentId = (await db.query<{ id: string }>(`SELECT id FROM payments LIMIT 1`)).rows[0]!.id;
      await expect(db.query(
        `INSERT INTO payment_receipts (payment_id, storage_path, mime_type, file_size_bytes) VALUES ($1,'a.exe','application/x-msdownload',10)`, [paymentId],
      )).rejects.toThrow();
    });
  });

  it('maintains updated_at through triggers', async () => {
    const before = (await db.query<{ updated_at: string }>(`SELECT updated_at FROM users WHERE id=$1`, [customerA])).rows[0]!.updated_at;
    await new Promise((r) => setTimeout(r, 15));
    await db.query(`UPDATE users SET full_name='Customer A2' WHERE id=$1`, [customerA]);
    const after = (await db.query<{ updated_at: string }>(`SELECT updated_at FROM users WHERE id=$1`, [customerA])).rows[0]!.updated_at;
    expect(new Date(after).getTime()).toBeGreaterThan(new Date(before).getTime());
  });

  it('rolls back cleanly (every down migration works, in reverse order)', async () => {
    const fresh = await createMigratedDb();
    for (const m of loadMigrations().reverse()) await fresh.exec(m.down);
    const { rows } = await fresh.query<{ table_name: string }>(`SELECT table_name FROM information_schema.tables WHERE table_schema='public'`);
    expect(rows).toHaveLength(0);
    await fresh.close();
  });
});
