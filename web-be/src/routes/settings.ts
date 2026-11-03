import { Router } from 'express';
import { authMiddleware } from '../controllers/auth.js';
import {
  deleteChatHistory,
  deleteSearchHistory,
  getSettings,
  linkGoogle,
  unlinkGoogle,
  updatePassword,
  updatePreferences,
} from '../controllers/settings.js';

const router = Router();

router.use(authMiddleware);
router.get('/', getSettings);
router.patch('/password', updatePassword);
router.put('/preferences', updatePreferences);
router.delete('/history/search', deleteSearchHistory);
router.delete('/history/chat', deleteChatHistory);
router.post('/google', linkGoogle);
router.delete('/google', unlinkGoogle);

export { router as settingsRouter };
