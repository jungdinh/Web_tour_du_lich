import { useState, useRef, useEffect } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { chatApi, actionApi } from '@/api'
import { useAuthStore } from '@/stores/auth'
import { ImageWithFallback } from '@/components/ImageWithFallback'
import { AiIcon } from '@/components/AiIcon'
import type { ChatMessage, DestinationSuggestion, Tour } from '@/types'
import { formatRatingToFive } from '@/utils/rating'
import styles from './Chat.module.css'

// 4 Curated Bento Inspiration Cards
const INSPIRATION_CARDS = [
  {
    icon: '🏝️',
    title: 'Nghỉ dưỡng biển Phú Quốc',
    desc: '3 ngày 2 đêm, resort gần biển, ngắm hoàng hôn & ẩm thực hải sản',
    prompt: 'Gợi ý tour Phú Quốc 3 ngày 2 đêm nghỉ dưỡng cho 2 người, ưu tiên resort gần biển',
    tag: 'Nghỉ dưỡng',
  },
  {
    icon: '🌸',
    title: 'Đà Lạt mộng mơ cho cặp đôi',
    desc: 'Check-in cafe săn mây, chợ đêm & các điểm tham quan lãng mạn',
    prompt: 'Tư vấn tour Đà Lạt 3 ngày 2 đêm cho cặp đôi, lịch trình nhẹ nhàng nhiều điểm check-in',
    tag: 'Lãng mạn',
  },
  {
    icon: '⛰️',
    title: 'Sapa săn mây & Fansipan',
    desc: 'Chinh phục nóc nhà Đông Dương, thăm bản Cát Cát & đèo Ô Quy Hồ',
    prompt: 'Tìm tour Sapa 2 ngày 1 đêm săn mây, cáp treo Fansipan và tham quan bản làng',
    tag: 'Khám phá',
  },
  {
    icon: '👨‍👩‍👧‍👦',
    title: 'Đà Nẵng - Hội An gia đình',
    desc: 'Bà Nà Hills Cầu Vàng, phố cổ Hội An & biển Mỹ Khê thong thả',
    prompt: 'Gợi ý tour Đà Nẵng - Hội An - Bà Nà Hills 4 ngày cho gia đình có người lớn và trẻ nhỏ',
    tag: 'Gia đình',
  },
]

// Quick Topic Filter Capsules
const QUICK_TOPICS = [
  { label: '🏝️ Phú Quốc', prompt: 'Tìm tour du lịch Phú Quốc 3 ngày 2 đêm' },
  { label: '🌸 Đà Lạt', prompt: 'Gợi ý tour du lịch Đà Lạt giá tốt' },
  { label: '⛰️ Sapa', prompt: 'Tìm tour Sapa săn mây cuối tuần' },
  { label: '🌊 Nha Trang', prompt: 'Tìm tour biển Nha Trang 3 ngày 2 đêm' },
  { label: '🏮 Đà Nẵng - Hội An', prompt: 'Gợi ý tour Đà Nẵng - Hội An 4 ngày' },
  { label: '💰 Tour dưới 3 triệu', prompt: 'Tìm các tour du lịch có mức giá dưới 3 triệu đồng' },
  { label: '👨‍👩‍👧‍👦 Tour cho gia đình', prompt: 'Gợi ý các tour du lịch phù hợp cho gia đình có trẻ em' },
  { label: '✈️ Tour Thái Lan', prompt: 'Tìm tour du lịch Thái Lan Bangkok - Pattaya giá tốt' },
]

function formatPriceVND(price: number) {
  return new Intl.NumberFormat('vi-VN', {
    style: 'currency',
    currency: 'VND',
    maximumFractionDigits: 0,
  }).format(price)
}

function formatMessageTime(isoString: string) {
  try {
    const date = new Date(isoString)
    return date.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })
  } catch {
    return ''
  }
}

