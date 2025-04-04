/**
 * PM2 configuration file for historical crawling
 * This file defines PM2 process for crawling historical data from Reddit
 */

module.exports = {
  apps: [
    {
      name: 'reddit-historical-crawler',
      script: 'npm',
      args: 'run historical-crawl',
      watch: false,
      autorestart: false,  // Don't restart automatically since it's a one-time job
      env: {
        NODE_ENV: 'production',
        STORAGE_TYPE: 'postgresql_miner', // Set storage type to PostgreSQL with MinerStorage schema
      },
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
      max_memory_restart: '1G',
      output: './logs/historical-crawler-out.log',
      error: './logs/historical-crawler-error.log',
      merge_logs: true,
      time: true // Add timestamp to logs
    }
  ]
};