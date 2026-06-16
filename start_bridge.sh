#!/usr/bin/env bash
# Start the WhatsApp bridge in a tmux session
# Usage: ./start_bridge.sh

set -e

PROJECT_DIR="/mnt/c/Users/ferdi/Documents/ferdinand_dev/PersonalProject/waBotAssistant"
SESSION_NAME="wa-bridge"

cd "$PROJECT_DIR"

# Check if session already exists
if tmux has-session -t "$SESSION_NAME" 2>/dev/null; then
    echo "Bridge session '$SESSION_NAME' already running."
    echo "Attach: tmux attach -t $SESSION_NAME"
    echo "Kill: tmux kill-session -t $SESSION_NAME"
    exit 0
fi

# Start bridge in tmux
tmux new-session -d -s "$SESSION_NAME" "node bridge.js"

echo "✅ WhatsApp bridge started in tmux session '$SESSION_NAME'"
echo ""
echo "  View logs:  tmux attach -t $SESSION_NAME"
echo "  Detach:     Ctrl+B, D"
echo "  Stop:       tmux kill-session -t $SESSION_NAME"
echo ""

# Wait a bit and check status
sleep 3
if tmux has-session -t "$SESSION_NAME" 2>/dev/null; then
    echo "Bridge is running. Check for QR code..."
    sleep 2
    tmux capture-pane -t "$SESSION_NAME" -p | tail -20
fi