import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { actionApi } from '@/api'
import { useAuthStore } from '@/stores/auth'
import { TourCard } from '@/components/TourCard'
import type { Tour } from '@/types'
import styles from './Favorites.module.css'

export function FavoritesPage() {
  const navigate = useNavigate()
  const { token } = useAuthStore()
  const [favorites, setFavorites] = useState<Tour[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!token) {
      navigate('/login')
      return
    }

    // TODO: Implement favorites API
    setLoading(false)
  }, [token, navigate])

  if (loading) {
    return <div className={styles.loading}>Đang tải...</div>
  }

  return (
    <div className="container">
      <h1 className={styles.title}>Tour yêu thích</h1>
      
      {favorites.length === 0 ? (
        <div className={styles.empty}>
          <p>Bạn chưa lưu tour nào.</p>
          <button onClick={() => navigate('/search')} className={styles.browseBtn}>
            Khám phá tour
          </button>
        </div>
      ) : (
        <div className={styles.grid}>
          {favorites.map((tour) => (
            <TourCard key={tour.id} tour={tour} />
          ))}
        </div>
      )}
    </div>
  )
}
