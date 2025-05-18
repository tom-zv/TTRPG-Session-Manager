import path from 'path';
import { serverConfig } from '../config/server-config.js';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

// Get the absolute server root path
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export const serverRoot = path.resolve(__dirname, '../../'); // Navigate up to server root

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

export function relativePathFromAbsolute(absolute: string): string {
  return path.relative(path.join(serverRoot, "public/audio"), absolute);
}

/**
 * Sanitize filename to ensure it's valid across operating systems
 * Removes/replaces invalid filename characters and handles edge cases
 */
export function sanitizeFilename(name: string): string {
  if (!name) return `unnamed-${Date.now()}`;

  // Replace invalid characters with underscores
  // eslint-disable-next-line no-useless-escape
  let sanitized = name.replace(/[\/\\?%*:|"<>]/g, "_");
  
  // Trim whitespace from start and end
  sanitized = sanitized.trim();
  
  // Replace multiple spaces with single space
  sanitized = sanitized.replace(/\s+/g, " ");
  
  // Limit length to 255
  const extIndex = sanitized.lastIndexOf(".");
  if (extIndex !== -1) {
    const base = sanitized.substring(0, extIndex);
    const ext = sanitized.substring(extIndex);
    const maxBaseLength = 255 - ext.length;
    sanitized = base.substring(0, maxBaseLength) + ext;
  } else if (sanitized.length > 255) {
    sanitized = sanitized.substring(0, 255);
  }
  
  // Handle dots at the end (problematic on Windows)
  sanitized = sanitized.replace(/\.+$/, "");
  
  // If sanitization left us with nothing, provide a default
  if (!sanitized) {
    sanitized = `file-${Date.now()}`;
  }
  
  return sanitized;
}