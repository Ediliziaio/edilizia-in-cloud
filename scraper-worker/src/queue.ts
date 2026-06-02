// Processore di coda: pesca i job da lead_scraper_jobs, scrapa fino al target
// (anche MIGLIAIA, a pagine), fa bulk-upsert a batch in scraped_companies e
// aggiorna l'avanzamento. Gira in background nel worker (nessun timeout).
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { scrapePagineGialle, type Business } from "./scrapers/paginegialle.js";
import { scrapeGmaps } from "./scrapers/gmaps.js";

const PLATFORM_ADMIN_COMPANY_ID = "00000000-0000-0000-0000-000000000001";
const WORKER_ID = `worker-${Math.floor(Date.now() / 1000)}`;
const UPSERT_BATCH = 500;

function dedupeKey(b: any, city: string): string {
  if (b.place_id) return `g:${b.place_id}`;
  if (b.phone) return `p:${String(b.phone).replace(/[^0-9+]/g, "")}`;
  return `n:${String(b.business_name || "").trim().toLowerCase()}|${String(b.city || city || "").toLowerCase()}`;
}

async function bulkUpsert(sb: SupabaseClient, rows: any[]): Promise<number> {
  let n = 0;
  for (let i = 0; i < rows.length; i += UPSERT_BATCH) {
    const chunk = rows.slice(i, i + UPSERT_BATCH);
    const { data } = await sb.rpc("scraped_companies_upsert", { p_rows: chunk });
    n += typeof data === "number" ? data : chunk.length;
  }
  return n;
}

async function processJob(sb: SupabaseClient, job: any): Promise<void> {
  const p = job.params || {};
  const engine = p.engine === "gmaps" ? "gmaps" : "paginegialle";
  const keyword = String(p.keyword || "").trim();
  const city = String(p.city || "").trim();
  const region = String(p.region || "").trim();
  const target = Math.max(1, Math.min(20000, Number(p.target) || 500));
  const kw = keyword.toLowerCase();

  // progress callback: aggiorna processed mentre scrapa
  const updateProgress = async (processed: number) => {
    await sb.from("lead_scraper_jobs").update({ processed }).eq("id", job.id);
  };

  let scraped: Business[] = [];
  if (engine === "gmaps") {
    scraped = await scrapeGmaps({ keyword, city, max: target, withEmails: p.withEmails !== false }) as any;
    await updateProgress(scraped.length);
  } else {
    scraped = await scrapePagineGialle({ keyword, city, max: target, withEmails: p.withEmails !== false, onProgress: updateProgress });
  }

  // bulk-upsert nel DB proprietario
  const rows = scraped.map((b: any) => ({
    ...b, region: b.region || region || null, dedupe_key: dedupeKey(b, city), categories: [kw],
  }));
  const upserted = await bulkUpsert(sb, rows);

  // crea la search + i lead della ricerca (dal DB proprietario, dedup globale)
  const { data: searchRow } = await sb.from("lead_scraper_searches").insert({
    created_by: job.created_by, source: "internal",
    label: `Massivo · ${keyword}${city ? " · " + city : ""}`,
    query: { keyword, city, region, engine, target, job: job.id },
    status: "completed", results_count: rows.length,
  }).select("id").single();

  if (searchRow) {
    // ripesca dal DB proprietario (categoria+città) fino a target
    let q = sb.from("scraped_companies").select("*").contains("categories", [kw]);
    if (city) q = q.ilike("city", `%${city}%`);
    const { data: pool } = await q.order("last_scraped_at", { ascending: false }).limit(target);
    const leadRows = (pool || []).map((c: any) => ({
      search_id: searchRow.id, source: "internal", business_name: c.business_name,
      phone: c.phone, email: c.email, email_status: c.email ? "found" : null,
      website: c.website, address: c.address, city: c.city || city || null,
      region: c.region || region || null, country: c.country || "IT",
      partita_iva: c.partita_iva, place_id: c.place_id, rating: c.rating,
      reviews_count: c.reviews_count, dedupe_key: c.dedupe_key,
    }));
    // insert a batch
    for (let i = 0; i < leadRows.length; i += UPSERT_BATCH) {
      await sb.from("lead_scraper_results")
        .upsert(leadRows.slice(i, i + UPSERT_BATCH), { onConflict: "search_id,dedupe_key", ignoreDuplicates: true });
    }
    await sb.from("lead_scraper_jobs").update({
      status: "done", processed: scraped.length, results_count: rows.length,
      search_id: searchRow.id, finished_at: new Date().toISOString(),
    }).eq("id", job.id);
  } else {
    await sb.from("lead_scraper_jobs").update({
      status: "done", processed: scraped.length, results_count: upserted, finished_at: new Date().toISOString(),
    }).eq("id", job.id);
  }
}

export function startQueue(): void {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.warn("[queue] SUPABASE_URL/SERVICE_ROLE_KEY mancanti → coda disabilitata (solo /scrape sincrono).");
    return;
  }
  const sb = createClient(url, key, { auth: { persistSession: false } });
  let busy = false;

  const tick = async () => {
    if (busy) return;
    busy = true;
    try {
      const { data: job } = await sb.rpc("lead_scraper_claim_job", { p_worker: WORKER_ID });
      if (job && job.id) {
        console.log(`[queue] preso job ${job.id} (${JSON.stringify(job.params)})`);
        try {
          await processJob(sb, job);
          console.log(`[queue] job ${job.id} completato`);
        } catch (e) {
          await sb.from("lead_scraper_jobs").update({
            status: "error", error: (e as Error).message?.slice(0, 500), finished_at: new Date().toISOString(),
          }).eq("id", job.id);
          console.error(`[queue] job ${job.id} errore:`, (e as Error).message);
        }
      }
    } catch (e) {
      console.error("[queue] tick error:", (e as Error).message);
    } finally {
      busy = false;
    }
  };

  setInterval(tick, 5000);
  console.log("[queue] processore di coda avviato (poll ogni 5s).");
}

// nota: PLATFORM_ADMIN_COMPANY_ID disponibile se servirà legare al CRM dal worker.
void PLATFORM_ADMIN_COMPANY_ID;
