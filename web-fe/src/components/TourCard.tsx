import { useState, type MouseEvent } from 'react'
import { Link } from 'react-router-dom'
import { actionApi, favoriteApi } from '@/api'
import { useAuthStore } from '@/stores/auth'
import { ImageWithFallback } from './ImageWithFallback'
import type { Tour } from '@/types'
import { formatRatingToFive } from '@/utils/rating'
import styles from './TourCard.module.css'

const CATEGORY_DESTINATION_PATTERN = /^(tour\s|combo\s|du\s*l\u1ecbch\s*2\/9|tour\s*mice|tour\s*t\u1ef1\s*t\u00fac|tour\s*h\u00e8)/i

const LOCATION_PATTERNS: Array<{ pattern: RegExp; label: string }> = [
  { pattern: /\u0111\u00e0\s*l\u1ea1t/i, label: 'Đà Lạt' },
  { pattern: /phan\s*thi\u1ebft|m\u0169i\s*n\u00e9/i, label: 'Phan Thiết' },
  { pattern: /ph\u00fa\s*qu\u1ed1c/i, label: 'Phú Quốc' },
  { pattern: /nha\s*trang/i, label: 'Nha Trang' },
  { pattern: /quy\s*nh\u01a1n|ph\u00fa\s*y\u00ean/i, label: 'Quy Nhơn' },
  { pattern: /hu\u1ebf/i, label: 'Huế' },
  { pattern: /\u0111\u00e0\s*n\u1eb5ng/i, label: 'Đà Nẵng' },
  { pattern: /h\u1ed9i\s*an/i, label: 'Hội An' },
  { pattern: /h\u00e0\s*giang/i, label: 'Hà Giang' },
  { pattern: /cao\s*b\u1eb1ng/i, label: 'Cao Bằng' },
  { pattern: /sapa|sa\s*pa/i, label: 'Sapa' },
  { pattern: /h\u1ea1\s*long|c\u00e1t\s*b\u00e0/i, label: 'Hạ Long' },
  { pattern: /c\u1ea7n\s*th\u01a1|mi\u1ec1n\s*t\u00e2y|c\u00e0\s*mau|b\u1ea1c\s*li\u00eau/i, label: 'Miền Tây' },
  { pattern: /b\u1eafc\s*kinh|th\u01b0\u1ee3ng\s*h\u1ea3i|h\u00e0ng\s*ch\u00e2u/i, label: 'Trung Quốc' },
  { pattern: /bangkok|pattaya|phuket|th\u00e1i\s*lan/i, label: 'Thái Lan' },
  { pattern: /bali|indonesia/i, label: 'Bali' },
  { pattern: /canada|vancouver|toronto/i, label: 'Canada' },
  { pattern: /dubai|abu\s*dhabi/i, label: 'Dubai' },
  { pattern: /h\u00e0n\s*qu\u1ed1c|seoul|busan/i, label: 'Hàn Quốc' },
  { pattern: /nh\u1eadt\s*b\u1ea3n|tokyo|osaka|kyoto/i, label: 'Nhật Bản' },
  { pattern: /ch\u00e2u\s*\u00e2u|ph\u00e1p|\u00fd|th\u1ee5y\s*s\u0129|\u0111\u1ee9c/i, label: 'Châu Âu' },
  { pattern: /úc|australia|sydney|melbourne/i, label: 'Nước Úc' },
  { pattern: /singapore/i, label: 'Singapore' },
  { pattern: /malaysia/i, label: 'Malaysia' },
  { pattern: /đài\s*loan|taiwan|taipei/i, label: 'Đài Loan' },
]

const getTourLocation = (tour: Tour) => {
  const destination = tour.destination?.trim()
  if (destination && !CATEGORY_DESTINATION_PATTERN.test(destination)) {
    return destination
  }

  const matched = LOCATION_PATTERNS.find(({ pattern }) => pattern.test(tour.name))
  if (matched) return matched.label

  const place = tour.places?.find((item) => item.trim())
  return place || destination || 'Tour du lịch'
}

export interface TourCardProps {
  tour: Tour
  onClick?: () => void
  isFavoriteInitial?: boolean
  onFavoriteChange?: (isFav: boolean) => void
  badge?: string
}

