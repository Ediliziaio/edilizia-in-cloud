#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
ANDROID_DIR="$ROOT_DIR/android"
TASK="${1:-:app:assembleDebug}"
if [[ $# -gt 0 ]]; then
  shift
fi

if [[ -z "${JAVA_HOME:-}" ]]; then
  if [[ -d "/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home" ]]; then
    export JAVA_HOME="/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home"
  elif [[ -d "/opt/homebrew/opt/openjdk@17/libexec/openjdk.jdk/Contents/Home" ]]; then
    export JAVA_HOME="/opt/homebrew/opt/openjdk@17/libexec/openjdk.jdk/Contents/Home"
  elif command -v /usr/libexec/java_home >/dev/null 2>&1; then
    export JAVA_HOME="$(/usr/libexec/java_home -v 21 2>/dev/null || /usr/libexec/java_home 2>/dev/null || true)"
  fi
fi

if [[ -z "${JAVA_HOME:-}" || ! -x "$JAVA_HOME/bin/java" ]]; then
  echo "JAVA_HOME non trovato. Installa OpenJDK 21 o esporta JAVA_HOME prima della build Android." >&2
  exit 1
fi

if [[ -z "${ANDROID_HOME:-}" ]]; then
  LOCAL_PROPERTIES="$ANDROID_DIR/local.properties"
  if [[ -f "$LOCAL_PROPERTIES" ]]; then
    SDK_DIR="$(grep -E '^sdk\.dir=' "$LOCAL_PROPERTIES" | tail -1 | cut -d= -f2- | sed 's#\\:#:#g')"
    if [[ -n "$SDK_DIR" && -d "$SDK_DIR" ]]; then
      export ANDROID_HOME="$SDK_DIR"
    fi
  fi
fi

if [[ -z "${ANDROID_HOME:-}" ]]; then
  if [[ -d "/opt/homebrew/share/android-commandlinetools" ]]; then
    export ANDROID_HOME="/opt/homebrew/share/android-commandlinetools"
  elif [[ -d "$HOME/Library/Android/sdk" ]]; then
    export ANDROID_HOME="$HOME/Library/Android/sdk"
  fi
fi

if [[ -z "${ANDROID_HOME:-}" || ! -d "$ANDROID_HOME/platforms" ]]; then
  echo "ANDROID_HOME non trovato. Installa Android SDK o esporta ANDROID_HOME prima della build Android." >&2
  exit 1
fi

export ANDROID_SDK_ROOT="${ANDROID_SDK_ROOT:-$ANDROID_HOME}"
export PATH="$JAVA_HOME/bin:$ANDROID_HOME/platform-tools:$PATH"

cd "$ANDROID_DIR"
./gradlew "$TASK" --console=plain "$@"
