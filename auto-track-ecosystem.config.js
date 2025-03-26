/**
 * Cấu hình PM2 cho hệ thống theo dõi comments tự động
 */
module.exports = {
  apps: [
    {
      name: "reddit-auto-tracker",
      script: "npm",
      args: "run auto-track -- 30 3",  // Theo dõi 30 bài viết mới, giữ trong 3 ngày
      cron_restart: "*/30 * * * *",    // Chạy mỗi 30 phút
      watch: false,
      autorestart: false,              // Không tự động khởi động lại
      max_memory_restart: "200M",
      env: {
        NODE_ENV: "production",
      },
      log_date_format: "YYYY-MM-DD HH:mm:ss",
    },
    {
      name: "reddit-comment-tracker",
      script: "npm",
      args: "run incremental-comments",
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