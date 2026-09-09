import { useEffect, useRef, useState } from 'react'
import { Navigate } from 'react-router-dom'
import { adminApi } from '@/api'
import { useAuthStore } from '@/stores/auth'
import type { AdminBooking, AdminBookingDetail, AdminDashboard, AdminUser, AdminUserDetail, Booking, PaginatedResponse, Tour } from '@/types'
import styles from './Admin.module.css'
import { getFutureScheduleRows, getNextAvailableScheduleDate, getTomorrowIsoDate, isFutureScheduleDate, normalizeScheduleDate } from '@/utils/schedule'

type AdminTab = 'overview' | 'tours' | 'users' | 'bookings'
type TourFilters = { destination: string; travelType: 'all' | 'domestic' | 'international'; minPrice: string; maxPrice: string; duration: string }
type TourForm = Pick<Tour, 'name' | 'destination' | 'price' | 'duration' | 'description' | 'image_url' | 'season' | 'duration_label' | 'original_price' | 'highlights' | 'places' | 'topics' | 'itinerary' | 'included' | 'excluded' | 'schedule' | 'transport'>

const MAX_TOUR_GALLERY_IMAGES = 60

const tabLabels: Record<AdminTab, string> = { overview: 'T\u1ed5ng quan', tours: 'Qu\u1ea3n l\u00fd tour', users: 'Ng\u01b0\u1eddi d\u00f9ng', bookings: '\u0110\u1eb7t tour' }

const bookingStatusLabels: Record<Booking['status'], string> = {
  pending_payment: 'Ch\u1edd thanh to\u00e1n',
  paid: '\u0110\u00e3 thanh to\u00e1n',
  confirmed: '\u0110\u00e3 x\u00e1c nh\u1eadn',
  cancelled: '\u0110\u00e3 h\u1ee7y',
  expired: '\u0110\u00e3 h\u1ebft h\u1ea1n',
  refunded: '\u0110\u00e3 ho\u00e0n ti\u1ec1n',
}

const paymentStatusLabels: Record<Booking['payment_status'], string> = {
  pending: 'Ch\u01b0a thanh to\u00e1n',
  paid: '\u0110\u00e3 thanh to\u00e1n',
  failed: 'Thanh to\u00e1n l\u1ed7i',
  refunded: '\u0110\u00e3 ho\u00e0n ti\u1ec1n',
}

const emptyTour: TourForm = {
  name: '',
  destination: '',
  price: 0,
  duration: 1,
  description: '',
  image_url: '',
  season: '',
  duration_label: '',
  original_price: 0,
  highlights: [],
  places: [],
  topics: [],
  itinerary: [],
  included: [],
  excluded: [],
  schedule: [],
  transport: { airline: '', vehicle: [] },
}

const linesToArray = (value: string) => value.split('\n').map((line) => line.trim()).filter(Boolean)
const arrayToLines = (value?: string[]) => (value || []).join('\n')
const updateListField = (field: 'highlights' | 'places' | 'topics' | 'included' | 'excluded', value: string, setTourForm: React.Dispatch<React.SetStateAction<TourForm>>) => {
  setTourForm((current) => ({ ...current, [field]: linesToArray(value) }))
}

const formatErrorValue = (value: unknown): string | null => {
  if (typeof value === 'string' && value.trim()) return value

  if (Array.isArray(value)) {
    const messages = value.flatMap((item) => {
      if (typeof item === 'string' && item.trim()) return [item]
      if (!item || typeof item !== 'object') return []
      const issue = item as { path?: unknown; message?: unknown }
      if (typeof issue.message !== 'string' || !issue.message.trim()) return []
      const path = Array.isArray(issue.path) ? issue.path.join('.') : ''
      return [path ? `${path}: ${issue.message}` : issue.message]
    })
    if (messages.length) return messages.join(' ')
  }

  if (value && typeof value === 'object') {
    const payload = value as { message?: unknown; formErrors?: unknown; fieldErrors?: unknown }
    if (typeof payload.message === 'string' && payload.message.trim()) return payload.message

    const messages: string[] = []
    if (Array.isArray(payload.formErrors)) {
      messages.push(...payload.formErrors.filter((message): message is string => typeof message === 'string' && Boolean(message.trim())))
    }
    if (payload.fieldErrors && typeof payload.fieldErrors === 'object') {
      Object.entries(payload.fieldErrors).forEach(([field, fieldMessages]) => {
        if (!Array.isArray(fieldMessages)) return
        fieldMessages.forEach((message) => {
          if (typeof message === 'string' && message.trim()) messages.push(`${field}: ${message}`)
        })
      })
    }
    if (messages.length) return messages.join(' ')
  }

  return null
}

const getErrorMessage = (error: unknown) => {
  const response = error as { response?: { data?: { error?: unknown; message?: unknown } } }
  const apiMessage = formatErrorValue(response.response?.data?.error)
    || formatErrorValue(response.response?.data?.message)
  if (apiMessage) return apiMessage
  if (error instanceof Error && error.message) return error.message
  return 'Có lỗi xảy ra, vui lòng thử lại.'
}

const formatDate = (value?: string | null, withTime = false) => value ? new Intl.DateTimeFormat('vi-VN', withTime ? { dateStyle: 'medium', timeStyle: 'short' } : { dateStyle: 'medium' }).format(new Date(value)) : '—'
const formatPrice = (value?: number) => new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND', maximumFractionDigits: 0 }).format(value || 0)

type RichTextEditorProps = { value: string; onChange: (value: string) => void }

