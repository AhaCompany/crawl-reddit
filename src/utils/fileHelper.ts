import fs from 'fs';
import path from 'path';
import { config } from '../config/config';
import { RedditPost } from '../models/Post';
import { RedditComment } from '../models/Comment';
import { savePosts, saveComments, initializeTables } from './postgresHelper';

/**
 * Ensures the directory exists, creating it if necessary
 * @param dirPath Directory path to check/create
 */
export const ensureDirectoryExists = (dirPath: string): void => {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
    console.log(`Created directory: ${dirPath}`);
  }
};

/**
 * Save data to a JSON file
 * @param filePath Path to save the file
 * @param data Data to save
 */
export const saveToJson = (filePath: string, data: any): void => {
  try {
    const dir = path.dirname(filePath);
    ensureDirectoryExists(dir);
    
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
    console.log(`Data saved to ${filePath}`);
  } catch (error) {
    console.error(`Error saving data to ${filePath}:`, error);
  }
};

/**
 * Initialize storage system based on configuration
 */
export const initializeStorage = async (): Promise<void> => {
  if (config.app.storage === 'postgresql') {
    console.log('Initializing PostgreSQL database tables...');
    try {
      await initializeTables();
    } catch (error) {
      console.error('Failed to initialize PostgreSQL. Falling back to JSON storage.', error);
      // Fallback to JSON storage
      config.app.storage = 'json';
    }
  } else {
    console.log('Using JSON file storage');
  }
};

/**
 * Save Reddit posts to the configured storage system
 * @param subreddit Name of the subreddit
 * @param posts Array of posts to save
 * @param filePath Path to save JSON file (used only for JSON storage)
 */
export const savePosts2Storage = async (
  subreddit: string, 
  posts: RedditPost[], 
  filePath: string
): Promise<void> => {
  // First, always save to JSON as backup
  saveToJson(filePath, posts);
  
  // If PostgreSQL is configured, also save to database
  if (config.app.storage === 'postgresql') {
    try {
      await savePosts(subreddit, posts);
    } catch (error) {
      console.error('Error saving posts to PostgreSQL:', error);
      console.log('Posts were saved to JSON as fallback');
    }
  }
};

/**
 * Save Reddit comments to the configured storage system
 * @param postId ID of the post these comments belong to
 * @param comments Array of comments to save
 * @param filePath Path to save JSON file (used only for JSON storage)
 */
export const saveComments2Storage = async (
  postId: string,
  comments: RedditComment[],
  filePath: string
): Promise<void> => {
  // First, always save to JSON as backup
  saveToJson(filePath, comments);
  
  // If PostgreSQL is configured, also save to database
  if (config.app.storage === 'postgresql') {
    try {
      await saveComments(postId, comments);
    } catch (error) {
      console.error('Error saving comments to PostgreSQL:', error);
      console.log('Comments were saved to JSON as fallback');
    }
  }
};
