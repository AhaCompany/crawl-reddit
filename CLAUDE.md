# CLAUDE.md - Code Assistant Guide

## Project Commands
- Build: `npm run build`
- Lint: `npm run lint`
- Test: `npm test`
- Run single test: `npm test -- -t "test name"` 
- Start dev server: `npm run dev`

## Code Style Guidelines
- **Formatting**: Use Prettier with default configuration
- **Linting**: ESLint with recommended rules
- **Types**: TypeScript with strict mode enabled
- **Imports**: Group imports by type (React/libraries/components/utils)
- **Naming**: camelCase for variables/functions, PascalCase for components/classes
- **Error Handling**: Always use try/catch for async operations
- **Components**: Prefer functional components with hooks
- **State Management**: Use React Context for global state
- **Documentation**: JSDoc for functions, interfaces and complex logic

## Project Structure
- `/src`: Source code
- `/tests`: Test files with `.test.ts` extension
- `/public`: Static assets