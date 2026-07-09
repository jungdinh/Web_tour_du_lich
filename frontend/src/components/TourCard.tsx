import { Link } from 'react-router-dom'
import { tourApi } from '@/api'
import type { Tour } from '@/types'
import styles from './TourCard.module.css'

interface TourCardProps {
  tour: Tour
}

export function TourCard({ tour }: TourCardProps) {
  const formatPrice = (price: number) => {
    return new Intl.NumberFormat('vi-VN', {
      style: 'currency',
      currency: 'VND',
      maximumFractionDigits: 0,
    }).format(price)
  }

  return (
    <Link to={`/tours/${tour.id}`} className={styles.card}>
      <div className={styles.imageWrapper}>
        {tour.image_url ? (
          <img src={tour.image_url} alt={tour.name} className={styles.image} />
        ) : (
          <div className={styles.placeholder}>
            <span>Tour Image</span>
          </div>
        )}
        <div className={styles.rating}>
          <span>★</span> {tour.avg_rating.toFixed(1)}
        </div>
      </div>
      
      <div className={styles.content}>
        <div className={styles.destination}>{tour.destination}</div>
        <h3 className={styles.name}>{tour.name}</h3>
        <div className={styles.meta}>
          <span>{tour.duration} ngày</span>
          <span>•</span>
          <span>{tour.review_count} đánh giá</span>
        </div>
        <div className={styles.footer}>
          <span className={styles.price}>{formatPrice(tour.price)}</span>
        </div>
      </div>
    </Link>
  )
}
