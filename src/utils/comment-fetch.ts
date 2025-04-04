/**
 * Công cụ sử dụng xoay vòng tài khoản để lấy comments từ Reddit
 * Sử dụng cơ chế xoay vòng tài khoản để tránh rate limit
 */
import fs from 'fs';
import path from 'path';
import axios from 'axios';
import { config } from '../config/config';
import { ensureDirectoryExists } from './fileHelper';
import { executeRedditRequest, getSubmission } from './rotatingRedditClient';
import { RedditContent, RedditDataType } from '../models/RedditContent';

/**
 * Interface cho comment đã xử lý
 */
interface ProcessedComment {
  id: string;
  url: string;
  username: string;
  community: string;
  body: string;
  createdAt: string;
  dataType: string;
  parentId: string;
}

/**
 * Lấy comments từ một bài viết sử dụng cơ chế xoay vòng tài khoản
 * @param postId ID của bài viết
 * @param limit Số lượng comments tối đa
 * @returns Mảng các comments đã xử lý
 */
export async function fetchCommentsWithRotation(postId: string, limit: number = 50): Promise<ProcessedComment[]> {
  console.log(`Fetching comments for post ${postId} using account rotation...`);
  
  try {
    // Cách 1: Sử dụng Snoowrap API qua executeRedditRequest
    // Phương pháp này sẽ dùng tài khoản Reddit API chính thức
    return await fetchCommentsViaSnoowrap(postId, limit);
  } catch (error) {
    console.warn(`Error fetching via Snoowrap, falling back to public API: ${error}`);
    
    // Cách 2: Sử dụng public API qua executeRedditRequest
    // Phương pháp này vẫn sử dụng xoay vòng tài khoản nhưng qua API public
    return await fetchCommentsViaPublicAPI(postId, limit);
  }
}

/**
 * Lấy comments qua Snoowrap API sử dụng xoay vòng tài khoản
 */
async function fetchCommentsViaSnoowrap(postId: string, limit: number): Promise<ProcessedComment[]> {
  console.log(`Fetching comments via Snoowrap API for post ${postId}...`);
  
  // Lấy submission qua getSubmission helper (đã có xoay vòng tài khoản)
  const submission = await getSubmission(postId);
  
  // Sử dụng executeRedditRequest để tự động xoay vòng tài khoản
  return await executeRedditRequest<ProcessedComment[]>(async (client) => {
    // Lấy comments
    const commentsListing = await submission.comments;
    const comments = await commentsListing.fetchAll({ amount: limit });
    
    console.log(`Fetched ${Array.isArray(comments) ? comments.length : 0} comments via Snoowrap`);
    
    // Đảm bảo comments có dữ liệu
    if (!comments || !Array.isArray(comments) || comments.length === 0) {
      console.warn(`No comments found via Snoowrap for post ${postId}`);
      return [];
    }
    
    // Xử lý comments recursively
    const processedComments: ProcessedComment[] = [];
    
    const processComment = (comment: any, depth: number = 0): void => {
      if (!comment || typeof comment !== 'object') return;
      
      // Skip deleted comments và more comments
      if (!comment.id || !comment.body) return;
      
      const processedComment: ProcessedComment = {
        id: comment.id,
        url: `https://www.reddit.com${comment.permalink}`,
        username: comment.author?.name || '[deleted]',
        community: `r/${comment.subreddit?.display_name || ''}`,
        body: comment.body || '',
        createdAt: new Date(comment.created_utc * 1000).toISOString(),
        dataType: 'comment',
        parentId: comment.parent_id || ''
      };
      
      processedComments.push(processedComment);
      
      // Process replies recursively
      if (comment.replies && Array.isArray(comment.replies)) {
        for (const reply of comment.replies) {
          processComment(reply, depth + 1);
        }
      }
    };
    
    // Process all comments
    for (const comment of comments) {
      processComment(comment);
    }
    
    console.log(`Processed ${processedComments.length} comments via Snoowrap`);
    return processedComments;
  });
}

/**
 * Lấy comments qua public API nhưng vẫn sử dụng xoay vòng tài khoản
 * @param postId ID của bài viết
 * @param limit Số lượng comments tối đa
 */
