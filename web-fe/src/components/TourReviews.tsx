import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { Reply } from 'lucide-react'
import { tourApi } from '@/api'
import { useAuthStore } from '@/stores/auth'
import type { Review } from '@/types'
import { formatRatingToFive, normalizeRatingToFive } from '@/utils/rating'
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

const displayRating = (rating: number) => normalizeRatingToFive(rating)

const renderRatingStars = (rating: number) => {
  const normalizedRating = normalizeRatingToFive(rating)
  const fullStars = Math.floor(normalizedRating)
  const hasPartialStar = normalizedRating > fullStars && fullStars < 5

  return [1, 2, 3, 4, 5].map((star) => {
    const className = star <= fullStars
      ? styles.starFilled
      : hasPartialStar && star === fullStars + 1
        ? styles.starPartial
        : styles.starEmpty
    return <span key={star} className={className} aria-hidden="true">★</span>
  })
}

type AdminReplyEditorProps = {
  tourId: number
  review: Review
  onSaved: (review: Review) => void | Promise<void>
  onCancel: () => void
}

function AdminReplyEditor({ tourId, review, onSaved, onCancel }: AdminReplyEditorProps) {
  const [content, setContent] = useState(review.admin_reply?.content || '')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    setContent(review.admin_reply?.content || '')
  }, [review.admin_reply?.content])

  const saveReply = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (content.trim().length < 3) return
    setSubmitting(true)
    setError('')
    try {
      const updatedReview = await tourApi.saveAdminReviewReply(tourId, review.id, content)
      await onSaved(updatedReview)
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
          <button type="button" className={styles.cancelButton} onClick={onCancel} disabled={submitting}>Hủy</button>
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
  const [ownReviewLoaded, setOwnReviewLoaded] = useState(!token)
  const [form, setForm] = useState(defaultForm)
  const [submitting, setSubmitting] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [editingOwnReview, setEditingOwnReview] = useState(false)
  const [reviewMenuOpen, setReviewMenuOpen] = useState<number | null>(null)
  const [adminReplyMenuOpen, setAdminReplyMenuOpen] = useState<number | null>(null)
  const [editingAdminReplyId, setEditingAdminReplyId] = useState<number | null>(null)
  const [confirmDeleteAdminReplyId, setConfirmDeleteAdminReplyId] = useState<number | null>(null)
  const [deletingAdminReplyId, setDeletingAdminReplyId] = useState<number | null>(null)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const reviewMenuRef = useRef<HTMLDivElement>(null)
  const adminReplyMenuRef = useRef<HTMLDivElement>(null)

  const syncOwnReview = (review: Review | null) => {
    setMyReview(review)
    setForm(review ? { rating: Math.round(normalizeRatingToFive(review.rating)), content: review.content } : defaultForm)
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
      setOwnReviewLoaded(true)
      return () => { cancelled = true }
    }

    setOwnReviewLoaded(false)
    tourApi.getMyTourReview(tourId)
      .then((review) => {
        if (!cancelled) {
          syncOwnReview(review)
          setOwnReviewLoaded(true)
        }
      })
      .catch(() => {
        if (!cancelled) {
          syncOwnReview(null)
          setOwnReviewLoaded(true)
        }
      })

    return () => { cancelled = true }
  }, [token, tourId])

  useEffect(() => {
    if (reviewMenuOpen === null && adminReplyMenuOpen === null) return

    const closeMenu = (event: MouseEvent) => {
      const target = event.target as Node
      if (reviewMenuOpen !== null && !reviewMenuRef.current?.contains(target)) {
        setReviewMenuOpen(null)
      }
      if (adminReplyMenuOpen !== null && !adminReplyMenuRef.current?.contains(target)) {
        setAdminReplyMenuOpen(null)
      }
    }
    const closeMenuWithEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setReviewMenuOpen(null)
        setAdminReplyMenuOpen(null)
      }
    }

    document.addEventListener('mousedown', closeMenu)
    document.addEventListener('keydown', closeMenuWithEscape)
    return () => {
      document.removeEventListener('mousedown', closeMenu)
      document.removeEventListener('keydown', closeMenuWithEscape)
    }
  }, [adminReplyMenuOpen, reviewMenuOpen])

  const revealReview = (reviewId: number) => {
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        document.getElementById(`review-${reviewId}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      })
    })
  }

  const reload = async (pinnedReview?: Review) => {
    const [reviewPage, ownReview, updatedTour] = await Promise.all([
      tourApi.getTourReviews(tourId, 1, 10),
      token ? tourApi.getMyTourReview(tourId) : Promise.resolve(null),
      tourApi.getTourById(tourId),
    ])
    const matchingReview = pinnedReview
      ? reviewPage.data.find((review) => review.id === pinnedReview.id) || (ownReview?.id === pinnedReview.id ? ownReview : pinnedReview)
      : null
    const nextReviews = matchingReview
      ? [matchingReview, ...reviewPage.data.filter((review) => review.id !== matchingReview.id)]
      : reviewPage.data
    setReviews(nextReviews)
    setReviewCount(reviewPage.pagination.total)
    setPage(1)
    setTotalPages(Math.max(1, reviewPage.pagination.totalPages))
    syncOwnReview(ownReview)
    onStatsChange?.({
      averageRating: updatedTour.avg_rating,
      reviewCount: updatedTour.review_count,
    })
    if (pinnedReview) revealReview(pinnedReview.id)
  }

  const submitReview = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!token) return
    setSubmitting(true)
    setError('')
    setNotice('')
    try {
      let savedReview: Review
      if (myReview) {
        savedReview = await tourApi.updateTourReview(tourId, myReview.id, form)
        setNotice('Đã cập nhật bình luận của bạn.')
      } else {
        savedReview = await tourApi.createTourReview(tourId, form)
        setNotice('Đã gửi bình luận của bạn.')
      }
      setConfirmDelete(false)
      await reload(savedReview)
      setEditingOwnReview(false)
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
      setEditingOwnReview(false)
      setReviewMenuOpen(null)
      setNotice('Đã xóa bình luận của bạn.')
      await reload()
    } catch (requestError) {
      setError(getErrorMessage(requestError))
    } finally {
      setSubmitting(false)
    }
  }

  const deleteAdminReply = async (reviewId: number) => {
    setDeletingAdminReplyId(reviewId)
    setError('')
    setNotice('')
    try {
      await tourApi.deleteAdminReviewReply(tourId, reviewId)
      setReviews((current) => current.map((item) => item.id === reviewId ? { ...item, admin_reply: null } : item))
      setConfirmDeleteAdminReplyId(null)
      setEditingAdminReplyId(null)
      setNotice('Đã xóa phản hồi quản trị viên.')
    } catch (requestError) {
      setError(getErrorMessage(requestError))
    } finally {
      setDeletingAdminReplyId(null)
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

  const startEditingOwnReview = () => {
    if (!myReview) return
    setForm({ rating: Math.round(normalizeRatingToFive(myReview.rating)), content: myReview.content })
    setEditingOwnReview(true)
    setReviewMenuOpen(null)
    setConfirmDelete(false)
    setError('')
    setNotice('')
  }

  const cancelEditingOwnReview = () => {
    if (myReview) {
      setForm({ rating: Math.round(normalizeRatingToFive(myReview.rating)), content: myReview.content })
    }
    setEditingOwnReview(false)
    setError('')
  }

  const startEditingAdminReply = (reviewId: number) => {
    setEditingAdminReplyId(reviewId)
    setConfirmDeleteAdminReplyId(null)
    setEditingOwnReview(false)
    setConfirmDelete(false)
    setReviewMenuOpen(null)
    setAdminReplyMenuOpen(null)
    setError('')
    setNotice('')
  }

  return (
    <div className={styles.reviewPanel}>
      <div className={styles.reviewSummary}>
        <div className={styles.summaryScore}>{average}</div>
        <div>
          <div className={styles.summaryStars} aria-label={`${average} trên 5 sao`}>
            {renderRatingStars(Number(average))}
          </div>
          <div className={styles.summaryCaption}>Dựa trên {reviewCount} bình luận và đánh giá</div>
        </div>
      </div>

      {(!token || (ownReviewLoaded && !myReview)) && <section className={styles.composer} aria-labelledby="review-composer-title">
        <div className={styles.composerHeader}>
          <div>
            <span className={styles.eyebrow}>CHIA SẺ TRẢI NGHIỆM</span>
            <h3 id="review-composer-title">Bạn nghĩ gì về tour này?</h3>
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
                <button type="submit" className={styles.submitButton} disabled={submitting || form.content.trim().length < 3}>
                  {submitting ? 'Đang lưu...' : 'Gửi bình luận'}
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

      </section>}

      {error && <p className={styles.errorMessage} role="alert">{error}</p>}
      {notice && <p className={styles.successMessage} role="status">{notice}</p>}

      {reviews.length === 0 ? (
        <p className={styles.emptyState}>Chưa có bình luận nào. Hãy là người đầu tiên chia sẻ cảm nhận.</p>
      ) : (
        <div className={styles.reviewList}>
          {reviews.map((review) => {
            const rating = displayRating(review.rating)
            const isEdited = review.source === 'user' && review.updated_at && new Date(review.updated_at).getTime() > new Date(review.created_at).getTime() + 1000
            const isOwnReview = myReview?.id === review.id
            return (
              <article id={`review-${review.id}`} key={review.id} className={styles.reviewCard}>
                <div className={styles.reviewHeader}>
                  <div className={styles.avatar}>{(review.reviewer_name || 'K').charAt(0).toUpperCase()}</div>
                  <div className={styles.authorBlock}>
                    <strong>{review.reviewer_name || 'Khách du lịch'}</strong>
                    <span>{formatDate(review.created_at)}{isEdited ? ' · Đã chỉnh sửa' : ''}</span>
                  </div>
                  <div className={styles.reviewHeaderActions}>
                    <span className={review.source === 'user' ? styles.sourceUser : styles.sourceImported}>
                      {review.source === 'user' ? 'Khách hàng Vivu' : 'Đánh giá tham khảo'}
                    </span>
                    {isOwnReview && (
                      <div className={styles.reviewMenu} ref={reviewMenuOpen === review.id ? reviewMenuRef : undefined}>
                        <button
                          type="button"
                          className={styles.reviewMenuButton}
                          aria-label="Tùy chọn bình luận"
                          aria-haspopup="menu"
                          aria-expanded={reviewMenuOpen === review.id}
                          onClick={() => setReviewMenuOpen((openId) => openId === review.id ? null : review.id)}
                        >
                          <span aria-hidden="true">⋮</span>
                        </button>
                        {reviewMenuOpen === review.id && (
                          <div className={styles.reviewMenuDropdown} role="menu">
                            <button type="button" role="menuitem" onClick={startEditingOwnReview}>Chỉnh sửa bình luận</button>
                            <button
                              type="button"
                              role="menuitem"
                              className={styles.reviewMenuDelete}
                              onClick={() => {
                                setConfirmDelete(true)
                                setEditingOwnReview(false)
                                setReviewMenuOpen(null)
                              }}
                            >
                              Xóa bình luận
                            </button>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
                <div className={styles.reviewRating} aria-label={`${rating} trên 5 sao`}>
                  {renderRatingStars(rating)}
                  <span>{formatRatingToFive(review.rating)}</span>
                </div>
                <p className={styles.reviewText}>{review.content}</p>
                {isOwnReview && editingOwnReview && (
                  <form onSubmit={submitReview} className={styles.inlineEditForm}>
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
                    <label className={styles.fieldLabel} htmlFor={`tour-review-content-edit-${review.id}`}>Nội dung bình luận</label>
                    <textarea
                      id={`tour-review-content-edit-${review.id}`}
                      value={form.content}
                      maxLength={2000}
                      minLength={3}
                      required
                      autoFocus
                      onChange={(event) => setForm((current) => ({ ...current, content: event.target.value }))}
                    />
                    <div className={styles.formFooter}>
                      <span className={styles.characterCount}>{form.content.length}/2000</span>
                      <div className={styles.formActions}>
                        <button type="button" className={styles.cancelButton} onClick={cancelEditingOwnReview} disabled={submitting}>Hủy</button>
                        <button type="submit" className={styles.submitButton} disabled={submitting || form.content.trim().length < 3}>
                          {submitting ? 'Đang lưu...' : 'Lưu thay đổi'}
                        </button>
                      </div>
                    </div>
                  </form>
                )}
                {isOwnReview && confirmDelete && (
                  <div className={styles.deleteReviewConfirm} role="alert">
                    <span>Bạn có chắc muốn xóa bình luận này?</span>
                    <div>
                      <button type="button" className={styles.cancelButton} onClick={() => setConfirmDelete(false)} disabled={submitting}>Hủy</button>
                      <button type="button" className={styles.confirmDeleteButton} onClick={() => void deleteReview()} disabled={submitting}>
                        {submitting ? 'Đang xóa...' : 'Xóa'}
                      </button>
                    </div>
                  </div>
                )}
                {review.admin_reply && (
                  <div className={styles.adminReply}>
                    <div className={styles.adminReplyHeader}>
                      <strong>Phản hồi từ {review.admin_reply.admin_name}</strong>
                      <div className={styles.adminReplyHeaderActions}>
                        <span>{formatDate(review.admin_reply.updated_at)}</span>
                        {user?.role === 'admin' && (
                          <div className={styles.reviewMenu} ref={adminReplyMenuOpen === review.id ? adminReplyMenuRef : undefined}>
                            <button
                              type="button"
                              className={styles.reviewMenuButton}
                              aria-label="Tùy chọn phản hồi quản trị"
                              aria-haspopup="menu"
                              aria-expanded={adminReplyMenuOpen === review.id}
                              onClick={() => setAdminReplyMenuOpen((openId) => openId === review.id ? null : review.id)}
                            >
                              <span aria-hidden="true">⋮</span>
                            </button>
                            {adminReplyMenuOpen === review.id && (
                              <div className={styles.reviewMenuDropdown} role="menu">
                                <button type="button" role="menuitem" onClick={() => startEditingAdminReply(review.id)}>Chỉnh sửa phản hồi</button>
                                <button
                                  type="button"
                                  role="menuitem"
                                  className={styles.reviewMenuDelete}
                                  onClick={() => {
                                    setConfirmDeleteAdminReplyId(review.id)
                                    setEditingAdminReplyId(null)
                                    setAdminReplyMenuOpen(null)
                                  }}
                                >
                                  Xóa phản hồi
                                </button>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                    <p>{review.admin_reply.content}</p>
                  </div>
                )}
                {user?.role === 'admin' && review.source === 'user' && !review.admin_reply && editingAdminReplyId !== review.id && (
                  <button type="button" className={styles.adminReplyAction} onClick={() => startEditingAdminReply(review.id)}>
                    <Reply size={16} aria-hidden="true" />
                    Phản hồi khách hàng
                  </button>
                )}
                {user?.role === 'admin' && editingAdminReplyId === review.id && (
                  <AdminReplyEditor
                    tourId={tourId}
                    review={review}
                    onSaved={async (updatedReview) => {
                      await reload(updatedReview)
                      setEditingAdminReplyId(null)
                      setNotice('Đã lưu phản hồi quản trị viên.')
                    }}
                    onCancel={() => setEditingAdminReplyId(null)}
                  />
                )}
                {user?.role === 'admin' && confirmDeleteAdminReplyId === review.id && (
                  <div className={styles.deleteReviewConfirm} role="alert">
                    <span>Bạn có chắc muốn xóa phản hồi quản trị này?</span>
                    <div>
                      <button type="button" className={styles.cancelButton} onClick={() => setConfirmDeleteAdminReplyId(null)} disabled={deletingAdminReplyId === review.id}>Hủy</button>
                      <button type="button" className={styles.confirmDeleteButton} onClick={() => void deleteAdminReply(review.id)} disabled={deletingAdminReplyId === review.id}>
                        {deletingAdminReplyId === review.id ? 'Đang xóa...' : 'Xóa phản hồi'}
                      </button>
                    </div>
                  </div>
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
