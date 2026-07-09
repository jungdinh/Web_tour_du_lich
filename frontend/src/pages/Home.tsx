import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { tourApi, recommendationApi } from '@/api'
import { useAuthStore } from '@/stores/auth'
import { TourCard } from '@/components/TourCard'
import type { Tour, Recommendation } from '@/types'
import styles from './Home.module.css'

export function HomePage() {
  const { token } = useAuthStore()
  const [popularTours, setPopularTours] = useState<Tour[]>([])
  const [recommendations, setRecommendations] = useState<Recommendation[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [popular, rec] = await Promise.all([
          tourApi.getPopularTours(),
          token ? recommendationApi.getRecommendations(6) : Promise.resolve(null),
        ])
        setPopularTours(popular)
        if (rec) {
          setRecommendations(rec.recommendations || rec)
        }
      } catch (error) {
        console.error('Failed to fetch data:', error)
      } finally {
        setLoading(false)
      }
    }
    fetchData()
  }, [token])

  return (
    <div className={styles.page}>
      {/* Hero Section */}
      <section className={styles.hero}>
        <div className={styles.heroContent}>
          <h1 className={styles.heroTitle}>
            Tìm tour du lịch
            <br />
            <span>phù hợp với bạn</span>
          </h1>
          <p className={styles.heroSubtitle}>
            Hệ thống gợi ý thông minh sử dụng AI để phân tích sở thích 
            và đề xuất tour du lịch nội địa Việt Nam tốt nhất.
          </p>
          <div className={styles.heroActions}>
            <Link to="/search" className={styles.primaryBtn}>
              Khám phá ngay
            </Link>
            <Link to="/chat" className={styles.secondaryBtn}>
              Tư vấn với AI
            </Link>
          </div>
        </div>
      </section>

      {/* Recommendations Section */}
      {token && recommendations.length > 0 && (
        <section className={styles.section}>
          <div className="container">
            <div className={styles.sectionHeader}>
              <h2 className={styles.sectionTitle}>Gợi ý cho bạn</h2>
              <Link to="/chat" className={styles.sectionLink}>
                Tư vấn thêm →
              </Link>
            </div>
            <div className={styles.tourGrid}>
              {recommendations.map((rec) => (
                <TourCard
                  key={rec.tour_id}
                  tour={{
                    id: rec.tour_id,
                    name: rec.name,
                    destination: rec.destination,
                    price: rec.price,
                    avg_rating: rec.avg_rating || 0,
                    review_count: 0,
                  }}
                />
              ))}
            </div>
          </div>
        </section>
      )}

      {/* Popular Tours Section */}
      <section className={styles.section}>
        <div className="container">
          <div className={styles.sectionHeader}>
            <h2 className={styles.sectionTitle}>Tour phổ biến</h2>
            <Link to="/search" className={styles.sectionLink}>
              Xem thêm →
            </Link>
          </div>
          
          {loading ? (
            <div className={styles.loading}>Đang tải...</div>
          ) : (
            <div className={styles.tourGrid}>
              {popularTours.map((tour) => (
                <TourCard key={tour.id} tour={tour} />
              ))}
            </div>
          )}
        </div>
      </section>

      {/* Features Section */}
      <section className={styles.features}>
        <div className="container">
          <h2 className={styles.sectionTitle}>Tại sao chọn TourAI?</h2>
          <div className={styles.featureGrid}>
            <div className={styles.feature}>
              <div className={styles.featureIcon}>🎯</div>
              <h3>Cá nhân hóa</h3>
              <p>AI phân tích sở thích của bạn để đưa ra gợi ý chính xác nhất.</p>
            </div>
            <div className={styles.feature}>
              <div className={styles.featureIcon}>💬</div>
              <h3>Tư vấn thông minh</h3>
              <p>Trò chuyện tự nhiên với AI để tìm tour phù hợp.</p>
            </div>
            <div className={styles.feature}>
              <div className={styles.featureIcon}>📊</div>
              <h3>Đánh giá thực</h3>
              <p>Dữ liệu được thu thập và phân tích từ hàng nghìn review thực.</p>
            </div>
          </div>
        </div>
      </section>
    </div>
  )
}
