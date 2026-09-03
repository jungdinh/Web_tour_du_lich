import { Router } from 'express';
import { register, login, googleLogin, verifyEmail, resendVerification, getProfile, authMiddleware } from '../controllers/auth.js';

const router = Router();

router.post('/register', register);
router.post('/login', login);
router.post('/google', googleLogin);
router.post('/verify-email', verifyEmail);
router.post('/resend-verification', resendVerification);
router.get('/profile', authMiddleware, getProfile);

export { router as authRouter };
