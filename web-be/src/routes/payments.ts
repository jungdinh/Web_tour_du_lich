import { Router } from 'express';
import { handleSepayWebhook } from '../controllers/bookings.js';

export const paymentRouter = Router();
paymentRouter.post('/sepay/webhook', handleSepayWebhook);