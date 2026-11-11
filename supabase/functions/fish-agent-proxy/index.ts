import { createFishManagementHandler } from "../_shared/fishCentralino.ts";
import { fishRuntimeDeps } from "../_shared/fishRuntimeDeps.ts";
// Valid user JWT and selected-company access are checked by authorize in fishRuntimeDeps.
Deno.serve(createFishManagementHandler(fishRuntimeDeps()));
