
-- Tạo bảng proxy_servers để lưu trữ danh sách proxy
CREATE TABLE IF NOT EXISTS proxy_servers (
  id SERIAL PRIMARY KEY,
  host VARCHAR(100) NOT NULL,
  port INTEGER NOT NULL,
  protocol VARCHAR(10) NOT NULL DEFAULT 'http',
  username VARCHAR(100),
  password VARCHAR(100),
  country VARCHAR(50),
  last_used TIMESTAMP DEFAULT NOW(),
  fail_count INTEGER DEFAULT 0,
  success_count INTEGER DEFAULT 0,
  is_disabled BOOLEAN DEFAULT FALSE,
  cooldown_until TIMESTAMP,
  UNIQUE(host, port)
);

