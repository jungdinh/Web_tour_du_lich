import rawHaLong from './tour-vinh-ha-long.json'
import type { BestPriceTourRaw, Tour, Review } from '@/types'

/**
 * Parse a Vietnamese-formatted price string ("935.000đ") into a number (935000).
 * BestPrice uses '.' as thousand separator and strips it before storing as int.
 */
export function parseVNDPrice(value: string | undefined | null): number {
  if (!value) return 0
  const digits = value.replace(/[^\d]/g, '')
  return digits ? parseInt(digits, 10) : 0
}

/** "8.8" -> 8.8. Returns 0 when the rating string is empty. */
export function parseRating(value: string | undefined | null): number {
  if (!value) return 0
  const n = parseFloat(value)
  return Number.isFinite(n) ? n : 0
}

/**
 * Extract the numeric tour id from a BestPrice filename or URL.
 * `tour-vinh-ha-long-1-ngay-198.json` -> 198
 * `https://www.bestprice.vn/tour/...-198.html` -> 198
 */
export function extractTourId(source: { url?: string }): number {
  const url = source.url ?? ''
  const match = url.match(/-(\d+)\.(html|json)$/)
  return match ? parseInt(match[1], 10) : 0
}

/** BestPrice review date "17/01/2024" -> ISO "2024-01-17" for type compat. */
export function toIsoDate(ddmmyyyy: string): string {
  if (!ddmmyyyy) return ''
  const parts = ddmmyyyy.split('/')
  if (parts.length !== 3) return ddmmyyyy
  const [d, m, y] = parts
  return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`
}

/** Raw BestPrice JSON -> normalized Tour used across the UI. */
export function normalizeBestPriceTour(raw: BestPriceTourRaw): Tour {
  const id = extractTourId(raw)
  return {
    id,
    name: raw.title || '(Chưa có tiêu đề)',
    destination: raw.category,
    price: parseVNDPrice(raw.price),
    original_price: parseVNDPrice(raw.original_price) || undefined,
    duration: raw.duration?.days ?? 0,
    duration_label: raw.duration?.label,
    avg_rating: parseRating(raw.rating),
    review_count: raw.review_count ?? 0,
    image_url: raw.gallery?.[0],
    description: raw.description,
    source: 'bestprice',
    source_url: raw.url,
    highlights: raw.highlights ?? [],
    places: raw.places ?? [],
    topics: raw.topics ?? [],
    gallery: raw.gallery ?? [],
    itinerary: raw.itinerary ?? [],
    included: raw.included ?? [],
    excluded: raw.excluded ?? [],
    schedule: (raw.schedule ?? []).map((row) => ({
      date: row.date,
      price: parseVNDPrice(row.price),
      available: !!row.available,
    })),
    transport: {
      airline: raw.transport?.airline || undefined,
      vehicle: raw.transport?.vehicle ?? [],
    },
  }
}

/** Raw BestPrice reviews -> UI Review[] (uses synthetic id). */
export function normalizeBestPriceReviews(
  raw: BestPriceTourRaw,
  tourId: number,
): Review[] {
  return (raw.reviews ?? [])
    .filter((r) => r.content && r.content.trim().length > 0)
    .map((r, idx) => ({
      id: tourId * 1000 + idx,
      content: r.content,
      rating: parseRating(r.score),
      reviewer_name: r.name || 'Người dùng ẩn danh',
      created_at: toIsoDate(r.date),
    }))
}

/** Pre-parsed Ha Long sample used by the mockup route. */
export const sampleHaLongTour: Tour = normalizeBestPriceTour(
  rawHaLong as BestPriceTourRaw,
)

export const sampleHaLongReviews: Review[] = normalizeBestPriceReviews(
  rawHaLong as BestPriceTourRaw,
  sampleHaLongTour.id,
)