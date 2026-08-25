import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { authApi } from '@/api'
import { useAuthStore } from '@/stores/auth'
import type { User } from '@/types'
import styles from './Profile.module.css'

export function ProfilePage() {
  const navigate = useNavigate()
  const { token } = useAuthStore()
  const [profile, setProfile] = useState<User | null>(null)
  const [preferences, setPreferences] = useState<Array<{ tag: string; weight: number }>>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!token) {
      navigate('/login')
      return
    }

    const fetchProfile = async () => {
      try {
        const data = await authApi.getProfile()
        setProfile(data)
        if ('preferences' in data) {
          setPreferences((data as unknown as { preferences: Array<{ tag: string; weight: number }> }).preferences)
        }
      } catch (error) {
        console.error('Failed to fetch profile:', error)
      } finally {
        setLoading(false)
      }
    }
    fetchProfile()
  }, [token, navigate])

  if (loading) {
    return <div className={styles.loading}>Đang tải...</div>
  }

  if (!profile) {
    return <div className={styles.error}>Không thể tải thông tin</div>
  }

  return (
    <div className="container">
      <div className={styles.profilePage}>
        <div className={styles.header}>
          <div className={styles.avatar}>
            {profile.name.charAt(0).toUpperCase()}
          </div>
          <div className={styles.info}>
            <h1>{profile.name}</h1>
            <p>{profile.email}</p>
          </div>
        </div>

        <div className={styles.section}>
          <h2>Sở thích của bạn</h2>
          {preferences.length === 0 ? (
            <p className={styles.empty}>
              Bạn chưa có sở thích nào. Hãy tìm kiếm và tương tác với các tour để chúng tôi hiểu bạn hơn!
            </p>
          ) : (
            <div className={styles.preferences}>
              {preferences
                .sort((a, b) => b.weight - a.weight)
                .map((pref) => (
                  <div key={pref.tag} className={styles.prefItem}>
                    <span className={styles.prefTag}>{pref.tag}</span>
                    <div className={styles.prefBar}>
                      <div
                        className={styles.prefProgress}
                        style={{ width: `${pref.weight * 100}%` }}
                      />
                    </div>
                    <span className={styles.prefValue}>
                      {(pref.weight * 100).toFixed(0)}%
                    </span>
                  </div>
                ))}
            </div>
          )}
        </div>

        <div className={styles.section}>
          <h2>Thông tin tài khoản</h2>
          <div className={styles.accountInfo}>
            <div className={styles.infoRow}>
              <span>Họ và tên</span>
              <span>{profile.name}</span>
            </div>
            <div className={styles.infoRow}>
              <span>Email</span>
              <span>{profile.email}</span>
            </div>
            <div className={styles.infoRow}>
              <span>Vai trò</span>
              <span>{profile.role === 'admin' ? 'Quản trị' : 'Người dùng'}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
