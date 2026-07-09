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
  name: string
  destination: string
  price: number
  avg_rating: number
  score: number
  tags: Record<string, number>
  reason?: string
}

export interface ChatMessage {
  id: number
  role: 'user' | 'assistant'
  content: string
  created_at: string
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
