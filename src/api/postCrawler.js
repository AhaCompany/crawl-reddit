"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.crawlPostComments = exports.crawlSubredditPosts = void 0;
const redditClient_1 = require("./redditClient");
const config_1 = require("../config/config");
const fileHelper_1 = require("../utils/fileHelper");
const path_1 = __importDefault(require("path"));
/**
 * Crawl posts from a subreddit and save them to JSON
 * @param subreddit Name of the subreddit to crawl
 * @param limit Number of posts to crawl
 * @param sortBy How to sort the posts ('hot', 'new', 'top', 'rising')
 * @param timeRange Time range for 'top' sorting ('hour', 'day', 'week', 'month', 'year', 'all')
 */
const crawlSubredditPosts = (subreddit_1, ...args_1) => __awaiter(void 0, [subreddit_1, ...args_1], void 0, function* (subreddit, limit = 25, sortBy = 'hot', timeRange = 'all') {
    try {
        console.log(`Crawling ${limit} ${sortBy} posts from r/${subreddit}...`);
        // Get the subreddit
        const subredditObj = redditClient_1.redditClient.getSubreddit(subreddit);
        // Get posts based on sort type - snoowrap API expects 'limit' parameter
        let posts;
        const options = { limit };
        const topOptions = { time: timeRange, limit };
        switch (sortBy) {
            case 'hot':
                posts = yield subredditObj.getHot(options);
                break;
            case 'new':
                posts = yield subredditObj.getNew(options);
                break;
            case 'top':
                posts = yield subredditObj.getTop(topOptions);
                break;
            case 'rising':
                posts = yield subredditObj.getRising(options);
                break;
            default:
                posts = yield subredditObj.getHot(options);
        }
        // Map to our post model
        const formattedPosts = posts.map((post) => ({
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
        const outputDir = path_1.default.join(config_1.config.app.outputDir, subreddit);
        const filePath = path_1.default.join(outputDir, `${sortBy}_${timeRange}_${new Date().toISOString().split('T')[0]}.json`);
        (0, fileHelper_1.saveToJson)(filePath, formattedPosts);
        console.log(`Crawled ${formattedPosts.length} posts from r/${subreddit}`);
    }
    catch (error) {
        console.error(`Error crawling posts from r/${subreddit}:`, error);
    }
});
exports.crawlSubredditPosts = crawlSubredditPosts;
/**
 * Crawl comments from a specific post
 * @param postId Reddit post ID
 * @param limit Number of comments to fetch
 */
const crawlPostComments = (postId_1, ...args_1) => __awaiter(void 0, [postId_1, ...args_1], void 0, function* (postId, limit = 100) {
    try {
        console.log(`Crawling comments for post ${postId}...`);
        // Get the submission and comments separately to avoid reference issues
        const submission = redditClient_1.redditClient.getSubmission(postId);
        // Get comments - snoowrap API expects 'amount' not 'limit'
        // We also need to avoid chaining fetch() to prevent the type reference issue
        const commentsListing = yield submission.comments;
        const comments = yield commentsListing.fetchAll({ amount: limit });
        // Format comments recursively
        const formatComment = (comment, depth = 0) => {
            var _a;
            // Handle potential undefined or null properties safely
            const formattedComment = {
                id: comment.id || '',
                author: comment.author ? (comment.author.name || '[deleted]') : '[deleted]',
                body: comment.body || '',
                permalink: comment.permalink ? `https://www.reddit.com${comment.permalink}` : '',
                created_utc: comment.created_utc || 0,
                score: comment.score || 0,
                subreddit: ((_a = comment.subreddit) === null || _a === void 0 ? void 0 : _a.display_name) || '',
                is_submitter: !!comment.is_submitter,
                parent_id: comment.parent_id || '',
                depth,
                replies: []
            };
            // Process replies recursively with additional safety checks
            if (comment.replies && Array.isArray(comment.replies) && comment.replies.length > 0) {
                formattedComment.replies = comment.replies
                    .filter((reply) => reply && typeof reply === 'object')
                    .map((reply) => formatComment(reply, depth + 1));
            }
            return formattedComment;
        };
        // Format all top-level comments
        const formattedComments = comments.map((comment) => formatComment(comment));
        // Save to JSON
        const outputDir = path_1.default.join(config_1.config.app.outputDir, 'comments');
        const filePath = path_1.default.join(outputDir, `${postId}_${new Date().toISOString().split('T')[0]}.json`);
        (0, fileHelper_1.saveToJson)(filePath, formattedComments);
        console.log(`Crawled ${formattedComments.length} comments for post ${postId}`);
    }
    catch (error) {
        console.error(`Error crawling comments for post ${postId}:`, error);
    }
});
exports.crawlPostComments = crawlPostComments;
