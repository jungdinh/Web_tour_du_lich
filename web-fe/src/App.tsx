import { Routes, Route } from 'react-router-dom'
import { useAuthStore } from './stores/auth'
import { Layout } from './components/Layout'
import { HomePage } from './pages/Home'
import { SearchPage } from './pages/Search'
import { TourDetailPage } from './pages/TourDetail'
import { ChatPage } from './pages/Chat'
import { LoginPage } from './pages/Login'
import { RegisterPage } from './pages/Register'
import { ProfilePage } from './pages/Profile'
import { FavoritesPage } from './pages/Favorites'
import { RecommendationsPage } from './pages/Recommendations'
import { AdminPage } from './pages/Admin'

export default function App() {
  const { token } = useAuthStore()

  return (
    <Routes>
      <Route path="/" element={<Layout />}>
        <Route index element={<HomePage />} />
        <Route path="search" element={<SearchPage />} />
        <Route path="tours/:id" element={<TourDetailPage />} />
        <Route path="chat" element={<ChatPage />} />
        <Route path="login" element={<LoginPage />} />
        <Route path="register" element={<RegisterPage />} />
        <Route path="profile" element={token ? <ProfilePage /> : <LoginPage />} />
        <Route path="favorites" element={token ? <FavoritesPage /> : <LoginPage />} />
        <Route path="recommendations" element={<RecommendationsPage />} />
        <Route path="admin" element={token ? <AdminPage /> : <LoginPage />} />
      </Route>
    </Routes>
  )
}
