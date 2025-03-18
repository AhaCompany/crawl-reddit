export interface RedditPost {
  id: string;
  title: string;
  author: string;
  selftext: string;
  url: string;
  permalink: string;
  created_utc: number;
  subreddit: string;
  score: number;
  num_comments: number;
  upvote_ratio: number;
  is_original_content: boolean;
  is_self: boolean;
  link_flair_text?: string;
  media?: any;
}
