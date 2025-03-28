# Claude's Notes for Reddit Crawler Project

## Build Commands
- Build the project: `npm run build`
- Run the application: `npm start`
- Start development mode: `npm run dev`
- Run continuous crawling: `npm run continuous-crawl`
- Run dynamic crawling: `npm run dynamic-crawl`
- Manage config: `npm run config`
- Apply database migrations: `npm run migrate`
- Manage proxy settings: `npm run proxy`
- Manage Reddit accounts: `npm run accounts`

## Feature Status

### Account and Proxy Rotation
- Account Rotation: ✅ Implemented, ready for testing
- Proxy Rotation: ✅ Implemented, ready for testing
- Integration with Proxy: ✅ Implemented, ready for testing
- Database migrations: ✅ Implemented, ready to run

### Time-based Crawling
- Time range columns in database: ✅ Migration created, needs to be applied
- Configuration UI: ✅ Implemented in configTool
- Scheduling logic: ✅ Implemented in dynamicCrawl

## Troubleshooting Notes

### TypeScript build errors
- We fixed the TS1062 error in rotatingRedditClient.ts related to circular type references
- This was solved by:
  1. Using executeRedditRequest to handle recursive calls
  2. Adding type casting (`as unknown as T`) to break the circular reference
  3. Using `async` functions with explicit return types

### PostgreSQL
- Always remember to run migrations after schema changes: `npm run migrate`
- The crawl_configs table has been updated with start_time and end_time columns
- A new proxy_servers table has been created

## Testing Plan
1. Run migrations: `npm run migrate`
2. Add Reddit accounts: `npm run accounts`
3. Add proxy servers: `npm run proxy`
4. Configure crawling schedules: `npm run config`
5. Test account rotation: `npm run continuous-crawl`