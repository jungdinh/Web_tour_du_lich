import { Router } from 'express';
import { authMiddleware } from '../controllers/auth.js';
import { chat, getChatHistory } from '../controllers/chat.js';

const router = Router();

router.post('/', authMiddleware, chat);
router.get('/history', authMiddleware, getChatHistory);

export { router as chatRouter };
