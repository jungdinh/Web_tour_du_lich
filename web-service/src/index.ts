import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import dotenv from 'dotenv';
import { authRouter } from './routes/auth.js';
import { tourRouter } from './routes/tours.js';
import { recommendationRouter } from './routes/recommendations.js';
import { actionRouter } from './routes/actions.js';
import { chatRouter } from './routes/chat.js';
import { errorHandler } from './middlewares/error.js';
import { rateLimiter } from './middlewares/rateLimit.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 4000;

// Middlewares
app.use(helmet());
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:3000',
  credentials: true,
}));
app.use(compression());
app.use(express.json());

// Rate limiting
app.use(rateLimiter);

// Routes
app.use('/api/auth', authRouter);
app.use('/api/tours', tourRouter);
app.use('/api/recommendations', recommendationRouter);
app.use('/api/actions', actionRouter);
app.use('/api/chat', chatRouter);

// Health check
app.get('/health', (_req, res) => {
  res.json({ status: 'healthy', service: 'web-service' });
});

// Error handler
app.use(errorHandler);

app.listen(PORT, () => {
  console.log(`Web Service running on port ${PORT}`);
});

export default app;
