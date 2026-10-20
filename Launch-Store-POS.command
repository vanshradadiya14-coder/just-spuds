#!/bin/bash
# Just Spuds EPOS Till Terminal - macOS Standalone Launcher
TARGET_URL="https://pos.justspuds.uk"
if [ "$1" == "local" ]; then
  TARGET_URL="http://localhost:5173/pos"
fi

echo "==================================================="
echo "  JUST SPUDS AYLESBURY - COUNTER TILL SOFTWARE"
echo "==================================================="
echo "Launching till in standalone dedicated software mode..."

# Try Google Chrome in app mode (frameless window)
if [ -d "/Applications/Google Chrome.app" ]; then
  open -na "Google Chrome" --args --app="$TARGET_URL" --start-maximized
# Try Microsoft Edge
elif [ -d "/Applications/Microsoft Edge.app" ]; then
  open -na "Microsoft Edge" --args --app="$TARGET_URL" --start-maximized
# Try Brave Browser
elif [ -d "/Applications/Brave Browser.app" ]; then
  open -na "Brave Browser" --args --app="$TARGET_URL" --start-maximized
else
  # Fallback to default browser
  open "$TARGET_URL"
fi
