#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/../.."
image="edilizia-gare:collaudo"
limits=()
if [[ "${GARE_TEST_SMALL_INSTANCE:-}" == 1 ]]; then
  limits=(--memory=512m --memory-swap=512m --cpus=0.1)
fi

docker build -f services/gare-appalti/Dockerfile -t "$image" .
docker run --rm "${limits[@]}" --network none --read-only --cap-drop ALL \
  --security-opt no-new-privileges:true \
  --tmpfs /tmp:rw,nosuid,nodev,noexec,size=1073741824,mode=1777 \
  -e GARE_DOC_SMOKE=1 \
  --mount "type=bind,src=$PWD/services/gare-appalti/openrouter.test.mjs,dst=/app/services/gare-appalti/openrouter.test.mjs,readonly" \
  --mount "type=bind,src=$PWD/server/gare-journey/fixtures.mjs,dst=/app/server/gare-journey/fixtures.mjs,readonly" \
  --mount "type=bind,src=$PWD/supabase/functions/gare-pilot-ai/handler.ts,dst=/app/supabase/functions/gare-pilot-ai/handler.ts,readonly" \
  "$image" node --test services/gare-appalti/openrouter.test.mjs
