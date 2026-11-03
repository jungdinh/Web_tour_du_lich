import { useEffect, useRef, useState } from 'react'
import { Navigate, NavLink, useLocation, useNavigate } from 'react-router-dom'
import {
  LayoutDashboard,
  Compass,
  CalendarCheck,
  Users,
  ExternalLink,
  Plus,
  List,
  LayoutGrid,
  Pencil,
  Trash2,
  Copy,
  Check,
  Download,
  ChevronLeft,
  ChevronRight,
  Heart,
  Zap,
  Star,
  Sparkles,
  CreditCard,
  X,
  CheckSquare,
  Search as SearchIcon,
  BellRing,
  MessageSquareText,
} from 'lucide-react'
import { adminApi } from '@/api'
import { useAuthStore } from '@/stores/auth'
import type { AdminBooking, AdminBookingDetail, AdminDashboard, AdminUser, AdminUserDetail, Booking, PaginatedResponse, Tour } from '@/types'
import { Dropdown } from '@/components/Dropdown'
import { AdminNotificationsPanel } from '@/components/AdminNotificationsPanel'
import { AdminReviewsPanel } from '@/components/AdminReviewsPanel'
import styles from './Admin.module.css'
import { getFutureScheduleRows, getNextAvailableScheduleDate, getTomorrowIsoDate, isFutureScheduleDate, normalizeScheduleDate } from '@/utils/schedule'

type AdminTab = 'overview' | 'tours' | 'users' | 'bookings' | 'reviews' | 'notifications'
type TourFilters = { destination: string; travelType: 'all' | 'domestic' | 'international'; minPrice: string; maxPrice: string; duration: string }
type TourForm = Pick<Tour, 'name' | 'destination' | 'price' | 'duration' | 'description' | 'image_url' | 'season' | 'duration_label' | 'original_price' | 'highlights' | 'places' | 'topics' | 'tags' | 'itinerary' | 'included' | 'excluded' | 'schedule' | 'transport'>

const MAX_TOUR_GALLERY_IMAGES = 60
const tourTagCatalog = [
  { tag: 'family', label: 'Gia đình' },
  { tag: 'romantic', label: 'Cặp đôi' },
  { tag: 'adventure', label: 'Khám phá, mạo hiểm' },
  { tag: 'relax', label: 'Nghỉ dưỡng' },
  { tag: 'spiritual', label: 'Tâm linh' },
  { tag: 'beach', label: 'Biển, đảo' },
  { tag: 'mountain', label: 'Núi, cao nguyên' },
  { tag: 'nature', label: 'Thiên nhiên' },
  { tag: 'city', label: 'Thành phố' },
  { tag: 'culture', label: 'Văn hóa' },
  { tag: 'history', label: 'Lịch sử' },
  { tag: 'festival', label: 'Lễ hội' },
  { tag: 'photography', label: 'Chụp ảnh, check-in' },
  { tag: 'wildlife', label: 'Động vật hoang dã' },
  { tag: 'cruise', label: 'Du thuyền' },
  { tag: 'nightlife', label: 'Trải nghiệm về đêm' },
  { tag: 'water_sports', label: 'Thể thao dưới nước' },
  { tag: 'food', label: 'Ẩm thực' },
  { tag: 'shopping', label: 'Mua sắm' },
  { tag: 'budget', label: 'Tiết kiệm' },
  { tag: 'luxury', label: 'Cao cấp' },
] as const

const tabLabels: Record<AdminTab, string> = { overview: 'T\u1ed5ng quan', tours: 'Qu\u1ea3n l\u00fd tour', users: 'Ng\u01b0\u1eddi d\u00f9ng', bookings: '\u0110\u1eb7t tour', reviews: 'B\u00ecnh lu\u1eadn', notifications: 'Th\u00f4ng b\u00e1o' }
const adminTabPaths: Record<AdminTab, string> = {
  overview: '/admin/dashboard',
  tours: '/admin/tours',
  bookings: '/admin/bookings',
  users: '/admin/users',
  reviews: '/admin/reviews',
  notifications: '/admin/notifications',
}

