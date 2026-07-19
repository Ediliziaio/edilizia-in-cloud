// ============================================================================
// social-publish-scheduler — pubblica i post programmati scaduti (cron)
// ============================================================================
// Invocato da pg_cron (ogni minuto). Seleziona i social_posts con
// status='scheduled' e scheduled_at <= now, e li pubblica via publishSocialPost.
// Funziona per OGNI azienda senza configurazione: protetto con header
// x-cron-secret == INTERNAL_CRON_SECRET (env project-wide già configurato; stesso
// schema dei cron silvio/bulk-scheduler). Il cron lo legge dal vault
// (silvio_internal_cron_secret) e lo passa nell'header.
// ============================================================================
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { publishSocialPost, type SocialPostRow } from "../_shared/socialPublishCore.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204 });

  const INTERNAL_CRON_SECRET = Deno.env.get("INTERNAL_CRON_SECRET") ?? "";
  const provided = req.headers.get("x-cron-secret") ?? "";
  if (!INTERNAL_CRON_SECRET || provided !== INTERNAL_CRON_SECRET) {
    return new Response(JSON.stringify({ ok: false, error: "forbidden" }), { status: 403, headers: { "Content-Type": "application/json" } });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin = createClient(supabaseUrl, serviceKey);

    const nowIso = new Date().toISOString();
    const { data: due, error } = await admin
      .from("social_posts")
      .select("*")
      .eq("status", "scheduled")
      .lte("scheduled_at", nowIso)
      .order("scheduled_at", { ascending: true })
      .limit(50);
    if (error) throw error;

    const posts = (due ?? []) as SocialPostRow[];
    let published = 0;
    let skipped = 0;
    const failures: Array<{ id: string; result: unknown }> = [];

    for (const post of posts) {
      // ── Claim atomico per-post (anti doppia pubblicazione) ──
      // Due run del cron possono sovrapporsi (IG impiega ~18s/post): senza claim,
      // entrambi vedono lo stesso post 'scheduled' e lo pubblicano due volte.
      // Con l'UPDATE condizionato `... AND status='scheduled'` solo il primo run
      // che "vince" ottiene la riga; il secondo riceve 0 righe e salta.
      // NB: il CHECK di social_posts.status ammette solo draft/scheduled/published/
      // failed/review (niente 'publishing') e qui non possiamo alterare il DB, quindi
      // usiamo 'failed' come lock transitorio: publishSocialPost→persist() lo porta a
      // 'published' in caso di successo, o lo lascia 'failed' su errore/crash
      // (nessun retry infinito, nessun falso "pubblicato"). Il claim è PER-POST, non
      // sull'intero batch: i post non ancora raggiunti restano 'scheduled' e vengono
      // ripresi dal run successivo se questo si interrompe.
      const { data: claimed, error: claimErr } = await admin
        .from("social_posts")
        .update({ status: "failed", updated_at: new Date().toISOString() })
        .eq("id", post.id)
        .eq("status", "scheduled")
        .select("id");
      if (claimErr) {
        failures.push({ id: post.id, result: { _error: claimErr.message } });
        continue;
      }
      if (!claimed || claimed.length === 0) {
        skipped += 1; // già preso da un altro run concorrente
        continue;
      }

      try {
        const { ok, result } = await publishSocialPost(admin, post);
        if (ok) published += 1;
        else failures.push({ id: post.id, result });
      } catch (e) {
        failures.push({ id: post.id, result: { _error: e instanceof Error ? e.message : String(e) } });
      }
    }

    return new Response(
      JSON.stringify({ ok: true, processed: posts.length, published, skipped, failed: failures.length, failures }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  } catch (e) {
    return new Response(
      JSON.stringify({ ok: false, error: e instanceof Error ? e.message : "Errore interno" }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }
});
