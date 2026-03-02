import fs from 'fs';
import path from 'path';
import { logger } from './logger.js';

/**
 * Parse the .env file and return values for the requested keys.
 * Does NOT load anything into process.env — callers decide what to
 * do with the values. This keeps secrets out of the process environment
 * so they don't leak to child processes.
 */
export function readEnvFile(keys: string[]): Record<string, string> {
  const envFile = path.join(process.cwd(), '.env');
  let content: string;
  try {
    content = fs.readFileSync(envFile, 'utf-8');
  } catch (err) {
    logger.debug({ err }, '.env file not found, using defaults');
    return {};
  }

  const result: Record<string, string> = {};
  const wanted = new Set(keys);

  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    if (!wanted.has(key)) continue;
    let value = trimmed.slice(eqIdx + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (value) result[key] = value;
  }

  return result;
}

/**
 * Updates or adds environment variables to the .env file.
 * Preserves existing variables and comments, updates values for existing keys,
 * and appends new keys to the end of the file.
 *
 * @param updates - Object with key-value pairs to update/add
 */
export function updateEnvFile(updates: Record<string, string>): void {
  const envFile = path.join(process.cwd(), '.env');
  let lines: string[] = [];

  // Read existing file if it exists
  try {
    const content = fs.readFileSync(envFile, 'utf-8');
    lines = content.split('\n');
  } catch {
    // File doesn't exist, start with empty lines
    logger.info('.env file not found, creating new one');
  }

  // Track which keys we've updated
  const updatedKeys = new Set<string>();

  // Update existing keys in place
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    // Skip comments and empty lines
    if (!trimmed || trimmed.startsWith('#')) continue;

    const eqIdx = trimmed.indexOf('=');
    if (eqIdx === -1) continue;

    const key = trimmed.slice(0, eqIdx).trim();
    if (key in updates) {
      // Update this line with new value
      lines[i] = `${key}=${updates[key]}`;
      updatedKeys.add(key);
      logger.info({ key }, 'Updated env variable');
    }
  }

  // Append new keys that weren't found
  for (const [key, value] of Object.entries(updates)) {
    if (!updatedKeys.has(key)) {
      lines.push(`${key}=${value}`);
      logger.info({ key }, 'Added new env variable');
    }
  }

  // Write back to file
  fs.writeFileSync(envFile, lines.join('\n') + '\n', 'utf-8');
  logger.info(
    { count: Object.keys(updates).length },
    'Environment file updated',
  );
}
