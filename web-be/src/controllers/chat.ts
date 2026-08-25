import { Request, Response } from 'express';
import axios from 'axios';
import { query } from '../db/index.js';
import { authMiddleware, AuthRequest } from '../controllers/auth.js';

const AI_SERVICE_URL = process.env.AI_SERVICE_URL || 'http://localhost:8000';
const AI_SERVICE_API_KEY = process.env.AI_SERVICE_API_KEY || 'internal-api-key-for-web-service';

type RecommendedTour = {
  id?: number;
  tour_id?: number;
  name?: string;
  destination?: string;
  price?: number;
  duration?: number;
  avg_rating?: number;
  score?: number;
  tags?: Record<string, number> | Array<{ tag: string; weight?: number }>;
};

type ChatSessionState = {
  session_id: number;
  slots: Record<string, unknown>;
  lastRecommendations: RecommendedTour[];
  recentMessages: Array<{ role: 'user' | 'assistant'; content: string }>;
};

const chatSessions = new Map<number, ChatSessionState>();

export const chat = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const { message, session_id } = req.body;
    
    if (!message) {
      return res.status(400).json({ error: 'Message is required' });
    }
    
    let currentSession = chatSessions.get(userId);
    if (!currentSession || (session_id && currentSession.session_id !== session_id)) {
      const result = await query(
        `INSERT INTO chat_sessions (user_id) VALUES ($1) RETURNING id`,
        [userId]
      );
      currentSession = {
        session_id: result.rows[0].id,
        slots: {},
        lastRecommendations: [],
        recentMessages: [],
      };
      chatSessions.set(userId, currentSession);
    }
    
    await query(
      `INSERT INTO chat_messages (session_id, role, content) VALUES ($1, 'user', $2)`,
      [currentSession.session_id, message]
    );
    currentSession.recentMessages.push({ role: 'user', content: message });
    currentSession.recentMessages = currentSession.recentMessages.slice(-8);
    
    const response = await axios.post(
      `${AI_SERVICE_URL}/ai/chat`,
      {
        user_id: userId,
        message,
        session_id: currentSession.session_id,
        current_slots: currentSession.slots,
        last_recommendations: currentSession.lastRecommendations,
        recent_messages: currentSession.recentMessages,
      },
      {
        headers: {
          'X-API-Key': AI_SERVICE_API_KEY,
          'Content-Type': 'application/json',
        },
        timeout: 30000,
      }
    );
    
    const aiResponse = response.data;
    
    await query(
      `INSERT INTO chat_messages (session_id, role, content) VALUES ($1, 'assistant', $2)`,
      [currentSession.session_id, aiResponse.message]
    );
    currentSession.recentMessages.push({ role: 'assistant', content: aiResponse.message });
    currentSession.recentMessages = currentSession.recentMessages.slice(-8);
    
    if (aiResponse.slot_data) {
      currentSession.slots = {
        ...currentSession.slots,
        ...aiResponse.slot_data,
      };
    }

    if (Array.isArray(aiResponse.recommendations) && aiResponse.recommendations.length > 0) {
      currentSession.lastRecommendations = aiResponse.recommendations;
    }
    
    res.json({
      message: aiResponse.message,
      is_complete: aiResponse.is_complete,
      recommendations: aiResponse.recommendations,
      destination_suggestions: aiResponse.destination_suggestions,
      session_id: currentSession.session_id,
    });
  } catch (error) {
    console.error('Chat error:', error);
    
    if (axios.isAxiosError(error)) {
      if (error.response?.status === 503) {
        return res.status(503).json({
          error: 'AI service temporarily unavailable',
          fallback: 'Please try again later or browse our popular tours.',
        });
      }
    }
    
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const getChatHistory = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const { session_id } = req.query;
    
    let query_text = `
      SELECT cm.* 
      FROM chat_messages cm
      JOIN chat_sessions cs ON cm.session_id = cs.id
      WHERE cs.user_id = $1
    `;
    const params: unknown[] = [userId];
    
    if (session_id) {
      query_text += ' AND cs.id = $2';
      params.push(Number(session_id));
    }
    
    query_text += ' ORDER BY cm.created_at ASC';
    
    const result = await query(query_text, params);
    res.json(result.rows);
  } catch (error) {
    console.error('Get chat history error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};
