import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { bookingApi } from '@/api'
import { useAuthStore } from '@/stores/auth'
import type { Booking, PaginatedResponse } from '@/types'
import styles from './Bookings.module.css'

type BookingStatusFilter = 'all' | Booking['status']
type PaymentStatusFilter = 'all' | Booking['payment_status']

const bookingStatusLabels: Record<Booking['status'], string> = {
  pending_payment: 'Chờ thanh toán',
  paid: 'Đã thanh toán',
  confirmed: 'Đã xác nhận',
  cancelled: 'Đã hủy',
  expired: 'Đã hết hạn',
  refunded: 'Đã hoàn tiền',
}

const paymentStatusLabels: Record<Booking['payment_status'], string> = {
  pending: 'Chưa thanh toán',
  paid: 'Đã thanh toán',
  failed: 'Thanh toán lỗi',
  refunded: 'Đã hoàn tiền',
}

const formatPrice = (value: number) => new Intl.NumberFormat('vi-VN', {
  style: 'currency',
  currency: 'VND',
  maximumFractionDigits: 0,
}).format(value)

const formatDate = (value?: string | null, withTime = false) => {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  return new Intl.DateTimeFormat('vi-VN', withTime
    ? { dateStyle: 'medium', timeStyle: 'short' }
    : { dateStyle: 'medium' }).format(date)
}

const isPaymentPending = (booking: Booking) => (
  booking.payment_status === 'pending' && booking.status === 'pending_payment'
)

const canContinuePayment = (booking: Booking) => (
  isPaymentPending(booking)
  && (!booking.expires_at || new Date(booking.expires_at).getTime() > Date.now())
)

const getErrorMessage = (error: unknown) => {
  const response = error as { response?: { data?: { error?: unknown; message?: unknown } } }
  const value = response.response?.data?.error ?? response.response?.data?.message
  if (typeof value === 'string' && value.trim()) return value
  if (value && typeof value === 'object') {
    const payload = value as { formErrors?: unknown; fieldErrors?: unknown }
    const messages: string[] = []
    if (Array.isArray(payload.formErrors)) {
      messages.push(...payload.formErrors.filter((item): item is string => typeof item === 'string'))
    }
    if (payload.fieldErrors && typeof payload.fieldErrors === 'object') {
      Object.values(payload.fieldErrors).forEach((items) => {
        if (Array.isArray(items)) messages.push(...items.filter((item): item is string => typeof item === 'string'))
      })
    }
    if (messages.length) return messages.join(' ')
  }
  if (error instanceof Error && error.message) return error.message
  return 'Không thể tải lịch sử đặt tour. Vui lòng thử lại.'
}

const openSepayCheckout = (booking: Booking) => {
  const checkout = booking.checkout
  if (!checkout) return
  const form = document.createElement('form')
  form.method = checkout.method
  form.action = checkout.action
  form.style.display = 'none'
  Object.entries(checkout.fields).forEach(([name, value]) => {
    const input = document.createElement('input')
    input.type = 'hidden'
    input.name = name
    input.value = value
    form.appendChild(input)
  })
  document.body.appendChild(form)
  form.submit()
}

