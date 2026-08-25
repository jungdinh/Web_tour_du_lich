import { useState, useEffect, useMemo, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { tourApi, recommendationApi } from '@/api'
import { useAuthStore } from '@/stores/auth'
import { TourCard, TourCardSkeleton } from '@/components/TourCard'
import { AiIcon } from '@/components/AiIcon'
import type { Tour, Recommendation } from '@/types'
import styles from './Home.module.css'

const CATEGORY_TABS = [
  { id: 'all', label: '🔥 Tất cả tour hot' },
  { id: 'beach', label: '🏖️ Biển đảo & Nghỉ dưỡng' },
  { id: 'mountain', label: '🏔️ Tây Bắc & Đà Lạt' },
  { id: 'international', label: '✈️ Du lịch Quốc tế' },
]

export function HomePage() {
  const { token } = useAuthStore()
  const navigate = useNavigate()
  const [popularTours, setPopularTours] = useState<Tour[]>([])
  const [recommendations, setRecommendations] = useState<Tour[]>([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState('all')
  const [heroSearch, setHeroSearch] = useState('')

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [popular, rec] = await Promise.all([
          tourApi.getPopularTours(),
          token ? recommendationApi.getRecommendations(8) : Promise.resolve(null),
        ])
        setPopularTours(popular)
        if (rec) {
          const recommendedTours = (rec.recommendations || rec).map((item: Tour | Recommendation) =>
            'tour_id' in item
              ? {
                  id: item.tour_id,
                  name: item.name,
                  destination: item.destination,
                  price: item.price,
                  duration: item.duration,
                  avg_rating: item.avg_rating || 0,
                  review_count: item.review_count || 0,
                  places: item.places,
                  image_url: item.image_url || item.gallery?.[0],
                  gallery: item.gallery,
                }
              : item
          )
          setRecommendations(recommendedTours)
        }
      } catch (error) {
        console.error('Failed to fetch data:', error)
      } finally {
        setLoading(false)
      }
    }
    fetchData()
  }, [token])

  const handleHeroSearch = (e: FormEvent) => {
    e.preventDefault()
    if (heroSearch.trim()) {
      navigate(`/search?q=${encodeURIComponent(heroSearch.trim())}`)
    } else {
      navigate('/search')
    }
  }

  // Filter popular tours by selected tab
  const filteredPopularTours = useMemo(() => {
    if (activeTab === 'beach') {
      return popularTours.filter((t) =>
        /phú quốc|nha trang|phan thiết|mũi né|quy nhơn|phú yên|đà nẵng|hạ long|cát bà|vũng tàu/i.test(
          `${t.name} ${t.destination || ''}`
        )
      )
    }
    if (activeTab === 'mountain') {
      return popularTours.filter((t) =>
        /đà lạt|sapa|sa pa|hà giang|cao bằng|mộc châu|ba bể/i.test(
          `${t.name} ${t.destination || ''}`
        )
      )
    }
    if (activeTab === 'international') {
      return popularTours.filter((t) =>
        /thái lan|hàn quốc|nhật bản|trung quốc|bali|dubai|châu âu|singapore|úc|canada/i.test(
          `${t.name} ${t.destination || ''}`
        )
      )
    }
    return popularTours
  }, [popularTours, activeTab])

  return (
    <div className={styles.page}>
      {/* HERO SECTION */}
      <section className={styles.hero}>
        <div className={styles.heroBackgroundGlow} />
        <div className="container">
          <div className={styles.heroContent}>
            <div className={styles.heroBadge}>
              <span className={styles.sparkle}>✨</span>
              <span>Hệ thống gợi ý du lịch thông minh bằng AI</span>
            </div>

            <h1 className={styles.heroTitle}>
              Khám phá thế giới theo <br />
              <span className={styles.gradientText}>phong cách của riêng bạn</span>
            </h1>

            <p className={styles.heroSubtitle}>
              TourAI kết hợp tìm kiếm tour thông minh cùng trợ lý AI để phân tích sở thích, ngân sách
              và tự động thiết kế hành trình du lịch hoàn hảo nhất cho bạn.
            </p>

            {/* Quick Hero Search Bar */}
            <form className={styles.heroSearchForm} onSubmit={handleHeroSearch}>
              <div className={styles.heroSearchInputWrap}>
                <span className={styles.searchPinIcon}>📍</span>
                <input
                  type="text"
                  placeholder="Bạn muốn đi đâu? (Đà Lạt, Phú Quốc, Thái Lan...)"
                  value={heroSearch}
                  onChange={(e) => setHeroSearch(e.target.value)}
                  className={styles.heroSearchInput}
                />
              </div>
              <button type="submit" className={styles.heroSearchBtn}>
                <span>Tìm tour</span>
                <span className={styles.btnArrow}>→</span>
              </button>
            </form>

            {/* PROMINENT AI CHAT CTA BUTTON */}
            <div className={styles.heroAiAction}>
              <Link to="/chat" className={styles.heroAiBtn}>
                <span className={styles.heroAiIconWrap}>
                  <AiIcon size={18} className={styles.heroAiIcon} />
                  <span className={styles.onlinePulse} />
                </span>
                <span className={styles.heroAiText}>
                  Tư vấn & Lên lịch trình với <strong>Trợ lý AI</strong>
                </span>
                <span className={styles.heroAiBadge}>AI Consultant</span>
                <span className={styles.heroAiArrow}>→</span>
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* RECOMMENDATIONS SECTION (If user logged in and has recs) */}
      {token && recommendations.length > 0 && (
        <section className={styles.section}>
          <div className="container">
            <div className={styles.sectionHeader}>
              <div>
                <div className={styles.sectionTag}>Dành riêng cho bạn</div>
                <h2 className={styles.sectionTitle}>Tour được AI gợi ý theo sở thích</h2>
              </div>
              <Link to="/recommendations" className={styles.sectionLink}>
                Xem tất cả ({recommendations.length}) <span className={styles.arrowAnim}>→</span>
              </Link>
            </div>

            <div className={styles.tourGrid}>
              {recommendations.slice(0, 4).map((tour) => (
                <TourCard key={tour.id} tour={tour} badge="🎯 Phù hợp nhất" />
              ))}
            </div>
          </div>
        </section>
      )}

      {/* POPULAR TOURS SECTION */}
      <section className={styles.section}>
        <div className="container">
          <div className={styles.sectionHeader}>
            <div>
              <div className={styles.sectionTag}>Điểm đến hấp dẫn</div>
              <h2 className={styles.sectionTitle}>Tour du lịch phổ biến nhất</h2>
            </div>
            <Link to="/search" className={styles.sectionLink}>
              Khám phá toàn bộ tour <span className={styles.arrowAnim}>→</span>
            </Link>
          </div>

          {/* Category Tabs */}
          <div className={styles.tabList}>
            {CATEGORY_TABS.map((tab) => (
              <button
                key={tab.id}
                type="button"
                className={`${styles.tabBtn} ${activeTab === tab.id ? styles.tabActive : ''}`}
                onClick={() => setActiveTab(tab.id)}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {loading ? (
            <div className={styles.tourGrid}>
              {Array.from({ length: 8 }).map((_, i) => (
                <TourCardSkeleton key={i} />
              ))}
            </div>
          ) : filteredPopularTours.length === 0 ? (
            <div className={styles.noTours}>
              <p>Chưa có tour trong danh mục này.</p>
              <Link to="/search" className={styles.exploreLink}>Xem tất cả tour</Link>
            </div>
          ) : (
            <div className={styles.tourGrid}>
              {filteredPopularTours.slice(0, 8).map((tour) => (
                <TourCard key={tour.id} tour={tour} />
              ))}
            </div>
          )}
        </div>
      </section>

      {/* AI CHAT CTA BANNER */}
      <section className={styles.ctaBannerSection}>
        <div className="container">
          <div className={styles.ctaBanner}>
            <div className={styles.ctaContent}>
              <span className={styles.ctaBadge}>
                <AiIcon size={13} style={{ display: 'inline', verticalAlign: 'middle', marginRight: 4 }} />
                Trợ lý thông minh
              </span>
              <h2 className={styles.ctaTitle}>Chưa chọn được điểm đến ưng ý?</h2>
              <p className={styles.ctaDesc}>
                Hãy để trợ lý AI của TourAI trò chuyện, thấu hiểu mong muốn và tự động thiết kế
                lịch trình chuyến đi hoàn hảo trong tích tắc.
              </p>
              <Link to="/chat" className={styles.ctaBtn}>
                Tư vấn với AI ngay →
              </Link>
            </div>
            <div className={styles.ctaDecoration}>
              <div className={styles.ctaChatBubble}>
                <span className={styles.bubbleAvatar}>
                  <AiIcon size={22} />
                </span>
                <div>
                  <div className={styles.bubbleName}>TourAI Assistant</div>
                  <div className={styles.bubbleText}>
                    "Mình có thể giúp bạn tìm tour đi Đà Lạt 3 ngày 2 đêm với ngân sách dưới 3 triệu!"
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* WHY CHOOSE TOUAI FEATURES */}
      <section className={styles.features}>
        <div className="container">
          <div className={styles.featuresHeader}>
            <div className={styles.sectionTag}>Ưu điểm vượt trội</div>
            <h2 className={styles.sectionTitle}>Tại sao nên lựa chọn TourAI?</h2>
          </div>

          <div className={styles.featureGrid}>
            <div className={styles.featureCard}>
              <div className={`${styles.featureIconWrap} ${styles.iconTeal}`}>
                <span>🎯</span>
              </div>
              <h3 className={styles.featureTitle}>Cá nhân hóa theo sở thích</h3>
              <p className={styles.featureDesc}>
                Mô hình AI học hỏi từ tương tác và đánh giá để gợi ý chính xác những điểm đến phù hợp nhất với bạn.
              </p>
            </div>

            <div className={styles.featureCard}>
              <div className={`${styles.featureIconWrap} ${styles.iconBlue}`}>
                <span>💬</span>
              </div>
              <h3 className={styles.featureTitle}>Tư vấn lịch trình tự nhiên</h3>
              <p className={styles.featureDesc}>
                Trò chuyện trực tiếp bằng ngôn ngữ tự nhiên, hỏi đáp mọi chi tiết về địa điểm, ăn uống và chi phí.
              </p>
            </div>

            <div className={styles.featureCard}>
              <div className={`${styles.featureIconWrap} ${styles.iconAmber}`}>
                <span>⭐</span>
              </div>
              <h3 className={styles.featureTitle}>Dữ liệu & Đánh giá minh bạch</h3>
              <p className={styles.featureDesc}>
                Hàng ngàn đánh giá thực từ du khách, thông tin lịch trình chi tiết và giá cả minh bạch không ẩn phí.
              </p>
            </div>
          </div>
        </div>
      </section>
    </div>
  )
}
