import axios from 'axios';
import { RedditContent, RedditDataType } from '../models/RedditContent';
import * as utils from '../storage/utils';
import * as constants from '../storage/constants';
import { PostgresMinerStorage } from '../storage/PostgresMinerStorage';
import { config } from '../config/config';
import fs from 'fs';
import path from 'path';
import { ensureDirectoryExists } from './fileHelper';

/**
 * Trực tiếp crawl comments từ một bài viết Reddit sử dụng API public
 * @param postId ID của bài viết
 * @param limit Số lượng comments tối đa
 */
export async function directCrawlComments(postId: string, limit: number = 20): Promise<void> {
  try {
    console.log(`Crawling comments for post ${postId} using direct API...`);
    
    // URL API public của Reddit để lấy bài viết và comments
    // Thêm .json và tham số để giảm thiểu các vấn đề
    const url = `https://www.reddit.com/comments/${postId}.json?raw_json=1&limit=${limit}&sort=new`;
    
    // Headers để tránh bị chặn - sử dụng User-Agent của trình duyệt phổ biến
    const headers = {
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
      'Accept': 'application/json',
      'Accept-Language': 'en-US,en;q=0.9',
      'Connection': 'keep-alive',
      'Cache-Control': 'no-cache',
      'Pragma': 'no-cache'
    };
    
    // Thêm timeout dài hơn
    const timeoutMs = 30000; // 30 giây
    
    // Gọi API với timeout dài hơn
    console.log(`Calling Reddit API: ${url}`);
    const response = await axios.get(url, { 
      headers,
      timeout: timeoutMs
    });
    
    if (!Array.isArray(response.data) || response.data.length < 2) {
      throw new Error('Invalid response format from Reddit API');
    }
    
    // Phần tử đầu tiên là thông tin bài viết
    const postData = response.data[0].data.children[0].data;
    
    // Phần tử thứ hai là các comments
    const commentsData = response.data[1].data.children;
    
    // Mảng lưu trữ các comments đã xử lý
    const processedComments: RedditContent[] = [];
    
    // Hàm đệ quy để xử lý comments
    function processComment(comment: any, depth: number = 0): void {
      // Bỏ qua các "more" comments
      if (comment.kind === 't1') {
        const data = comment.data;
        
        // Tạo RedditContent từ comment
        const commentContent: RedditContent = {
          id: data.id,
          url: `https://www.reddit.com${data.permalink}`,
          username: data.author || '[deleted]',
          community: `r/${data.subreddit}`,
          body: data.body || '',
          created_at: new Date(data.created_utc * 1000),
          data_type: RedditDataType.COMMENT,
          parent_id: data.parent_id
        };
        
        // Thêm vào mảng
        processedComments.push(commentContent);
        
        // Xử lý các replies nếu có
        if (data.replies && data.replies.data && data.replies.data.children) {
          for (const reply of data.replies.data.children) {
            processComment(reply, depth + 1);
          }
        }
      }
    }
    
    // Xử lý tất cả comments ở level cao nhất
    for (const comment of commentsData) {
      processComment(comment);
    }
    
    console.log(`Processed ${processedComments.length} comments for post ${postId}`);
    
    // Lưu vào file JSON
    const outputDir = path.join(config.app.outputDir, 'comments');
    ensureDirectoryExists(outputDir);
    const filePath = path.join(outputDir, `${postId}_${new Date().toISOString().split('T')[0]}.json`);
    fs.writeFileSync(filePath, JSON.stringify(processedComments, null, 2));
    console.log(`Comments saved to ${filePath}`);
    
    // Lưu vào PostgreSQL với MinerStorage schema nếu được cấu hình
    if (['postgresql_miner', 'both_miner'].includes(config.app.storage)) {
      const postgresStorage = new PostgresMinerStorage();
      await postgresStorage.initialize();
      
      const savedCount = await postgresStorage.storeBatch(processedComments);
      console.log(`Stored ${savedCount}/${processedComments.length} comments to PostgreSQL database with MinerStorage schema`);
      
      await postgresStorage.close();
    }
    
    console.log(`Direct comment crawling for post ${postId} completed successfully`);
  } catch (error) {
    console.error(`Error directly crawling comments for post ${postId}:`, error);
  }
}