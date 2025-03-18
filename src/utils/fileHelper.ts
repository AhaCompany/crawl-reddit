import fs from 'fs';
import path from 'path';

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
