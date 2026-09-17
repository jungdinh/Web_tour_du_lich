import 'dotenv/config';
import express from 'express';
import path from 'node:path';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import { authRouter } from './routes/auth.js';
import { tourRouter } from './routes/tours.js';
import { recommendationRouter } from './routes/recommendations.js';
import { actionRouter } from './routes/actions.js';
import { chatRouter } from './routes/chat.js';
import { favoriteRouter } from './routes/favorites.js';
import { adminRouter } from './routes/admin.js';
import { bookingRouter } from './routes/bookings.js';
import { paymentRouter } from './routes/payments.js';
import { ensureDefaultAdmin } from './services/adminSeed.js';
import { pingDatabase } from './db/index.js';
import { errorHandler } from './middlewares/error.js';
import { rateLimiter } from './middlewares/rateLimit.js';

const app = express();
const configuredPort = Number.parseInt(process.env.PORT || '4000', 10);
const PORT = Number.isFinite(configuredPort) && configuredPort > 0 ? configuredPort : 4000;
const allowedOrigins = (process.env.FRONTEND_URLS || process.env.FRONTEND_URL || 'http://localhost:5174')
  .split(',')
  .map((origin) => origin.trim().replace(/\/$/, ''))
  .filter(Boolean);
const isRailwayEnvironment = Boolean(
  process.env.RAILWAY_ENVIRONMENT_ID ||
  process.env.RAILWAY_SERVICE_ID ||
  process.env.RAILWAY_PUBLIC_DOMAIN
);

const getTrustProxySetting = () => {
  const configuredTrustProxy = process.env.TRUST_PROXY?.trim();

  if (!configuredTrustProxy) return isRailwayEnvironment ? 1 : undefined;

  const normalizedTrustProxy = configuredTrustProxy.toLowerCase();
  if (['false', '0', 'no', 'off'].includes(normalizedTrustProxy)) return false;
  if (['true', '1', 'yes', 'on'].includes(normalizedTrustProxy)) return 1;

  const numericTrustProxy = Number(configuredTrustProxy);
  if (Number.isInteger(numericTrustProxy) && numericTrustProxy > 0) return numericTrustProxy;

  return configuredTrustProxy;
};

const trustProxySetting = getTrustProxySetting();
if (trustProxySetting !== undefined) app.set('trust proxy', trustProxySetting);

app.use(helmet());
app.use(cors({
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes(origin.replace(/\/$/, ''))) return callback(null, true);
    return callback(new Error('Origin is not allowed by CORS.'));
  },
  credentials: true,
}));
app.use(compression());
app.use(express.json());
app.use('/uploads', express.static(path.resolve(process.cwd(), 'uploads')));

app.use(rateLimiter);

app.use('/api/auth', authRouter);
app.use('/api/tours', tourRouter);
app.use('/api/recommendations', recommendationRouter);
app.use('/api/actions', actionRouter);
app.use('/api/chat', chatRouter);
app.use('/api/favorites', favoriteRouter);
app.use('/api/admin', adminRouter);
app.use('/api/bookings', bookingRouter);
app.use('/api/payments', paymentRouter);

app.get('/health', async (_req, res) => {
  try {
    await pingDatabase();
    res.json({ status: 'healthy', service: 'web-service', database: 'connected' });
  } catch {
    res.status(503).json({ status: 'unhealthy', service: 'web-service', database: 'unavailable' });
  }
});

app.use(errorHandler);

const startServer = async () => {
  try {
    await ensureDefaultAdmin();
  } catch (error) {
    console.error('[Admin] Could not seed default admin account:', error);
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Web Service running on port ${PORT}`);
  });
};

void startServer();

export default app;

