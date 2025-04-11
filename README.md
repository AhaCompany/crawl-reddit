# Reddit Data Crawler

A comprehensive tool for crawling Reddit data, including posts and comments from multiple subreddits, with support for various API sources.

## Features

- Crawl Reddit posts and comments from multiple sources
- Support for direct Reddit API with account and proxy rotation
- Support for PushShift API (when available)
- Support for PullPush.io API as an alternative for historical data
- Batch processing for multiple subreddits
- State persistence for interrupted crawls
- Configurable time ranges and pagination
- Proper error handling and retries

## API Sources

This tool can use multiple data sources:

1. **Direct Reddit API**
   - Most reliable for recent data and comments
   - Requires authentication
   - Has rate limits (requires account rotation)
   - Limited to ~1000 posts per subreddit

2. **Pushshift API**
   - Good for historical data when working
   - No authentication required
   - Has been unreliable recently (403, 404 errors)
   - Multiple endpoints available

3. **PullPush.io API**
   - Alternative for historical data
   - No authentication required
   - 100 posts per request limit
   - Both posts and comments available

## Installation

```bash
# Clone the repository
git clone https://github.com/yourusername/crawl-reddit.git
cd crawl-reddit

# Install dependencies
npm install

# Build the project
npm run build
```

## Configuration

1. **Reddit Accounts** (required for Direct Reddit API)
   - Create a `reddit_accounts.json` file based on `reddit_accounts_sample.json`
   - Add your Reddit API credentials

2. **Proxies** (optional but recommended)
   - Create a `proxies.json` file based on `proxies.json.example`
   - Add your proxy server configurations

## Usage

### Direct Reddit API Crawling

For recent data with comments:

```bash
# Crawl a single subreddit
npm run direct-crawl

# Crawl multiple subreddits in batches
npm run direct-batch
```

Environment variables:
- `SUBREDDIT`: Target subreddit name
- `CRAWL_COMMENTS`: Set to "true" to fetch comments for each post

### PushShift Crawling (when available)

For historical data:

```bash
# Crawl historical data 
npm run historical-crawl
```

### PullPush.io Crawling

For historical data when Pushshift is unavailable:

```bash
# Test with a single subreddit
npm run pullpush-test

# Crawl multiple subreddits in batches
npm run pullpush-batch
```

Environment variables:
- `CRAWL_COMMENTS`: Set to "true" to fetch comments for each post

## Basic Usage (Original)

### Crawl posts from a subreddit (one-time)

```bash
npm start -- programming 25 hot week true
```

Parameters:
1. Subreddit name (default: programming)
2. Number of posts to crawl (default: 25)
3. Sort method: hot, new, top, rising (default: hot)
4. Time range (for top): hour, day, week, month, year, all (default: week)
5. Verbose mode (true/false): If true (default), detailed post information will be retrieved

### Continuous Crawling

To crawl a subreddit continuously in real-time:

```bash
npm run continuous-crawl -- <subreddit> <interval> [limit] [sort] [timeRange]
```

Parameters:
1. `<subreddit>`: Subreddit name (required)
2. `<interval>`: Time between crawls (e.g., 30s, 5m, 1h)
3. `[limit]`: Maximum posts per crawl (default: 100)
4. `[sort]`: Sort method (default: new)
5. `[timeRange]`: Time range for 'top' (default: day)

### Crawl comments from a post

```bash
npm start -- comments <post_id> <limit>
```

## Documentation

Detailed documentation is available in the docs directory:

- [Direct Reddit API Guide](./DIRECT_REDDIT_GUIDE.md)
- [Pushshift API Guide](./PUSHSHIFT_API_GUIDE.md)
- [PullPush API Guide](./PULLPUSH_GUIDE.md)

## Data Storage

The application supports multiple storage options:

1. **JSON files** (default)
   - Data is stored in JSON files in the `data/` directory

2. **PostgreSQL**
   - Update `.env` with your PostgreSQL connection details:
   ```
   STORAGE_TYPE=postgresql
   PG_HOST=localhost
   PG_PORT=5432
   PG_DATABASE=reddit_data
   PG_USER=postgres
   PG_PASSWORD=your_password
   ```

3. **SQLite**
   - Update `.env`:
   ```
   STORAGE_TYPE=sqlite
   SQLITE_DB_PATH=data/reddit_miner.db
   ```

4. **Parallel Storage**
   - Store in multiple systems simultaneously:
   ```
   # Store in both JSON and SQLite
   STORAGE_TYPE=both
   
   # Store in both JSON and PostgreSQL with MinerStorage schema
   STORAGE_TYPE=both_miner
   ```

## Best Practices

1. **Rate Limiting**
   - Always respect API rate limits
   - Use account rotation for Reddit API
   - Add delays between requests for other APIs

2. **Error Handling**
   - All scripts include retry mechanisms
   - State persistence allows resuming interrupted crawls

3. **Data Storage**
   - Data is stored in JSON format
   - Organized by subreddit and post ID

## Troubleshooting

If you encounter issues:

- **403 Forbidden from Pushshift API**
  - Try using PullPush.io API instead
  - Check if the IP is being rate limited

- **Reddit API Rate Limits**
  - Add more Reddit accounts to `reddit_accounts.json`
  - Increase delay between requests

- **Missing Data**
  - Try alternative API sources
  - Adjust date ranges to be smaller