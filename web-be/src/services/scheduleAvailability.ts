import type { PoolClient } from 'pg';
import { query } from '../db/index.js';
import { applyScheduleBookingCounts } from '../utils/schedule.js';

type TourWithSchedule = Record<string, unknown> & { id: number; schedule?: unknown };
type QueryRunner = (text: string, params?: unknown[]) => Promise<{ rows: Array<Record<string, unknown>> }>;

const bookingCountKey = (tourId: number, departureDate: string) => `${tourId}:${departureDate}`;

export const loadReservedGuestCounts = async (
  tourIds: number[],
  runQuery: QueryRunner = query,
) => {
  const uniqueTourIds = [...new Set(tourIds.filter((id) => Number.isSafeInteger(id) && id > 0))];
  const counts = new Map<string, number>();
  if (!uniqueTourIds.length) return counts;

  const result = await runQuery(
    `SELECT tour_id, departure_date::text AS departure_date,
            COALESCE(SUM(guest_count), 0)::int AS booked_count
     FROM bookings
     WHERE tour_id = ANY($1::int[])
       AND departure_date > (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Ho_Chi_Minh')::date
       AND (
         status IN ('paid', 'confirmed')
         OR (
           status = 'pending_payment'
           AND payment_status = 'pending'
           AND expires_at > NOW()
         )
       )
     GROUP BY tour_id, departure_date`,
    [uniqueTourIds],
  );

  result.rows.forEach((row) => {
    const tourId = Number(row.tour_id);
    const departureDate = String(row.departure_date || '');
    const bookedCount = Number(row.booked_count);
    if (tourId > 0 && departureDate && Number.isSafeInteger(bookedCount) && bookedCount > 0) {
      counts.set(bookingCountKey(tourId, departureDate), bookedCount);
    }
  });
  return counts;
};

export const hydrateTourScheduleAvailability = async <TourRow extends TourWithSchedule>(
  tours: TourRow[],
  runQuery: QueryRunner = query,
): Promise<TourRow[]> => {
  const counts = await loadReservedGuestCounts(tours.map((tour) => Number(tour.id)), runQuery);
  return tours.map((tour) => {
    const tourCounts = new Map<string, number>();
    for (const [key, bookedCount] of counts) {
      const [tourId, departureDate] = key.split(':');
      if (Number(tourId) === Number(tour.id)) tourCounts.set(departureDate, bookedCount);
    }
    return {
      ...tour,
      schedule: applyScheduleBookingCounts(tour.schedule, tourCounts),
    };
  });
};

export const loadReservedGuestCountsForTour = async (
  client: PoolClient,
  tourId: number,
) => {
  const allCounts = await loadReservedGuestCounts([tourId], client.query.bind(client) as QueryRunner);
  const tourCounts = new Map<string, number>();
  for (const [key, bookedCount] of allCounts) {
    const [, departureDate] = key.split(':');
    tourCounts.set(departureDate, bookedCount);
  }
  return tourCounts;
};
