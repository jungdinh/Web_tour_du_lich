import { FormEvent, useState } from 'react'
import { BellRing, Search, Send, X } from 'lucide-react'
import { adminApi } from '@/api'
import type { AdminUser, CreateNotificationPayload, NotificationPriority, NotificationType } from '@/types'
import styles from './AdminNotificationsPanel.module.css'

const initialForm: CreateNotificationPayload = {
  type: 'system', priority: 'normal', title: '', body: '', action_url: '', action_label: '', audience: 'all', recipient_ids: [],
}
const notificationTargets = [
  { url: '', label: '', name: 'Chỉ hiển thị thông báo' },
  { url: '/', label: 'Về trang chủ', name: 'Trang chủ' },
  { url: '/search', label: 'Khám phá tour', name: 'Trang tìm kiếm tour' },
  { url: '/bookings', label: 'Xem đặt tour', name: 'Lịch sử đặt tour' },
  { url: '/favorites', label: 'Xem tour yêu thích', name: 'Tour yêu thích' },
  { url: '/recommendations', label: 'Xem gợi ý', name: 'Gợi ý dành cho tôi' },
  { url: '/profile', label: 'Xem hồ sơ', name: 'Hồ sơ cá nhân' },
  { url: '/settings', label: 'Mở cài đặt', name: 'Cài đặt tài khoản' },
]
const defaultTargetByType: Record<NotificationType, string> = {
  system: '', promotion: '/search', booking: '/bookings', payment: '/bookings', tour: '/search', account: '/settings',
}
const getErrorMessage = (error: unknown) => {
  if (typeof error === 'object' && error !== null && 'response' in error) {
    const response = (error as { response?: { data?: { error?: unknown } } }).response
    if (typeof response?.data?.error === 'string') return response.data.error
  }
  return 'Không thể gửi thông báo. Vui lòng thử lại.'
}

