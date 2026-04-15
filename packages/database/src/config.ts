import { Prisma } from '@prisma/client';

type PrismaLogLevel = 'info' | 'query' | 'warn' | 'error';
type PrismaLogDefinition = {
  emit: 'stdout' | 'event';
  level: PrismaLogLevel;
};

interface PrismaConfig {
  log: PrismaLogDefinition[];
  errorFormat: 'pretty' | 'colorless' | 'minimal';
}

const configs: Record<string, PrismaConfig> = {
  development: {
    log: [
      { emit: 'event', level: 'query' },
      { emit: 'event', level: 'error' },
      { emit: 'event', level: 'warn' },
      { emit: 'event', level: 'info' },
    ],
    errorFormat: 'pretty',
  },
  test: {
    log: [{ emit: 'event', level: 'error' }],
    errorFormat: 'minimal',
  },
  production: {
    log: [
      { emit: 'event', level: 'error' },
      { emit: 'event', level: 'warn' },
    ],
    errorFormat: 'minimal',
  },
};

export function getPrismaConfig(): PrismaConfig {
  const env = process.env.NODE_ENV || 'development';
  return configs[env] || configs.development;
}
