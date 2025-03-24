import { RedditPost } from './Post';
import { RedditComment } from './Comment';

/**
 * Enum định nghĩa các loại dữ liệu Reddit
 */
export enum RedditDataType {
  POST = 'post',
  COMMENT = 'comment'
}

/**
 * Interface thống nhất để lưu trữ dữ liệu Reddit
 */
export interface RedditContent {
  id: string;              // ID duy nhất của post/comment
  url: string;             // URL của post/comment
  username: string;        // Tên người dùng (author)
  community: string;       // Tên subreddit (bao gồm 'r/' ở đầu)
  body: string;            // Nội dung bài viết/bình luận
  created_at: Date;        // Thời gian tạo
  data_type: RedditDataType; // Loại dữ liệu (post/comment)
  title?: string;          // Tiêu đề (chỉ có ở post)
  parent_id?: string;      // ID của parent (chỉ có ở comment)
}

/**
 * Chuyển đổi từ RedditPost sang RedditContent
 * @param post Đối tượng RedditPost
 * @returns Đối tượng RedditContent
 */
export function convertPostToRedditContent(post: RedditPost): RedditContent {
  return {
    id: post.id,
    url: post.permalink,
    username: post.author,
    community: `r/${post.subreddit}`,
    body: post.selftext || '',
    created_at: new Date(post.created_utc * 1000), // Chuyển đổi từ epoch seconds sang Date
    data_type: RedditDataType.POST,
    title: post.title
  };
}

/**
 * Chuyển đổi từ RedditComment sang RedditContent
 * @param comment Đối tượng RedditComment
 * @returns Đối tượng RedditContent
 */
export function convertCommentToRedditContent(comment: RedditComment): RedditContent {
  return {
    id: comment.id,
    url: comment.permalink,
    username: comment.author,
    community: `r/${comment.subreddit}`,
    body: comment.body || '',
    created_at: new Date(comment.created_utc * 1000), // Chuyển đổi từ epoch seconds sang Date
    data_type: RedditDataType.COMMENT,
    parent_id: comment.parent_id
  };
}

/**
 * Chuyển đổi RedditContent sang định dạng JSON
 * @param content Đối tượng RedditContent
 * @param byAlias Có sử dụng alias hay không
 * @returns Chuỗi JSON
 */
export function redditContentToJson(content: RedditContent, byAlias: boolean = true): string {
  // Tạo một bản sao để tránh thay đổi đối tượng gốc
  const contentCopy = JSON.parse(JSON.stringify(content));
  
  // created_at đã được chuyển thành ISO string trong quá trình stringify
  // Không cần thêm xử lý
  
  return JSON.stringify(contentCopy);
}