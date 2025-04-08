/**
 * Script để import nhiều subreddit từ file JSON vào crawl_configs
 * Usage: npm run import-subreddits -- <path_to_json_file>
 */

import * as fs from 'fs';
import * as path from 'path';
import { CrawlerConfigManager } from '../utils/crawlerConfigManager';

interface SubredditConfig {
  subreddit: string;
  interval?: string;
  limit?: number;
  sortBy?: string;
  timeRange?: string;
  startTime?: string;
  endTime?: string;
  usePagination?: boolean;
  maxPages?: number;
}

async function importSubreddits() {
  try {
    // Lấy đường dẫn đến file JSON từ tham số dòng lệnh
    const args = process.argv.slice(2);
    const jsonFilePath = args[0];

    if (!jsonFilePath) {
      console.error('Missing JSON file path');
      console.log('Usage: npm run import-subreddits -- <path_to_json_file>');
      process.exit(1);
    }

    // Đảm bảo file tồn tại
    if (!fs.existsSync(jsonFilePath)) {
      console.error(`File not found: ${jsonFilePath}`);
      process.exit(1);
    }

    // Đọc và parse file JSON
    const jsonContent = fs.readFileSync(jsonFilePath, 'utf8');
    const subredditConfigs: SubredditConfig[] = JSON.parse(jsonContent);

    if (!Array.isArray(subredditConfigs)) {
      console.error('JSON file should contain an array of subreddit configs');
      process.exit(1);
    }

    // Tạo instance của crawler config manager
    const configManager = new CrawlerConfigManager();

    console.log(`Importing ${subredditConfigs.length} subreddits...`);
    console.log('='.repeat(50));

    // Xử lý từng subreddit trong file
    let successCount = 0;
    let errorCount = 0;

    for (const config of subredditConfigs) {
      try {
        // Validate and set default values if needed
        if (!config.subreddit) {
          console.error('Skipping entry with missing subreddit name');
          errorCount++;
          continue;
        }

        const interval = config.interval || '15m';
        const limit = config.limit || 50;
        const sortBy = config.sortBy || 'new';
        const timeRange = config.timeRange || 'day';
        const startTime = config.startTime || null;
        const endTime = config.endTime || null;
        const usePagination = config.usePagination || false;
        const maxPages = config.maxPages || 1;

        // Add or update config
        console.log(`Adding r/${config.subreddit}...`);
        await configManager.addOrUpdateConfig(
          config.subreddit,
          interval,
          limit,
          sortBy,
          timeRange,
          startTime,
          endTime,
          usePagination,
          maxPages
        );

        successCount++;
      } catch (error) {
        console.error(`Error adding r/${config.subreddit}:`, error);
        errorCount++;
      }
    }

    console.log('='.repeat(50));
    console.log(`Import completed: ${successCount} successful, ${errorCount} failed`);
    console.log('Run "npm run dynamic-crawl" to activate the new crawlers');

    // Close the connection
    await configManager.close();
  } catch (error) {
    console.error('Error importing subreddits:', error);
    process.exit(1);
  }
}

// Run the import
importSubreddits().catch(console.error);