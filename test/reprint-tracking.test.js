const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { randomUUID } = require('node:crypto');
const { PGlite } = require('@electric-sql/pglite');
const utils = require('../server/_business-utils');
const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';
let pg;
let authenticated = true;
let lastRpc;

// Exercise the real handlers and SQL through a small PostgREST-shaped adapter.
class Query {
  constructor(table) { this.table = table; this.filters = []; this.values = []; this.columns = '*'; }
  select(columns) { this.columns = columns; return this; }
  eq(key, value) { this.values.push(value); this.filters.push(`"${key}" = $${this.values.length}`); return this; }
  in(key, values) { this.values.push(values); this.filters.push(`"${key}" = any($${this.values.length}::text[])`); return this; }
  upsert(rows, options) { assert.deepEqual(options, { onConflict: 'device_id,transaction_id', ignoreDuplicates: true }); this.rows = rows; return this; }
  update(values) { this.updates = values; return this; }
  maybeSingle() { this.one = true; return this.run(); }
  then(resolve, reject) { return this.run().then(resolve, reject); }
  async run() {
    try {
      let result;
      if (this.rows) {
        const columns = Object.keys(this.rows[0]);
        const values = [];
        const groups = this.rows.map(row => '(' + columns.map(key => {
          values.push(key === 'raw_payload' && row[key] !== null ? JSON.stringify(row[key]) : row[key]);
          return '$' + values.length;
        }).join(',') + ')');
        result = await pg.query(`insert into public."${this.table}" (${columns.map(key => `"${key}"`).join(',')}) values ${groups.join(',')} on conflict (device_id, transaction_id) do nothing returning ${this.columns}`, values);
      } else if (this.updates) {
        const values = [...this.values];
        const assignments = Object.entries(this.updates).map(([key, value]) => { values.push(value); return `"${key}" = $${values.length}`; });
        result = await pg.query(`update public."${this.table}" set ${assignments.join(',')} where ${this.filters.join(' and ')}`, values);
      } else {
        result = await pg.query(`select ${this.columns} from public."${this.table}" where ${this.filters.join(' and ') || 'true'}`, this.values);
      }
      return { data: this.one ? result.rows[0] || null : result.rows, error: null };
    } catch (error) { return { data: null, error }; }
  }
}
const db = {
  from(table) { return new Query(table); },
  async rpc(name, params) {
    assert.equal(name, 'business_transaction_report');
    lastRpc = params;
    const values = Object.values(params);
    const args = Object.keys(params).map((key, i) => `${key} => $${i + 1}`);
    try {
      const result = await pg.query(`select public.business_transaction_report(${args.join(',')}) as report`, values);
      return { data: result.rows[0].report, error: null };
    } catch (error) { return { data: null, error }; }
  }
};
utils.createClientFromEnv = () => db;
utils.getBusinessAuth = async () => authenticated ? { business: { id: A } } : null;
const sync = require('../server/device-transactions-sync');
const reporting = require('../server/business-transactions');
const migration = readFileSync('supabase/migrations/202611040001_reprint_transaction_tracking.sql', 'utf8');

test.before(async () => {
  pg = await PGlite.create();
  await pg.exec(`create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth; create function auth.uid() returns uuid language sql as $$ select null::uuid $$;
    create table public.businesses (id uuid primary key, owner_user_id uuid);
    create table public.devices (device_id text primary key, business_id uuid, last_seen_at timestamptz);
    insert into public.businesses values ('${A}', null), ('${B}', null);
    insert into public.devices values ('device-one', '${A}', null), ('device-two', '${A}', null), ('foreign-device', '${B}', null);`);
  await pg.exec(readFileSync('supabase/migrations/202610060001_device_transaction_sync.sql', 'utf8').replace('create extension if not exists pgcrypto;', ''));
  await pg.exec(readFileSync('supabase/migrations/202610180002_qrph_transaction_sync.sql', 'utf8'));
  await pg.exec(`insert into public.transactions (business_id, device_id, transaction_id, occurred_at, mode, payment_method, status, amount_centavos, prints_used)
    values ('${A}', 'device-one', 'legacy-large-print-count', '2026-01-01Z', 'Receiptbooth', 'voucher', 'completed', 0, 100);`);
  await pg.exec(migration);
});
test.after(async () => { await pg?.close(); });

