import axios from 'axios'
import type { AdminBooking, AdminBookingDetail, AdminCustomerReview, AdminDashboard, AdminUser, Booking, Tour, PaginatedResponse, Review, User, DestinationSuggestion, SettingsData, Tag, NotificationItem, CreateNotificationPayload } from '@/types'

const env = (import.meta as unknown as { env: Record<string, string | undefined> }).env
const normalizeApiBaseURL = (value: string) => {
  const trimmed = value.trim().replace(/\/+$/, '')

  if (!trimmed || trimmed.startsWith('/')) return trimmed
  if (trimmed.startsWith('//')) return `https:${trimmed}`
  if (/^[a-z][a-z\d+.-]*:\/\//i.test(trimmed)) return trimmed
  if (/^(localhost|127(?:\.\d{1,3}){3})(:\d+)?(?:\/|$)/i.test(trimmed)) return `http://${trimmed}`

  return `https://${trimmed}`
}

const configuredApiURL = env.VITE_API_URL?.trim()
const configuredBaseURL = env.VITE_API_BASE_URL?.trim()
const apiBaseURL = normalizeApiBaseURL(
  configuredApiURL || `${configuredBaseURL || 'http://localhost:3000'}/api`,
)

const api = axios.create({
  baseURL: apiBaseURL,
})

const BRAND_NAME = 'Vivu'

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
  const token = sessionStorage.getItem('auth-storage')
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
      sessionStorage.removeItem('auth-storage')
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

export const settingsApi = {
  getSettings: async () => {
    const { data } = await api.get<SettingsData>('/settings')
    return data
  },
  updatePassword: async (currentPassword: string | undefined, newPassword: string) => {
    const { data } = await api.patch<{ message: string }>('/settings/password', {
      current_password: currentPassword,
      new_password: newPassword,
    })
    return data
  },
  linkGoogle: async (credential: string) => {
    const { data } = await api.post<{ user: User; token: string; message: string; previous_email: string }>('/settings/google', { credential })
    return data
  },
  updatePreferences: async (preferences: Tag[]) => {
    const { data } = await api.put<{ message: string; preferences: Tag[] }>('/settings/preferences', { preferences })
    return data
  },
  deleteSearchHistory: async () => {
    const { data } = await api.delete<{ message: string; deleted_count: number }>('/settings/history/search')
    return data
  },
  deleteChatHistory: async () => {
    const { data } = await api.delete<{ message: string; deleted_count: number }>('/settings/history/chat')
    return data
  },
  unlinkGoogle: async () => {
    const { data } = await api.delete<{ message: string }>('/settings/google')
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
  getSimilarTours: async (id: number, limit = 8) => {
    const { data } = await api.get<Tour[]>(`/tours/${id}/similar`, {
      params: { limit },
    })
    return sanitizeTours(data)
  },
  getTourReviews: async (id: number, page = 1, limit = 10) => {
    const { data } = await api.get<PaginatedResponse<Review>>(`/tours/${id}/reviews`, {
      params: { page, limit },
    })
    return data
  },
  getMyTourReview: async (id: number) => {
    const { data } = await api.get<{ review: Review | null }>(`/tours/${id}/reviews/me`)
    return data.review
  },
  createTourReview: async (id: number, payload: { rating: number; content: string }) => {
    const { data } = await api.post<Review>(`/tours/${id}/reviews`, payload)
    return data
  },
  updateTourReview: async (tourId: number, reviewId: number, payload: { rating: number; content: string }) => {
    const { data } = await api.put<Review>(`/tours/${tourId}/reviews/${reviewId}`, payload)
    return data
  },
  deleteTourReview: async (tourId: number, reviewId: number) => {
    await api.delete(`/tours/${tourId}/reviews/${reviewId}`)
  },
  saveAdminReviewReply: async (tourId: number, reviewId: number, content: string) => {
    const { data } = await api.put<Review>(`/tours/${tourId}/reviews/${reviewId}/reply`, { content })
    return data
  },
  deleteAdminReviewReply: async (tourId: number, reviewId: number) => {
    await api.delete(`/tours/${tourId}/reviews/${reviewId}/reply`)
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
  getHistory: async (params?: {
    page?: number
    limit?: number
    status?: 'all' | Booking['status']
    paymentStatus?: 'all' | Booking['payment_status']
  }) => {
    const { data } = await api.get<PaginatedResponse<Booking>>('/bookings/history', { params })
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

export const notificationApi = {
  getAll: async (page = 1, limit = 10) => {
    const { data } = await api.get<PaginatedResponse<NotificationItem>>('/notifications', { params: { page, limit } })
    return data
  },
  getUnreadCount: async () => {
    const { data } = await api.get<{ unread_count: number }>('/notifications/unread-count')
    return data.unread_count
  },
  markAsRead: async (id: number) => {
    const { data } = await api.patch<{ id: number; read_at: string }>(`/notifications/${id}/read`)
    return data
  },
  markAllAsRead: async () => {
    const { data } = await api.patch<{ updated_count: number }>('/notifications/read-all')
    return data
  },
}


export const adminApi = {
  getDashboard: async () => {
    const { data } = await api.get<AdminDashboard>('/admin/dashboard')
    return data
  },
  getBookings: async (params?: {
    page?: number
    limit?: number
    search?: string
    status?: 'all' | Booking['status']
    paymentStatus?: 'all' | Booking['payment_status']
  }) => {
    const { data } = await api.get<PaginatedResponse<AdminBooking>>('/admin/bookings', { params })
    return data
  },
  getBookingDetail: async (id: number) => {
    const { data } = await api.get<AdminBookingDetail>(`/admin/bookings/${id}`)
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
  bulkDeleteTours: async (ids: number[]) => {
    await api.post(`/admin/tours/bulk-delete`, { ids })
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
  getReviews: async (params?: { page?: number; limit?: number; search?: string; status?: 'all' | 'pending' | 'replied' }) => {
    const { data } = await api.get<PaginatedResponse<AdminCustomerReview>>('/admin/reviews', { params })
    return data
  },
  updateUserPassword: async (id: number, password: string) => {
    const { data } = await api.patch<{ message: string; user: AdminUser }>(`/admin/users/${id}/password`, { password })
    return data
  },
  deleteUser: async (id: number) => {
    await api.delete(`/admin/users/${id}`)
  },
  createNotification: async (payload: CreateNotificationPayload) => {
    const { data } = await api.post<{ notification: NotificationItem; recipient_count: number }>('/admin/notifications', payload)
    return data
  },
}

