import bcrypt from 'bcryptjs';
import { query } from '../db/index.js';

export const ensureDefaultAdmin = async () => {
  const email = (process.env.ADMIN_EMAIL || 'admin123@gmail.com').trim().toLowerCase();
  const password = process.env.ADMIN_PASSWORD || '123456';
  const name = process.env.ADMIN_NAME || 'TourAI Admin';
  const syncPassword = process.env.ADMIN_SYNC_PASSWORD === 'true';

  if (!email || !password) {
    console.warn('[Admin] ADMIN_EMAIL/ADMIN_PASSWORD is not configured; skipping seed.');
    return;
  }

  const existing = await query('SELECT id, role FROM users WHERE email = $1', [email]);
  if (existing.rows.length === 0) {
    const passwordHash = await bcrypt.hash(password, 12);
    await query(
      `INSERT INTO users (name, email, password_hash, role, email_verified_at)
       VALUES ($1, $2, $3, 'admin', CURRENT_TIMESTAMP)`,
      [name, email, passwordHash],
    );
    console.log(`[Admin] Seeded admin account ${email}`);
    return;
  }

  const user = existing.rows[0];
  if (user.role !== 'admin') {
    await query(`UPDATE users SET role = 'admin', updated_at = CURRENT_TIMESTAMP WHERE id = $1`, [user.id]);
    console.log(`[Admin] Promoted ${email} to admin`);
  }

  if (syncPassword) {
    const passwordHash = await bcrypt.hash(password, 12);
    await query('UPDATE users SET password_hash = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2', [passwordHash, user.id]);
  }
};
