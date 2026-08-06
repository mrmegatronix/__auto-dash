#!/usr/bin/env bash
# Runner for go2rtc in __auto-dash

ARCH=$(uname -m)
case "$ARCH" in
  x86_64) BIN_NAME="go2rtc_linux_amd64" ;;
  aarch64|arm64) BIN_NAME="go2rtc_linux_arm64" ;;
  armv7l) BIN_NAME="go2rtc_linux_arm" ;;
  *) echo "Unsupported architecture: $ARCH"; exit 1 ;;
esac

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BIN_PATH="$SCRIPT_DIR/go2rtc"

if [ ! -f "$BIN_PATH" ]; then
  echo "Downloading go2rtc for $ARCH..."
  curl -L -o "$BIN_PATH" "https://github.com/AlexxIT/go2rtc/releases/latest/download/$BIN_NAME"
  chmod +x "$BIN_PATH"
fi

echo "Starting go2rtc with config: $SCRIPT_DIR/go2rtc.yaml"
"$BIN_PATH" -config "$SCRIPT_DIR/go2rtc.yaml"
