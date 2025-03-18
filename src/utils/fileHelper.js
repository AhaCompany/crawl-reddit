"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.saveToJson = exports.ensureDirectoryExists = void 0;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
/**
 * Ensures the directory exists, creating it if necessary
 * @param dirPath Directory path to check/create
 */
const ensureDirectoryExists = (dirPath) => {
    if (!fs_1.default.existsSync(dirPath)) {
        fs_1.default.mkdirSync(dirPath, { recursive: true });
        console.log(`Created directory: ${dirPath}`);
    }
};
exports.ensureDirectoryExists = ensureDirectoryExists;
/**
 * Save data to a JSON file
 * @param filePath Path to save the file
 * @param data Data to save
 */
const saveToJson = (filePath, data) => {
    try {
        const dir = path_1.default.dirname(filePath);
        (0, exports.ensureDirectoryExists)(dir);
        fs_1.default.writeFileSync(filePath, JSON.stringify(data, null, 2));
        console.log(`Data saved to ${filePath}`);
    }
    catch (error) {
        console.error(`Error saving data to ${filePath}:`, error);
    }
};
exports.saveToJson = saveToJson;
