import { getYTAudioURL } from '../../../api/AudioApi.js';

// Default to empty but will be updated from server
let basePath: string = "";

/**
 * Initialize the audio path resolver
 * Fetches server configuration to set the correct base URL
 */
export async function initializeAudioPathResolver(): Promise<void> {
  try {
    const response = await fetch('/api/system/server-info');
    if (!response.ok) {
      throw new Error(`HTTP error! Status: ${response.status}`);
    }
    
    const serverInfo = await response.json();
    basePath = serverInfo.baseUrl;  // /Audio is appended to rel file paths
  } catch (error) {
    console.error('Failed to get server info, using fallback URL:', error);
    // Fallback to a reasonable default based on current origin
    basePath = `${window.location.origin}`;
  }
}

/**
 * Set the base audio path for resolving relative paths
 */
export function setBaseAudioPath(path: string): void {
  basePath = path;
}

/**
 * Get the current base audio path
 */
export function getBaseAudioPath(): string {
  return basePath;
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
  
  if (!basePath) {
    console.warn('Audio path not initialized, using fallback');
    // Fallback to current origin in case initialization hasn't happened yet
    return `${window.location.origin}/audio/${relativePath}`;
  }

  // Join the base path with the cleaned relative path
  return `${basePath}/${relativePath}`;
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
      return resolved;
    } catch (error) {
      console.error("Error resolving YouTube URL:", error);
      return "";
    }
  }

  return url;
}
