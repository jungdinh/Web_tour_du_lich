import { useState, useRef } from 'react'
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
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)
  const [isPasswordFocused, setIsPasswordFocused] = useState(false)
  const [code, setCode] = useState('')
  const [verificationRequired, setVerificationRequired] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(false)
  const registrationSucceededRef = useRef(false)


  const passwordRequirements = [
    { label: 'Từ 12 đến 24 ký tự', met: password.length >= 12 && password.length <= 24 },
    { label: 'Có ít nhất một chữ hoa (A-Z)', met: /[A-Z]/.test(password) },
    { label: 'Có ít nhất một chữ số (0-9)', met: /\d/.test(password) },
    { label: 'Có ít nhất một ký tự đặc biệt', met: /[^A-Za-z0-9]/.test(password) },
  ]
  const isPasswordStrong = passwordRequirements.every((requirement) => requirement.met)

  const handleRegister = async (event: React.FormEvent) => {
    event.preventDefault()
    setError('')
    setMessage('')
    if (!isPasswordStrong) {
      setError('Mật khẩu chưa đáp ứng đầy đủ các yêu cầu bảo mật')
      return
    }
    if (password !== confirmPassword) {
      setError('Mật khẩu xác nhận không khớp')
      return
    }
    setLoading(true)
    try {
      const data = await authApi.register(name, email, password)
      registrationSucceededRef.current = true
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
      if ('PasswordCredential' in window && navigator.credentials) {
        try {
          const cred = new (window as any).PasswordCredential({ id: email, password, name: data.user.name || name || email })
          await navigator.credentials.store(cred)
        } catch (e) {
          console.error("Failed to store credentials", e)
        }
      }
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
          <form onSubmit={handleRegister} className={styles.form} autoComplete="on">
            <div className={styles.field}><label htmlFor="name">Họ và tên</label><input id="name" type="text" autoComplete="name" value={name} onChange={(event) => setName(event.target.value)} required /></div>
            <div className={styles.field}><label htmlFor="email">Email</label><input id="email" type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} required /></div>
            <div className={styles.field}>
              <label htmlFor="password">Mật khẩu</label>
              <div className={styles.passwordInputWrap}>
                <input id="password" type={showPassword ? 'text' : 'password'} className={!showPassword ? styles.fakePassword : ''} autoComplete="new-password" value={password} onChange={(event) => setPassword(event.target.value)} onFocus={() => setIsPasswordFocused(true)} onBlur={() => setIsPasswordFocused(false)} minLength={12} maxLength={24} aria-describedby="password-requirements" required />
                <button type="button" className={styles.passwordToggle} onClick={() => setShowPassword((visible) => !visible)} aria-label={showPassword ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'} aria-pressed={showPassword} disabled={loading}>
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    {showPassword ? (
                      <><path d="M3 3l18 18" /><path d="M10.6 10.6a2 2 0 002.8 2.8" /><path d="M9.9 4.2A10.8 10.8 0 0112 4c5.5 0 9.5 5.5 9.5 5.5a16.8 16.8 0 01-2.4 2.9M6.2 6.2C3.9 7.8 2.5 9.5 2.5 9.5S6.5 15 12 15c1 0 2-.2 2.9-.5" /></>
                    ) : (
                      <><path d="M2.5 12S6.5 6.5 12 6.5 21.5 12 21.5 12 17.5 17.5 12 17.5 2.5 12 2.5 12z" /><circle cx="12" cy="12" r="2.5" /></>
                    )}
                  </svg>
                </button>
              </div>
              {(isPasswordFocused || password.length > 0) && (
                <div id="password-requirements" className={styles.passwordGuide}>
                  <strong>Mật khẩu mạnh cần:</strong>
                  <ul className={styles.passwordRequirements} aria-live="polite">
                    {passwordRequirements.map((requirement) => (
                      <li key={requirement.label} className={requirement.met ? styles.requirementMet : styles.requirementPending}>
                        <span aria-hidden="true">{requirement.met ? '✓' : ''}</span>
                        {requirement.label}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
            <div className={styles.field}>
              <label htmlFor="confirmPassword">Xác nhận mật khẩu</label>
              <div className={styles.passwordInputWrap}>
                <input id="confirmPassword" type={showConfirmPassword ? 'text' : 'password'} className={!showConfirmPassword ? styles.fakePassword : ''} autoComplete="new-password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} minLength={12} maxLength={24} required />
                <button type="button" className={styles.passwordToggle} onClick={() => setShowConfirmPassword((visible) => !visible)} aria-label={showConfirmPassword ? 'Ẩn mật khẩu xác nhận' : 'Hiện mật khẩu xác nhận'} aria-pressed={showConfirmPassword} disabled={loading}>
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    {showConfirmPassword ? (
                      <><path d="M3 3l18 18" /><path d="M10.6 10.6a2 2 0 002.8 2.8" /><path d="M9.9 4.2A10.8 10.8 0 0112 4c5.5 0 9.5 5.5 9.5 5.5a16.8 16.8 0 01-2.4 2.9M6.2 6.2C3.9 7.8 2.5 9.5 2.5 9.5S6.5 15 12 15c1 0 2-.2 2.9-.5" /></>
                    ) : (
                      <><path d="M2.5 12S6.5 6.5 12 6.5 21.5 12 21.5 12 17.5 17.5 12 17.5 2.5 12 2.5 12z" /><circle cx="12" cy="12" r="2.5" /></>
                    )}
                  </svg>
                </button>
              </div>
            </div>
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
