/**
 * Trực tiếp crawl comments từ một bài viết Reddit sử dụng cơ chế xoay vòng tài khoản
 */
import axios from 'axios';
import { RedditContent, RedditDataType } from '../models/RedditContent';
import * as utils from '../storage/utils';
import * as constants from '../storage/constants';
import { PostgresMinerStorage } from '../storage/PostgresMinerStorage';
import { config } from '../config/config';
import fs from 'fs';
import path from 'path';
import { ensureDirectoryExists } from './fileHelper';
import { executeRedditRequest, getSubmission } from './rotatingRedditClient';

/**
 * Trực tiếp crawl comments từ một bài viết Reddit sử dụng cơ chế xoay vòng tài khoản
 * @param postId ID của bài viết
 * @param limit Số lượng comments tối đa
 */
export async function directCrawlComments(postId: string, limit: number = 20): Promise<void> {
  try {
    console.log(`Crawling comments for post ${postId} using rotating accounts...`);
    
    // Mảng lưu trữ các comments đã xử lý
    const processedComments: RedditContent[] = [];
    
    // Thử phương pháp 1: Sử dụng Snoowrap API qua executeRedditRequest
    try {
      await crawlCommentsWithSnoowrap(postId, limit, processedComments);
    } catch (error) {
      console.warn(`Failed to crawl comments via Snoowrap: ${error}`);
      console.log(`Falling back to public API method with rotating accounts...`);
      // Nếu phương pháp Snoowrap thất bại, thử phương pháp 2
      await crawlCommentsWithPublicAPI(postId, limit, processedComments);
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

/**
 * Crawl comments sử dụng Snoowrap API và cơ chế xoay vòng tài khoản
 */
async function crawlCommentsWithSnoowrap(
  postId: string, 
  limit: number, 
  processedComments: RedditContent[]
): Promise<void> {
  console.log(`Crawling comments for post ${postId} using Snoowrap API...`);
  
  // Get the submission using rotating client
  const submission = await getSubmission(postId);
  
  // Sử dụng executeRedditRequest để tự động xoay vòng tài khoản
  await executeRedditRequest(async (client) => {
    // Get comments listing
    const commentsListing = await submission.comments;
    // Fetch all comments
    const comments = await commentsListing.fetchAll({ amount: limit });
    
    // Đảm bảo comments có dữ liệu
    if (!comments || !Array.isArray(comments) || comments.length === 0) {
      console.warn(`No comments found via Snoowrap for post ${postId}`);
      return true;
    }
    
    console.log(`Fetched ${comments.length} comments via Snoowrap API`);
    
    // Recursive function to process comments
    const processComment = (comment: any, depth: number = 0): void => {
      // Skip if undefined or not an object
      if (!comment || typeof comment !== 'object') return;
      // Skip if no id or body (likely deleted)
      if (!comment.id || !comment.body) return;
      
      // Create RedditContent from comment
      const commentContent: RedditContent = {
        id: comment.id,
        url: `https://www.reddit.com${comment.permalink}`,
        username: comment.author?.name || '[deleted]',
        community: `r/${comment.subreddit?.display_name || ''}`,
        body: comment.body || '',
        created_at: new Date(comment.created_utc * 1000),
        data_type: RedditDataType.COMMENT,
        parent_id: comment.parent_id || ''
      };
      
      // Add to array
      processedComments.push(commentContent);
      
      // Process replies
      if (comment.replies && Array.isArray(comment.replies)) {
        for (const reply of comment.replies) {
          processComment(reply, depth + 1);
        }
      }
    };
    
    // Process all top-level comments
    for (const comment of comments) {
      processComment(comment);
    }
    
    console.log(`Processed ${processedComments.length} comments via Snoowrap API`);
    return true;
  });
}

/**
 * Crawl comments sử dụng public API và cơ chế xoay vòng tài khoản
 */
async function crawlCommentsWithPublicAPI(
  postId: string, 
  limit: number, 
  processedComments: RedditContent[]
): Promise<void> {
  console.log(`Crawling comments for post ${postId} using public API with rotating accounts...`);
  
  // Sử dụng executeRedditRequest để tự động xử lý xoay vòng tài khoản và proxy
  await executeRedditRequest(async () => {
    // URL API public của Reddit để lấy bài viết và comments
    const url = `https://www.reddit.com/comments/${postId}.json?raw_json=1&limit=${limit}&sort=new`;
    
    console.log(`Calling Reddit API with rotating account: ${url}`);
    
    // Sử dụng axios thay vì https.get
    const response = await axios.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
        'Accept': 'application/json',
        'Accept-Language': 'en-US,en;q=0.9',
        'Connection': 'keep-alive',
        'Cache-Control': 'no-cache',
        'Pragma': 'no-cache'
      },
      timeout: 30000 // 30 seconds
    });
    
    if (!Array.isArray(response.data) || response.data.length < 2) {
      throw new Error('Invalid response format from Reddit API');
    }
    
    // Phần tử đầu tiên là thông tin bài viết
    // const postData = response.data[0].data.children[0].data;
    
    // Phần tử thứ hai là các comments
    const commentsData = response.data[1].data.children;
    
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
    
    console.log(`Processed ${processedComments.length} comments for post ${postId} via public API`);
    return true;
  });
}