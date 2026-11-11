import { createFishToolHandler } from "../_shared/fishCentralino.ts";
import { fishRuntimeDeps } from "../_shared/fishRuntimeDeps.ts";
// Per-agent HMAC-derived token + server-side session lookup + tenant/tool authorization.
Deno.serve(createFishToolHandler(fishRuntimeDeps()));
