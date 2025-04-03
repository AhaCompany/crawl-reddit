# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build & Run Commands
- Build: `npm run build`
- Run application: `npm start`
- Development mode: `npm run dev`
- Lint code: `npm run lint`
- Apply migrations: `npm run migrate`
- Continuous crawling: `npm run continuous-crawl`
- Dynamic crawling: `npm run dynamic-crawl`
- Database connection test: `npm run test-db`
- Debug mode: `npm run debug-crawl`

## Code Style Guidelines
- **Typing**: Use strict TypeScript typing (tsconfig.json has `strict: true`)
- **Error Handling**: Catch all errors with proper logging, provide fallbacks where appropriate
- **File Organization**: Split code by functionality (APIs, models, storage, utils)
- **Imports**: Group imports by external packages first, then internal modules
- **Naming**: 
  - Use camelCase for variables, functions, methods
  - Use PascalCase for classes and interfaces
  - Use descriptive names that indicate purpose
- **Comments**: Add JSDoc-style comments for functions explaining parameters and return values
- **Proxy/Account Handling**: Always use executeRedditRequest pattern to handle rate limits and rotation

## Troubleshooting Notes
- TypeScript circular references: Use `as unknown as T` casting when needed
- PostgreSQL errors: Check connection, fallback to JSON if database unavailable
- Rate limits: Proxy and account rotation are implemented to handle Reddit API limits