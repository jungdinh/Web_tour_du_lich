import { FormEvent, useCallback, useEffect, useState } from 'react'
import { ExternalLink, MessageSquareText, Search, Star } from 'lucide-react'
import { Link } from 'react-router-dom'
import { adminApi } from '@/api'
import type { AdminCustomerReview, PaginatedResponse } from '@/types'
import styles from './AdminReviewsPanel.module.css'

const formatDateTime = (value: string) => new Intl.DateTimeFormat('vi-VN', {
  dateStyle: 'short', timeStyle: 'short',
}).format(new Date(value))

export function AdminReviewsPanel() {
  const [reviews, setReviews] = useState<PaginatedResponse<AdminCustomerReview> | null>(null)
  const [page, setPage] = useState(1)
  const [status, setStatus] = useState<'all' | 'pending' | 'replied'>('pending')
  const [search, setSearch] = useState('')
  const [submittedSearch, setSubmittedSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const loadReviews = useCallback(async () => {
    setLoading(true); setError('')
    try { setReviews(await adminApi.getReviews({ page, limit: 20, search: submittedSearch || undefined, status })) }
    catch { setError('Không thể tải danh sách bình luận.') }
    finally { setLoading(false) }
  }, [page, status, submittedSearch])

  useEffect(() => { void loadReviews() }, [loadReviews])
  const submitSearch = (event: FormEvent) => { event.preventDefault(); setPage(1); setSubmittedSearch(search.trim()) }
  const changeStatus = (nextStatus: 'all' | 'pending' | 'replied') => { setPage(1); setStatus(nextStatus) }
  const reviewCards = reviews?.data.map((review) => <article className={styles.reviewCard} key={review.id}><div className={styles.reviewTop}><div className={styles.avatar}>{review.user_name.charAt(0).toUpperCase()}</div><div className={styles.customer}><strong>{review.user_name}</strong><span>{review.user_email}</span></div><span className={review.admin_reply ? styles.replied : styles.pending}>{review.admin_reply ? 'Đã phản hồi' : 'Chờ phản hồi'}</span></div><div className={styles.tourRow}><div><span>Tour được đánh giá</span><strong>{review.tour_name}</strong><small>{review.destination}</small></div><div className={styles.rating}><Star size={15} /> {Number(review.rating).toFixed(1)}/5</div></div><p className={styles.content}>{review.content}</p><div className={styles.reviewFooter}><time dateTime={review.created_at}>{formatDateTime(review.created_at)}</time><Link to={`/tours/${review.tour_id}?tab=reviews&review=${review.id}`} className={styles.openLink}>Mở tour & phản hồi <ExternalLink size={15} /></Link></div>{review.admin_reply ? <div className={styles.replyPreview}><strong>Phản hồi của {review.admin_reply.admin_name}</strong><p>{review.admin_reply.content}</p></div> : null}</article>)

  return <section className={styles.panel}><header className={styles.header}><div className={styles.headerIcon}><MessageSquareText size={23} /></div><div><span>PHẢN HỒI KHÁCH HÀNG</span><h2>Bình luận về tour</h2><p>Theo dõi các đánh giá do khách hàng Vivu gửi và mở đúng tour để phản hồi.</p></div></header><div className={styles.toolbar}><form onSubmit={submitSearch} className={styles.searchForm}><Search size={17} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder='Tìm khách hàng, email, tour hoặc nội dung' aria-label='Tìm bình luận' /><button type='submit'>Tìm</button></form><div className={styles.filters}><button type='button' className={status === 'pending' ? styles.filterActive : ''} onClick={() => changeStatus('pending')}>Chờ phản hồi</button><button type='button' className={status === 'replied' ? styles.filterActive : ''} onClick={() => changeStatus('replied')}>Đã phản hồi</button><button type='button' className={status === 'all' ? styles.filterActive : ''} onClick={() => changeStatus('all')}>Tất cả</button></div></div>{reviews ? <div className={styles.summary}><strong>{reviews.pagination.total}</strong> bình luận phù hợp</div> : null}{loading ? <p className={styles.state}>Đang tải bình luận...</p> : null}{!loading && error ? <p className={styles.error} role='alert'>{error}</p> : null}{!loading && !error && !reviews?.data.length ? <p className={styles.state}>Không có bình luận nào trong nhóm này.</p> : null}{!loading && !error ? <div className={styles.list}>{reviewCards}</div> : null}{reviews && reviews.pagination.totalPages > 1 ? <div className={styles.pagination}><button type='button' onClick={() => setPage((current) => Math.max(1, current - 1))} disabled={page <= 1}>Trang trước</button><span>Trang {page}/{reviews.pagination.totalPages}</span><button type='button' onClick={() => setPage((current) => Math.min(reviews.pagination.totalPages, current + 1))} disabled={page >= reviews.pagination.totalPages}>Trang sau</button></div> : null}</section>
}
