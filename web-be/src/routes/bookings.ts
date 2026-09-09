import { Router } from 'express';
import { authMiddleware } from '../controllers/auth.js';
import { cancelBooking, createBooking, getBooking, getBookingHistory, getBookings } from '../controllers/bookings.js';

export const bookingRouter = Router();
bookingRouter.use(authMiddleware);
bookingRouter.post('/', createBooking);
bookingRouter.get('/', getBookings);
bookingRouter.get('/history', getBookingHistory);
bookingRouter.get('/:id', getBooking);
bookingRouter.post('/:id/cancel', cancelBooking);