async function call(handler, { body, url = '/', method = 'POST' } = {}) {
  const req = { method, url, body, headers: { 'x-forwarded-for': randomUUID() } };
  const res = { setHeader() {}, end(value) { this.body = JSON.parse(value); } };
  await handler(req, res);
  return { code: res.statusCode, ...res.body };
}
function record(overrides = {}) {
  return { transactionId: randomUUID(), occurredAt: '2026-11-04T02:00:00.000Z', mode: 'Reprint', paymentMethod: 'none',
    status: 'completed', amountCentavos: 0, printsUsed: 2, copiesRequested: 2, printStatus: 'submitted',
    originalTransactionId: null, sourceMode: 'Photobooth', voucherCode: null, ...overrides };
}
const send = (transactions, extra = {}) => call(sync, { body: { deviceId: 'device-one', businessId: A, transactions, ...extra } });
const report = (query = '') => call(reporting, { method: 'GET', url: '/api/business/transactions?' + query });

test('free and paid reprint batches use existing sync; retries never alter money or copy totals', async () => {
  const free = record();
  const paid = record({ paymentMethod: 'qrph', amountCentavos: 10000, printStatus: 'failed', printsUsed: 0 });
  const result = await send([free, paid, free]);
  assert.deepEqual(result.accepted, [free.transactionId, paid.transactionId]);
  assert.deepEqual(result.duplicates, [free.transactionId]);
  assert.deepEqual(result.failed, []);
  const before = await report('mode=Reprint');
  assert.equal(before.summary.reprintCopiesSent, 2);
  assert.equal(before.summary.paidReprintRevenueCentavos, 10000);
  assert.equal(before.summary.failedReprintBatches, 1);
  assert.equal(before.summary.freeAdminReprintBatches, 1);
  const retry = await send([free, { ...paid, amountCentavos: 99999, printStatus: 'submitted', printsUsed: 2 }]);
  assert.deepEqual(retry.accepted, []);
  assert.deepEqual(retry.duplicates, [free.transactionId, paid.transactionId]);
  assert.deepEqual((await report('mode=Reprint')).summary, before.summary);
});

test('partial, failed, uncertain and later deliberate reprints are distinct finalized journal records', async () => {
  const records = [
    record({ copiesRequested: 3, printsUsed: 1, printStatus: 'partial' }),
    record({ printsUsed: 0, printStatus: 'failed', status: 'failed' }),
    record({ printsUsed: 0, printStatus: 'unknown', status: 'failed' }),
    record({ printsUsed: 1, printStatus: 'unknown' }),
    record({ paymentMethod: 'coin', amountCentavos: 500, printsUsed: 0, printStatus: 'unknown' })
  ];
  assert.equal((await send(records)).accepted.length, 5);
  const totals = await report('mode=Reprint');
  assert.equal(totals.summary.partialReprintBatches, 1);
  assert.equal(totals.summary.unknownReprintBatches, 3);
  assert.equal(totals.summary.reprintCopiesSent, 4);
  assert.equal(totals.summary.paidReprintRevenueCentavos, 10500);
});

test('legacy sales and QR Ph remain compatible, optional metadata defaults null and no raw gallery files persist', async () => {
  const old = { transactionId: randomUUID(), occurredAt: '2026-11-04T00:00:00Z', mode: 'Receiptbooth', status: 'completed', printsUsed: 20, amountCentavos: 100 };
  for (const paymentMethod of ['coin', 'voucher', 'qrph']) assert.equal((await send([{ ...old, transactionId: randomUUID(), paymentMethod }])).accepted.length, 1);
  const legacy = (await pg.query(`select * from transactions where transaction_id = 'legacy-large-print-count'`)).rows[0];
  assert.equal(legacy.prints_used, 100);
  assert.equal(legacy.print_status, null);
  assert.equal(legacy.copies_requested, null);
  const reprint = record({ filePath: '/private/gallery.jpg', photoBase64: 'do-not-store' });
  await send([reprint]);
  const row = (await pg.query('select * from transactions where transaction_id = $1', [reprint.transactionId])).rows[0];
  assert.equal(row.raw_payload, null);
});

