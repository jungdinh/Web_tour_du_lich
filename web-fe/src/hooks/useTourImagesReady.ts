import { useEffect, useState } from 'react'

interface TourImageSource {
  image_url?: string
  gallery?: string[]
}

const settledImageUrls = new Set<string>()
const IMAGE_TIMEOUT_MS = 12000

const getImageUrl = (tour: TourImageSource) => tour.image_url?.trim() || tour.gallery?.find((url) => url?.trim())?.trim() || ''

const preloadImage = (url: string) => new Promise<void>((resolve) => {
  if (!url || settledImageUrls.has(url)) {
    resolve()
    return
  }

  const image = new Image()
  let settled = false

  const finish = () => {
    if (settled) return
    settled = true
    window.clearTimeout(timeoutId)
    image.onload = null
    image.onerror = null
    settledImageUrls.add(url)
    resolve()
  }

  const timeoutId = window.setTimeout(finish, IMAGE_TIMEOUT_MS)

  image.onload = () => {
    if (typeof image.decode === 'function') {
      void image.decode().catch(() => undefined).finally(finish)
      return
    }
    finish()
  }
  image.onerror = finish
  image.src = url

  if (image.complete) finish()
})

export function useTourImagesReady(tours: TourImageSource[]) {
  const imageUrls = Array.from(new Set(tours.map(getImageUrl).filter(Boolean))).sort()
  const imageKey = imageUrls.join('|')
  const [readyKey, setReadyKey] = useState(imageKey && imageUrls.every((url) => settledImageUrls.has(url)) ? imageKey : '')

  useEffect(() => {
    let cancelled = false

    if (!imageKey) {
      setReadyKey('')
      return () => {
        cancelled = true
      }
    }

    if (imageUrls.every((url) => settledImageUrls.has(url))) {
      setReadyKey(imageKey)
      return () => {
        cancelled = true
      }
    }

    void Promise.all(imageUrls.map(preloadImage)).then(() => {
      if (!cancelled) setReadyKey(imageKey)
    })

    return () => {
      cancelled = true
    }
  }, [imageKey])

  return !imageKey || readyKey === imageKey
}
