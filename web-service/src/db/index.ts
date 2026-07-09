import { Pool } from 'pg';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

export const query = (text: string, params?: unknown[]) => {
  return pool.query(text, params);
};

export const getClient = () => pool.connect();
