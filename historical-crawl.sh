#!/bin/bash

# Script to run historical crawl using PM2

# Navigate to the project directory
cd "$(dirname "$0")"

# Ensure logs directory exists
mkdir -p logs

# Check if PM2 is installed
if ! command -v pm2 &> /dev/null; then
    echo "Error: PM2 is not installed. Please install it with 'npm install -g pm2'"
    exit 1
fi

# Kill any existing historical crawl instances
pm2 delete reddit-historical-crawler 2>/dev/null

# Start historical crawl with PM2
echo "Starting historical crawl with PM2..."
pm2 start historical-ecosystem.config.js

# Show PM2 status
echo "PM2 status:"
pm2 ls

echo "To monitor logs in real-time, run: pm2 logs reddit-historical-crawler"
echo "To stop the crawler, run: pm2 stop reddit-historical-crawler"