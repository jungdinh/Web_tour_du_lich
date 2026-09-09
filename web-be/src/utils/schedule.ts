export interface ScheduleRow {
  date: string;
  price: number;
  available: boolean;
}

const ISO_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const SLASH_DATE_PATTERN = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/;
const DASH_DATE_PATTERN = /^(\d{1,2})-(\d{1,2})-(\d{4})$/;

const isValidCalendarDate = (year: number, month: number, day: number) => {
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year
    && date.getUTCMonth() === month - 1
    && date.getUTCDate() === day;
};

const toIsoDate = (year: number, month: number, day: number) => {
  if (!isValidCalendarDate(year, month, day)) return null;
  return `${year.toString().padStart(4, '0')}-${month.toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`;
};

export const normalizeScheduleDate = (value: unknown): string | null => {
  const rawValue = String(value ?? '').trim();
  const isoMatch = rawValue.match(ISO_DATE_PATTERN);
  if (isoMatch) {
    return toIsoDate(Number(isoMatch[1]), Number(isoMatch[2]), Number(isoMatch[3]));
  }

  const slashMatch = rawValue.match(SLASH_DATE_PATTERN) || rawValue.match(DASH_DATE_PATTERN);
  if (slashMatch) {
    return toIsoDate(Number(slashMatch[3]), Number(slashMatch[2]), Number(slashMatch[1]));
  }

  return null;
};

export const getVietnamTodayIsoDate = (now = new Date()) => {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Ho_Chi_Minh',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
};

export const isFutureScheduleDate = (value: unknown, now = new Date()) => {
  const normalizedDate = normalizeScheduleDate(value);
  return normalizedDate !== null && normalizedDate > getVietnamTodayIsoDate(now);
};

const toScheduleRow = (value: unknown): ScheduleRow | null => {
  if (!value || typeof value !== 'object') return null;
  const row = value as Record<string, unknown>;
  const date = normalizeScheduleDate(row.date);
  if (!date) return null;

  const parsedPrice = Number(row.price);
  const available = row.available === undefined || row.available === null
    ? true
    : row.available === true || row.available === 'true';
  return {
    date,
    price: Number.isSafeInteger(parsedPrice) && parsedPrice >= 0 ? parsedPrice : 0,
    available,
  };
};

export const normalizeScheduleRows = (value: unknown): ScheduleRow[] => {
  if (!Array.isArray(value)) return [];
  return value.flatMap((row) => {
    const normalizedRow = toScheduleRow(row);
    return normalizedRow ? [normalizedRow] : [];
  });
};

export const filterFutureScheduleRows = (value: unknown, now = new Date()): ScheduleRow[] => {
  const today = getVietnamTodayIsoDate(now);
  const seenDates = new Set<string>();

  return normalizeScheduleRows(value)
    .filter((row) => row.date > today)
    .filter((row) => {
      if (seenDates.has(row.date)) return false;
      seenDates.add(row.date);
      return true;
    })
    .sort((left, right) => left.date.localeCompare(right.date));
};
