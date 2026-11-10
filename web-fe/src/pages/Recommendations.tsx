import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { tourApi, recommendationsPageApi } from '@/api'
import { useAuthStore } from '@/stores/auth'
import { TourCard, TourCardSkeleton } from '@/components/TourCard'
import { useTourImagesReady } from '@/hooks/useTourImagesReady'
import type { Tour, Recommendation } from '@/types'
import styles from './Recommendations.module.css'

const getMatchPresentation = (score: number, evidenceCount: number) => {
  if (evidenceCount < 5) {
    return {
      badge: 'G\u1ee3i \u00fd kh\u1edfi \u0111\u1ea7u',
      detail: 'Vivu ch\u01b0a c\u00f3 \u0111\u1ee7 t\u01b0\u01a1ng t\u00e1c \u0111\u1ec3 \u01b0\u1edbc t\u00ednh ph\u1ea7n tr\u0103m \u0111\u00e1ng tin c\u1eady.',
    }
  }
  const similarity = Math.min(92, Math.max(55, Math.round(score * 20) * 5))
  const label = score >= 0.82 ? 'R\u1ea5t ph\u00f9 h\u1ee3p' : score >= 0.65 ? 'Kh\u00e1 ph\u00f9 h\u1ee3p' : 'G\u1ee3i \u00fd kh\u00e1m ph\u00e1'
  return {
    badge: `${label} \u00b7 ${similarity}% t\u01b0\u01a1ng \u0111\u1ed3ng`,
    detail: 'Ph\u1ea7n tr\u0103m l\u00e0 \u0111i\u1ec3m t\u01b0\u01a1ng \u0111\u1ed3ng \u01b0\u1edbc t\u00ednh, kh\u00f4ng ph\u1ea3i x\u00e1c su\u1ea5t b\u1ea1n s\u1ebd \u0111\u1eb7t tour.',
  }
}

const getRecommendationReason = (item: Recommendation) => {
  if (item.reason) return item.reason
  const topTags = Object.entries(item.tags || {}).sort((a, b) => b[1] - a[1]).slice(0, 2).map(([tag]) => tag)
  return topTags.length
    ? `G\u1ee3i \u00fd d\u1ef1a tr\u00ean s\u1edf th\u00edch ${topTags.join(', ')} v\u00e0 c\u00e1c t\u01b0\u01a1ng t\u00e1c g\u1ea7n \u0111\u00e2y.`
    : 'G\u1ee3i \u00fd d\u1ef1a tr\u00ean m\u1ee9c \u0111\u1ed9 g\u1ea7n v\u1edbi s\u1edf th\u00edch v\u00e0 \u0111i\u1ec3m \u0111\u1ebfn b\u1ea1n \u0111\u00e3 quan t\u00e2m.'
}

export function RecommendationsPage() {
  const { token, user } = useAuthStore()
  const [recommendations, setRecommendations] = useState<Recommendation[]>([])
  const [popularFallback, setPopularFallback] = useState<Tour[]>([])
  const [coldStart, setColdStart] = useState(false)
  const [evidenceCount, setEvidenceCount] = useState(0)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchRecommendations = async () => {
      if (!token) {
        try {
          const popular = await tourApi.getPopularTours()
          setPopularFallback(popular)
          setColdStart(true)
        } catch (err) {
          console.error('Failed to load popular tours:', err)
        } finally {
          setLoading(false)
        }
        return
      }

      try {
        const res = await recommendationsPageApi.getAll(20)
        setEvidenceCount(res.evidence_count || 0)
        if (res.is_cold_start) {
          setPopularFallback(res.popular || [])
          setColdStart(true)
        } else {
          setRecommendations(res.recommendations || [])
          setColdStart(false)
        }
      } catch (err) {
        console.error('Failed to load recommendations:', err)
        try {
          const popular = await tourApi.getPopularTours()
          setPopularFallback(popular)
          setColdStart(true)
        } catch (e) {
          console.error('Failed to load popular fallback:', e)
        }
      } finally {
        setLoading(false)
      }
    }
    fetchRecommendations()
  }, [token])

  const toursToRender: (Tour | Recommendation)[] = coldStart ? popularFallback : recommendations
  const imagesReady = useTourImagesReady(toursToRender)

  return (
    <div className="container">
      {/* HEADER BANNER */}
      <div className={styles.header}>
        <div className={styles.badge}>
          <span>✨ Gợi ý cá nhân hóa AI</span>
        </div>
        <h1 className={styles.title}>
          {coldStart ? 'Tour du lịch nổi bật & phổ biến' : `Gợi ý hành trình cho ${user?.name || 'bạn'}`}
        </h1>
        <p className={styles.subtitle}>
          {coldStart
            ? 'Bạn chưa có nhiều lượt tương tác. Hãy khám phá, tìm kiếm và lưu các tour yêu thích để AI học hỏi và đề xuất tour chuẩn xác nhất!'
            : 'Hệ thống AI đã phân tích lịch sử quan tâm, điểm đến và ngân sách của bạn để tính toán mức độ phù hợp cho từng chuyến đi.'}
        </p>

        {coldStart && (
          <div className={styles.ctaRow}>
            <Link to="/chat" className={styles.primaryBtn}>
              💬 Trò chuyện với AI để nhận gợi ý
            </Link>
            <Link to="/search" className={styles.secondaryBtn}>
              Khám phá toàn bộ tour →
            </Link>
          </div>
        )}
      </div>

      {loading || !imagesReady ? (
        <div className={styles.grid}>
          {Array.from({ length: toursToRender.length || 8 }).map((_, i) => (
            <TourCardSkeleton key={i} />
          ))}
        </div>
      ) : toursToRender.length === 0 ? (
        <div className={styles.empty}>
          <span style={{ fontSize: '3rem' }}>🏖️</span>
          <h3>Chưa có gợi ý phù hợp</h3>
          <p>Hãy khám phá các danh mục tour để bắt đầu nhận gợi ý từ AI.</p>
          <Link to="/search" className={styles.primaryBtn}>
            Khám phá tour ngay
          </Link>
        </div>
      ) : (
        <div className={styles.grid}>
          {toursToRender.map((item, idx) => {
            const tour: Tour = 'tour_id' in item
              ? {
                  id: item.tour_id,
                  name: item.name,
                  destination: item.destination,
                  price: item.price,
                  avg_rating: item.avg_rating || 0,
                  review_count: item.review_count || 0,
                  places: item.places,
                  duration: item.duration,
                  image_url: item.image_url || item.gallery?.[0],
                  gallery: item.gallery || [],
                }
              : item

            const match = !coldStart && 'score' in item
              ? getMatchPresentation(item.score, evidenceCount)
              : undefined

            return (
              <div className={styles.recommendationItem} key={('tour_id' in item ? item.tour_id : item.id) || idx}>
                <TourCard tour={tour} badge={match?.badge} />
                {match && 'score' in item && (
                  <div className={styles.reasonBox}>
                    <strong>{'V\u00ec sao Vivu g\u1ee3i \u00fd?'}</strong>
                    <span>{getRecommendationReason(item)}</span>
                    <small>{match.detail}</small>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
