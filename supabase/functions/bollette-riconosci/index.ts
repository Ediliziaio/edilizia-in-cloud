/**
 * bollette-riconosci — il giro del cron (ogni 15 minuti) che legge le bollette appena arrivate.
 * Le regole stanno in handler.ts e nel database (bolletta_registra). Solo il cron la chiama.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { cronSecretValido } from "../_shared/cronAuth.ts";
import { serveConMetricheRapida } from "../_shared/withMetricsRapida.ts";
import { giroBollette } from "./handler.ts";

serveConMetricheRapida("bollette-riconosci", async (req) => {
  if (!cronSecretValido(req)) {
    return new Response(JSON.stringify({ error: "Solo il giro automatico chiama questa funzione." }), {
      status: 401, headers: { "Content-Type": "application/json" },
    });
  }
  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const esito = await giroBollette(db);
  return new Response(JSON.stringify(esito), {
    status: esito.errori.length ? 207 : 200, headers: { "Content-Type": "application/json" },
  });
});