function RichTextEditor({ value, onChange }: RichTextEditorProps) {
  const editorRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (editorRef.current && editorRef.current.innerHTML !== value) editorRef.current.innerHTML = value || ''
  }, [value])

  const runCommand = (command: string, commandValue?: string) => {
    editorRef.current?.focus()
    document.execCommand(command, false, commandValue)
    onChange(editorRef.current?.innerHTML || '')
  }

  const handleDescriptionImage = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file || !['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 5 * 1024 * 1024) return
    const url = await adminApi.uploadTourImage(file)
    editorRef.current?.focus()
    document.execCommand('insertImage', false, url)
    onChange(editorRef.current?.innerHTML || '')
  }

  return (
    <div className={styles.richEditor}>
      <div className={styles.richToolbar} role="toolbar" aria-label="Định dạng mô tả">
        <button type="button" onClick={() => runCommand('bold')} title="In đậm"><strong>B</strong></button>
        <button type="button" onClick={() => runCommand('italic')} title="In nghiêng"><em>I</em></button>
        <button type="button" onClick={() => runCommand('underline')} title="Gạch chân"><u>U</u></button>
        <select defaultValue="p" onChange={(event) => runCommand('formatBlock', event.target.value)} aria-label="Kiểu đoạn"><option value="p">Đoạn văn</option><option value="h3">Tiêu đề</option><option value="blockquote">Trích dẫn</option></select>
        <button type="button" onClick={() => runCommand('insertUnorderedList')} title="Danh sách">☷</button>
        <button type="button" onClick={() => runCommand('insertOrderedList')} title="Danh sách số">1.</button>
        <label className={styles.colorPicker} title="Màu chữ">A<input type="color" defaultValue="#0f172a" onChange={(event) => runCommand('foreColor', event.target.value)} /></label>
        <label className={styles.richImageButton} title="Chèn ảnh">Ảnh<input type="file" accept="image/jpeg,image/png,image/webp" onChange={handleDescriptionImage} /></label>
      </div>
      <div ref={editorRef} className={styles.richContent} contentEditable suppressContentEditableWarning onInput={() => onChange(editorRef.current?.innerHTML || '')} data-placeholder="Nhập nội dung mô tả tour..." />
    </div>
  )
}
export function AdminPage() {
  const { user } = useAuthStore()
  const [tab, setTab] = useState<AdminTab>('overview')
  const [dashboard, setDashboard] = useState<AdminDashboard | null>(null)
  const [tours, setTours] = useState<PaginatedResponse<Tour> | null>(null)
  const [users, setUsers] = useState<PaginatedResponse<AdminUser> | null>(null)
  const [bookings, setBookings] = useState<PaginatedResponse<AdminBooking> | null>(null)
  const [search, setSearch] = useState('')
  const [submittedSearch, setSubmittedSearch] = useState('')
  const [tourPage, setTourPage] = useState(1)
  const [tourFilters, setTourFilters] = useState<TourFilters>({ destination: '', travelType: 'all', minPrice: '', maxPrice: '', duration: '' })
  const [submittedTourFilters, setSubmittedTourFilters] = useState<TourFilters>({ destination: '', travelType: 'all', minPrice: '', maxPrice: '', duration: '' })
  const [userPage, setUserPage] = useState(1)
  const [bookingPage, setBookingPage] = useState(1)
  const [bookingStatusFilter, setBookingStatusFilter] = useState<'all' | Booking['status']>('all')
  const [bookingPaymentFilter, setBookingPaymentFilter] = useState<'all' | Booking['payment_status']>('all')
  const [userRoleFilter, setUserRoleFilter] = useState<'all' | 'user' | 'admin'>('all')
  const [userStatusFilter, setUserStatusFilter] = useState<'all' | 'active' | 'inactive'>('all')
  const [userDetail, setUserDetail] = useState<AdminUserDetail | null>(null)
  const [bookingDetail, setBookingDetail] = useState<AdminBookingDetail | null>(null)
  const [userAction, setUserAction] = useState<{ kind: 'delete' | 'role' | 'status'; target: AdminUser; role?: 'user' | 'admin'; is_active?: boolean } | null>(null)
  const [userActionLoading, setUserActionLoading] = useState(false)
  const [editingTour, setEditingTour] = useState<Tour | null>(null)
  const [deletingTour, setDeletingTour] = useState<Tour | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [tourFormOpen, setTourFormOpen] = useState(false)
  const [tourForm, setTourForm] = useState<TourForm>(emptyTour)
  const [tourImages, setTourImages] = useState<Array<{ file?: File; url: string }>>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [notice, setNotice] = useState('')
  const [error, setError] = useState('')

  const loadDashboard = async () => {
    const data = await adminApi.getDashboard()
    setDashboard(data)
  }

  const loadTab = async (target: AdminTab, query = submittedSearch) => {
    if (target === 'tours') {
      const filters = submittedTourFilters
      setTours(await adminApi.getTours({
        page: tourPage,
        limit: 20,
        search: query || undefined,
        destination: filters.destination || undefined,
        travelType: filters.travelType,
        minPrice: filters.minPrice ? Number(filters.minPrice) : undefined,
        maxPrice: filters.maxPrice ? Number(filters.maxPrice) : undefined,
        duration: filters.duration ? Number(filters.duration) : undefined,
      }))
    }
    if (target === 'users') setUsers(await adminApi.getUsers({ page: userPage, limit: 20, search: query || undefined, role: userRoleFilter, isActive: userStatusFilter }))
    if (target === 'bookings') setBookings(await adminApi.getBookings({ page: bookingPage, limit: 20, search: query || undefined, status: bookingStatusFilter, paymentStatus: bookingPaymentFilter }))
  }

  const refresh = async (target = tab) => {
    setLoading(true)
    setError('')
    try {
      if (target === 'overview') await loadDashboard()
      else await loadTab(target)
    } catch (err) {
      setError(getErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (user?.role === 'admin') void refresh('overview')
  }, [user?.role])

  useEffect(() => {
    if (user?.role === 'admin' && tab !== 'overview') void refresh(tab)
  }, [tab, submittedSearch, submittedTourFilters, tourPage, userPage, bookingPage, bookingStatusFilter, bookingPaymentFilter, userRoleFilter, userStatusFilter, user?.role])

  if (!user || user.role !== 'admin') return <Navigate to="/" replace />

  const selectTab = (next: AdminTab) => {
    setTab(next)
    setError('')
    setNotice('')
  }

  const submitSearch = (event: React.FormEvent) => {
    event.preventDefault()
    if (tab === 'tours') setTourPage(1)
    if (tab === 'users') setUserPage(1)
    if (tab === 'bookings') setBookingPage(1)
    setSubmittedSearch(search.trim())
  }

  const submitTourFilters = (event: React.FormEvent) => {
    event.preventDefault()
    setTourPage(1)
    setSubmittedTourFilters({ ...tourFilters })
  }

  const changeTourPage = (nextPage: number) => {
    if (!tours?.pagination.totalPages) return
    setTourPage(Math.max(1, Math.min(nextPage, tours.pagination.totalPages)))
  }

  const changeUserPage = (nextPage: number) => {
    if (!users?.pagination.totalPages) return
    setUserPage(Math.max(1, Math.min(nextPage, users.pagination.totalPages)))
  }

  const startCreate = () => {
    setEditingTour(null)
    setTourForm(emptyTour)
    setTourImages([])
    setTourFormOpen(true)
    setNotice('')
  }

  const closeTourForm = () => {
    if (saving) return
    setTourFormOpen(false)
    setEditingTour(null)
    setTourForm(emptyTour)
    setTourImages([])
  }

  const startEdit = (tour: Tour) => {
    setEditingTour(tour)
    setTourForm({
      name: tour.name,
      destination: tour.destination,
      price: tour.price,
      duration: tour.duration,
      description: tour.description || '',
      image_url: tour.image_url || '',
      season: tour.season || '',
       duration_label: tour.duration_label || '',
       original_price: tour.original_price || 0,
       highlights: tour.highlights || [],
       places: tour.places || [],
       topics: tour.topics || [],
       itinerary: tour.itinerary || [],
       included: tour.included || [],
       excluded: tour.excluded || [],
        schedule: getFutureScheduleRows(tour.schedule),
       transport: {
         airline: tour.transport?.airline || '',
         vehicle: tour.transport?.vehicle || [],
       },
    })
    setTourImages((tour.gallery?.length ? tour.gallery : (tour.image_url ? [tour.image_url] : [])).map((url) => ({ url })))
    setTourFormOpen(true)
  }

  const handleTourImageChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || [])
    if (!files.length) return
    const validFiles = files.filter((file) => ['image/jpeg', 'image/png', 'image/webp'].includes(file.type) && file.size <= 5 * 1024 * 1024)
    const availableSlots = Math.max(0, MAX_TOUR_GALLERY_IMAGES - tourImages.length)
    const acceptedFiles = validFiles.slice(0, availableSlots)
    if (validFiles.length !== files.length) {
      setError('Chỉ nhận ảnh JPG, PNG, WEBP và mỗi ảnh tối đa 5MB.')
    } else if (validFiles.length > availableSlots) {
      setError(`Mỗi tour được chọn tối đa ${MAX_TOUR_GALLERY_IMAGES} ảnh.`)
    } else {
      setError('')
    }
    setTourImages((current) => [...current, ...acceptedFiles.map((file) => ({ file, url: URL.createObjectURL(file) }))].slice(0, MAX_TOUR_GALLERY_IMAGES))
    event.target.value = ''
  }

  const removeTourImage = (index: number) => {
    setTourImages((current) => current.filter((_, imageIndex) => imageIndex !== index))
  }

  const addItineraryDay = () => {
    setTourForm((current) => ({
      ...current,
      itinerary: [...(current.itinerary || []), { day: `Ng?y ${(current.itinerary || []).length + 1}`, content: [], meal: '', images: [] }],
    }))
  }

  const updateItineraryDay = (index: number, patch: Partial<NonNullable<TourForm['itinerary']>[number]>) => {
    setTourForm((current) => ({
      ...current,
      itinerary: (current.itinerary || []).map((day, dayIndex) => dayIndex === index ? { ...day, ...patch } : day),
    }))
  }

  const removeItineraryDay = (index: number) => {
    setTourForm((current) => ({ ...current, itinerary: (current.itinerary || []).filter((_, dayIndex) => dayIndex !== index) }))
  }

  const addScheduleRow = () => {
    setTourForm((current) => ({
      ...current,
      schedule: [...(current.schedule || []), { date: getNextAvailableScheduleDate(current.schedule), price: current.price, available: true }],
    }))
  }

  const changeBookingPage = (nextPage: number) => {
    if (!bookings?.pagination.totalPages) return
    setBookingPage(Math.max(1, Math.min(nextPage, bookings.pagination.totalPages)))
  }

  const updateScheduleRow = (index: number, patch: Partial<NonNullable<TourForm['schedule']>[number]>) => {
    setTourForm((current) => ({
      ...current,
      schedule: (current.schedule || []).map((row, rowIndex) => rowIndex === index ? { ...row, ...patch } : row),
    }))
  }

  const removeScheduleRow = (index: number) => {
    setTourForm((current) => ({ ...current, schedule: (current.schedule || []).filter((_, rowIndex) => rowIndex !== index) }))
  }

  const saveTour = async (event: React.FormEvent) => {
    event.preventDefault()
    setSaving(true)
    setError('')
    try {
       const scheduleRows = tourForm.schedule || []
       const normalizedDates = scheduleRows.map((row) => normalizeScheduleDate(row.date))
       if (normalizedDates.some((date) => !date || !isFutureScheduleDate(date))) {
         throw new Error('Mỗi ngày khởi hành phải là một ngày trong tương lai.')
       }
       if (new Set(normalizedDates).size !== normalizedDates.length) {
         throw new Error('Ngày khởi hành không được trùng nhau.')
       }
       const uploadedUrls = await Promise.all(tourImages.map((image) => image.file ? adminApi.uploadTourImage(image.file) : Promise.resolve(image.url)))
       const gallery = uploadedUrls.filter(Boolean)
       if (!gallery.length) throw new Error('Vui lòng chọn ít nhất một ảnh gallery.')
       const payload = {
         ...tourForm,
         schedule: getFutureScheduleRows(scheduleRows),
         image_url: gallery[0] || '',
         gallery,
         transport: {
           airline: tourForm.transport?.airline || '',
           vehicle: tourForm.transport?.vehicle || [],
         },
       }
       if (editingTour) await adminApi.updateTour(editingTour.id, payload)
       else await adminApi.createTour(payload)
      setNotice(editingTour ? 'Đã cập nhật tour.' : 'Đã thêm tour mới.')
       setTourFormOpen(false)
       setEditingTour(null)
       setTourForm(emptyTour)
       setTourImages([])
      await loadTab('tours')
      await loadDashboard()
    } catch (err) {
      setError(getErrorMessage(err))
    } finally {
      setSaving(false)
    }
  }

  const deleteTour = (tour: Tour) => {
    setDeletingTour(tour)
    setError('')
  }

  const confirmDeleteTour = async () => {
    if (!deletingTour) return
    setDeleting(true)
    setError('')
    try {
      await adminApi.deleteTour(deletingTour.id)
      setDeletingTour(null)
      setNotice('Đã xóa tour.')
      await loadTab('tours')
      await loadDashboard()
    } catch (err) {
      setError(getErrorMessage(err))
    } finally {
      setDeleting(false)
    }
  }

  const updateRole = (target: AdminUser, role: 'user' | 'admin') => {
    if (target.role === role) return
    setUserAction({ kind: 'role', target, role })
  }

  const updateStatus = (target: AdminUser, is_active: boolean) => {
    if (target.is_active === is_active) return
    setUserAction({ kind: 'status', target, is_active })
  }

  const deleteUser = (target: AdminUser) => {
    setUserAction({ kind: 'delete', target })
  }

  const confirmUserAction = async () => {
    if (!userAction) return
    setUserActionLoading(true)
    setError('')
    try {
      if (userAction.kind === 'delete') await adminApi.deleteUser(userAction.target.id)
      if (userAction.kind === 'role' && userAction.role) await adminApi.updateUserRole(userAction.target.id, userAction.role)
      if (userAction.kind === 'status' && userAction.is_active !== undefined) await adminApi.updateUserStatus(userAction.target.id, userAction.is_active)
      setUserAction(null)
      setNotice(userAction.kind === 'delete' ? 'Đã xóa tài khoản.' : 'Đã cập nhật tài khoản.')
      await loadTab('users')
      if (userDetail?.id === userAction.target.id) setUserDetail(await adminApi.getUserDetail(userAction.target.id))
      await loadDashboard()
    } catch (err) {
      setError(getErrorMessage(err))
    } finally {
      setUserActionLoading(false)
    }
  }

  const openUserDetail = async (target: AdminUser) => {
    try {
      setError('')
      setUserDetail(await adminApi.getUserDetail(target.id))
    } catch (err) {
      setError(getErrorMessage(err))
    }
  }

  const openBookingDetail = async (target: AdminBooking) => {
    try {
      setError('')
      setBookingDetail(await adminApi.getBookingDetail(target.id))
    } catch (err) {
      setError(getErrorMessage(err))
    }
  }

  return (
    <div className={styles.page}>
      <aside className={styles.sidebar}>
        <div className={styles.brand}><span className={styles.brandMark}>T</span><div><strong>TourAI</strong><small>Admin console</small></div></div>
        <div className={styles.sidebarLabel}>QUAN LY WEBSITE</div>
        <nav className={styles.sidebarNav} aria-label="Admin navigation">
          {([['overview', tabLabels.overview, '01'], ['tours', tabLabels.tours, '02'], ['bookings', tabLabels.bookings, '03'], ['users', tabLabels.users, '04']] as Array<[AdminTab, string, string]>).map(([key, label, icon]) => (
            <button key={key} type="button" className={tab === key ? styles.navItemActive : styles.navItem} onClick={() => selectTab(key)}>
              <span className={styles.navIcon}>{icon}</span><span>{label}</span>
            </button>
          ))}
        </nav>
        <div className={styles.sidebarFooter}><small>Dang dang nhap</small><strong>{user.name}</strong><span>{user.email}</span></div>
      </aside>

      <main className={styles.workspace}>
        <header className={styles.topbar}><div><span className={styles.breadcrumb}>Admin / {tabLabels[tab]}</span><h1>{'Qu\u1ea3n tr\u1ecb website'}</h1></div><button className={styles.refreshButton} type="button" onClick={() => void refresh()} disabled={loading}>{loading ? 'Dang tai...' : 'Lam moi du lieu'}</button></header>
        <section className={styles.hero}><div><p className={styles.eyebrow}>TOURAI CONTROL CENTER</p><p className={styles.subtitle}>{'Theo d\u00f5i d\u1eef li\u1ec7u v\u00e0 \u0111i\u1ec1u h\u00e0nh n\u1ed9i dung tour trong m\u1ed9t n\u01a1i.'}</p></div></section>
        {notice && <div className={styles.notice}>{notice}</div>}
        {error && <div className={styles.error}>{error}</div>}


      {tab === 'overview' && dashboard && (
        <section className={styles.content}>
          <div className={styles.statGrid}>
            {[
              ['Tour', dashboard.counts.tours, 'Nội dung đang hiển thị'],
              ['Người dùng', dashboard.counts.users, 'Tài khoản trong hệ thống'],
              ['Đánh giá', dashboard.counts.reviews, 'Phản hồi từ khách'],
              ['Lượt yêu thích', dashboard.counts.favorites, 'Tín hiệu quan tâm'],
              ['Tương tác', dashboard.counts.actions, 'Click, save, search'],
              ['Tin nhắn AI', dashboard.counts.messages, 'Lịch sử tư vấn'],
            ].map(([label, value, hint]) => (
              <article className={styles.statCard} key={label as string}>
                <span>{label}</span><strong>{value}</strong><small>{hint}</small>
              </article>
            ))}
          </div>
          <div className={styles.twoColumns}>
            <section className={styles.panel}><div className={styles.panelHeader}><h2>Điểm đến nhiều tour</h2><span>Top 6</span></div><div className={styles.destinationList}>{dashboard.top_destinations.map((item) => <div className={styles.destinationRow} key={item.destination}><span>{item.destination}</span><strong>{item.count}</strong></div>)}</div></section>
            <section className={styles.panel}><div className={styles.panelHeader}><h2>Tài khoản mới</h2><span>Gần đây</span></div><div className={styles.activityList}>{dashboard.recent_users.map((item) => <div className={styles.activityRow} key={item.id}><div><strong>{item.name}</strong><span>{item.email}</span></div><small>{formatDate(item.created_at)}</small></div>)}</div></section>
          </div>
        </section>
      )}

      {tab !== 'overview' && (
        <section className={styles.content}>
          <div className={styles.toolbar}>
            <form onSubmit={submitSearch} className={styles.searchForm}><input aria-label="Tìm trong dữ liệu quản trị" value={search} onChange={(event) => setSearch(event.target.value)} placeholder={tab === 'tours' ? 'Tìm tên tour hoặc điểm đến' : tab === 'bookings' ? 'Tìm mã đơn, khách hàng hoặc tour' : 'Tìm tên, email hoặc nội dung'} /><button type="submit">Tìm kiếm</button></form>
          </div>

          
           {tab === 'tours' && <form className={styles.tourFilters} onSubmit={submitTourFilters}>
             <div className={styles.filterField}><label htmlFor="admin-tour-type">Phân loại</label><select id="admin-tour-type" value={tourFilters.travelType} onChange={(event) => setTourFilters({ ...tourFilters, travelType: event.target.value as TourFilters['travelType'] })}><option value="all">Tất cả trong và ngoài nước</option><option value="domestic">Tour trong nước</option><option value="international">Tour nước ngoài</option></select></div>
             <div className={styles.filterField}><label htmlFor="admin-tour-destination">Điểm đến</label><input id="admin-tour-destination" value={tourFilters.destination} onChange={(event) => setTourFilters({ ...tourFilters, destination: event.target.value })} placeholder="Ví dụ: Đà Lạt" /></div>
             <div className={styles.filterField}><label htmlFor="admin-tour-max-price">Giá tối đa</label><input id="admin-tour-max-price" type="number" min="0" value={tourFilters.maxPrice} onChange={(event) => setTourFilters({ ...tourFilters, maxPrice: event.target.value })} placeholder="VND" /></div>
             <div className={styles.filterField}><label htmlFor="admin-tour-duration">Số ngày</label><select id="admin-tour-duration" value={tourFilters.duration} onChange={(event) => setTourFilters({ ...tourFilters, duration: event.target.value })}><option value="">Tất cả</option>{[1, 2, 3, 4, 5, 6, 7].map((day) => <option value={day} key={day}>{day} ngày</option>)}</select></div>
             <button className={styles.filterButton} type="submit">Lọc tour</button>
           </form>}

{tab === 'tours' && <div className={styles.tourListPanel}>
            <div className={styles.listHeader}>
              <div><h2>Danh sách tour</h2><span>{tours?.pagination.total || 0} tour trong hệ thống</span></div>
              <button className={styles.primaryButton} type="button" onClick={startCreate}>+ Thêm tour</button>
            </div>
            <div className={styles.tourCards}>
              {tours?.data.map((tour) => <article className={styles.tourCard} key={tour.id} tabIndex={0}>
                <div className={styles.tourCardImage}>{tour.image_url ? <img src={tour.image_url} alt={tour.name} /> : <div className={styles.tourPlaceholder}>T</div>}
                  <div className={styles.tourCardActions}>
                    <button type="button" className={styles.cardActionEdit} onClick={() => startEdit(tour)} aria-label={`Sửa ${tour.name}`} />
                    <button type="button" className={styles.cardActionDelete} onClick={() => void deleteTour(tour)} aria-label={`Xóa ${tour.name}`} />
                  </div>
                </div>
                <div className={styles.tourCardBody}>
                  <div className={styles.tourCardMeta}><span>{tour.destination}</span></div>
                  <h3>{tour.name}</h3>
                  <div className={styles.tourCardFooter}><strong>{formatPrice(tour.price)}</strong><span>{tour.duration} ngày</span></div>
                </div>
              </article>)}
              {!tours?.data.length && <div className={styles.emptyState}>Chưa có tour nào phù hợp.</div>}
            </div>
          </div>}

          
           {tab === 'tours' && tours && tours.pagination.totalPages > 1 && <div className={styles.pagination}>
             <button type="button" className={styles.paginationArrow} onClick={() => changeTourPage(tourPage - 1)} disabled={tourPage <= 1} aria-label="Trang tr??c">&#8592;</button>
             <label className={styles.pagePicker}><span>Trang</span><input className={styles.pageInput} type="number" min="1" max={tours.pagination.totalPages} value={tourPage} aria-label="Nh?p s? trang" onChange={(event) => { const page = Number(event.target.value); if (page >= 1) changeTourPage(page) }} /><span>/ {tours.pagination.totalPages}</span></label>
             <button type="button" className={styles.paginationArrow} onClick={() => changeTourPage(tourPage + 1)} disabled={tourPage >= tours.pagination.totalPages} aria-label="Trang sau">&#8594;</button>
           </div>}


           {deletingTour && <div className={styles.modalBackdrop} role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !deleting) setDeletingTour(null) }}>
             <section className={styles.confirmModal} role="dialog" aria-modal="true" aria-labelledby="delete-tour-title">
               <div className={styles.confirmIcon} aria-hidden="true">!</div>
               <div className={styles.confirmContent}><span className={styles.modalEyebrow}>XÁC NHẬN XÓA</span><h2 id="delete-tour-title">Xóa tour này?</h2><p>Bạn có chắc muốn xóa <strong>{deletingTour.name}</strong>? Dữ liệu tour sẽ bị xóa khỏi hệ thống.</p></div>
               <div className={styles.confirmActions}><button type="button" className={styles.secondaryButton} onClick={() => setDeletingTour(null)} disabled={deleting}>Hủy</button><button type="button" className={styles.dangerButton} onClick={() => void confirmDeleteTour()} disabled={deleting}>{deleting ? 'Đang xóa...' : 'Xóa tour'}</button></div>
             </section>
           </div>}

