#!/bin/bash

# Helper script to upload session files to Railway volumes

echo "🔐 Railway Session File Upload Helper"
echo "======================================"

# Check if railway CLI is available
if ! command -v npx railway &> /dev/null; then
    echo "❌ Railway CLI not found. Please install: npm install -g @railway/cli"
    exit 1
fi

# Check if logged in
if ! npx railway whoami &> /dev/null; then
    echo "❌ Not logged in to Railway. Please run: railway login"
    exit 1
fi

echo "📁 Checking for local session files..."

SESSION_FILES=()
if [ -f "bottorrent.session" ]; then
    SESSION_FILES+=("bottorrent.session")
    echo "✅ Found: bottorrent.session"
fi

if [ -f "bottorrent.session-journal" ]; then
    SESSION_FILES+=("bottorrent.session-journal")
    echo "✅ Found: bottorrent.session-journal"
fi

if [ -f "test_bot.session" ]; then
    SESSION_FILES+=("test_bot.session")
    echo "✅ Found: test_bot.session"
fi

if [ ${#SESSION_FILES[@]} -eq 0 ]; then
    echo "⚠️  No session files found in current directory"
    echo "Please make sure you have:"
    echo "  - bottorrent.session"
    echo "  - bottorrent.session-journal (if exists)"
    echo "  - test_bot.session (if exists)"
    exit 1
fi

echo ""
echo "🚀 Uploading ${#SESSION_FILES[@]} session file(s) to Railway..."
echo ""

# Upload each session file
for session_file in "${SESSION_FILES[@]}"; do
    echo "📤 Uploading $session_file..."
    
    # Convert file to base64 and upload via railway shell
    base64_content=$(base64 -w 0 "$session_file")
    
    npx railway shell "echo '$base64_content' | base64 -d > /app/sessions/$session_file && echo '✅ Uploaded $session_file'" || {
        echo "❌ Failed to upload $session_file"
        exit 1
    }
done

echo ""
echo "🎉 All session files uploaded successfully!"
echo "✅ Your Telegram bot sessions are now persisted in Railway"
echo ""
echo "Next steps:"
echo "1. Deploy your app: railway up"
echo "2. Check logs: railway logs"
echo "3. Your bot will automatically use the uploaded session files!"

echo ""
echo "🔍 Verifying upload..."
npx railway shell "ls -la /app/sessions/"