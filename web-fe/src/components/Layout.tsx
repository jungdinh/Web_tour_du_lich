import { useEffect, useRef, useState } from 'react'
import { Outlet, Link, useNavigate, useLocation } from 'react-router-dom'
import { Compass, House, Menu, Sparkles, X } from 'lucide-react'
import { useAuthStore } from '@/stores/auth'
import { ThemeToggle } from './ThemeToggle'
import { NotificationBell } from './NotificationBell'
import styles from './Layout.module.css'

const TEXT = {
  home: 'Trang chủ',
  explore: 'Khám phá',
  aiConsult: 'Tư vấn AI',
  profile: 'Hồ sơ cá nhân',
  bookings: 'Lịch sử đặt tour',
  favorites: 'Tour yêu thích',
  recommendations: 'Gợi ý cho tôi',
  settings: 'Cài đặt',
  logout: 'Đăng xuất',
  login: 'Đăng nhập',
  register: 'Đăng ký',
  admin: 'Quản trị website',
  chevron: '▾',
  interface: 'Giao di\u1ec7n',
  notifications: 'Th\u00f4ng b\u00e1o',
  account: 'T\u00e0i kho\u1ea3n',
}

const Icons = {
  Profile: () => <svg xmlns="http://www.w3.org/2000/svg" width="100%" height="100%" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>,
  Bookings: () => <svg xmlns="http://www.w3.org/2000/svg" width="100%" height="100%" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="8" height="4" x="8" y="2" rx="1" ry="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><path d="M12 11h4"/><path d="M12 16h4"/><path d="M8 11h.01"/><path d="M8 16h.01"/></svg>,
  Favorites: () => <svg xmlns="http://www.w3.org/2000/svg" width="100%" height="100%" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/></svg>,
  Recommendations: () => <svg xmlns="http://www.w3.org/2000/svg" width="100%" height="100%" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z"/><path d="M5 3v4"/><path d="M3 5h4"/></svg>,
  Settings: () => <svg xmlns="http://www.w3.org/2000/svg" width="100%" height="100%" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/></svg>,
  Logout: () => <svg xmlns="http://www.w3.org/2000/svg" width="100%" height="100%" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" x2="9" y1="12" y2="12"/></svg>,
  Admin: () => <svg xmlns="http://www.w3.org/2000/svg" width="100%" height="100%" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/></svg>,
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
    window.scrollTo({ top: 0, left: 0, behavior: 'instant' })
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
          <Link to="/" className={styles.logo} aria-label="Vivu - Trang chủ">
            <img src="/logo.png" alt="Vivu" className={styles.logoIcon} />
          </Link>
          
          <button 
            className={styles.mobileMenuBtn} 
            onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
            aria-label="Toggle menu"
          >
            {isMobileMenuOpen ? <X size={24} /> : <Menu size={24} />}
          </button>

          <nav className={`${styles.nav} ${isMobileMenuOpen ? styles.navOpen : ''}`}>
            <div className={styles.navPrimary}>
              {!isAdminPage && (
                <>
                  <Link
                    to="/"
                    className={`${styles.navLink} ${location.pathname === '/' ? styles.navLinkActive : ''}`}
                  >
                    <House size={18} className={styles.navLinkIcon} aria-hidden="true" />
                    <span>{TEXT.home}</span>
                  </Link>
                  <Link
                    to="/search"
                    className={`${styles.navLink} ${location.pathname === '/search' ? styles.navLinkActive : ''}`}
                  >
                    <Compass size={18} className={styles.navLinkIcon} aria-hidden="true" />
                    <span>{TEXT.explore}</span>
                  </Link>
                  <Link
                    to="/chat"
                    className={`${styles.navLink} ${styles.navLinkAi} ${location.pathname === '/chat' ? styles.navLinkActive : ''}`}
                  >
                    <Sparkles size={18} className={styles.navLinkIcon} aria-hidden="true" />
                    <span>{TEXT.aiConsult}</span>
                  </Link>
                </>
              )}
            </div>

            <div className={styles.navActions}>
              <div className={styles.navActionItem}>
                <ThemeToggle />
                <span className={styles.navActionLabel}>{TEXT.interface}</span>
              </div>

              {user ? (
                <>
                  <div className={styles.navActionItem}>
                    <NotificationBell />
                    <span className={styles.navActionLabel}>{TEXT.notifications}</span>
                  </div>
                  <div className={`${styles.userMenu} ${styles.navActionItem}`} ref={userMenuRef}>
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
                            <span><Icons.Admin /></span>
                            {TEXT.admin}
                          </Link>
                        ) : (
                          <>
                            <Link to="/profile" className={styles.dropdownItem} onClick={() => setIsUserMenuOpen(false)}>
                              <span><Icons.Profile /></span>
                              {TEXT.profile}
                            </Link>
                            <Link to="/bookings" className={styles.dropdownItem} onClick={() => setIsUserMenuOpen(false)}>
                              <span><Icons.Bookings /></span>
                              {TEXT.bookings}
                            </Link>
                            <Link to="/favorites" className={styles.dropdownItem} onClick={() => setIsUserMenuOpen(false)}>
                              <span><Icons.Favorites /></span>
                              {TEXT.favorites}
                            </Link>
                            <Link to="/recommendations" className={styles.dropdownItem} onClick={() => setIsUserMenuOpen(false)}>
                              <span><Icons.Recommendations /></span>
                              {TEXT.recommendations}
                            </Link>
                            <Link to="/settings" className={styles.dropdownItem} onClick={() => setIsUserMenuOpen(false)}>
                              <span><Icons.Settings /></span>
                              {TEXT.settings}
                            </Link>
                          </>
                        )}
                        <button type="button" onClick={handleLogout} className={styles.dropdownLogout}>
                          <span><Icons.Logout /></span>
                          {TEXT.logout}
                        </button>
                      </div>
                    )}
                    <span className={styles.navActionLabel}>{TEXT.account}</span>
                  </div>
                </>
              ) : (
                <div className={styles.navGuestActions}>
                  <Link to="/login" className={styles.navLink}>{TEXT.login}</Link>
                  <Link to="/register" className={styles.registerBtn}>{TEXT.register}</Link>
                </div>
              )}
            </div>
          </nav>
        </div>
      </header>
      
      <main className={isChatPage ? styles.mainChat : styles.main}>
        <Outlet />
      </main>
      
      {!isChatPage && !isAdminPage && (
        <footer className={styles.footer}>
          <div className={styles.footerInner}>
            <div className={styles.footerGrid}>
              <section className={styles.footerBrand} aria-labelledby="footer-brand-title">
                <Link to="/" className={styles.footerLogoLink} aria-label="Vivu - Trang chủ">
                  <img src="/logo.png" alt="Vivu" className={styles.footerLogoIcon} />
                </Link>
                <h2 id="footer-brand-title" className={styles.footerBrandTitle}>
                  Du lịch đúng gu, hành trình đúng ý
                </h2>
                <p className={styles.footerBrandDescription}>
                  Vivu giúp bạn tìm tour, so sánh hành trình và nhận gợi ý cá nhân hóa từ trợ lý AI.
                </p>
                <Link to="/chat" className={styles.footerAiLink}>
                  <span className={styles.footerAiDot} />
                  Trò chuyện với trợ lý AI
                </Link>
              </section>

              <nav className={styles.footerColumn} aria-labelledby="footer-explore-title">
                <h2 id="footer-explore-title">Khám phá</h2>
                <Link to="/search">Tất cả tour</Link>
                <Link to="/search?travelType=domestic">Tour trong nước</Link>
                <Link to="/search?travelType=international">Tour quốc tế</Link>
                <Link to="/search?maxPrice=5000000">Tour dưới 5 triệu</Link>
              </nav>

              <nav className={styles.footerColumn} aria-labelledby="footer-tools-title">
                <h2 id="footer-tools-title">Tiện ích</h2>
                <Link to="/chat">Tư vấn hành trình AI</Link>
                <Link to="/recommendations">Gợi ý dành cho bạn</Link>
                <Link to="/favorites">Tour yêu thích</Link>
                <Link to="/bookings">Lịch sử đặt tour</Link>
              </nav>

              <nav className={styles.footerColumn} aria-labelledby="footer-account-title">
                <h2 id="footer-account-title">Tài khoản</h2>
                {user?.role === 'admin' ? (
                  <Link to="/admin/dashboard">Trang quản trị</Link>
                ) : user ? (
                  <>
                    <Link to="/profile">Hồ sơ cá nhân</Link>
                    <Link to="/settings">Cài đặt tài khoản</Link>
                    <Link to="/bookings">Đơn đặt tour</Link>
                  </>
                ) : (
                  <>
                    <Link to="/login">Đăng nhập</Link>
                    <Link to="/register">Tạo tài khoản</Link>
                  </>
                )}
              </nav>
            </div>

            <div className={styles.footerBottom}>
              <p>© {new Date().getFullYear()} Vivu · Nền tảng gợi ý tour du lịch bằng AI.</p>
              <div className={styles.footerHighlights} aria-label="Cam kết của Vivu">
                <span>Gợi ý cá nhân hóa</span>
                <span>Thông tin minh bạch</span>
                <span>Trải nghiệm thuận tiện</span>
              </div>
            </div>
          </div>
        </footer>
      )}
    </div>
  )
}
