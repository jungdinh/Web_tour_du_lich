export const normalizeRatingToFive = (rating?: number | null) => {
  if (!rating || rating <= 0) return 4
  const normalized = rating > 5 ? rating / 2 : rating
  return Math.min(5, Math.max(0, normalized))
}

export const formatRatingToFive = (rating?: number | null) => {
  return normalizeRatingToFive(rating).toFixed(1)
}