export function AdminNotificationsPanel() {
  const [form, setForm] = useState<CreateNotificationPayload>(initialForm)
  const [search, setSearch] = useState('')
  const [results, setResults] = useState<AdminUser[]>([])
  const [selectedUsers, setSelectedUsers] = useState<AdminUser[]>([])
  const [searching, setSearching] = useState(false)
  const [sending, setSending] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  const update = <K extends keyof CreateNotificationPayload>(key: K, value: CreateNotificationPayload[K]) => setForm((current) => ({ ...current, [key]: value }))
  const updateType = (type: NotificationType) => {
    const target = notificationTargets.find((item) => item.url === defaultTargetByType[type]) || notificationTargets[0]
    setForm((current) => ({ ...current, type, action_url: target.url, action_label: target.label }))
  }
  const updateTarget = (url: string) => {
    const target = notificationTargets.find((item) => item.url === url) || notificationTargets[0]
    setForm((current) => ({ ...current, action_url: target.url, action_label: target.label }))
  }
  const searchUsers = async () => {
    setSearching(true); setError('')
    try {
      const response = await adminApi.getUsers({ page: 1, limit: 20, search: search.trim() || undefined, role: 'user', isActive: 'active' })
      setResults(response.data.filter((user) => !selectedUsers.some((selected) => selected.id === user.id)))
    } catch (requestError) { setError(getErrorMessage(requestError)) }
    finally { setSearching(false) }
  }
  const addUser = (user: AdminUser) => {
    setSelectedUsers((current) => [...current, user]); setResults((current) => current.filter((item) => item.id !== user.id))
  }
  const removeUser = (userId: number) => setSelectedUsers((current) => current.filter((user) => user.id !== userId))
  const submit = (event: FormEvent) => {
    event.preventDefault(); setError(''); setMessage('')
    const actionUrl = form.action_url?.trim() || null
    if (actionUrl && (!actionUrl.startsWith('/') || actionUrl.startsWith('//'))) { setError('Đường dẫn hành động phải là đường dẫn nội bộ, ví dụ /bookings.'); return }
    if (form.audience === 'selected' && selectedUsers.length === 0) { setError('Hãy chọn ít nhất một người nhận.'); return }
    setConfirmOpen(true)
  }
  const sendNotification = async () => {
    const actionUrl = form.action_url?.trim() || null
    setSending(true)
    try {
      const result = await adminApi.createNotification({ ...form, action_url: actionUrl, action_label: form.action_label?.trim() || null, recipient_ids: selectedUsers.map((user) => user.id) })
      setMessage(`Đã gửi thông báo đến ${result.recipient_count} người dùng.`); setForm(initialForm); setSelectedUsers([]); setResults([]); setSearch(''); setConfirmOpen(false)
    } catch (requestError) { setError(getErrorMessage(requestError)) }
    finally { setSending(false) }
  }

  const recipientPicker = form.audience === 'selected' ? <section className={styles.recipients}><div className={styles.sectionHeading}><div><strong>Chọn người nhận</strong><span>Tối đa 500 người dùng cho mỗi lần gửi.</span></div><span className={styles.count}>{selectedUsers.length} đã chọn</span></div><div className={styles.searchForm}><Search size={17} aria-hidden='true' /><input value={search} onChange={(event) => setSearch(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); void searchUsers() } }} placeholder='Tìm theo tên hoặc email' aria-label='Tìm người nhận' /><button type='button' onClick={() => void searchUsers()} disabled={searching}>{searching ? 'Đang tìm...' : 'Tìm'}</button></div>{selectedUsers.length ? <div className={styles.chips}>{selectedUsers.map((user) => <span key={user.id}>{user.name}<button type='button' onClick={() => removeUser(user.id)} aria-label={`Bỏ chọn ${user.name}`}><X size={13} /></button></span>)}</div> : null}{results.length ? <div className={styles.userResults}>{results.map((user) => <button type='button' key={user.id} onClick={() => addUser(user)}><span><strong>{user.name}</strong><small>{user.email}</small></span><b>Thêm</b></button>)}</div> : null}</section> : null
  const preview = <><aside className={styles.preview}><span>Xem trước</span><div className={styles.previewCard}><div className={styles.previewIcon}><BellRing size={20} /></div><div><small>{form.type} · {form.priority}</small><strong>{form.title || 'Tiêu đề thông báo'}</strong><p>{form.body || 'Nội dung thông báo sẽ xuất hiện ở đây.'}</p>{form.action_label ? <b>{form.action_label}</b> : null}</div></div><p>Người nhận: {form.audience === 'all' ? 'Tất cả người dùng đang hoạt động' : `${selectedUsers.length} người dùng đã chọn`}</p></aside>{confirmOpen ? <div className={styles.modalBackdrop} role='presentation' onMouseDown={(event) => { if (event.target === event.currentTarget && !sending) setConfirmOpen(false) }}><section className={styles.confirmModal} role='dialog' aria-modal='true' aria-labelledby='notification-confirm-title'><button type='button' className={styles.modalClose} onClick={() => setConfirmOpen(false)} disabled={sending} aria-label='Đóng'><X size={18} /></button><div className={styles.confirmIcon}><Send size={22} /></div><span>XÁC NHẬN GỬI</span><h3 id='notification-confirm-title'>Gửi thông báo này?</h3><p>Thông báo sẽ được gửi đến <strong>{form.audience === 'all' ? 'toàn bộ người dùng đang hoạt động' : `${selectedUsers.length} người dùng đã chọn`}</strong>.</p><div className={styles.confirmActions}><button type='button' className={styles.cancelButton} onClick={() => setConfirmOpen(false)} disabled={sending}>Hủy</button><button type='button' className={styles.confirmButton} onClick={() => void sendNotification()} disabled={sending}><Send size={16} />{sending ? 'Đang gửi...' : 'Gửi thông báo'}</button></div></section></div> : null}</>

  return <section className={styles.panel}><div className={styles.intro}><div className={styles.introIcon}><BellRing size={24} /></div><div><span>TRUNG TÂM THÔNG BÁO</span><h2>Gửi thông báo đến người dùng</h2><p>Tạo thông báo chung hoặc chọn những tài khoản cụ thể.</p></div></div>{message ? <p className={styles.success} role='status'>{message}</p> : null}{error ? <p className={styles.error} role='alert'>{error}</p> : null}<div className={styles.layout}><form className={styles.form} onSubmit={submit}><div className={styles.twoColumns}><label><span>Loại thông báo</span><select value={form.type} onChange={(event) => updateType(event.target.value as NotificationType)}><option value='system'>Hệ thống</option><option value='promotion'>Ưu đãi</option><option value='booking'>Đặt tour</option><option value='payment'>Thanh toán</option><option value='tour'>Tour</option><option value='account'>Tài khoản</option></select></label><label><span>Mức ưu tiên</span><select value={form.priority} onChange={(event) => update('priority', event.target.value as NotificationPriority)}><option value='normal'>Bình thường</option><option value='important'>Quan trọng</option><option value='urgent'>Khẩn cấp</option></select></label></div><fieldset className={styles.audience}><legend>Đối tượng nhận</legend><label><input type='radio' checked={form.audience === 'all'} onChange={() => update('audience', 'all')} /> Tất cả người dùng đang hoạt động</label><label><input type='radio' checked={form.audience === 'selected'} onChange={() => update('audience', 'selected')} /> Chọn người dùng cụ thể</label></fieldset>{recipientPicker}<label><span>Tiêu đề</span><input value={form.title} onChange={(event) => update('title', event.target.value)} maxLength={160} required placeholder='Ví dụ: Ưu đãi tour hè' /></label><label><span>Nội dung</span><textarea value={form.body} onChange={(event) => update('body', event.target.value)} maxLength={5000} required rows={6} placeholder='Nhập nội dung thông báo...' /></label><label><span>Khi người dùng bấm thông báo</span><select value={form.action_url || ''} onChange={(event) => updateTarget(event.target.value)}>{notificationTargets.map((target) => <option value={target.url} key={target.url || 'none'}>{target.name}</option>)}</select><small>Hệ thống tự chọn mục phù hợp theo loại thông báo; bạn có thể đổi lại tại đây.</small></label><button className={styles.submit} type='submit' disabled={sending}><Send size={17} />{sending ? 'Đang gửi...' : 'Gửi thông báo'}</button></form>{preview}</div></section>
}
