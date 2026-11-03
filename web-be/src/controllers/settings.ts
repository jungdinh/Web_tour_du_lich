import { Response } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { getClient, query } from '../db/index.js';
import { AuthRequest, createToken, verifyGoogleCredential } from './auth.js';
import { assertStrongPassword, PasswordSecurityError } from '../services/passwordSecurity.js';

const preferenceCatalog = [
  { tag: 'family', label: 'Gia đình' },
  { tag: 'romantic', label: 'Cặp đôi' },
  { tag: 'adventure', label: 'Khám phá, mạo hiểm' },
  { tag: 'relax', label: 'Nghỉ dưỡng' },
  { tag: 'spiritual', label: 'Tâm linh' },
  { tag: 'beach', label: 'Biển, đảo' },
  { tag: 'mountain', label: 'Núi, cao nguyên' },
  { tag: 'nature', label: 'Thiên nhiên' },
  { tag: 'city', label: 'Thành phố' },
  { tag: 'culture', label: 'Văn hóa' },
  { tag: 'history', label: 'Lịch sử' },
  { tag: 'festival', label: 'Lễ hội' },
  { tag: 'photography', label: 'Chụp ảnh, check-in' },
  { tag: 'wildlife', label: 'Động vật hoang dã' },
  { tag: 'cruise', label: 'Du thuyền' },
  { tag: 'nightlife', label: 'Trải nghiệm về đêm' },
  { tag: 'water_sports', label: 'Thể thao dưới nước' },
  { tag: 'food', label: 'Ẩm thực' },
  { tag: 'shopping', label: 'Mua sắm' },
  { tag: 'budget', label: 'Tiết kiệm' },
  { tag: 'luxury', label: 'Cao cấp' },
] as const;

const allowedPreferenceTags = new Set<string>(preferenceCatalog.map(({ tag }) => tag));

const passwordSchema = z.object({
  current_password: z.string().max(200).optional(),
  new_password: z.string().min(1, 'Vui lòng nhập mật khẩu mới').max(200),
});

const preferencesSchema = z.object({
  preferences: z.array(z.object({
    tag: z.string().trim(),
    weight: z.number().min(0.1).max(1),
  })).max(preferenceCatalog.length),
});

const googleLinkSchema = z.object({
  credential: z.string().trim().min(1).max(10000),
});

const handleValidationError = (error: unknown, res: Response) => {
  if (error instanceof z.ZodError) {
    res.status(400).json({ error: 'Dữ liệu không hợp lệ.', details: error.flatten() });
    return true;
  }
  return false;
};

export const getSettings = async (req: AuthRequest, res: Response) => {
  try {
    const userResult = await query(
      `SELECT email, email_verified_at, google_sub, password_hash, auth_provider
       FROM users
       WHERE id = $1`,
      [req.user!.id],
    );
    if (!userResult.rows.length) return res.status(404).json({ error: 'Không tìm thấy tài khoản.' });

    const preferencesResult = await query(
      `SELECT tag, weight
       FROM user_preferences
       WHERE user_id = $1
       ORDER BY weight DESC, tag ASC`,
      [req.user!.id],
    );
    const user = userResult.rows[0];

    return res.json({
      account: {
        email: user.email,
        email_verified: Boolean(user.email_verified_at),
        google_linked: Boolean(user.google_sub),
        has_password: Boolean(user.password_hash),
        auth_provider: user.auth_provider,
      },
      preferences: preferencesResult.rows.map((preference) => ({
        tag: String(preference.tag),
        weight: Number(preference.weight),
      })),
      preference_catalog: preferenceCatalog,
    });
  } catch (error) {
    console.error('Get settings error:', error);
    return res.status(500).json({ error: 'Không thể tải cài đặt.' });
  }
};

