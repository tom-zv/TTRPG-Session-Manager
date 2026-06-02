import fs from 'fs';
import path from 'path';
import { serverConfig } from 'src/config/server-config.js';


/**
 * Sanitizes a downloaded file by renaming it if necessary
 * @param relPath Path relative to the public directory
 * @returns The actual filename, including its extension
 */
export function sanitizeFilename(relPath: string): string {
  const filePath = path.join(serverConfig.publicDir, relPath);
  const parsedPath = path.parse(filePath);
  const baseName = sanitizeName(parsedPath.name, 255 - Buffer.byteLength(parsedPath.ext));
  const filename = `${baseName}${parsedPath.ext}`;
  const newFilePath = path.join(parsedPath.dir, filename);

  if (filePath !== newFilePath) {
    // Never replace an existing file that sanitizes to the same name.
    fs.copyFileSync(filePath, newFilePath, fs.constants.COPYFILE_EXCL);
    fs.unlinkSync(filePath);
  }

  return filename;
}

/**
 * Sanitize filename to ensure it's valid across operating systems
 * Removes/replaces invalid filename characters and handles edge cases
 */
export function sanitizeName(name: string, maxBytes = 255): string {
  // eslint-disable-next-line no-control-regex
  let sanitized = (name || "unnamed").replace(/[/\\?%*:|"<>\u0000-\u001f\u007f]/g, "_")
    .replace(/\s+/g, " ")
    .replace(/#/g, "")
    .replace(/｜/g, "-")
    .trim();

  // Windows reserves these names even when an extension is present.
  if (/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(sanitized)) {
    sanitized = `_${sanitized}`;
  }

  let byteLength = 0;
  sanitized = Array.from(sanitized).filter((character) => {
    byteLength += Buffer.byteLength(character);
    return byteLength <= maxBytes;
  }).join("").replace(/[. ]+$/, "");

  return sanitized || "file";
}
