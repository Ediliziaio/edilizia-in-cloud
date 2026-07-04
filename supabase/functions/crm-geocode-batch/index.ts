/**
 * crm-geocode-batch — geocodifica stradale precisa per la Mappa CRM.
 *
 * Il super_admin lancia (bottone in Dashboard commerciale → Mappa) un batch che
 * prende i record SENZA coordinate ma CON indirizzo e li geocodifica via
 * forwardGeocode (HERE → Google → Nominatim), scrivendo lat/lng (+ backfill di
 * città/provincia/regione se mancanti). Così i pin passano dal centroide della
 * provincia alla posizione stradale reale.
 *
 * Target:
 *   • marketing_contacts (i lead importati della banca dati) — lat/lng/geocoded_at.
 *   • companies (i clienti EiC senza operational_lat) — operational_lat/lng.
 *
 * È idempotente e ripetibile: ogni run prende il prossimo blocco di record ancora
 * privi di coordinate (cap `limit`, default 40). Con la sola Nominatim (nessuna
 * chiave HERE/Google) throttla a ~1.1 req/s per rispettare la policy OSM, quindi
 * si preme il bottone finché `remaining` non è 0.
 *
 * Body: { target?: 'contacts'|'companies'|'both' (default 'both'), limit?: number }
 * Output: { target, processed, geocoded, failed, remaining }
 */
import { getCorsHeaders, errorResponse, jsonResponse } from "../_shared/headers.ts";
import { requireAuth, requireRole } from "../_shared/auth.ts";
import { geocodeAddress, usesNominatimOnly } from "../_shared/forwardGeocode.ts";

const DEFAULT_LIMIT = 40;
const MAX_LIMIT = 100;
const TIME_BUDGET_MS = 110_000; // margine sotto il limite wall-clock dell'edge

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Compone la stringa d'indirizzo per il geocoder, scartando i pezzi vuoti. */
function buildAddress(parts: Array<string | null | undefined>): string {
  const cleaned = parts
    .map((p) => (p ?? "").toString().trim())
    .filter((p) => p.length > 0);
  if (!cleaned.length) return "";
  return `${cleaned.join(", ")}, Italia`;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Admin = any;

Deno.serve(async (req) => {
  const corsH = getCorsHeaders(req);
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsH });
  if (req.method !== "POST") return errorResponse("Method not allowed", 405, corsH);

  try {
    const { userId, supabaseAdmin: admin } = await requireAuth(req, corsH);
    await requireRole(admin, userId, ["super_admin"], corsH);

    const body = await req.json().catch(() => ({}));
    const target: "contacts" | "companies" | "both" =
      body?.target === "contacts" || body?.target === "companies" ? body.target : "both";
    const limit = Math.max(1, Math.min(MAX_LIMIT, Number(body?.limit) || DEFAULT_LIMIT));
    const throttle = usesNominatimOnly() ? 1100 : 120; // ms tra due geocodifiche

    const start = Date.now();
    let processed = 0;
    let geocoded = 0;
    let failed = 0;

    // ── marketing_contacts ────────────────────────────────────────────────────
    let remainingContacts = 0;
    if (target === "contacts" || target === "both") {
      const { count } = await admin
        .from("marketing_contacts")
        .select("id", { count: "exact", head: true })
        .is("lat", null)
        .not("address", "is", null);
      remainingContacts = count ?? 0;

      const { data: rows, error } = await admin
        .from("marketing_contacts")
        .select("id,address,postal_code,city,province,region")
        .is("lat", null)
        .not("address", "is", null)
        .limit(limit);
      if (error) throw error;

      for (const r of (rows ?? []) as Admin[]) {
        if (Date.now() - start > TIME_BUDGET_MS) break;
        const addr = buildAddress([r.address, r.postal_code, r.city, r.province]);
        if (!addr) { failed++; processed++; continue; }
        const res = await geocodeAddress(addr);
        processed++;
        if (res && res.in_italia) {
          const patch: Record<string, unknown> = {
            lat: res.lat, lng: res.lng, geocoded_at: new Date().toISOString(),
          };
          if (!r.city && res.comune) patch.city = res.comune;
          if (!r.province && res.provincia) patch.province = res.provincia;
          if (!r.region && res.regione) patch.region = res.regione;
          const { error: upErr } = await admin.from("marketing_contacts").update(patch).eq("id", r.id);
          if (upErr) failed++; else { geocoded++; remainingContacts = Math.max(0, remainingContacts - 1); }
        } else {
          failed++;
        }
        await sleep(throttle);
      }
    }

    // ── companies (clienti EiC senza coordinate operative) ────────────────────
    let remainingCompanies = 0;
    if (target === "companies" || target === "both") {
      const { count } = await admin
        .from("companies")
        .select("id", { count: "exact", head: true })
        .is("operational_lat", null)
        .not("is_platform_admin_company", "is", true);
      remainingCompanies = count ?? 0;

      if (Date.now() - start <= TIME_BUDGET_MS) {
        const { data: rows, error } = await admin
          .from("companies")
          .select("id,operational_address,legal_address,operational_city,legal_city,operational_postal_code,operational_province,legal_province,region")
          .is("operational_lat", null)
          .not("is_platform_admin_company", "is", true)
          .limit(limit);
        if (error) throw error;

        for (const r of (rows ?? []) as Admin[]) {
          if (Date.now() - start > TIME_BUDGET_MS) break;
          const addr = buildAddress([
            r.operational_address ?? r.legal_address,
            r.operational_postal_code,
            r.operational_city ?? r.legal_city,
            r.operational_province ?? r.legal_province,
          ]);
          if (!addr) { failed++; processed++; continue; }
          const res = await geocodeAddress(addr);
          processed++;
          if (res && res.in_italia) {
            const patch: Record<string, unknown> = { operational_lat: res.lat, operational_lng: res.lng };
            if (!r.operational_city && res.comune) patch.operational_city = res.comune;
            if (!r.operational_province && res.provincia) patch.operational_province = res.provincia;
            if (!r.region && res.regione) patch.region = res.regione;
            const { error: upErr } = await admin.from("companies").update(patch).eq("id", r.id);
            if (upErr) failed++; else { geocoded++; remainingCompanies = Math.max(0, remainingCompanies - 1); }
          } else {
            failed++;
          }
          await sleep(throttle);
        }
      }
    }

    return jsonResponse({
      target,
      processed,
      geocoded,
      failed,
      remaining: remainingContacts + remainingCompanies,
      remaining_contacts: remainingContacts,
      remaining_companies: remainingCompanies,
    }, 200, corsH);
  } catch (e) {
    if (e instanceof Response) return e;
    const msg = e instanceof Error ? e.message : "Errore geocodifica";
    return errorResponse(msg, 500, corsH);
  }
});