async function fetchCommentsViaPublicAPI(postId: string, limit: number): Promise<ProcessedComment[]> {
  console.log(`Fetching comments via public API for post ${postId}...`);
  
  return await executeRedditRequest<ProcessedComment[]>(async () => {
    // URL Reddit JSON API
    const url = `https://www.reddit.com/comments/${postId}.json?raw_json=1&limit=${limit}`;
    
    console.log(`Calling ${url} with rotated account/proxy`);
    
    // Sử dụng axios thay vì https.get
    const response = await axios.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
        'Accept': 'application/json',
        'Accept-Language': 'en-US,en;q=0.9'
      },
      timeout: 60000 // 60 seconds
    });
    
    const data = response.data;
    
    if (!Array.isArray(data) || data.length < 2) {
      throw new Error('Invalid response format');
    }
    
    // Thông tin bài viết (không cần sử dụng)
    // const postInfo = data[0].data.children[0].data;
    
    // Comments
    const commentsData = data[1].data.children;
    const processedComments: ProcessedComment[] = [];
    
    // Hàm đệ quy xử lý comments
    function processComment(comment: any, depth: number = 0): void {
      if (comment.kind === 't1') {
        const commentData = comment.data;
        
        // Tạo đối tượng comment
        const processedComment: ProcessedComment = {
          id: commentData.id,
          url: `https://www.reddit.com${commentData.permalink}`,
          username: commentData.author || '[deleted]',
          community: `r/${commentData.subreddit}`,
          body: commentData.body || '',
          createdAt: new Date(commentData.created_utc * 1000).toISOString(),
          dataType: 'comment',
          parentId: commentData.parent_id
        };
        
        // Thêm vào mảng
        processedComments.push(processedComment);
        
        // Xử lý các replies nếu có
        if (commentData.replies && commentData.replies.data && commentData.replies.data.children) {
          for (const reply of commentData.replies.data.children) {
            processComment(reply, depth + 1);
          }
        }
      }
    }
    
    // Xử lý tất cả comments ở level cao nhất
    for (const comment of commentsData) {
      processComment(comment);
    }
    
    console.log(`Processed ${processedComments.length} comments via public API`);
    return processedComments;
  });
}

/**
 * Lấy comments và lưu vào file
 * @param postId ID của bài viết
 * @param limit Số lượng comments tối đa
 */
export async function fetchAndSaveComments(postId: string, limit: number = 50): Promise<string> {
  try {
    // Lấy comments với xoay vòng tài khoản
    const processedComments = await fetchCommentsWithRotation(postId, limit);
    
    console.log(`Successfully fetched ${processedComments.length} comments for post ${postId}`);
    
    // Chuyển đổi sang RedditContent để phù hợp với cấu trúc lưu trữ
    const redditContents: RedditContent[] = processedComments.map(comment => ({
      id: comment.id,
      url: comment.url,
      username: comment.username,
      community: comment.community,
      body: comment.body,
      created_at: new Date(comment.createdAt),
      data_type: RedditDataType.COMMENT,
      parent_id: comment.parentId
    }));
    
    // Lưu vào file JSON
    const outputDir = path.join(config.app.outputDir, 'comments');
    ensureDirectoryExists(outputDir);
    
    const filePath = path.join(outputDir, `${postId}_${new Date().toISOString().split('T')[0]}.json`);
    fs.writeFileSync(filePath, JSON.stringify(redditContents, null, 2));
    console.log(`Comments saved to ${filePath}`);
    
    return filePath;
  } catch (error) {
    console.error(`Error fetching and saving comments for post ${postId}:`, error);
    throw error;
  }
}

/**
 * Hàm chạy từ command line
 */
if (require.main === module) {
  // Lấy post ID từ tham số dòng lệnh
  const postId = process.argv[2];
  
  if (!postId) {
    console.error('Post ID is required. Usage: ts-node comment-fetch.ts <post_id>');
    process.exit(1);
  }
  
  // Thực hiện lấy và xử lý comments
  fetchAndSaveComments(postId)
    .then((filePath) => {
      console.log(`Successfully saved comments for post ${postId} to ${filePath}`);
    })
    .catch((error) => {
      console.error(`Failed to fetch comments for post ${postId}:`, error);
      process.exit(1);
    });
}