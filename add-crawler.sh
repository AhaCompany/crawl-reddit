#!/bin/bash

# Kiểm tra số lượng tham số
if [ $# -lt 2 ]; then
  echo "Usage: $0 <subreddit> <interval> [limit] [sort] [timeRange]"
  echo "Example: $0 programming 5m 50 new"
  exit 1
fi

# Lấy các tham số
SUBREDDIT=$1
INTERVAL=$2
LIMIT=${3:-100}
SORT=${4:-new}
TIMERANGE=${5:-day}

# Tạo tên tiến trình
PROCESS_NAME="reddit-crawler-$SUBREDDIT"

# Khởi động crawler với PM2
echo "Starting Reddit crawler for r/$SUBREDDIT..."
echo "Interval: $INTERVAL, Limit: $LIMIT, Sort: $SORT, TimeRange: $TIMERANGE"

pm2 start "npm run continuous-crawl -- $SUBREDDIT $INTERVAL $LIMIT $SORT $TIMERANGE" --name "$PROCESS_NAME"

# Xác nhận
echo ""
echo "Crawler started and running in the background."
echo "Use 'pm2 logs $PROCESS_NAME' to view logs"
echo "Use 'pm2 stop $PROCESS_NAME' to stop the crawler"
echo "Use 'pm2 monit' to monitor all crawlers"