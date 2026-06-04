const req = (key: string): string => {
  const v = process.env[key];
  if (!v) throw new Error(`Missing required env var: ${key}`);
  return v;
};

const opt = (key: string, fallback: string): string => process.env[key] ?? fallback;

export const env = {
  NODE_ENV: opt('NODE_ENV', 'development'),
  API_PORT: parseInt(opt('API_PORT', '3001'), 10),
  DATABASE_URL: req('DATABASE_URL'),
  JWT_ACCESS_SECRET: req('JWT_ACCESS_SECRET'),
  JWT_REFRESH_SECRET: req('JWT_REFRESH_SECRET'),
  JWT_ACCESS_EXPIRES_IN: opt('JWT_ACCESS_EXPIRES_IN', '15m'),
  JWT_REFRESH_EXPIRES_IN: opt('JWT_REFRESH_EXPIRES_IN', '7d'),
  CORS_ORIGIN: opt('CORS_ORIGIN', 'http://localhost:3002'),
  STORAGE_DRIVER: opt('STORAGE_DRIVER', 'local') as 'local',
  STORAGE_LOCAL_DIR: opt('STORAGE_LOCAL_DIR', './storage'),
  STORAGE_MAX_FILE_SIZE_MB: parseInt(opt('STORAGE_MAX_FILE_SIZE_MB', '20'), 10),
} as const;
