#!/usr/bin/env node

/**
 * Script tạo cấu hình crawl Reddit theo giờ
 * Usage: node create-hourly-configs.js <subreddit> <start-date> <end-date> [interval] [limit]
 * 
 * Ví dụ: node create-hourly-configs.js worldnews 2025-03-01 2025-03-31 30 1000
 * - Tạo cấu hình cho subreddit worldnews
 * - Từ ngày 01/03/2025 đến ngày 31/03/2025
 * - Mỗi cấu hình chạy cách nhau 30 phút
 * - Mỗi lần lấy tối đa 1000 bài
 */

const { exec } = require('child_process');
const path = require('path');
const { Pool } = require('pg');
const format = require('pg-format');
const dotenv = require('dotenv');

// Load .env file
dotenv.config();

// Lấy tham số từ dòng lệnh
const args = process.argv.slice(2);

if (args.length < 3) {
  console.error('Thiếu tham số! Sử dụng: node create-hourly-configs.js <subreddit> <start-date> <end-date> [interval] [limit]');
  process.exit(1);
}

// Parse tham số
const SUBREDDIT = args[0];
const START_DATE = new Date(args[1]);
const END_DATE = new Date(args[2]);
// Khoảng thời gian cách nhau giữa mỗi lần chạy (phút) - mặc định 5 phút
const RUN_INTERVAL = args[3] ? parseInt(args[3]) : 5;
// Số lượng bài viết tối đa mỗi lần - mặc định 1000
const POST_LIMIT = args[4] ? parseInt(args[4]) : 1000;

// Kiểm tra tham số ngày
if (isNaN(START_DATE.getTime()) || isNaN(END_DATE.getTime())) {
  console.error('Định dạng ngày không hợp lệ! Sử dụng: YYYY-MM-DD');
  process.exit(1);
}

if (START_DATE > END_DATE) {
  console.error('Ngày bắt đầu phải trước ngày kết thúc!');
  process.exit(1);
}

// Tính số ngày và cấu hình
const ONE_DAY = 24 * 60 * 60 * 1000; // một ngày tính bằng ms
const daysDiff = Math.ceil((END_DATE - START_DATE) / ONE_DAY) + 1;
const totalConfigs = daysDiff * 24; // 24 giờ mỗi ngày

// Khởi tạo pool connection cho PostgreSQL
const pool = new Pool({
  host: process.env.PG_HOST || 'localhost',
  port: parseInt(process.env.PG_PORT || '5432'),
  database: process.env.PG_DATABASE || 'reddit_data',
  user: process.env.PG_USER || 'hungtranmanh',
  password: process.env.PG_PASSWORD || '12345',
  max: parseInt(process.env.PG_MAX_CONNECTIONS || '20')
});

console.log(`=== TẠO CẤU HÌNH CRAWL THEO GIỜ ===`);
console.log(`Subreddit: r/${SUBREDDIT}`);
console.log(`Thời gian: ${START_DATE.toISOString().split('T')[0]} đến ${END_DATE.toISOString().split('T')[0]}`);
console.log(`Tổng số cấu hình sẽ tạo: ${totalConfigs} (${daysDiff} ngày x 24 giờ)`);
console.log(`Khoảng cách giữa mỗi lần chạy: ${RUN_INTERVAL} phút`);
console.log(`Số bài tối đa mỗi lần: ${POST_LIMIT}`);
console.log(`Phương thức: BULK INSERT trực tiếp vào database (nhanh hơn nhiều)`);
console.log(`=========================================`);

// Hỏi người dùng xác nhận trước khi tiếp tục
console.log('Tiếp tục? (y/n)');
process.stdin.once('data', (data) => {
  const input = data.toString().trim().toLowerCase();
  if (input !== 'y' && input !== 'yes') {
    console.log('Đã hủy tạo cấu hình');
    process.exit(0);
  }
  
  createConfigsDirectly();
});

/**
 * Tạo cấu hình trực tiếp trong database (bulk insert)
 * Phương pháp này nhanh hơn rất nhiều so với gọi lệnh npm
 */
