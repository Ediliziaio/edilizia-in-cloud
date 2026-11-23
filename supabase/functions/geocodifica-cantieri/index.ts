/**
 * geocodifica-cantieri — riempie orders.work_lat/work_lng dall'indirizzo dei lavori.
 * Cron ogni 20 minuti (x-cron-secret), 40 cantieri per giro.
 *
 * Usa il geocoder condiviso dell'app `geocodeAddress` (HERE → Google → Nominatim):
 * Nominatim pubblico DA SOLO viene bloccato sugli IP datacenter delle edge function
 * (policy anti-bulk), quindi dall'edge falliva ogni indirizzo anche quando era valido.
 * HERE/Google hanno chiave e rispondono. Legge `indirizzo_lavori`, con fallback su
 * `work_address`. Serve al geofence delle timbrature e al meteo del rapportino.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders } from "../_shared/headers.ts";
import { geocodeAddress } from "../_shared/forwardGeocode.ts";
import { serveConMetriche } from "../_shared/withMetrics.ts";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Toglie il civico e le note tra parentesi per un secondo tentativo più largo. */
function semplifica(indirizzo: string): string {
  return indirizzo.replace(/\([^)]*\)/g, "").replace(/\b\d+[a-zA-Z]?\b(?=\s*,)/g, "").replace(/\s+/g, " ").trim();
}

serveConMetriche("geocodifica-cantieri", async (req: Request) => {
  const corsH = getCorsHeaders(req);
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsH });
  const json = (status: number, payload: unknown) =>
    new Response(JSON.stringify(payload), { status, headers: { ...corsH, "Content-Type": "application/json" } });
  const secret = Deno.env.get("INTERNAL_CRON_SECRET");
  if (!secret || req.headers.get("x-cron-secret") !== secret) return json(401, { error: "Non autorizzato" });

  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
  let limite = 40, soloCompany: string | null = null;
  try { const b = await req.json(); if (b?.limit) limite = Math.min(80, Number(b.limit)); if (b?.company_id) soloCompany = String(b.company_id); } catch { /* body vuoto */ }

  let q = admin.from("orders")
    .select("id, indirizzo_lavori, work_address, order_code")
    .is("deleted_at", null).is("work_lat", null)
    .or("indirizzo_lavori.not.is.null,work_address.not.is.null")
    .or("work_geocoded_at.is.null,work_geocoded_at.lt." + new Date(Date.now() - 30 * 86400_000).toISOString())
    .order("updated_at", { ascending: false }).limit(limite);
  if (soloCompany) q = q.eq("company_id", soloCompany);
  const { data: ordini, error } = await q;
  if (error) return json(500, { error: error.message });

  let trovati = 0, mancati = 0;
  for (const o of ordini ?? []) {
    const indirizzo = String(o.indirizzo_lavori ?? o.work_address ?? "").trim();
    let hit: { lat: number; lng: number } | null = null;
    if (indirizzo.length >= 6) {
      try { hit = await geocodeAddress(indirizzo); } catch (e) { console.warn("[geocodifica]", o.order_code, e instanceof Error ? e.message : e); }
      // Secondo tentativo senza il numero civico e le note tra parentesi
      if (!hit) {
        const semplice = semplifica(indirizzo);
        if (semplice && semplice !== indirizzo) { await sleep(1100); try { hit = await geocodeAddress(semplice); } catch { /* niente */ } }
      }
    }
    await admin.from("orders").update({
      work_lat: hit?.lat ?? null, work_lng: hit?.lng ?? null, work_geocoded_at: new Date().toISOString(),
    }).eq("id", o.id);
    if (hit) trovati++; else mancati++;
    await sleep(1100);
  }
  return json(200, { ok: true, esaminati: ordini?.length ?? 0, trovati, mancati });
});
