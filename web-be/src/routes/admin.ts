import express, { Router } from 'express';
import { authMiddleware, adminMiddleware } from '../controllers/auth.js';
import {
  createAdminTour,
  deleteAdminReview,
  deleteAdminTour,
  deleteAdminUser,
  getAdminReviews,
  getAdminUserDetail,
  getAdminTours,
  getAdminUsers,
  getDashboard,
  updateAdminTour,
  updateAdminUserStatus,
  uploadAdminTourImage,
  updateAdminUserRole,
} from '../controllers/admin.js';

const router = Router();
router.use(authMiddleware, adminMiddleware);

router.get('/dashboard', getDashboard);
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
router.get('/reviews', getAdminReviews);
router.delete('/reviews/:id', deleteAdminReview);

export { router as adminRouter };


