export interface RedditComment {
  id: string;
  author: string;
  body: string;
  permalink: string;
  created_utc: number;
  score: number;
  subreddit: string;
  is_submitter: boolean;
  parent_id: string;
  depth: number;
  replies?: RedditComment[];
}
