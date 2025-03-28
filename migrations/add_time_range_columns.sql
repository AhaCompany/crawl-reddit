
-- Thêm cột start_time và end_time vào bảng crawl_configs
ALTER TABLE IF EXISTS crawl_configs
ADD COLUMN IF NOT EXISTS start_time TIMESTAMP,
ADD COLUMN IF NOT EXISTS end_time TIMESTAMP;

