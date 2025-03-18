import Snoowrap from 'snoowrap';
import { config } from '../config/config';

// Set secure TLS options
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '1';

// For debugging
console.log('Using Reddit API configuration:', {
  clientId: config.reddit.clientId ? 'Set' : 'Not set',
  userAgent: config.reddit.userAgent
});

// Initialize the Reddit API client
export const redditClient = new Snoowrap({
  userAgent: config.reddit.userAgent,
  clientId: config.reddit.clientId,
  clientSecret: config.reddit.clientSecret,
  username: config.reddit.username,
  password: config.reddit.password
});

// Set request delay to avoid rate limiting
redditClient.config({
  requestDelay: 1000, 
  warnings: true
});