{tab === 'tours' && tourFormOpen && <div className={styles.modalBackdrop} role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) closeTourForm() }}>
            <section className={styles.modal} role="dialog" aria-modal="true" aria-labelledby="tour-form-title">
              <div className={styles.modalHeader}><div><span className={styles.modalEyebrow}>{editingTour ? 'CHỈNH SỬA TOUR' : 'TOUR MỚI'}</span><h2 id="tour-form-title">{editingTour ? 'Chỉnh sửa tour' : 'Thêm tour mới'}</h2></div><button type="button" className={styles.modalClose} onClick={closeTourForm} aria-label="Đóng">×</button></div>
              <form className={styles.formGrid} onSubmit={saveTour}>
                <label>Tên tour<input required value={tourForm.name} onChange={(event) => setTourForm({ ...tourForm, name: event.target.value })} /></label>
                <label>Điểm đến<input required value={tourForm.destination} onChange={(event) => setTourForm({ ...tourForm, destination: event.target.value })} /></label>
                <label>Giá<input required type="number" min="0" value={tourForm.price} onChange={(event) => setTourForm({ ...tourForm, price: Number(event.target.value) })} /></label>
                <label>Số ngày<input required type="number" min="1" value={tourForm.duration} onChange={(event) => setTourForm({ ...tourForm, duration: Number(event.target.value) })} /></label>
                <label>Mùa/nhóm tour<input required value={tourForm.season || ''} onChange={(event) => setTourForm({ ...tourForm, season: event.target.value })} /></label>
                <label className={styles.imageField}>Ảnh tour
                  <div className={styles.imagePicker}><div className={styles.imageGrid}>{tourImages.map((image, index) => <div className={styles.imageThumb} key={`${image.url}-${index}`}><img src={image.url} alt={`Ảnh tour ${index + 1}`} /><button type="button" onClick={() => removeTourImage(index)} aria-label={`Xóa ảnh ${index + 1}`}>×</button></div>)}</div><label className={styles.fileButton}>Chọn nhiều ảnh<input type="file" accept="image/jpeg,image/png,image/webp" multiple onChange={handleTourImageChange} /></label></div>
                  <small>JPG, PNG hoặc WEBP · tối đa 5MB/ảnh · tối đa {MAX_TOUR_GALLERY_IMAGES} ảnh</small>
                </label>
                 <label className={styles.fullField}>Mô tả<RichTextEditor value={tourForm.description || ''} onChange={(description) => setTourForm({ ...tourForm, description })} /></label>
                



                 <details className={styles.advancedSection}>
                   <summary>Thông tin nâng cao <span>(tùy chọn)</span></summary>
                   <div className={styles.advancedGrid}>
                     <label>Nhãn thời lượng<input value={tourForm.duration_label || ''} placeholder="Ví dụ: 3N2Đ" onChange={(event) => setTourForm({ ...tourForm, duration_label: event.target.value })} /></label>
                     <label>Giá gốc<input type="number" min="0" value={tourForm.original_price || ''} placeholder="Không bắt buộc" onChange={(event) => setTourForm({ ...tourForm, original_price: event.target.value ? Number(event.target.value) : 0 })} /></label>
                     <label className={styles.fullField}>Điểm nổi bật <small>Mỗi dòng một nội dung</small><textarea rows={4} value={arrayToLines(tourForm.highlights)} placeholder="Ví dụ: Tham quan Bà Nà Hills" onChange={(event) => updateListField('highlights', event.target.value, setTourForm)} /></label>
                     <label>Điểm tham quan <small>Mỗi dòng một địa điểm</small><textarea rows={4} value={arrayToLines(tourForm.places)} placeholder="Hội An / Bà Nà Hills" onChange={(event) => updateListField('places', event.target.value, setTourForm)} /></label>
                     <label>Chủ đề/trải nghiệm <small>Mỗi dòng một mục</small><textarea rows={4} value={arrayToLines(tourForm.topics)} placeholder="Nghỉ dưỡng / Ẩm thực" onChange={(event) => updateListField('topics', event.target.value, setTourForm)} /></label>
                     <label>Đã bao gồm <small>Mỗi dòng một mục</small><textarea rows={4} value={arrayToLines(tourForm.included)} placeholder="Xe đưa đón / Bữa ăn theo lịch trình" onChange={(event) => updateListField('included', event.target.value, setTourForm)} /></label>
                     <label>Chưa bao gồm <small>Mỗi dòng một mục</small><textarea rows={4} value={arrayToLines(tourForm.excluded)} placeholder="Chi phí cá nhân / Đồ uống" onChange={(event) => updateListField('excluded', event.target.value, setTourForm)} /></label>

                     <div className={styles.fullField}>
                       <div className={styles.optionalHeader}><div><strong>Lịch trình từng ngày</strong><small>Không bắt buộc; thêm các ngày nếu dữ liệu có sẵn.</small></div><button type="button" className={styles.smallButton} onClick={addItineraryDay}>+ Thêm ngày</button></div>
                       <div className={styles.repeatableList}>{(tourForm.itinerary || []).map((day, index) => <div className={styles.repeatableCard} key={`${day.day}-${index}`}>
                         <div className={styles.repeatableHeader}><strong>{day.day || `Ngày ${index + 1}`}</strong><button type="button" className={styles.removeButton} onClick={() => removeItineraryDay(index)}>Xóa</button></div>
                         <div className={styles.inlineFields}><label>Ngày<input value={day.day} placeholder={`Ngày ${index + 1}`} onChange={(event) => updateItineraryDay(index, { day: event.target.value })} /></label><label>Bữa ăn<input value={day.meal || ''} placeholder="Ví dụ: Sáng, trưa" onChange={(event) => updateItineraryDay(index, { meal: event.target.value })} /></label></div>
                         <label>Nội dung trong ngày <small>Mỗi dòng một hoạt động</small><textarea rows={3} value={arrayToLines(day.content)} onChange={(event) => updateItineraryDay(index, { content: linesToArray(event.target.value) })} /></label>
                       </div>)}</div>
                     </div>

                     <div className={styles.fullField}>
                       <div className={styles.optionalHeader}><div><strong>Lịch khởi hành</strong><small>Chỉ chọn ngày từ ngày mai trở đi; ngày đã qua không hiển thị.</small></div><button type="button" className={styles.smallButton} onClick={addScheduleRow}>+ Thêm lịch</button></div>
                       <div className={styles.repeatableList}>{(tourForm.schedule || []).map((row, index) => <div className={styles.scheduleRow} key={`${row.date}-${index}`}><input aria-label={`Ngày khởi hành ${index + 1}`} type="date" min={getTomorrowIsoDate()} required value={row.date} onChange={(event) => updateScheduleRow(index, { date: event.target.value })} /><input aria-label={`Giá lịch ${index + 1}`} type="number" min="0" placeholder="Giá" value={row.price || ''} onChange={(event) => updateScheduleRow(index, { price: event.target.value ? Number(event.target.value) : 0 })} /><label className={styles.checkboxLabel}><input type="checkbox" checked={row.available} onChange={(event) => updateScheduleRow(index, { available: event.target.checked })} /> Còn chỗ</label><button type="button" className={styles.removeButton} onClick={() => removeScheduleRow(index)}>Xóa</button></div>)}</div>
                     </div>

                     <label>Hãng hàng không<input value={tourForm.transport?.airline || ''} placeholder="Nếu có" onChange={(event) => setTourForm({ ...tourForm, transport: { ...(tourForm.transport || {}), airline: event.target.value } })} /></label>
                     <label>Phương tiện <small>Mỗi dòng một phương tiện</small><textarea rows={3} value={arrayToLines(tourForm.transport?.vehicle)} placeholder="Xe du lịch / Máy bay" onChange={(event) => setTourForm({ ...tourForm, transport: { ...(tourForm.transport || {}), vehicle: linesToArray(event.target.value) } })} /></label>
                   </div>
                 </details>
