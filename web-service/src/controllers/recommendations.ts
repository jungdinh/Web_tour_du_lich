import { Request, Response } from 'express';
import axios from 'axios';
import { authMiddleware, AuthRequest } from './auth.js';

const AI_SERVICE_URL = process.env.AI_SERVICE_URL || 'http://localhost:8000';
const AI_SERVICE_API_KEY = process.env.AI_SERVICE_API_KEY || 'internal-api-key-for-web-service';

export const getRecommendations = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const { top = '10', destination, minPrice, maxPrice, duration } = req.query;
    
    // Build filters
    const filters: Record<string, unknown> = {};
    if (destination) filters.destination = destination;
    if (minPrice) filters.min_price = Number(minPrice);
    if (maxPrice) filters.max_price = Number(maxPrice);
    if (duration) filters.duration = Number(duration);
    
    // Call AI Service
    const response = await axios.post(
      `${AI_SERVICE_URL}/ai/recommend`,
      {
        user_id: userId,
        filters: Object.keys(filters).length > 0 ? filters : null,
        top_k: Number(top),
      },
      {
        headers: {
          'X-API-Key': AI_SERVICE_API_KEY,
          'Content-Type': 'application/json',
        },
      }
    );
    
    // If cold start, also get popular tours
    if (response.data.is_cold_start) {
      const { query } = await import('./db/index.js');
      const popular = await query(
        `SELECT id, name, destination, price, avg_rating 
         FROM tours ORDER BY avg_rating DESC LIMIT 5`
      );
      
      return res.json({
        recommendations: response.data.recommendations,
        popular: popular.rows,
        is_cold_start: true,
      });
    }
    
    res.json(response.data);
  } catch (error) {
    console.error('Recommendation error:', error);
    
    // Fallback: Return popular tours
    if (axios.isAxiosError(error) && error.response?.status === 503) {
      const { query } = await import('./db/index.js');
      const popular = await query(
        `SELECT id, name, destination, price, avg_rating 
         FROM tours ORDER BY avg_rating DESC LIMIT 10`
      );
      
      return res.json({
        recommendations: popular.rows,
        fallback: true,
        message: 'AI service unavailable, showing popular tours',
      });
    }
    
    res.status(500).json({ error: 'Internal server error' });
  }
};
