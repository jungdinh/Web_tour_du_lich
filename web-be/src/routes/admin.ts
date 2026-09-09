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
  uploadAdminTourImage,
  updateAdminUserRole,
} from '../controllers/admin.js';
import { getAdminBooking, getAdminBookings } from '../controllers/adminBookings.js';

const router = Router();
router.use(authMiddleware, adminMiddleware);

router.get('/dashboard', getDashboard);
router.get('/bookings', getAdminBookings);
router.get('/bookings/:id', getAdminBooking);
router.get('/tours', getAdminTours);
router.post('/tours/image', express.raw({ type: ['image/jpeg', 'image/png', 'image/webp'], limit: '5mb' }), uploadAdminTourImage);
router.post('/tours', createAdminTour);
router.put('/tours/:id', updateAdminTour);
router.delete('/tours/:id', deleteAdminTour);
router.get('/users', getAdminUsers);
router.get('/users/:id', getAdminUserDetail);
router.patch('/users/:id/role', updateAdminUserRole);
router.patch('/users/:id/status', updateAdminUserStatus);
router.delete('/users/:id', deleteAdminUser);

export { router as adminRouter };


