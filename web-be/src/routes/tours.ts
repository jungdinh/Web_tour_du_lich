import { Router } from 'express';
import { 
  getTours, 
  getTourById, 
  getTourReviews, 
  getPopularTours,
  getDestinations,
  searchTours 
} from '../controllers/tours.js';

const router = Router();

router.get('/', getTours);
router.get('/popular', getPopularTours);
router.get('/destinations', getDestinations);
router.get('/search', searchTours);
router.get('/:id', getTourById);
router.get('/:id/reviews', getTourReviews);

export { router as tourRouter };
