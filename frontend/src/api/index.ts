import axios from 'axios'
import type { Tour, PaginatedResponse, Review, User } from '@/types'

const api = axios.create({
  baseURL: '/api',
})

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('auth-storage')
  if (token) {
    const { state } = JSON.parse(token)
    if (state?.token) {
      config.headers.Authorization = `Bearer ${state.token}`
    }
  }
  return config
})

export const authApi = {
  login: async (email: string, password: string) => {
    const { data } = await api.post<{ user: User; token: string }>('/auth/login', {
      email,
      password,
    })
    return data
  },
  register: async (name: string, email: string, password: string) => {
    const { data } = await api.post<{ user: User; token: string }>('/auth/register', {
      name,
      email,
      password,
    })
    return data
  },
  getProfile: async () => {
    const { data } = await api.get<User>('/auth/profile')
    return data
  },
}

export const tourApi = {
  getTours: async (params?: {
    page?: number
    limit?: number
    destination?: string
    minPrice?: number
    maxPrice?: number
    duration?: number
    tag?: string
  }) => {
    const { data } = await api.get<PaginatedResponse<Tour>>('/tours', { params })
    return data
  },
  getPopularTours: async () => {
    const { data } = await api.get<Tour[]>('/tours/popular')
    return data
  },
  getTourById: async (id: number) => {
    const { data } = await api.get<Tour>(`/tours/${id}`)
    return data
  },
  getTourReviews: async (id: number, page = 1) => {
    const { data } = await api.get<PaginatedResponse<Review>>(`/tours/${id}/reviews`, {
      params: { page },
    })
    return data
  },
  searchTours: async (q: string, params?: Record<string, unknown>) => {
    const { data } = await api.get<Tour[]>('/tours/search', { params: { q, ...params } })
    return data
  },
}

export const recommendationApi = {
  getRecommendations: async (top = 10, filters?: Record<string, unknown>) => {
    const { data } = await api.get('/recommendations', { params: { top, ...filters } })
    return data
  },
}

export const actionApi = {
  logAction: async (tourId: number, actionType: string, searchQuery?: string) => {
    await api.post('/actions', {
      tour_id: tourId,
      action_type: actionType,
      search_query: searchQuery,
    })
  },
}

export const chatApi = {
  sendMessage: async (message: string, sessionId?: number) => {
    const { data } = await api.post('/chat', { message, session_id: sessionId })
    return data
  },
  getHistory: async (sessionId?: number) => {
    const { data } = await api.get('/chat/history', {
      params: sessionId ? { session_id: sessionId } : undefined,
    })
    return data
  },
}
