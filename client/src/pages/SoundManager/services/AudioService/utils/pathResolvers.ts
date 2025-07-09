import { getYTAudioURL } from '../../../api/AudioApi.js';

/**
 * Resolve a URL, handling special cases.
 */
export async function resolveAudioUrl(
  url: string | undefined | null
): Promise<string> {
  if (!url) return "";
  
  if (url.includes("youtube.com") || url.includes("youtu.be")) {
    try {
      const resolved = await getYTAudioURL(url);
      return resolved;
    } catch (error) {
      console.error("Error resolving YouTube URL:", error);
      return "";
    }
  }

  return url;
}
