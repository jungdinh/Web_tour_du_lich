import { useEffect, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { bookingApi } from '@/api'
import { useAuthStore } from '@/stores/auth'
import type { Booking } from '@/types'
import styles from './PaymentResult.module.css'

const formatPrice = (price: number) => new Intl.NumberFormat('vi-VN', {
  style: 'currency',
  currency: 'VND',
  maximumFractionDigits: 0,
}).format(price)

const getStatusText = (booking: Booking | null) => {
  if (!booking) return 'Đang kiểm tra giao dịch'
  if (booking.payment_status === 'paid') return 'Thanh toán đã được xác nhận'
  if (booking.status === 'expired') return 'Đơn đã hết thời gian thanh toán'
  if (booking.status === 'cancelled') return 'Đơn đã được hủy'
  return 'Đang chờ xác nhận thanh toán'
}

export function PaymentResultPage() {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const { token } = useAuthStore()
  const [booking, setBooking] = useState<Booking | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const bookingId = Number(searchParams.get('booking_id'))
  const providerStatus = searchParams.get('status')

  useEffect(() => {
    if (!token) {
      navigate('/login', { replace: true })
      return
    }
    if (!Number.isInteger(bookingId) || bookingId <= 0) {
      setError('Không tìm thấy mã đơn đặt tour hợp lệ.')
      setLoading(false)
      return
    }

    let cancelled = false
    let timer: number | undefined

    const fetchBooking = async () => {
      try {
        const result = await bookingApi.getById(bookingId)
        if (cancelled) return
        setBooking(result)
        setError('')
        setLoading(false)
        if (
          result.payment_status === 'pending'
          && result.status === 'pending_payment'
          && providerStatus !== 'error'
          && providerStatus !== 'cancelled'
        ) {
          timer = window.setTimeout(fetchBooking, 5000)
        }
      } catch {
        if (cancelled) return
        setError('Không thể kiểm tra trạng thái đơn đặt tour. Vui lòng thử lại.')
        setLoading(false)
      }
    }

    void fetchBooking()
    return () => {
      cancelled = true
      if (timer !== undefined) window.clearTimeout(timer)
    }
  }, [bookingId, navigate, token])

  const isPaid = booking?.payment_status === 'paid'
  const isPending = booking?.payment_status === 'pending'

  return (
    <div className="container">
      <main className={styles.page}>
        <section className={`${styles.card} ${isPaid ? styles.success : ''}`}>
          <div className={styles.icon} aria-hidden="true">{isPaid ? '✓' : isPending ? '…' : '!'}</div>
          <p className={styles.eyebrow}>SEPAY PAYMENT GATEWAY</p>
          <h1>{getStatusText(booking)}</h1>
          <p className={styles.message}>
            {isPaid
              ? 'Đơn đặt tour của bạn đã được hệ thống ghi nhận.'
              : providerStatus === 'cancelled'
                ? 'Bạn đã hủy thao tác thanh toán. Đơn vẫn đang chờ thanh toán trong thời gian còn lại.'
                : providerStatus === 'error'
                  ? 'SePay không hoàn tất được giao dịch. Bạn có thể quay lại tour và tạo lại đơn nếu cần.'
                  : providerStatus === 'success'
                ? 'SePay đã chuyển bạn về trang này. Hệ thống đang đối chiếu IPN từ SePay, không chỉ dựa vào kết quả chuyển hướng.'
                : 'Bạn có thể giữ trang này mở; hệ thống sẽ tự kiểm tra lại trạng thái giao dịch.'}
          </p>

          {loading && <div className={styles.loading}>Đang tải thông tin đơn...</div>}
          {error && <div className={styles.error}>{error}</div>}

          {booking && (
            <div className={styles.details}>
              <div><span>Mã booking</span><strong>{booking.booking_code}</strong></div>
              <div><span>Tour</span><strong>{booking.tour_name}</strong></div>
              <div><span>Số tiền</span><strong>{formatPrice(booking.total_amount)}</strong></div>
              <div><span>Trạng thái</span><strong>{getStatusText(booking)}</strong></div>
            </div>
          )}

          <div className={styles.actions}>
            {booking && <Link className={styles.primary} to={`/tours/${booking.tour_id}`}>Xem lại tour</Link>}
            <Link className={styles.secondary} to="/profile">Về trang cá nhân</Link>
          </div>
        </section>
      </main>
    </div>
  )
}
