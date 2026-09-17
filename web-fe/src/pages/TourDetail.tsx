import { useState, useEffect } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import { bookingApi, tourApi, favoriteApi } from '@/api'
import { useAuthStore } from '@/stores/auth'
import { ImageWithFallback } from '@/components/ImageWithFallback'
import { TourReviews } from '@/components/TourReviews'
import type { Booking, Tour, Review } from '@/types'
import { formatRatingToFive } from '@/utils/rating'
import styles from './TourDetail.module.css'
import { sanitizeRichText } from '@/utils/sanitizeRichText'
import { formatScheduleDate, getFutureScheduleRows } from '@/utils/schedule'

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
  const navigate = useNavigate()
  const { token, user } = useAuthStore()
  const [tour, setTour] = useState<Tour | null>(null)
  const [reviews, setReviews] = useState<Review[]>([])
  const [reviewTotal, setReviewTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [isFavorite, setIsFavorite] = useState(false)
  const [savingFavorite, setSavingFavorite] = useState(false)
  const [activeImage, setActiveImage] = useState('')
  const [toastMessage, setToastMessage] = useState('')
  const [activeTab, setActiveTab] = useState<'itinerary' | 'highlights' | 'included' | 'schedule' | 'reviews'>('itinerary')
  const [bookingOpen, setBookingOpen] = useState(false)
  const [bookingLoading, setBookingLoading] = useState(false)
  const [bookingError, setBookingError] = useState('')
  const [createdBooking, setCreatedBooking] = useState<Booking | null>(null)
  const [bookingForm, setBookingForm] = useState({
    departure_date: '',
    guest_count: 1,
    contact_name: user?.name || '',
    contact_email: user?.email || '',
    contact_phone: '',
    note: '',
  })


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
        setReviewTotal(reviewsData.pagination.total)
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


  useEffect(() => {
    if (!bookingOpen || createdBooking?.payment_status !== 'pending') return
    const timer = window.setInterval(async () => {
      try {
        const refreshed = await bookingApi.getById(createdBooking.id)
        setCreatedBooking(refreshed)
        if (refreshed.payment_status !== 'pending' || refreshed.status !== 'pending_payment') {
          window.clearInterval(timer)
          if (refreshed.payment_status === 'paid') {
            setTimeout(() => {
              navigate(`/payment-result?booking_id=${refreshed.id}`)
            }, 5000)
          }
        }
      } catch {
        // Keep the payment screen usable while the webhook is pending.
      }
    }, 5000)
    return () => window.clearInterval(timer)
  }, [bookingOpen, createdBooking?.id, createdBooking?.payment_status, navigate])

  const openBooking = (departureDate = '') => {
    if (!token) {
      window.location.href = '/login'
      return
    }
    const futureSchedule = getFutureScheduleRows(tour?.schedule)
    if (!futureSchedule.length) {
      setActiveTab('schedule')
      return
    }
    setBookingError('')
    setCreatedBooking(null)
    setBookingForm({
      departure_date: futureSchedule.some((row) => row.date === departureDate) ? departureDate : '',
      guest_count: 1,
      contact_name: user?.name || '',
      contact_email: user?.email || '',
      contact_phone: '',
      note: '',
    })
    setBookingOpen(true)
  }

  const submitBooking = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!tour) return
    const selectedSchedule = getFutureScheduleRows(tour.schedule).find((row) => row.date === bookingForm.departure_date)
    if (!selectedSchedule) {
      setBookingError('Vui lòng chọn một ngày khởi hành còn mở trong tương lai.')
      return
    }
    if (!selectedSchedule.available) {
      setBookingError('Ngày khởi hành này hiện đã hết chỗ. Vui lòng chọn ngày khác.')
      return
    }
    setBookingLoading(true)
    setBookingError('')
    try {
      const booking = await bookingApi.create({ tour_id: tour.id, ...bookingForm })
      setCreatedBooking(booking)
    } catch (error: any) {
      setBookingError(error?.response?.data?.error || 'Không thể tạo booking. Vui lòng thử lại.')
    } finally {
      setBookingLoading(false)
    }
  }

  const openSepayCheckout = () => {
    const checkout = createdBooking?.checkout
    if (!checkout) return

    const form = document.createElement('form')
    form.method = checkout.method
    form.action = checkout.action
    form.style.display = 'none'

    Object.entries(checkout.fields).forEach(([name, value]) => {
      const input = document.createElement('input')
      input.type = 'hidden'
      input.name = name
      input.value = value
      form.appendChild(input)
    })

    document.body.appendChild(form)
    form.submit()
  }

  const closeBooking = () => {
    if (!bookingLoading) setBookingOpen(false)
  }

  const formatPrice = (price: number) => {
    return new Intl.NumberFormat('vi-VN', {
      style: 'currency',
      currency: 'VND',
      maximumFractionDigits: 0,
    }).format(price)
  }

  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setToastMessage('Đã sao chép: ' + text);
      setTimeout(() => setToastMessage(''), 3000);
    } catch (err) {
      console.error('Failed to copy: ', err);
    }
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
  const schedule = getFutureScheduleRows(tour.schedule)
  const included = tour.included ?? []
  const excluded = tour.excluded ?? []
  const places = tour.places ?? []
  const topics = tour.topics ?? []
  const departure = inferDeparture(tour)
  const durationText = tour.duration_label?.trim() || `${tour.duration || 1} ngày`
  const selectedSchedule = schedule.find((row) => row.date === bookingForm.departure_date)
  const selectedUnitPrice = selectedSchedule?.price && selectedSchedule.price > 0 ? selectedSchedule.price : tour.price

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
              ⭐ Đánh giá ({reviewTotal})
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
                      {schedule.map((row) => (
                        <tr key={row.date} className={row.date === bookingForm.departure_date ? styles.scheduleRowSelected : undefined}>
                          <td><strong>📅 {formatScheduleDate(row.date)}</strong></td>
                          <td className={styles.schedulePrice}>{formatPrice(row.price > 0 ? row.price : tour.price)}</td>
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
                               onClick={() => openBooking(row.date)}
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
                <p className={styles.emptyNote}>Tour hiện chưa có ngày khởi hành trong tương lai để đặt trực tuyến.</p>
              )}
            </div>
          )}

          {/* TAB CONTENT: REVIEWS */}
          {activeTab === 'reviews' && (
            <TourReviews
              tourId={tour.id}
              averageRating={tour.avg_rating}
              initialReviews={reviews}
              initialTotal={reviewTotal}
              onStatsChange={({ averageRating, reviewCount }) => {
                setTour((current) => current ? { ...current, avg_rating: averageRating, review_count: reviewCount } : current)
                setReviewTotal(reviewCount)
              }}
            />
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
                disabled={schedule.length === 0}
                onClick={() => openBooking()}
              >
                <span>{schedule.length ? '⚡ Đặt tour ngay' : 'Chưa có ngày khởi hành'}</span>
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

      {toastMessage && (
        <div className={styles.toast}>
          ✓ {toastMessage}
        </div>
      )}

      {bookingOpen && (
        <div className={styles.bookingModalBackdrop} role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) closeBooking() }}>
          <section className={styles.bookingModal} role="dialog" aria-modal="true" aria-labelledby="booking-title">
            <div className={styles.bookingModalHeader}>
              <div><span className={styles.bookingEyebrow}>ĐẶT TOUR TRỰC TUYẾN</span><h2 id="booking-title">{createdBooking ? createdBooking.checkout ? 'Thanh toán qua SePay' : 'Quét QR để thanh toán' : 'Thông tin đặt tour'}</h2></div>
              <button type="button" className={styles.bookingClose} onClick={closeBooking} aria-label="Đóng">×</button>
            </div>
            {createdBooking ? (
              <div className={styles.paymentPanel}>
                <div className={createdBooking.payment_status === 'paid' ? styles.paymentSuccess : (['expired', 'cancelled'].includes(createdBooking.status) || createdBooking.payment_status === 'failed') ? styles.paymentError : styles.paymentPending}>
                  {createdBooking.payment_status === 'paid' ? 'Thanh toán đã được xác nhận.' :
                   createdBooking.status === 'expired' ? 'Đơn hàng đã hết hạn thanh toán.' :
                   createdBooking.status === 'cancelled' ? 'Đơn hàng đã bị huỷ.' :
                   createdBooking.payment_status === 'failed' ? 'Thanh toán thất bại.' :
                   'Đơn đang chờ thanh toán'}
                </div>
                <p className={styles.paymentTourName}>{createdBooking.tour_name}</p>
                {createdBooking.checkout ? (
                  <div className={styles.paymentGatewayBox}>
                    <strong>Thanh toán an toàn qua SePay</strong>
                    <span>Nhấn nút bên dưới để mở màn hình quét QR của SePay.</span>
                    <button type="button" className={styles.paymentGatewayButton} onClick={openSepayCheckout}>
                      Mở thanh toán QR SePay
                    </button>
                  </div>
                ) : createdBooking.qr_url ? (
                  <div className={styles.sepayCheckoutBox}>
                    <div className={styles.sepayQrCol}>
                      <img className={styles.paymentQr} src={createdBooking.qr_url} alt="Mã QR thanh toán SePay" />
                      <span>Sử dụng App ngân hàng để quét mã</span>
                    </div>
                    <div className={styles.sepayInfoCol}>
                      {createdBooking.bank.account_number && (
                        <>
                          <div className={styles.sepayField}>
                            <span className={styles.sepayFieldLabel}>Ngân hàng</span>
                            <div className={styles.sepayFieldValue}>
                              <span>{createdBooking.bank.code}</span>
                            </div>
                          </div>
                          <div className={styles.sepayField}>
                            <span className={styles.sepayFieldLabel}>Chủ tài khoản</span>
                            <div className={styles.sepayFieldValue}>
                              <span>{createdBooking.bank.account_name}</span>
                            </div>
                          </div>
                          <div className={styles.sepayField}>
                            <span className={styles.sepayFieldLabel}>Số tài khoản</span>
                            <div className={styles.sepayFieldValue}>
                              <span>{createdBooking.bank.account_number}</span>
                              <button type="button" className={styles.copyBtn} onClick={() => void copyToClipboard(createdBooking.bank.account_number)}>Sao chép</button>
                            </div>
                          </div>
                        </>
                      )}
                      <div className={styles.sepayField}>
                        <span className={styles.sepayFieldLabel}>Số tiền</span>
                        <div className={styles.sepayFieldValue}>
                          <span style={{ color: '#047857' }}>{formatPrice(createdBooking.total_amount)}</span>
                          <button type="button" className={styles.copyBtn} onClick={() => void copyToClipboard(createdBooking.total_amount.toString())}>Sao chép</button>
                        </div>
                      </div>
                      <div className={styles.sepayField}>
                        <span className={styles.sepayFieldLabel}>Nội dung chuyển khoản</span>
                        <div className={styles.sepayFieldValue}>
                          <span style={{ color: '#c2410c' }}>{createdBooking.payment_code}</span>
                          <button type="button" className={styles.copyBtn} onClick={() => void copyToClipboard(createdBooking.payment_code)}>Sao chép</button>
                        </div>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className={styles.paymentQrMissing}>Admin chưa cấu hình tài khoản ngân hàng SePay.</div>
                )}
                <p className={styles.paymentHint}>{createdBooking.checkout ? 'SePay sẽ hiển thị mã QR và xử lý giao dịch. Trạng thái đơn chỉ được cập nhật sau khi backend nhận IPN hợp lệ.' : 'Hệ thống sẽ tự động xác nhận ngay khi nhận được thanh toán. Không cần tải lại trang.'}</p>
                <div className={styles.paymentActions}><button type="button" className={styles.secondaryBookingButton} onClick={closeBooking}>Đóng</button></div>
              </div>
            ) : (
              <form className={styles.bookingForm} onSubmit={submitBooking}>
                <div className={styles.bookingTourSummary}><strong>{tour.name}</strong><span>{formatPrice(selectedUnitPrice)} / khách · {durationText}</span></div>
                <div className={styles.bookingFormGrid}>
                  <label>Ngày khởi hành<select required value={bookingForm.departure_date} onChange={(event) => setBookingForm({ ...bookingForm, departure_date: event.target.value })}><option value="">Chọn ngày khởi hành</option>{schedule.map((row) => <option key={row.date} value={row.date} disabled={!row.available}>{formatScheduleDate(row.date)} · {formatPrice(row.price > 0 ? row.price : tour.price)}{row.available ? '' : ' · Hết chỗ'}</option>)}</select></label>
                  <label>Số khách<input type="number" min="1" max="20" required value={bookingForm.guest_count} onChange={(event) => setBookingForm({ ...bookingForm, guest_count: Number(event.target.value) })} /></label>
                  <label>Họ và tên<input required maxLength={255} value={bookingForm.contact_name} onChange={(event) => setBookingForm({ ...bookingForm, contact_name: event.target.value })} /></label>
                  <label>Email<input type="email" required maxLength={255} value={bookingForm.contact_email} onChange={(event) => setBookingForm({ ...bookingForm, contact_email: event.target.value })} /></label>
                  <label>Số điện thoại<input required maxLength={30} value={bookingForm.contact_phone} onChange={(event) => setBookingForm({ ...bookingForm, contact_phone: event.target.value })} /></label>
                  <label className={styles.bookingFullField}>Ghi chú thêm<textarea maxLength={1000} rows={3} value={bookingForm.note} onChange={(event) => setBookingForm({ ...bookingForm, note: event.target.value })} /></label>
                </div>
                {bookingError && <p className={styles.bookingError}>{bookingError}</p>}
                 <div className={styles.bookingFormFooter}><span>Tổng dự kiến: <strong>{formatPrice(selectedUnitPrice * bookingForm.guest_count)}</strong></span><button type="submit" className={styles.bookNowBtn} disabled={bookingLoading || schedule.length === 0}>{bookingLoading ? 'Đang tạo booking...' : 'Tiếp tục thanh toán QR'}</button></div>
              </form>
            )}
          </section>
        </div>
      )}

    </div>
  )
}

