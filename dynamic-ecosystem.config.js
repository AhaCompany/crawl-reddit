
// File này được tạo tự động, không sửa trực tiếp
// Thêm/sửa cấu hình trong database bảng crawl_configs
// Tạo lúc: 2025-03-24T07:48:21.477Z
module.exports = {
  apps: [
  {
    "name": "reddit-crawler-bitcoin",
    "script": "npm",
    "args": "run continuous-crawl -- bitcoin 5m 25 new day",
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
    "args": "run continuous-crawl -- programming 10m 30 hot week",
    "watch": false,
    "autorestart": true,
    "max_memory_restart": "500M",
    "env": {
      "NODE_ENV": "production"
    },
    "log_date_format": "YYYY-MM-DD HH:mm:ss"
  },
  {
    "name": "reddit-crawler-technology",
    "script": "npm",
    "args": "run continuous-crawl -- technology 15m 20 top day",
    "watch": false,
    "autorestart": true,
    "max_memory_restart": "500M",
    "env": {
      "NODE_ENV": "production"
    },
    "log_date_format": "YYYY-MM-DD HH:mm:ss"
  },
  {
    "name": "reddit-crawler-gaming",
    "script": "npm",
    "args": "run continuous-crawl -- gaming 8m 40 hot week",
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