test('strict cross-field validation rejects malformed/free normal sales and keeps valid rows in mixed batches', async () => {
  const invalid = [
    { mode: 'reprint' }, { copiesRequested: null }, { copiesRequested: 0 }, { copiesRequested: 11 },
    { copiesRequested: '2' }, { copiesRequested: 1.5 }, { copiesRequested: true }, { printStatus: null },
    { printStatus: 'printed' }, { printStatus: 'Submitted' }, { printsUsed: 3 }, { printsUsed: -1 },
    { printStatus: 'partial', printsUsed: 0 }, { printStatus: 'partial', printsUsed: 2 },
    { printStatus: 'failed', printsUsed: 1 }, { originalTransactionId: 3 }, { originalTransactionId: ' ' },
    { sourceMode: 'Reprint' }, { paymentMethod: 'none', amountCentavos: 100 },
    { paymentMethod: 'none', voucherCode: 'NOT-FREE' }, { amountCentavos: '0' },
    { paymentMethod: 'coin', amountCentavos: 100, status: 'failed', printStatus: 'failed', printsUsed: 0 },
    { status: 'failed' }, { printStatus: 'failed', printsUsed: 0, status: 'completed' },
    { mode: 'Photobooth', copiesRequested: null, printStatus: null },
    { mode: 'ID Photo', paymentMethod: 'none' }, { paymentMethod: 'card' }
  ];
  for (const overrides of invalid) assert.ok(sync.normalizeTransaction(record(overrides)).error, JSON.stringify(overrides));
  const valid = record();
  const result = await send([valid, ...invalid.map(overrides => record(overrides))]);
  assert.deepEqual(result.accepted, [valid.transactionId]);
  assert.equal(result.failed.length, invalid.length);
});

test('SQL enforces the same invariants even for direct inserts', async () => {
  const insert = async patch => {
    const item = { business_id: A, device_id: 'device-one', transaction_id: randomUUID(), occurred_at: '2026-11-04T00:00:00Z', mode: 'Reprint', payment_method: 'none', status: 'completed', amount_centavos: 0, prints_used: 2, copies_requested: 2, print_status: 'submitted', ...patch };
    const keys = Object.keys(item);
    return pg.query(`insert into transactions (${keys.join(',')}) values (${keys.map((k,i) => '$' + (i + 1)).join(',')})`, Object.values(item));
  };
  for (const patch of [{ copies_requested: null }, { copies_requested: 11 }, { print_status: null }, { print_status: 'printed' }, { prints_used: 3 }, { print_status: 'failed' }, { mode: 'Photobooth' }, { amount_centavos: 100 }]) {
    await assert.rejects(insert(patch), /check constraint/);
  }
});

test('original IDs link only within the same business and device, including offline batches', async () => {
  const parent = { transactionId: randomUUID(), occurredAt: '2026-01-01T00:00:00Z', mode: 'Photobooth', paymentMethod: 'coin', status: 'completed', amountCentavos: 2500, printsUsed: 1 };
  const child = record({ originalTransactionId: parent.transactionId });
  assert.equal((await send([child, parent])).accepted.length, 2);
  const same = record({ originalTransactionId: parent.transactionId });
  await send([same]);
  const dbUuid = (await pg.query('select id from transactions where transaction_id = $1', [parent.transactionId])).rows[0].id;
  const foreign = record();
  await pg.query(`insert into transactions (business_id, device_id, transaction_id, occurred_at, mode, payment_method, status, amount_centavos, prints_used) values ($1, 'device-one', $2, now(), 'Photobooth', 'coin', 'completed', 1, 1)`, [B, foreign.transactionId]);
  await send([{ ...parent, transactionId: 'other-device-parent' }], { deviceId: 'device-two' });
  const unlinked = [record({ originalTransactionId: dbUuid }), record({ originalTransactionId: foreign.transactionId }), record({ originalTransactionId: 'other-device-parent' }), record({ originalTransactionId: 'missing' })];
  assert.equal((await send(unlinked)).accepted.length, 4);
  for (const item of [same, child, ...unlinked]) {
    const row = (await pg.query('select original_transaction_id from transactions where transaction_id = $1', [item.transactionId])).rows[0];
    assert.equal(row.original_transaction_id, [same, child].includes(item) ? parent.transactionId : null);
  }
  assert.equal((await send([record()], { businessId: B })).code, 403);
  assert.equal((await send([record()], { deviceId: 'foreign-device' })).code, 403);
});

