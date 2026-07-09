import { useState, useEffect } from 'react'
import { useParams, Link } from 'react-router-dom'
import { tourApi, actionApi } from '@/api'
import type { Tour, Review } from '@/types'
import styles from './TourDetail.module.css'

export function TourDetailPage() {
  const { id } = useParams<{ id: string }>()
  const [tour, setTour] = useState<Tour | null>(null)
  const [reviews, setReviews] = useState<Review[]>([])
  const [loading, setLoading] = useState(true)

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
        
        // Log view action
        actionApi.logAction(Number(id), 'view').catch(() => {})
      } catch (error) {
        console.error('Failed to fetch tour:', error)
      } finally {
        setLoading(false)
      }
    }
    fetchData()
  }, [id])

  if (loading) {
    return <div className={styles.loading}>Đang tải...</div>
  }

  if (!tour) {
    return <div className={styles.notFound}>Tour không tìm thấy</div>
  }

  const formatPrice = (price: number) => {
    return new Intl.NumberFormat('vi-VN', {
      style: 'currency',
      currency: 'VND',
      maximumFractionDigits: 0,
    }).format(price)
  }

  const handleSave = async () => {
    if (id) {
      await actionApi.logAction(Number(id), 'save')
    }
  }

  return (
    <div className="container">
      <div className={styles.content}>
        <div className={styles.main}>
          {tour.image_url && (
            <img src={tour.image_url} alt={tour.name} className={styles.image} />
          )}
          
          <div className={styles.header}>
            <span className={styles.destination}>{tour.destination}</span>
            <h1 className={styles.name}>{tour.name}</h1>
            <div className={styles.rating}>
              <span className={styles.stars}>★★★★★</span>
              <span>{tour.avg_rating.toFixed(1)}</span>
              <span className={styles.reviewCount}>({tour.review_count} đánh giá)</span>
            </div>
          </div>

          {tour.description && (
            <div className={styles.section}>
              <h2 className={styles.sectionTitle}>Mô tả</h2>
              <p className={styles.description}>{tour.description}</p>
            </div>
          )}

          {tour.tags && tour.tags.length > 0 && (
            <div className={styles.section}>
              <h2 className={styles.sectionTitle}>Đặc điểm nổi bật</h2>
              <div className={styles.tags}>
                {tour.tags.map((tag) => (
                  <span key={tag.tag} className={styles.tag}>
                    {tag.tag}
                    <span className={styles.tagWeight}>{(tag.weight * 100).toFixed(0)}%</span>
                  </span>
                ))}
              </div>
            </div>
          )}

          <div className={styles.section}>
            <h2 className={styles.sectionTitle}>Đánh giá ({reviews.length})</h2>
            {reviews.length === 0 ? (
              <p className={styles.noReviews}>Chưa có đánh giá nào.</p>
            ) : (
              <div className={styles.reviewList}>
                {reviews.map((review) => (
                  <div key={review.id} className={styles.review}>
                    <div className={styles.reviewHeader}>
                      <span className={styles.reviewerName}>
                        {review.reviewer_name || 'Người dùng'}
                      </span>
                      <span className={styles.reviewRating}>
                        {'★'.repeat(Math.round(review.rating || 0))}
                      </span>
                    </div>
                    <p className={styles.reviewContent}>{review.content}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className={styles.sidebar}>
          <div className={styles.bookingCard}>
            <div className={styles.price}>
              <span className={styles.priceLabel}>Giá từ</span>
              <span className={styles.priceValue}>{formatPrice(tour.price)}</span>
              <span className={styles.priceUnit}>/người</span>
            </div>
            
            <div className={styles.info}>
              <div className={styles.infoRow}>
                <span>Thời gian</span>
                <span>{tour.duration} ngày</span>
              </div>
              <div className={styles.infoRow}>
                <span>Địa điểm</span>
                <span>{tour.destination}</span>
              </div>
              {tour.season && (
                <div className={styles.infoRow}>
                  <span>Mùa phù hợp</span>
                  <span>{tour.season}</span>
                </div>
              )}
            </div>

            <button className={styles.bookBtn}>Đặt tour</button>
            <button onClick={handleSave} className={styles.saveBtn}>
              Lưu tour
            </button>
            
            {tour.source_url && (
              <a href={tour.source_url} target="_blank" rel="noopener noreferrer" className={styles.sourceLink}>
                Xem tại {tour.source === 'klook' ? 'Klook' : 'Traveloka'} →
              </a>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
