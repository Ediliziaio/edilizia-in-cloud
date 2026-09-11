// Purga notturna degli export GDPR scaduti (più vecchi di 30 giorni).
//
// Prima era una funzione SQL che cancellava da storage.objects: Supabase lo
// vieta (la riga sparirebbe ma il file resterebbe orfano nel bucket), quindi
// falliva ogni notte. Il database elenca i file scaduti, la Storage API li
// rimuove davvero.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders } from "../_shared/headers.ts";
import { requireInternalSecret } from "../_shared/auth.ts";
import { conMetriche } from "../_shared/withMetrics.ts";

const BUCKET = "gdpr-exports";
const GIORNI = 30;
const LOTTO = 100;

Deno.serve(conMetriche("purge-gdpr-exports", async (req) => {
  const cors = getCorsHeaders(req);
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });

  try {
    requireInternalSecret(req, cors);

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: scaduti, error } = await admin.rpc("storage_oggetti_scaduti", {
      p_bucket: BUCKET,
      p_giorni: GIORNI,
    });
    if (error) throw new Error(`storage_oggetti_scaduti: ${error.message}`);

    const nomi = ((scaduti ?? []) as { nome: string }[]).map((r) => r.nome);
    let rimossi = 0;
    const errori: string[] = [];
    for (let i = 0; i < nomi.length; i += LOTTO) {
      const lotto = nomi.slice(i, i + LOTTO);
      const { data, error: remErr } = await admin.storage.from(BUCKET).remove(lotto);
      if (remErr) errori.push(remErr.message);
      else rimossi += data?.length ?? 0;
    }

    if (rimossi > 0) console.log(`[purge-gdpr-exports] rimossi ${rimossi} file scaduti`);
    return new Response(JSON.stringify({ ok: errori.length === 0, scaduti: nomi.length, rimossi, errori }), {
      status: errori.length ? 500 : 200,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  } catch (e) {
    if (e instanceof Response) return e;
    console.error("[purge-gdpr-exports]", e);
    return new Response(JSON.stringify({ ok: false, error: (e as Error).message }), {
      status: 500, headers: { ...cors, "Content-Type": "application/json" },
    });
  }
}));
