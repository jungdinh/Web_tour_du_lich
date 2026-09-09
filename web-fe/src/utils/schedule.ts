import type { ScheduleRow } from '@/types'

const ISO_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/
const SLASH_DATE_PATTERN = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/
const DASH_DATE_PATTERN = /^(\d{1,2})-(\d{1,2})-(\d{4})$/

const isValidCalendarDate = (year: number, month: number, day: number) => {
  const date = new Date(Date.UTC(year, month - 1, day))
  return date.getUTCFullYear() === year
    && date.getUTCMonth() === month - 1
    && date.getUTCDate() === day
}

const toIsoDate = (year: number, month: number, day: number) => {
  if (!isValidCalendarDate(year, month, day)) return null
  return `${year.toString().padStart(4, '0')}-${month.toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`
}

export const normalizeScheduleDate = (value?: string | null) => {
  const rawValue = String(value ?? '').trim()
  const isoMatch = rawValue.match(ISO_DATE_PATTERN)
  if (isoMatch) return toIsoDate(Number(isoMatch[1]), Number(isoMatch[2]), Number(isoMatch[3]))

  const legacyMatch = rawValue.match(SLASH_DATE_PATTERN) || rawValue.match(DASH_DATE_PATTERN)
  if (legacyMatch) return toIsoDate(Number(legacyMatch[3]), Number(legacyMatch[2]), Number(legacyMatch[1]))

  return null
}

export const getVietnamTodayIsoDate = (now = new Date()) => {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Ho_Chi_Minh',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now)
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]))
  return `${values.year}-${values.month}-${values.day}`
}

export const getTomorrowIsoDate = (now = new Date()) => {
  const today = getVietnamTodayIsoDate(now)
  const [year, month, day] = today.split('-').map(Number)
  const tomorrow = new Date(Date.UTC(year, month - 1, day + 1))
  return `${tomorrow.getUTCFullYear()}-${String(tomorrow.getUTCMonth() + 1).padStart(2, '0')}-${String(tomorrow.getUTCDate()).padStart(2, '0')}`
}

export const isFutureScheduleDate = (value?: string | null, now = new Date()) => {
  const normalizedDate = normalizeScheduleDate(value)
  return normalizedDate !== null && normalizedDate > getVietnamTodayIsoDate(now)
}

export const getFutureScheduleRows = (rows?: ScheduleRow[]) => {
  const today = getVietnamTodayIsoDate()
  const seenDates = new Set<string>()

  return (rows || [])
    .flatMap((row) => {
      const date = normalizeScheduleDate(row.date)
      return date ? [{ ...row, date }] : []
    })
    .filter((row) => row.date > today)
    .filter((row) => {
      if (seenDates.has(row.date)) return false
      seenDates.add(row.date)
      return true
    })
    .sort((left, right) => left.date.localeCompare(right.date))
}

export const getNextAvailableScheduleDate = (rows?: ScheduleRow[]) => {
  const usedDates = new Set((rows || []).map((row) => normalizeScheduleDate(row.date)).filter(Boolean))
  const [year, month, day] = getTomorrowIsoDate().split('-').map(Number)
  const candidate = new Date(Date.UTC(year, month - 1, day))

  while (usedDates.has(candidate.toISOString().slice(0, 10))) {
    candidate.setUTCDate(candidate.getUTCDate() + 1)
  }

  return candidate.toISOString().slice(0, 10)
}

export const formatScheduleDate = (value: string) => {
  const normalizedDate = normalizeScheduleDate(value)
  if (!normalizedDate) return value
  const [year, month, day] = normalizedDate.split('-')
  return `${day}/${month}/${year}`
}
