import { useCallback, useEffect, useRef, useState } from 'react'
import { authApi } from '@/api'
import type { User } from '@/types'
import styles from './GoogleSignInButton.module.css'

interface GoogleSignInButtonProps {
  mode?: 'signin' | 'signup'
  onSuccess: (data: { user: User; token: string }) => void
  onError: (message: string) => void
}

const GOOGLE_SCRIPT_URL = 'https://accounts.google.com/gsi/client'
const env = (import.meta as unknown as { env: Record<string, string | undefined> }).env
const googleClientId = env.VITE_GOOGLE_CLIENT_ID?.trim() || ''
let googleScriptPromise: Promise<void> | null = null

const loadGoogleScript = () => {
  if (typeof window === 'undefined') return Promise.reject(new Error('Google Login chỉ hoạt động trong trình duyệt.'))
  if (window.google?.accounts?.id) return Promise.resolve()
  if (googleScriptPromise) return googleScriptPromise

  googleScriptPromise = new Promise<void>((resolve, reject) => {
    const existingScript = document.querySelector<HTMLScriptElement>(`script[src="${GOOGLE_SCRIPT_URL}"]`)
    if (existingScript) {
      let attempts = 0
      const waitForGoogle = () => {
        if (window.google?.accounts?.id) {
          resolve()
        } else if (attempts >= 100) {
          reject(new Error('Không thể tải dịch vụ đăng nhập Google.'))
        } else {
          attempts += 1
          window.setTimeout(waitForGoogle, 50)
        }
      }
      waitForGoogle()
      return
    }

    const script = document.createElement('script')
    script.src = GOOGLE_SCRIPT_URL
    script.async = true
    script.defer = true
    script.onload = () => resolve()
    script.onerror = () => {
      googleScriptPromise = null
      reject(new Error('Không thể tải dịch vụ đăng nhập Google.'))
    }
    document.head.appendChild(script)
  })

  return googleScriptPromise
}

const getApiErrorMessage = (error: unknown) => {
  const response = error as { response?: { data?: { error?: unknown } } }
  return typeof response.response?.data?.error === 'string'
    ? response.response.data.error
    : 'Không thể đăng nhập bằng Google lúc này.'
}

export function GoogleSignInButton({ mode = 'signin', onSuccess, onError }: GoogleSignInButtonProps) {
  const buttonRef = useRef<HTMLDivElement>(null)
  const onSuccessRef = useRef(onSuccess)
  const onErrorRef = useRef(onError)
  const loadingRef = useRef(false)
  const [loading, setLoading] = useState(false)
  const [setupError, setSetupError] = useState('')

  useEffect(() => {
    onSuccessRef.current = onSuccess
    onErrorRef.current = onError
  }, [onSuccess, onError])

  const handleCredential = useCallback(async (credential: string) => {
    if (!credential || loadingRef.current) return
    loadingRef.current = true
    setLoading(true)
    try {
      const data = await authApi.googleLogin(credential)
      onSuccessRef.current(data)
    } catch (error) {
      const message = getApiErrorMessage(error)
      onErrorRef.current(message)
    } finally {
      loadingRef.current = false
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    let cancelled = false

    if (!googleClientId) {
      const message = 'Đăng nhập bằng Google chưa được cấu hình.'
      setSetupError(message)
      onErrorRef.current(message)
      return () => {
        cancelled = true
      }
    }

    void loadGoogleScript()
      .then(() => {
        if (cancelled || !buttonRef.current || !window.google?.accounts?.id) return
        const googleId = window.google.accounts.id
        googleId.initialize({
          client_id: googleClientId,
          callback: (response) => {
            void handleCredential(response.credential)
          },
          auto_select: false,
          cancel_on_tap_outside: true,
        })
        buttonRef.current.innerHTML = ''
        googleId.renderButton(buttonRef.current, {
          theme: 'outline',
          size: 'large',
          text: mode === 'signup' ? 'signup_with' : 'signin_with',
          shape: 'rectangular',
          logo_alignment: 'left',
          width: 320,
        })
        setSetupError('')
      })
      .catch((error: unknown) => {
        if (cancelled) return
        const message = error instanceof Error ? error.message : 'Không thể tải dịch vụ đăng nhập Google.'
        setSetupError(message)
        onErrorRef.current(message)
      })

    return () => {
      cancelled = true
      if (buttonRef.current) buttonRef.current.innerHTML = ''
      window.google?.accounts?.id?.cancel()
    }
  }, [handleCredential, mode])

  return (
    <div className={styles.googleAuth}>
      <div ref={buttonRef} className={styles.button} aria-label={mode === 'signup' ? 'Đăng ký bằng Google' : 'Đăng nhập bằng Google'} />
      {loading && <span className={styles.loading} role="status">Đang xác minh tài khoản Google...</span>}
      {setupError && <span className={styles.setupError} role="alert">{setupError}</span>}
    </div>
  )
}
