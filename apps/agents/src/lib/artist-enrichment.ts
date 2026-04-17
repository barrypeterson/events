import OpenAI from 'openai';
import { logger } from './scraper-utils';

/**
 * Artist enrichment service
 * Enriches music events with artist information from Spotify, YouTube, etc.
 */

interface ArtistInfo {
  name: string;
  spotifyId?: string;
  spotifyUrl?: string;
  genres?: string[];
  imageUrl?: string;
  popularity?: number; // 0-100
  monthlyListeners?: number;
  topTracks?: Array<{
    name: string;
    previewUrl?: string;
  }>;
  youtubeChannelUrl?: string;
  youtubeChannelId?: string;
}

let openaiInstance: OpenAI | null = null;

function getOpenAI(): OpenAI {
  if (!openaiInstance) {
    if (!process.env.OPENAI_API_KEY) {
      throw new Error('OPENAI_API_KEY environment variable is required');
    }
    openaiInstance = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });
  }
  return openaiInstance;
}

/**
 * Extract artist/performer name from event title
 * Handles cover bands, tribute acts, and original artists
 */
export async function extractArtistName(eventTitle: string, eventDescription?: string, tags?: string[]): Promise<{
  artistName: string | null;
  isCoverBand: boolean;
  originalArtist?: string;
}> {
  try {
    const tagsContext = tags ? `Tags: ${tags.join(', ')}` : '';

    const completion = await getOpenAI().chat.completions.create({
      model: 'gpt-4o-mini',
      max_tokens: 512,
      messages: [{
        role: 'user',
        content: `Analyze this music event and determine the artist to look up on Spotify.

Event Title: "${eventTitle}"
${eventDescription ? `Description: "${eventDescription}"` : ''}
${tagsContext}

IMPORTANT: Many local/regional events feature COVER BANDS or TRIBUTE ACTS. For these, we want to find the ORIGINAL ARTIST they're covering on Spotify, NOT the cover band.

Determine:
1. Is this a cover band, tribute band, or original artist performing?
2. If cover/tribute: Who is the ORIGINAL artist they're covering?
3. If original: What is the artist/band name?

Return a JSON object:
{
  "isCoverBand": true/false,
  "performingArtist": "Local band name or null",
  "originalArtist": "Original artist name if cover band, or the performing artist if original",
  "reasoning": "Brief explanation"
}

Examples:

Input: "Unfinished with the Beatles"
Output: {"isCoverBand": true, "performingArtist": "Unfinished", "originalArtist": "The Beatles", "reasoning": "Beatles cover band"}

Input: "Led Zepagain"
Output: {"isCoverBand": true, "performingArtist": "Led Zepagain", "originalArtist": "Led Zeppelin", "reasoning": "Led Zeppelin tribute band"}

Input: "Sweet Spots Dance Party" + Description: "dance hits, covers"
Output: {"isCoverBand": true, "performingArtist": "Sweet Spots", "originalArtist": null, "reasoning": "Cover band playing various artists - no single original artist to enrich"}

Input: "Ben Folds"
Output: {"isCoverBand": false, "performingArtist": "Ben Folds", "originalArtist": "Ben Folds", "reasoning": "Original artist performing"}

Input: "ZZ Top"
Output: {"isCoverBand": false, "performingArtist": "ZZ Top", "originalArtist": "ZZ Top", "reasoning": "Original artist performing"}

Input: "Trivia Night"
Output: {"isCoverBand": false, "performingArtist": null, "originalArtist": null, "reasoning": "Not a music event"}

Return ONLY the JSON object:`
      }]
    });

    const responseText = completion.choices[0]?.message?.content || '';

    // Parse JSON response
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      logger.warn(`No JSON found in artist extraction response`);
      return { artistName: null, isCoverBand: false };
    }

    const parsed = JSON.parse(jsonMatch[0]);

    logger.debug(`Extracted artist for "${eventTitle}": ${parsed.originalArtist} (${parsed.isCoverBand ? 'cover band' : 'original'})`);

    return {
      artistName: parsed.originalArtist || null,
      isCoverBand: parsed.isCoverBand || false,
      originalArtist: parsed.originalArtist || undefined,
    };

  } catch (error: any) {
    logger.error(`Failed to extract artist name: ${error.message}`);
    return { artistName: null, isCoverBand: false };
  }
}

/**
 * Get Spotify access token using client credentials flow
 */
async function getSpotifyToken(): Promise<string> {
  const clientId = process.env.SPOTIFY_CLIENT_ID;
  const clientSecret = process.env.SPOTIFY_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    throw new Error('Spotify credentials not configured');
  }

  const response = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Authorization': 'Basic ' + Buffer.from(clientId + ':' + clientSecret).toString('base64'),
    },
    body: 'grant_type=client_credentials',
  });

  if (!response.ok) {
    throw new Error(`Spotify auth failed: ${response.statusText}`);
  }

  const data = await response.json();
  return data.access_token;
}

/**
 * Search for artist on Spotify and get detailed information
 */
