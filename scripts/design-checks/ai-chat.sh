#!/bin/sh
# Current backend regression; UI/business coverage: ai-chat-case.sh and ai-chat-live.sh.
set -eu
node scripts/design-checks/ai-chat-api.mjs
