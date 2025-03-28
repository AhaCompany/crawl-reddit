/**
 * Công cụ chạy các migration cho cơ sở dữ liệu
 */
import { runMigrations, closePool } from './utils/postgresHelper';

async function main() {
  try {
    console.log('Starting database migrations...');
    await runMigrations();
    console.log('Database migrations completed successfully');
  } catch (error) {
    console.error('Error running migrations:', error);
    process.exit(1);
  } finally {
    await closePool();
  }
}

main();