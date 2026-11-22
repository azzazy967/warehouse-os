import { TypeOrmModuleOptions } from '@nestjs/typeorm';
import * as dotenv from 'dotenv';
import { entities } from '../database/entities';

dotenv.config();

const commonOptions = {
  entities,
  // Schema changes must be explicit; never auto-alter a production database.
  synchronize: (process.env.DB_SYNCHRONIZE ?? 'false') === 'true',
  logging: false,
};

export function getDatabaseOptions(): TypeOrmModuleOptions {
  if (process.env.DB_TYPE === 'sqlite') {
    return {
      ...commonOptions,
      type: 'better-sqlite3',
      database: process.env.SQLITE_PATH || 'warehouse.sqlite',
    } as TypeOrmModuleOptions;
  }

  return {
    ...commonOptions,
    type: 'postgres',
    host: process.env.DB_HOST || '127.0.0.1',
    port: Number(process.env.DB_PORT || 5432),
    username: process.env.DB_USER || 'warehouse',
    password: process.env.DB_PASSWORD || 'warehouse',
    database: process.env.DB_NAME || 'warehouse_db',
    ssl:
      process.env.DB_SSL === 'true'
        ? { rejectUnauthorized: process.env.DB_SSL_REJECT_UNAUTHORIZED !== 'false' }
        : false,
  } as TypeOrmModuleOptions;
}
