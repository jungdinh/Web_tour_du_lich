import { useCallback, useEffect, useRef, useState } from 'react'
import { Bell, CheckCheck, ChevronRight } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { notificationApi } from '@/api'
import type { NotificationItem, NotificationType } from '@/types'
import styles from './NotificationBell.module.css'

const labels: Record<NotificationType, string> = {
  system: 'Hệ thống', promotion: 'Ưu đãi', booking: 'Đặt tour', payment: 'Thanh toán', tour: 'Tour', account: 'Tài khoản',
}
const formatTime = (value: string) => new Intl.DateTimeFormat('vi-VN', {
  day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
}).format(new Date(value))

export function NotificationBell() {
  const navigate = useNavigate()
  const rootRef = useRef<HTMLDivElement>(null)
  const [open, setOpen] = useState(false)
  const [items, setItems] = useState<NotificationItem[]>([])
  const [unread, setUnread] = useState(0)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const loadCount = useCallback(async () => {
    try { setUnread(await notificationApi.getUnreadCount()) } catch { return }
  }, [])
  const loadItems = useCallback(async () => {
    setLoading(true); setError('')
    try { setItems((await notificationApi.getAll(1, 10)).data) }
    catch { setError('Không thể tải thông báo. Vui lòng thử lại.') }
    finally { setLoading(false) }
  }, [])

  useEffect(() => {
    void loadCount()
    const timer = window.setInterval(() => void loadCount(), 60_000)
    const onVisible = () => document.visibilityState === 'visible' && void loadCount()
    document.addEventListener('visibilitychange', onVisible)
    return () => { window.clearInterval(timer); document.removeEventListener('visibilitychange', onVisible) }
  }, [loadCount])
  useEffect(() => {
    const onOutside = (event: MouseEvent) => !rootRef.current?.contains(event.target as Node) && setOpen(false)
    document.addEventListener('mousedown', onOutside)
    return () => document.removeEventListener('mousedown', onOutside)
  }, [])

  const toggle = () => {
    const next = !open; setOpen(next)
    if (next) void loadItems()
  }
  const selectItem = async (item: NotificationItem) => {
    if (!item.is_read) {
      setItems((current) => current.map((entry) => entry.id === item.id ? { ...entry, is_read: true } : entry))
      setUnread((count) => Math.max(0, count - 1))
      try { await notificationApi.markAsRead(item.id) } catch { void loadCount() }
    }
    setOpen(false)
    if (item.action_url?.startsWith('/') && !item.action_url.startsWith('//')) navigate(item.action_url)
  }
  const readAll = async () => {
    setItems((current) => current.map((item) => ({ ...item, is_read: true }))); setUnread(0)
    try { await notificationApi.markAllAsRead() } catch { void loadItems(); void loadCount() }
  }

  return <div className={styles.root} ref={rootRef}><button type='button' className={styles.trigger} onClick={toggle} aria-label={unread ? `Thông báo, ${unread} chưa đọc` : 'Thông báo'} aria-haspopup='dialog' aria-expanded={open}><Bell size={20} aria-hidden='true' />{unread > 0 ? <span className={styles.badge}>{unread > 99 ? '99+' : unread}</span> : null}</button>{open ? <section className={styles.dropdown} role='dialog' aria-label='Danh sách thông báo'><header className={styles.header}><div><strong>Thông báo</strong><span>{unread ? `${unread} chưa đọc` : 'Đã đọc tất cả'}</span></div>{unread > 0 ? <button type='button' onClick={readAll}><CheckCheck size={16} /> Đọc tất cả</button> : null}</header><div className={styles.list} aria-live='polite'>{loading ? <p className={styles.state}>Đang tải thông báo...</p> : null}{!loading && error ? <p className={styles.error} role='alert'>{error}</p> : null}{!loading && !error && !items.length ? <p className={styles.state}>Bạn chưa có thông báo nào.</p> : null}{!loading && !error ? items.map((item) => <button type='button' key={item.id} className={`${styles.item} ${item.is_read ? '' : styles.unread}`} onClick={() => void selectItem(item)}><span className={`${styles.typeIcon} ${styles[item.type]}`} aria-hidden='true'>{labels[item.type].charAt(0)}</span><span className={styles.content}><span className={styles.meta}><span>{labels[item.type]}</span><time dateTime={item.published_at}>{formatTime(item.published_at)}</time></span><strong>{item.title}</strong><span className={styles.body}>{item.body}</span>{item.action_label ? <span className={styles.action}>{item.action_label}</span> : null}</span>{!item.is_read ? <span className={styles.unreadDot} aria-label='Chưa đọc' /> : null}{item.action_url ? <ChevronRight className={styles.chevron} size={16} aria-hidden='true' /> : null}</button>) : null}</div></section> : null}</div>
}
