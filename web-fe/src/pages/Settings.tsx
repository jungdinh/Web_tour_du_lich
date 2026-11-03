import { useCallback, useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { settingsApi } from '@/api'
import { GoogleSignInButton } from '@/components/GoogleSignInButton'
import { preferenceGroups, preferenceMeta } from '@/data/preferencePresentation'
import { useAuthStore } from '@/stores/auth'
import type { SettingsData, Tag } from '@/types'
import styles from './Settings.module.css'

type Notice = { type: 'success' | 'error'; message: string } | null

const getErrorMessage = (error: unknown, fallback: string) => {
  const response = error as { response?: { data?: { error?: unknown } } }
  return typeof response.response?.data?.error === 'string'
    ? response.response.data.error
    : fallback
}

export function SettingsPage() {
  const { setAuth } = useAuthStore()
  const [settings, setSettings] = useState<SettingsData | null>(null)
  const [selectedPreferences, setSelectedPreferences] = useState<Map<string, number>>(new Map())
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [loading, setLoading] = useState(true)
  const [passwordLoading, setPasswordLoading] = useState(false)
  const [preferencesLoading, setPreferencesLoading] = useState(false)
  const [historyAction, setHistoryAction] = useState<'search' | 'chat' | null>(null)
  const [googleLoading, setGoogleLoading] = useState(false)
  const [notice, setNotice] = useState<Notice>(null)

  const loadSettings = useCallback(async () => {
    try {
      const data = await settingsApi.getSettings()
      setSettings(data)
      setSelectedPreferences(new Map(data.preferences.map(({ tag, weight }) => [tag, weight])))
    } catch (error) {
      setNotice({ type: 'error', message: getErrorMessage(error, 'Không thể tải cài đặt.') })
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadSettings()
  }, [loadSettings])

  const handlePasswordSubmit = async (event: FormEvent) => {
    event.preventDefault()
    if (!settings) return
    if (newPassword !== confirmPassword) {
      setNotice({ type: 'error', message: 'Mật khẩu xác nhận không khớp.' })
      return
    }

    setPasswordLoading(true)
    setNotice(null)
    try {
      const result = await settingsApi.updatePassword(
        settings.account.has_password ? currentPassword : undefined,
        newPassword,
      )
      setCurrentPassword('')
      setNewPassword('')
      setConfirmPassword('')
      setNotice({ type: 'success', message: result.message })
      await loadSettings()
    } catch (error) {
      setNotice({ type: 'error', message: getErrorMessage(error, 'Không thể cập nhật mật khẩu.') })
    } finally {
      setPasswordLoading(false)
    }
  }

  const togglePreference = (tag: string) => {
    setSelectedPreferences((current) => {
      const next = new Map(current)
      if (next.has(tag)) next.delete(tag)
      else next.set(tag, 0.7)
      return next
    })
  }

  const handlePreferencesSave = async () => {
    setPreferencesLoading(true)
    setNotice(null)
    try {
      const preferences: Tag[] = [...selectedPreferences].map(([tag, weight]) => ({ tag, weight }))
      const result = await settingsApi.updatePreferences(preferences)
      setNotice({ type: 'success', message: result.message })
      await loadSettings()
    } catch (error) {
      setNotice({ type: 'error', message: getErrorMessage(error, 'Không thể cập nhật sở thích.') })
    } finally {
      setPreferencesLoading(false)
    }
  }

  const handleDeleteHistory = async (type: 'search' | 'chat') => {
    const historyLabel = type === 'search' ? 'lịch sử tìm kiếm' : 'lịch sử trò chuyện AI'
    if (!window.confirm(`Bạn có chắc muốn xóa toàn bộ ${historyLabel}? Thao tác này không thể hoàn tác.`)) return

    setHistoryAction(type)
    setNotice(null)
    try {
      const result = type === 'search'
        ? await settingsApi.deleteSearchHistory()
        : await settingsApi.deleteChatHistory()
      setNotice({ type: 'success', message: result.message })
    } catch (error) {
      setNotice({ type: 'error', message: getErrorMessage(error, `Không thể xóa ${historyLabel}.`) })
    } finally {
      setHistoryAction(null)
    }
  }

  const handleUnlinkGoogle = async () => {
    if (!window.confirm('Bạn có chắc muốn ngắt liên kết đăng nhập Google?')) return
    setGoogleLoading(true)
    setNotice(null)
    try {
      const result = await settingsApi.unlinkGoogle()
      setNotice({ type: 'success', message: result.message })
      await loadSettings()
    } catch (error) {
      setNotice({ type: 'error', message: getErrorMessage(error, 'Không thể ngắt liên kết Google.') })
    } finally {
      setGoogleLoading(false)
    }
  }

  if (loading) return <div className={styles.state}>Đang tải cài đặt...</div>
  if (!settings) return <div className={styles.state}>Không thể tải cài đặt tài khoản.</div>

  return (
    <div className='container'>
      <div className={styles.page}>
        <header className={styles.pageHeader}>
          <span className={styles.eyebrow}>Tài khoản Vivu</span>
          <h1>Cài đặt</h1>
          <p>Quản lý bảo mật tài khoản và dữ liệu dùng để cá nhân hóa gợi ý tour.</p>
        </header>

        {notice && (
          <div className={`${styles.notice} ${notice.type === 'success' ? styles.noticeSuccess : styles.noticeError}`} role='alert'>
            {notice.message}
          </div>
        )}

        <section className={styles.section} aria-labelledby='security-title'>
          <div className={styles.sectionHeading}>
            <h2 id='security-title'>Bảo mật tài khoản</h2>
            <p>Kiểm tra email, mật khẩu và phương thức đăng nhập.</p>
          </div>

          <div className={styles.statusGrid}>
            <div className={styles.statusCard}>
              <div className={styles.statusHeader}>
                <span className={styles.statusLabel}>Email</span>
                <span className={settings.account.email_verified ? styles.verified : styles.unverified}>
                  {settings.account.email_verified ? '✓ Đã xác minh' : '! Chưa xác minh'}
                </span>
              </div>
              <strong>{settings.account.email}</strong>
            </div>
            <div className={styles.statusCard}>
              <div className={styles.statusHeader}>
                <span className={styles.statusLabel}>Đăng nhập Google</span>
                <strong>{settings.account.google_linked ? 'Đã liên kết' : 'Chưa liên kết'}</strong>
              </div>
              {settings.account.google_linked ? (
                <button
                  type='button'
                  className={styles.textButton}
                  disabled={googleLoading || !settings.account.has_password}
                  onClick={() => void handleUnlinkGoogle()}
                >
                  {googleLoading ? 'Đang xử lý...' : 'Ngắt liên kết'}
                </button>
              ) : (
                <div className={styles.googleLinkBlock}>
                  <small>
                    Email Google đã xác minh sẽ trở thành email đăng nhập chính và thay thế {settings.account.email}.
                    Mật khẩu cùng toàn bộ dữ liệu tài khoản vẫn được giữ nguyên.
                  </small>
                  <GoogleSignInButton
                    mode='link'
                    authenticate={settingsApi.linkGoogle}
                    onSuccess={(data) => {
                      setAuth(data.user, data.token)
                      setNotice({ type: 'success', message: `Đã liên kết Google. Email đăng nhập mới là ${data.user.email}.` })
                      void loadSettings()
                    }}
                    onError={(message) => setNotice({ type: 'error', message })}
                  />
                </div>
              )}
              {settings.account.google_linked && !settings.account.has_password && (
                <small>Hãy tạo mật khẩu trước khi ngắt liên kết.</small>
              )}
            </div>
          </div>

          <form className={styles.passwordForm} onSubmit={handlePasswordSubmit}>
            <div className={styles.formTitle}>
              <h3>{settings.account.has_password ? 'Đổi mật khẩu' : 'Tạo mật khẩu'}</h3>
              <p>{settings.account.has_password ? 'Nhập mật khẩu hiện tại để xác nhận thay đổi.' : 'Tạo mật khẩu để có thêm một phương thức đăng nhập.'}</p>
            </div>
            {settings.account.has_password && (
              <label>
                <span>Mật khẩu hiện tại</span>
                <input type='password' autoComplete='current-password' value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} required />
              </label>
            )}
            <div className={styles.formRow}>
              <label>
                <span>Mật khẩu mới</span>
                <input type='password' autoComplete='new-password' value={newPassword} onChange={(event) => setNewPassword(event.target.value)} required />
              </label>
              <label>
                <span>Xác nhận mật khẩu mới</span>
                <input type='password' autoComplete='new-password' value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} required />
              </label>
            </div>
            <button className={styles.primaryButton} type='submit' disabled={passwordLoading}>
              {passwordLoading ? 'Đang cập nhật...' : settings.account.has_password ? 'Đổi mật khẩu' : 'Tạo mật khẩu'}
            </button>
          </form>
        </section>

        <section className={styles.section} aria-labelledby='personalization-title'>
          <div className={styles.sectionHeading}>
            <h2 id='personalization-title'>Cá nhân hóa gợi ý</h2>
            <p>Xem những gì AI đã học và chủ động điều chỉnh sở thích du lịch.</p>
          </div>

          <div className={styles.preferenceEditor}>
            <div>
              <h3>Điều chỉnh sở thích du lịch</h3>
              <p>Chọn những yếu tố bạn muốn Vivu ưu tiên. Hồ sơ tổng quan được hiển thị tại trang Hồ sơ cá nhân.</p>
            </div>
            <div className={styles.preferenceGroups}>
              {preferenceGroups.map((group) => (
                <div className={styles.preferenceGroup} key={group.id}>
                  <div className={styles.preferenceGroupHeading}>
                    <h4>{group.title}</h4>
                    <p>{group.description}</p>
                  </div>
                  <div className={styles.chipList}>
                    {settings.preference_catalog
                      .filter(({ tag }) => preferenceMeta[tag]?.group === group.id)
                      .map(({ tag, label }) => {
                        const selected = selectedPreferences.has(tag)
                        return (
                          <button
                            type='button'
                            key={tag}
                            className={`${styles.chip} ${selected ? styles.chipSelected : ''}`}
                            aria-pressed={selected}
                            onClick={() => togglePreference(tag)}
                          >
                            <span aria-hidden='true'>{preferenceMeta[tag]?.icon || '✦'}</span>
                            {label}
                            {selected && <span className={styles.chipCheck}>✓</span>}
                          </button>
                        )
                      })}
                  </div>
                </div>
              ))}
            </div>
            <button className={styles.primaryButton} type='button' disabled={preferencesLoading} onClick={() => void handlePreferencesSave()}>
              {preferencesLoading ? 'Đang lưu...' : 'Lưu sở thích'}
            </button>
          </div>

          <div className={styles.historyBlock}>
            <div>
              <h3>Dữ liệu hoạt động</h3>
              <p>Xóa riêng từng loại lịch sử. Sở thích AI hiện tại không tự động bị xóa theo.</p>
            </div>
            <div className={styles.historyActions}>
              <button type='button' className={styles.dangerButton} disabled={historyAction !== null} onClick={() => void handleDeleteHistory('search')}>
                {historyAction === 'search' ? 'Đang xóa...' : 'Xóa lịch sử tìm kiếm'}
              </button>
              <button type='button' className={styles.dangerButton} disabled={historyAction !== null} onClick={() => void handleDeleteHistory('chat')}>
                {historyAction === 'chat' ? 'Đang xóa...' : 'Xóa lịch sử chat AI'}
              </button>
            </div>
          </div>
        </section>
      </div>
    </div>
  )
}
