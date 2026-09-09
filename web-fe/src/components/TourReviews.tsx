import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { tourApi } from '@/api'
import { useAuthStore } from '@/stores/auth'
import type { Review } from '@/types'
import { formatRatingToFive } from '@/utils/rating'
import styles from './TourReviews.module.css'

type TourReviewsProps = {
  tourId: number
  averageRating: number
  initialReviews: Review[]
  initialTotal: number
  onStatsChange?: (stats: { averageRating: number; reviewCount: number }) => void
}

const defaultForm = { rating: 5, content: '' }

const getErrorMessage = (error: unknown) => {
  const response = error as { response?: { data?: { error?: unknown } } }
  const apiError = response.response?.data?.error
  return typeof apiError === 'string' ? apiError : 'Không thể xử lý bình luận. Vui lòng thử lại.'
}

const formatDate = (value: string) => {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return new Intl.DateTimeFormat('vi-VN', { dateStyle: 'medium' }).format(date)
}

const displayRating = (rating: number) => rating > 0 ? rating : 4

type AdminReplyEditorProps = {
  tourId: number
  review: Review
  onSaved: (review: Review) => void
  onDeleted: (reviewId: number) => void
}

function AdminReplyEditor({ tourId, review, onSaved, onDeleted }: AdminReplyEditorProps) {
  const [content, setContent] = useState(review.admin_reply?.content || '')
  const [submitting, setSubmitting] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    setContent(review.admin_reply?.content || '')
    setConfirmDelete(false)
  }, [review.admin_reply?.content])

  const saveReply = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (content.trim().length < 3) return
    setSubmitting(true)
    setError('')
    try {
      const updatedReview = await tourApi.saveAdminReviewReply(tourId, review.id, content)
      onSaved(updatedReview)
    } catch (requestError) {
      setError(getErrorMessage(requestError))
    } finally {
      setSubmitting(false)
    }
  }

  const deleteReply = async () => {
    setSubmitting(true)
    setError('')
    try {
      await tourApi.deleteAdminReviewReply(tourId, review.id)
      onDeleted(review.id)
      setContent('')
      setConfirmDelete(false)
    } catch (requestError) {
      setError(getErrorMessage(requestError))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form className={styles.adminReplyEditor} onSubmit={saveReply}>
      <div className={styles.adminReplyEditorHeader}>
        <span className={styles.eyebrow}>PHẢN HỒI QUẢN TRỊ</span>
        <span className={styles.authorHint}>Chỉ quản trị viên nhìn thấy khu vực này</span>
      </div>
      <textarea
        value={content}
        maxLength={2000}
        minLength={3}
        required
        aria-label="Nội dung phản hồi của quản trị viên"
        placeholder="Viết phản hồi chính thức cho khách hàng..."
        onChange={(event) => setContent(event.target.value)}
      />
      <div className={styles.replyFooter}>
        <span className={styles.characterCount}>{content.length}/2000</span>
        <div className={styles.replyActions}>
          {review.admin_reply && (
            confirmDelete ? (
              <span className={styles.deletePrompt}>
                Xóa phản hồi?
                <button type="button" onClick={() => setConfirmDelete(false)} disabled={submitting}>Hủy</button>
                <button type="button" className={styles.deleteButton} onClick={() => void deleteReply()} disabled={submitting}>Xác nhận</button>
              </span>
            ) : (
              <button type="button" className={styles.textButton} onClick={() => setConfirmDelete(true)} disabled={submitting}>Xóa phản hồi</button>
            )
          )}
          <button type="submit" className={styles.replyButton} disabled={submitting || content.trim().length < 3}>
            {submitting ? 'Đang lưu...' : review.admin_reply ? 'Cập nhật phản hồi' : 'Gửi phản hồi'}
          </button>
        </div>
      </div>
      {error && <p className={styles.errorMessage} role="alert">{error}</p>}
    </form>
  )
}

