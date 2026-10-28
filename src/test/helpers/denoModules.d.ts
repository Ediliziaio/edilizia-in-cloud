/** URL imports used by real Edge handlers exercised under Vitest.
 * Runtime implementations remain Deno's; tests mock them before importing handlers.
 */
declare module "https://deno.land/std@0.190.0/http/server.ts" {
  export function serve(handler: (request: Request) => Response | Promise<Response>): unknown;
}

declare module "https://deno.land/x/xhr@0.1.0/mod.ts" {}

declare module "https://esm.sh/@supabase/supabase-js@2.49.1" {
  export type SupabaseClient = import("@supabase/supabase-js").SupabaseClient;
}

declare module "https://esm.sh/@supabase/supabase-js@2.43.4" {
  export const createClient: typeof import("@supabase/supabase-js").createClient;
}

/** Stesso pacchetto e stessa versione di `pdf-lib` in node_modules: i test lo
 *  rimpiazzano con `vi.mock(…, () => import("pdf-lib"))`, quindi i tipi coincidono. */
declare module "https://esm.sh/pdf-lib@1.17.1" {
  export * from "pdf-lib";
}
