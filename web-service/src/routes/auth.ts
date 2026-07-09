import { Router } from 'express';
import { register, login, getProfile, authMiddleware } from '../controllers/auth.js';

const router = Router();

router.post('/register', register);
router.post('/login', login);
router.get('/profile', authMiddleware, getProfile);

export { router as authRouter };
