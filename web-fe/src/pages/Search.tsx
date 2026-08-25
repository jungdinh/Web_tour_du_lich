import { useState, useEffect, useRef, type FormEvent } from 'react'
import { useSearchParams } from 'react-router-dom'
import { tourApi, actionApi } from '@/api'
import { useAuthStore } from '@/stores/auth'
import { TourCard, TourCardSkeleton } from '@/components/TourCard'
import type { Tour } from '@/types'
import styles from './Search.module.css'

const QUICK_TAGS = [
  'Đà Lạt',
  'Phú Quốc',
  'Nha Trang',
  'Đà Nẵng',
  'Sapa',
  'Hạ Long',
  'Thái Lan',
  'Hàn Quốc',
  'Nhật Bản',
  'Châu Âu',
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

const SORT_OPTIONS = [
  { value: 'popular', label: 'Phổ biến nhất' },
  { value: 'price_asc', label: 'Giá thấp đến cao' },
  { value: 'price_desc', label: 'Giá cao đến thấp' },
  { value: 'rating_desc', label: 'Đánh giá cao nhất' },
]

export function SearchPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const { token } = useAuthStore()
  const [tours, setTours] = useState<Tour[]>([])
  const [loading, setLoading] = useState(true)
  const [totalCount, setTotalCount] = useState(0)
  const [totalPages, setTotalPages] = useState(1)
  const [destinationOptions, setDestinationOptions] = useState<Array<{ name: string; tour_count: number }>>([])
  const [sortBy, setSortBy] = useState('popular')
  const loggedQuery = useRef<string | null>(null)

  const query = searchParams.get('q') || ''
  const [searchText, setSearchText] = useState(query)
  const destination = searchParams.get('destination') || ''
  const travelType = (searchParams.get('travelType') === 'international' ? 'international' : 'domestic') as 'domestic' | 'international'
  const duration = searchParams.get('duration') ? Number(searchParams.get('duration')) : undefined
  const minPrice = searchParams.get('minPrice') ? Number(searchParams.get('minPrice')) : undefined
  const maxPrice = searchParams.get('maxPrice') ? Number(searchParams.get('maxPrice')) : undefined
  const page = Number(searchParams.get('page') || '1')

  const [draftTravelType, setDraftTravelType] = useState<'domestic' | 'international'>(travelType)
  const [draftDestination, setDraftDestination] = useState(destination)
  const [draftDuration, setDraftDuration] = useState(duration ? duration.toString() : '')
  const [draftPriceRange, setDraftPriceRange] = useState(
    minPrice && maxPrice ? `${minPrice}-${maxPrice}` : minPrice ? `${minPrice}-0` : '',
  )

  useEffect(() => {
    setSearchText(query)
  }, [query])

  useEffect(() => {
    setDraftTravelType(travelType)
    setDraftDestination(destination)
    setDraftDuration(duration ? duration.toString() : '')
    setDraftPriceRange(minPrice && maxPrice ? `${minPrice}-${maxPrice}` : minPrice ? `${minPrice}-0` : '')
  }, [travelType, destination, duration, minPrice, maxPrice])

  useEffect(() => {
    tourApi
      .getDestinations(draftTravelType)
      .then(setDestinationOptions)
      .catch(() => setDestinationOptions([]))
  }, [draftTravelType])

  useEffect(() => {
    const fetchTours = async () => {
      setLoading(true)
      try {
        const params: Record<string, unknown> = { page, limit: 12 }
        if (query) params.q = query
        params.travelType = travelType
        if (destination) params.destination = destination
        if (duration) params.duration = duration
        if (minPrice) params.minPrice = minPrice
        if (maxPrice) params.maxPrice = maxPrice

        const response = await tourApi.getTours(params as Parameters<typeof tourApi.getTours>[0])
        
        let fetchedData = response.data || []
        
        // Client-side sort if needed
        if (sortBy === 'price_asc') {
          fetchedData = [...fetchedData].sort((a, b) => a.price - b.price)
        } else if (sortBy === 'price_desc') {
          fetchedData = [...fetchedData].sort((a, b) => b.price - a.price)
        } else if (sortBy === 'rating_desc') {
          fetchedData = [...fetchedData].sort((a, b) => (b.avg_rating || 0) - (a.avg_rating || 0))
        }

        setTours(fetchedData)
        setTotalCount(response.pagination.total || fetchedData.length)
        setTotalPages(response.pagination.totalPages || 1)
      } catch (error) {
        console.error('Failed to fetch tours:', error)
      } finally {
        setLoading(false)
      }
    }
    fetchTours()
  }, [searchParams, token, query, destination, travelType, duration, minPrice, maxPrice, page, sortBy])

  useEffect(() => {
    const searchSignal = (query || destination).trim()
    if (!token || searchSignal.length < 2 || loggedQuery.current === searchSignal) return

    const timer = window.setTimeout(() => {
      loggedQuery.current = searchSignal
      actionApi.logAction(undefined, 'search', searchSignal).catch(() => {})
    }, 700)

    return () => window.clearTimeout(timer)
  }, [token, query, destination])

  const updateTravelType = (nextTravelType: 'domestic' | 'international') => {
    setDraftTravelType(nextTravelType)
    setDraftDestination('')
    const newParams = new URLSearchParams(searchParams)
    newParams.set('travelType', nextTravelType)
    newParams.delete('destination')
    newParams.set('page', '1')
    setSearchParams(newParams)
  }

  const updateFilter = (key: string, value: string | undefined) => {
    const newParams = new URLSearchParams(searchParams)
    if (value) {
      newParams.set(key, value)
    } else {
      newParams.delete(key)
    }
    if (key !== 'page') {
      newParams.set('page', '1')
    }
    setSearchParams(newParams)
  }

  const applyFilters = () => {
    const newParams = new URLSearchParams(searchParams)
    newParams.set('travelType', draftTravelType)

    if (draftDestination) {
      newParams.set('destination', draftDestination)
    } else {
      newParams.delete('destination')
    }

    if (draftDuration) {
      newParams.set('duration', draftDuration)
    } else {
      newParams.delete('duration')
    }

    if (draftPriceRange) {
      const [min, max] = draftPriceRange.split('-')
      newParams.set('minPrice', min)
      if (max && max !== '0') {
        newParams.set('maxPrice', max)
      } else {
        newParams.delete('maxPrice')
      }
    } else {
      newParams.delete('minPrice')
      newParams.delete('maxPrice')
    }

    newParams.set('page', '1')
    setSearchParams(newParams)
  }

  const handleSearchSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const newParams = new URLSearchParams(searchParams)
    const nextQuery = searchText.trim()

    if (nextQuery) {
      newParams.set('q', nextQuery)
    } else {
      newParams.delete('q')
    }
    newParams.set('page', '1')
    setSearchParams(newParams)
  }

  const handleQuickTagClick = (tag: string) => {
    setSearchText(tag)
    const newParams = new URLSearchParams(searchParams)
    newParams.set('q', tag)
    newParams.set('page', '1')
    setSearchParams(newParams)
  }

  const handleResetFilters = () => {
    setSearchText('')
    setDraftDestination('')
    setDraftDuration('')
    setDraftPriceRange('')
    setSearchParams(new URLSearchParams({ travelType: 'domestic', page: '1' }))
  }

  const hasActiveFilters = Boolean(query || destination || duration || minPrice || maxPrice)

  return (
    <div className="container">
      {/* SEARCH HERO BANNER */}
      <div className={styles.heroBanner}>
        <div className={styles.heroContent}>
          <div className={styles.badgeRow}>
            <span className={styles.eyebrowBadge}>✨ Khám phá tour du lịch 2026</span>
          </div>
          <h1 className={styles.title}>Tìm kiếm hành trình mơ ước</h1>
          <p className={styles.subtitle}>
            Trải nghiệm hàng trăm tour du lịch được tuyển chọn và cá nhân hóa với sự hỗ trợ của AI
          </p>

          <form className={styles.searchBox} onSubmit={handleSearchSubmit}>
            <div className={styles.inputWrapper}>
              <span className={styles.searchIcon}>🔍</span>
              <input
                type="search"
                placeholder="Tìm điểm đến, tên tour, hoạt động yêu thích (ví dụ: Đà Lạt, Phú Quốc, Sapa)..."
                value={searchText}
                onChange={(e) => setSearchText(e.target.value)}
                className={styles.searchInput}
              />
              {searchText && (
                <button
                  type="button"
                  className={styles.clearInputBtn}
                  onClick={() => setSearchText('')}
                  title="Xóa tìm kiếm"
                >
                  ✕
                </button>
              )}
            </div>
            <button type="submit" className={styles.searchBtn}>
              Tìm kiếm
            </button>
          </form>

          {/* Quick Tags */}
          <div className={styles.quickTags}>
            <span className={styles.quickTagsLabel}>Gợi ý:</span>
            {QUICK_TAGS.map((tag) => (
              <button
                key={tag}
                type="button"
                className={`${styles.quickTagBtn} ${query === tag ? styles.quickTagActive : ''}`}
                onClick={() => handleQuickTagClick(tag)}
              >
                {tag}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* FILTER CONTROLS BAR */}
      <div className={styles.filterSection}>
        <div className={styles.filtersTopBar}>
          <div className={styles.travelTypeToggle}>
            <button
              type="button"
              className={draftTravelType === 'domestic' ? styles.travelTypeActive : styles.travelTypeBtn}
              onClick={() => updateTravelType('domestic')}
            >
              Trong nước
            </button>
            <button
              type="button"
              className={draftTravelType === 'international' ? styles.travelTypeActive : styles.travelTypeBtn}
              onClick={() => updateTravelType('international')}
            >
              Quốc tế
            </button>
          </div>

          <div className={styles.sortWrapper}>
            <label className={styles.sortLabel}>Sắp xếp:</label>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
              className={styles.sortSelect}
            >
              {SORT_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className={styles.filtersGrid}>
          <div className={styles.filterGroup}>
            <label className={styles.filterLabel}>📍 Điểm đến</label>
            <select
              value={draftDestination}
              onChange={(e) => setDraftDestination(e.target.value)}
              className={styles.select}
            >
              <option value="">Tất cả điểm đến</option>
              {destinationOptions.map((item) => (
                <option key={item.name} value={item.name}>
                  {item.name} ({item.tour_count})
                </option>
              ))}
            </select>
          </div>

          <div className={styles.filterGroup}>
            <label className={styles.filterLabel}>⏱ Thời gian</label>
            <select
              value={draftDuration}
              onChange={(e) => setDraftDuration(e.target.value)}
              className={styles.select}
            >
              <option value="">Tất cả thời lượng</option>
              {DURATIONS.map((d) => (
                <option key={d.value} value={d.value}>
                  {d.label}
                </option>
              ))}
            </select>
          </div>

          <div className={styles.filterGroup}>
            <label className={styles.filterLabel}>💰 Mức giá</label>
            <select
              value={draftPriceRange}
              onChange={(e) => setDraftPriceRange(e.target.value)}
              className={styles.select}
            >
              <option value="">Tất cả mức giá</option>
              {PRICE_RANGES.map((p) => (
                <option key={p.label} value={`${p.min}-${p.max}`}>
                  {p.label}
                </option>
              ))}
            </select>
          </div>

          <div className={styles.filterActions}>
            <button type="button" className={styles.filterBtn} onClick={applyFilters}>
              Lọc kết quả
            </button>
            {hasActiveFilters && (
              <button type="button" className={styles.resetBtn} onClick={handleResetFilters}>
                ✕ Đặt lại
              </button>
            )}
          </div>
        </div>
      </div>

      {/* RESULTS HEADER */}
      <div className={styles.resultsHeader}>
        <div className={styles.resultsCount}>
          <span className={styles.resultsPulseDot} />
          {loading ? (
            <span>Đang tìm kiếm tour...</span>
          ) : (
            <span>
              Tìm thấy <strong>{totalCount}</strong> tour phù hợp
            </span>
          )}
        </div>

        {hasActiveFilters && (
          <div className={styles.activePills}>
            {query && (
              <span className={styles.activePill}>
                Từ khóa: "{query}"
                <button type="button" onClick={() => updateFilter('q', undefined)}>✕</button>
              </span>
            )}
            {destination && (
              <span className={styles.activePill}>
                Điểm đến: {destination}
                <button type="button" onClick={() => updateFilter('destination', undefined)}>✕</button>
              </span>
            )}
            {duration && (
              <span className={styles.activePill}>
                Thời lượng: {duration} ngày
                <button type="button" onClick={() => updateFilter('duration', undefined)}>✕</button>
              </span>
            )}
          </div>
        )}
      </div>

      {/* TOUR GRID OR SKELETON */}
      {loading ? (
        <div className={styles.tourGrid}>
          {Array.from({ length: 8 }).map((_, idx) => (
            <TourCardSkeleton key={idx} />
          ))}
        </div>
      ) : tours.length === 0 ? (
        <div className={styles.empty}>
          <div className={styles.emptyIcon}>🏖️</div>
          <h3 className={styles.emptyTitle}>Không tìm thấy tour phù hợp</h3>
          <p className={styles.emptySubtitle}>
            Hãy thử thay đổi từ khóa, điều chỉnh khoảng giá hoặc xóa bộ lọc để xem nhiều tour hơn.
          </p>
          <button type="button" onClick={handleResetFilters} className={styles.emptyBtn}>
            Xem tất cả tour
          </button>
        </div>
      ) : (
        <>
          <div className={styles.tourGrid}>
            {tours.map((tour) => (
              <TourCard key={tour.id} tour={tour} />
            ))}
          </div>

          {/* PAGINATION */}
          {totalPages > 1 && (
            <div className={styles.pagination}>
              <button
                type="button"
                disabled={page <= 1}
                onClick={() => updateFilter('page', (page - 1).toString())}
                className={styles.pageBtn}
              >
                ← Trang trước
              </button>
              
              <div className={styles.pageIndicator}>
                Trang <strong>{page}</strong> / {totalPages}
              </div>

              <button
                type="button"
                disabled={page >= totalPages}
                onClick={() => updateFilter('page', (page + 1).toString())}
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
