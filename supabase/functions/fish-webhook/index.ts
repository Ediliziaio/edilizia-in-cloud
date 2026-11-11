import { createFishEventHandler } from "../_shared/fishCentralino.ts";
import { fishRuntimeDeps } from "../_shared/fishRuntimeDeps.ts";
// External Fish webhook: verifies X-Fish-Webhook-Signature over raw bytes before parsing.
Deno.serve(createFishEventHandler(fishRuntimeDeps()));
