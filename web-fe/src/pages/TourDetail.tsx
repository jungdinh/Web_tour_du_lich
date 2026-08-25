import { useState, useEffect } from 'react'
import { useParams, Link } from 'react-router-dom'
import { tourApi, favoriteApi } from '@/api'
import { useAuthStore } from '@/stores/auth'
import { ImageWithFallback } from '@/components/ImageWithFallback'
import type { Tour, Review } from '@/types'
import { formatRatingToFive } from '@/utils/rating'
import styles from './TourDetail.module.css'
import { sanitizeRichText } from '@/utils/sanitizeRichText'

const DEPARTURE_PATTERNS: Array<{ pattern: RegExp; label: string }> = [
  { pattern: /t\.?p\.?\s*h(?:o|\u1ed3)?\s*ch\u00ed\s*minh|tp\.?\s*hcm|hcm|s\u00e0i\s*g\u00f2n|t\u00e2n\s*s\u01a1n\s*nh\u1ea5t/i, label: 'TP. Hồ Chí Minh' },
  { pattern: /h\u00e0\s*n\u1ed9i|n\u1ed9i\s*b\u00e0i/i, label: 'Hà Nội' },
  { pattern: /\u0111\u00e0\s*n\u1eb5ng/i, label: 'Đà Nẵng' },
  { pattern: /c\u1ea7n\s*th\u01a1/i, label: 'Cần Thơ' },
  { pattern: /nha\s*trang/i, label: 'Nha Trang' },
  { pattern: /h\u1ea3i\s*ph\u00f2ng/i, label: 'Hải Phòng' },
  { pattern: /hu\u1ebf/i, label: 'Huế' },
  { pattern: /\u0111\u00e0\s*l\u1ea1t/i, label: 'Đà Lạt' },
]

const inferDeparture = (tour: Tour) => {
  const firstDay = tour.itinerary?.[0]
  const dayTitle = firstDay?.day || ''
  const dayContent = Array.isArray(firstDay?.content) ? firstDay.content.join(' ') : ''
  const sourceText = `${dayTitle} ${dayContent}`

  const matches = DEPARTURE_PATTERNS
    .filter(({ pattern }) => pattern.test(sourceText))
    .map(({ label }) => label)

  const uniqueMatches = [...new Set(matches)]
  if (uniqueMatches.length > 0) {
    return uniqueMatches.slice(0, 2).join(' / ')
  }

  const routeTitle = dayTitle.replace(/^ng\u00e0y\s*\d+\s*:?\s*/i, '').trim()
  const [firstStop] = routeTitle.split(/\s+[-\u2013]\s+|\s*\/\s*/)
  return firstStop?.trim() || tour.destination || 'TP. Hồ Chí Minh / Hà Nội'
}

