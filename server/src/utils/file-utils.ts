import fs from 'fs';
import path from 'path';
import { serverConfig } from 'src/config/server-config.js';


/**
 * Sanitizes a downloaded file by renaming it if necessary
 * @param filePath The full path to the file
 * @returns updated name
 */
export function sanitizeFilename(relPath: string): string {
  const filePath = path.join(serverConfig.publicDir, relPath);
  const dir = path.dirname(filePath);
  const parsedPath = path.parse(filePath);
  
  // If no sanitized name provided, sanitize the existing filename
  const baseName = sanitizeName(parsedPath.name);
  const newFileName = `${baseName}${parsedPath.ext}`;
  const newFilePath = path.join(dir, newFileName);
  
  // Only rename if the filename changed
  if (filePath !== newFilePath) {
    try {
      fs.renameSync(filePath, newFilePath);
    } catch {
      // Continue with original filename if rename fails
      return path.basename(relPath)
    }

  }
  
  return baseName;
}

/**
 * Sanitize filename to ensure it's valid across operating systems
 * Removes/replaces invalid filename characters and handles edge cases
 */
export function sanitizeName(name: string): string {
  if (!name) return `unnamed-${Date.now()}`;

  // Replace invalid characters with underscores
  // eslint-disable-next-line no-useless-escape
  let sanitized = name.replace(/[\/\\?%*:|"<>]/g, "_")
    .replace(/\s+/g, " ") // replace multiple whitespace with single space
    .replace(/#/g, '') // Remove hash symbols
    .replace(/[｜|]/g, '-') // Replace fullwidth and regular vertical bars
    .trim();

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
