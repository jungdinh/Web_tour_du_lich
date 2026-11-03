import { useState, useEffect } from 'react'
import { useParams, Link, useNavigate, useSearchParams } from 'react-router-dom'
import { bookingApi, tourApi, favoriteApi } from '@/api'
import { useAuthStore } from '@/stores/auth'
import { ImageWithFallback } from '@/components/ImageWithFallback'
import { TourReviews } from '@/components/TourReviews'
import { TourCard, TourCardSkeleton } from '@/components/TourCard'
import type { Booking, Tour, Review } from '@/types'
import { formatRatingToFive } from '@/utils/rating'
import { Dropdown } from '@/components/Dropdown'
import styles from './TourDetail.module.css'
import { sanitizeRichText } from '@/utils/sanitizeRichText'
import { formatScheduleDate, getFutureScheduleRows } from '@/utils/schedule'
import {
  MapPin,
  Clock,
  Bus,
  Plane,
  Star,
  Calendar,
  CalendarCheck,
  CalendarDays,
  Sparkles,
  CheckCircle2,
  XCircle,
  Check,
  X,
  Utensils,
  Zap,
  Tag,
  Heart,
  Camera,
  Flame,
  ShieldCheck,
  RefreshCw,
  Headphones,
  ChevronDown,
  ChevronUp,
  ChevronRight,
  Gift,
  CheckSquare,
} from 'lucide-react'

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
  const [searchParams] = useSearchParams()
  const { token, user } = useAuthStore()
  const [tour, setTour] = useState<Tour | null>(null)
  const [reviews, setReviews] = useState<Review[]>([])
  const [reviewTotal, setReviewTotal] = useState(0)
  const [similarTours, setSimilarTours] = useState<Tour[]>([])
  const [similarToursLoading, setSimilarToursLoading] = useState(true)
  const [loading, setLoading] = useState(true)
  const [isFavorite, setIsFavorite] = useState(false)
  const [savingFavorite, setSavingFavorite] = useState(false)
  const [activeImage, setActiveImage] = useState('')
  const [toastMessage, setToastMessage] = useState('')
  const [activeTab, setActiveTab] = useState<'itinerary' | 'highlights' | 'included' | 'schedule' | 'reviews'>(() => searchParams.get('tab') === 'reviews' ? 'reviews' : 'itinerary')
  const [expandedItineraryDays, setExpandedItineraryDays] = useState<Set<number>>(() => new Set([0]))
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
    window.scrollTo({ top: 0, left: 0, behavior: 'instant' })
  }, [id])

  useEffect(() => {
    let isActive = true

    const fetchData = async () => {
      if (!id) {
        setLoading(false)
        setSimilarToursLoading(false)
        return
      }

      setLoading(true)
      setSimilarToursLoading(true)
      setTour(null)
      setReviews([])
      setReviewTotal(0)
      setSimilarTours([])

      try {
        const [tourData, reviewsData, similarData] = await Promise.all([
          tourApi.getTourById(Number(id)),
          tourApi.getTourReviews(Number(id)),
          tourApi.getSimilarTours(Number(id), 8).catch((error) => {
            console.error('Failed to fetch similar tours:', error)
            return []
          }),
        ])
        if (!isActive) return
        setTour(tourData)
        setReviews(reviewsData.data)
        setReviewTotal(reviewsData.pagination.total)
        setSimilarTours(similarData)
      } catch (error) {
        console.error('Failed to fetch tour:', error)
      } finally {
        if (isActive) {
          setLoading(false)
          setSimilarToursLoading(false)
        }
      }
    }
    fetchData()

    return () => {
      isActive = false
    }
  }, [id])

  useEffect(() => {
    if (searchParams.get('tab') === 'reviews') setActiveTab('reviews')
  }, [searchParams])

  useEffect(() => {
    const reviewId = searchParams.get('review')
    if (loading || activeTab !== 'reviews' || !reviewId) return
    const timer = window.setTimeout(() => {
      document.getElementById(`review-${reviewId}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }, 100)
    return () => window.clearTimeout(timer)
  }, [activeTab, loading, reviews, searchParams])

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
    const matchedDate = futureSchedule.some((row) => row.date === departureDate) ? departureDate : (futureSchedule[0]?.date || '')
    setBookingForm((prev) => ({
      ...prev,
      departure_date: matchedDate,
      guest_count: 1,
      contact_name: user?.name || prev.contact_name,
      contact_email: user?.email || prev.contact_email,
    }))
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
      await navigator.clipboard.writeText(text)
      setToastMessage('Đã sao chép: ' + text)
      setTimeout(() => setToastMessage(''), 3000)
    } catch (err) {
      console.error('Failed to copy: ', err)
    }
  }

  if (loading) {
    return (
      <div className="container">
        <div className={styles.loadingContainer}>
          <div className="skeleton" style={{ width: '100%', height: '36px', marginBottom: '16px' }} />
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 370px', gap: '20px' }}>
            <div>
              <div className="skeleton" style={{ width: '100%', aspectRatio: '16/9', maxHeight: '350px', borderRadius: '14px', marginBottom: '16px' }} />
              <div className="skeleton" style={{ width: '90%', height: '32px', marginBottom: '12px' }} />
              <div className="skeleton" style={{ width: '100%', height: '120px', marginBottom: '16px' }} />
            </div>
            <div>
              <div className="skeleton" style={{ width: '100%', height: '380px', borderRadius: '14px' }} />
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
  const rawItinerary = tour.itinerary ?? []
  const itinerary = rawItinerary.filter((seg, index, self) =>
    index === self.findIndex((t) => t.day === seg.day)
  )
  const schedule = getFutureScheduleRows(tour.schedule)
  const included = tour.included ?? []
  const excluded = tour.excluded ?? []
  const places = tour.places ?? []
  const topics = tour.topics ?? []
  const departure = inferDeparture(tour)
  const durationText = tour.duration_label?.trim() || `${tour.duration || 1} ngày`
  const selectedSchedule = schedule.find((row) => row.date === bookingForm.departure_date)
  const selectedUnitPrice = selectedSchedule?.price && selectedSchedule.price > 0 ? selectedSchedule.price : tour.price

  const toggleItineraryDay = (dayIndex: number) => {
    setExpandedItineraryDays((current) => {
      const next = new Set(current)
      if (next.has(dayIndex)) {
        next.delete(dayIndex)
      } else {
        next.add(dayIndex)
      }
      return next
    })
  }

  const toggleAllItineraryDays = () => {
    setExpandedItineraryDays((current) => {
      if (current.size === itinerary.length) {
        return new Set()
      }
      return new Set(itinerary.map((_, i) => i))
    })
  }

  return (
    <div className="container">
      {/* TOP HEADER: BREADCRUMB, BADGES, TITLE & RATING (ABOVE THE FOLD) */}
      <div className={styles.topHeader}>
        <nav className={styles.breadcrumb} aria-label="Breadcrumb">
          <Link to="/">Trang chủ</Link>
          <ChevronRight size={13} className={styles.breadcrumbSep} />
          <Link to="/search">Khám phá tour</Link>
          <ChevronRight size={13} className={styles.breadcrumbSep} />
          <span className={styles.breadcrumbActive}>{tour.destination || 'Chi tiết'}</span>
        </nav>

        <div className={styles.headerTitleRow}>
          <div className={styles.headerMainInfo}>
            <div className={styles.badgeRow}>
              <span className={styles.destinationBadge}>
                <MapPin size={12} /> {tour.destination}
              </span>
              <span className={styles.durationBadge}>
                <Clock size={12} /> {durationText}
              </span>
              {tour.transport?.vehicle && tour.transport.vehicle.length > 0 && (
                <span className={styles.vehicleBadge}>
                  {tour.transport.vehicle[0].includes('bay') ? <Plane size={12} /> : <Bus size={12} />}
                  <span>{tour.transport.vehicle[0].includes('bay') ? 'Máy bay' : 'Xe du lịch'}</span>
                </span>
              )}
              {hasDiscount && (
                <span className={styles.discountBadge}>
                  <Flame size={12} /> Tiết kiệm {discountPercent}%
                </span>
              )}
            </div>

            <h1 className={styles.title}>{tour.name}</h1>

            <div className={styles.metaRow}>
              <div className={styles.ratingBox}>
                <Star size={15} className={styles.starIcon} fill="#f59e0b" color="#f59e0b" />
                <strong>{formatRatingToFive(tour.avg_rating)}</strong>
                <span className={styles.reviewCount}>({tour.review_count} đánh giá)</span>
              </div>
              {places.length > 0 && (
                <>
                  <span className={styles.metaDivider}>•</span>
                  <span className={styles.tourPlaces}>
                    <MapPin size={12} /> {places.slice(0, 3).join(', ')}
                  </span>
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* TWO-COLUMN LAYOUT: GALLERY & DETAILS LEFT, STICKY BOOKING RIGHT */}
      <div className={styles.layout}>
        {/* MAIN COLUMN */}
        <div className={styles.mainColumn}>
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
                  <Flame size={13} /> Tiết kiệm {discountPercent}%
                </div>
              )}
              <div className={styles.heroImageCounter}>
                <Camera size={13} /> {gallery.findIndex((s) => s === activeImage) + 1} / {gallery.length} ảnh
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

          {/* QUICK OVERVIEW FEATURE GRID */}
          <div className={styles.overviewGrid}>
            <div className={styles.overviewItem}>
              <span className={`${styles.overviewIcon} ${styles.iconDeparture}`}>
                <MapPin size={18} />
              </span>
              <div>
                <div className={styles.overviewLabel}>Khởi hành từ</div>
                <div className={styles.overviewValue}>{departure}</div>
              </div>
            </div>

            <div className={styles.overviewItem}>
              <span className={`${styles.overviewIcon} ${styles.iconDuration}`}>
                <Clock size={18} />
              </span>
              <div>
                <div className={styles.overviewLabel}>Thời gian</div>
                <div className={styles.overviewValue}>{durationText}</div>
              </div>
            </div>

            <div className={styles.overviewItem}>
              <span className={`${styles.overviewIcon} ${styles.iconTransport}`}>
                <Bus size={18} />
              </span>
              <div>
                <div className={styles.overviewLabel}>Phương tiện</div>
                <div className={styles.overviewValue}>
                  {tour.transport?.vehicle?.join(', ') || 'Xe du lịch đời mới'}
                </div>
              </div>
            </div>

            {tour.transport?.airline ? (
              <div className={styles.overviewItem}>
                <span className={`${styles.overviewIcon} ${styles.iconAirline}`}>
                  <Plane size={18} />
                </span>
                <div>
                  <div className={styles.overviewLabel}>Hàng không</div>
                  <div className={styles.overviewValue}>{tour.transport.airline}</div>
                </div>
              </div>
            ) : (
              <div className={styles.overviewItem}>
                <span className={`${styles.overviewIcon} ${styles.iconIdeal}`}>
                  <Sparkles size={18} />
                </span>
                <div>
                  <div className={styles.overviewLabel}>Mùa lý tưởng</div>
                  <div className={styles.overviewValue}>{tour.season || 'Quanh năm'}</div>
                </div>
              </div>
            )}
          </div>

          {/* SECTION TABS */}
          <div className={styles.tabNav} role="tablist" aria-label="Nội dung chi tiết tour">
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'itinerary'}
              className={`${styles.tabLink} ${activeTab === 'itinerary' ? styles.tabLinkActive : ''}`}
              onClick={() => setActiveTab('itinerary')}
            >
              <CalendarDays size={15} /> Lịch trình ({itinerary.length} ngày)
            </button>
            {(tour.highlights ?? []).length > 0 && (
              <button
                type="button"
                role="tab"
                aria-selected={activeTab === 'highlights'}
                className={`${styles.tabLink} ${activeTab === 'highlights' ? styles.tabLinkActive : ''}`}
                onClick={() => setActiveTab('highlights')}
              >
                <Sparkles size={15} /> Điểm nổi bật
              </button>
            )}
            {(included.length > 0 || excluded.length > 0) && (
              <button
                type="button"
                role="tab"
                aria-selected={activeTab === 'included'}
                className={`${styles.tabLink} ${activeTab === 'included' ? styles.tabLinkActive : ''}`}
                onClick={() => setActiveTab('included')}
              >
                <CheckSquare size={15} /> Dịch vụ bao gồm
              </button>
            )}
            {schedule.length > 0 && (
              <button
                type="button"
                role="tab"
                aria-selected={activeTab === 'schedule'}
                className={`${styles.tabLink} ${activeTab === 'schedule' ? styles.tabLinkActive : ''}`}
                onClick={() => setActiveTab('schedule')}
              >
                <CalendarCheck size={15} /> Lịch khởi hành
              </button>
            )}
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'reviews'}
              className={`${styles.tabLink} ${activeTab === 'reviews' ? styles.tabLinkActive : ''}`}
              onClick={() => setActiveTab('reviews')}
            >
              <Star size={15} /> Đánh giá ({reviewTotal})
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

              <div className={styles.itineraryHeaderRow}>
                <h3 className={styles.subHeading}>Chi tiết từng ngày</h3>
                {itinerary.length > 1 && (
                  <button
                    type="button"
                    className={styles.toggleAllBtn}
                    onClick={toggleAllItineraryDays}
                  >
                    {expandedItineraryDays.size === itinerary.length ? (
                      <>
                        <ChevronUp size={14} /> Thu gọn tất cả
                      </>
                    ) : (
                      <>
                        <ChevronDown size={14} /> Mở rộng tất cả
                      </>
                    )}
                  </button>
                )}
              </div>

              {itinerary.length > 0 ? (
                <div className={styles.timeline}>
                  {itinerary.map((seg, i) => (
                    <div key={i} className={styles.timelineItem}>
                      <div className={styles.timelineMarker}>
                        <span className={styles.dayNumber}>{i + 1}</span>
                      </div>
                      <div className={`${styles.timelineContentCard} ${expandedItineraryDays.has(i) ? styles.timelineContentCardExpanded : ''}`}>
                        <button
                          type="button"
                          className={styles.timelineHeader}
                          aria-expanded={expandedItineraryDays.has(i)}
                          aria-controls={`itinerary-day-${i}`}
                          onClick={() => toggleItineraryDay(i)}
                        >
                          <span className={styles.timelineHeadingGroup}>
                            <span className={styles.timelineTitle}>{seg.day}</span>
                            <span className={styles.timelineHint}>
                              {expandedItineraryDays.has(i) ? 'Thu gọn nội dung' : 'Xem chi tiết ngày này'}
                            </span>
                          </span>
                          <span className={styles.timelineHeaderMeta}>
                            {seg.meal && (
                              <span className={styles.mealBadge}>
                                <Utensils size={12} /> {seg.meal}
                              </span>
                            )}
                            <span className={`${styles.timelineChevron} ${expandedItineraryDays.has(i) ? styles.timelineChevronExpanded : ''}`} aria-hidden="true">
                              <ChevronDown size={18} />
                            </span>
                          </span>
                        </button>
                        {expandedItineraryDays.has(i) && (
                          <div id={`itinerary-day-${i}`} className={styles.timelineDetails}>
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
                    <CheckCircle2 size={16} className={styles.highlightCheck} />
                    <span>{h}</span>
                  </div>
                ))}
              </div>

              {(places.length > 0 || topics.length > 0) && (
                <div className={styles.tagsContainer}>
                  <h4 className={styles.tagsTitle}>Địa danh & Chủ đề liên quan:</h4>
                  <div className={styles.chipRow}>
                    {places.map((p, i) => (
                      <span key={`p${i}`} className={styles.placeChip}>
                        <MapPin size={12} /> {p}
                      </span>
                    ))}
                    {topics.map((t, i) => (
                      <span key={`t${i}`} className={styles.topicChip}>
                        <Tag size={12} /> {t}
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
                    <span className={styles.checkIconGreen}>
                      <CheckCircle2 size={18} />
                    </span>
                    <h3 className={styles.serviceTitle}>Giá tour bao gồm</h3>
                  </div>
                  <ul className={styles.serviceList}>
                    {included.map((item, i) => (
                      <li key={i}>
                        <Check size={14} className={styles.includedBullet} />
                        <span>{item}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                <div className={styles.serviceCardExcluded}>
                  <div className={styles.serviceHeader}>
                    <span className={styles.crossIconRed}>
                      <XCircle size={18} />
                    </span>
                    <h3 className={styles.serviceTitle}>Giá tour không bao gồm</h3>
                  </div>
                  <ul className={styles.serviceList}>
                    {excluded.map((item, i) => (
                      <li key={i}>
                        <X size={14} className={styles.excludedBullet} />
                        <span>{item}</span>
                      </li>
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
                          <td>
                            <strong className={styles.scheduleDateCell}>
                              <Calendar size={13} /> {formatScheduleDate(row.date)}
                            </strong>
                          </td>
                          <td className={styles.schedulePrice}>{formatPrice(row.price > 0 ? row.price : tour.price)}</td>
                          <td>
                            {row.available ? (
                              <span className={styles.statusAvailable}>
                                <CheckCircle2 size={14} /> Còn chỗ
                              </span>
                            ) : (
                              <span className={styles.statusFull}>
                                <XCircle size={14} /> Hết chỗ
                              </span>
                            )}
                          </td>
                          <td>
                            <button
                              type="button"
                              className={styles.scheduleBookBtn}
                              disabled={!row.available}
                              onClick={() => openBooking(row.date)}
                            >
                              <CalendarCheck size={13} /> Chọn ngày
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
                  <Gift size={11} /> Tiết kiệm: {formatPrice(savings)} ({discountPercent}%)
                </div>
              )}
            </div>

            {/* QUICK DATE PICKER IN SIDEBAR */}
            {schedule.length > 0 && (
              <div className={styles.quickDateSection}>
                <label className={styles.quickDateLabel}>
                  <Calendar size={13} /> Chọn ngày khởi hành:
                </label>
                <Dropdown
                  className={styles.quickDateDropdown}
                  value={bookingForm.departure_date}
                  onChange={(val) => setBookingForm((prev) => ({ ...prev, departure_date: val }))}
                  options={[
                    { value: '', label: 'Chọn ngày khởi hành mong muốn' },
                    ...schedule.map((row) => ({
                      value: row.date,
                      label: `${formatScheduleDate(row.date)} · ${formatPrice(row.price > 0 ? row.price : tour.price)}${row.available ? '' : ' · Hết chỗ'}`,
                      disabled: !row.available,
                    })),
                  ]}
                />
              </div>
            )}

            <div className={styles.quickSummaryList}>
              <div className={styles.summaryRow}>
                <span className={styles.summaryLabel}><Clock size={13} /> Thời gian:</span>
                <strong>{durationText}</strong>
              </div>
              <div className={styles.summaryRow}>
                <span className={styles.summaryLabel}><MapPin size={13} /> Khởi hành:</span>
                <strong>{departure}</strong>
              </div>
              <div className={styles.summaryRow}>
                <span className={styles.summaryLabel}><Bus size={13} /> Phương tiện:</span>
                <strong>{tour.transport?.vehicle?.[0] || 'Xe du lịch'}</strong>
              </div>
            </div>

            <div className={styles.bookingActions}>
              <button
                type="button"
                className={styles.bookNowBtn}
                disabled={schedule.length === 0}
                onClick={() => openBooking(bookingForm.departure_date)}
              >
                <Zap size={16} />
                <span>{schedule.length ? 'Đặt tour ngay' : 'Chưa có ngày khởi hành'}</span>
              </button>

              <button
                type="button"
                disabled={savingFavorite}
                className={`${styles.favToggleBtn} ${isFavorite ? styles.favActive : ''}`}
                onClick={handleToggleFavorite}
              >
                <Heart size={14} fill={isFavorite ? 'currentColor' : 'none'} />
                <span>{savingFavorite ? 'Đang lưu...' : isFavorite ? 'Đã lưu yêu thích' : 'Lưu tour này'}</span>
              </button>
            </div>

            {/* TRUST & GUARANTEES */}
            <div className={styles.trustBox}>
              <div className={styles.trustItem}>
                <ShieldCheck size={16} className={styles.trustIcon} />
                <span>Bảo hiểm du lịch trọn gói theo tour</span>
              </div>
              <div className={styles.trustItem}>
                <RefreshCw size={16} className={styles.trustIcon} />
                <span>Hỗ trợ đổi ngày khởi hành linh hoạt</span>
              </div>
              <div className={styles.trustItem}>
                <Headphones size={16} className={styles.trustIcon} />
                <span>Tư vấn viên AI & Hotline 24/7</span>
              </div>
            </div>
          </div>
        </aside>
      </div>

      {(similarToursLoading || similarTours.length > 0) && (
        <section className={styles.similarToursSection} aria-labelledby="similar-tours-title">
          <div className={styles.similarToursHeader}>
            <div>
              <span>KHÁM PHÁ THÊM</span>
              <h2 id="similar-tours-title">Tour tương tự dành cho bạn</h2>
              <p>Dựa trên điểm đến và những trải nghiệm nổi bật của tour này.</p>
            </div>
            <Link to="/search" className={styles.similarToursLink}>
              Xem tất cả <ChevronRight size={16} />
            </Link>
          </div>

          <div
            className={styles.similarToursRail}
            aria-busy={similarToursLoading}
            aria-label="Danh sách tour tương tự"
          >
            {similarToursLoading
              ? Array.from({ length: 4 }, (_, index) => (
                  <div className={styles.similarTourItem} key={index}>
                    <TourCardSkeleton />
                  </div>
                ))
              : similarTours.map((similarTour) => (
                  <div className={styles.similarTourItem} key={similarTour.id}>
                    <TourCard tour={similarTour} />
                  </div>
                ))}
          </div>
        </section>
      )}

      {toastMessage && (
        <div className={styles.toast}>
          <CheckCircle2 size={16} /> {toastMessage}
        </div>
      )}

      {bookingOpen && (
        <div className={styles.bookingModalBackdrop} role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) closeBooking() }}>
          <section className={styles.bookingModal} role="dialog" aria-modal="true" aria-labelledby="booking-title">
            <div className={styles.bookingModalHeader}>
              <div>
                <span className={styles.bookingEyebrow}>ĐẶT TOUR TRỰC TUYẾN</span>
                <h2 id="booking-title">{createdBooking ? (createdBooking.checkout ? 'Thanh toán qua SePay' : 'Quét QR để thanh toán') : 'Thông tin đặt tour'}</h2>
              </div>
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
                  <label>Ngày khởi hành<Dropdown className={styles.dateDropdown} value={bookingForm.departure_date} onChange={(val) => setBookingForm({ ...bookingForm, departure_date: val })} options={[{value: '', label: 'Chọn ngày khởi hành'}, ...schedule.map(row => ({value: row.date, label: `${formatScheduleDate(row.date)} · ${formatPrice(row.price > 0 ? row.price : tour.price)}${row.available ? '' : ' · Hết chỗ'}`, disabled: !row.available}))]} /></label>
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
