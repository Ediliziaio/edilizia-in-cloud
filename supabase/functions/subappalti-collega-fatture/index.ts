/**
 * subappalti-collega-fatture — il giro del cron (ogni 15 minuti) che collega da sole le fatture
 * dei subappaltatori «unico e verificato», solo dove l'azienda ha acceso il collegamento
 * automatico. Le regole stanno in handler.ts. Solo il cron la chiama (x-cron-secret).
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { cronSecretValido } from "../_shared/cronAuth.ts";
import { serveConMetricheRapida } from "../_shared/withMetricsRapida.ts";
import { giroSubappalti } from "./handler.ts";

serveConMetricheRapida("subappalti-collega-fatture", async (req) => {
  if (!cronSecretValido(req)) {
    return new Response(JSON.stringify({ error: "Solo il giro automatico chiama questa funzione." }), {
      status: 401, headers: { "Content-Type": "application/json" },
    });
  }
  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const esito = await giroSubappalti(db);
  return new Response(JSON.stringify(esito), {
    status: esito.errori.length ? 207 : 200, headers: { "Content-Type": "application/json" },
  });
});
