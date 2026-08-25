import { Router } from 'express';
import { authMiddleware } from '../controllers/auth.js';
import {
  addFavorite,
  removeFavorite,
  getFavorites,
  checkFavorite,
} from '../controllers/favorites.js';

export const favoriteRouter = Router();

favoriteRouter.use(authMiddleware);

favoriteRouter.get('/', getFavorites);
favoriteRouter.get('/check/:tour_id', checkFavorite);
favoriteRouter.post('/', addFavorite);
favoriteRouter.delete('/:tour_id', removeFavorite);
