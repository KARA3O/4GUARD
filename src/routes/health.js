// GET /api/health — quick check that the database is connected and fully migrated.

import { json } from '../lib/http.js';

const TABLES = ['users', 'sessions', 'bookings', 'reviews', 'customer_feedback', 'login_attempts'];

export async function health(request, env) {
  try {
    const { results } = await env.DB.prepare(
      `select name from sqlite_master where type = 'table' and name in (${TABLES.map(() => '?').join(', ')})`
    ).bind(...TABLES).all();
    const columns = await env.DB.prepare("select name from pragma_table_info('bookings') where name = 'reference'").all();
    const ready = results.length === TABLES.length && columns.results.length === 1;
    return ready
      ? json({ ok: true, service: '4Guard API', database: 'connected', schema: 'ready' })
      : json({ ok: false, service: '4Guard API', database: 'connected', schema: 'incomplete', hint: 'Run: npm run db:migrate:remote' }, 503);
  } catch {
    return json({ ok: false, service: '4Guard API', database: 'unavailable', hint: 'Check the D1 binding in wrangler.toml, then run the migrations.' }, 503);
  }
}
