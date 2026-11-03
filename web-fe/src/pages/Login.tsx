import { useState, useRef } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { authApi } from '@/api'
import { useAuthStore } from '@/stores/auth'
import type { User } from '@/types'
import { GoogleSignInButton } from '@/components/GoogleSignInButton'
import styles from './Auth.module.css'

export function LoginPage() {
  const navigate = useNavigate()
  const { setAuth } = useAuthStore()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const loginSucceededRef = useRef(false)




  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      const data = await authApi.login(email, password)
      loginSucceededRef.current = true
      
      // Trigger browser password manager manually
      if ('PasswordCredential' in window && navigator.credentials) {
        try {
          const cred = new (window as any).PasswordCredential({ id: email, password, name: data.user.name || email })
          await navigator.credentials.store(cred)
        } catch (e) {
          console.error("Failed to store credentials", e)
        }
      }

      setAuth(data.user, data.token)
      navigate(data.user.role === 'admin' ? '/admin' : '/')
    } catch (err: unknown) {
      const error = err as { response?: { data?: { error?: string } } }
      setError(error.response?.data?.error || 'Đăng nhập thất bại')
    } finally {
      setLoading(false)
    }
  }

  const handleGoogleSuccess = (data: { user: User; token: string }) => {
    setAuth(data.user, data.token)
    navigate(data.user.role === 'admin' ? '/admin' : '/')
  }

  return (
    <div className={styles.authPage}>
      <div className={styles.authCard}>
        <h1 className={styles.title}>Đăng nhập</h1>
        
        {error && <div className={styles.error}>{error}</div>}
        
        <form onSubmit={handleSubmit} className={styles.form} autoComplete="on">
          <div className={styles.field}>
            <label htmlFor="email">Email</label>
            <input
              id="email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>
          
          <div className={styles.field}>
            <label htmlFor="password">Mật khẩu</label>
            <div className={styles.passwordInputWrap}>
              <input
                id="password"
                type={showPassword ? 'text' : 'text'}
                className={!showPassword ? styles.fakePassword : ''}
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
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
          </div>
          
          <button type="submit" className={styles.submitBtn} disabled={loading}>
            {loading ? 'Đang xử lý...' : 'Đăng nhập'}
          </button>
        </form>

        <div className={styles.divider} aria-hidden="true"><span>Hoặc</span></div>
        <GoogleSignInButton onSuccess={handleGoogleSuccess} onError={setError} />
        
        <p className={styles.switchAuth}>
          Chưa có tài khoản? <Link to="/register">Đăng ký</Link>
        </p>
      </div>
    </div>
  )
}
