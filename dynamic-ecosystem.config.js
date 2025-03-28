
// File này được tạo tự động, không sửa trực tiếp
// Thêm/sửa cấu hình trong database bảng crawl_configs
// Tạo lúc: 2025-03-28T04:11:22.691Z
module.exports = {
  apps: [
  {
    "name": "reddit-crawler-bitcoin",
    "script": "npm",
    "args": "run continuous-crawl -- bitcoin 5m 300 new month",
    "watch": false,
    "autorestart": true,
    "max_memory_restart": "500M",
    "env": {
      "NODE_ENV": "production"
    },
    "log_date_format": "YYYY-MM-DD HH:mm:ss"
  },
  {
    "name": "reddit-crawler-programming",
    "script": "npm",
    "args": "run continuous-crawl -- programming 5m 300 new month",
    "watch": false,
    "autorestart": true,
    "max_memory_restart": "500M",
    "env": {
      "NODE_ENV": "production"
    },
    "log_date_format": "YYYY-MM-DD HH:mm:ss"
  }
]
};