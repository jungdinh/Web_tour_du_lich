import { Request, Response } from 'express';
import axios from 'axios';
import { query } from '../db/index.js';
import { authMiddleware, AuthRequest } from '../controllers/auth.js';

const AI_SERVICE_URL = process.env.AI_SERVICE_URL || 'http://localhost:8000';
const AI_SERVICE_API_KEY = process.env.AI_SERVICE_API_KEY || 'internal-api-key-for-web-service';
const AI_TIMEOUT_MS = Math.max(5000, Number(process.env.AI_CHAT_TIMEOUT_MS || 20000));
const AI_RETRY_DELAY_MS = Math.max(100, Number(process.env.AI_CHAT_RETRY_DELAY_MS || 500));

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

const wait = (milliseconds: number) => new Promise((resolve) => setTimeout(resolve, milliseconds));

const isRetryableAiError = (error: unknown) => {
  if (!axios.isAxiosError(error)) return false;
  if (error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT' || !error.response) return true;
  return [502, 503, 504].includes(error.response.status);
};

const requestAiChat = async (payload: Record<string, unknown>) => {
  let lastError: unknown;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      return await axios.post(`${AI_SERVICE_URL}/ai/chat`, payload, {
        headers: {
          'X-API-Key': AI_SERVICE_API_KEY,
          'Content-Type': 'application/json',
        },
        timeout: AI_TIMEOUT_MS,
      });
    } catch (error) {
      lastError = error;
      if (attempt === 1 || !isRetryableAiError(error)) throw error;
      await wait(AI_RETRY_DELAY_MS);
    }
  }
  throw lastError;
};

export const chat = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const { message, session_id } = req.body;
    
    if (typeof message !== 'string' || !message.trim()) {
      return res.status(400).json({ error: 'Vui l\u00f2ng nh\u1eadp n\u1ed9i dung c\u1ea7n t\u01b0 v\u1ea5n.' });
    }
    if (message.length > 2000) {
      return res.status(400).json({ error: 'N\u1ed9i dung t\u01b0 v\u1ea5n kh\u00f4ng \u0111\u01b0\u1ee3c v\u01b0\u1ee3t qu\u00e1 2.000 k\u00fd t\u1ef1.' });
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
    
    const response = await requestAiChat({
        user_id: userId,
        message: message.trim(),
        session_id: currentSession.session_id,
        current_slots: currentSession.slots,
        last_recommendations: currentSession.lastRecommendations,
        recent_messages: currentSession.recentMessages,
      });
    
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
      if (error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT') {
        return res.status(504).json({
          code: 'AI_TIMEOUT',
          error: 'Vivu AI ph\u1ea3n h\u1ed3i qu\u00e1 l\u00e2u.',
          fallback: 'B\u1ea1n c\u00f3 th\u1ec3 th\u1eed l\u1ea1i ngay ho\u1eb7c vi\u1ebft y\u00eau c\u1ea7u ng\u1eafn g\u1ecdn h\u01a1n.',
          retryable: true,
        });
      }
      if (!error.response || [502, 503, 504].includes(error.response.status)) {
        return res.status(503).json({
          code: 'AI_UNAVAILABLE',
          error: 'Vivu AI \u0111ang t\u1ea1m th\u1eddi gi\u00e1n \u0111o\u1ea1n.',
          fallback: 'Vui l\u00f2ng th\u1eed l\u1ea1i sau gi\u00e2y l\u00e1t.',
          retryable: true,
        });
      }
    }
    
    res.status(500).json({ code: 'AI_ERROR', error: 'Kh\u00f4ng th\u1ec3 x\u1eed l\u00fd y\u00eau c\u1ea7u t\u01b0 v\u1ea5n l\u00fac n\u00e0y.', retryable: false });
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
