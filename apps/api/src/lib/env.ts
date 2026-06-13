const req = (key: string): string => {
  const v = process.env[key];
  if (!v) throw new Error(`Missing required env var: ${key}`);
  return v;
};

const opt = (key: string, fallback: string): string => process.env[key] ?? fallback;

const isProduction = (process.env['NODE_ENV'] ?? 'development') === 'production';

// CORS: required in production; supports comma-separated list for multiple origins
const rawCorsOrigin = isProduction
  ? req('CORS_ORIGIN')
  : opt('CORS_ORIGIN', 'http://localhost:3002');

export const CORS_ORIGINS: string[] = rawCorsOrigin
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

const storageDriver = opt('STORAGE_DRIVER', 'local') as 'local' | 's3';

export const env = {
  NODE_ENV: opt('NODE_ENV', 'development'),
  API_PORT: parseInt(opt('API_PORT', '3001'), 10),
  DATABASE_URL: req('DATABASE_URL'),
  JWT_ACCESS_SECRET: req('JWT_ACCESS_SECRET'),
  JWT_REFRESH_SECRET: req('JWT_REFRESH_SECRET'),
  JWT_ACCESS_EXPIRES_IN: opt('JWT_ACCESS_EXPIRES_IN', '15m'),
  JWT_REFRESH_EXPIRES_IN: opt('JWT_REFRESH_EXPIRES_IN', '7d'),
  CORS_ORIGINS,
  STORAGE_DRIVER: storageDriver,
  STORAGE_LOCAL_DIR: opt('STORAGE_LOCAL_DIR', './storage'),
  STORAGE_MAX_FILE_SIZE_MB: parseInt(opt('STORAGE_MAX_FILE_SIZE_MB', '20'), 10),
  // S3 — only required when STORAGE_DRIVER=s3
  S3_BUCKET: process.env['S3_BUCKET'] ?? '',
  S3_REGION: process.env['S3_REGION'] ?? '',
  // Auth / RBAC
  ALLOWED_EMAIL_DOMAINS: opt('ALLOWED_EMAIL_DOMAINS', ''),
  DEFAULT_MEMBER_PASSWORD: process.env['DEFAULT_MEMBER_PASSWORD'] ?? '',
  SUPER_ADMIN_EMAILS: opt('SUPER_ADMIN_EMAILS', ''),
  DEFAULT_WORKSPACE_SLUG: process.env['DEFAULT_WORKSPACE_SLUG'] ?? '',
  DEFAULT_PROJECT_ID: process.env['DEFAULT_PROJECT_ID'] ?? '',
} as const;
