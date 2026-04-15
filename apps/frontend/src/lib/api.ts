export const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:6001'

export function getImageUrl(imagePath: string | null | undefined): string {
  if (!imagePath) {
    return '/placeholder-event.jpg'
  }

  // If it's already a full URL, return it
  if (imagePath.startsWith('http://') || imagePath.startsWith('https://')) {
    return imagePath
  }

  // Otherwise, prepend the API base URL
  return `${API_BASE_URL}${imagePath.startsWith('/') ? '' : '/'}${imagePath}`
}

export function getMapUrl(lat: number, lng: number, venue: string): string {
  const encodedVenue = encodeURIComponent(venue)
  return `https://www.google.com/maps/search/?api=1&query=${lat},${lng}&query_place_id=${encodedVenue}`
}