export const updatePassword = async (req: AuthRequest, res: Response) => {
  try {
    const { current_password: currentPassword, new_password: newPassword } = passwordSchema.parse(req.body);
    const userResult = await query(
      'SELECT password_hash, google_sub FROM users WHERE id = $1',
      [req.user!.id],
    );
    if (!userResult.rows.length) return res.status(404).json({ error: 'Không tìm thấy tài khoản.' });

    const user = userResult.rows[0];
    if (user.password_hash) {
      if (!currentPassword) return res.status(400).json({ error: 'Vui lòng nhập mật khẩu hiện tại.' });
      const currentPasswordMatches = await bcrypt.compare(currentPassword, user.password_hash);
      if (!currentPasswordMatches) return res.status(400).json({ error: 'Mật khẩu hiện tại không đúng.' });
      const passwordUnchanged = await bcrypt.compare(newPassword, user.password_hash);
      if (passwordUnchanged) return res.status(400).json({ error: 'Mật khẩu mới phải khác mật khẩu hiện tại.' });
    }

    await assertStrongPassword(newPassword);
    const passwordHash = await bcrypt.hash(newPassword, 12);
    const authProvider = user.google_sub ? 'both' : 'local';
    await query(
      `UPDATE users
       SET password_hash = $1, auth_provider = $2, updated_at = CURRENT_TIMESTAMP
       WHERE id = $3`,
      [passwordHash, authProvider, req.user!.id],
    );

    return res.json({ message: user.password_hash ? 'Đổi mật khẩu thành công.' : 'Tạo mật khẩu thành công.' });
  } catch (error) {
    if (handleValidationError(error, res)) return;
    if (error instanceof PasswordSecurityError) {
      return res.status(error.status).json({ error: error.message, code: error.code });
    }
    console.error('Update password error:', error);
    return res.status(500).json({ error: 'Không thể cập nhật mật khẩu.' });
  }
};

export const updatePreferences = async (req: AuthRequest, res: Response) => {
  let client: Awaited<ReturnType<typeof getClient>> | null = null;
  let transactionStarted = false;
  try {
    const { preferences } = preferencesSchema.parse(req.body);
    const uniquePreferences = new Map<string, number>();
    for (const preference of preferences) {
      if (!allowedPreferenceTags.has(preference.tag)) {
        return res.status(400).json({ error: `Sở thích không được hỗ trợ: ${preference.tag}` });
      }
      if (uniquePreferences.has(preference.tag)) {
        return res.status(400).json({ error: `Sở thích bị trùng: ${preference.tag}` });
      }
      uniquePreferences.set(preference.tag, preference.weight);
    }

    client = await getClient();
    await client.query('BEGIN');
    transactionStarted = true;
    await client.query('DELETE FROM user_preferences WHERE user_id = $1', [req.user!.id]);
    for (const [tag, weight] of uniquePreferences) {
      await client.query(
        'INSERT INTO user_preferences (user_id, tag, weight) VALUES ($1, $2, $3)',
        [req.user!.id, tag, weight],
      );
    }
    await client.query('COMMIT');
    transactionStarted = false;

    return res.json({
      message: 'Đã cập nhật sở thích du lịch.',
      preferences: [...uniquePreferences].map(([tag, weight]) => ({ tag, weight })),
    });
  } catch (error) {
    if (transactionStarted && client) await client.query('ROLLBACK').catch(() => undefined);
    if (handleValidationError(error, res)) return;
    console.error('Update preferences error:', error);
    return res.status(500).json({ error: 'Không thể cập nhật sở thích.' });
  } finally {
    client?.release();
  }
};

export const deleteSearchHistory = async (req: AuthRequest, res: Response) => {
  try {
    const result = await query(
      `DELETE FROM user_actions
       WHERE user_id = $1 AND action_type = 'search'`,
      [req.user!.id],
    );
    return res.json({ message: 'Đã xóa lịch sử tìm kiếm.', deleted_count: result.rowCount || 0 });
  } catch (error) {
    console.error('Delete search history error:', error);
    return res.status(500).json({ error: 'Không thể xóa lịch sử tìm kiếm.' });
  }
};

export const deleteChatHistory = async (req: AuthRequest, res: Response) => {
  try {
    const result = await query('DELETE FROM chat_sessions WHERE user_id = $1', [req.user!.id]);
    return res.json({ message: 'Đã xóa lịch sử trò chuyện AI.', deleted_count: result.rowCount || 0 });
  } catch (error) {
    console.error('Delete chat history error:', error);
    return res.status(500).json({ error: 'Không thể xóa lịch sử trò chuyện.' });
  }
};

