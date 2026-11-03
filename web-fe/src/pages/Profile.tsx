import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { authApi } from '@/api'
import { TravelProfileSummary } from '@/components/TravelProfileSummary'
import { useAuthStore } from '@/stores/auth'
import type { Tag, User } from '@/types'
import styles from './Profile.module.css'

export function ProfilePage() {
  const navigate = useNavigate()
  const { token } = useAuthStore()
  const [profile, setProfile] = useState<User | null>(null)
  const [preferences, setPreferences] = useState<Tag[]>([])
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
          setPreferences((data as unknown as { preferences: Tag[] }).preferences)
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
          <div className={styles.sectionHeader}>
            <div>
              <h2>Hồ sơ du lịch của bạn</h2>
              <p>Đây là cách Vivu đang hiểu phong cách và mối quan tâm của bạn.</p>
            </div>
            <Link to='/settings' className={styles.settingsLink}>Chỉnh sửa sở thích</Link>
          </div>
          <TravelProfileSummary preferences={preferences} />
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