export function TourDetailPage() {
  const { id } = useParams<{ id: string }>()
  const { token } = useAuthStore()
  const [tour, setTour] = useState<Tour | null>(null)
  const [reviews, setReviews] = useState<Review[]>([])
  const [loading, setLoading] = useState(true)
  const [isFavorite, setIsFavorite] = useState(false)
  const [savingFavorite, setSavingFavorite] = useState(false)
  const [activeImage, setActiveImage] = useState('')
  const [activeTab, setActiveTab] = useState<'itinerary' | 'highlights' | 'included' | 'schedule' | 'reviews'>('itinerary')

  useEffect(() => {
    const fetchData = async () => {
      if (!id) return
      try {
        const [tourData, reviewsData] = await Promise.all([
          tourApi.getTourById(Number(id)),
          tourApi.getTourReviews(Number(id)),
        ])
        setTour(tourData)
        setReviews(reviewsData.data)
      } catch (error) {
        console.error('Failed to fetch tour:', error)
      } finally {
        setLoading(false)
      }
    }
    fetchData()
  }, [id])

  useEffect(() => {
    if (tour) {
      const gallery = tour.gallery && tour.gallery.length > 0 ? tour.gallery : []
      setActiveImage(gallery[0] || tour.image_url || '')
    }
  }, [tour])

  useEffect(() => {
    if (!token || !id) {
      setIsFavorite(false)
      return
    }
    let cancelled = false
    favoriteApi
      .checkFavorite(Number(id))
      .then((res) => {
        if (!cancelled) setIsFavorite(res.isFavorite)
      })
      .catch(() => {
        if (!cancelled) setIsFavorite(false)
      })
    return () => {
      cancelled = true
    }
  }, [id, token])

  const handleToggleFavorite = async () => {
    if (savingFavorite || !tour) return
    if (!token) {
      alert('Vui lòng đăng nhập để lưu tour yêu thích!')
      return
    }
    setSavingFavorite(true)
    try {
      if (isFavorite) {
        await favoriteApi.removeFavorite(tour.id)
        setIsFavorite(false)
      } else {
        await favoriteApi.addFavorite(tour.id)
        setIsFavorite(true)
      }
    } catch (err) {
      console.error('Failed to toggle favorite:', err)
    } finally {
      setSavingFavorite(false)
    }
  }

  const formatPrice = (price: number) => {
    return new Intl.NumberFormat('vi-VN', {
      style: 'currency',
      currency: 'VND',
      maximumFractionDigits: 0,
    }).format(price)
  }

  if (loading) {
    return (
      <div className="container">
        <div className={styles.loadingContainer}>
          <div className="skeleton" style={{ width: '100%', aspectRatio: '16/9', borderRadius: '18px', marginBottom: '24px' }} />
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 360px', gap: '32px' }}>
            <div>
              <div className="skeleton" style={{ width: '30%', height: '20px', marginBottom: '12px' }} />
              <div className="skeleton" style={{ width: '90%', height: '36px', marginBottom: '16px' }} />
              <div className="skeleton" style={{ width: '100%', height: '140px', marginBottom: '24px' }} />
            </div>
            <div>
              <div className="skeleton" style={{ width: '100%', height: '320px', borderRadius: '18px' }} />
            </div>
          </div>
        </div>
      </div>
    )
  }

  if (!tour) {
    return (
      <div className="container">
        <div className={styles.notFound}>
          <span style={{ fontSize: '3rem' }}>🏖️</span>
          <h2>Không tìm thấy thông tin tour</h2>
          <p>Tour du lịch này có thể đã bị gỡ hoặc không tồn tại trên hệ thống.</p>
          <Link to="/search" className={styles.primaryBtn}>
            Khám phá tour khác
          </Link>
        </div>
      </div>
    )
  }

  const gallery = tour.gallery && tour.gallery.length > 0 ? tour.gallery : (tour.image_url ? [tour.image_url] : [])
  const hasDiscount = !!tour.original_price && tour.original_price > tour.price
  const discountPercent = hasDiscount
    ? Math.round(((tour.original_price! - tour.price) / tour.original_price!) * 100)
    : 0
  const savings = hasDiscount ? tour.original_price! - tour.price : 0
  const itinerary = tour.itinerary ?? []
  const schedule = tour.schedule ?? []
  const included = tour.included ?? []
  const excluded = tour.excluded ?? []
  const places = tour.places ?? []
  const topics = tour.topics ?? []
  const departure = inferDeparture(tour)
  const durationText = tour.duration_label?.trim() || `${tour.duration || 1} ngày`

  return (
    <div className="container">
      {/* BREADCRUMB */}
      <nav className={styles.breadcrumb} aria-label="Breadcrumb">
        <Link to="/">Trang chủ</Link>
        <span>/</span>
        <Link to="/search">Khám phá tour</Link>
        <span>/</span>
        <span className={styles.breadcrumbActive}>{tour.destination || 'Chi tiết'}</span>
      </nav>

      {/* HERO GALLERY */}
      <section className={styles.heroGallery}>
        <div className={styles.heroMain}>
          <ImageWithFallback
            src={activeImage}
            alt={tour.name}
            className={styles.heroImage}
          />
          {hasDiscount && (
            <div className={styles.heroDiscountTag}>
              🔥 Tiết kiệm {discountPercent}%
            </div>
          )}
          <div className={styles.heroImageCounter}>
            📷 {gallery.findIndex((s) => s === activeImage) + 1} / {gallery.length} ảnh
          </div>
        </div>

        {gallery.length > 1 && (
          <div className={styles.thumbStrip}>
            {gallery.slice(0, 8).map((src, i) => (
              <button
                key={i}
                type="button"
                className={`${styles.thumbBtn} ${src === activeImage ? styles.thumbActive : ''}`}
                onClick={() => setActiveImage(src)}
                aria-label={`Xem ảnh ${i + 1}`}
              >
                <ImageWithFallback src={src} alt={`thumbnail ${i + 1}`} />
              </button>
            ))}
          </div>
        )}
      </section>

      {/* TWO-COLUMN LAYOUT */}
      <div className={styles.layout}>
        {/* MAIN COLUMN */}
        <div className={styles.mainColumn}>
          {/* Header Title & Badges */}
          <header className={styles.header}>
            <div className={styles.badgeRow}>
              <span className={styles.destinationBadge}>📍 {tour.destination}</span>
              <span className={styles.durationBadge}>⏱ {durationText}</span>
              {tour.transport?.vehicle && tour.transport.vehicle.length > 0 && (
                <span className={styles.vehicleBadge}>
                  {tour.transport.vehicle[0].includes('bay') ? '✈️ Máy bay' : '🚌 Xe du lịch'}
                </span>
              )}
            </div>

            <h1 className={styles.title}>{tour.name}</h1>

            <div className={styles.metaRow}>
              <div className={styles.ratingBox}>
                <span className={styles.star}>★</span>
                <strong>{formatRatingToFive(tour.avg_rating)}</strong>
                <span className={styles.reviewCount}>({tour.review_count} đánh giá)</span>
              </div>
              <span className={styles.metaDivider}>•</span>
              <span className={styles.tourCode}>Mã tour: #{tour.id}</span>
            </div>
          </header>

          {/* Quick Overview Feature Grid */}
          <div className={styles.overviewGrid}>
            <div className={styles.overviewItem}>
              <span className={styles.overviewIcon}>🛫</span>
              <div>
                <div className={styles.overviewLabel}>Khởi hành từ</div>
                <div className={styles.overviewValue}>{departure}</div>
              </div>
            </div>

            <div className={styles.overviewItem}>
              <span className={styles.overviewIcon}>⏳</span>
              <div>
                <div className={styles.overviewLabel}>Thời gian</div>
                <div className={styles.overviewValue}>{durationText}</div>
              </div>
            </div>

            <div className={styles.overviewItem}>
              <span className={styles.overviewIcon}>🚌</span>
              <div>
                <div className={styles.overviewLabel}>Phương tiện</div>
                <div className={styles.overviewValue}>
                  {tour.transport?.vehicle?.join(', ') || 'Xe du lịch đời mới'}
                </div>
              </div>
            </div>

            {tour.transport?.airline && (
              <div className={styles.overviewItem}>
                <span className={styles.overviewIcon}>✈️</span>
                <div>
                  <div className={styles.overviewLabel}>Hàng không</div>
                  <div className={styles.overviewValue}>{tour.transport.airline}</div>
                </div>
              </div>
            )}
          </div>

          {/* SECTION TABS */}
          <div className={styles.tabNav}>
            <button
              type="button"
              className={`${styles.tabLink} ${activeTab === 'itinerary' ? styles.tabLinkActive : ''}`}
              onClick={() => setActiveTab('itinerary')}
            >
              📅 Lịch trình ({itinerary.length} ngày)
            </button>
            {(tour.highlights ?? []).length > 0 && (
              <button
                type="button"
                className={`${styles.tabLink} ${activeTab === 'highlights' ? styles.tabLinkActive : ''}`}
                onClick={() => setActiveTab('highlights')}
              >
                ✨ Điểm nổi bật
              </button>
            )}
            {(included.length > 0 || excluded.length > 0) && (
              <button
                type="button"
                className={`${styles.tabLink} ${activeTab === 'included' ? styles.tabLinkActive : ''}`}
                onClick={() => setActiveTab('included')}
              >
                📋 Dịch vụ bao gồm
              </button>
            )}
            {schedule.length > 0 && (
              <button
                type="button"
                className={`${styles.tabLink} ${activeTab === 'schedule' ? styles.tabLinkActive : ''}`}
                onClick={() => setActiveTab('schedule')}
              >
                📆 Lịch khởi hành
              </button>
            )}
            <button
              type="button"
              className={`${styles.tabLink} ${activeTab === 'reviews' ? styles.tabLinkActive : ''}`}
              onClick={() => setActiveTab('reviews')}
            >
              ⭐ Đánh giá ({reviews.length})
            </button>
          </div>

          {/* TAB CONTENT: ITINERARY */}
          {activeTab === 'itinerary' && (
            <div className={styles.tabSection}>
              {tour.description && (
                <div className={styles.descriptionCard}>
                  <h3 className={styles.subHeading}>Tổng quan chuyến đi</h3>
                  <div className={styles.descriptionText} dangerouslySetInnerHTML={{ __html: sanitizeRichText(tour.description) }} />
                </div>
              )}

              {itinerary.length > 0 ? (
                <div className={styles.timeline}>
                  {itinerary.map((seg, i) => (
                    <div key={i} className={styles.timelineItem}>
                      <div className={styles.timelineMarker}>
                        <span className={styles.dayNumber}>{i + 1}</span>
                      </div>
                      <div className={styles.timelineContentCard}>
                        <div className={styles.timelineHeader}>
                          <h4 className={styles.timelineTitle}>{seg.day}</h4>
                          {seg.meal && (
                            <span className={styles.mealBadge}>🍽 {seg.meal}</span>
                          )}
                        </div>
                        <div className={styles.timelineBody}>
                          {seg.content.map((p, j) => (
                            <p key={j} className={styles.timelineParagraph}>
                              {p}
                            </p>
                          ))}
                        </div>
                        {seg.images && seg.images.length > 0 && (
                          <div className={styles.timelineImages}>
                            {seg.images.map((src, k) => (
                              <ImageWithFallback
                                key={k}
                                src={src}
                                alt={`Ảnh ngày ${i + 1}`}
                                className={styles.timelineThumb}
                              />
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className={styles.emptyNote}>Lịch trình chi tiết đang được cập nhật.</p>
              )}
            </div>
          )}

          {/* TAB CONTENT: HIGHLIGHTS */}
          {activeTab === 'highlights' && (
            <div className={styles.tabSection}>
              <h3 className={styles.subHeading}>Những trải nghiệm không thể bỏ qua</h3>
              <div className={styles.highlightsGrid}>
                {(tour.highlights ?? []).map((h, i) => (
                  <div key={i} className={styles.highlightCard}>
                    <span className={styles.highlightCheck}>✓</span>
                    <span>{h}</span>
                  </div>
                ))}
              </div>

              {(places.length > 0 || topics.length > 0) && (
                <div className={styles.tagsContainer}>
                  <h4 className={styles.tagsTitle}>Địa danh & Chủ đề:</h4>
                  <div className={styles.chipRow}>
                    {places.map((p, i) => (
                      <span key={`p${i}`} className={styles.placeChip}>
                        📍 {p}
                      </span>
                    ))}
                    {topics.map((t, i) => (
                      <span key={`t${i}`} className={styles.topicChip}>
                        # {t}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* TAB CONTENT: INCLUDED / EXCLUDED */}
          {activeTab === 'included' && (
            <div className={styles.tabSection}>
              <div className={styles.serviceGrid}>
                <div className={styles.serviceCardIncluded}>
                  <div className={styles.serviceHeader}>
                    <span className={styles.checkIconGreen}>✓</span>
                    <h3 className={styles.serviceTitle}>Giá tour bao gồm</h3>
                  </div>
                  <ul className={styles.serviceList}>
                    {included.map((item, i) => (
                      <li key={i}>{item}</li>
                    ))}
                  </ul>
                </div>

                <div className={styles.serviceCardExcluded}>
                  <div className={styles.serviceHeader}>
                    <span className={styles.crossIconRed}>✕</span>
                    <h3 className={styles.serviceTitle}>Giá tour không bao gồm</h3>
                  </div>
                  <ul className={styles.serviceList}>
                    {excluded.map((item, i) => (
                      <li key={i}>{item}</li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          )}

          {/* TAB CONTENT: SCHEDULE */}
          {activeTab === 'schedule' && (
            <div className={styles.tabSection}>
              <h3 className={styles.subHeading}>Lịch khởi hành & Tình trạng chỗ</h3>
              {schedule.length > 0 ? (
                <div className={styles.scheduleTableWrap}>
                  <table className={styles.scheduleTable}>
                    <thead>
                      <tr>
                        <th>Ngày khởi hành</th>
                        <th>Giá tour</th>
                        <th>Tình trạng</th>
                        <th>Thao tác</th>
                      </tr>
                    </thead>
                    <tbody>
                      {schedule.map((row, i) => (
                        <tr key={i}>
                          <td><strong>📅 {row.date}</strong></td>
                          <td className={styles.schedulePrice}>{formatPrice(row.price)}</td>
                          <td>
                            {row.available ? (
                              <span className={styles.statusAvailable}>✓ Còn chỗ</span>
                            ) : (
                              <span className={styles.statusFull}>✕ Hết chỗ</span>
                            )}
                          </td>
                          <td>
                            <button
                              type="button"
                              className={styles.scheduleBookBtn}
                              disabled={!row.available}
                              onClick={() => alert(`Bạn đã chọn khởi hành ngày ${row.date}`)}
                            >
                              Chọn ngày
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className={styles.emptyNote}>Lịch khởi hành linh hoạt. Vui lòng liên hệ để được hỗ trợ.</p>
              )}
            </div>
          )}

          {/* TAB CONTENT: REVIEWS */}
          {activeTab === 'reviews' && (
            <div className={styles.tabSection}>
              <div className={styles.reviewSummaryBox}>
                <div className={styles.scoreLarge}>
                  {formatRatingToFive(tour.avg_rating)}
                </div>
                <div>
                  <div className={styles.starsLarge}>★★★★★</div>
                  <div className={styles.scoreCount}>Dựa trên {reviews.length} đánh giá thực từ du khách</div>
                </div>
              </div>

              {reviews.length === 0 ? (
                <p className={styles.emptyNote}>Chưa có đánh giá nào cho tour này.</p>
              ) : (
                <div className={styles.reviewList}>
                  {reviews.map((r) => (
                    <div key={r.id} className={styles.reviewItem}>
                      <div className={styles.reviewAuthor}>
                        <div className={styles.reviewAvatar}>
                          {r.reviewer_name?.[0]?.toUpperCase() || 'U'}
                        </div>
                        <div>
                          <div className={styles.reviewerName}>{r.reviewer_name || 'Khách du lịch'}</div>
                          <div className={styles.reviewDate}>
                            {r.created_at} • <span className={styles.verifiedTag}>✓ Đã trải nghiệm tour</span>
                          </div>
                        </div>
                        {r.rating > 0 && (
                          <div className={styles.reviewRatingPill}>
                            ⭐ {formatRatingToFive(r.rating)}
                          </div>
                        )}
                      </div>
                      <p className={styles.reviewText}>{r.content}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* STICKY BOOKING SIDEBAR */}
        <aside className={styles.sidebar}>
          <div className={styles.bookingBox}>
            <div className={styles.priceHeader}>
              <span className={styles.priceHeadingLabel}>Giá trọn gói từ</span>
              <div className={styles.priceRow}>
                {hasDiscount && (
                  <span className={styles.originalPrice}>
                    {formatPrice(tour.original_price!)}
                  </span>
                )}
                <span className={styles.mainPrice}>{formatPrice(tour.price)}</span>
                <span className={styles.priceUnit}>/ khách</span>
              </div>
              {hasDiscount && (
                <div className={styles.savingsTag}>
                  🎁 Tiết kiệm: {formatPrice(savings)}
                </div>
              )}
            </div>

            <div className={styles.quickSummaryList}>
              <div className={styles.summaryRow}>
                <span>Thời gian:</span>
                <strong>{durationText}</strong>
              </div>
              <div className={styles.summaryRow}>
                <span>Khởi hành:</span>
                <strong>{departure}</strong>
              </div>
              <div className={styles.summaryRow}>
                <span>Phương tiện:</span>
                <strong>{tour.transport?.vehicle?.[0] || 'Xe du lịch'}</strong>
              </div>
            </div>

            <div className={styles.bookingActions}>
              <button
                type="button"
                className={styles.bookNowBtn}
                onClick={() => alert('Chức năng đặt tour trực tuyến đang kết nối cổng thanh toán. Nhân viên hỗ trợ sẽ liên hệ bạn ngay!')}
              >
                <span>⚡ Đặt tour ngay</span>
              </button>

              <button
                type="button"
                disabled={savingFavorite}
                className={`${styles.favToggleBtn} ${isFavorite ? styles.favActive : ''}`}
                onClick={handleToggleFavorite}
              >
                {savingFavorite ? 'Đang lưu...' : isFavorite ? '♥ Đã lưu vào yêu thích' : '♡ Lưu tour này'}
              </button>
            </div>

            {/* TRUST & GUARANTEES */}
            <div className={styles.trustBox}>
              <div className={styles.trustItem}>
                <span className={styles.trustIcon}>🛡️</span>
                <span>Bảo hiểm du lịch trọn gói theo tour</span>
              </div>
              <div className={styles.trustItem}>
                <span className={styles.trustIcon}>🔄</span>
                <span>Hỗ trợ đổi ngày khởi hành linh hoạt</span>
              </div>
              <div className={styles.trustItem}>
                <span className={styles.trustIcon}>📞</span>
                <span>Tư vấn viên AI & Hotline 24/7</span>
              </div>
            </div>
          </div>
        </aside>
      </div>
    </div>
  )
}

