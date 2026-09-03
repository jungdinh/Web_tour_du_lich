import axios from 'axios'
import type { AdminDashboard, AdminReview, AdminUser, Booking, Tour, PaginatedResponse, Review, User, DestinationSuggestion } from '@/types'

const env = (import.meta as unknown as { env: Record<string, string | undefined> }).env
const apiBaseURL = (env.VITE_API_URL || `${env.VITE_API_BASE_URL || 'http://localhost:3000'}/api`).replace(/\/$/, '')

const api = axios.create({
  baseURL: apiBaseURL,
})

const BRAND_NAME = 'TourAI'

const cleanCrawledBrandText = (value?: string | null) => {
  if (!value) return value

  return value
    .replace(/\s*-\s*BestPrice\s*$/gi, '')
    .replace(/BestPrice\.vn/gi, BRAND_NAME)
    .replace(/BestPrice/gi, BRAND_NAME)
    .replace(/\s*Hotline:\s*[\d\s.]+/gi, '')
    .replace(/\s{2,}/g, ' ')
    .trim()
}

const sanitizeTour = (tour: Tour): Tour => ({
  ...tour,
  name: cleanCrawledBrandText(tour.name) || tour.name,
  description: cleanCrawledBrandText(tour.description) || tour.description,
  source: tour.source ? BRAND_NAME : tour.source,
})

const sanitizeTours = (tours: Tour[] = []) => tours.map(sanitizeTour)

const sanitizePaginatedTours = (data: PaginatedResponse<Tour>): PaginatedResponse<Tour> => ({
  ...data,
  data: sanitizeTours(data.data),
})

const sanitizeRecommendationPayload = <T extends Record<string, unknown>>(data: T): T => ({
  ...data,
  recommendations: Array.isArray(data.recommendations)
    ? sanitizeTours(data.recommendations as Tour[])
    : data.recommendations,
  popular: Array.isArray(data.popular)
    ? sanitizeTours(data.popular as Tour[])
    : data.popular,
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

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('auth-storage')
      if (!window.location.pathname.includes('/login')) {
        window.location.href = '/login'
      }
    }
    return Promise.reject(error)
  },
)

export const authApi = {
  login: async (email: string, password: string) => {
    const { data } = await api.post<{ user: User; token: string }>('/auth/login', {
      email,
      password,
    })
    return data
  },
  googleLogin: async (credential: string) => {
    const { data } = await api.post<{ user: User; token: string }>('/auth/google', { credential })
    return data
  },
  register: async (name: string, email: string, password: string) => {
    const { data } = await api.post<{ requires_verification: boolean; email: string; message: string }>('/auth/register', {
      name,
      email,
      password,
    })
    return data
  },
  verifyEmail: async (email: string, code: string) => {
    const { data } = await api.post<{ user: User; token: string }>('/auth/verify-email', { email, code })
    return data
  },
  resendVerification: async (email: string) => {
    const { data } = await api.post<{ message: string }>('/auth/resend-verification', { email })
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
    q?: string
    travelType?: 'domestic' | 'international'
  }) => {
    const { data } = await api.get<PaginatedResponse<Tour>>('/tours', { params })
    return sanitizePaginatedTours(data)
  },
  getPopularTours: async () => {
    const { data } = await api.get<Tour[]>('/tours/popular')
    return sanitizeTours(data)
  },
  getDestinations: async (travelType: 'domestic' | 'international' = 'domestic') => {
    const { data } = await api.get<Array<{ name: string; tour_count: number }>>('/tours/destinations', {
      params: { travelType },
    })
    return data
  },
  getTourById: async (id: number) => {
    const { data } = await api.get<Tour>(`/tours/${id}`)
    return sanitizeTour(data)
  },
  getTourReviews: async (id: number, page = 1) => {
    const { data } = await api.get<PaginatedResponse<Review>>(`/tours/${id}/reviews`, {
      params: { page },
    })
    return data
  },
  searchTours: async (q: string, params?: Record<string, unknown>) => {
    const { data } = await api.get<Tour[]>('/tours/search', { params: { q, ...params } })
    return sanitizeTours(data)
  },
}

export const recommendationApi = {
  getRecommendations: async (top = 10, filters?: Record<string, unknown>) => {
    const { data } = await api.get('/recommendations', { params: { top, ...filters } })
    return sanitizeRecommendationPayload(data)
  },
}

export const actionApi = {
  logAction: async (tourId: number | undefined, actionType: string, searchQuery?: string) => {
    await api.post('/actions', {
      tour_id: tourId ?? null,
      action_type: actionType,
      search_query: searchQuery,
    })
  },
  getHistory: async (page = 1, limit = 20) => {
    const { data } = await api.get('/actions/history', {
      params: { page, limit },
    })
    return data
  },
}

