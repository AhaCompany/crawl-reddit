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
Object.defineProperty(exports, "__esModule", { value: true });
const postCrawler_1 = require("./api/postCrawler");
const config_1 = require("./config/config");
const fileHelper_1 = require("./utils/fileHelper");
// Create data directory if it doesn't exist
(0, fileHelper_1.ensureDirectoryExists)(config_1.config.app.outputDir);
/**
 * Main function to run the Reddit crawler
 */
function main() {
    return __awaiter(this, void 0, void 0, function* () {
        // Example usage - change these parameters as needed
        const subreddit = process.argv[2] || 'programming';
        const limit = Number(process.argv[3]) || 25;
        const sortBy = (process.argv[4] || 'hot');
        const timeRange = (process.argv[5] || 'week');
        try {
            if (!config_1.config.reddit.clientId || !config_1.config.reddit.clientSecret) {
                console.error('ERROR: Reddit API credentials not found. Please set up your .env file based on .env.example');
                return;
            }
            console.log(`Starting Reddit crawler for r/${subreddit} (${sortBy})`);
            // Crawl posts from subreddit
            yield (0, postCrawler_1.crawlSubredditPosts)(subreddit, limit, sortBy, timeRange);
            // Example of crawling comments from a post
            // To use this, uncomment and provide a post ID
            // await crawlPostComments('post_id_here');
            console.log('Crawling completed successfully!');
        }
        catch (error) {
            console.error('An error occurred:', error);
        }
    });
}
// Run the main function
main().catch(console.error);
