import { useState } from 'react'
import { Link } from 'react-router-dom'
import { authApi } from '@/api'
import styles from './Auth.module.css'

export function ForgotPasswordPage() {
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [requested, setRequested] = useState(false)
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  const requestCode = async (event: React.FormEvent) => {
    event.preventDefault()
    setLoading(true)
    setError('')
    try {
      const response = await authApi.requestPasswordReset(email)
      setMessage(response.message)
      setRequested(true)
    } catch (requestError: any) {
      setError(requestError?.response?.data?.error || 'Không thể gửi yêu cầu lúc này.')
    } finally {
      setLoading(false)
    }
  }

  const resetPassword = async (event: React.FormEvent) => {
    event.preventDefault()
    setError('')
    if (password !== confirmPassword) return setError('Mật khẩu xác nhận không khớp.')
    setLoading(true)
    try {
      const response = await authApi.resetPassword(email, code, password)
      setMessage(response.message)
      setRequested(false)
      setCode('')
      setPassword('')
      setConfirmPassword('')
    } catch (requestError: any) {
      setError(requestError?.response?.data?.error || 'Không thể đặt lại mật khẩu.')
    } finally {
      setLoading(false)
    }
  }

  return <div className={styles.authPage}><div className={styles.authCard}>
    <h1 className={styles.title}>Quên mật khẩu</h1>
    <p>Vivu sẽ gửi mã xác minh 6 chữ số tới email đăng nhập của bạn.</p>
    {error && <div className={styles.error} role="alert">{error}</div>}
    {message && <div className={styles.successMessage} role="status">{message}</div>}
    {!requested ? <form className={styles.form} onSubmit={requestCode}>
      <div className={styles.field}><label htmlFor="reset-email">Email</label><input id="reset-email" type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} required /></div>
      <button className={styles.submitBtn} type="submit" disabled={loading}>{loading ? 'Đang gửi...' : 'Gửi mã đặt lại mật khẩu'}</button>
    </form> : <form className={styles.form} onSubmit={resetPassword}>
      <div className={styles.field}><label htmlFor="reset-code">Mã xác minh</label><input id="reset-code" inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code} onChange={(event) => setCode(event.target.value.replace(/\D/g, ''))} required /></div>
      <div className={styles.field}><label htmlFor="reset-password">Mật khẩu mới</label><input id="reset-password" type="password" autoComplete="new-password" minLength={12} maxLength={24} value={password} onChange={(event) => setPassword(event.target.value)} required /></div>
      <div className={styles.field}><label htmlFor="reset-confirm">Xác nhận mật khẩu</label><input id="reset-confirm" type="password" autoComplete="new-password" minLength={12} maxLength={24} value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} required /></div>
      <button className={styles.submitBtn} type="submit" disabled={loading}>{loading ? 'Đang cập nhật...' : 'Đặt lại mật khẩu'}</button>
    </form>}
    <p className={styles.switchAuth}><Link to="/login">Quay lại đăng nhập</Link></p>
  </div></div>
}