export function TourCard({
  tour,
  onClick,
  isFavoriteInitial = false,
  onFavoriteChange,
  badge,
}: TourCardProps) {
  const { token } = useAuthStore()
  const [isFav, setIsFav] = useState(isFavoriteInitial)
  const [favLoading, setFavLoading] = useState(false)

  const formatPrice = (price: number) => {
    return new Intl.NumberFormat('vi-VN', {
      style: 'currency',
      currency: 'VND',
      maximumFractionDigits: 0,
    }).format(price)
  }

  const location = getTourLocation(tour)
  const durationText = tour.duration_label?.trim() || `${tour.duration || 1} ngày`

  const handleClick = () => {
    if (token) {
      actionApi.logAction(tour.id, 'click').catch(() => {})
    }
    onClick?.()
  }

  const handleFavoriteClick = async (e: MouseEvent<HTMLButtonElement>) => {
    e.preventDefault()
    e.stopPropagation()

    if (!token) {
      alert('Vui lòng đăng nhập để lưu tour yêu thích!')
      return
    }

    if (favLoading) return
    setFavLoading(true)

    try {
      if (isFav) {
        await favoriteApi.removeFavorite(tour.id)
        setIsFav(false)
        onFavoriteChange?.(false)
      } else {
        await favoriteApi.addFavorite(tour.id)
        setIsFav(true)
        onFavoriteChange?.(true)
      }
    } catch (err) {
      console.error('Failed to toggle favorite on card:', err)
    } finally {
      setFavLoading(false)
    }
  }

  // Filter 1-2 highlight places or tags
  const topPlaces = (tour.places || [])
    .filter((p) => p && p !== location && p.length <= 25)
    .slice(0, 2)

  return (
    <div className={styles.cardWrapper}>
      <Link
        to={`/tours/${tour.id}`}
        onClick={handleClick}
        className={styles.card}
      >
        {/* IMAGE CONTAINER WITH OVERLAYS */}
        <div className={styles.imageContainer}>
          <ImageWithFallback
            src={tour.image_url || tour.gallery?.[0]}
            alt={tour.name}
            className={styles.image}
          />
          
          <div className={styles.imageOverlayGradient} />

          {/* Top Badges */}
          <div className={styles.topBadges}>
            {badge ? (
              <span className={styles.customBadge}>{badge}</span>
            ) : (
              <span className={styles.locationBadge}>
                <span className={styles.pinIcon}>📍</span> {location}
              </span>
            )}

            <button
              type="button"
              className={`${styles.favoriteBtn} ${isFav ? styles.favoriteActive : ''}`}
              onClick={handleFavoriteClick}
              disabled={favLoading}
              title={isFav ? 'Bỏ lưu' : 'Lưu tour'}
              aria-label="Lưu vào danh sách yêu thích"
            >
              <svg
                className={styles.heartIcon}
                viewBox="0 0 24 24"
                fill={isFav ? 'currentColor' : 'none'}
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z" />
              </svg>
            </button>
          </div>

          {/* Bottom Badges on Image */}
          <div className={styles.bottomBadges}>
            <span className={styles.durationPill}>
              <span className={styles.clockIcon}>⏱</span> {durationText}
            </span>

            {tour.avg_rating !== undefined && tour.avg_rating > 0 && (
              <div className={styles.ratingBadge}>
                <span className={styles.starIcon}>★</span>
                <span className={styles.ratingValue}>
                  {formatRatingToFive(tour.avg_rating)}
                </span>
                {tour.review_count !== undefined && tour.review_count > 0 && (
                  <span className={styles.reviewCount}>({tour.review_count})</span>
                )}
              </div>
            )}
          </div>
        </div>

        {/* CONTENT */}
        <div className={styles.content}>
          <div className={styles.headerInfo}>
            <span className={styles.categoryLabel}>{location}</span>
            {tour.transport?.vehicle && tour.transport.vehicle.length > 0 && (
              <span className={styles.transportTag}>
                {tour.transport.vehicle[0].includes('bay') ? '✈️ Máy bay' : '🚌 Xe du lịch'}
              </span>
            )}
          </div>

          <h3 className={styles.name} title={tour.name}>
            {tour.name}
          </h3>

          {/* Highlights or Places chips */}
          {topPlaces.length > 0 && (
            <div className={styles.placesList}>
              {topPlaces.map((place, idx) => (
                <span key={idx} className={styles.placeTag}>
                  ✓ {place}
                </span>
              ))}
            </div>
          )}

          {/* FOOTER: PRICE & ACTION */}
          <div className={styles.footer}>
            <div className={styles.priceContainer}>
              <span className={styles.priceLabel}>Giá từ</span>
              <span className={styles.currentPrice}>
                {formatPrice(tour.price)}
              </span>
            </div>

            <div className={styles.actionBtn}>
              <span>Khám phá</span>
              <span className={styles.arrowIcon}>→</span>
            </div>
          </div>
        </div>
      </Link>
    </div>
  )
}

export function TourCardSkeleton() {
  return (
    <div className={`${styles.cardWrapper} ${styles.skeletonCard}`}>
      <div className={`${styles.imageContainer} skeleton`} />
      <div className={styles.content}>
        <div className={styles.headerInfo}>
          <div className="skeleton" style={{ width: '60px', height: '14px' }} />
          <div className="skeleton" style={{ width: '70px', height: '14px' }} />
        </div>
        <div className="skeleton" style={{ width: '100%', height: '22px', margin: '6px 0' }} />
        <div className="skeleton" style={{ width: '80%', height: '22px' }} />
        <div className={styles.placesList} style={{ margin: '8px 0' }}>
          <div className="skeleton" style={{ width: '90px', height: '18px' }} />
          <div className="skeleton" style={{ width: '80px', height: '18px' }} />
        </div>
        <div className={styles.footer} style={{ marginTop: 'auto' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <div className="skeleton" style={{ width: '40px', height: '12px' }} />
            <div className="skeleton" style={{ width: '110px', height: '22px' }} />
          </div>
          <div className="skeleton" style={{ width: '85px', height: '34px', borderRadius: '999px' }} />
        </div>
      </div>
    </div>
  )
}
