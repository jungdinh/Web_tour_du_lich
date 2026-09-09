import { Router } from 'express';
import { 
  createTourReview,
  deleteAdminReviewReply,
  deleteTourReview,
  getTours, 
  getTourById, 
  getMyTourReview,
  getTourReviews, 
  getPopularTours,
  getDestinations,
  searchTours,
  upsertAdminReviewReply,
  updateTourReview,
} from '../controllers/tours.js';
import { adminMiddleware, authMiddleware } from '../controllers/auth.js';

const router = Router();

router.get('/', getTours);
router.get('/popular', getPopularTours);
router.get('/destinations', getDestinations);
router.get('/search', searchTours);
router.get('/:id/reviews', getTourReviews);
router.get('/:id/reviews/me', authMiddleware, getMyTourReview);
router.post('/:id/reviews', authMiddleware, createTourReview);
router.put('/:id/reviews/:reviewId', authMiddleware, updateTourReview);
router.delete('/:id/reviews/:reviewId', authMiddleware, deleteTourReview);
router.put('/:id/reviews/:reviewId/reply', authMiddleware, adminMiddleware, upsertAdminReviewReply);
router.delete('/:id/reviews/:reviewId/reply', authMiddleware, adminMiddleware, deleteAdminReviewReply);
router.get('/:id', getTourById);

export { router as tourRouter };
