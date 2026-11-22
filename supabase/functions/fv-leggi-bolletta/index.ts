import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import * as headers from "../_shared/headers.ts";
import { requireAuth, requireCompanyAccess } from "../_shared/auth.ts";
import { aiRouterComplete } from "../_shared/aiRouter.ts";
import { extractPdfWithCoverage } from "../_shared/pdfExtraction.ts";
import { erroreAiPerUtente } from "../_shared/erroriAi.ts";
import { serveConMetriche } from "../_shared/withMetrics.ts";
import { type DipendenzeBollettaFv } from "./handler.ts";
import { creaHandlerBollettaFvAsincrona, type LavoroBollettaFv } from "./asincrona.ts";
declare const EdgeRuntime: { waitUntil: (p: Promise<void>) => void };
type DbLavori = { rpc: (fn: string, args: Record<string, unknown>) => PromiseLike<{ data: unknown; error: unknown }> };
const deps: DipendenzeBollettaFv = {
  headers, requireAuth, requireCompanyAccess, aiRouterComplete, extractPdfWithCoverage, erroreAiPerUtente,
  utente: (req) => createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: req.headers.get("Authorization")! } },
  }) as unknown as ReturnType<DipendenzeBollettaFv["utente"]>,
};
serveConMetriche(
  "fv-leggi-bolletta",
  creaHandlerBollettaFvAsincrona(deps, {
    async prendi(db, parametri) {
      const { data, error } = await (db as DbLavori).rpc("fv_bolletta_prendi_lavoro", parametri);
      if (error || !data || typeof data !== "object" || !("id" in data)) throw Error("Presa non disponibile");
      return data as LavoroBollettaFv;
    },
    async concludi(db, id, token, status, esito) {
      const { data, error } = await (db as DbLavori).rpc("fv_bolletta_concludi_lavoro", { p_id: id, p_token: token, p_status: status, p_esito: esito });
      if (error) throw Error("Esito non salvato");
      return data === true;
    },
    prosegui(p) { EdgeRuntime.waitUntil(p); },
  }),
);
