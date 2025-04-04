/**
 * Crawler hiệu quả - tránh yêu cầu lại bài đã crawl
 */
import { Pool } from 'pg';
import { config } from '../config/config';
import { getSubreddit, executeRedditRequest } from '../utils/rotatingRedditClient';
import { storePosts } from '../storage/storageFacade';
import * as path from 'path';
import { saveToJson } from './fileHelper';
import { RedditPost } from '../models/Post';
import { crawlAndTrackMultiplePosts } from './immediateCommentTracker';

// Pool connection cho PostgreSQL
const pool = new Pool({
  host: config.postgresql.host,
  port: config.postgresql.port,
  database: config.postgresql.database,
  user: config.postgresql.user,
  password: config.postgresql.password,
});

/**
 * Lấy danh sách ID bài viết đã có trong database
 */
async function getExistingPostIds(subreddit: string, limit: number): Promise<Set<string>> {
  try {
    // Lấy ID của các bài đã lưu trong vòng 24 giờ
    const result = await pool.query(`
      SELECT uri FROM dataentity
      WHERE label = $1
      AND uri LIKE '%/comments/%'
      AND datetime > NOW() - INTERVAL '24 hours'
      ORDER BY datetime DESC
      LIMIT $2
    `, [subreddit, limit * 2]); // Lấy nhiều hơn để có khả năng bao phủ tốt hơn
    
    // Tách ID bài viết từ URI
    const existingIds = new Set<string>();
    for (const row of result.rows) {
      // URI dạng: https://www.reddit.com/r/bitcoin/comments/POST_ID/post_title
      const match = row.uri.match(/\/comments\/([^\/]+)/);
      if (match && match[1]) {
        existingIds.add(match[1]);
      }
    }
    
    console.log(`Found ${existingIds.size} existing posts for r/${subreddit}`);
    return existingIds;
  } catch (error) {
    console.error(`Error getting existing post IDs for r/${subreddit}:`, error);
    return new Set<string>();
  }
}

/**
 * Crawl bài viết từ subreddit hiệu quả
 */
export async function efficientCrawlSubreddit(
  subreddit: string,
  limit: number = 100,
  sortBy: 'hot' | 'new' | 'top' | 'rising' = 'new',
  timeRange: 'hour' | 'day' | 'week' | 'month' | 'year' | 'all' = 'hour'
): Promise<void> {
  try {
    console.log(`Efficiently crawling ${limit} ${sortBy} posts from r/${subreddit}...`);
    
    // 1. Lấy danh sách bài đã có
    const existingPostIds = await getExistingPostIds(subreddit, limit);
    
    // 2. Lấy subreddit
    const subredditObj = await getSubreddit(subreddit);
    
    // 3. Lấy posts từ Reddit
    let allPosts: any[] = [];
    
    await executeRedditRequest(async (client) => {
      const options = { limit };
      const topOptions = { time: timeRange, limit };
      
      switch (sortBy) {
        case 'hot':
          allPosts = await subredditObj.getHot(options);
          break;
        case 'new':
          allPosts = await subredditObj.getNew(options);
          break;
        case 'top':
          allPosts = await subredditObj.getTop(topOptions);
          break;
        case 'rising':
          allPosts = await subredditObj.getRising(options);
          break;
        default:
          allPosts = await subredditObj.getNew(options);
      }
      
      console.log(`Fetched ${allPosts.length} posts from Reddit`);
      return true;
    });
    
    // 4. Lọc bỏ bài đã có
    const newPosts = allPosts.filter(post => !existingPostIds.has(post.id));
    console.log(`Found ${newPosts.length} new posts to save (${allPosts.length - newPosts.length} already exist)`);
    
    // 5. Format bài mới
    const formattedPosts: RedditPost[] = newPosts.map((post: any) => {
      return {
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
    });
    
    // 6. Lưu bài mới (nếu có)
    if (formattedPosts.length > 0) {
      const outputDir = path.join(config.app.outputDir, subreddit);
      const filePath = path.join(outputDir, `${sortBy}_${timeRange}_${new Date().toISOString().split('T')[0]}.json`);
      await storePosts(subreddit, formattedPosts, filePath);
      console.log(`Saved ${formattedPosts.length} new posts from r/${subreddit}`);
      
      // 7. Track comments cho bài mới
      await crawlAndTrackMultiplePosts(formattedPosts, 7);
      console.log(`Added ${formattedPosts.length} new posts to comment tracking`);
    } else {
      console.log(`No new posts to save for r/${subreddit}`);
    }
  } catch (error) {
    console.error(`Error efficiently crawling r/${subreddit}:`, error);
  }
}

/**
 * Đóng kết nối để giải phóng tài nguyên
 */
export async function closeEfficientCrawler(): Promise<void> {
  await pool.end();
}