async function createConfigsDirectly() {
  try {
    console.log(`Bắt đầu quá trình tạo cấu hình...`);
    const startTime = Date.now();
    
    // Tạo mảng các bản ghi để insert vào database
    const configs = [];
    let configCounter = 0;
    
    // Đối với mỗi ngày từ START_DATE đến END_DATE
    for (let day = new Date(START_DATE); day <= END_DATE; day = new Date(day.getTime() + ONE_DAY)) {
      const dayFormatted = formatDate(day);
      
      // Đối với mỗi giờ trong ngày (0-23)
      for (let hour = 0; hour < 24; hour++) {
        // Tạo start_time và end_time cho khoảng 1 giờ
        const startHour = new Date(day);
        startHour.setHours(hour, 0, 0, 0);
        
        const endHour = new Date(day);
        endHour.setHours(hour, 59, 59, 999);
        
        // Tạo tên cấu hình với định dạng: subreddit-YYYYMMDD-HH
        const configName = `${SUBREDDIT}-${dayFormatted.replace(/-/g, '')}-${hour.toString().padStart(2, '0')}`;
        
        // Tính toán thời gian chạy cron (phân phối đều trong ngày)
        // Mỗi cấu hình sẽ chạy ở một phút khác nhau để tránh chồng chéo
        const configIndex = configCounter++;
        const runMinute = (configIndex * RUN_INTERVAL) % 60;
        const runHour = Math.floor((configIndex * RUN_INTERVAL) / 60) % 24;
        // Cron expression: phút giờ ngày tháng thứ
        const cronExpression = `${runMinute} */${runHour || 1} * * *`;
        
        // Tạo cron expression dựa vào loại cấu hình
        // 1. Nếu là ngày quá khứ: chạy một lần duy nhất ("@once")
        // 2. Nếu là ngày hiện tại hoặc tương lai: chạy theo lịch thông thường
        
        const currentDate = new Date();
        // Đặt giờ hiện tại về 00:00:00 để so sánh theo ngày
        currentDate.setHours(0, 0, 0, 0);
        
        // So sánh với ngày hiện tại
        const isPastConfig = startHour < currentDate;
        
        // Với cấu hình trong quá khứ: "@once" để chạy một lần
        // Với cấu hình hiện tại/tương lai: cronExpression bình thường
        const finalCron = isPastConfig ? "@once" : cronExpression;
        
        // Thêm vào danh sách configs để insert
        configs.push([
          configName,                  // subreddit
          finalCron,                   // crawl_interval - "@once" để chạy một lần với dữ liệu quá khứ
          POST_LIMIT,                  // post_limit
          'new',                       // sort_by
          'all',                       // time_range
          true,                        // is_active
          startHour,                   // start_time - PostgreSQL sẽ xử lý ngày trực tiếp
          endHour,                     // end_time - PostgreSQL sẽ xử lý ngày trực tiếp
          new Date(),                  // created_at
          new Date()                   // updated_at
        ]);
      }
    }
    
    console.log(`Đã chuẩn bị ${configs.length} cấu hình để insert`);
    
    // Chuẩn bị câu query để bulk insert
    const insertQuery = format(`
      INSERT INTO crawl_configs 
        (subreddit, crawl_interval, post_limit, sort_by, time_range, is_active, start_time, end_time, created_at, updated_at)
      VALUES %L
      ON CONFLICT (subreddit) DO UPDATE SET
        crawl_interval = EXCLUDED.crawl_interval,
        post_limit = EXCLUDED.post_limit,
        sort_by = EXCLUDED.sort_by,
        time_range = EXCLUDED.time_range,
        is_active = EXCLUDED.is_active,
        start_time = EXCLUDED.start_time,
        end_time = EXCLUDED.end_time,
        updated_at = EXCLUDED.updated_at
    `, configs);
    
    // Thực hiện bulk insert
    console.log(`Bắt đầu bulk insert vào database...`);
    const insertTime = Date.now();
    
    const BATCH_SIZE = 100; // Số lượng bản ghi mỗi lần insert
    let insertedCount = 0;
    
    // Chia nhỏ thành các batch để tránh query quá lớn
    for (let i = 0; i < configs.length; i += BATCH_SIZE) {
      const batchConfigs = configs.slice(i, i + BATCH_SIZE);
      
      const batchQuery = format(`
        INSERT INTO crawl_configs 
          (subreddit, crawl_interval, post_limit, sort_by, time_range, is_active, start_time, end_time, created_at, updated_at)
        VALUES %L
        ON CONFLICT (subreddit) DO UPDATE SET
          crawl_interval = EXCLUDED.crawl_interval,
          post_limit = EXCLUDED.post_limit,
          sort_by = EXCLUDED.sort_by,
          time_range = EXCLUDED.time_range,
          is_active = EXCLUDED.is_active,
          start_time = EXCLUDED.start_time,
          end_time = EXCLUDED.end_time,
          updated_at = EXCLUDED.updated_at
      `, batchConfigs);
      
      await pool.query(batchQuery);
      insertedCount += batchConfigs.length;
      
      // Hiển thị tiến độ
      const percentComplete = Math.round(insertedCount / configs.length * 100);
      const elapsedSec = Math.round((Date.now() - insertTime) / 1000);
      console.log(`Tiến độ: ${percentComplete}% (${insertedCount}/${configs.length}) - Thời gian insert: ${elapsedSec}s`);
    }
    
    const totalTimeSec = Math.round((Date.now() - startTime) / 1000);
    console.log(`=========================================`);
    // Đếm số lượng cấu hình one-time (@once) và cấu hình theo lịch
    const onceConfigs = configs.filter(config => config[1] === '@once').length;
    const scheduledConfigs = configs.length - onceConfigs;
    
    console.log(`Hoàn thành: Đã tạo ${insertedCount}/${configs.length} cấu hình cho r/${SUBREDDIT}`);
    console.log(`- Cấu hình chạy một lần (dữ liệu quá khứ): ${onceConfigs}`);
    console.log(`- Cấu hình chạy theo lịch (dữ liệu hiện tại/tương lai): ${scheduledConfigs}`);
    console.log(`Tổng thời gian: ${totalTimeSec} giây (${(totalTimeSec/60).toFixed(1)} phút)`);
    
    if (insertedCount > 0) {
      console.log(`\nĐể chạy các cấu hình vừa tạo, sử dụng lệnh:`);
      console.log(`npm run dynamic-crawl`);
      console.log(`\nCác cấu hình quá khứ (@once) sẽ tự động:`);
      console.log(`- Chạy một lần duy nhất khi khởi động crawler`);
      console.log(`- Tự đánh dấu đã hoàn thành khi chạy xong`);
      console.log(`\nCác cấu hình hiện tại/tương lai sẽ chạy theo lịch đã đặt\n`);
      console.log(`Để chạy liên tục với PM2:`);
      console.log(`pm2 start npm --name "reddit-hourly-crawler" -- run dynamic-crawl`);
    }
    
    // Đóng kết nối database
    await pool.end();
    console.log('Đã đóng kết nối database');
    
  } catch (error) {
    console.error(`Lỗi khi tạo cấu hình:`, error.message);
    if (error.stack) {
      console.error(`Stack trace:`, error.stack);
    }
    
    // Đảm bảo đóng pool ngay cả khi có lỗi
    try {
      if (pool) await pool.end();
    } catch (poolError) {
      console.error('Lỗi khi đóng kết nối database:', poolError.message);
    }
    
    process.exit(1);
  }
}

// Hàm hỗ trợ format ngày YYYY-MM-DD
function formatDate(date) {
  const year = date.getFullYear();
  const month = (date.getMonth() + 1).toString().padStart(2, '0');
  const day = date.getDate().toString().padStart(2, '0');
  return `${year}-${month}-${day}`;
}

// Hàm format ngày với giờ YYYY-MM-DD HH:MM:SS
function formatDateWithTime(date) {
  const dateStr = formatDate(date);
  const hours = date.getHours().toString().padStart(2, '0');
  const minutes = date.getMinutes().toString().padStart(2, '0');
  const seconds = date.getSeconds().toString().padStart(2, '0');
  return `${dateStr} ${hours}:${minutes}:${seconds}`;
}