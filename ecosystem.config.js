module.exports = {
  apps : [
    {
      name: "reddit-crawler-BitcoinCash",
      script: "npm",
      args: "run continuous-crawl -- BitcoinCash 5m 25 new",
      watch: false,
      autorestart: true,
      max_memory_restart: "500M",
      env: {
        NODE_ENV: "production",
      },
      log_date_format: "YYYY-MM-DD HH:mm:ss",
    }
  ]
};