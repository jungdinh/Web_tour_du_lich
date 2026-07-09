import { useState, useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import { tourApi } from '@/api'
import { TourCard } from '@/components/TourCard'
import type { Tour } from '@/types'
import styles from './Search.module.css'

const DESTINATIONS = [
  'Hồ Chí Minh', 'Hà Nội', 'Đà Nẵng', 'Nha Trang', 'Phú Quốc',
  'Đà Lạt', 'Hội An', 'Huế', 'Cần Thơ', 'Vũng Tàu', 'Sa Pa'
]

const DURATIONS = [
  { value: 1, label: '1 ngày' },
  { value: 2, label: '2 ngày' },
  { value: 3, label: '3 ngày' },
  { value: 4, label: '4 ngày' },
  { value: 5, label: '5 ngày' },
]

const PRICE_RANGES = [
  { min: 0, max: 1000000, label: 'Dưới 1 triệu' },
  { min: 1000000, max: 3000000, label: '1 - 3 triệu' },
  { min: 3000000, max: 5000000, label: '3 - 5 triệu' },
  { min: 5000000, max: 10000000, label: '5 - 10 triệu' },
  { min: 10000000, max: 0, label: 'Trên 10 triệu' },
]

export function SearchPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const [tours, setTours] = useState<Tour[]>([])
  const [loading, setLoading] = useState(true)
  const [totalPages, setTotalPages] = useState(1)

  const query = searchParams.get('q') || ''
  const destination = searchParams.get('destination') || ''
  const duration = searchParams.get('duration') ? Number(searchParams.get('duration')) : undefined
  const minPrice = searchParams.get('minPrice') ? Number(searchParams.get('minPrice')) : undefined
  const maxPrice = searchParams.get('maxPrice') ? Number(searchParams.get('maxPrice')) : undefined
  const page = Number(searchParams.get('page') || '1')

  useEffect(() => {
    const fetchTours = async () => {
      setLoading(true)
      try {
        const params: Record<string, unknown> = { page, limit: 12 }
        if (query) params.q = query
        if (destination) params.destination = destination
        if (duration) params.duration = duration
        if (minPrice) params.minPrice = minPrice
        if (maxPrice) params.maxPrice = maxPrice

        const response = await tourApi.getTours(params as Parameters<typeof tourApi.getTours>[0])
        setTours(response.data)
        setTotalPages(response.pagination.totalPages)
      } catch (error) {
        console.error('Failed to fetch tours:', error)
      } finally {
        setLoading(false)
      }
    }
    fetchTours()
  }, [searchParams])

  const updateFilter = (key: string, value: string | undefined) => {
    const newParams = new URLSearchParams(searchParams)
    if (value) {
      newParams.set(key, value)
    } else {
      newParams.delete(key)
    }
    newParams.set('page', '1')
    setSearchParams(newParams)
  }

  const clearFilters = () => {
    setSearchParams({})
  }

  const hasFilters = query || destination || duration || minPrice || maxPrice

  return (
    <div className="container">
      <div className={styles.searchHeader}>
        <h1 className={styles.title}>Khám phá tour</h1>
        
        <div className={styles.searchBox}>
          <input
            type="search"
            placeholder="Tìm kiếm tour..."
            value={query}
            onChange={(e) => updateFilter('q', e.target.value || undefined)}
            className={styles.searchInput}
          />
        </div>
      </div>

      <div className={styles.filters}>
        <div className={styles.filterGroup}>
          <label className={styles.filterLabel}>Địa điểm</label>
          <select
            value={destination}
            onChange={(e) => updateFilter('destination', e.target.value || undefined)}
            className={styles.select}
          >
            <option value="">Tất cả</option>
            {DESTINATIONS.map((d) => (
              <option key={d} value={d}>{d}</option>
            ))}
          </select>
        </div>

        <div className={styles.filterGroup}>
          <label className={styles.filterLabel}>Số ngày</label>
          <select
            value={duration || ''}
            onChange={(e) => updateFilter('duration', e.target.value || undefined)}
            className={styles.select}
          >
            <option value="">Tất cả</option>
            {DURATIONS.map((d) => (
              <option key={d.value} value={d.value}>{d.label}</option>
            ))}
          </select>
        </div>

        <div className={styles.filterGroup}>
          <label className={styles.filterLabel}>Khoảng giá</label>
          <select
            value={minPrice && maxPrice ? `${minPrice}-${maxPrice}` : ''}
            onChange={(e) => {
              if (e.target.value) {
                const [min, max] = e.target.value.split('-').map(Number)
                updateFilter('minPrice', min.toString())
                updateFilter('maxPrice', max === 0 ? undefined : max.toString())
              } else {
                updateFilter('minPrice', undefined)
                updateFilter('maxPrice', undefined)
              }
            }}
            className={styles.select}
          >
            <option value="">Tất cả</option>
            {PRICE_RANGES.map((p) => (
              <option key={p.label} value={`${p.min}-${p.max}`}>{p.label}</option>
            ))}
          </select>
        </div>

        {hasFilters && (
          <button onClick={clearFilters} className={styles.clearBtn}>
            Xóa bộ lọc
          </button>
        )}
      </div>

      {loading ? (
        <div className={styles.loading}>Đang tải...</div>
      ) : tours.length === 0 ? (
        <div className={styles.empty}>
          <p>Không tìm thấy tour nào phù hợp.</p>
          <button onClick={clearFilters} className={styles.clearBtn}>
            Xóa bộ lọc
          </button>
        </div>
      ) : (
        <>
          <div className={styles.tourGrid}>
            {tours.map((tour) => (
              <TourCard key={tour.id} tour={tour} />
            ))}
          </div>

          {totalPages > 1 && (
            <div className={styles.pagination}>
              {page > 1 && (
                <button
                  onClick={() => updateFilter('page', (page - 1).toString())}
                  className={styles.pageBtn}
                >
                  ← Trang trước
                </button>
              )}
              <span className={styles.pageInfo}>
                Trang {page} / {totalPages}
              </span>
              {page < totalPages && (
                <button
                  onClick={() => updateFilter('page', (page + 1).toString())}
                  className={styles.pageBtn}
                >
                  Trang sau →
                </button>
              )}
            </div>
          )}
        </>
      )}
    </div>
  )
}
