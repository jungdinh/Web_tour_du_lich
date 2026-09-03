import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { authApi } from '@/api'
import { useAuthStore } from '@/stores/auth'
import type { User } from '@/types'
import { GoogleSignInButton } from '@/components/GoogleSignInButton'
import styles from './Auth.module.css'

export function RegisterPage() {
  const navigate = useNavigate()
  const { setAuth } = useAuthStore()
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [code, setCode] = useState('')
  const [verificationRequired, setVerificationRequired] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(false)

  const handleRegister = async (event: React.FormEvent) => {
    event.preventDefault()
    setError('')
    setMessage('')
    if (password !== confirmPassword) {
      setError('Mật khẩu xác nhận không khớp')
      return
    }
    setLoading(true)
    try {
      const data = await authApi.register(name, email, password)
      setVerificationRequired(true)
      setMessage(data.message || 'Mã xác minh đã được gửi đến email của bạn.')
    } catch (err: unknown) {
      const response = err as { response?: { data?: { error?: string } } }
      setError(response.response?.data?.error || 'Đăng ký thất bại')
    } finally {
      setLoading(false)
    }
  }

  const handleVerify = async (event: React.FormEvent) => {
    event.preventDefault()
    setError('')
    setMessage('')
    setLoading(true)
    try {
      const data = await authApi.verifyEmail(email, code)
      setAuth(data.user, data.token)
      navigate('/')
    } catch (err: unknown) {
      const response = err as { response?: { data?: { error?: string } } }
      setError(response.response?.data?.error || 'Xác minh email thất bại')
    } finally {
      setLoading(false)
    }
  }

  const handleResend = async () => {
    setError('')
    setMessage('')
    setLoading(true)
    try {
      const data = await authApi.resendVerification(email)
      setMessage(data.message)
    } catch (err: unknown) {
      const response = err as { response?: { data?: { error?: string } } }
      setError(response.response?.data?.error || 'Không thể gửi lại mã')
    } finally {
      setLoading(false)
    }
  }

  const handleGoogleSuccess = (data: { user: User; token: string }) => {
    setAuth(data.user, data.token)
    navigate('/')
  }

  return (
    <div className={styles.authPage}>
      <div className={styles.authCard}>
        <h1 className={styles.title}>{verificationRequired ? 'Xác minh email' : 'Đăng ký'}</h1>
        {error && <div className={styles.error}>{error}</div>}
        {message && <div className={styles.successMessage}>{message}</div>}

        {verificationRequired ? (
          <form onSubmit={handleVerify} className={styles.form}>
            <p>Nhập mã 6 chữ số đã được gửi đến <strong>{email}</strong>.</p>
            <div className={styles.field}>
              <label htmlFor="verification-code">Mã xác minh</label>
              <input id="verification-code" type="text" inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code} onChange={(event) => setCode(event.target.value.replace(/\D/g, ''))} required />
            </div>
            <button type="submit" className={styles.submitBtn} disabled={loading}>{loading ? 'Đang xác minh...' : 'Xác minh email'}</button>
            <button type="button" className={styles.secondaryAuthButton} onClick={() => void handleResend()} disabled={loading}>Gửi lại mã</button>
          </form>
        ) : (
          <form onSubmit={handleRegister} className={styles.form}>
            <div className={styles.field}><label htmlFor="name">Họ và tên</label><input id="name" type="text" value={name} onChange={(event) => setName(event.target.value)} required /></div>
            <div className={styles.field}><label htmlFor="email">Email</label><input id="email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} required /></div>
            <div className={styles.field}><label htmlFor="password">Mật khẩu</label><input id="password" type="password" value={password} onChange={(event) => setPassword(event.target.value)} minLength={6} required /></div>
            <div className={styles.field}><label htmlFor="confirmPassword">Xác nhận mật khẩu</label><input id="confirmPassword" type="password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} minLength={6} required /></div>
            <button type="submit" className={styles.submitBtn} disabled={loading}>{loading ? 'Đang xử lý...' : 'Đăng ký'}</button>
          </form>
        )}

        {!verificationRequired && (
          <>
            <div className={styles.divider} aria-hidden="true"><span>Hoặc</span></div>
            <GoogleSignInButton mode="signup" onSuccess={handleGoogleSuccess} onError={setError} />
          </>
        )}

        <p className={styles.switchAuth}>{verificationRequired ? 'Nhập sai email?' : 'Đã có tài khoản?'} <Link to="/login">Đăng nhập</Link></p>
      </div>
    </div>
  )
}
