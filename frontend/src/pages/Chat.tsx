import { useState, useRef, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { chatApi } from '@/api'
import { useAuthStore } from '@/stores/auth'
import type { ChatMessage } from '@/types'
import styles from './Chat.module.css'

export function ChatPage() {
  const { token } = useAuthStore()
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [sessionId, setSessionId] = useState<number | null>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  useEffect(() => {
    scrollToBottom()
  }, [messages])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!input.trim() || loading) return

    const userMessage = input.trim()
    setInput('')
    setLoading(true)

    try {
      const response = await chatApi.sendMessage(userMessage, sessionId || undefined)
      
      if (response.session_id && !sessionId) {
        setSessionId(response.session_id)
      }

      // Add user message
      setMessages((prev) => [
        ...prev,
        {
          id: Date.now(),
          role: 'user',
          content: userMessage,
          created_at: new Date().toISOString(),
        },
      ])

      // Add AI response
      setMessages((prev) => [
        ...prev,
        {
          id: Date.now() + 1,
          role: 'assistant',
          content: response.message,
          created_at: new Date().toISOString(),
        },
      ])
    } catch (error) {
      console.error('Chat error:', error)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className={styles.chatPage}>
      <div className={styles.container}>
        {!token ? (
          <div className={styles.authPrompt}>
            <h2>Vui lòng đăng nhập để sử dụng tính năng chat</h2>
            <div className={styles.authButtons}>
              <Link to="/login" className={styles.primaryBtn}>Đăng nhập</Link>
              <Link to="/register" className={styles.secondaryBtn}>Đăng ký</Link>
            </div>
          </div>
        ) : (
          <div className={styles.chatContainer}>
            <div className={styles.header}>
              <h1>Tư vấn tour du lịch</h1>
              <p>Trò chuyện với AI để nhận gợi ý cá nhân hóa</p>
            </div>

            <div className={styles.messages}>
              {messages.length === 0 && (
                <div className={styles.welcome}>
                  <div className={styles.welcomeIcon}>🎯</div>
                  <h3>Xin chào! Tôi có thể giúp gì cho bạn?</h3>
                  <p>Hãy cho tôi biết về chuyến đi bạn mong muốn:</p>
                  <div className={styles.suggestions}>
                    <button onClick={() => setInput("Tôi muốn đi Đà Lạt cùng vợ")}>
                      Đi Đà Lạt cùng vợ
                    </button>
                    <button onClick={() => setInput("Gia đình tôi muốn đi biển")}>
                      Gia đình muốn đi biển
                    </button>
                    <button onClick={() => setInput("Tìm tour mạo hiểm ở Sapa")}>
                      Tour mạo hiểm Sapa
                    </button>
                    <button onClick={() => setInput("Gợi tour nghỉ dưỡng 3 ngày")}>
                      Tour nghỉ dưỡng 3 ngày
                    </button>
                  </div>
                </div>
              )}

              {messages.map((msg) => (
                <div key={msg.id} className={`${styles.message} ${styles[msg.role]}`}>
                  <div className={styles.messageAvatar}>
                    {msg.role === 'user' ? '👤' : '🤖'}
                  </div>
                  <div className={styles.messageContent}>
                    {msg.content}
                  </div>
                </div>
              ))}

              {loading && (
                <div className={`${styles.message} ${styles.assistant}`}>
                  <div className={styles.messageAvatar}>🤖</div>
                  <div className={styles.messageContent}>
                    <span className={styles.typing}>Đang suy nghĩ...</span>
                  </div>
                </div>
              )}

              <div ref={messagesEndRef} />
            </div>

            <form onSubmit={handleSubmit} className={styles.inputForm}>
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="VD: Tôi muốn đi Đà Lạt cùng gia đình, ngân sách 5 triệu..."
                className={styles.input}
                disabled={loading}
              />
              <button type="submit" className={styles.sendBtn} disabled={loading || !input.trim()}>
                Gửi
              </button>
            </form>
          </div>
        )}
      </div>
    </div>
  )
}
