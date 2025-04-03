-- Thêm cột use_pagination và max_pages vào bảng crawl_configs
ALTER TABLE crawl_configs ADD COLUMN IF NOT EXISTS use_pagination BOOLEAN DEFAULT FALSE;
ALTER TABLE crawl_configs ADD COLUMN IF NOT EXISTS max_pages INTEGER DEFAULT 1;

-- Cập nhật comment cho bảng
COMMENT ON COLUMN crawl_configs.use_pagination IS 'Kích hoạt phân trang khi crawl nhiều dữ liệu';
COMMENT ON COLUMN crawl_configs.max_pages IS 'Số trang tối đa cần crawl khi use_pagination=true';

-- Mặc định các config đang tồn tại sẽ không dùng phân trang
UPDATE crawl_configs SET use_pagination = FALSE, max_pages = 1 WHERE use_pagination IS NULL;