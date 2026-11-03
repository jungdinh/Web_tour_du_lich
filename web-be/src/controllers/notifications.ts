import { Response } from 'express';
import { z } from 'zod';
import { query } from '../db/index.js';
import { AuthRequest } from './auth.js';

const listSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(30).default(10),
});

const notificationIdSchema = z.coerce.number().int().positive();
const activeNotificationFilter = `
  n.status = 'published'
  AND n.published_at <= CURRENT_TIMESTAMP
  AND (n.expires_at IS NULL OR n.expires_at > CURRENT_TIMESTAMP)
`;

export const getNotifications = async (req: AuthRequest, res: Response) => {
  try {
    const { page, limit } = listSchema.parse(req.query);
    const offset = (page - 1) * limit;
    const [itemsResult, totalResult] = await Promise.all([
      query(
        `SELECT n.id, n.type, n.priority, n.title, n.body, n.action_url, n.action_label,
                n.published_at, nr.read_at, (nr.read_at IS NOT NULL) AS is_read
         FROM notification_recipients nr
         INNER JOIN notifications n ON n.id = nr.notification_id
         WHERE nr.user_id = $1 AND nr.dismissed_at IS NULL AND ${activeNotificationFilter}
         ORDER BY n.published_at DESC, n.id DESC
         LIMIT $2 OFFSET $3`,
        [req.user!.id, limit, offset],
      ),
      query(
        `SELECT COUNT(*)::int AS total
         FROM notification_recipients nr
         INNER JOIN notifications n ON n.id = nr.notification_id
         WHERE nr.user_id = $1 AND nr.dismissed_at IS NULL AND ${activeNotificationFilter}`,
        [req.user!.id],
      ),
    ]);

    const total = Number(totalResult.rows[0]?.total || 0);
    return res.json({
      data: itemsResult.rows,
      pagination: { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) },
    });
  } catch (error) {
    if (error instanceof z.ZodError) return res.status(400).json({ error: error.flatten() });
    console.error('Get notifications error:', error);
    return res.status(500).json({ error: 'Unable to load notifications.' });
  }
};

export const getUnreadNotificationCount = async (req: AuthRequest, res: Response) => {
  try {
    const result = await query(
      `SELECT COUNT(*)::int AS unread_count
       FROM notification_recipients nr
       INNER JOIN notifications n ON n.id = nr.notification_id
       WHERE nr.user_id = $1 AND nr.read_at IS NULL AND nr.dismissed_at IS NULL
         AND ${activeNotificationFilter}`,
      [req.user!.id],
    );
    return res.json({ unread_count: Number(result.rows[0]?.unread_count || 0) });
  } catch (error) {
    console.error('Get unread notification count error:', error);
    return res.status(500).json({ error: 'Unable to load unread notification count.' });
  }
};

export const markNotificationAsRead = async (req: AuthRequest, res: Response) => {
  try {
    const notificationId = notificationIdSchema.parse(req.params.id);
    const result = await query(
      `UPDATE notification_recipients nr
       SET read_at = COALESCE(nr.read_at, CURRENT_TIMESTAMP)
       FROM notifications n
       WHERE nr.notification_id = n.id
         AND nr.notification_id = $1 AND nr.user_id = $2 AND ${activeNotificationFilter}
       RETURNING nr.notification_id AS id, nr.read_at`,
      [notificationId, req.user!.id],
    );
    if (!result.rows.length) return res.status(404).json({ error: 'Notification not found.' });
    return res.json(result.rows[0]);
  } catch (error) {
    if (error instanceof z.ZodError) return res.status(400).json({ error: error.flatten() });
    console.error('Mark notification as read error:', error);
    return res.status(500).json({ error: 'Unable to update notification.' });
  }
};

export const markAllNotificationsAsRead = async (req: AuthRequest, res: Response) => {
  try {
    const result = await query(
      `UPDATE notification_recipients nr
       SET read_at = CURRENT_TIMESTAMP
       FROM notifications n
       WHERE nr.notification_id = n.id
         AND nr.user_id = $1 AND nr.read_at IS NULL AND nr.dismissed_at IS NULL
         AND ${activeNotificationFilter}`,
      [req.user!.id],
    );
    return res.json({ updated_count: result.rowCount || 0 });
  } catch (error) {
    console.error('Mark all notifications as read error:', error);
    return res.status(500).json({ error: 'Unable to update notifications.' });
  }
};