export async function enrichWithSpotify(artistName: string): Promise<ArtistInfo | null> {
  try {
    const token = await getSpotifyToken();

    // Search for artist
    const searchResponse = await fetch(
      `https://api.spotify.com/v1/search?q=${encodeURIComponent(artistName)}&type=artist&limit=1`,
      {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      }
    );

    if (!searchResponse.ok) {
      logger.warn(`Spotify search failed for "${artistName}": ${searchResponse.statusText}`);
      return null;
    }

    const searchData = await searchResponse.json();

    if (!searchData.artists?.items || searchData.artists.items.length === 0) {
      logger.info(`No Spotify artist found for: ${artistName}`);
      return null;
    }

    const artist = searchData.artists.items[0];

    // Get top tracks
    const tracksResponse = await fetch(
      `https://api.spotify.com/v1/artists/${artist.id}/top-tracks?market=US`,
      {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      }
    );

    let topTracks = [];
    if (tracksResponse.ok) {
      const tracksData = await tracksResponse.json();
      topTracks = tracksData.tracks?.slice(0, 3).map((track: any) => ({
        name: track.name,
        previewUrl: track.preview_url,
      })) || [];
    }

    const artistInfo: ArtistInfo = {
      name: artist.name,
      spotifyId: artist.id,
      spotifyUrl: artist.external_urls?.spotify,
      genres: artist.genres || [],
      imageUrl: artist.images?.[0]?.url,
      popularity: artist.popularity,
      monthlyListeners: artist.followers?.total,
      topTracks,
    };

    logger.info(`Enriched artist "${artistName}" with Spotify data: ${artist.name} (${artist.popularity} popularity)`);
    return artistInfo;

  } catch (error: any) {
    logger.error(`Spotify enrichment failed for "${artistName}": ${error.message}`);
    return null;
  }
}

/**
 * Search for artist on YouTube
 */
export async function enrichWithYouTube(artistName: string): Promise<Pick<ArtistInfo, 'youtubeChannelId' | 'youtubeChannelUrl'> | null> {
  try {
    const apiKey = process.env.YOUTUBE_API_KEY;

    if (!apiKey) {
      logger.debug('YouTube API key not configured, skipping YouTube enrichment');
      return null;
    }

    // Search for artist's channel
    const searchResponse = await fetch(
      `https://www.googleapis.com/youtube/v3/search?part=snippet&type=channel&q=${encodeURIComponent(artistName)}&maxResults=1&key=${apiKey}`
    );

    if (!searchResponse.ok) {
      logger.warn(`YouTube search failed for "${artistName}"`);
      return null;
    }

    const searchData = await searchResponse.json();

    if (!searchData.items || searchData.items.length === 0) {
      return null;
    }

    const channel = searchData.items[0];

    return {
      youtubeChannelId: channel.id?.channelId,
      youtubeChannelUrl: `https://www.youtube.com/channel/${channel.id?.channelId}`,
    };

  } catch (error: any) {
    logger.error(`YouTube enrichment failed: ${error.message}`);
    return null;
  }
}

/**
 * Full artist enrichment combining multiple sources
 * Detects cover bands and enriches with ORIGINAL artist data
 */
export async function enrichArtist(eventTitle: string, eventDescription?: string, tags?: string[]): Promise<ArtistInfo | null> {
  try {
    // Extract artist name from event title (handles cover bands)
    const extraction = await extractArtistName(eventTitle, eventDescription, tags);

    if (!extraction.artistName) {
      logger.debug(`No artist name extracted from: "${eventTitle}"`);
      return null;
    }

    if (extraction.isCoverBand && !extraction.originalArtist) {
      logger.debug(`Cover band with multiple artists (no single original): "${eventTitle}"`);
      return null; // Skip enrichment for multi-artist cover bands
    }

    const artistToEnrich = extraction.originalArtist || extraction.artistName;

    logger.info(`Looking up: "${artistToEnrich}"${extraction.isCoverBand ? ' (original artist from cover band)' : ''}`);

    // Enrich with Spotify
    const spotifyData = await enrichWithSpotify(artistToEnrich);

    if (!spotifyData) {
      logger.debug(`No Spotify data found for: "${artistToEnrich}"`);
      return null;
    }

    // Optionally enrich with YouTube
    const youtubeData = await enrichWithYouTube(artistToEnrich);

    const enrichedArtist: ArtistInfo = {
      ...spotifyData,
      ...youtubeData,
    };

    return enrichedArtist;

  } catch (error: any) {
    logger.error(`Artist enrichment failed for "${eventTitle}": ${error.message}`);
    return null;
  }
}

/**
 * Batch enrich multiple events
 * Includes rate limiting to avoid hitting API limits
 */
export async function batchEnrichEvents(
  events: Array<{ title: string; description?: string }>
): Promise<Map<string, ArtistInfo>> {
  const results = new Map<string, ArtistInfo>();

  for (const event of events) {
    try {
      const artistInfo = await enrichArtist(event.title, event.description);

      if (artistInfo) {
        results.set(event.title, artistInfo);
      }

      // Rate limiting: Wait 500ms between Spotify API calls
      await new Promise(resolve => setTimeout(resolve, 500));

    } catch (error: any) {
      logger.error(`Failed to enrich event "${event.title}": ${error.message}`);
    }
  }

  logger.info(`Enriched ${results.size}/${events.length} events with artist data`);
  return results;
}