export const chatApi = {
  sendMessage: async (message: string, sessionId?: number) => {
    const { data } = await api.post<{
      message: string
      is_complete: boolean
      recommendations: Tour[] | null
      destination_suggestions?: DestinationSuggestion[]
      session_id: number
    }>('/chat', { message, session_id: sessionId })
    return {
      ...data,
      recommendations: data.recommendations ? sanitizeTours(data.recommendations) : null,
    }
  },
  getHistory: async (sessionId?: number) => {
    const { data } = await api.get('/chat/history', {
      params: sessionId ? { session_id: sessionId } : undefined,
    })
    return data
  },
}

export const bookingApi = {
  create: async (payload: {
    tour_id: number
    departure_date: string
    guest_count: number
    contact_name: string
    contact_email: string
    contact_phone: string
    note?: string
  }) => {
    const { data } = await api.post<Booking>('/bookings', payload)
    return data
  },
  getById: async (id: number) => {
    const { data } = await api.get<Booking>(`/bookings/${id}`)
    return data
  },
  getAll: async () => {
    const { data } = await api.get<Booking[]>('/bookings')
    return data
  },
  cancel: async (id: number) => {
    const { data } = await api.post<Booking>(`/bookings/${id}/cancel`)
    return data
  },
}
export const favoriteApi = {
  getFavorites: async (page = 1, limit = 20) => {
    const { data } = await api.get<PaginatedResponse<Tour>>('/favorites', {
      params: { page, limit },
    })
    return sanitizePaginatedTours(data)
  },
  addFavorite: async (tourId: number) => {
    const { data } = await api.post('/favorites', { tour_id: tourId })
    return data
  },
  removeFavorite: async (tourId: number) => {
    const { data } = await api.delete(`/favorites/${tourId}`)
    return data
  },
  checkFavorite: async (tourId: number) => {
    const { data } = await api.get<{ isFavorite: boolean }>(`/favorites/check/${tourId}`)
    return data
  },
}

export const recommendationsPageApi = {
  getAll: async (top = 20, filters?: Record<string, unknown>) => {
    const { data } = await api.get('/recommendations', {
      params: { top, ...filters },
    })
    return sanitizeRecommendationPayload(data)
  },
}


export const adminApi = {
  getDashboard: async () => {
    const { data } = await api.get<AdminDashboard>('/admin/dashboard')
    return data
  },
  getTours: async (params?: {
    page?: number
    limit?: number
    search?: string
    destination?: string
    travelType?: 'all' | 'domestic' | 'international'
    minPrice?: number
    maxPrice?: number
    duration?: number
  }) => {
    const { data } = await api.get<PaginatedResponse<Tour>>('/admin/tours', { params })
    return data
  },
  uploadTourImage: async (file: File) => {
    const { data } = await api.post<{ url: string }>('/admin/tours/image', file, {
      headers: { 'Content-Type': file.type },
    })
    return data.url
  },
  createTour: async (payload: Partial<Tour>) => {
    const { data } = await api.post<Tour>('/admin/tours', payload)
    return data
  },
  updateTour: async (id: number, payload: Partial<Tour>) => {
    const { data } = await api.put<Tour>(`/admin/tours/${id}`, payload)
    return data
  },
  deleteTour: async (id: number) => {
    await api.delete(`/admin/tours/${id}`)
  },
  getUsers: async (params?: { page?: number; limit?: number; search?: string; role?: 'all' | 'user' | 'admin'; isActive?: 'all' | 'active' | 'inactive' }) => {
    const { data } = await api.get<PaginatedResponse<AdminUser>>('/admin/users', { params })
    return data
  },
  getUserDetail: async (id: number) => {
    const { data } = await api.get<import('@/types').AdminUserDetail>(`/admin/users/${id}`)
    return data
  },
  updateUserRole: async (id: number, role: 'user' | 'admin') => {
    const { data } = await api.patch<AdminUser>(`/admin/users/${id}/role`, { role })
    return data
  },
  updateUserStatus: async (id: number, is_active: boolean) => {
    const { data } = await api.patch<AdminUser>(`/admin/users/${id}/status`, { is_active })
    return data
  },
  deleteUser: async (id: number) => {
    await api.delete(`/admin/users/${id}`)
  },
  getReviews: async (params?: { page?: number; limit?: number; search?: string }) => {
    const { data } = await api.get<PaginatedResponse<AdminReview>>('/admin/reviews', { params })
    return data
  },
  deleteReview: async (id: number) => {
    await api.delete(`/admin/reviews/${id}`)
  },
}

