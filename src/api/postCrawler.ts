import { redditClient } from './redditClient';
import { config } from '../config/config';
import { RedditPost } from '../models/Post';
import { RedditComment } from '../models/Comment';
import { saveToJson } from '../utils/fileHelper';
import path from 'path';

/**
 * Crawl posts from a subreddit and save them to JSON
 * @param subreddit Name of the subreddit to crawl
 * @param limit Number of posts to crawl
 * @param sortBy How to sort the posts ('hot', 'new', 'top', 'rising')
 * @param timeRange Time range for 'top' sorting ('hour', 'day', 'week', 'month', 'year', 'all')
 */
export const crawlSubredditPosts = async (
  subreddit: string,
  limit: number = 25,
  sortBy: 'hot' | 'new' | 'top' | 'rising' = 'hot',
  timeRange: 'hour' | 'day' | 'week' | 'month' | 'year' | 'all' = 'all'
): Promise<void> => {
  try {
    console.log(`Crawling ${limit} ${sortBy} posts from r/${subreddit}...`);
    
    // Get the subreddit
    const subredditObj = redditClient.getSubreddit(subreddit);
    
    // Get posts based on sort type - snoowrap API expects 'limit' parameter
    let posts;
    const options = { limit };
    const topOptions = { time: timeRange, limit };
    
    switch (sortBy) {
      case 'hot':
        posts = await subredditObj.getHot(options);
        break;
      case 'new':
        posts = await subredditObj.getNew(options);
        break;
      case 'top':
        posts = await subredditObj.getTop(topOptions);
        break;
      case 'rising':
        posts = await subredditObj.getRising(options);
        break;
      default:
        posts = await subredditObj.getHot(options);
    }
    
    // Map to our post model
    const formattedPosts: RedditPost[] = posts.map((post: any) => ({
      id: post.id,
      title: post.title,
      author: post.author.name,
      selftext: post.selftext,
      url: post.url,
      permalink: `https://www.reddit.com${post.permalink}`,
      created_utc: post.created_utc,
      subreddit: post.subreddit.display_name,
      score: post.score,
      num_comments: post.num_comments,
      upvote_ratio: post.upvote_ratio,
      is_original_content: post.is_original_content,
      is_self: post.is_self,
      link_flair_text: post.link_flair_text,
      media: post.media
    }));
    
    // Save to JSON
    const outputDir = path.join(config.app.outputDir, subreddit);
    const filePath = path.join(outputDir, `${sortBy}_${timeRange}_${new Date().toISOString().split('T')[0]}.json`);
    saveToJson(filePath, formattedPosts);
    
    console.log(`Crawled ${formattedPosts.length} posts from r/${subreddit}`);
  } catch (error) {
    console.error(`Error crawling posts from r/${subreddit}:`, error);
  }
};

/**
 * Crawl comments from a specific post
 * @param postId Reddit post ID
 * @param limit Number of comments to fetch
 */
export const crawlPostComments = async (
  postId: string,
  limit: number = 100
): Promise<void> => {
  try {
    console.log(`Crawling comments for post ${postId}...`);
    
    // Get the submission and comments separately to avoid reference issues
    const submission = redditClient.getSubmission(postId);
    
    // Get comments - snoowrap API expects 'amount' not 'limit'
    // We also need to avoid chaining fetch() to prevent the type reference issue
    const commentsListing = await submission.comments;
    const comments = await commentsListing.fetchAll({ amount: limit });
    
    // Format comments recursively
    const formatComment = (comment: any, depth: number = 0): RedditComment => {
      // Handle potential undefined or null properties safely
      const formattedComment: RedditComment = {
        id: comment.id || '',
        author: comment.author ? (comment.author.name || '[deleted]') : '[deleted]',
        body: comment.body || '',
        permalink: comment.permalink ? `https://www.reddit.com${comment.permalink}` : '',
        created_utc: comment.created_utc || 0,
        score: comment.score || 0,
        subreddit: comment.subreddit?.display_name || '',
        is_submitter: !!comment.is_submitter,
        parent_id: comment.parent_id || '',
        depth,
        replies: []
      };
      
      // Process replies recursively with additional safety checks
      if (comment.replies && Array.isArray(comment.replies) && comment.replies.length > 0) {
        formattedComment.replies = comment.replies
          .filter((reply: any) => reply && typeof reply === 'object')
          .map((reply: any) => formatComment(reply, depth + 1));
      }
      
      return formattedComment;
    };
    
    // Format all top-level comments
    const formattedComments = comments.map((comment: any) => formatComment(comment));
    
    // Save to JSON
    const outputDir = path.join(config.app.outputDir, 'comments');
    const filePath = path.join(outputDir, `${postId}_${new Date().toISOString().split('T')[0]}.json`);
    saveToJson(filePath, formattedComments);
    
    console.log(`Crawled ${formattedComments.length} comments for post ${postId}`);
  } catch (error) {
    console.error(`Error crawling comments for post ${postId}:`, error);
  }
};