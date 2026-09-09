import { Pool } from 'pg';

const parsePositiveInteger = (value: string | undefined, fallback: number, maximum: number) => {
  const parsed = Number.parseInt(value || '', 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.min(parsed, maximum);
};

const pool = new Pool({
  connectionString: process.env.DATABASE_URL?.trim(),
  max: parsePositiveInteger(process.env.PG_POOL_MAX, 10, 20),
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: parsePositiveInteger(process.env.DATABASE_CONNECT_TIMEOUT_MS, 10000, 30000),
});

pool.on('error', (err) => {
  console.error('Unexpected error on idle client', err);
  process.exit(-1);
});

export const query = async (text: string, params?: unknown[]) => {
  const start = Date.now();
  const res = await pool.query(text, params);
  const duration = Date.now() - start;
  
  if (process.env.NODE_ENV === 'development') {
    console.log('Executed query', { text: text.substring(0, 100), duration, rows: res.rowCount });
  }
  
  return res;
};

export const getClient = () => pool.connect();

export const pingDatabase = async () => {
  await pool.query('SELECT 1');
};

export const closePool = () => pool.end();
