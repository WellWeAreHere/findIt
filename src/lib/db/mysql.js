// MySQL connection pool (mysql2). One pool per process; cached on
// globalThis so Next.js hot reloads in development don't leak pools.
import mysql from 'mysql2/promise';

const g = globalThis;
g.__finditMysql ??= { pool: null, database: null };
const state = g.__finditMysql;

// Lets scripts/tests point the app at another database before first use.
export function useMysqlDatabase(name) {
  if (state.pool) throw new Error('MySQL pool already created');
  state.database = name;
}

export function getPool() {
  if (!state.pool) {
    if (!process.env.MYSQL_USER) throw new Error('MYSQL_* environment variables are not set');
    state.pool = mysql.createPool({
      host: process.env.MYSQL_HOST ?? '127.0.0.1',
      port: Number(process.env.MYSQL_PORT ?? 3306),
      user: process.env.MYSQL_USER,
      password: process.env.MYSQL_PASSWORD ?? '',
      database: state.database ?? process.env.MYSQL_DATABASE,
      connectionLimit: 10,
      dateStrings: true,      // DATE/DATETIME come back as strings, no TZ surprises
      decimalNumbers: true,   // DECIMAL scores come back as numbers
      supportBigNumbers: true,
    });
  }
  return state.pool;
}

// Parameterised query on the pool. Never interpolate user input into sql.
export async function query(sql, params = []) {
  const [rows] = await getPool().execute(sql, params);
  return rows;
}

// "?, ?, ?" for an IN (...) list (prepared statements cannot bind arrays).
export function placeholders(values) {
  if (!values.length) throw new Error('placeholders() needs at least one value');
  return values.map(() => '?').join(', ');
}

// A validated non-negative integer for LIMIT/OFFSET, which MySQL's binary
// protocol does not accept as bound parameters.
export function sqlInt(value, max = 1000) {
  const n = Number.parseInt(value, 10);
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.min(n, max);
}

export async function queryOne(sql, params = []) {
  const rows = await query(sql, params);
  return rows[0] ?? null;
}

// Runs fn(conn) on a dedicated connection with @app_user_id set, so the
// audit triggers record who made the change.
export async function withConnection(fn, { userId = null } = {}) {
  const conn = await getPool().getConnection();
  try {
    await conn.query('SET @app_user_id = ?', [userId]);
    return await fn(conn);
  } finally {
    await conn.query('SET @app_user_id = NULL').catch(() => {});
    conn.release();
  }
}

// Same as withConnection, wrapped in START TRANSACTION / COMMIT / ROLLBACK.
export async function transaction(fn, { userId = null } = {}) {
  return withConnection(async (conn) => {
    await conn.beginTransaction();
    try {
      const result = await fn(conn);
      await conn.commit();
      return result;
    } catch (err) {
      await conn.rollback();
      throw err;
    }
  }, { userId });
}

// Rows from a CALL: mysql2 returns [resultSet1, resultSet2, ..., OkPacket].
export function resultSets(callResult) {
  return callResult.filter(Array.isArray);
}

export async function closeMysql() {
  if (state.pool) {
    await state.pool.end();
    state.pool = null;
  }
}