<div className={styles.modalActions}><button type="button" className={styles.secondaryButton} onClick={closeTourForm}>Hủy</button><button className={styles.primaryButton} type="submit" disabled={saving}>{saving ? 'Đang lưu...' : editingTour ? 'Lưu thay đổi' : 'Tạo tour'}</button></div>
              </form>
            </section>
          </div>}

          {tab === 'bookings' && <>
            <section className={styles.panel}>
              <div className={styles.panelHeader}>
                <div><h2>Lịch sử đặt tour</h2><span>{bookings?.pagination.total || 0} đơn trong hệ thống</span></div>
                <div className={styles.userFilters}>
                  <select aria-label="Lọc trạng thái đơn" value={bookingStatusFilter} onChange={(event) => { setBookingPage(1); setBookingStatusFilter(event.target.value as 'all' | Booking['status']) }}>
                    <option value="all">Tất cả trạng thái đơn</option>
                    {Object.entries(bookingStatusLabels).map(([value, label]) => <option value={value} key={value}>{label}</option>)}
                  </select>
                  <select aria-label="Lọc trạng thái thanh toán" value={bookingPaymentFilter} onChange={(event) => { setBookingPage(1); setBookingPaymentFilter(event.target.value as 'all' | Booking['payment_status']) }}>
                    <option value="all">Tất cả thanh toán</option>
                    {Object.entries(paymentStatusLabels).map(([value, label]) => <option value={value} key={value}>{label}</option>)}
                  </select>
                </div>
              </div>
              <div className={styles.tableWrap}><table className={styles.bookingTable}><thead><tr><th>Mã đơn</th><th>Khách hàng</th><th>Tour / khởi hành</th><th>Số khách</th><th>Tổng tiền</th><th>Trạng thái</th><th>Ngày tạo</th><th /></tr></thead><tbody>
                {bookings?.data.map((item) => <tr key={item.id}>
                  <td><strong>{item.booking_code}</strong><small>{item.payment_code}</small></td>
                  <td><strong>{item.user_name}</strong><small>{item.user_email}</small></td>
                  <td><strong className={styles.bookingTourName}>{item.tour_name}</strong><small>{item.destination} · {formatDate(item.departure_date)}</small></td>
                  <td>{item.guest_count}</td>
                  <td><strong className={styles.amountCell}>{formatPrice(item.total_amount)}</strong></td>
                  <td><div className={styles.bookingStatuses}><span className={`${styles.statusBadge} ${item.payment_status === 'paid' ? styles.statusPaid : styles.statusPending}`}>{paymentStatusLabels[item.payment_status]}</span><small>{bookingStatusLabels[item.status]}</small></div></td>
                  <td>{formatDate(item.created_at, true)}</td>
                  <td><button type="button" className={styles.detailButton} onClick={() => void openBookingDetail(item)}>Chi tiết</button></td>
                </tr>)}
              </tbody></table></div>
              {!bookings?.data.length && <div className={styles.emptyState}>Không tìm thấy đơn đặt tour phù hợp.</div>}
            </section>
            {bookings && bookings.pagination.totalPages > 1 && <div className={styles.pagination}><button type="button" className={styles.paginationArrow} onClick={() => changeBookingPage(bookingPage - 1)} disabled={bookingPage <= 1} aria-label="Trang trước">&#8592;</button><label className={styles.pagePicker}><span>Trang</span><input className={styles.pageInput} type="number" min="1" max={bookings.pagination.totalPages} value={bookingPage} aria-label="Nhập số trang đặt tour" onChange={(event) => { const nextPage = Number(event.target.value); if (nextPage >= 1) changeBookingPage(nextPage) }} /><span>/ {bookings.pagination.totalPages}</span></label><button type="button" className={styles.paginationArrow} onClick={() => changeBookingPage(bookingPage + 1)} disabled={bookingPage >= bookings.pagination.totalPages} aria-label="Trang sau">&#8594;</button></div>}
          </>}

          {tab === 'users' && <>
            <section className={styles.panel}>
              <div className={styles.panelHeader}><div><h2>Người dùng</h2><span>{users?.pagination.total || 0} tài khoản</span></div><div className={styles.userFilters}><select aria-label="Lọc theo quyền" value={userRoleFilter} onChange={(event) => { setUserPage(1); setUserRoleFilter(event.target.value as 'all' | 'user' | 'admin') }}><option value="all">Tất cả quyền</option><option value="user">Người dùng</option><option value="admin">Quản trị viên</option></select><select aria-label="Lọc theo trạng thái" value={userStatusFilter} onChange={(event) => { setUserPage(1); setUserStatusFilter(event.target.value as 'all' | 'active' | 'inactive') }}><option value="all">Tất cả trạng thái</option><option value="active">Đang hoạt động</option><option value="inactive">Đã khóa</option></select></div></div>
              <div className={styles.tableWrap}><table><thead><tr><th>Người dùng</th><th>Quyền</th><th>Trạng thái</th><th>Tương tác</th><th>Ngày tạo</th><th>Thao tác</th></tr></thead><tbody>{users?.data.map((item) => <tr key={item.id}>
                <td><strong>{item.name}</strong><small>{item.email}</small></td>
                <td><select value={item.role} onChange={(event) => updateRole(item, event.target.value as 'user' | 'admin')} disabled={item.id === user.id}><option value="user">Người dùng</option><option value="admin">Quản trị viên</option></select></td>
                <td><select className={item.is_active ? styles.statusActive : styles.statusInactive} value={item.is_active ? 'active' : 'inactive'} onChange={(event) => updateStatus(item, event.target.value === 'active')} disabled={item.id === user.id}><option value="active">Đang hoạt động</option><option value="inactive">Đã khóa</option></select></td>
                <td><div className={styles.userMetrics}><span>&#9829; {item.favorite_count || 0}</span><span>&#9889; {item.action_count || 0}</span><span>&#9733; {item.review_count || 0}</span></div></td>
                <td>{formatDate(item.created_at)}</td>
                <td><div className={styles.rowActions}><button type="button" onClick={() => void openUserDetail(item)}>Chi tiết</button><button type="button" className={styles.dangerText} onClick={() => deleteUser(item)} disabled={item.id === user.id}>Xóa</button></div></td>
              </tr>)}</tbody></table></div>
              {!users?.data.length && <div className={styles.emptyState}>Không tìm thấy tài khoản phù hợp.</div>}
              {users && users.pagination.totalPages > 1 && <div className={styles.pagination}><button type="button" className={styles.paginationArrow} onClick={() => changeUserPage(userPage - 1)} disabled={userPage <= 1} aria-label="Trang trước">&#8592;</button><label className={styles.pagePicker}><span>Trang</span><input className={styles.pageInput} type="number" min="1" max={users.pagination.totalPages} value={userPage} aria-label="Nhập số trang người dùng" onChange={(event) => { const page = Number(event.target.value); if (page >= 1) changeUserPage(page) }} /><span>/ {users.pagination.totalPages}</span></label><button type="button" className={styles.paginationArrow} onClick={() => changeUserPage(userPage + 1)} disabled={userPage >= users.pagination.totalPages} aria-label="Trang sau">&#8594;</button></div>}
            </section>
          </>}

          {bookingDetail && <div className={styles.modalBackdrop} role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setBookingDetail(null) }}><section className={styles.userDetailModal} role="dialog" aria-modal="true" aria-labelledby="booking-detail-title"><div className={styles.modalHeader}><div><span className={styles.modalEyebrow}>CHI TIẾT ĐẶT TOUR</span><h2 id="booking-detail-title">{bookingDetail.booking_code}</h2><p className={styles.detailEmail}>{bookingDetail.user_name} · {bookingDetail.user_email}</p></div><button type="button" className={styles.modalClose} onClick={() => setBookingDetail(null)} aria-label="Đóng"><span aria-hidden="true">&#215;</span></button></div><div className={styles.userDetailStats}><div><strong>{formatPrice(bookingDetail.total_amount)}</strong><span>Tổng tiền</span></div><div><strong>{bookingDetail.guest_count}</strong><span>Số khách</span></div><div><strong>{formatDate(bookingDetail.departure_date)}</strong><span>Khởi hành</span></div><div><strong className={`${styles.statusBadge} ${bookingDetail.payment_status === 'paid' ? styles.statusPaid : styles.statusPending}`}>{paymentStatusLabels[bookingDetail.payment_status]}</strong><span>Thanh toán</span></div></div><div className={styles.detailGrid}><section><h3>Thông tin đơn</h3><ul className={styles.detailList}><li><strong>Tour</strong><span>{bookingDetail.tour_name}</span></li><li><strong>Điểm đến</strong><span>{bookingDetail.destination}</span></li><li><strong>Trạng thái đơn</strong><span>{bookingStatusLabels[bookingDetail.status]}</span></li><li><strong>Ngày tạo</strong><span>{formatDate(bookingDetail.created_at, true)}</span></li><li><strong>Mã thanh toán</strong><span>{bookingDetail.payment_code}</span></li></ul></section><section><h3>Thông tin liên hệ</h3><ul className={styles.detailList}><li><strong>{bookingDetail.contact_name}</strong><span>{bookingDetail.contact_email}</span></li><li><strong>Số điện thoại</strong><span>{bookingDetail.contact_phone}</span></li>{bookingDetail.note && <li><strong>Ghi chú</strong><span>{bookingDetail.note}</span></li>}</ul></section><section className={styles.detailFull}><h3>Lịch sử giao dịch</h3>{bookingDetail.payments.length ? <ul className={styles.detailList}>{bookingDetail.payments.map((payment) => <li key={payment.id}><strong>{payment.provider.toUpperCase()} · {formatPrice(payment.transfer_amount)}</strong><span>Mã giao dịch: {payment.provider_transaction_id || '—'} · {formatDate(payment.paid_at, true)}</span>{payment.reference_code && <span>Mã tham chiếu: {payment.reference_code}</span>}</li>)}</ul> : <p className={styles.detailEmpty}>Chưa ghi nhận giao dịch thanh toán.</p>}</section></div></section></div>}

          {userDetail && <div className={styles.modalBackdrop} role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setUserDetail(null) }}><section className={styles.userDetailModal} role="dialog" aria-modal="true" aria-labelledby="user-detail-title"><div className={styles.modalHeader}><div><span className={styles.modalEyebrow}>HỒ SƠ NGƯỜI DÙNG</span><h2 id="user-detail-title">{userDetail.name}</h2><p className={styles.detailEmail}>{userDetail.email}</p></div><button type="button" className={styles.modalClose} onClick={() => setUserDetail(null)} aria-label="Đóng"><span aria-hidden="true">&#215;</span></button></div><div className={styles.userDetailStats}><div><strong>{userDetail.favorite_count || 0}</strong><span>Yêu thích</span></div><div><strong>{userDetail.action_count || 0}</strong><span>Tương tác</span></div><div><strong>{userDetail.review_count || 0}</strong><span>Đánh giá</span></div><div><strong>{userDetail.chat_session_count || 0}</strong><span>Cuộc chat</span></div></div><div className={styles.detailGrid}><section><h3>Tour yêu thích</h3>{userDetail.favorites.length ? <ul className={styles.detailList}>{userDetail.favorites.slice(0, 6).map((favorite) => <li key={favorite.id}><strong>{favorite.name}</strong><span>{favorite.destination} &#183; {formatPrice(favorite.price)}</span></li>)}</ul> : <p className={styles.detailEmpty}>Chưa có tour yêu thích.</p>}</section><section className={styles.detailFull}><h3>Đánh giá đã viết</h3>{userDetail.reviews.length ? <ul className={styles.detailList}>{userDetail.reviews.map((review) => <li key={review.id}><strong>{review.tour_name} &#183; {review.rating}/10</strong><span>{review.content}</span></li>)}</ul> : <p className={styles.detailEmpty}>Chưa có đánh giá.</p>}</section></div></section></div>}

          {userAction && <div className={styles.modalBackdrop} role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !userActionLoading) setUserAction(null) }}><section className={styles.confirmModal} role="dialog" aria-modal="true" aria-labelledby="user-action-title"><div className={styles.confirmIcon} aria-hidden="true">!</div><div className={styles.confirmContent}><span className={styles.modalEyebrow}>XÁC NHẬN THAY ĐỔI</span><h2 id="user-action-title">{userAction.kind === 'delete' ? 'Xóa tài khoản?' : userAction.kind === 'status' ? (userAction.is_active ? 'Mở khóa tài khoản?' : 'Khóa tài khoản?') : 'Đổi quyền tài khoản?'}</h2><p>{userAction.kind === 'delete' ? <>Tài khoản <strong>{userAction.target.email}</strong> sẽ bị xóa khỏi hệ thống.</> : userAction.kind === 'status' ? <>Bạn muốn {userAction.is_active ? 'mở khóa' : 'khóa'} tài khoản <strong>{userAction.target.email}</strong>?</> : <>Đổi quyền của <strong>{userAction.target.email}</strong> thành <strong>{userAction.role === 'admin' ? 'Quản trị viên' : 'Người dùng'}</strong>?</>}</p></div><div className={styles.confirmActions}><button type="button" className={styles.secondaryButton} onClick={() => setUserAction(null)} disabled={userActionLoading}>Hủy</button><button type="button" className={styles.dangerButton} onClick={() => void confirmUserAction()} disabled={userActionLoading}>{userActionLoading ? 'Đang xử lý...' : 'Xác nhận'}</button></div></section></div>}

        </section>
      )}
        </main>
    </div>








  )
}






