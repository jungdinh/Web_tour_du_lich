import { Router } from 'express';
import { handleSepayGatewayIpn, handleSepayWebhook } from '../controllers/bookings.js';

export const paymentRouter = Router();
paymentRouter.post('/sepay/webhook', handleSepayWebhook);
paymentRouter.post('/sepay/ipn', handleSepayGatewayIpn);
