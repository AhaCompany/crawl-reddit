1. Khởi tạo database

  # Tạo bảng crawl_configs (quản lý subreddit cần crawl)
  psql -d reddit_data -c "CREATE TABLE IF NOT EXISTS crawl_configs (
    id SERIAL PRIMARY KEY,
    subreddit VARCHAR(100) NOT NULL UNIQUE,
    crawl_interval VARCHAR(20) NOT NULL DEFAULT '30m',
    post_limit INTEGER NOT NULL DEFAULT 50,
    sort_by VARCHAR(20) NOT NULL DEFAULT 'new',
    time_range VARCHAR(20) DEFAULT 'day',
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
  );"

  # Tạo bảng post_comment_tracking (theo dõi comments của bài viết)
  psql -d reddit_data -c "CREATE TABLE IF NOT EXISTS post_comment_tracking (
    id SERIAL PRIMARY KEY,
    post_id VARCHAR(20) NOT NULL UNIQUE,
    subreddit VARCHAR(100) NOT NULL,
    title TEXT,
    comment_count INTEGER DEFAULT 0,
    last_comment_id VARCHAR(20),
    last_crawled_at TIMESTAMP NOT NULL DEFAULT NOW(),
    first_seen_at TIMESTAMP NOT NULL DEFAULT NOW(),
    is_active BOOLEAN DEFAULT TRUE,
    priority INTEGER DEFAULT 5,
    crawl_frequency VARCHAR(10) DEFAULT '30m',
    check_until TIMESTAMP
  );"

----------------------------------------------------------------------------------------------------------------

  2. Cấu hình các subreddit cần crawl

  # Thêm subreddit cần crawl
  npm run config -- add bitcoin 5m 30 new day
  npm run config -- add cryptocurrency 10m 30 new day
  npm run config -- add bittensor_ 15m 30 new day
  # (Thêm các subreddit khác tương tự)

  # Liệt kê danh sách subreddit đang crawl
  npm run config -- list

----------------------------------------------------------------------------------------------------------------

  3. Khởi động crawl động theo subreddit (Nhiệm vụ 1)

  # Khởi động PM2 với cấu hình từ DB để crawl subreddit
  npm run dynamic-crawl -- --pm2

  # Kiểm tra trạng thái các tiến trình
  pm2 list
  pm2 logs reddit-crawler-bitcoin

----------------------------------------------------------------------------------------------------------------

  4. Thiết lập crawl comments (Nhiệm vụ 2)

  # Nhập tất cả bài viết hiện có vào hệ thống theo dõi
  npm run import-all-posts -- 7 30m  # Theo dõi 7 ngày, tần suất 30 phút

  # Kiểm tra danh sách bài viết đang theo dõi
  npm run comment-track -- list

  # Khởi động hệ thống theo dõi comments tự động
  pm2 start auto-track-ecosystem.config.js

----------------------------------------------------------------------------------------------------------------

  5. Lệnh quản lý hệ thống

  # Kiểm tra logs
  pm2 logs reddit-auto-tracker    # Log của quá trình thêm bài viết mới
  pm2 logs reddit-comment-tracker # Log của quá trình crawl comments

  # Thêm bài viết mới vào theo dõi
  npm run auto-track -- 30 3      # Tìm 30 bài mới, theo dõi 3 ngày

  # Xử lý comments của những bài viết đã theo dõi
  npm run incremental-comments

  # Thêm/quản lý thủ công một bài viết cụ thể
  npm run comment-track -- add 1jdth3j bitcoin 15m 3

  # Vô hiệu hóa theo dõi một bài viết
  npm run comment-track -- disable 1jdth3j

----------------------------------------------------------------------------------------------------------------

  6. Đảm bảo hệ thống chạy liên tục

  # Lưu cấu hình PM2 để khởi động lại sau khi reboot
  pm2 save
  pm2 startup

  # Kiểm tra trạng thái tất cả các tiến trình
  pm2 status

----------------------------------------------------------------------------------------------------------------

  7. Kiểm tra dữ liệu đã thu thập

  # Kiểm tra số lượng bài viết trong database
  psql -d reddit_data -c "SELECT COUNT(*) FROM DataEntity;"

  # Kiểm tra số lượng comments đã thu thập
  psql -d reddit_data -c "SELECT COUNT(*) FROM DataEntity WHERE content::text LIKE '%\"dataType\":\"comment\"%';"

  # Kiểm tra số lượng bài viết đang theo dõi
  psql -d reddit_data -c "SELECT COUNT(*) FROM post_comment_tracking WHERE is_active = TRUE;"

  Các lệnh trên đảm bảo hệ thống của bạn vận hành trơn tru, tự động crawl các bài viết từ subreddit được cấu hình trong
  database và liên tục theo dõi, cập nhật comments cho các bài viết đã thu thập.