// Markdown formatting helper for AI message bodies
function renderFormattedContent(content: string) {
  const lines = content.split('\n')

  return lines.map((line, lineIndex) => {
    const trimmed = line.trim()

    // Heading 3: ### Title
    if (trimmed.startsWith('### ')) {
      return (
        <h4 key={lineIndex} className={styles.msgH3}>
          {renderInlineFormatting(trimmed.replace(/^###\s+/, ''))}
        </h4>
      )
    }

    // Heading 2: ## Title
    if (trimmed.startsWith('## ')) {
      return (
        <h3 key={lineIndex} className={styles.msgH2}>
          {renderInlineFormatting(trimmed.replace(/^##\s+/, ''))}
        </h3>
      )
    }

    // Bullet points: - item or * item
    if (/^[-*]\s+/.test(trimmed)) {
      const text = trimmed.replace(/^[-*]\s+/, '')
      return (
        <div key={lineIndex} className={styles.msgBulletItem}>
          <span className={styles.bulletDot}>•</span>
          <span className={styles.bulletText}>{renderInlineFormatting(text)}</span>
        </div>
      )
    }

    // Numbered list: 1. item
    if (/^\d+\.\s+/.test(trimmed)) {
      const numMatch = trimmed.match(/^(\d+)\.\s+(.*)$/)
      if (numMatch) {
        return (
          <div key={lineIndex} className={styles.msgNumberedItem}>
            <span className={styles.numberBadge}>{numMatch[1]}</span>
            <span className={styles.bulletText}>{renderInlineFormatting(numMatch[2])}</span>
          </div>
        )
      }
    }

    // Itinerary Day Marker: Ngày 1:, Day 1:, Lịch trình:
    if (/^(ngày \d+|day \d+|lịch trình)/i.test(trimmed)) {
      return (
        <div key={lineIndex} className={styles.msgDayHeader}>
          📅 {renderInlineFormatting(trimmed)}
        </div>
      )
    }

    // Empty line
    if (!trimmed) {
      return <div key={lineIndex} className={styles.msgSpacer} />
    }

    // Standard paragraph line
    return (
      <p key={lineIndex} className={styles.msgParagraph}>
        {renderInlineFormatting(line)}
      </p>
    )
  })
}

function renderInlineFormatting(text: string) {
  const parts = text.split(/(\*\*[^*]+\*\*|\*[^*]+\*)/g)

  return parts.map((part, index) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return (
        <strong key={index} className={styles.boldText}>
          {part.slice(2, -2)}
        </strong>
      )
    }
    if (part.startsWith('*') && part.endsWith('*')) {
      return <em key={index}>{part.slice(1, -1)}</em>
    }
    return <span key={index}>{part}</span>
  })
}

// Component for Horizontal Tour Carousel
function TourCarousel({ tours, onTourClick }: { tours: Tour[]; onTourClick: (tourId: number) => void }) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const [canScrollLeft, setCanScrollLeft] = useState(false)
  const [canScrollRight, setCanScrollRight] = useState(true)

  const checkScroll = () => {
    if (scrollRef.current) {
      const { scrollLeft, scrollWidth, clientWidth } = scrollRef.current
      setCanScrollLeft(scrollLeft > 10)
      setCanScrollRight(scrollLeft < scrollWidth - clientWidth - 10)
    }
  }

  useEffect(() => {
    checkScroll()
  }, [tours])

  const handleScroll = (direction: 'left' | 'right') => {
    if (scrollRef.current) {
      const scrollAmount = 300
      scrollRef.current.scrollBy({
        left: direction === 'left' ? -scrollAmount : scrollAmount,
        behavior: 'smooth',
      })
      setTimeout(checkScroll, 350)
    }
  }

  return (
    <div className={styles.carouselContainer}>
      <div className={styles.carouselHeader}>
        <div className={styles.carouselHeaderTitle}>
          <span className={styles.recSparkle}>✨</span>
          <h4>Gợi ý {tours.length} tour phù hợp nhất cho bạn:</h4>
        </div>
        {tours.length > 2 && (
          <div className={styles.carouselNavButtons}>
            <button
              type="button"
              className={styles.carouselNavBtn}
              onClick={() => handleScroll('left')}
              disabled={!canScrollLeft}
              aria-label="Cuộn sang trái"
            >
              ‹
            </button>
            <button
              type="button"
              className={styles.carouselNavBtn}
              onClick={() => handleScroll('right')}
              disabled={!canScrollRight}
              aria-label="Cuộn sang phải"
            >
              ›
            </button>
          </div>
        )}
      </div>

      <div className={styles.carouselTrack} ref={scrollRef} onScroll={checkScroll}>
        {tours.map((tour) => (
          <Link
            key={tour.id}
            to={`/tours/${tour.id}`}
            onClick={() => onTourClick(tour.id)}
            className={styles.carouselCard}
          >
            <div className={styles.cardImageWrap}>
              <ImageWithFallback
                src={tour.image_url}
                alt={tour.name}
                className={styles.cardImage}
              />
              <span className={styles.cardDestBadge}>📍 {tour.destination}</span>
              <span className={styles.cardDurationBadge}>
                {tour.duration_label || `${tour.duration} ngày`}
              </span>
            </div>

            <div className={styles.cardContent}>
              <h5 className={styles.cardTitle} title={tour.name}>
                {tour.name}
              </h5>

              <div className={styles.cardRatingRow}>
                <div className={styles.ratingBox}>
                  <span className={styles.starIcon}>★</span>
                  <span className={styles.ratingScore}>{formatRatingToFive(tour.avg_rating)}</span>
                  {tour.review_count !== undefined && (
                    <span className={styles.reviewCount}>({tour.review_count})</span>
                  )}
                </div>
              </div>

              <div className={styles.cardFooter}>
                <div className={styles.priceWrap}>
                  <span className={styles.priceLabel}>Giá từ</span>
                  <span className={styles.priceValue}>{formatPriceVND(tour.price)}</span>
                </div>
                <span className={styles.detailBtn}>
                  Chi tiết →
                </span>
              </div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  )
}

export function ChatPage() {
  const { token, user } = useAuthStore()
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [sessionId, setSessionId] = useState<number | null>(null)
  const didHydrateRef = useRef(false)

  const messagesEndRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  useEffect(() => {
    scrollToBottom()
  }, [messages, loading])

  useEffect(() => {
    if (!token || !user?.id || didHydrateRef.current) return

    const storageKey = `tourai-chat:${user.id}`
    const savedChat = sessionStorage.getItem(storageKey)
    if (!savedChat) {
      didHydrateRef.current = true
      return
    }

    try {
      const parsed = JSON.parse(savedChat) as { messages?: ChatMessage[]; sessionId?: number | null }
      if (Array.isArray(parsed.messages)) {
        setMessages(parsed.messages)
      }
      if (typeof parsed.sessionId === 'number') {
        setSessionId(parsed.sessionId)
      }
    } catch (error) {
      console.error('Failed to restore chat session:', error)
      sessionStorage.removeItem(storageKey)
    } finally {
      didHydrateRef.current = true
    }
  }, [token, user?.id])

  useEffect(() => {
    if (!token || !user?.id || !didHydrateRef.current) return

    const storageKey = `tourai-chat:${user.id}`
    sessionStorage.setItem(
      storageKey,
      JSON.stringify({
        messages,
        sessionId,
      })
    )
  }, [messages, sessionId, token, user?.id])

  // Handle textarea auto-resize
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 120)}px`
    }
  }, [input])

  const handleNewChat = () => {
    setMessages([])
    setSessionId(null)
    setInput('')
    if (user?.id) {
      sessionStorage.removeItem(`tourai-chat:${user.id}`)
    }
    if (textareaRef.current) {
      textareaRef.current.focus()
    }
  }

  const [searchParams, setSearchParams] = useSearchParams()
  const initialQuery = searchParams.get('q')
  const initialQueryHandledRef = useRef(false)

  const handleSend = async (textToSend?: string) => {
    const text = (textToSend ?? input).trim()
    if (!text || loading) return

    setLoading(true)
    if (!textToSend) {
      setInput('')
      if (textareaRef.current) {
        textareaRef.current.style.height = 'auto'
      }
    }

    const tempUserMsgId = Date.now()
    const nowIso = new Date().toISOString()

    // Add optimistic user message
    setMessages((prev) => [
      ...prev,
      {
        id: tempUserMsgId,
        role: 'user',
        content: text,
        created_at: nowIso,
      },
    ])

    try {
      const response = await chatApi.sendMessage(text, sessionId || undefined)

      if (response.session_id && !sessionId) {
        setSessionId(response.session_id)
      }

      setMessages((prev) => [
        ...prev,
        {
          id: Date.now() + 1,
          role: 'assistant',
          content: response.message,
          created_at: new Date().toISOString(),
          destination_suggestions: response.destination_suggestions,
          recommendations: response.recommendations ?? undefined,
          is_complete: response.is_complete,
        },
      ])
    } catch (error) {
      console.error('Chat error:', error)
      setMessages((prev) => [
        ...prev,
        {
          id: Date.now() + 2,
          role: 'assistant',
          content: 'Xin lỗi, hệ thống đang gặp gián đoạn kết nối tới AI. Bạn vui lòng thử lại sau giây lát hoặc bấm "+ Cuộc trò chuyện mới" nhé!',
          created_at: new Date().toISOString(),
        },
      ])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (initialQuery && !initialQueryHandledRef.current) {
      initialQueryHandledRef.current = true
      handleSend(initialQuery)
      setSearchParams({}, { replace: true })
    }
  }, [initialQuery])

  const handleSuggestionClick = (destination: string) => {
    if (loading) return
    handleSend(`Tôi muốn xem các tour du lịch nổi bật tại ${destination}`)
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  const handleTourCardClick = (tourId: number) => {
    actionApi.logAction(tourId, 'click').catch(() => {})
  }

  return (
    <div className={styles.chatPage}>
      <div className={styles.mainContainer}>
        {!token ? (
          /* ================= AUTH REQUIRED STATE ================= */
          <div className={styles.authPromptWrapper}>
            <div className={styles.authPromptCard}>
              <div className={styles.authGraphicCircle}>
                <span className={styles.authGraphicEmoji}>🧭</span>
              </div>
              <h2>Trợ lý Tư vấn Tour Du lịch AI</h2>
              <p>
                Đăng nhập để trò chuyện với AI, nhận đề xuất tour cá nhân hóa theo ngân sách và lịch trình của bạn.
              </p>

              <div className={styles.authFeatures}>
                <div className={styles.authFeatureItem}>
                  <span>✦</span> Gợi ý tour theo sở thích & phong cách du lịch
                </div>
                <div className={styles.authFeatureItem}>
                  <span>✦</span> Phân tích ngân sách và so sánh tour tối ưu
                </div>
                <div className={styles.authFeatureItem}>
                  <span>✦</span> Tự động lưu lịch sử tư vấn & tour yêu thích
                </div>
              </div>

              <div className={styles.authButtons}>
                <Link to="/login" className={styles.primaryAuthBtn}>
                  Đăng nhập ngay
                </Link>
                <Link to="/register" className={styles.secondaryAuthBtn}>
                  Đăng ký tài khoản
                </Link>
              </div>
            </div>
          </div>
        ) : (
          /* ================= MAIN CLEAN CHAT VIEWPORT ================= */
          <div className={styles.chatCard}>
            {/* Header Bar */}
            <header className={styles.chatHeader}>
              <div className={styles.headerLeft}>
                <div className={styles.aiAvatarBadge}>
                  <AiIcon size={20} />
                </div>
                <div className={styles.aiHeaderInfo}>
                  <div className={styles.aiTitleRow}>
                    <h1>TourAI Assistant</h1>
                    <span className={styles.aiStatusBadge}>
                      <span className={styles.statusDot} /> Trực tuyến
                    </span>
                  </div>
                  <p className={styles.aiHeaderSub}>
                    Gợi ý tour cá nhân hóa & lên lịch trình du lịch thông minh
                  </p>
                </div>
              </div>

              <div className={styles.headerRight}>
                <button
                  type="button"
                  onClick={handleNewChat}
                  className={styles.headerNewChatBtn}
                  title="Bắt đầu phiên tư vấn mới"
                >
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <path d="M12 5v14M5 12h14" />
                  </svg>
                  <span>Cuộc trò chuyện mới</span>
                </button>
              </div>
            </header>

            {/* Scrollable Messages Area */}
            <div className={styles.messagesScroll}>
              {messages.length === 0 ? (
                /* ================= WELCOME SCREEN ================= */
                <div className={styles.welcomeContainer}>
                  {/* Hero Intro */}
                  <div className={styles.heroGreeting}>
                    <div className={styles.heroBadge}>✨ Trợ lý Du lịch AI Cá nhân</div>
                    <h2 className={styles.heroTitle}>
                      Xin chào {user?.name || 'bạn'}, bạn muốn đi du lịch ở đâu?
                    </h2>
                    <p className={styles.heroSubtitle}>
                      Hãy chọn nhanh một gợi ý hành trình bên dưới hoặc nhập trực tiếp mong muốn của bạn vào ô chat để TourAI lên lịch trình nhé.
                    </p>
                  </div>

                  {/* 4 Curated Inspiration Bento Cards */}
                  <div className={styles.inspirationGrid}>
                    {INSPIRATION_CARDS.map((card, idx) => (
                      <button
                        key={idx}
                        type="button"
                        className={styles.inspirationCard}
                        onClick={() => handleSend(card.prompt)}
                        disabled={loading}
                      >
                        <div className={styles.inspCardHeader}>
                          <span className={styles.inspCardIcon}>{card.icon}</span>
                          <span className={styles.inspCardTag}>{card.tag}</span>
                        </div>
                        <h4 className={styles.inspCardTitle}>{card.title}</h4>
                        <p className={styles.inspCardDesc}>{card.desc}</p>
                        <div className={styles.inspCardAction}>
                          <span>Tư vấn ngay</span>
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M5 12h14M12 5l7 7-7 7" />
                          </svg>
                        </div>
                      </button>
                    ))}
                  </div>

                  {/* Topic Quick Chips */}
                  <div className={styles.topicSection}>
                    <span className={styles.topicLabel}>Gợi ý chủ đề nhanh:</span>
                    <div className={styles.topicCapsules}>
                      {QUICK_TOPICS.map((topic, idx) => (
                        <button
                          key={idx}
                          type="button"
                          className={styles.topicChip}
                          onClick={() => handleSend(topic.prompt)}
                          disabled={loading}
                        >
                          {topic.label}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              ) : (
                /* ================= MESSAGE STREAM ================= */
                <div className={styles.messagesList}>
                  {messages.map((msg, index) => {
                    const isLatestAssistant = msg.role === 'assistant' && index === messages.length - 1

                    return (
                      <div
                        key={msg.id}
                        className={`${styles.msgWrapper} ${
                          msg.role === 'user' ? styles.userMsgWrapper : styles.assistantMsgWrapper
                        }`}
                      >
                        <div className={styles.msgRow}>
                          {msg.role === 'assistant' && (
                            <div className={styles.assistantAvatar}>
                              <AiIcon size={16} />
                            </div>
                          )}

                          <div className={styles.msgBubbleWrap}>
                            <div
                              className={`${styles.msgBubble} ${
                                msg.role === 'user' ? styles.userBubble : styles.assistantBubble
                              }`}
                            >
                              <div className={styles.msgMetaHeader}>
                                <span className={styles.msgSenderName}>
                                  {msg.role === 'user' ? (user?.name || 'Bạn') : 'TourAI Assistant'}
                                </span>
                                {msg.created_at && (
                                  <span className={styles.msgTime}>{formatMessageTime(msg.created_at)}</span>
                                )}
                              </div>

                              <div className={styles.msgBody}>
                                {renderFormattedContent(msg.content)}
                              </div>

                              {/* Destination Suggestion Chips (Slot filling) */}
                              {msg.role === 'assistant' &&
                                msg.destination_suggestions &&
                                msg.destination_suggestions.length > 0 && (
                                  <div className={styles.destSuggestions}>
                                    <div className={styles.destHeading}>
                                      <span>📍</span> Điểm đến gợi ý phù hợp với bạn:
                                    </div>
                                    <div className={styles.destChipRow}>
                                      {msg.destination_suggestions.map((s: DestinationSuggestion) => (
                                        <button
                                          key={s.destination}
                                          type="button"
                                          className={styles.destChip}
                                          onClick={() => handleSuggestionClick(s.destination)}
                                          disabled={loading}
                                        >
                                          <span className={styles.destChipName}>📍 {s.destination}</span>
                                          <span className={styles.destChipBadge}>{s.tour_count} tour</span>
                                          {s.avg_rating !== null && s.avg_rating !== undefined && (
                                            <span className={styles.destChipRating}>
                                              ⭐ {formatRatingToFive(s.avg_rating)}
                                            </span>
                                          )}
                                        </button>
                                      ))}
                                    </div>
                                  </div>
                                )}

                              {/* Tour Recommendations Horizontal Carousel */}
                              {msg.role === 'assistant' &&
                                msg.is_complete &&
                                msg.recommendations &&
                                msg.recommendations.length > 0 && (
                                  <TourCarousel
                                    tours={msg.recommendations}
                                    onTourClick={handleTourCardClick}
                                  />
                                )}
                            </div>

                            {/* Contextual Follow-up Action Chips (Only for latest AI message) */}
                            {isLatestAssistant && !loading && (
                              <div className={styles.followupActionRow}>
                                <span className={styles.followupLabel}>Hỏi thêm:</span>
                                <button
                                  type="button"
                                  className={styles.followupBtn}
                                  onClick={() => handleSend('Lên chi tiết lịch trình từng ngày (Ngày 1, Ngày 2...) cho chuyến đi này')}
                                  disabled={loading}
                                >
                                  📅 Chi tiết từng ngày
                                </button>
                                <button
                                  type="button"
                                  className={styles.followupBtn}
                                  onClick={() => handleSend('Tìm thêm các tour có mức giá tiết kiệm hơn')}
                                  disabled={loading}
                                >
                                  💰 Tìm tour giá tốt hơn
                                </button>
                                <button
                                  type="button"
                                  className={styles.followupBtn}
                                  onClick={() => handleSend('Gợi ý những món ăn đặc sản và địa điểm check-in không nên bỏ lỡ')}
                                  disabled={loading}
                                >
                                  🍜 Đặc sản & Check-in
                                </button>
                              </div>
                            )}
                          </div>

                          {msg.role === 'user' && (
                            <div className={styles.userAvatar}>
                              <span>{user?.name?.charAt(0).toUpperCase() || 'U'}</span>
                            </div>
                          )}
                        </div>
                      </div>
                    )
                  })}

                  {/* Typing Indicator */}
                  {loading && (
                    <div className={`${styles.msgWrapper} ${styles.assistantMsgWrapper}`}>
                      <div className={styles.msgRow}>
                        <div className={styles.assistantAvatar}>
                          <AiIcon size={16} />
                        </div>
                        <div className={styles.msgBubbleWrap}>
                          <div className={`${styles.msgBubble} ${styles.assistantBubble} ${styles.loadingBubble}`}>
                            <div className={styles.loadingWave}>
                              <span className={styles.waveDot} />
                              <span className={styles.waveDot} />
                              <span className={styles.waveDot} />
                            </div>
                            <span className={styles.loadingText}>TourAI đang phân tích sở thích & chọn tour tối ưu...</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  <div ref={messagesEndRef} />
                </div>
              )}
            </div>

            {/* Bottom Composer Dock */}
            <div className={styles.composerContainer}>
              {/* Quick Pills Bar above input */}
              {messages.length > 0 && (
                <div className={styles.quickPillsRow}>
                  {QUICK_TOPICS.slice(0, 6).map((topic, idx) => (
                    <button
                      key={idx}
                      type="button"
                      className={styles.quickPillBtn}
                      onClick={() => handleSend(topic.prompt)}
                      disabled={loading}
                    >
                      {topic.label}
                    </button>
                  ))}
                </div>
              )}

              {/* Main Input Dock */}
              <div className={styles.inputDock}>
                <textarea
                  ref={textareaRef}
                  rows={1}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Nhập yêu cầu tour (VD: Tôi muốn đi Đà Lạt 3 ngày 2 đêm cùng gia đình, ngân sách 5 triệu)..."
                  className={styles.composerTextarea}
                  disabled={loading}
                />

                <div className={styles.composerActionsRow}>
                  <span className={styles.hintText}>Enter để gửi • Shift+Enter xuống dòng</span>
                  <button
                    type="button"
                    onClick={() => handleSend()}
                    disabled={loading || !input.trim()}
                    className={styles.sendButton}
                    aria-label="Gửi tin nhắn"
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                      <line x1="22" y1="2" x2="11" y2="13" />
                      <polygon points="22 2 15 22 11 13 2 9 22 2" />
                    </svg>
                    <span>Gửi</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
