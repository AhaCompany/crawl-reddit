import dotenv from 'dotenv';
import path from 'path';

// Load environment variables from .env file
dotenv.config();

export const config = {
  reddit: {
    clientId: process.env.REDDIT_CLIENT_ID || '',
    clientSecret: process.env.REDDIT_CLIENT_SECRET || '',
    username: process.env.REDDIT_USERNAME || '',
    password: process.env.REDDIT_PASSWORD || '',
    userAgent: process.env.REDDIT_USER_AGENT || '',
  },
  app: {
    outputDir: path.join(__dirname, '../../data'),
    // Cấu hình chọn phương thức lưu trữ:
    // 'json' - lưu chỉ vào JSON
    // 'postgresql' - lưu vào PostgreSQL với schema thông thường
    // 'sqlite' - lưu vào SQLite với MinerStorage schema
    // 'postgresql_miner' - lưu vào PostgreSQL với MinerStorage schema
    // 'both' - lưu vào cả JSON và SQLite
    // 'both_miner' - lưu vào cả JSON và PostgreSQL với MinerStorage schema
    storage: (process.env.STORAGE_TYPE || 'json') as 'json' | 'postgresql' | 'sqlite' | 'postgresql_miner' | 'both' | 'both_miner',
  },
  // Cấu hình kết nối PostgreSQL
  postgresql: {
    host: process.env.PG_HOST || 'localhost',
    port: parseInt(process.env.PG_PORT || '5432', 10),
    database: process.env.PG_DATABASE || 'reddit_data',
    user: process.env.PG_USER || 'postgres',
    password: process.env.PG_PASSWORD || '',
    // Các cấu hình pool connection
    max: parseInt(process.env.PG_MAX_CONNECTIONS || '20', 10),
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 2000,
  },
  // Cấu hình SQLite
  sqlite: {
    dbPath: process.env.SQLITE_DB_PATH || path.join(__dirname, '../../data/reddit_miner.db'),
  }
};