export const linkGoogle = async (req: AuthRequest, res: Response) => {
  let client: Awaited<ReturnType<typeof getClient>> | null = null;
  let transactionStarted = false;
  try {
    const { credential } = googleLinkSchema.parse(req.body);
    const googleProfile = await verifyGoogleCredential(credential);

    client = await getClient();
    await client.query('BEGIN');
    transactionStarted = true;

    const userResult = await client.query(
      `SELECT id, name, email, role, password_hash, google_sub
       FROM users
       WHERE id = $1
       FOR UPDATE`,
      [req.user!.id],
    );
    if (!userResult.rows.length) {
      await client.query('ROLLBACK');
      transactionStarted = false;
      return res.status(404).json({ error: 'Không tìm thấy tài khoản.' });
    }

    const currentUser = userResult.rows[0];
    if (currentUser.google_sub) {
      await client.query('ROLLBACK');
      transactionStarted = false;
      return res.status(409).json({ error: 'Tài khoản hiện tại đã liên kết Google.' });
    }

    const conflictResult = await client.query(
      `SELECT id, email, google_sub
       FROM users
       WHERE id <> $1 AND (email = $2 OR google_sub = $3)
       LIMIT 1`,
      [req.user!.id, googleProfile.email, googleProfile.sub],
    );
    if (conflictResult.rows.length) {
      const conflict = conflictResult.rows[0];
      await client.query('ROLLBACK');
      transactionStarted = false;
      if (conflict.google_sub === googleProfile.sub) {
        return res.status(409).json({ error: 'Tài khoản Google này đã được liên kết với người dùng khác.' });
      }
      return res.status(409).json({ error: 'Email Google này đang được sử dụng bởi tài khoản khác.' });
    }

    const authProvider = currentUser.password_hash ? 'both' : 'google';
    const updatedResult = await client.query(
      `UPDATE users
       SET email = $1,
           email_verified_at = CURRENT_TIMESTAMP,
           google_sub = $2,
           auth_provider = $3,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $4
       RETURNING id, name, email, role`,
      [googleProfile.email, googleProfile.sub, authProvider, req.user!.id],
    );
    await client.query('DELETE FROM email_verification_codes WHERE user_id = $1', [req.user!.id]);
    await client.query('COMMIT');
    transactionStarted = false;

    const updatedUser = {
      id: Number(updatedResult.rows[0].id),
      name: String(updatedResult.rows[0].name),
      email: String(updatedResult.rows[0].email),
      role: String(updatedResult.rows[0].role),
    };
    return res.json({
      message: 'Đã liên kết Google và cập nhật email đăng nhập.',
      previous_email: String(currentUser.email),
      user: updatedUser,
      token: createToken(updatedUser),
    });
  } catch (error) {
    if (transactionStarted && client) await client.query('ROLLBACK').catch(() => undefined);
    if (handleValidationError(error, res)) return;
    if (error instanceof Error && error.message === 'GOOGLE_AUTH_NOT_CONFIGURED') {
      return res.status(503).json({ error: 'Đăng nhập bằng Google chưa được cấu hình.' });
    }
    if (error instanceof Error && error.message === 'GOOGLE_TOKEN_INVALID') {
      return res.status(401).json({ error: 'Thông tin xác minh Google không hợp lệ.' });
    }
    if (typeof error === 'object' && error !== null && 'code' in error && error.code === '23505') {
      return res.status(409).json({ error: 'Email hoặc tài khoản Google này vừa được liên kết với người dùng khác.' });
    }
    console.error('Link Google error:', error);
    return res.status(500).json({ error: 'Không thể liên kết tài khoản Google.' });
  } finally {
    client?.release();
  }
};

export const unlinkGoogle = async (req: AuthRequest, res: Response) => {
  try {
    const userResult = await query(
      'SELECT password_hash, google_sub FROM users WHERE id = $1',
      [req.user!.id],
    );
    if (!userResult.rows.length) return res.status(404).json({ error: 'Không tìm thấy tài khoản.' });
    const user = userResult.rows[0];
    if (!user.google_sub) return res.json({ message: 'Tài khoản chưa liên kết Google.' });
    if (!user.password_hash) {
      return res.status(409).json({ error: 'Hãy tạo mật khẩu trước khi ngắt liên kết Google.' });
    }

    await query(
      `UPDATE users
       SET google_sub = NULL, auth_provider = 'local', updated_at = CURRENT_TIMESTAMP
       WHERE id = $1`,
      [req.user!.id],
    );
    return res.json({ message: 'Đã ngắt liên kết Google.' });
  } catch (error) {
    console.error('Unlink Google error:', error);
    return res.status(500).json({ error: 'Không thể ngắt liên kết Google.' });
  }
};
