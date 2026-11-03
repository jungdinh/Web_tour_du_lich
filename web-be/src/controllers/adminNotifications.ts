import { Response } from 'express';
import { z } from 'zod';
import { getClient } from '../db/index.js';
import { AuthRequest } from './auth.js';

const notificationSchema = z.object({
  type: z.enum(['system', 'promotion', 'booking', 'payment', 'tour', 'account']),
  priority: z.enum(['normal', 'important', 'urgent']).default('normal'),
  title: z.string().trim().min(1).max(160),
  body: z.string().trim().min(1).max(5000),
  action_url: z.string().trim().max(500).optional().nullable().transform((value) => value || null)
    .refine((value) => value === null || (/^\/(?!\/)/).test(value), 'Action URL must be an internal path.'),
  action_label: z.string().trim().max(60).optional().nullable().transform((value) => value || null),
  audience: z.enum(['all', 'selected']),
  recipient_ids: z.array(z.coerce.number().int().positive()).max(500).default([]),
}).superRefine((value, context) => {
  if (value.audience === 'selected' && value.recipient_ids.length === 0) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['recipient_ids'], message: 'Select at least one active user.' });
  }
});

export const createAdminNotification = async (req: AuthRequest, res: Response) => {
  const client = await getClient();
  let transactionStarted = false;

  try {
    const input = notificationSchema.parse(req.body);
    const recipientIds = [...new Set(input.recipient_ids)];
    await client.query('BEGIN');
    transactionStarted = true;

    if (input.audience === 'selected') {
      const eligibleUsers = await client.query(
        `SELECT id FROM users
         WHERE id = ANY($1::int[]) AND role = 'user' AND is_active = TRUE`,
        [recipientIds],
      );
      if (eligibleUsers.rows.length !== recipientIds.length) {
        await client.query('ROLLBACK');
        transactionStarted = false;
        return res.status(422).json({ error: 'One or more selected users are unavailable.' });
      }
    }

    const notificationResult = await client.query(
      `INSERT INTO notifications (
         type, priority, title, body, action_url, action_label, audience, created_by
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING id, type, priority, title, body, action_url, action_label, audience, published_at`,
      [input.type, input.priority, input.title, input.body, input.action_url, input.action_label, input.audience, req.user!.id],
    );
    const notification = notificationResult.rows[0];
    const recipientsResult = input.audience === 'all'
      ? await client.query(
        `INSERT INTO notification_recipients (notification_id, user_id)
         SELECT $1, id FROM users WHERE role = 'user' AND is_active = TRUE`,
        [notification.id],
      )
      : await client.query(
        `INSERT INTO notification_recipients (notification_id, user_id)
         SELECT $1, unnest($2::int[])`,
        [notification.id, recipientIds],
      );

    const recipientCount = recipientsResult.rowCount || 0;
    if (recipientCount === 0) {
      await client.query('ROLLBACK');
      transactionStarted = false;
      return res.status(422).json({ error: 'There are no active users to receive this notification.' });
    }

    await client.query('COMMIT');
    transactionStarted = false;
    return res.status(201).json({ notification, recipient_count: recipientCount });
  } catch (error) {
    if (transactionStarted) await client.query('ROLLBACK').catch(() => undefined);
    if (error instanceof z.ZodError) return res.status(400).json({ error: error.flatten() });
    console.error('Create admin notification error:', error);
    return res.status(500).json({ error: 'Unable to send notification.' });
  } finally {
    client.release();
  }
};
