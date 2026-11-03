import express, { Router } from 'express';
import { authMiddleware, adminMiddleware } from '../controllers/auth.js';
import {
  createAdminTour,
  deleteAdminTour,
  deleteAdminUser,
  getAdminUserDetail,
  getAdminTours,
  getAdminUsers,
  getDashboard,
  updateAdminTour,
  updateAdminUserStatus,
  updateAdminUserPassword,
  uploadAdminTourImage,
  updateAdminUserRole,
  bulkDeleteAdminTours,
} from '../controllers/admin.js';
import { getAdminBooking, getAdminBookings } from '../controllers/adminBookings.js';
import { createAdminNotification } from '../controllers/adminNotifications.js';
import { getAdminReviews } from '../controllers/adminReviews.js';

const router = Router();
router.use(authMiddleware, adminMiddleware);

router.get('/dashboard', getDashboard);
router.get('/bookings', getAdminBookings);
router.get('/bookings/:id', getAdminBooking);
router.get('/tours', getAdminTours);
router.post('/tours/image', express.raw({ type: ['image/jpeg', 'image/png', 'image/webp'], limit: '5mb' }), uploadAdminTourImage);
router.post('/tours', createAdminTour);
router.post('/tours/bulk-delete', bulkDeleteAdminTours);
router.put('/tours/:id', updateAdminTour);
router.delete('/tours/:id', deleteAdminTour);
router.get('/users', getAdminUsers);
router.get('/users/:id', getAdminUserDetail);
router.patch('/users/:id/role', updateAdminUserRole);
router.patch('/users/:id/status', updateAdminUserStatus);
router.patch('/users/:id/password', updateAdminUserPassword);
router.delete('/users/:id', deleteAdminUser);
router.post('/notifications', createAdminNotification);
router.get('/reviews', getAdminReviews);

export { router as adminRouter };


