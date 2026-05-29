/**
 * email-sequenze-optout — MP-EMAIL-AI-13 · disiscrizione (cap.2 "uscita facile")
 *
 * Endpoint PUBBLICO (link nel footer delle email marketing): ?t=<optout_token>.
 * Ferma la sequenza del destinatario e registra una soppressione per-azienda in
 * `email_suppressions` (stessa tabella di email-provider-webhook → idempotente).
 * Il token è il segreto: nessun JWT. verify_jwt=false.
 *
 * email_normalized è una colonna GENERATA (come fa il webhook): NON va inserita.
 */

// deno-lint-ignore-file no-explicit-any

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

function page(msg: string, ok: boolean): Response {
  const html = `<!doctype html><html lang="it"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>Disiscrizione</title>
<style>body{font-family:system-ui,-apple-system,Segoe UI,Arial,sans-serif;background:#f8fafc;color:#0f172a;display:flex;min-height:100vh;align-items:center;justify-content:center;margin:0}
.c{background:#fff;border:1px solid #e2e8f0;border-radius:14px;padding:28px 32px;max-width:420px;text-align:center;box-shadow:0 6px 24px rgba(0,0,0,.06)}
h1{font-size:18px;margin:0 0 8px}p{font-size:14px;color:#475569;margin:0;line-height:1.5}.i{font-size:34px;margin-bottom:8px}</style></head>
<body><div class="c"><div class="i">${ok ? "✅" : "ℹ️"}</div><h1>${ok ? "Disiscrizione completata" : "Richiesta non valida"}</h1><p>${msg}</p></div></body></html>`;
  return new Response(html, {
    status: ok ? 200 : 400,
    headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204 });
  const url = new URL(req.url);
  const token = (url.searchParams.get("t") || "").trim();
  if (!token) return page("Link di disiscrizione non valido.", false);

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE);
  try {
    const { data: e } = await supabase.from("sequenze_esecuzioni")
      .select("id, company_id, destinatario, stato").eq("optout_token", token).maybeSingle();
    if (!e) return page("Link non riconosciuto o già gestito.", false);

    const giaConclusa = ["opt_out", "fermata_risposta", "bounce", "completata", "annullata"].includes(e.stato);
    if (!giaConclusa) {
      await supabase.from("sequenze_esecuzioni")
        .update({ stato: "opt_out", fermata_motivo: "Disiscrizione dal destinatario" }).eq("id", e.id);
    }

    // Soppressione per-azienda (email_normalized è generata: non inserirla).
    await supabase.from("email_suppressions").upsert({
      email: e.destinatario,
      company_id: e.company_id,
      reason: "unsubscribe",
      suppressed_at: new Date().toISOString(),
      source_provider: "sequenza",
    }, { onConflict: "company_id,email_normalized,reason", ignoreDuplicates: true })
      .then(() => {}, () => {});

    return page("Non riceverai più questi messaggi. Grazie.", true);
  } catch {
    return page("Si è verificato un problema. Riprova più tardi.", false);
  }
});
