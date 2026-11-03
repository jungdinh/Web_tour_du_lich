import { Router } from 'express';
import { authMiddleware } from '../controllers/auth.js';
import {
  getNotifications,
  getUnreadNotificationCount,
  markAllNotificationsAsRead,
  markNotificationAsRead,
} from '../controllers/notifications.js';

export const notificationRouter = Router();

notificationRouter.use(authMiddleware);
notificationRouter.get('/', getNotifications);
notificationRouter.get('/unread-count', getUnreadNotificationCount);
notificationRouter.patch('/read-all', markAllNotificationsAsRead);
notificationRouter.patch('/:id/read', markNotificationAsRead);
