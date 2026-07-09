import { Outlet, Link, useNavigate } from 'react-router-dom'
import { useAuthStore } from '@/stores/auth'
import styles from './Layout.module.css'

export function Layout() {
  const { user, logout } = useAuthStore()
  const navigate = useNavigate()

  const handleLogout = () => {
    logout()
    navigate('/')
  }

  return (
    <div className={styles.layout}>
      <header className={styles.header}>
        <div className={styles.headerInner}>
          <Link to="/" className={styles.logo}>
            Tour<span>AI</span>
          </Link>
          
          <nav className={styles.nav}>
            <Link to="/search" className={styles.navLink}>Khám phá</Link>
            <Link to="/chat" className={styles.navLink}>Tư vấn AI</Link>
            {user ? (
              <>
                <Link to="/favorites" className={styles.navLink}>Yêu thích</Link>
                <Link to="/profile" className={styles.navLink}>{user.name}</Link>
                <button onClick={handleLogout} className={styles.logoutBtn}>Đăng xuất</button>
              </>
            ) : (
              <>
                <Link to="/login" className={styles.navLink}>Đăng nhập</Link>
                <Link to="/register" className={styles.registerBtn}>Đăng ký</Link>
              </>
            )}
          </nav>
        </div>
      </header>
      
      <main className={styles.main}>
        <Outlet />
      </main>
      
      <footer className={styles.footer}>
        <p>Đồ án tốt nghiệp - Hệ thống gợi ý tour du lịch AI</p>
      </footer>
    </div>
  )
}
