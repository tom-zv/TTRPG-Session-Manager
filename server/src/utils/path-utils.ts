import path from 'path';
import { serverConfig } from '../config/server-config.js';

/**
 * Convert an absolute file path to a path relative to the audio directory
 */
export function toRelativePath(absolutePath: string): string {
  return path.relative(serverConfig.audioDir, absolutePath);
}

/**
 * Convert a relative path to an absolute file path
 */
export function toAbsolutePath(relativePath: string): string {
  return path.join(serverConfig.audioDir, relativePath);
}

/**
 * Determine if a path is a URL or file path
 */
export function isUrl(path: string): boolean {
  return path.startsWith('http://') || path.startsWith('https://');
}

/**
 * Get the appropriate path for client-side use
 * - For URLs: returns the URL unchanged
 * - For file paths: returns a web-accessible path
 */
export function getClientPath(storedPath: string): string {
  if (isUrl(storedPath)) {
    return storedPath;
  }
  
  // Convert relative DB path to web path
  return `/audio/${storedPath.replace(/\\/g, '/')}`;
}