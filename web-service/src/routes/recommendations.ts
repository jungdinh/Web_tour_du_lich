import { Router } from 'express';
import { authMiddleware } from '../controllers/auth.js';
import { getRecommendations } from '../controllers/recommendations.js';

const router = Router();

router.get('/', authMiddleware, getRecommendations);

export { router as recommendationRouter };
