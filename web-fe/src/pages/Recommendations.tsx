import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { tourApi, recommendationsPageApi } from '@/api'
import { useAuthStore } from '@/stores/auth'
import { TourCard, TourCardSkeleton } from '@/components/TourCard'
import type { Tour, Recommendation } from '@/types'
import styles from './Recommendations.module.css'

export function RecommendationsPage() {
  const { token, user } = useAuthStore()
  const [recommendations, setRecommendations] = useState<Recommendation[]>([])
  const [popularFallback, setPopularFallback] = useState<Tour[]>([])
  const [coldStart, setColdStart] = useState(false)
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

      {loading ? (
        <div className={styles.grid}>
          {Array.from({ length: 8 }).map((_, i) => (
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

            const matchScore = !coldStart && 'score' in item
              ? `🎯 ${(item.score * 100).toFixed(0)}% Phù hợp`
              : undefined

            return (
              <TourCard
                key={('tour_id' in item ? item.tour_id : item.id) || idx}
                tour={tour}
                badge={matchScore}
              />
            )
          })}
        </div>
      )}
    </div>
  )
}
