import { useState, useEffect, useRef, type FormEvent } from 'react'
import { useSearchParams } from 'react-router-dom'
import {
  Search as SearchIcon,
  MapPin,
  Clock,
  BadgeDollarSign,
  Sparkles,
  X,
  RotateCcw,
  ChevronLeft,
  ChevronRight,
  Compass,
} from 'lucide-react'
import { tourApi, actionApi } from '@/api'
import { useAuthStore } from '@/stores/auth'
import { TourCard, TourCardSkeleton } from '@/components/TourCard'
import { useTourImagesReady } from '@/hooks/useTourImagesReady'
import type { Tour } from '@/types'
import { Dropdown } from '@/components/Dropdown'
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
  const imagesReady = useTourImagesReady(tours)

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

  const handleSearchSubmit = (event?: FormEvent<HTMLFormElement>) => {
    if (event) event.preventDefault()
    const newParams = new URLSearchParams(searchParams)
    const nextQuery = searchText.trim()

    if (nextQuery) {
      newParams.set('q', nextQuery)
    } else {
      newParams.delete('q')
    }

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
      {/* COMPACT UNIFIED SEARCH CARD */}
      <div className={styles.searchContainer}>
        {/* Top Header Row: Title & Travel Type Selector */}
        <div className={styles.searchHeaderRow}>
          <div className={styles.titleGroup}>
            <span className={styles.eyebrowBadge}>
              <Sparkles size={13} className={styles.sparkleIcon} />
              <span>Khám phá tour du lịch 2026</span>
            </span>
            <h1 className={styles.pageTitle}>Tìm kiếm hành trình mơ ước</h1>
          </div>

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
        </div>

        {/* Compound Search Bar */}
        <form className={styles.compoundBar} onSubmit={handleSearchSubmit}>
          {/* Keyword Input */}
          <div className={styles.barFieldKeyword}>
            <label className={styles.fieldLabel}>
              <SearchIcon size={14} className={styles.fieldIcon} />
              <span>Từ khóa / Tour</span>
            </label>
            <div className={styles.fieldInputWrapper}>
              <input
                type="search"
                placeholder="Tên tour, hoạt động, trải nghiệm..."
                value={searchText}
                onChange={(e) => setSearchText(e.target.value)}
                className={styles.barInput}
              />
              {searchText && (
                <button
                  type="button"
                  className={styles.clearInputBtn}
                  onClick={() => setSearchText('')}
                  title="Xóa tìm kiếm"
                >
                  <X size={12} />
                </button>
              )}
            </div>
          </div>

          <div className={styles.barDivider} />

          {/* Destination Dropdown */}
          <div className={styles.barField}>
            <label className={styles.fieldLabel}>
              <MapPin size={14} className={styles.fieldIcon} />
              <span>Điểm đến</span>
            </label>
            <Dropdown
              className={styles.barDropdown}
              value={draftDestination}
              onChange={(val) => setDraftDestination(val)}
              options={[
                { value: '', label: 'Tất cả điểm đến' },
                ...destinationOptions.map((item) => ({
                  value: item.name,
                  label: `${item.name} (${item.tour_count})`,
                })),
              ]}
            />
          </div>

          <div className={styles.barDivider} />

          {/* Duration Dropdown */}
          <div className={styles.barField}>
            <label className={styles.fieldLabel}>
              <Clock size={14} className={styles.fieldIcon} />
              <span>Thời gian</span>
            </label>
            <Dropdown
              className={styles.barDropdown}
              value={draftDuration}
              onChange={(val) => setDraftDuration(val)}
              options={[
                { value: '', label: 'Tất cả thời lượng' },
                ...DURATIONS.map((d) => ({ value: String(d.value), label: d.label })),
              ]}
            />
          </div>

          <div className={styles.barDivider} />

          {/* Price Range Dropdown */}
          <div className={styles.barField}>
            <label className={styles.fieldLabel}>
              <BadgeDollarSign size={14} className={styles.fieldIcon} />
              <span>Mức giá</span>
            </label>
            <Dropdown
              className={styles.barDropdown}
              value={draftPriceRange}
              onChange={(val) => setDraftPriceRange(val)}
              options={[
                { value: '', label: 'Tất cả mức giá' },
                ...PRICE_RANGES.map((p) => ({ value: `${p.min}-${p.max}`, label: p.label })),
              ]}
            />
          </div>

          {/* Action CTA Button */}
          <button type="submit" className={styles.barSubmitBtn} title="Tìm kiếm tour">
            <SearchIcon size={18} />
            <span>Tìm kiếm</span>
          </button>
        </form>

        {/* Quick Suggestion Chips & Reset */}
        <div className={styles.quickTagsBar}>
          <div className={styles.quickTagsList}>
            <span className={styles.quickTagsLabel}>Gợi ý phổ biến:</span>
            {QUICK_TAGS.map((tag) => (
              <button
                key={tag}
                type="button"
                className={`${styles.quickTagChip} ${query === tag ? styles.quickTagChipActive : ''}`}
                onClick={() => handleQuickTagClick(tag)}
              >
                {tag}
              </button>
            ))}
          </div>

          {hasActiveFilters && (
            <button type="button" className={styles.resetBtn} onClick={handleResetFilters}>
              <RotateCcw size={13} />
              <span>Đặt lại bộ lọc</span>
            </button>
          )}
        </div>
      </div>

      {/* RESULTS HEADER (WITH INLINE SORT) */}
      <div className={styles.resultsHeader}>
        <div className={styles.resultsInfo}>
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
                  <span>Từ khóa: "{query}"</span>
                  <button type="button" onClick={() => updateFilter('q', undefined)} aria-label="Xóa từ khóa">
                    <X size={11} />
                  </button>
                </span>
              )}
              {destination && (
                <span className={styles.activePill}>
                  <span>Điểm đến: {destination}</span>
                  <button type="button" onClick={() => updateFilter('destination', undefined)} aria-label="Xóa điểm đến">
                    <X size={11} />
                  </button>
                </span>
              )}
              {duration && (
                <span className={styles.activePill}>
                  <span>Thời lượng: {duration} ngày</span>
                  <button type="button" onClick={() => updateFilter('duration', undefined)} aria-label="Xóa thời lượng">
                    <X size={11} />
                  </button>
                </span>
              )}
            </div>
          )}
        </div>

        <div className={styles.sortWrapper}>
          <label className={styles.sortLabel}>Sắp xếp:</label>
          <Dropdown
            className={styles.sortSelect}
            value={sortBy}
            onChange={(val) => setSortBy(val)}
            options={SORT_OPTIONS}
          />
        </div>
      </div>

      {/* TOUR GRID OR SKELETON */}
      {loading || !imagesReady ? (
        <div className={styles.tourGrid}>
          {Array.from({ length: tours.length || 8 }).map((_, idx) => (
            <TourCardSkeleton key={idx} compactOnMobile />
          ))}
        </div>
      ) : tours.length === 0 ? (
        <div className={styles.empty}>
          <div className={styles.emptyIcon}>
            <Compass size={48} className={styles.compassIcon} />
          </div>
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
              <TourCard key={tour.id} tour={tour} compactOnMobile />
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
                <ChevronLeft size={16} />
                <span>Trang trước</span>
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
                <span>Trang sau</span>
                <ChevronRight size={16} />
              </button>
            </div>
          )}
        </>
      )}
    </div>
  )
}
