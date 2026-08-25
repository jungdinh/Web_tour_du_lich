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

export interface Review {
  id: number
  content: string
  rating: number
  reviewer_name?: string
  created_at: string
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

export interface AdminUserDetail extends AdminUser {
  chat_session_count: number
  favorites: Array<{ id: number; name: string; destination: string; price: number; image_url?: string; favorited_at: string }>
  reviews: Array<{ id: number; tour_id: number; tour_name: string; rating: number; content: string; created_at: string }>
}

export interface AdminReview extends Review {
  tour_id: number
  tour_name: string
}