export function TourReviews({ tourId, averageRating, initialReviews, initialTotal, onStatsChange }: TourReviewsProps) {
  const { token, user } = useAuthStore()
  const [reviews, setReviews] = useState<Review[]>(initialReviews)
  const [reviewCount, setReviewCount] = useState(initialTotal)
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(Math.max(1, Math.ceil(initialTotal / 10)))
  const [myReview, setMyReview] = useState<Review | null>(null)
  const [form, setForm] = useState(defaultForm)
  const [submitting, setSubmitting] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  const syncOwnReview = (review: Review | null) => {
    setMyReview(review)
    setForm(review ? { rating: Math.round(review.rating || 5), content: review.content } : defaultForm)
  }

  useEffect(() => {
    setReviews(initialReviews)
    setReviewCount(initialTotal)
    setPage(1)
    setTotalPages(Math.max(1, Math.ceil(initialTotal / 10)))
  }, [initialReviews, initialTotal])

  useEffect(() => {
    let cancelled = false
    if (!token) {
      syncOwnReview(null)
      return () => { cancelled = true }
    }

    tourApi.getMyTourReview(tourId)
      .then((review) => {
        if (!cancelled) syncOwnReview(review)
      })
      .catch(() => {
        if (!cancelled) syncOwnReview(null)
      })

    return () => { cancelled = true }
  }, [token, tourId])

  const reload = async () => {
    const [reviewPage, ownReview, updatedTour] = await Promise.all([
      tourApi.getTourReviews(tourId, 1, 10),
      token ? tourApi.getMyTourReview(tourId) : Promise.resolve(null),
      tourApi.getTourById(tourId),
    ])
    setReviews(reviewPage.data)
    setReviewCount(reviewPage.pagination.total)
    setPage(1)
    setTotalPages(Math.max(1, reviewPage.pagination.totalPages))
    syncOwnReview(ownReview)
    onStatsChange?.({
      averageRating: updatedTour.avg_rating,
      reviewCount: updatedTour.review_count,
    })
  }

  const submitReview = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!token) return
    setSubmitting(true)
    setError('')
    setNotice('')
    try {
      if (myReview) {
        await tourApi.updateTourReview(tourId, myReview.id, form)
        setNotice('Đã cập nhật bình luận của bạn.')
      } else {
        await tourApi.createTourReview(tourId, form)
        setNotice('Đã gửi bình luận của bạn.')
      }
      setConfirmDelete(false)
      await reload()
    } catch (requestError) {
      setError(getErrorMessage(requestError))
    } finally {
      setSubmitting(false)
    }
  }

  const deleteReview = async () => {
    if (!myReview) return
    setSubmitting(true)
    setError('')
    setNotice('')
    try {
      await tourApi.deleteTourReview(tourId, myReview.id)
      setConfirmDelete(false)
      setNotice('Đã xóa bình luận của bạn.')
      await reload()
    } catch (requestError) {
      setError(getErrorMessage(requestError))
    } finally {
      setSubmitting(false)
    }
  }

  const loadMore = async () => {
    if (loadingMore || page >= totalPages) return
    setLoadingMore(true)
    try {
      const nextPage = await tourApi.getTourReviews(tourId, page + 1, 10)
      setReviews((current) => [...current, ...nextPage.data])
      setPage(nextPage.pagination.page)
      setReviewCount(nextPage.pagination.total)
      setTotalPages(Math.max(1, nextPage.pagination.totalPages))
    } catch (requestError) {
      setError(getErrorMessage(requestError))
    } finally {
      setLoadingMore(false)
    }
  }

  const average = formatRatingToFive(averageRating)
  const filledSummaryStars = Math.round(Number(average))

  return (
    <div className={styles.reviewPanel}>
      <div className={styles.reviewSummary}>
        <div className={styles.summaryScore}>{average}</div>
        <div>
          <div className={styles.summaryStars} aria-label={`${average} trên 5 sao`}>
            {[1, 2, 3, 4, 5].map((star) => <span key={star} className={star <= filledSummaryStars ? styles.starFilled : styles.starEmpty}>★</span>)}
          </div>
          <div className={styles.summaryCaption}>Dựa trên {reviewCount} bình luận và đánh giá</div>
        </div>
      </div>

      <section className={styles.composer} aria-labelledby="review-composer-title">
        <div className={styles.composerHeader}>
          <div>
            <span className={styles.eyebrow}>CHIA SẺ TRẢI NGHIỆM</span>
            <h3 id="review-composer-title">{myReview ? 'Cập nhật bình luận của bạn' : 'Bạn nghĩ gì về tour này?'}</h3>
          </div>
          {user && <span className={styles.authorHint}>Đang viết với tên {user.name}</span>}
        </div>

        {token ? (
          <form onSubmit={submitReview} className={styles.form}>
            <div className={styles.ratingField}>
              <span className={styles.fieldLabel}>Mức đánh giá</span>
              <div className={styles.ratingButtons} role="radiogroup" aria-label="Chọn số sao">
                {[1, 2, 3, 4, 5].map((value) => (
                  <button
                    key={value}
                    type="button"
                    role="radio"
                    aria-checked={form.rating === value}
                    aria-label={`${value} sao`}
                    className={value <= form.rating ? styles.inputStarActive : styles.inputStar}
                    onClick={() => setForm((current) => ({ ...current, rating: value }))}
                  >
                    ★
                  </button>
                ))}
                <span className={styles.ratingValue}>{form.rating}/5</span>
              </div>
            </div>
            <label className={styles.fieldLabel} htmlFor="tour-review-content">Nội dung bình luận</label>
            <textarea
              id="tour-review-content"
              value={form.content}
              maxLength={2000}
              minLength={3}
              required
              placeholder="Chia sẻ điều bạn thích hoặc điều cần lưu ý về tour..."
              onChange={(event) => setForm((current) => ({ ...current, content: event.target.value }))}
            />
            <div className={styles.formFooter}>
              <span className={styles.characterCount}>{form.content.length}/2000</span>
              <div className={styles.formActions}>
                {myReview && (
                  confirmDelete ? (
                    <span className={styles.deletePrompt}>
                      Xóa bình luận này?
                      <button type="button" onClick={() => setConfirmDelete(false)} disabled={submitting}>Hủy</button>
                      <button type="button" className={styles.deleteButton} onClick={() => void deleteReview()} disabled={submitting}>Xác nhận</button>
                    </span>
                  ) : (
                    <button type="button" className={styles.textButton} onClick={() => setConfirmDelete(true)} disabled={submitting}>Xóa</button>
                  )
                )}
                <button type="submit" className={styles.submitButton} disabled={submitting || form.content.trim().length < 3}>
                  {submitting ? 'Đang lưu...' : myReview ? 'Lưu thay đổi' : 'Gửi bình luận'}
                </button>
              </div>
            </div>
          </form>
        ) : (
          <div className={styles.loginPrompt}>
            <span>Đăng nhập để chia sẻ trải nghiệm của bạn về tour này.</span>
            <Link to="/login" className={styles.loginLink}>Đăng nhập</Link>
          </div>
        )}

        {error && <p className={styles.errorMessage} role="alert">{error}</p>}
        {notice && <p className={styles.successMessage} role="status">{notice}</p>}
      </section>

      {reviews.length === 0 ? (
        <p className={styles.emptyState}>Chưa có bình luận nào. Hãy là người đầu tiên chia sẻ cảm nhận.</p>
      ) : (
        <div className={styles.reviewList}>
          {reviews.map((review) => {
            const rating = displayRating(review.rating)
            const isEdited = review.source === 'user' && review.updated_at && new Date(review.updated_at).getTime() > new Date(review.created_at).getTime() + 1000
            return (
              <article key={review.id} className={styles.reviewCard}>
                <div className={styles.reviewHeader}>
                  <div className={styles.avatar}>{(review.reviewer_name || 'K').charAt(0).toUpperCase()}</div>
                  <div className={styles.authorBlock}>
                    <strong>{review.reviewer_name || 'Khách du lịch'}</strong>
                    <span>{formatDate(review.created_at)}{isEdited ? ' · Đã chỉnh sửa' : ''}</span>
                  </div>
                  <span className={review.source === 'user' ? styles.sourceUser : styles.sourceImported}>
                    {review.source === 'user' ? 'Khách hàng TourAI' : 'Đánh giá tham khảo'}
                  </span>
                </div>
                <div className={styles.reviewRating} aria-label={`${rating} trên 5 sao`}>
                  {[1, 2, 3, 4, 5].map((star) => <span key={star} className={star <= Math.round(rating) ? styles.starFilled : styles.starEmpty}>★</span>)}
                  <span>{formatRatingToFive(review.rating)}</span>
                </div>
                <p className={styles.reviewText}>{review.content}</p>
                {review.admin_reply && (
                  <div className={styles.adminReply}>
                    <div className={styles.adminReplyHeader}>
                      <strong>Phản hồi từ {review.admin_reply.admin_name}</strong>
                      <span>{formatDate(review.admin_reply.updated_at)}</span>
                    </div>
                    <p>{review.admin_reply.content}</p>
                  </div>
                )}
                {user?.role === 'admin' && (
                  <AdminReplyEditor
                    tourId={tourId}
                    review={review}
                    onSaved={(updatedReview) => {
                      setReviews((current) => current.map((item) => item.id === updatedReview.id ? updatedReview : item))
                      setNotice('Đã lưu phản hồi quản trị viên.')
                    }}
                    onDeleted={(reviewId) => {
                      setReviews((current) => current.map((item) => item.id === reviewId ? { ...item, admin_reply: null } : item))
                      setNotice('Đã xóa phản hồi quản trị viên.')
                    }}
                  />
                )}
              </article>
            )
          })}
        </div>
      )}

      {page < totalPages && (
        <button type="button" className={styles.loadMore} onClick={() => void loadMore()} disabled={loadingMore}>
          {loadingMore ? 'Đang tải...' : 'Xem thêm bình luận'}
        </button>
      )}
    </div>
  )
}
