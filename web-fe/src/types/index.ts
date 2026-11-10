export interface User {
  id: number
  name: string
  email: string
  role: string
}

export interface Tour {
  id: number
  name: string
  destination: string
  price: number
  duration: number
  avg_rating: number
  review_count: number
  image_url?: string
  description?: string
  source?: string
  source_url?: string
  season?: string
  tags?: Tag[]
  // BestPrice extended fields (optional, populated when source = 'bestprice')
  duration_label?: string
  original_price?: number
  highlights?: string[]
  places?: string[]
  topics?: string[]
  gallery?: string[]
  itinerary?: ItineraryDay[]
  included?: string[]
  excluded?: string[]
  schedule?: ScheduleRow[]
  transport?: {
    airline?: string
    vehicle?: string[]
  }
}

export interface ItineraryDay {
  day: string
  content: string[]
  meal: string
  images: string[]
}

export interface ScheduleRow {
  date: string
  price: number
  available: boolean
  status?: 'open' | 'paused' | 'closed' | 'cancelled'
  capacity?: number | null
  booked_count?: number
  remaining_count?: number | null
}

export interface BestPriceTourRaw {
  url: string
  category: string
  title: string
  price: string
  original_price: string
  rating: string
  review_count: number
  description: string
  duration: { days: number; nights: number; label: string }
  departure: string[]
  transport: { airline: string; vehicle: string[] }
  schedule: Array<{ date: string; price: string; available: boolean }>
  highlights: string[]
  places: string[]
  topics: string[]
  activities: string[]
  gallery: string[]
  itinerary: Array<{ day: string; content: string[]; meal: string; images: string[] }>
  included: string[]
  excluded: string[]
  reviews: Array<{
    score: string
    name: string
    date: string
    content: string
    images: string[]
  }>
}

export interface Tag {
  tag: string
  weight: number
}

export interface PreferenceCatalogItem {
  tag: string
  label: string
}

export interface SettingsData {
  account: {
    email: string
    email_verified: boolean
    google_linked: boolean
    has_password: boolean
    auth_provider: 'local' | 'google' | 'both'
  }
  preferences: Tag[]
  preference_catalog: PreferenceCatalogItem[]
}

export interface AdminReviewReply {
  id: number
  content: string
  admin_name: string
  created_at: string
  updated_at: string
}

export interface Review {
  id: number
  content: string
  rating: number
  reviewer_name?: string
  created_at: string
  updated_at?: string
  source?: 'user' | 'imported'
  admin_reply?: AdminReviewReply | null
}

export interface Recommendation {
  tour_id: number
  id?: number
  name: string
  destination: string
  price: number
  duration: number
  avg_rating: number
  review_count?: number
  places?: string[]
  image_url?: string
  gallery?: string[]
  score: number
  tags: Record<string, number>
  reason?: string
}

export interface RecommendationResponse {
  recommendations: Recommendation[]
  popular?: Tour[]
  is_cold_start?: boolean
  fallback?: boolean
  evidence_count?: number
  message?: string
}

export interface ChatMessage {
  id: number
  role: 'user' | 'assistant'
  content: string
  created_at: string
  destination_suggestions?: DestinationSuggestion[]
  recommendations?: Tour[]
  is_complete?: boolean
}

export interface DestinationSuggestion {
  destination: string
  tour_count: number
  avg_rating: number | null
  sample_tour_names: string[]
}

export interface PaginatedResponse<T> {
  data: T[]
  pagination: {
    page: number
    limit: number
    total: number
    totalPages: number
  }
}


export interface AdminDashboard {
  counts: {
    tours: number
    users: number
    reviews: number
    favorites: number
    actions: number
    messages: number
    bookings?: number
    revenue?: number
    paid_bookings?: number
    pending_bookings?: number
    expired_bookings?: number
    failed_payments?: number
    users_last_7d?: number
    ai_messages_24h?: number
    bookings_last_7d?: number
    revenue_last_7d?: number
  }
  top_destinations: Array<{ destination: string; count: number }>
  recent_users: Array<Pick<User, 'id' | 'name' | 'email' | 'role'> & { created_at: string }>
  recent_actions: Array<{
    action_type: string
    search_query?: string | null
    created_at: string
    user_name: string
    tour_name?: string | null
  }>
}

export interface AdminUser extends User {
  is_active: boolean
  favorite_count?: number
  action_count?: number
  review_count?: number
  created_at: string
  updated_at?: string
}

export type NotificationType = 'system' | 'promotion' | 'booking' | 'payment' | 'tour' | 'account'
export type NotificationPriority = 'normal' | 'important' | 'urgent'

export interface NotificationItem {
  id: number
  type: NotificationType
  priority: NotificationPriority
  title: string
  body: string
  action_url?: string | null
  action_label?: string | null
  published_at: string
  read_at?: string | null
  is_read: boolean
}

export interface CreateNotificationPayload {
  type: NotificationType
  priority: NotificationPriority
  title: string
  body: string
  action_url?: string | null
  action_label?: string | null
  audience: 'all' | 'selected'
  recipient_ids: number[]
}

export interface AdminUserDetail extends AdminUser {
  chat_session_count: number
  favorites: Array<{ id: number; name: string; destination: string; price: number; image_url?: string; favorited_at: string }>
  reviews: Array<{ id: number; tour_id: number; tour_name: string; rating: number; content: string; created_at: string }>
}

export interface AdminCustomerReview {
  id: number
  tour_id: number
  tour_name: string
  destination: string
  category?: string
  user_id: number
  user_name: string
  user_email: string
  rating: number
  content: string
  created_at: string
  updated_at?: string
  admin_reply: AdminReviewReply | null
}

export interface BookingPayment {
  id: number
  provider: string
  provider_transaction_id?: string | null
  reference_code?: string | null
  transfer_amount: number
  status: 'paid' | 'refunded' | string
  paid_at?: string | null
  created_at?: string | null
}

export interface Booking {
  id: number
  booking_code: string
  payment_code: string
  tour_id: number
  tour_name: string
  destination: string
  departure_date: string
  guest_count: number
  unit_price: number
  total_amount: number
  contact_name: string
  contact_email: string
  contact_phone: string
  note?: string | null
  status: 'pending_payment' | 'paid' | 'confirmed' | 'cancelled' | 'expired' | 'refunded'
  payment_status: 'pending' | 'paid' | 'failed' | 'refunded'
  expires_at: string
  paid_at?: string | null
  created_at: string
  updated_at: string
  payment: BookingPayment | null
  payment_mode: 'gateway' | 'qr' | 'unavailable'
  checkout?: {
    action: string
    method: 'POST'
    fields: Record<string, string>
  } | null
  qr_url: string | null
  bank: {
    code: string
    account_number: string
    account_name: string
  }
}

export interface AdminBooking extends Omit<Booking, 'payment_mode' | 'checkout' | 'qr_url' | 'bank'> {
  user_id: number | null
  user_name: string
  user_email: string
}

export interface AdminBookingDetail extends AdminBooking {
  payments: BookingPayment[]
}
