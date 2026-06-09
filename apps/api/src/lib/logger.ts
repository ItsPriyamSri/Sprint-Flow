import pino from 'pino';

const isDev = (process.env['NODE_ENV'] ?? 'development') !== 'production';

export const logger = pino({
  level: process.env['LOG_LEVEL'] ?? 'info',
  // Pretty-print in dev; raw JSON in production (parsed by CloudWatch Insights)
  ...(isDev
    ? { transport: { target: 'pino-pretty', options: { colorize: true } } }
    : {}),
});
