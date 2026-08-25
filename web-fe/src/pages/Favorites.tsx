import { useState, useEffect, useCallback } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { favoriteApi } from '@/api'
import { useAuthStore } from '@/stores/auth'
import { TourCard, TourCardSkeleton } from '@/components/TourCard'
import type { Tour } from '@/types'
import styles from './Favorites.module.css'

export function FavoritesPage() {
  const navigate = useNavigate()
  const { token } = useAuthStore()
  const [favorites, setFavorites] = useState<Tour[]>([])
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [totalCount, setTotalCount] = useState(0)
  const [error, setError] = useState<string | null>(null)

  const loadFavorites = useCallback(async (pageToLoad = 1) => {
    setLoading(true)
    setError(null)
    try {
      const res = await favoriteApi.getFavorites(pageToLoad, 12)
      setFavorites(res.data)
      setTotalPages(res.pagination.totalPages)
      setTotalCount(res.pagination.total || res.data.length)
    } catch (err) {
      console.error('Failed to load favorites:', err)
      setError('Không thể tải danh sách yêu thích')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (!token) {
      navigate('/login')
      return
    }
    loadFavorites(page)
  }, [token, navigate, page, loadFavorites])

  const handleFavoriteChange = (tourId: number, isFav: boolean) => {
    if (!isFav) {
      // Remove from list
      setFavorites((prev) => prev.filter((t) => t.id !== tourId))
      setTotalCount((prev) => Math.max(0, prev - 1))
    }
  }

  return (
    <div className="container">
      {/* HEADER */}
      <div className={styles.header}>
        <div>
          <div className={styles.badge}>❤️ Bộ sưu tập cá nhân</div>
          <h1 className={styles.title}>Tour du lịch đã lưu</h1>
          <p className={styles.subtitle}>
            Danh sách những điểm đến và hành trình bạn đang quan tâm hoặc lên kế hoạch trải nghiệm.
          </p>
        </div>
        {!loading && (
          <div className={styles.countBadge}>
            Đã lưu <strong>{totalCount}</strong> tour
          </div>
        )}
      </div>

      {error && <div className={styles.error}>{error}</div>}

      {loading ? (
        <div className={styles.grid}>
          {Array.from({ length: 4 }).map((_, i) => (
            <TourCardSkeleton key={i} />
          ))}
        </div>
      ) : favorites.length === 0 ? (
        <div className={styles.empty}>
          <span style={{ fontSize: '3.5rem' }}>💌</span>
          <h3>Bạn chưa lưu tour nào</h3>
          <p>
            Nhấn vào biểu tượng trái tim trên các thẻ tour khi khám phá để lưu lại những chuyến đi yêu thích tại đây!
          </p>
          <Link to="/search" className={styles.browseBtn}>
            Khám phá tour ngay
          </Link>
        </div>
      ) : (
        <>
          <div className={styles.grid}>
            {favorites.map((tour) => (
              <TourCard
                key={tour.id}
                tour={tour}
                isFavoriteInitial={true}
                onFavoriteChange={(isFav) => handleFavoriteChange(tour.id, isFav)}
              />
            ))}
          </div>

          {totalPages > 1 && (
            <div className={styles.pagination}>
              <button
                type="button"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                className={styles.pageBtn}
              >
                ← Trang trước
              </button>
              <span className={styles.pageInfo}>
                Trang {page} / {totalPages}
              </span>
              <button
                type="button"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                className={styles.pageBtn}
              >
                Trang sau →
              </button>
            </div>
          )}
        </>
      )}
    </div>
  )
}