const getAdminTabFromPath = (pathname: string): AdminTab | null => {
  const normalizedPath = pathname.replace(/\/+$/, '') || '/'
  const match = (Object.entries(adminTabPaths) as Array<[AdminTab, string]>).find(([, path]) => path === normalizedPath)
  return match?.[0] || null
}

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
  tags: [],
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
  const location = useLocation()
  const navigate = useNavigate()
  const matchedTab = getAdminTabFromPath(location.pathname)
  const tab = matchedTab || 'overview'
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
  const [passwordTarget, setPasswordTarget] = useState<AdminUser | null>(null)
  const [newUserPassword, setNewUserPassword] = useState('')
  const [confirmUserPassword, setConfirmUserPassword] = useState('')
  const [showNewUserPassword, setShowNewUserPassword] = useState(false)
  const [showConfirmUserPassword, setShowConfirmUserPassword] = useState(false)
  const [passwordActionLoading, setPasswordActionLoading] = useState(false)
  const [passwordActionError, setPasswordActionError] = useState('')
  const [editingTour, setEditingTour] = useState<Tour | null>(null)
  const [deletingTour, setDeletingTour] = useState<Tour | null>(null)
  const [selectedTours, setSelectedTours] = useState<number[]>([])
  const [selectionMode, setSelectionMode] = useState(false)
  const [tourViewMode, setTourViewMode] = useState<'table' | 'grid'>('table')
  const [copiedCode, setCopiedCode] = useState<string | null>(null)
  const [bulkDeleting, setBulkDeleting] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [tourFormOpen, setTourFormOpen] = useState(false)
  const [tourForm, setTourForm] = useState<TourForm>(emptyTour)
  const [tourImages, setTourImages] = useState<Array<{ file?: File; url: string }>>([])
  const [saving, setSaving] = useState(false)
  const [notice, setNotice] = useState('')
  const [error, setError] = useState('')

  const userPasswordRequirements = [
    { label: 'Từ 12 đến 24 ký tự', met: newUserPassword.length >= 12 && newUserPassword.length <= 24 },
    { label: 'Có ít nhất một chữ hoa (A-Z)', met: /[A-Z]/.test(newUserPassword) },
    { label: 'Có ít nhất một chữ số (0-9)', met: /\d/.test(newUserPassword) },
    { label: 'Có ít nhất một ký tự đặc biệt', met: /[^A-Za-z0-9]/.test(newUserPassword) },
  ]
  const userPasswordReady = userPasswordRequirements.every((requirement) => requirement.met)

  const handleCopyCode = async (code: string) => {
    try {
      await navigator.clipboard.writeText(code)
      setCopiedCode(code)
      setTimeout(() => setCopiedCode(null), 2000)
    } catch {
      // fallback
    }
  }

  const exportBookingsToCSV = () => {
    if (!bookings?.data.length) return
    const headers = [
      'Mã đơn',
      'Mã thanh toán',
      'Tên khách',
      'Email khách',
      'Số ĐT',
      'Tên tour',
      'Điểm đến',
      'Ngày khởi hành',
      'Số khách',
      'Tổng tiền (VNĐ)',
      'Trạng thái đơn',
      'Trạng thái thanh toán',
      'Ngày tạo',
    ]
    const rows = bookings.data.map((b) => [
      `"${b.booking_code}"`,
      `"${b.payment_code || ''}"`,
      `"${(b.user_name || b.contact_name || '').replace(/"/g, '""')}"`,
      `"${b.user_email || b.contact_email || ''}"`,
      `"${b.contact_phone || ''}"`,
      `"${(b.tour_name || '').replace(/"/g, '""')}"`,
      `"${(b.destination || '').replace(/"/g, '""')}"`,
      `"${b.departure_date ? b.departure_date.split('T')[0] : ''}"`,
      b.guest_count,
      b.total_amount,
      `"${bookingStatusLabels[b.status] || b.status}"`,
      `"${paymentStatusLabels[b.payment_status] || b.payment_status}"`,
      `"${b.created_at ? new Date(b.created_at).toLocaleString('vi-VN') : ''}"`,
    ])

    const csvContent = '\uFEFF' + [headers.join(','), ...rows.map((r) => r.join(','))].join('\n')
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.setAttribute('download', `danh-sach-don-tour-${new Date().toISOString().split('T')[0]}.csv`)
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
    setNotice('Đã xuất danh sách đơn đặt tour ra file CSV.')
  }

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
    setError('')
    try {
      if (target === 'overview') await loadDashboard()
      else await loadTab(target)
    } catch (err) {
      setError(getErrorMessage(err))
    }
  }

  useEffect(() => {
    if (user?.role === 'admin') void refresh('overview')
  }, [user?.role])

  useEffect(() => {
    if (user?.role === 'admin' && tab !== 'overview' && tab !== 'notifications' && tab !== 'reviews') void refresh(tab)
  }, [tab, submittedSearch, submittedTourFilters, tourPage, userPage, bookingPage, bookingStatusFilter, bookingPaymentFilter, userRoleFilter, userStatusFilter, user?.role])

  useEffect(() => {
    if (notice || error) {
      const timer = setTimeout(() => {
        setNotice('')
        setError('')
      }, 3000)
      return () => clearTimeout(timer)
    }
  }, [notice, error])

  if (!user || user.role !== 'admin') return <Navigate to="/" replace />
  if (!matchedTab) return <Navigate to={adminTabPaths.overview} replace />

  const selectTab = (next: AdminTab) => {
    navigate(adminTabPaths[next])
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
       tags: tour.tags || [],
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

  const toggleTourTag = (tag: string) => {
    setTourForm((current) => {
      const tags = current.tags || []
      const selected = tags.some((item) => item.tag === tag)
      return {
        ...current,
        tags: selected ? tags.filter((item) => item.tag !== tag) : [...tags, { tag, weight: 0.8 }],
      }
    })
  }

  const updateTourTagWeight = (tag: string, weight: number) => {
    setTourForm((current) => ({
      ...current,
      tags: (current.tags || []).map((item) => item.tag === tag ? { ...item, weight } : item),
    }))
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
       if (!tourForm.tags?.length) throw new Error('Vui lòng chọn ít nhất một hashtag AI cho tour.')
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

  const toggleSelectTour = (id: number) => {
    setSelectedTours(prev => prev.includes(id) ? prev.filter(t => t !== id) : [...prev, id])
  }

  const toggleSelectAllTours = () => {
    if (!tours) return
    if (selectedTours.length === tours.data.length) setSelectedTours([])
    else setSelectedTours(tours.data.map(t => t.id))
  }

  const confirmBulkDeleteTours = async () => {
    if (!selectedTours.length) return
    setDeleting(true)
    setError('')
    try {
      await adminApi.bulkDeleteTours(selectedTours)
      setNotice(`Đã xóa ${selectedTours.length} tour.`)
      setSelectedTours([])
      setBulkDeleting(false)
      await loadTab('tours')
      await loadDashboard()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Lỗi xóa nhiều tour')
    } finally {
      setDeleting(false)
    }
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

  const openPasswordDialog = (target: AdminUser) => {
    setPasswordTarget(target)
    setNewUserPassword('')
    setConfirmUserPassword('')
    setShowNewUserPassword(false)
    setShowConfirmUserPassword(false)
    setPasswordActionError('')
  }

  const closePasswordDialog = () => {
    if (passwordActionLoading) return
    setPasswordTarget(null)
    setNewUserPassword('')
    setConfirmUserPassword('')
    setPasswordActionError('')
  }

  const updateUserPassword = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!passwordTarget) return
    if (!userPasswordReady) {
      setPasswordActionError('Mật khẩu mới chưa đáp ứng đầy đủ yêu cầu bảo mật.')
      return
    }
    if (newUserPassword !== confirmUserPassword) {
      setPasswordActionError('Mật khẩu xác nhận không khớp.')
      return
    }

    setPasswordActionLoading(true)
    setPasswordActionError('')
    try {
      await adminApi.updateUserPassword(passwordTarget.id, newUserPassword)
      setNotice(`Đã cập nhật mật khẩu cho ${passwordTarget.email}.`)
      setPasswordTarget(null)
      setNewUserPassword('')
      setConfirmUserPassword('')
      await loadTab('users')
    } catch (err) {
      setPasswordActionError(getErrorMessage(err))
    } finally {
      setPasswordActionLoading(false)
    }
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
      if (userDetail?.id === userAction.target.id) setUserDetail(null)
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
        <div className={styles.brand}><span className={styles.brandMark}>V</span><div><strong>Vivu</strong><small>Admin console</small></div></div>
        <div className={styles.sidebarLabel}>QUẢN TRỊ VIÊN</div>
        <nav className={styles.sidebarNav} aria-label="Admin navigation">
          {([
            ['overview', tabLabels.overview, <LayoutDashboard size={18} key="overview" />],
            ['tours', tabLabels.tours, <Compass size={18} key="tours" />],
            ['bookings', tabLabels.bookings, <CalendarCheck size={18} key="bookings" />],
            ['users', tabLabels.users, <Users size={18} key="users" />],
            ['reviews', tabLabels.reviews, <MessageSquareText size={18} key='reviews' />],
            ['notifications', tabLabels.notifications, <BellRing size={18} key='notifications' />],
          ] as Array<[AdminTab, string, React.ReactNode]>).map(([key, label, icon]) => (
            <NavLink key={key} to={adminTabPaths[key]} className={tab === key ? styles.navItemActive : styles.navItem} onClick={() => { setError(''); setNotice('') }}>
              <span className={styles.navIcon}>{icon}</span><span>{label}</span>
            </NavLink>
          ))}
        </nav>
        <div className={styles.sidebarWebsiteWrap}>
          <a href="/" target="_blank" rel="noopener noreferrer" className={styles.sidebarWebsiteLink} title="Xem website ở tab mới">
            <ExternalLink size={15} />
            <span>Xem Website</span>
          </a>
        </div>
        <div className={styles.sidebarFooter}><small>Dang dang nhap</small><strong>{user.name}</strong><span>{user.email}</span></div>
      </aside>

      <main className={styles.workspace}>
        <header className={styles.topbar}><div><span className={styles.breadcrumb}>Admin / {tabLabels[tab]}</span><h1>{'Qu\u1ea3n tr\u1ecb website'}</h1></div></header>

        {notice && <div className={styles.notice}>{notice}</div>}
        {error && <div className={styles.error}>{error}</div>}


      {tab === 'overview' && dashboard && (
        <section className={styles.content}>

          <div className={styles.statGrid}>
            <article className={`${styles.statCard} ${styles.statCardHighlight}`}>
              <div className={styles.statCardHeader}>
                <span>Tổng doanh thu</span>
                <span className={styles.statIconBadge}><CreditCard size={18} /></span>
              </div>
              <strong className={styles.statRevenue}>{formatPrice(dashboard.counts.revenue || 0)}</strong>
              <small>Thanh toán thành công qua cổng</small>
            </article>

            <article className={styles.statCard}>
              <div className={styles.statCardHeader}>
                <span>Đơn đặt tour</span>
                <span className={styles.statIconBadge}><CalendarCheck size={18} /></span>
              </div>
              <strong>{dashboard.counts.bookings || 0}</strong>
              <small>{dashboard.counts.paid_bookings || 0} đơn đã thanh toán</small>
            </article>

            <article className={styles.statCard}>
              <div className={styles.statCardHeader}>
                <span>Tour hiển thị</span>
                <span className={styles.statIconBadge}><Compass size={18} /></span>
              </div>
              <strong>{dashboard.counts.tours}</strong>
              <small>Tour du lịch đang mở bán</small>
            </article>

            <article className={styles.statCard}>
              <div className={styles.statCardHeader}>
                <span>Người dùng</span>
                <span className={styles.statIconBadge}><Users size={18} /></span>
              </div>
              <strong>{dashboard.counts.users}</strong>
              <small>Tài khoản trên hệ thống</small>
            </article>

            <article className={styles.statCard}>
              <div className={styles.statCardHeader}>
                <span>Tư vấn AI</span>
                <span className={styles.statIconBadge}><Sparkles size={18} /></span>
              </div>
              <strong>{dashboard.counts.messages}</strong>
              <small>Tin nhắn hỏi đáp & gợi ý</small>
            </article>

            <article className={styles.statCard}>
              <div className={styles.statCardHeader}>
                <span>Tương tác & Đánh giá</span>
                <span className={styles.statIconBadge}><Zap size={18} /></span>
              </div>
              <strong>{dashboard.counts.actions + dashboard.counts.favorites}</strong>
              <small>{dashboard.counts.reviews} đánh giá từ khách</small>
            </article>
          </div>

          <div className={styles.twoColumns}>
            <section className={styles.panel}>
              <div className={styles.panelHeader}>
                <div>
                  <h2>Điểm đến & Bộ sưu tập nổi bật</h2>
                  <span>Phân bổ số lượng tour theo danh mục</span>
                </div>
                <span className={styles.panelBadge}>Top 6</span>
              </div>
              <div className={styles.destinationList}>
                {dashboard.top_destinations.map((item) => (
                  <div className={styles.destinationRow} key={item.destination}>
                    <span className={styles.destTitle}>{item.destination}</span>
                    <strong className={styles.destCount}>{item.count} tour</strong>
                  </div>
                ))}
              </div>
            </section>

            <section className={styles.panel}>
              <div className={styles.panelHeader}>
                <div>
                  <h2>Tài khoản mới đăng ký</h2>
                  <span>Người dùng gia nhập gần đây</span>
                </div>
                <button type="button" className={styles.ghostLink} onClick={() => selectTab('users')}>
                  Xem tất cả
                </button>
              </div>
              <div className={styles.activityList}>
                {dashboard.recent_users.map((item) => (
                  <div className={styles.recentUserRow} key={item.id}>
                    <div className={styles.userAvatar}>
                      {item.name ? item.name.charAt(0).toUpperCase() : 'U'}
                    </div>
                    <div className={styles.recentUserInfo}>
                      <div className={styles.recentUserNameRow}>
                        <strong>{item.name}</strong>
                        <span className={item.role === 'admin' ? styles.roleBadgeAdmin : styles.roleBadgeUser}>
                          {item.role === 'admin' ? 'Admin' : 'Thành viên'}
                        </span>
                      </div>
                      <span>{item.email}</span>
                    </div>
                    <small className={styles.userCreatedDate}>{formatDate(item.created_at)}</small>
                  </div>
                ))}
              </div>
            </section>
          </div>
        </section>
      )}

      {tab === 'notifications' ? <section className={styles.content}><AdminNotificationsPanel /></section> : null}
      {tab === 'reviews' ? <section className={styles.content}><AdminReviewsPanel /></section> : null}

      {tab !== 'overview' && tab !== 'notifications' && tab !== 'reviews' && (tab !== 'tours' || !tourFormOpen) && (
        <section className={styles.content}>
          <div className={styles.toolbar}>
            <form onSubmit={submitSearch} className={styles.searchForm}>
              <SearchIcon className={styles.searchIcon} size={18} />
              <input aria-label="Tìm trong dữ liệu quản trị" value={search} onChange={(event) => setSearch(event.target.value)} placeholder={tab === 'tours' ? 'Tìm tên tour hoặc điểm đến' : tab === 'bookings' ? 'Tìm mã đơn, khách hàng hoặc tour' : 'Tìm tên, email hoặc nội dung'} />
            </form>
            <div className={styles.globalFilters}>
              {tab === 'users' && (
                <>
                  <Dropdown className={styles.headerSelect} value={userRoleFilter} onChange={(val) => { setUserPage(1); setUserRoleFilter(val as 'all' | 'user' | 'admin') }} options={[{value: 'all', label: 'Tất cả quyền'}, {value: 'user', label: 'Người dùng'}, {value: 'admin', label: 'Quản trị viên'}]} />
                  <Dropdown className={styles.headerSelect} value={userStatusFilter} onChange={(val) => { setUserPage(1); setUserStatusFilter(val as 'all' | 'active' | 'inactive') }} options={[{value: 'all', label: 'Tất cả trạng thái'}, {value: 'active', label: 'Đang hoạt động'}, {value: 'inactive', label: 'Đã khóa'}]} />
                </>
              )}
              {tab === 'bookings' && (
                <>
                  <Dropdown className={styles.headerSelect} value={bookingStatusFilter} onChange={(val) => { setBookingPage(1); setBookingStatusFilter(val as 'all' | Booking['status']) }} options={[ {value: 'all', label: 'Tất cả trạng thái đơn'}, ...Object.entries(bookingStatusLabels).map(([val, label]) => ({value: val, label})) ]} />
                  <Dropdown className={styles.headerSelect} value={bookingPaymentFilter} onChange={(val) => { setBookingPage(1); setBookingPaymentFilter(val as 'all' | Booking['payment_status']) }} options={[ {value: 'all', label: 'Tất cả thanh toán'}, ...Object.entries(paymentStatusLabels).map(([val, label]) => ({value: val, label})) ]} />
                </>
              )}
            </div>
          </div>

          
           {tab === 'tours' && <form className={styles.tourFilters} onSubmit={submitTourFilters}>
             <div className={styles.filterField}><label htmlFor="admin-tour-type">Phân loại</label><select id="admin-tour-type" value={tourFilters.travelType} onChange={(event) => setTourFilters({ ...tourFilters, travelType: event.target.value as TourFilters['travelType'] })}><option value="all">Tất cả trong và ngoài nước</option><option value="domestic">Tour trong nước</option><option value="international">Tour nước ngoài</option></select></div>
             <div className={styles.filterField}><label htmlFor="admin-tour-destination">Điểm đến</label><input id="admin-tour-destination" value={tourFilters.destination} onChange={(event) => setTourFilters({ ...tourFilters, destination: event.target.value })} placeholder="Ví dụ: Đà Lạt" /></div>
             <div className={styles.filterField}><label htmlFor="admin-tour-max-price">Giá tối đa</label><input id="admin-tour-max-price" type="number" min="0" value={tourFilters.maxPrice} onChange={(event) => setTourFilters({ ...tourFilters, maxPrice: event.target.value })} placeholder="VND" /></div>
             <div className={styles.filterField}><label htmlFor="admin-tour-duration">Số ngày</label><select id="admin-tour-duration" value={tourFilters.duration} onChange={(event) => setTourFilters({ ...tourFilters, duration: event.target.value })}><option value="">Tất cả</option>{[1, 2, 3, 4, 5, 6, 7].map((day) => <option value={day} key={day}>{day} ngày</option>)}</select></div>
             <button className={styles.filterButton} type="submit">Lọc tour</button>
           </form>}

{tab === 'tours' && (
          <div className={styles.tourListPanel}>
            <div className={styles.listHeader}>
              <div>
                <h2>Danh sách tour</h2>
                <span>{tours?.pagination.total || 0} tour trong hệ thống</span>
              </div>
              <div className={styles.tourHeaderControls}>
                <div className={styles.viewToggleGroup}>
                  <button
                    type="button"
                    className={tourViewMode === 'table' ? styles.viewToggleActive : styles.viewToggle}
                    onClick={() => setTourViewMode('table')}
                    title="Chuyển sang dạng Bảng quản trị"
                  >
                    <List size={16} /> <span>Bảng</span>
                  </button>
                  <button
                    type="button"
                    className={tourViewMode === 'grid' ? styles.viewToggleActive : styles.viewToggle}
                    onClick={() => setTourViewMode('grid')}
                    title="Chuyển sang dạng Lưới hình ảnh"
                  >
                    <LayoutGrid size={16} /> <span>Lưới</span>
                  </button>
                </div>

                <button
                  className={styles.secondaryButton}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
                  type="button"
                  onClick={() => {
                    setSelectionMode(!selectionMode);
                    if (selectionMode) setSelectedTours([]);
                  }}
                >
                  {selectionMode ? (
                    <><X size={16} /> Hủy chọn</>
                  ) : (
                    <><CheckSquare size={16} /> Chọn nhiều</>
                  )}
                </button>
                <button
                  className={styles.primaryButton}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
                  type="button"
                  onClick={startCreate}
                >
                  <Plus size={16} /> Thêm tour
                </button>
              </div>
            </div>

            {tourViewMode === 'table' ? (
              <div className={styles.tableWrap}>
                <table className={styles.adminTourTable}>
                  <thead>
                    <tr>
                      {selectionMode && (
                        <th style={{ width: 44, textAlign: 'center' }}>
                          <input
                            type="checkbox"
                            checked={Boolean(tours?.data.length && selectedTours.length === tours.data.length)}
                            onChange={toggleSelectAllTours}
                            aria-label="Chọn tất cả tour trên trang"
                          />
                        </th>
                      )}
                      <th>Tour du lịch</th>
                      <th>Điểm đến</th>
                      <th>Thời lượng</th>
                      <th>Giá niêm yết</th>
                      <th>Lịch khởi hành</th>
                      <th style={{ textAlign: 'right' }}>Thao tác</th>
                    </tr>
                  </thead>
                  <tbody>
                    {tours?.data.map((tour) => {
                      const isSelected = selectedTours.includes(tour.id);
                      const futureSchedules = getFutureScheduleRows(tour.schedule);
                      return (
                        <tr key={tour.id} className={isSelected ? styles.selectedRow : undefined}>
                          {selectionMode && (
                            <td style={{ textAlign: 'center' }}>
                              <input
                                type="checkbox"
                                checked={isSelected}
                                onChange={() => toggleSelectTour(tour.id)}
                                aria-label={`Chọn ${tour.name}`}
                              />
                            </td>
                          )}
                          <td>
                            <div className={styles.tableTourCell}>
                              <div className={styles.tableTourThumb}>
                                {tour.image_url ? (
                                  <img src={tour.image_url} alt={tour.name} loading="lazy" />
                                ) : (
                                  <div className={styles.tourPlaceholder}>T</div>
                                )}
                              </div>
                              <div className={styles.tableTourMeta}>
                                <strong className={styles.tableTourName} title={tour.name}>{tour.name}</strong>
                                <div className={styles.tableTourBadges}>
                                  <span className={styles.tourIdBadge}>#{tour.id}</span>
                                  {tour.season && <span className={styles.seasonBadge}>{tour.season}</span>}
                                </div>
                              </div>
                            </div>
                          </td>
                          <td>
                            <div className={styles.destCell}>
                              <strong>{tour.destination}</strong>
                            </div>
                          </td>
                          <td>
                            <div className={styles.durationCell}>
                              <strong>{tour.duration} ngày</strong>
                              {tour.duration_label && <small>{tour.duration_label}</small>}
                            </div>
                          </td>
                          <td>
                            <div className={styles.priceCell}>
                              <strong className={styles.currentPrice}>{formatPrice(tour.price)}</strong>
                              {tour.original_price && tour.original_price > tour.price ? (
                                <del className={styles.origPrice}>{formatPrice(tour.original_price)}</del>
                              ) : null}
                            </div>
                          </td>
                          <td>
                            <span className={futureSchedules.length > 0 ? styles.scheduleBadgeActive : styles.scheduleBadgeEmpty}>
                              {futureSchedules.length > 0 ? `${futureSchedules.length} ngày mở bán` : 'Chưa có lịch'}
                            </span>
                          </td>
                          <td>
                            <div className={styles.tableRowActions}>
                              <a href={`/tours/${tour.id}`} target="_blank" rel="noopener noreferrer" className={styles.actionIconBtn} title="Xem trên website">
                                <ExternalLink size={15} />
                              </a>
                              <button type="button" className={styles.actionIconBtn} onClick={() => startEdit(tour)} title="Sửa tour">
                                <Pencil size={15} />
                              </button>
                              <button type="button" className={`${styles.actionIconBtn} ${styles.actionIconDanger}`} onClick={() => void deleteTour(tour)} title="Xóa tour">
                                <Trash2 size={15} />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className={styles.tourCards}>
                {tours?.data.map((tour) => (
                  <article className={styles.tourCard} key={tour.id} tabIndex={0} onClick={() => { if (selectionMode) toggleSelectTour(tour.id); }} style={{ cursor: selectionMode ? 'pointer' : undefined }}>
                    {selectionMode && <label className={styles.tourSelectCheckbox}><input type="checkbox" checked={selectedTours.includes(tour.id)} readOnly /></label>}
                    <div className={styles.tourCardImage}>
                      {tour.image_url ? <img src={tour.image_url} alt={tour.name} /> : <div className={styles.tourPlaceholder}>T</div>}
                      {!selectionMode && (
                        <div className={styles.tourCardActions}>
                          <a href={`/tours/${tour.id}`} target="_blank" rel="noopener noreferrer" className={styles.cardActionIcon} title="Xem trên web">
                            <ExternalLink size={14} />
                          </a>
                          <button type="button" className={styles.cardActionIcon} onClick={() => startEdit(tour)} aria-label={`Sửa ${tour.name}`} title="Sửa tour">
                            <Pencil size={14} />
                          </button>
                          <button type="button" className={`${styles.cardActionIcon} ${styles.cardActionDanger}`} onClick={() => void deleteTour(tour)} aria-label={`Xóa ${tour.name}`} title="Xóa tour">
                            <Trash2 size={14} />
                          </button>
                        </div>
                      )}
                    </div>
                    <div className={styles.tourCardBody}>
                      <div className={styles.tourCardMeta}><span>{tour.destination}</span></div>
                      <h3>{tour.name}</h3>
                      <div className={styles.tourCardFooter}><strong>{formatPrice(tour.price)}</strong><span>{tour.duration} ngày</span></div>
                    </div>
                  </article>
                ))}
              </div>
            )}
            {!tours?.data.length && <div className={styles.emptyState}>Chưa có tour nào phù hợp với bộ lọc.</div>}
          </div>
        )}

          
           {tab === 'tours' && tours && tours.pagination.totalPages > 1 && <div className={styles.pagination}>
             <button type="button" className={styles.paginationArrow} onClick={() => changeTourPage(tourPage - 1)} disabled={tourPage <= 1} aria-label="Trang trước"><ChevronLeft size={16} /></button>
             <label className={styles.pagePicker}><span>Trang</span><input className={styles.pageInput} type="number" min="1" max={tours.pagination.totalPages} value={tourPage} aria-label="Nh?p s? trang" onChange={(event) => { const page = Number(event.target.value); if (page >= 1) changeTourPage(page) }} /><span>/ {tours.pagination.totalPages}</span></label>
             <button type="button" className={styles.paginationArrow} onClick={() => changeTourPage(tourPage + 1)} disabled={tourPage >= tours.pagination.totalPages} aria-label="Trang sau"><ChevronRight size={16} /></button>
           </div>}


           {selectedTours.length > 0 && <div className={styles.bulkActionBar}>
              <span>Đã chọn <strong>{selectedTours.length}</strong> tour</span>
              <button type="button" className={styles.ghostButton} onClick={toggleSelectAllTours}>{selectedTours.length === tours?.data.length ? 'Bỏ chọn tất cả' : 'Chọn tất cả trên trang'}</button>
              <div style={{ flex: 1 }}></div>
              <button type="button" className={styles.secondaryButton} onClick={() => setSelectedTours([])}>Hủy</button>
              <button type="button" className={styles.dangerButton} onClick={() => setBulkDeleting(true)}>Xóa đã chọn</button>
            </div>}

            {bulkDeleting && <div className={styles.modalBackdrop} role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !deleting) setBulkDeleting(false) }}>
              <section className={`${styles.confirmModal} ${styles.centeredModal}`} role="dialog" aria-modal="true" aria-labelledby="bulk-delete-title">
                <div className={styles.centeredIcon} aria-hidden="true">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M3 6h18"></path><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"></path><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"></path>
                  </svg>
                </div>
                <div className={styles.centeredContent}>
                  <h2 id="bulk-delete-title">Xóa {selectedTours.length} tour?</h2>
                  <p>Bạn có chắc muốn xóa <strong>{selectedTours.length} tour đã chọn</strong>? Hành động này không thể hoàn tác.</p>
                </div>
                <div className={styles.centeredActions}>
                  <button type="button" className={styles.secondaryButton} onClick={() => setBulkDeleting(false)} disabled={deleting}>Hủy</button>
                  <button type="button" className={styles.dangerButton} onClick={() => void confirmBulkDeleteTours()} disabled={deleting}>{deleting ? 'Đang xóa...' : `Xóa ${selectedTours.length} tour`}</button>
                </div>
              </section>
            </div>}


           {deletingTour && <div className={styles.modalBackdrop} role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !deleting) setDeletingTour(null) }}>
              <section className={`${styles.confirmModal} ${styles.centeredModal}`} role="dialog" aria-modal="true" aria-labelledby="delete-tour-title">
                <div className={styles.centeredIcon} aria-hidden="true">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M3 6h18"></path><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"></path><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"></path>
                  </svg>
                </div>
                <div className={styles.centeredContent}>
                  <h2 id="delete-tour-title">Xóa tour này?</h2>
                  <p>Bạn có chắc muốn xóa <strong>{deletingTour.name}</strong>? Hành động này không thể hoàn tác.</p>
                </div>
                <div className={styles.centeredActions}>
                  <button type="button" className={styles.secondaryButton} onClick={() => setDeletingTour(null)} disabled={deleting}>Hủy</button>
                  <button type="button" className={styles.dangerButton} onClick={() => void confirmDeleteTour()} disabled={deleting}>{deleting ? 'Đang xóa...' : 'Xóa tour'}</button>
                </div>
              </section>
           </div>}


          {tab === 'bookings' && (
          <>
            <section className={styles.panel}>
              <div className={styles.panelHeader}>
                <div>
                  <h2>Lịch sử đặt tour</h2>
                  <span>{bookings?.pagination.total || 0} đơn trong hệ thống</span>
                </div>
                <button
                  type="button"
                  className={styles.secondaryButton}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
                  onClick={exportBookingsToCSV}
                  title="Xuất toàn bộ đơn hàng sang file CSV"
                >
                  <Download size={15} /> Xuất CSV
                </button>
              </div>
              <div className={styles.tableWrap}>
                <table className={styles.bookingTable}>
                  <thead>
                    <tr>
                      <th>Mã đơn</th>
                      <th>Khách hàng</th>
                      <th>Tour / khởi hành</th>
                      <th>Số khách</th>
                      <th>Tổng tiền</th>
                      <th>Trạng thái</th>
                      <th>Ngày tạo</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {bookings?.data.map((item) => (
                      <tr key={item.id}>
                        <td>
                          <div className={styles.codeCell}>
                            <div className={styles.codeRow}>
                              <strong>{item.booking_code}</strong>
                              <button
                                type="button"
                                className={styles.copyBtn}
                                onClick={() => void handleCopyCode(item.booking_code)}
                                title="Sao chép mã đơn"
                              >
                                {copiedCode === item.booking_code ? <Check size={12} color="#16a34a" /> : <Copy size={12} />}
                              </button>
                            </div>
                            {item.payment_code && <small>{item.payment_code}</small>}
                          </div>
                        </td>
                        <td><strong>{item.user_name}</strong><small>{item.user_email}</small></td>
                        <td><strong className={styles.bookingTourName}>{item.tour_name}</strong><small>{item.destination} · {formatDate(item.departure_date)}</small></td>
                        <td>{item.guest_count}</td>
                        <td><strong className={styles.amountCell}>{formatPrice(item.total_amount)}</strong></td>
                        <td>
                          <div className={styles.bookingStatuses}>
                            <span className={`${styles.statusBadge} ${item.payment_status === 'paid' ? styles.statusPaid : styles.statusPending}`}>
                              {paymentStatusLabels[item.payment_status]}
                            </span>
                            <small>{bookingStatusLabels[item.status]}</small>
                          </div>
                        </td>
                        <td>{formatDate(item.created_at, true)}</td>
                        <td>
                          <button type="button" className={styles.detailButton} onClick={() => void openBookingDetail(item)}>
                            Chi tiết
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {!bookings?.data.length && <div className={styles.emptyState}>Không tìm thấy đơn đặt tour phù hợp.</div>}
            </section>
            {bookings && bookings.pagination.totalPages > 1 && <div className={styles.pagination}><button type="button" className={styles.paginationArrow} onClick={() => changeBookingPage(bookingPage - 1)} disabled={bookingPage <= 1} aria-label="Trang trước"><ChevronLeft size={16} /></button><label className={styles.pagePicker}><span>Trang</span><input className={styles.pageInput} type="number" min="1" max={bookings.pagination.totalPages} value={bookingPage} aria-label="Nhập số trang đặt tour" onChange={(event) => { const nextPage = Number(event.target.value); if (nextPage >= 1) changeBookingPage(nextPage) }} /><span>/ {bookings.pagination.totalPages}</span></label><button type="button" className={styles.paginationArrow} onClick={() => changeBookingPage(bookingPage + 1)} disabled={bookingPage >= bookings.pagination.totalPages} aria-label="Trang sau"><ChevronRight size={16} /></button></div>}
          </>
        )}

          {tab === 'users' && <>
            <section className={styles.panel}>
              <div className={styles.panelHeader}><div><h2>Người dùng</h2><span>{users?.pagination.total || 0} tài khoản</span></div></div>
              <div className={styles.tableWrap}><table><thead><tr><th>Người dùng</th><th>Quyền</th><th>Trạng thái</th><th>Tương tác</th><th>Ngày tạo</th><th>Thao tác</th></tr></thead><tbody>{users?.data.map((item) => <tr key={item.id}>
                <td><strong>{item.name}</strong><small>{item.email}</small></td>
                <td><Dropdown className={`${styles.inlineSelect} ${item.role === 'admin' ? styles.roleAdmin : styles.roleUser}`} value={item.role} onChange={(val) => updateRole(item, val as 'user' | 'admin')} disabled={item.id === user.id} options={[{value: 'user', label: 'Người dùng'}, {value: 'admin', label: 'Quản trị viên'}]} /></td>
                <td><Dropdown className={`${styles.inlineSelect} ${item.is_active ? styles.statusActive : styles.statusInactive}`} value={item.is_active ? 'active' : 'inactive'} onChange={(val) => updateStatus(item, val === 'active')} disabled={item.id === user.id} options={[{value: 'active', label: 'Đang hoạt động'}, {value: 'inactive', label: 'Đã khóa'}]} /></td>
                <td>
                  <div className={styles.userMetrics}>
                    <span className={styles.metricItem} title="Số tour yêu thích"><Heart size={13} className={styles.metricHeart} /> {item.favorite_count || 0}</span>
                    <span className={styles.metricItem} title="Lượt tương tác"><Zap size={13} className={styles.metricZap} /> {item.action_count || 0}</span>
                    <span className={styles.metricItem} title="Đánh giá đã viết"><Star size={13} className={styles.metricStar} /> {item.review_count || 0}</span>
                  </div>
                </td>
                <td>{formatDate(item.created_at)}</td>
                <td>
                  <div className={styles.rowActions}>
                    <button type="button" className={styles.tableActionBtn} onClick={() => void openUserDetail(item)}>Chi tiết</button>
                    <button type="button" className={styles.tableActionBtn} onClick={() => openPasswordDialog(item)}>Đổi MK</button>
                    <button type="button" className={styles.tableActionBtnDanger} onClick={() => deleteUser(item)} disabled={item.id === user.id}>Xóa</button>
                  </div>
                </td>
              </tr>)}</tbody></table></div>
              {!users?.data.length && <div className={styles.emptyState}>Không tìm thấy tài khoản phù hợp.</div>}
              {users && users.pagination.totalPages > 1 && <div className={styles.pagination}><button type="button" className={styles.paginationArrow} onClick={() => changeUserPage(userPage - 1)} disabled={userPage <= 1} aria-label="Trang trước"><ChevronLeft size={16} /></button><label className={styles.pagePicker}><span>Trang</span><input className={styles.pageInput} type="number" min="1" max={users.pagination.totalPages} value={userPage} aria-label="Nhập số trang người dùng" onChange={(event) => { const page = Number(event.target.value); if (page >= 1) changeUserPage(page) }} /><span>/ {users.pagination.totalPages}</span></label><button type="button" className={styles.paginationArrow} onClick={() => changeUserPage(userPage + 1)} disabled={userPage >= users.pagination.totalPages} aria-label="Trang sau"><ChevronRight size={16} /></button></div>}
            </section>
          </>}

          {bookingDetail && <div className={styles.modalBackdrop} role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setBookingDetail(null) }}><section className={styles.userDetailModal} role="dialog" aria-modal="true" aria-labelledby="booking-detail-title"><div className={styles.modalHeader}><div><span className={styles.modalEyebrow}>CHI TIẾT ĐẶT TOUR</span><h2 id="booking-detail-title">{bookingDetail.booking_code}</h2><p className={styles.detailEmail}>{bookingDetail.user_name} · {bookingDetail.user_email}</p></div><button type="button" className={styles.modalClose} onClick={() => setBookingDetail(null)} aria-label="Đóng"><span aria-hidden="true">&#215;</span></button></div><div className={styles.userDetailStats}><div><strong>{formatPrice(bookingDetail.total_amount)}</strong><span>Tổng tiền</span></div><div><strong>{bookingDetail.guest_count}</strong><span>Số khách</span></div><div><strong>{formatDate(bookingDetail.departure_date)}</strong><span>Khởi hành</span></div><div><strong className={`${styles.statusBadge} ${bookingDetail.payment_status === 'paid' ? styles.statusPaid : styles.statusPending}`}>{paymentStatusLabels[bookingDetail.payment_status]}</strong><span>Thanh toán</span></div></div><div className={styles.detailGrid}><section><h3>Thông tin đơn</h3><ul className={styles.detailList}><li><strong>Tour</strong><span>{bookingDetail.tour_name}</span></li><li><strong>Điểm đến</strong><span>{bookingDetail.destination}</span></li><li><strong>Trạng thái đơn</strong><span>{bookingStatusLabels[bookingDetail.status]}</span></li><li><strong>Ngày tạo</strong><span>{formatDate(bookingDetail.created_at, true)}</span></li><li><strong>Mã thanh toán</strong><span>{bookingDetail.payment_code}</span></li></ul></section><section><h3>Thông tin liên hệ</h3><ul className={styles.detailList}><li><strong>{bookingDetail.contact_name}</strong><span>{bookingDetail.contact_email}</span></li><li><strong>Số điện thoại</strong><span>{bookingDetail.contact_phone}</span></li>{bookingDetail.note && <li><strong>Ghi chú</strong><span>{bookingDetail.note}</span></li>}</ul></section><section className={styles.detailFull}><h3>Lịch sử giao dịch</h3>{bookingDetail.payments.length ? <ul className={styles.detailList}>{bookingDetail.payments.map((payment) => <li key={payment.id}><strong>{payment.provider.toUpperCase()} · {formatPrice(payment.transfer_amount)}</strong><span>Mã giao dịch: {payment.provider_transaction_id || '—'} · {formatDate(payment.paid_at, true)}</span>{payment.reference_code && <span>Mã tham chiếu: {payment.reference_code}</span>}</li>)}</ul> : <p className={styles.detailEmpty}>Chưa ghi nhận giao dịch thanh toán.</p>}</section></div></section></div>}

          {userDetail && <div className={styles.modalBackdrop} role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setUserDetail(null) }}><section className={styles.userDetailModal} role="dialog" aria-modal="true" aria-labelledby="user-detail-title"><div className={styles.modalHeader}><div><span className={styles.modalEyebrow}>HỒ SƠ NGƯỜI DÙNG</span><h2 id="user-detail-title">{userDetail.name}</h2><p className={styles.detailEmail}>{userDetail.email}</p></div><button type="button" className={styles.modalClose} onClick={() => setUserDetail(null)} aria-label="Đóng"><span aria-hidden="true">&#215;</span></button></div><div className={styles.userDetailStats}><div><strong>{userDetail.favorite_count || 0}</strong><span>Yêu thích</span></div><div><strong>{userDetail.action_count || 0}</strong><span>Tương tác</span></div><div><strong>{userDetail.review_count || 0}</strong><span>Đánh giá</span></div><div><strong>{userDetail.chat_session_count || 0}</strong><span>Cuộc chat</span></div></div><div className={styles.detailGrid}><section><h3>Tour yêu thích</h3>{userDetail.favorites.length ? <ul className={styles.detailList}>{userDetail.favorites.slice(0, 6).map((favorite) => <li key={favorite.id}><strong>{favorite.name}</strong><span>{favorite.destination} &#183; {formatPrice(favorite.price)}</span></li>)}</ul> : <p className={styles.detailEmpty}>Chưa có tour yêu thích.</p>}</section><section className={styles.detailFull}><h3>Đánh giá đã viết</h3>{userDetail.reviews.length ? <ul className={styles.detailList}>{userDetail.reviews.map((review) => <li key={review.id}><strong>{review.tour_name} &#183; {review.rating}/10</strong><span>{review.content}</span></li>)}</ul> : <p className={styles.detailEmpty}>Chưa có đánh giá.</p>}</section></div></section></div>}

          {passwordTarget && <div className={styles.modalBackdrop} role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) closePasswordDialog() }}>
            <section className={`${styles.modal} ${styles.passwordModal}`} role="dialog" aria-modal="true" aria-labelledby="password-modal-title">
              <div className={styles.modalHeader}><div><span className={styles.modalEyebrow}>BẢO MẬT TÀI KHOẢN</span><h2 id="password-modal-title">Đổi mật khẩu</h2><p className={styles.detailEmail}>{passwordTarget.name} · {passwordTarget.email}</p></div><button type="button" className={styles.modalClose} onClick={closePasswordDialog} disabled={passwordActionLoading} aria-label="Đóng"><span aria-hidden="true">&#215;</span></button></div>
              <form className={styles.passwordForm} onSubmit={(event) => void updateUserPassword(event)} autoComplete="off">
                <label><span>Mật khẩu mới</span><div className={styles.passwordControl}><input type="text" autoComplete="off" className={!showNewUserPassword ? styles.adminPasswordMasked : undefined} value={newUserPassword} onChange={(event) => setNewUserPassword(event.target.value)} minLength={12} maxLength={24} spellCheck={false} required /><button type="button" onClick={() => setShowNewUserPassword((visible) => !visible)}>{showNewUserPassword ? 'Ẩn' : 'Hiện'}</button></div></label>
                <ul className={styles.passwordChecklist} aria-live="polite">{userPasswordRequirements.map((requirement) => <li key={requirement.label} className={requirement.met ? styles.passwordRequirementMet : undefined}><span aria-hidden="true">{requirement.met ? '✓' : ''}</span>{requirement.label}</li>)}</ul>
                <label><span>Xác nhận mật khẩu</span><div className={styles.passwordControl}><input type="text" autoComplete="off" className={!showConfirmUserPassword ? styles.adminPasswordMasked : undefined} value={confirmUserPassword} onChange={(event) => setConfirmUserPassword(event.target.value)} minLength={12} maxLength={24} spellCheck={false} required /><button type="button" onClick={() => setShowConfirmUserPassword((visible) => !visible)}>{showConfirmUserPassword ? 'Ẩn' : 'Hiện'}</button></div></label>
                {passwordActionError && <p className={styles.passwordError} role="alert">{passwordActionError}</p>}
                <div className={styles.passwordActions}><button type="button" className={styles.secondaryButton} onClick={closePasswordDialog} disabled={passwordActionLoading}>Hủy</button><button type="submit" className={styles.primaryButton} disabled={passwordActionLoading}>{passwordActionLoading ? 'Đang cập nhật...' : 'Cập nhật mật khẩu'}</button></div>
              </form>
            </section>
          </div>}

          {userAction && <div className={styles.modalBackdrop} role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !userActionLoading) setUserAction(null) }}><section className={styles.confirmModal} role="dialog" aria-modal="true" aria-labelledby="user-action-title"><div className={styles.confirmIcon} aria-hidden="true">!</div><div className={styles.confirmContent}><span className={styles.modalEyebrow}>XÁC NHẬN THAY ĐỔI</span><h2 id="user-action-title">{userAction.kind === 'delete' ? 'Xóa tài khoản?' : userAction.kind === 'status' ? (userAction.is_active ? 'Mở khóa tài khoản?' : 'Khóa tài khoản?') : 'Đổi quyền tài khoản?'}</h2><p>{userAction.kind === 'delete' ? <>Tài khoản <strong>{userAction.target.email}</strong> sẽ bị xóa khỏi hệ thống.</> : userAction.kind === 'status' ? <>Bạn muốn {userAction.is_active ? 'mở khóa' : 'khóa'} tài khoản <strong>{userAction.target.email}</strong>?</> : <>Đổi quyền của <strong>{userAction.target.email}</strong> thành <strong>{userAction.role === 'admin' ? 'Quản trị viên' : 'Người dùng'}</strong>?</>}</p></div><div className={styles.confirmActions}><button type="button" className={styles.secondaryButton} onClick={() => setUserAction(null)} disabled={userActionLoading}>Hủy</button><button type="button" className={styles.dangerButton} onClick={() => void confirmUserAction()} disabled={userActionLoading}>{userActionLoading ? 'Đang xử lý...' : 'Xác nhận'}</button></div></section></div>}

        </section>
      )}
          {tab === 'tours' && tourFormOpen && (
            <section className={styles.formWorkspace} aria-labelledby="tour-form-title">
              <div className={styles.formPanelHeader}>
                <button type="button" className={styles.backButton} onClick={closeTourForm} aria-label="Quay lại danh sách">
                  &larr; Quay lại
                </button>
                <div className={styles.formPanelTitle}>
                  <span className={styles.modalEyebrow}>{editingTour ? 'CHỈNH SỬA TOUR' : 'TOUR MỚI'}</span>
                  <h2 id="tour-form-title">{editingTour ? 'Chỉnh sửa tour' : 'Thêm tour mới'}</h2>
                </div>
                <div className={styles.headerActions}>
                  <button type="button" className={styles.secondaryButton} onClick={closeTourForm}>Hủy</button>
                  <button type="button" className={styles.primaryButton} onClick={(e) => { const form = e.currentTarget.closest('section')?.querySelector('form'); if (form) form.requestSubmit(); }} disabled={saving}>{saving ? 'Đang lưu...' : editingTour ? 'Lưu thay đổi' : 'Tạo tour'}</button>
                </div>
              </div>
              <form className={styles.formLayout} onSubmit={saveTour}>
                
                <div className={styles.formMain}>
                  <section className={styles.formSection}>
                    <div className={styles.sectionHeader}>
                      <h3>Thông tin chung</h3>
                      <p>Tên tour, điểm đến và các thông tin cơ bản.</p>
                    </div>
                    <div className={styles.sectionContent}>
                      <label className={styles.fullField}><span>Tên tour <span className={styles.req}>*</span></span><input required value={tourForm.name} onChange={(event) => setTourForm({ ...tourForm, name: event.target.value })} /></label>
                      <label className={styles.fullField}><span>Điểm đến <span className={styles.req}>*</span></span><input required value={tourForm.destination} onChange={(event) => setTourForm({ ...tourForm, destination: event.target.value })} /></label>
                      <div className={styles.inlineFields}>
                        <label><span>Giá bán <span className={styles.req}>*</span></span><div className={styles.priceInputWrap}><input required type="text" value={tourForm.price !== undefined ? tourForm.price.toLocaleString('en-US') : ''} onChange={(event) => { const val = event.target.value.replace(/\D/g, ''); setTourForm({ ...tourForm, price: val ? Number(val) : 0 }) }} /><span>₫</span></div></label>
                        <label>Giá gốc<div className={styles.priceInputWrap}><input type="text" value={tourForm.original_price ? tourForm.original_price.toLocaleString('en-US') : ''} placeholder="Không bắt buộc" onChange={(event) => { const val = event.target.value.replace(/\D/g, ''); setTourForm({ ...tourForm, original_price: val ? Number(val) : 0 }) }} /><span>₫</span></div></label>
                      </div>
                      <div className={styles.inlineFields}>
                        <label><span>Số ngày <span className={styles.req}>*</span></span><input required type="number" min="1" value={tourForm.duration} onChange={(event) => setTourForm({ ...tourForm, duration: Number(event.target.value) })} /></label>
                        <label>Nhãn thời lượng<input value={tourForm.duration_label || ''} placeholder="Ví dụ: 3N2Đ" onChange={(event) => setTourForm({ ...tourForm, duration_label: event.target.value })} /></label>
                      </div>
                    </div>
                  </section>

                  <section className={styles.formSection}>
                    <div className={styles.sectionHeader}>
                      <h3>Hình ảnh & Mô tả</h3>
                      <p>Hình ảnh thu hút và mô tả chi tiết chương trình.</p>
                    </div>
                    <div className={styles.sectionContent}>
                      <label className={styles.fullField}><span>Ảnh tour <span className={styles.req}>*</span></span>
                        <div className={styles.imagePicker}><div className={styles.imageGrid}>{tourImages.map((image, index) => <div className={styles.imageThumb} key={`${image.url}-${index}`}><img src={image.url} alt={`Ảnh tour ${index + 1}`} /><button type="button" onClick={() => removeTourImage(index)} aria-label={`Xóa ảnh ${index + 1}`}>×</button></div>)}</div><label className={styles.fileButton}>Chọn nhiều ảnh<input type="file" accept="image/jpeg,image/png,image/webp" multiple onChange={handleTourImageChange} /></label></div>
                        <small>JPG, PNG hoặc WEBP · tối đa 5MB/ảnh · tối đa {MAX_TOUR_GALLERY_IMAGES} ảnh</small>
                      </label>
                      <label className={styles.fullField}><span>Mô tả <span className={styles.req}>*</span></span><RichTextEditor value={tourForm.description || ''} onChange={(description) => setTourForm({ ...tourForm, description })} /></label>
                    </div>
                  </section>

                  <section className={styles.formSection}>
                    <div className={styles.sectionHeader}>
                      <h3>Điểm nhấn & Trải nghiệm</h3>
                      <p>Các yếu tố nổi bật, bao gồm và chưa bao gồm.</p>
                    </div>
                    <div className={styles.sectionContent}>
                      <label className={styles.fullField}>Điểm nổi bật <small>Mỗi dòng một nội dung</small><textarea rows={4} value={arrayToLines(tourForm.highlights)} placeholder="Ví dụ: Tham quan Bà Nà Hills" onChange={(event) => updateListField('highlights', event.target.value, setTourForm)} /></label>
                      <label className={styles.fullField}>Điểm tham quan <small>Mỗi dòng một địa điểm</small><textarea rows={3} value={arrayToLines(tourForm.places)} placeholder="Hội An / Bà Nà Hills" onChange={(event) => updateListField('places', event.target.value, setTourForm)} /></label>
                      <label className={styles.fullField}>Chủ đề/trải nghiệm <small>Mỗi dòng một mục</small><textarea rows={3} value={arrayToLines(tourForm.topics)} placeholder="Nghỉ dưỡng / Ẩm thực" onChange={(event) => updateListField('topics', event.target.value, setTourForm)} /></label>
                      <div className={`${styles.fullField} ${styles.aiTagsField}`}>
                        <div className={styles.aiTagsHeader}>
                          <div><strong>Hashtag AI <span className={styles.req}>*</span></strong><small>Chọn đặc trưng để AI ghép tour với sở thích người dùng.</small></div>
                          <span>{tourForm.tags?.length || 0} tag đã chọn</span>
                        </div>
                        <div className={styles.aiTagOptions}>
                          {tourTagCatalog.map((item) => {
                            const selected = tourForm.tags?.some((tag) => tag.tag === item.tag)
                            return <button key={item.tag} type="button" aria-pressed={selected} className={selected ? styles.aiTagSelected : styles.aiTagOption} onClick={() => toggleTourTag(item.tag)}>#{item.label}</button>
                          })}
                        </div>
                        {tourForm.tags?.length ? <div className={styles.aiTagWeights}>
                          {tourForm.tags.map((item) => {
                            const label = tourTagCatalog.find((catalogItem) => catalogItem.tag === item.tag)?.label || item.tag
                            return <div className={styles.aiTagWeightRow} key={item.tag}>
                              <span>#{label}</span>
                              <input aria-label={`Mức độ phù hợp của tag ${label}`} type="range" min="0.1" max="1" step="0.1" value={item.weight} onChange={(event) => updateTourTagWeight(item.tag, Number(event.target.value))} />
                              <strong>{Math.round(item.weight * 100)}%</strong>
                            </div>
                          })}
                        </div> : <p className={styles.aiTagsEmpty}>Cần chọn ít nhất một hashtag AI trước khi lưu tour.</p>}
                      </div>
                      <label className={styles.fullField}>Đã bao gồm <small>Mỗi dòng một mục</small><textarea rows={3} value={arrayToLines(tourForm.included)} placeholder="Xe đưa đón / Bữa ăn theo lịch trình" onChange={(event) => updateListField('included', event.target.value, setTourForm)} /></label>
                      <label className={styles.fullField}>Chưa bao gồm <small>Mỗi dòng một mục</small><textarea rows={3} value={arrayToLines(tourForm.excluded)} placeholder="Chi phí cá nhân / Đồ uống" onChange={(event) => updateListField('excluded', event.target.value, setTourForm)} /></label>
                    </div>
                  </section>

                  <section className={styles.formSection}>
                    <div className={styles.sectionHeader}>
                      <div className={styles.sectionTitleWithAction}>
                        <div>
                          <h3>Lịch trình từng ngày</h3>
                          <p>Chi tiết các hoạt động, bữa ăn theo từng ngày.</p>
                        </div>
                        <button type="button" className={styles.smallButton} onClick={addItineraryDay}>+ Thêm ngày</button>
                      </div>
                    </div>
                    <div className={styles.sectionContentFull}>
                      <div className={styles.repeatableList}>{(tourForm.itinerary || []).map((day, index) => <div className={styles.repeatableCard} key={`${day.day}-${index}`}>
                        <div className={styles.repeatableHeader}><strong>{day.day || `Ngày ${index + 1}`}</strong><button type="button" className={styles.removeButton} onClick={() => removeItineraryDay(index)}>Xóa</button></div>
                        <div className={styles.inlineFields}><label>Ngày<input value={day.day} placeholder={`Ngày ${index + 1}`} onChange={(event) => updateItineraryDay(index, { day: event.target.value })} /></label><label>Bữa ăn<input value={day.meal || ''} placeholder="Ví dụ: Sáng, trưa" onChange={(event) => updateItineraryDay(index, { meal: event.target.value })} /></label></div>
                        <label className={styles.fullField}>Nội dung trong ngày <small>Mỗi dòng một hoạt động</small><textarea rows={3} value={arrayToLines(day.content)} onChange={(event) => updateItineraryDay(index, { content: linesToArray(event.target.value) })} /></label>
                      </div>)}</div>
                    </div>
                  </section>
                </div>

                <div className={styles.formSidebar}>
                  <section className={styles.formSection}>
                    <div className={styles.sectionHeader}>
                      <h3>Phân loại & Di chuyển</h3>
                    </div>
                    <div className={styles.sectionContent}>
                      <label className={styles.fullField}><span>Mùa/nhóm tour</span><input value={tourForm.season || ''} onChange={(event) => setTourForm({ ...tourForm, season: event.target.value })} /></label>
                      <label className={styles.fullField}>Hãng hàng không<input value={tourForm.transport?.airline || ''} placeholder="Nếu có" onChange={(event) => setTourForm({ ...tourForm, transport: { ...(tourForm.transport || {}), airline: event.target.value } })} /></label>
                      <label className={styles.fullField}>Phương tiện <small>Mỗi dòng một phương tiện</small><textarea rows={3} value={arrayToLines(tourForm.transport?.vehicle)} placeholder="Xe du lịch / Máy bay" onChange={(event) => setTourForm({ ...tourForm, transport: { ...(tourForm.transport || {}), vehicle: linesToArray(event.target.value) } })} /></label>
                    </div>
                  </section>
                  
                  <section className={styles.formSection}>
                    <div className={styles.sectionHeader}>
                      <div className={styles.sectionTitleWithAction}>
                        <div>
                          <h3>Lịch khởi hành</h3>
                        </div>
                        <button type="button" className={styles.smallButton} onClick={addScheduleRow}>+ Thêm</button>
                      </div>
                    </div>
                    <div className={styles.sectionContentFull}>
                      <div className={styles.repeatableList}>{(tourForm.schedule || []).map((row, index) => <div className={styles.scheduleRow} key={`${row.date}-${index}`}><input aria-label={`Ngày khởi hành ${index + 1}`} type="date" min={getTomorrowIsoDate()} required value={row.date} onChange={(event) => updateScheduleRow(index, { date: event.target.value })} /><div className={styles.priceInputWrap}><input aria-label={`Giá lịch ${index + 1}`} type="text" placeholder="Giá" value={row.price ? row.price.toLocaleString('en-US') : ''} onChange={(event) => { const val = event.target.value.replace(/\D/g, ''); updateScheduleRow(index, { price: val ? Number(val) : 0 }) }} /><span>₫</span></div><label className={styles.checkboxLabel}><input type="checkbox" checked={row.available} onChange={(event) => updateScheduleRow(index, { available: event.target.checked })} /> Còn chỗ</label><button type="button" className={styles.removeButton} onClick={() => removeScheduleRow(index)}>Xóa</button></div>)}</div>
                    </div>
                  </section>
                </div>

              </form>
            </section>
          )}
        </main>
    </div>








  )
}