test('report aggregates all records beyond 1000, paginates consistently, and does not add parent revenue', async () => {
  await pg.exec(`insert into transactions (business_id, device_id, transaction_id, occurred_at, mode, payment_method, status, amount_centavos, prints_used, copies_requested, print_status)
    select '${A}', 'device-two', 'offline-' || n, '2026-10-15T04:00:00Z'::timestamptz, 'Reprint', 'coin', 'completed', 200, 1, 1, 'submitted' from generate_series(1, 1205) n;
    insert into transactions (business_id, device_id, transaction_id, occurred_at, mode, payment_method, status, amount_centavos, prints_used)
    values ('${B}', 'foreign-device', 'private-sale', '2026-10-15T04:00:00Z', 'Photobooth', 'coin', 'completed', 999999, 1);`);
  const query = 'dateFrom=2026-10-15&dateTo=2026-10-15&deviceId=device-two&mode=Reprint';
  const first = await report(query + '&pageSize=100');
  assert.equal(first.code, 200);
  assert.equal(first.total, 1205);
  assert.equal(first.transactions.length, 100);
  assert.equal(first.summary.reprintBatches, 1205);
  assert.equal(first.summary.reprintCopiesSent, 1205);
  assert.equal(first.summary.recordedRevenueCentavos, 241000);
  assert.equal(first.summary.paidReprintRevenueCentavos, 241000);
  const last = await report(query + '&page=13&pageSize=100');
  assert.equal(last.transactions.length, 5);
  assert.equal(last.hasMore, false);
  assert.deepEqual(last.summary, first.summary);
  assert.notEqual(first.transactions[0].id, last.transactions[0].id);
  assert.equal(first.reportingTimezone, 'Asia/Manila');
  const forged = await report(query + '&businessId=' + B);
  assert.equal(lastRpc.p_business_id, A);
  assert.equal(forged.total, 1205);
});

test('Manila dates include exact midnight and end-exclusive next midnight for rows and totals', async () => {
  await send([
    record({ occurredAt: '2026-10-19T15:59:59.999Z' }),
    record({ occurredAt: '2026-10-19T16:00:00.000Z' }),
    record({ occurredAt: '2026-10-20T15:59:59.999Z' }),
    record({ occurredAt: '2026-10-20T16:00:00.000Z' })
  ]);
  const result = await report('dateFrom=2026-10-20&dateTo=2026-10-20&paymentMethod=none');
  assert.equal(result.total, 2);
  assert.equal(result.summary.reprintCopiesSent, 4);
  assert.equal(result.summary.recordedRevenueCentavos, 0);
  assert.ok(result.transactions.every(row => row.payment_method === 'none'));
});

test('report rejects invalid filters, requires business auth, and RPC privileges preserve isolation', async () => {
  for (const query of ['dateFrom=2026-02-30', 'dateFrom=bad', 'dateFrom=2027-01-01&dateTo=2026-01-01', 'page=0', 'pageSize=101', 'page=NaN', 'page=1.5', 'mode=reprint', 'paymentMethod=card']) assert.equal((await report(query)).code, 400, query);
  authenticated = false;
  assert.equal((await report()).code, 401);
  authenticated = true;
  const grants = (await pg.query(`select has_function_privilege('anon', 'public.business_transaction_report(uuid,date,date,text,text,text,text,integer,integer)', 'EXECUTE') as anon,
    has_function_privilege('authenticated', 'public.business_transaction_report(uuid,date,date,text,text,text,text,integer,integer)', 'EXECUTE') as browser,
    has_function_privilege('service_role', 'public.business_transaction_report(uuid,date,date,text,text,text,text,integer,integer)', 'EXECUTE') as server`)).rows[0];
  assert.deepEqual(grants, { anon: false, browser: false, server: true });
  assert.equal((await pg.query(`select relrowsecurity from pg_class where oid = 'public.transactions'::regclass`)).rows[0].relrowsecurity, true);
  await pg.exec(migration); // repeatable deployment; no data loss
  assert.equal((await report('dateFrom=2026-10-15&dateTo=2026-10-15')).total, 1205);
});
