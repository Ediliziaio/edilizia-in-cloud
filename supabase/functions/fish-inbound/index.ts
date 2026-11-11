import { createFishEventHandler } from "../_shared/fishCentralino.ts";
import { fishRuntimeDeps } from "../_shared/fishRuntimeDeps.ts";
// Signed call.inbound hook; the mandatory session variable has no permissive fallback.
Deno.serve(createFishEventHandler(fishRuntimeDeps(), true));
