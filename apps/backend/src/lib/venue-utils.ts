import { prisma } from '../config/database';

/**
 * Normalize venue name for matching - enhanced version
 */
export function normalizeVenueName(name: string): string {
  return name
    .toLowerCase()
    .trim()
    // Remove articles and common words
    .replace(/\b(the|and|at|in|on)\b/g, '')
    // Standardize abbreviations
    .replace(/\btheater\b/g, 'theatre')
    .replace(/\btheatre\b/g, 'theater')
    .replace(/\bcenter\b/g, 'centre')
    .replace(/\bcentre\b/g, 'center')
    .replace(/\bbrewing\b/g, 'brewery')
    .replace(/\bbrewery\b/g, 'brewing')
    .replace(/\bslo\b/g, 'san luis obispo')
    .replace(/\bsan luis obispo\b/g, 'slo')
    // Remove special characters
    .replace(/[^\w\s]/g, '')
    // Normalize whitespace
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Calculate Levenshtein distance
 */
function levenshteinDistance(str1: string, str2: string): number {
  const matrix: number[][] = [];

  for (let i = 0; i <= str2.length; i++) {
    matrix[i] = [i];
  }

  for (let j = 0; j <= str1.length; j++) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= str2.length; i++) {
    for (let j = 1; j <= str1.length; j++) {
      if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j] + 1
        );
      }
    }
  }

  return matrix[str2.length][str1.length];
}

/**
 * Calculate similarity score between two venue names (0-1)
 */
export function calculateNameSimilarity(name1: string, name2: string): number {
  const normalized1 = normalizeVenueName(name1);
  const normalized2 = normalizeVenueName(name2);

  if (normalized1 === normalized2) return 1.0;

  const distance = levenshteinDistance(normalized1, normalized2);
  const maxLength = Math.max(normalized1.length, normalized2.length);

  return maxLength > 0 ? 1 - distance / maxLength : 0;
}

/**
 * Calculate distance between coordinates in meters (Haversine formula)
 */
export function calculateDistance(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371000; // Earth's radius in meters
  const φ1 = (lat1 * Math.PI) / 180;
  const φ2 = (lat2 * Math.PI) / 180;
  const Δφ = ((lat2 - lat1) * Math.PI) / 180;
  const Δλ = ((lon2 - lon1) * Math.PI) / 180;

  const a =
    Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
    Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c;
}

export interface VenueMatch {
  venue: any;
  matchReason: 'exact' | 'same_address' | 'same_coordinates' | 'fuzzy_name';
  similarityScore: number;
  distance?: number;
}

/**
 * Find matching venues using multiple strategies
 */
export async function findMatchingVenues(venueData: {
  name: string;
  address?: string;
  city?: string;
  latitude?: number;
  longitude?: number;
}): Promise<VenueMatch[]> {
  const matches: VenueMatch[] = [];
  const normalizedName = normalizeVenueName(venueData.name);
  const city = venueData.city || 'San Luis Obispo';

  // Strategy 1: Exact normalized name
  const exactMatches = await prisma.venue.findMany({
    where: { normalizedName, city },
  });

  for (const venue of exactMatches) {
    matches.push({
      venue,
      matchReason: 'exact',
      similarityScore: 1.0,
    });
  }

  if (matches.length > 0) return matches;

  // Strategy 2: Same address
  if (venueData.address) {
    const addressMatches = await prisma.venue.findMany({
      where: { address: venueData.address, city },
    });

    for (const venue of addressMatches) {
      matches.push({
        venue,
        matchReason: 'same_address',
        similarityScore: 0.95,
      });
    }
  }

  if (matches.length > 0) return matches;

  // Strategy 3: Same coordinates (within 50m)
  if (venueData.latitude && venueData.longitude) {
    const nearbyVenues = await prisma.venue.findMany({
      where: {
        latitude: { not: null },
        longitude: { not: null },
        city,
      },
    });

    for (const venue of nearbyVenues) {
      if (venue.latitude && venue.longitude) {
        const distance = calculateDistance(
          Number(venueData.latitude),
          Number(venueData.longitude),
          Number(venue.latitude),
          Number(venue.longitude)
        );

        if (distance < 50) {
          matches.push({
            venue,
            matchReason: 'same_coordinates',
            similarityScore: 0.9,
            distance,
          });
        }
      }
    }
  }

  if (matches.length > 0) return matches;

  // Strategy 4: Fuzzy name match (>= 0.85 similarity)
  const allVenues = await prisma.venue.findMany({ where: { city } });

  for (const venue of allVenues) {
    const similarity = calculateNameSimilarity(venueData.name, venue.name);

    if (similarity >= 0.85) {
      matches.push({
        venue,
        matchReason: 'fuzzy_name',
        similarityScore: similarity,
      });
    }
  }

  return matches.sort((a, b) => b.similarityScore - a.similarityScore);
}

/**
 * Get canonical venue (follows merge chain)
 */
export async function getCanonicalVenueId(venueId: string): Promise<string> {
  const duplicate = await prisma.venueDuplicate.findFirst({
    where: { duplicateVenueId: venueId },
    orderBy: { mergedAt: 'desc' },
  });

  if (duplicate) {
    return getCanonicalVenueId(duplicate.canonicalVenueId);
  }

  return venueId;
}
