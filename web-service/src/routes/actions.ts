import { Router } from 'express';
import { authMiddleware } from '../controllers/auth.js';
import { logAction, getActionHistory } from '../controllers/actions.js';

const router = Router();

router.post('/', authMiddleware, logAction);
router.get('/history', authMiddleware, getActionHistory);

export { router as actionRouter };
