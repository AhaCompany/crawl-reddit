export interface RedditPost {
  id: string;
  title: string;
  author: string;
  author_fullname?: string;
  // Nội dung của bài viết
  selftext: string;           // Plain text content
  selftext_html?: string;     // HTML content
  body?: string;              // Alias for selftext (some APIs use this)
  // URLs and links
  url: string;                // URL của bài viết (hoặc link bên ngoài mà bài viết đề cập)
  permalink: string;          // Permalink Reddit  
  thumbnail?: string;         // URL hình thumbnail
  // Thời gian
  created_utc: number;
  // Thông tin subreddit
  subreddit: string;
  subreddit_id?: string;
  subreddit_type?: string;
  // Stats
  score: number;
  num_comments: number;
  upvote_ratio: number;
  ups?: number;
  downs?: number;
  // Flags
  is_original_content: boolean;
  is_self: boolean;           // True nếu là self post (text post)
  is_video?: boolean;
  is_gallery?: boolean;
  over_18?: boolean;          // NSFW
  spoiler?: boolean;
  stickied?: boolean;         // Pinned
  archived?: boolean;
  locked?: boolean;
  // Flairs và awards
  link_flair_text?: string;
  link_flair_css_class?: string;
  gilded?: number;
  total_awards_received?: number;
  // Media và galleries
  media?: any;
  media_metadata?: any;
  gallery_data?: any;
  // Extras
  domain?: string;           // Domain của URL
  suggested_sort?: string;   // Comment sort suggestion
  crosspost_parent_list?: RedditPost[]; // Bài viết gốc nếu là cross-post
}
