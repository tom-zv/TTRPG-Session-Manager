import { getYTAudioURL } from '../../../api/AudioApi.js';

let baseAudioPath: string = "http://localhost:3000/audio";

/**
 * Set the base audio path for resolving relative paths
 */
export function setBaseAudioPath(path: string): void {
  baseAudioPath = path;
}

/**
 * Get the current base audio path
 */
export function getBaseAudioPath(): string {
  return baseAudioPath;
}

/**
 * Resolve a relative audio file path to a full path
 */
export function resolveAudioPath(relativePath: string | undefined | null): string {
  if (!relativePath) return "";

  // If it's a URL or already an absolute path, return as is
  if (
    relativePath.startsWith("http://") ||
    relativePath.startsWith("https://") ||
    relativePath.startsWith("/")
  ) {
    return relativePath;
  }

  // Join the base path with the relative path
  return `${baseAudioPath}/${relativePath}`;
}

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
      console.log("Resolved YouTube URL:", resolved);
      return resolved;
    } catch (error) {
      console.error("Error resolving YouTube URL:", error);
      return "";
    }
  }

  return url;
}
