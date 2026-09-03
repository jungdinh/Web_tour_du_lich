import { useEffect, useRef, useState } from 'react'
import { Outlet, Link, useNavigate, useLocation } from 'react-router-dom'
import { useAuthStore } from '@/stores/auth'
import { ThemeToggle } from './ThemeToggle'
import styles from './Layout.module.css'

const TEXT = {
  home: 'Trang chủ',
  explore: 'Khám phá',
  aiConsult: 'Tư vấn AI',
  profile: 'H\u1ed3 s\u01a1 c\u00e1 nh\u00e2n',
  favorites: 'Tour y\u00eau th\u00edch',
  recommendations: 'G\u1ee3i \u00fd cho t\u00f4i',
  logout: '\u0110\u0103ng xu\u1ea5t',
  login: '\u0110\u0103ng nh\u1eadp',
  register: '\u0110\u0103ng k\u00fd',
  admin: 'Qu\u1ea3n tr\u1ecb website',
  footer: '\u0110\u1ed3 \u00e1n t\u1ed1t nghi\u1ec7p - H\u1ec7 th\u1ed1ng g\u1ee3i \u00fd tour du l\u1ecbch AI',
  chevron: '\u25be',
  profileIcon: '\u{1f464}',
  favoritesIcon: '\u2661',
  recommendationsIcon: '\u2728',
  logoutIcon: '\u21aa',
}

export function Layout() {
  const { user, logout } = useAuthStore()
  const navigate = useNavigate()
  const location = useLocation()
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false)
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false)
  const userMenuRef = useRef<HTMLDivElement>(null)

  const isChatPage = location.pathname === '/chat'
  const isAdminPage = location.pathname.startsWith('/admin')

  useEffect(() => {
    setIsMobileMenuOpen(false)
  }, [location.pathname])

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (!userMenuRef.current?.contains(event.target as Node)) {
        setIsUserMenuOpen(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const handleLogout = () => {
    logout()
    setIsUserMenuOpen(false)
    navigate('/')
  }

  const userInitial = user?.name?.trim()?.charAt(0).toUpperCase() || 'U'

  return (
    <div className={styles.layout}>
      <header className={styles.header}>
        <div className={styles.headerInner}>
          <Link to="/" className={styles.logo}>
            Tour<span>AI</span>
          </Link>
          
          <button 
            className={styles.mobileMenuBtn} 
            onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
            aria-label="Toggle menu"
          >
            {isMobileMenuOpen ? '✕' : '☰'}
          </button>

          <nav className={`${styles.nav} ${isMobileMenuOpen ? styles.navOpen : ''}`}>
            {!isAdminPage && (
              <>
            <Link
              to="/"
              className={`${styles.navLink} ${location.pathname === '/' ? styles.navLinkActive : ''}`}
            >
              {TEXT.home}
            </Link>
            <Link
              to="/search"
              className={`${styles.navLink} ${location.pathname === '/search' ? styles.navLinkActive : ''}`}
            >
              {TEXT.explore}
            </Link>
            <Link
              to="/chat"
              className={`${styles.navLink} ${location.pathname === '/chat' ? styles.navLinkActive : ''}`}
            >
              {TEXT.aiConsult}
            </Link>
              </>
            )}

            <ThemeToggle />

            {user ? (
              <div className={styles.userMenu} ref={userMenuRef}>
                <button
                  type="button"
                  className={styles.userMenuButton}
                  onClick={() => setIsUserMenuOpen((open) => !open)}
                  aria-haspopup="menu"
                  aria-expanded={isUserMenuOpen}
                >
                  <span className={styles.avatar}>{userInitial}</span>
                  <span className={styles.userName}>{user.name}</span>
                  <span className={styles.chevron}>{TEXT.chevron}</span>
                </button>

                {isUserMenuOpen && (
                  <div className={styles.userDropdown} role="menu">
                    {user.role === 'admin' ? (
                      <Link to="/admin" className={styles.dropdownItem} onClick={() => setIsUserMenuOpen(false)}>
                        <span>?</span>
                        {TEXT.admin}
                      </Link>
                    ) : (
                      <>
                        <Link to="/profile" className={styles.dropdownItem} onClick={() => setIsUserMenuOpen(false)}>
                          <span>{TEXT.profileIcon}</span>
                          {TEXT.profile}
                        </Link>
                        <Link to="/favorites" className={styles.dropdownItem} onClick={() => setIsUserMenuOpen(false)}>
                          <span>{TEXT.favoritesIcon}</span>
                          {TEXT.favorites}
                        </Link>
                        <Link to="/recommendations" className={styles.dropdownItem} onClick={() => setIsUserMenuOpen(false)}>
                          <span>{TEXT.recommendationsIcon}</span>
                          {TEXT.recommendations}
                        </Link>
                      </>
                    )}
                    <button type="button" onClick={handleLogout} className={styles.dropdownLogout}>
                      <span>{TEXT.logoutIcon}</span>
                      {TEXT.logout}
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <>
                <Link to="/login" className={styles.navLink}>{TEXT.login}</Link>
                <Link to="/register" className={styles.registerBtn}>{TEXT.register}</Link>
              </>
            )}
          </nav>
        </div>
      </header>
      
      <main className={isChatPage ? styles.mainChat : styles.main}>
        <Outlet />
      </main>
      
      {!isChatPage && (
        <footer className={styles.footer}>
          <p>{TEXT.footer}</p>
        </footer>
      )}
    </div>
  )
}