export function BookingsPage() {
  const navigate = useNavigate()
  const { token } = useAuthStore()
  const [history, setHistory] = useState<PaginatedResponse<Booking> | null>(null)
  const [selectedBooking, setSelectedBooking] = useState<Booking | null>(null)
  const [status, setStatus] = useState<BookingStatusFilter>('all')
  const [paymentStatus, setPaymentStatus] = useState<PaymentStatusFilter>('all')
  const [page, setPage] = useState(1)
  const [refreshKey, setRefreshKey] = useState(0)
  const [loading, setLoading] = useState(true)
  const [detailLoading, setDetailLoading] = useState(false)
  const [actionId, setActionId] = useState<number | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!token) {
      navigate('/login', { replace: true })
      return
    }

    let cancelled = false
    setLoading(true)
    setError('')
    bookingApi.getHistory({ page, limit: 10, status, paymentStatus })
      .then((data) => {
        if (!cancelled) setHistory(data)
      })
      .catch((requestError) => {
        if (!cancelled) setError(getErrorMessage(requestError))
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [navigate, page, paymentStatus, refreshKey, status, token])

  useEffect(() => {
    if (!selectedBooking || !isPaymentPending(selectedBooking)) return
    const timer = window.setInterval(async () => {
      try {
        const latest = await bookingApi.getById(selectedBooking.id)
        setSelectedBooking(latest)
        if (!isPaymentPending(latest)) setRefreshKey((value) => value + 1)
      } catch {
        // Keep the detail modal usable while the payment provider confirms the transaction.
      }
    }, 5000)
    return () => window.clearInterval(timer)
  }, [selectedBooking?.id, selectedBooking?.payment_status, selectedBooking?.status])

  const openDetails = async (booking: Booking) => {
    setSelectedBooking(booking)
    setDetailLoading(true)
    try {
      setSelectedBooking(await bookingApi.getById(booking.id))
    } catch (requestError) {
      setError(getErrorMessage(requestError))
    } finally {
      setDetailLoading(false)
    }
  }

  const cancelBooking = async (booking: Booking) => {
    if (!window.confirm(`Bạn có chắc muốn hủy đơn ${booking.booking_code}?`)) return
    setActionId(booking.id)
    setError('')
    try {
      const updated = await bookingApi.cancel(booking.id)
      setSelectedBooking((current) => current?.id === booking.id ? updated : current)
      setRefreshKey((value) => value + 1)
    } catch (requestError) {
      setError(getErrorMessage(requestError))
    } finally {
      setActionId(null)
    }
  }

  const resetFilters = () => {
    setStatus('all')
    setPaymentStatus('all')
    setPage(1)
  }

  const data = history?.data || []

  return (
    <div className="container">
      <div className={styles.page}>
        <header className={styles.header}>
          <div>
            <p className={styles.eyebrow}>TOURAI ACCOUNT</p>
            <h1>Lịch sử đặt tour</h1>
            <p>Theo dõi đơn đặt tour, trạng thái thanh toán và thông tin khởi hành của bạn.</p>
          </div>
          <Link className={styles.exploreButton} to="/search">Khám phá tour</Link>
        </header>

        <section className={styles.filters} aria-label="Bộ lọc lịch sử đặt tour">
          <label>
            Trạng thái đơn
            <select value={status} onChange={(event) => { setPage(1); setStatus(event.target.value as BookingStatusFilter) }}>
              <option value="all">Tất cả đơn</option>
              {Object.entries(bookingStatusLabels).map(([value, label]) => <option value={value} key={value}>{label}</option>)}
            </select>
          </label>
          <label>
            Trạng thái thanh toán
            <select value={paymentStatus} onChange={(event) => { setPage(1); setPaymentStatus(event.target.value as PaymentStatusFilter) }}>
              <option value="all">Tất cả thanh toán</option>
              {Object.entries(paymentStatusLabels).map(([value, label]) => <option value={value} key={value}>{label}</option>)}
            </select>
          </label>
          {(status !== 'all' || paymentStatus !== 'all') && <button type="button" className={styles.clearButton} onClick={resetFilters}>Xóa bộ lọc</button>}
        </section>

        {error && <div className={styles.error} role="alert">{error}</div>}

        {loading ? (
          <div className={styles.loadingList} aria-busy="true" aria-label="Đang tải lịch sử đặt tour">
            {[1, 2, 3].map((item) => <div className={styles.skeleton} key={item} />)}
          </div>
        ) : data.length ? (
          <>
            <div className={styles.listHeader}>
              <strong>{history?.pagination.total || 0} đơn đặt tour</strong>
              <span>Đơn mới nhất hiển thị trước</span>
            </div>
            <div className={styles.bookingList}>
              {data.map((booking) => (
                <article className={styles.bookingCard} key={booking.id}>
                  <div className={styles.cardTop}>
                    <div>
                      <span className={styles.bookingCode}>{booking.booking_code}</span>
                      <h2>{booking.tour_name}</h2>
                      <p>{booking.destination}</p>
                    </div>
                    <div className={styles.badges}>
                      <span className={`${styles.badge} ${booking.payment_status === 'paid' ? styles.badgeSuccess : styles.badgePending}`}>{paymentStatusLabels[booking.payment_status]}</span>
                      <span className={`${styles.badge} ${styles.badgeNeutral}`}>{bookingStatusLabels[booking.status]}</span>
                    </div>
                  </div>
                  <div className={styles.metaGrid}>
                    <div><span>Ngày khởi hành</span><strong>{formatDate(booking.departure_date)}</strong></div>
                    <div><span>Số khách</span><strong>{booking.guest_count} người</strong></div>
                    <div><span>Tổng tiền</span><strong className={styles.amount}>{formatPrice(booking.total_amount)}</strong></div>
                    <div><span>Đặt lúc</span><strong>{formatDate(booking.created_at, true)}</strong></div>
                  </div>
                  <div className={styles.cardActions}>
                    <button type="button" className={styles.secondaryButton} onClick={() => void openDetails(booking)}>Xem chi tiết</button>
                    {canContinuePayment(booking) && <button type="button" className={styles.primaryButton} onClick={() => void openDetails(booking)}>Tiếp tục thanh toán</button>}
                    {isPaymentPending(booking) && <button type="button" className={styles.textDanger} onClick={() => void cancelBooking(booking)} disabled={actionId === booking.id}>{actionId === booking.id ? 'Đang hủy...' : 'Hủy đơn'}</button>}
                  </div>
                </article>
              ))}
            </div>
            {history && history.pagination.totalPages > 1 && <div className={styles.pagination}>
              <button type="button" onClick={() => setPage((value) => Math.max(1, value - 1))} disabled={page <= 1} aria-label="Trang trước">←</button>
              <span>Trang {page} / {history.pagination.totalPages}</span>
              <button type="button" onClick={() => setPage((value) => Math.min(history.pagination.totalPages, value + 1))} disabled={page >= history.pagination.totalPages} aria-label="Trang sau">→</button>
            </div>}
          </>
        ) : (
          <div className={styles.empty}>
            <div className={styles.emptyIcon}>◎</div>
            <h2>Chưa có đơn đặt tour</h2>
            <p>Các đơn đặt tour và giao dịch thanh toán của bạn sẽ xuất hiện tại đây.</p>
            <Link className={styles.primaryButton} to="/search">Tìm tour phù hợp</Link>
          </div>
        )}
      </div>

      {selectedBooking && <div className={styles.modalBackdrop} role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setSelectedBooking(null) }}>
        <section className={styles.modal} role="dialog" aria-modal="true" aria-labelledby="booking-detail-title">
          <div className={styles.modalHeader}>
            <div><span className={styles.eyebrow}>CHI TIẾT ĐƠN</span><h2 id="booking-detail-title">{selectedBooking.booking_code}</h2></div>
            <button type="button" className={styles.closeButton} onClick={() => setSelectedBooking(null)} aria-label="Đóng">×</button>
          </div>
          {detailLoading ? <div className={styles.detailLoading}>Đang tải chi tiết...</div> : <>
            <div className={styles.detailTour}><strong>{selectedBooking.tour_name}</strong><span>{selectedBooking.destination}</span></div>
            <div className={styles.detailGrid}>
              <div><span>Ngày khởi hành</span><strong>{formatDate(selectedBooking.departure_date)}</strong></div>
              <div><span>Số khách</span><strong>{selectedBooking.guest_count} người</strong></div>
              <div><span>Đơn giá</span><strong>{formatPrice(selectedBooking.unit_price)}</strong></div>
              <div><span>Tổng tiền</span><strong className={styles.amount}>{formatPrice(selectedBooking.total_amount)}</strong></div>
              <div><span>Người liên hệ</span><strong>{selectedBooking.contact_name}</strong></div>
              <div><span>Số điện thoại</span><strong>{selectedBooking.contact_phone}</strong></div>
              <div><span>Email</span><strong>{selectedBooking.contact_email}</strong></div>
              <div><span>Đặt lúc</span><strong>{formatDate(selectedBooking.created_at, true)}</strong></div>
            </div>
            {selectedBooking.note && <div className={styles.note}><span>Ghi chú</span><p>{selectedBooking.note}</p></div>}

            {canContinuePayment(selectedBooking) && <div className={styles.paymentBox}>
              <div className={styles.paymentBoxHeader}><div><h3>Thanh toán đơn hàng</h3><p>Hạn thanh toán: {formatDate(selectedBooking.expires_at, true)}</p></div><span className={`${styles.badge} ${styles.badgePending}`}>Chờ thanh toán</span></div>
              {selectedBooking.checkout ? <button type="button" className={styles.primaryButton} onClick={() => openSepayCheckout(selectedBooking)}>Mở thanh toán QR SePay</button> : selectedBooking.qr_url ? <img className={styles.qr} src={selectedBooking.qr_url} alt="Mã QR thanh toán SePay" /> : <p className={styles.paymentMissing}>Chưa cấu hình tài khoản nhận thanh toán.</p>}
              <div className={styles.paymentRows}><div><span>Số tiền</span><strong>{formatPrice(selectedBooking.total_amount)}</strong></div><div><span>Nội dung chuyển khoản</span><strong>{selectedBooking.payment_code}</strong></div>{selectedBooking.bank.account_number && <div><span>Tài khoản nhận</span><strong>{selectedBooking.bank.account_number} · {selectedBooking.bank.account_name}</strong></div>}</div>
              <p className={styles.paymentHint}>Sau khi SePay xác nhận giao dịch, trạng thái đơn sẽ tự động cập nhật.</p>
            </div>}

            {selectedBooking.payment && <div className={styles.paymentSummary}><h3>Giao dịch gần nhất</h3><div><span>Nhà cung cấp</span><strong>{selectedBooking.payment.provider.toUpperCase()}</strong></div><div><span>Mã giao dịch</span><strong>{selectedBooking.payment.provider_transaction_id || '—'}</strong></div><div><span>Thời gian thanh toán</span><strong>{formatDate(selectedBooking.payment.paid_at, true)}</strong></div><div><span>Số tiền ghi nhận</span><strong>{formatPrice(selectedBooking.payment.transfer_amount)}</strong></div></div>}

            <div className={styles.modalActions}><Link className={styles.secondaryButton} to={`/tours/${selectedBooking.tour_id}`}>Xem tour</Link><Link className={styles.secondaryButton} to={`/payment-result?booking_id=${selectedBooking.id}`}>Theo dõi thanh toán</Link>{isPaymentPending(selectedBooking) && <button type="button" className={styles.textDanger} onClick={() => void cancelBooking(selectedBooking)} disabled={actionId === selectedBooking.id}>Hủy đơn</button>}</div>
          </>}
        </section>
      </div>}
    </div>
  )
}
