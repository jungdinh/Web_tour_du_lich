export const preferenceMeta: Record<string, { label: string; icon: string; group: string }> = {
  family: { label: 'Gia đình', icon: '👨‍👩‍👧', group: 'companions' },
  romantic: { label: 'Cặp đôi', icon: '💑', group: 'companions' },
  adventure: { label: 'Khám phá, mạo hiểm', icon: '🧗', group: 'style' },
  relax: { label: 'Nghỉ dưỡng', icon: '🧘', group: 'style' },
  spiritual: { label: 'Tâm linh', icon: '🛕', group: 'style' },
  beach: { label: 'Biển, đảo', icon: '🏝️', group: 'landscape' },
  mountain: { label: 'Núi, cao nguyên', icon: '⛰️', group: 'landscape' },
  nature: { label: 'Thiên nhiên', icon: '🌿', group: 'landscape' },
  city: { label: 'Thành phố', icon: '🏙️', group: 'landscape' },
  culture: { label: 'Văn hóa', icon: '🎭', group: 'experience' },
  history: { label: 'Lịch sử', icon: '🏛️', group: 'experience' },
  festival: { label: 'Lễ hội', icon: '🎉', group: 'experience' },
  photography: { label: 'Chụp ảnh, check-in', icon: '📷', group: 'experience' },
  wildlife: { label: 'Động vật hoang dã', icon: '🦒', group: 'experience' },
  cruise: { label: 'Du thuyền', icon: '🚢', group: 'experience' },
  nightlife: { label: 'Trải nghiệm về đêm', icon: '🌃', group: 'experience' },
  water_sports: { label: 'Thể thao dưới nước', icon: '🏄', group: 'experience' },
  food: { label: 'Ẩm thực', icon: '🍜', group: 'experience' },
  shopping: { label: 'Mua sắm', icon: '🛍️', group: 'experience' },
  budget: { label: 'Tiết kiệm', icon: '💰', group: 'budget' },
  luxury: { label: 'Cao cấp', icon: '✨', group: 'budget' },
}

export const preferenceGroups = [
  { id: 'companions', title: 'Đồng hành', description: 'Bạn thường muốn đi cùng ai?' },
  { id: 'style', title: 'Phong cách chuyến đi', description: 'Nhịp điệu và mục đích của hành trình.' },
  { id: 'landscape', title: 'Không gian yêu thích', description: 'Loại điểm đến khiến bạn hứng thú.' },
  { id: 'experience', title: 'Trải nghiệm', description: 'Những hoạt động bạn muốn ưu tiên.' },
  { id: 'budget', title: 'Ngân sách', description: 'Mức chi tiêu phù hợp với bạn.' },
] as const

export const getInterestLevel = (weight: number) => {
  if (weight >= 0.7) return { label: 'Rất quan tâm', tone: 'high' as const }
  if (weight >= 0.4) return { label: 'Có quan tâm', tone: 'medium' as const }
  return { label: 'Đang tìm hiểu', tone: 'low' as const }
}

const joinVietnameseList = (items: string[]) => {
  if (items.length <= 1) return items[0] || ''
  return `${items.slice(0, -1).join(', ')} và ${items[items.length - 1]}`
}

export const buildTravelProfileSummary = (labels: string[]) => {
  if (!labels.length) return 'Vivu chưa có đủ dữ liệu để mô tả phong cách du lịch của bạn.'
  return `Bạn đang quan tâm nhiều nhất đến ${joinVietnameseList(labels.map((label) => label.toLocaleLowerCase('vi')))}. Vivu sẽ ưu tiên những hành trình phù hợp với các lựa chọn này.`
}
