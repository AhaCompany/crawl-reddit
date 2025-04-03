import { RedditPost } from '../models/Post';
import path from 'path';
import { saveToJson } from '../utils/fileHelper';
import { storePosts } from '../storage/storageFacade';
import { executeRedditRequest, getSubreddit } from '../utils/rotatingRedditClient';
import { config } from '../config/config';

/**
 * Crawl posts from a subreddit with pagination support
 * @param subreddit - Name of the subreddit to crawl
 * @param limit - Number of posts per page
 * @param sortBy - How to sort the posts ('hot', 'new', 'top', 'rising')
 * @param timeRange - Time range for 'top' sorting
 * @param maxPages - Maximum number of pages to crawl
 * @param startTimestamp - Optional timestamp to stop crawling when reaching older posts
 * @param endTimestamp - Optional timestamp to stop crawling when reaching newer posts
 */
export const crawlSubredditPostsWithPagination = async (
  subreddit: string,
  limit: number = 100,
  sortBy: 'hot' | 'new' | 'top' | 'rising' = 'new',
  timeRange: 'hour' | 'day' | 'week' | 'month' | 'year' | 'all' = 'all',
  maxPages: number = 10,
  startTimestamp: number | null = null,
  endTimestamp: number | null = null
): Promise<void> => {
  // Kiểm tra cấu hình storage trước khi bắt đầu
  console.log(`[Storage Config] Current storage type: ${config.app.storage}`);
  if (config.app.storage === 'json') {
    console.log('WARNING: Currently configured to store only JSON files. Posts will not be saved to database.');
    console.log('Set STORAGE_TYPE environment variable to postgresql, sqlite, postgresql_miner, both, or both_miner to enable database storage.');
  }
  try {
    console.log(`Crawling r/${subreddit} with pagination (${limit} posts per page, max ${maxPages} pages)`);
    console.log(`Sort: ${sortBy}, Time range: ${timeRange}`);
    
    if (startTimestamp) {
      console.log(`Will stop crawling when posts are older than: ${new Date(startTimestamp * 1000).toISOString()}`);
    }
    
    if (endTimestamp) {
      console.log(`Will stop crawling when posts are newer than: ${new Date(endTimestamp * 1000).toISOString()}`);
    }
    
    // Get the subreddit using rotating client
    const subredditObj = await getSubreddit(subreddit);
    
    let after: string | null = null;
    let pageCount = 0;
    let totalPostsCount = 0;
    let reachedTimeLimit = false;
    let allPosts: RedditPost[] = [];
    
    // Output directory and files
    const outputDir = path.join(config.app.outputDir, subreddit);
    const mainFilePath = path.join(outputDir, `${sortBy}_${timeRange}_paginated_${new Date().toISOString().split('T')[0]}.json`);
    
    // Crawl pages until we reach max pages or time limit
    while (pageCount < maxPages && !reachedTimeLimit) {
      pageCount++;
      console.log(`Fetching page ${pageCount}/${maxPages}${after ? ` (after: ${after})` : ''}`);
      
      // Get posts for current page
      let pagePosts: any[] = [];
      
      await executeRedditRequest(async (client) => {
        // Prepare options
        const options: any = { limit };
        if (after) {
          options.after = after;
        }
        
        // Add time option for 'top' sorting
        if (sortBy === 'top') {
          options.time = timeRange;
        }
        
        // Fetch posts based on sort type
        switch (sortBy) {
          case 'hot':
            pagePosts = await subredditObj.getHot(options);
            break;
          case 'new':
            pagePosts = await subredditObj.getNew(options);
            break;
          case 'top':
            pagePosts = await subredditObj.getTop(options);
            break;
          case 'rising':
            pagePosts = await subredditObj.getRising(options);
            break;
          default:
            pagePosts = await subredditObj.getNew(options);
        }
        
        console.log(`Fetched ${pagePosts.length} posts on page ${pageCount}`);
        return true;
      });
      
      // If no posts returned, break the loop
      if (!pagePosts || pagePosts.length === 0) {
        console.log('No more posts returned, ending pagination');
        break;
      }
      
      // Update pagination reference for next page
      if (pagePosts.length > 0) {
        const lastPost = pagePosts[pagePosts.length - 1];
        after = `t3_${lastPost.id}`; // 't3_' prefix is required for posts
      }
      
      // Process and format the posts
      const formattedPagePosts: RedditPost[] = [];
      for (const post of pagePosts) {
        // Check time limits if specified - debug info
        // Kiểm tra format thời gian - Reddit sử dụng UNIX timestamp
        // Một số posts có thể có created_utc sai định dạng
        let postDate;
        if (post.created_utc && post.created_utc > 1000000000) { // Kiểm tra timestamp hợp lệ (sau năm 2001)
          postDate = new Date(post.created_utc * 1000);
        } else {
          // Sửa timestamp nếu cần 
          console.log(`WARNING: Invalid timestamp for post ${post.id}: ${post.created_utc}`);
          postDate = new Date();
          post.created_utc = Math.floor(Date.now() / 1000);
        }
        
        // Log post time for debugging
        console.log(`Post ${post.id} time: ${postDate.toISOString()}, UTC timestamp: ${post.created_utc}`);
        
        // Check if post is too old (before start time)
        if (startTimestamp && post.created_utc < startTimestamp) {
          console.log(`Reached start time limit at post ${post.id} (${postDate.toISOString()})`);
          reachedTimeLimit = true;
          break;
        }
        
        // Check if post is too new (after end time)
        if (endTimestamp && post.created_utc > endTimestamp) {
          console.log(`Post ${post.id} is newer than end_time (${postDate.toISOString()})`);
          // Include the post anyway, don't skip
          // continue; // Commented out to include all posts
        }
        
        // Format post
        const formattedPost: RedditPost = {
          id: post.id,
          title: post.title,
          author: post.author ? (typeof post.author === 'string' ? post.author : post.author.name || '[deleted]') : '[deleted]',
          author_fullname: post.author_fullname,
          selftext: post.selftext || '',
          selftext_html: post.selftext_html || '',
          body: post.body || post.selftext || '',
          url: post.url,
          permalink: `https://www.reddit.com${post.permalink}`,
          thumbnail: post.thumbnail !== 'self' && post.thumbnail !== 'default' ? post.thumbnail : undefined,
          created_utc: post.created_utc,
          subreddit: post.subreddit ? (typeof post.subreddit === 'string' ? post.subreddit : post.subreddit.display_name) : '',
          subreddit_id: post.subreddit_id,
          subreddit_type: post.subreddit_type,
          score: post.score || 0,
          num_comments: post.num_comments || 0,
          upvote_ratio: post.upvote_ratio || 0,
          ups: post.ups,
          downs: post.downs,
          is_original_content: !!post.is_original_content,
          is_self: !!post.is_self,
          is_video: !!post.is_video,
          is_gallery: !!post.is_gallery,
          over_18: !!post.over_18,
          spoiler: !!post.spoiler,
          stickied: !!post.stickied,
          archived: !!post.archived,
          locked: !!post.locked,
          link_flair_text: post.link_flair_text,
          link_flair_css_class: post.link_flair_css_class,
          gilded: post.gilded,
          total_awards_received: post.total_awards_received,
          media: post.media,
          media_metadata: post.media_metadata,
          gallery_data: post.gallery_data,
          domain: post.domain,
          suggested_sort: post.suggested_sort,
          crosspost_parent_list: post.crosspost_parent_list
        };
        
        formattedPagePosts.push(formattedPost);
      }
      
      // Save posts from this page
      const pageFilePath = path.join(outputDir, `${sortBy}_${timeRange}_page${pageCount}_${new Date().toISOString().split('T')[0]}.json`);
      await storePosts(subreddit, formattedPagePosts, pageFilePath);
      
      // Add to all posts
      allPosts = [...allPosts, ...formattedPagePosts];
      totalPostsCount += formattedPagePosts.length;
      
      console.log(`Saved ${formattedPagePosts.length} posts from page ${pageCount}. Total so far: ${totalPostsCount}`);
      
      // Wait between pages to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      // If we reached time limit or no more posts, break the loop
      if (reachedTimeLimit || formattedPagePosts.length < limit) {
        break;
      }
    }
    
    // Save all posts to a combined file
    saveToJson(mainFilePath, allPosts);
    
    console.log(`Completed crawling ${totalPostsCount} posts from ${pageCount} pages of r/${subreddit}`);
  } catch (error) {
    console.error(`Error in paginated crawling of r/${subreddit}:`, error);
  }
};