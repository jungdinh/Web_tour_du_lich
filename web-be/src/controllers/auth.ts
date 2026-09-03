import { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import crypto from 'node:crypto';
import jwt, { type SignOptions } from 'jsonwebtoken';
import { OAuth2Client } from 'google-auth-library';
import { query } from '../db/index.js';
import { sendVerificationEmail } from '../services/email.js';
import { z } from 'zod';

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-in-production';
const JWT_EXPIRES_IN = (process.env.JWT_EXPIRES_IN || '7d') as SignOptions['expiresIn'];
const verificationMinutes = Math.max(5, Number(process.env.EMAIL_VERIFICATION_EXPIRES_MINUTES || 10));
const verificationSecret = process.env.EMAIL_VERIFICATION_SECRET || JWT_SECRET;
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID?.trim();
const googleClient = GOOGLE_CLIENT_ID ? new OAuth2Client(GOOGLE_CLIENT_ID) : null;

export const registerSchema = z.object({
  name: z.string().trim().min(2, 'Họ tên phải có ít nhất 2 ký tự').max(255),
  email: z.string().trim().email('Email không hợp lệ').max(255).transform((value) => value.toLowerCase()),
  password: z.string().min(6, 'Mật khẩu phải có ít nhất 6 ký tự'),
});

export const loginSchema = z.object({
  email: z.string().trim().email('Email không hợp lệ').transform((value) => value.toLowerCase()),
  password: z.string(),
});

const verificationSchema = z.object({
  email: z.string().trim().email().transform((value) => value.toLowerCase()),
  code: z.string().trim().regex(/^\d{6}$/, 'Mã xác minh gồm 6 chữ số'),
});

const googleLoginSchema = z.object({
  credential: z.string().trim().min(1).max(10000),
});

export interface AuthUser { id: number; name: string; email: string; role: string }
export interface AuthRequest extends Request { user?: AuthUser }

const createToken = (user: AuthUser) => jwt.sign(
  { id: user.id, email: user.email, role: user.role },
  JWT_SECRET,
  { expiresIn: JWT_EXPIRES_IN },
);

const hashVerificationCode = (userId: number, code: string) => crypto
  .createHmac('sha256', verificationSecret)
  .update(`${userId}:${code}`)
  .digest('hex');

const issueVerificationCode = async (userId: number, email: string, name: string) => {
  const recent = await query(
    `SELECT created_at FROM email_verification_codes
     WHERE user_id = $1 AND created_at > NOW() - INTERVAL '60 seconds'
     ORDER BY created_at DESC LIMIT 1`,
    [userId],
  );
  if (recent.rows.length) throw new Error('VERIFICATION_RATE_LIMIT');

  const code = crypto.randomInt(100000, 1000000).toString();
  await query(
    `INSERT INTO email_verification_codes (user_id, code_hash, expires_at)
     VALUES ($1, $2, NOW() + ($3 * INTERVAL '1 minute'))`,
    [userId, hashVerificationCode(userId, code), verificationMinutes],
  );
  await sendVerificationEmail({ to: email, name, code });
};

const publicUser = (user: Record<string, unknown>): AuthUser => ({
  id: Number(user.id),
  name: String(user.name),
  email: String(user.email),
  role: String(user.role),
});

const verifyGoogleCredential = async (credential: string) => {
  if (!googleClient || !GOOGLE_CLIENT_ID) throw new Error('GOOGLE_AUTH_NOT_CONFIGURED');

  const ticket = await googleClient.verifyIdToken({
    idToken: credential,
    audience: GOOGLE_CLIENT_ID,
  });
  const payload = ticket.getPayload();
  if (!payload?.sub || !payload.email || payload.email_verified !== true) {
    throw new Error('GOOGLE_TOKEN_INVALID');
  }

  const email = payload.email.trim().toLowerCase();
  const displayName = typeof payload.name === 'string' ? payload.name.trim() : '';

  return {
    sub: payload.sub,
    email,
    name: (displayName || email.split('@')[0] || 'Google user').slice(0, 255),
  };
};

export const register = async (req: Request, res: Response) => {
  try {
    const { name, email, password } = registerSchema.parse(req.body);
    const existing = await query(
      'SELECT id, name, email, role, email_verified_at FROM users WHERE email = $1',
      [email],
    );
    if (existing.rows.length > 0) {
      if (!existing.rows[0].email_verified_at) {
        try {
          await issueVerificationCode(existing.rows[0].id, email, existing.rows[0].name);
          return res.status(202).json({ requires_verification: true, email, message: 'Mã xác minh đã được gửi lại.' });
        } catch (error) {
          if (error instanceof Error && error.message === 'VERIFICATION_RATE_LIMIT') {
            return res.status(429).json({ error: 'Bạn vừa yêu cầu mã. Vui lòng thử lại sau 60 giây.' });
          }
          throw error;
        }
      }
      return res.status(409).json({ error: 'Email này đã được đăng ký.' });
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const result = await query(
      `INSERT INTO users (name, email, password_hash, email_verified_at)
       VALUES ($1, $2, $3, NULL)
       RETURNING id, name, email, role`,
      [name, email, passwordHash],
    );
    const user = result.rows[0];
    try {
      await issueVerificationCode(user.id, user.email, user.name);
    } catch (error) {
      console.error('Verification email error:', error);
      return res.status(503).json({ error: 'Không thể gửi mã xác minh lúc này. Vui lòng thử lại sau.' });
    }
    return res.status(201).json({ requires_verification: true, email, message: 'Mã xác minh đã được gửi đến email của bạn.' });
  } catch (error) {
    if (error instanceof z.ZodError) return res.status(400).json({ error: error.flatten() });
    console.error('Register error:', error);
    return res.status(500).json({ error: 'Không thể đăng ký tài khoản.' });
  }
};

export const verifyEmail = async (req: Request, res: Response) => {
  try {
    const { email, code } = verificationSchema.parse(req.body);
    const userResult = await query(
      'SELECT id, name, email, role, email_verified_at FROM users WHERE email = $1',
      [email],
    );
    if (!userResult.rows.length) return res.status(400).json({ error: 'Mã xác minh không hợp lệ hoặc đã hết hạn.' });
    const user = userResult.rows[0];
    if (user.email_verified_at) {
      const profile = publicUser(user);
      return res.json({ user: profile, token: createToken(profile) });
    }

    const codeResult = await query(
      `SELECT id, code_hash, expires_at, attempts
       FROM email_verification_codes
       WHERE user_id = $1 AND consumed_at IS NULL
       ORDER BY created_at DESC LIMIT 1`,
      [user.id],
    );
    if (!codeResult.rows.length || new Date(codeResult.rows[0].expires_at).getTime() <= Date.now()) {
      return res.status(400).json({ error: 'Mã xác minh không hợp lệ hoặc đã hết hạn.' });
    }
    const record = codeResult.rows[0];
    if (record.attempts >= 5) return res.status(429).json({ error: 'Bạn đã nhập sai quá nhiều lần. Vui lòng yêu cầu mã mới.' });
    const expected = Buffer.from(record.code_hash);
    const actual = Buffer.from(hashVerificationCode(user.id, code));
    if (expected.length !== actual.length || !crypto.timingSafeEqual(expected, actual)) {
      await query('UPDATE email_verification_codes SET attempts = attempts + 1 WHERE id = $1', [record.id]);
      return res.status(400).json({ error: 'Mã xác minh không đúng.' });
    }
    await query('UPDATE users SET email_verified_at = NOW(), updated_at = NOW() WHERE id = $1', [user.id]);
    await query('UPDATE email_verification_codes SET consumed_at = NOW() WHERE id = $1', [record.id]);
    const profile = publicUser(user);
    return res.json({ user: profile, token: createToken(profile) });
  } catch (error) {
    if (error instanceof z.ZodError) return res.status(400).json({ error: error.flatten() });
    console.error('Verify email error:', error);
    return res.status(500).json({ error: 'Không thể xác minh email.' });
  }
};

export const resendVerification = async (req: Request, res: Response) => {
  try {
    const { email } = z.object({ email: z.string().trim().email().transform((value) => value.toLowerCase()) }).parse(req.body);
    const result = await query('SELECT id, name, email, email_verified_at FROM users WHERE email = $1', [email]);
    if (result.rows.length && !result.rows[0].email_verified_at) {
      try { await issueVerificationCode(result.rows[0].id, email, result.rows[0].name); }
      catch (error) {
        if (error instanceof Error && error.message === 'VERIFICATION_RATE_LIMIT') return res.status(429).json({ error: 'Bạn vừa yêu cầu mã. Vui lòng thử lại sau 60 giây.' });
        throw error;
      }
    }
    return res.json({ message: 'Nếu email cần xác minh, mã mới đã được gửi.' });
  } catch (error) {
    if (error instanceof z.ZodError) return res.status(400).json({ error: error.flatten() });
    console.error('Resend verification error:', error);
    return res.status(500).json({ error: 'Không thể gửi lại mã xác minh.' });
  }
};

export const googleLogin = async (req: Request, res: Response) => {
  try {
    const { credential } = googleLoginSchema.parse(req.body);
    let googleProfile: { sub: string; email: string; name: string };

    try {
      googleProfile = await verifyGoogleCredential(credential);
    } catch (error) {
      if (error instanceof Error && error.message === 'GOOGLE_AUTH_NOT_CONFIGURED') {
        return res.status(503).json({ error: 'Đăng nhập bằng Google chưa được cấu hình.' });
      }
      if (error instanceof Error && error.message === 'GOOGLE_TOKEN_INVALID') {
        return res.status(401).json({ error: 'Thông tin đăng nhập Google không hợp lệ.' });
      }
      console.error('[GoogleAuth] Token verification failed:', error instanceof Error ? error.message : error);
      return res.status(401).json({ error: 'Không thể xác minh tài khoản Google.' });
    }

    const linkedUserResult = await query(
      `SELECT id, name, email, role, is_active, password_hash
       FROM users WHERE google_sub = $1`,
      [googleProfile.sub],
    );

    if (linkedUserResult.rows.length) {
      const linkedUser = linkedUserResult.rows[0];
      if (linkedUser.is_active === false) return res.status(403).json({ error: 'Tài khoản đã bị khóa.' });
      const provider = linkedUser.password_hash ? 'both' : 'google';
      const updated = await query(
        `UPDATE users
         SET auth_provider = $1, email_verified_at = COALESCE(email_verified_at, CURRENT_TIMESTAMP), updated_at = CURRENT_TIMESTAMP
         WHERE id = $2
         RETURNING id, name, email, role`,
        [provider, linkedUser.id],
      );
      const profile = publicUser(updated.rows[0]);
      return res.json({ user: profile, token: createToken(profile) });
    }

    const existingUserResult = await query(
      `SELECT id, name, email, role, is_active, password_hash, google_sub
       FROM users WHERE email = $1`,
      [googleProfile.email],
    );

    if (existingUserResult.rows.length) {
      const existingUser = existingUserResult.rows[0];
      if (existingUser.is_active === false) return res.status(403).json({ error: 'Tài khoản đã bị khóa.' });
      if (existingUser.google_sub && existingUser.google_sub !== googleProfile.sub) {
        return res.status(409).json({ error: 'Email này đã được liên kết với tài khoản Google khác.' });
      }

      const provider = existingUser.password_hash ? 'both' : 'google';
      const linked = await query(
        `UPDATE users
         SET google_sub = $1, auth_provider = $2, email_verified_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
         WHERE id = $3
         RETURNING id, name, email, role`,
        [googleProfile.sub, provider, existingUser.id],
      );
      const profile = publicUser(linked.rows[0]);
      return res.json({ user: profile, token: createToken(profile) });
    }

    const created = await query(
      `INSERT INTO users (name, email, password_hash, role, email_verified_at, google_sub, auth_provider)
       VALUES ($1, $2, NULL, 'user', CURRENT_TIMESTAMP, $3, 'google')
       RETURNING id, name, email, role`,
      [googleProfile.name, googleProfile.email, googleProfile.sub],
    );
    const profile = publicUser(created.rows[0]);
    return res.status(201).json({ user: profile, token: createToken(profile) });
  } catch (error) {
    if (error instanceof z.ZodError) return res.status(400).json({ error: error.flatten() });
    if (typeof error === 'object' && error !== null && 'code' in error && error.code === '23505') {
      return res.status(409).json({ error: 'Tài khoản Google vừa được liên kết, vui lòng thử lại.' });
    }
    console.error('Google login error:', error);
    return res.status(500).json({ error: 'Không thể đăng nhập bằng Google.' });
  }
};

export const login = async (req: Request, res: Response) => {
  try {
    const { email, password } = loginSchema.parse(req.body);
    const result = await query(
      'SELECT id, name, email, password_hash, role, is_active, email_verified_at FROM users WHERE email = $1',
      [email],
    );
    if (!result.rows.length) return res.status(401).json({ error: 'Email hoặc mật khẩu không đúng.' });
    const user = result.rows[0];
    if (user.is_active === false) return res.status(403).json({ error: 'Tài khoản đã bị khóa.' });
    if (!user.password_hash) return res.status(401).json({ error: 'Tài khoản này dùng đăng nhập Google. Vui lòng chọn nút Đăng nhập bằng Google.' });
    const validPassword = await bcrypt.compare(password, user.password_hash);
    if (!validPassword) return res.status(401).json({ error: 'Email hoặc mật khẩu không đúng.' });
    if (!user.email_verified_at) return res.status(403).json({ code: 'EMAIL_NOT_VERIFIED', email, error: 'Email chưa được xác minh. Vui lòng nhập mã đã gửi về email.' });
    const profile = publicUser(user);
    return res.json({ user: profile, token: createToken(profile) });
  } catch (error) {
    if (error instanceof z.ZodError) return res.status(400).json({ error: error.flatten() });
    console.error('Login error:', error);
    return res.status(500).json({ error: 'Không thể đăng nhập.' });
  }
};

export const authMiddleware = (req: AuthRequest, res: Response, next: () => void) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) return res.status(401).json({ error: 'No token provided' });
  try {
    req.user = jwt.verify(authHeader.substring(7), JWT_SECRET) as AuthUser;
    next();
  } catch { return res.status(401).json({ error: 'Invalid token' }); }
};

export const adminMiddleware = (req: AuthRequest, res: Response, next: () => void) => {
  if (req.user?.role !== 'admin') return res.status(403).json({ error: 'Admin access required' });
  next();
};

export const getProfile = async (req: AuthRequest, res: Response) => {
  try {
    const result = await query('SELECT id, name, email, role, created_at, email_verified_at FROM users WHERE id = $1', [req.user!.id]);
    if (!result.rows.length) return res.status(404).json({ error: 'User not found' });
    const prefs = await query('SELECT tag, weight FROM user_preferences WHERE user_id = $1', [req.user!.id]);
    return res.json({ ...result.rows[0], preferences: prefs.rows });
  } catch (error) {
    console.error('Get profile error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};
