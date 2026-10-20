#!/bin/bash
# Just Spuds EPOS Till Terminal - Linux / POS Terminal Launcher
TARGET_URL="https://pos.justspuds.uk"
if [ "$1" == "local" ]; then
  TARGET_URL="http://localhost:5173/pos"
fi

echo "==================================================="
echo "  JUST SPUDS AYLESBURY - COUNTER TILL SOFTWARE"
echo "==================================================="
echo "Launching till on Linux in standalone dedicated software mode..."

# Check for Chromium, Chrome, or Edge
if command -v chromium-browser &> /dev/null; then
  chromium-browser --app="$TARGET_URL" --start-maximized --disable-pinch --overscroll-history-navigation=0 &
elif command -v chromium &> /dev/null; then
  chromium --app="$TARGET_URL" --start-maximized --disable-pinch --overscroll-history-navigation=0 &
elif command -v google-chrome &> /dev/null; then
  google-chrome --app="$TARGET_URL" --start-maximized --disable-pinch --overscroll-history-navigation=0 &
elif command -v microsoft-edge &> /dev/null; then
  microsoft-edge --app="$TARGET_URL" --start-maximized --disable-pinch --overscroll-history-navigation=0 &
else
  xdg-open "$TARGET_URL" &
fi
