import { app } from 'electron';
import path from 'path';
import fs from 'fs';

const MAX_SIZE = 2 * 1024 * 1024; // 2MB per file, then rotate

let logDir: string | null = null;
let logStream: fs.WriteStream | null = null;
let currentLogPath: string | null = null;

function getLogDir(): string {
  if (!logDir) {
    logDir = path.join(app.getPath('userData'), 'logs');
    if (!fs.existsSync(logDir)) fs.mkdirSync(logDir, { recursive: true });
  }
  return logDir;
}

function getLogPath(): string {
  const d = new Date();
  const date = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  return path.join(getLogDir(), `purroxy-${date}.log`);
}

function ensureStream(): fs.WriteStream {
  const target = getLogPath();
  if (logStream && currentLogPath === target) {
    // Rotate if too big
    try {
      const stat = fs.statSync(target);
      if (stat.size > MAX_SIZE) {
        logStream.end();
        const rotated = target.replace('.log', `-${Date.now()}.log`);
        fs.renameSync(target, rotated);
        logStream = fs.createWriteStream(target, { flags: 'a' });
        currentLogPath = target;
      }
    } catch { /* file may not exist yet */ }
    return logStream;
  }
  if (logStream) logStream.end();
  logStream = fs.createWriteStream(target, { flags: 'a' });
  currentLogPath = target;
  return logStream;
}

function ts(): string {
  return new Date().toISOString();
}

function write(level: string, tag: string, message: string, data?: unknown): void {
  const line = data !== undefined
    ? `[${ts()}] ${level} [${tag}] ${message} ${JSON.stringify(data)}\n`
    : `[${ts()}] ${level} [${tag}] ${message}\n`;

  try {
    ensureStream().write(line);
  } catch {
    // Fallback to console if stream fails
    process.stderr.write(line);
  }

  // Also write to stdout for dev console visibility
  if (process.env.NODE_ENV === 'development') {
    process.stdout.write(line);
  }
}

export const log = {
  info: (tag: string, message: string, data?: unknown) => write('INFO', tag, message, data),
  warn: (tag: string, message: string, data?: unknown) => write('WARN', tag, message, data),
  error: (tag: string, message: string, data?: unknown) => write('ERROR', tag, message, data),
  debug: (tag: string, message: string, data?: unknown) => write('DEBUG', tag, message, data),

  /** Return the path to today's log file (for reading in Claude sessions) */
  getLogPath,

  /** Return the log directory */
  getLogDir,
};
