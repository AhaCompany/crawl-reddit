"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.redditClient = void 0;
const snoowrap_1 = __importDefault(require("snoowrap"));
const config_1 = require("../config/config");
// Initialize the Reddit API client
exports.redditClient = new snoowrap_1.default({
    userAgent: config_1.config.reddit.userAgent,
    clientId: config_1.config.reddit.clientId,
    clientSecret: config_1.config.reddit.clientSecret,
    username: config_1.config.reddit.username,
    password: config_1.config.reddit.password,
});
// Set request delay to avoid rate limiting
exports.redditClient.config({ requestDelay: 1000 });
