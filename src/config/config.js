"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.config = void 0;
const dotenv_1 = __importDefault(require("dotenv"));
const path_1 = __importDefault(require("path"));
// Load environment variables from .env file
dotenv_1.default.config();
exports.config = {
    reddit: {
        clientId: process.env.REDDIT_CLIENT_ID || '',
        clientSecret: process.env.REDDIT_CLIENT_SECRET || '',
        username: process.env.REDDIT_USERNAME || '',
        password: process.env.REDDIT_PASSWORD || '',
        userAgent: process.env.REDDIT_USER_AGENT || '',
    },
    app: {
        outputDir: path_1.default.join(__dirname, '../../data'),
    }
};
