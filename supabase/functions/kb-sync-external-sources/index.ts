/**
 * kb-sync-external-sources — Auto-sync di fonti esterne nella KB.
 *
 * Flusso:
 *   1. Lista fonti due (RPC kb_external_sources_due) o una singola (body.source_id).
 *   2. Per ogni fonte:
 *      a. Fetch HTTP secondo scrape_strategy
 *      b. Estrai content secondo scrape_config (regex/selector/json/rss/full_text)
 *      c. Calcola SHA-256 del content estratto
 *      d. Confronta con last_content_hash:
 *         - identico → mark_unchanged
 *         - diverso  → apply_change (versiona vecchio, crea nuovo doc)
 *                      → triggera embedding async via ai-brain-ingest
 *      e. Errore   → mark_error (log, increment consecutive_errors)
 *   3. Ritorna report aggregato.
 *
 * Auth:
 *   - Service role (bypass) se header `x-cron-secret` matcha env KB_CRON_SECRET.
 *   - Altrimenti super_admin via JWT.
 *
 * Body opzionale:
 *   { source_id?: uuid, dry_run?: boolean, limit?: number }
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { fetchWithRetryAndTimeout } from "../_shared/fetchWithTimeout.ts";
import { contentHash } from "../_shared/brainEmbed.ts";
import { generateEmbeddingMultilang } from "../_shared/brainEmbedMultilang.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const KB_CRON_SECRET = Deno.env.get("KB_CRON_SECRET") ?? "";
// Fallback: shared cron secret usato dagli altri cron interni
const PROACTIVE_CRON_SECRET = Deno.env.get("PROACTIVE_CRON_SECRET") ?? "";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
};

interface ExternalSource {
  id: string;
  name: string;
  url: string;
  scrape_strategy: "http_regex" | "http_selector" | "http_json" | "rss" | "full_text";
  scrape_config: Record<string, unknown>;
  last_content_hash: string | null;
  target_doc_id: string | null;
  target_language: string;
  target_category_path: string | null;
}

interface SyncResult {
  source_id: string;
  source_name: string;
  status: "no_change" | "changed" | "error" | "skipped";
  hash?: string;
  new_doc_id?: string;
  replaced_doc_id?: string;
  error?: string;
  content_chars?: number;
  duration_ms: number;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });

  try {
    const cronSecret = req.headers.get("x-cron-secret") ?? "";
    // Accetta KB_CRON_SECRET (originale) O PROACTIVE_CRON_SECRET (shared cron auth)
    const isCron = cronSecret.length > 0 && (
      (KB_CRON_SECRET.length > 0 && cronSecret === KB_CRON_SECRET) ||
      (PROACTIVE_CRON_SECRET.length > 0 && cronSecret === PROACTIVE_CRON_SECRET)
    );

    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    if (!isCron) {
      const authHeader = req.headers.get("Authorization") ?? "";
      const userRes = await supabase.auth.getUser(authHeader.replace("Bearer ", ""));
      const userId = userRes.data?.user?.id;
      if (!userId) return jsonRes({ error: "Unauthorized" }, 401);
      const { data: roleData } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", userId)
        .eq("role", "super_admin")
        .maybeSingle();
      if (!roleData) return jsonRes({ error: "Solo super_admin o cron" }, 403);
    }

    const body = await req.json().catch(() => ({}));
    const dryRun: boolean = body.dry_run === true;
    const limit: number = Math.min(Math.max(Number(body.limit) || 20, 1), 100);
    const singleSourceId: string | null = typeof body.source_id === "string" ? body.source_id : null;

    // 1. Carica le fonti da processare
    let sources: ExternalSource[] = [];
    if (singleSourceId) {
      const { data, error } = await supabase
        .from("ai_kb_external_sources")
        .select("id,name,url,scrape_strategy,scrape_config,last_content_hash,target_doc_id,target_language,target_category_path")
        .eq("id", singleSourceId)
        .maybeSingle();
      if (error) return jsonRes({ error: error.message }, 500);
      if (!data) return jsonRes({ error: "Source non trovata" }, 404);
      sources = [data as ExternalSource];
    } else {
      const { data: dueIds, error: dueErr } = await supabase.rpc("kb_external_sources_due", { p_limit: limit });
      if (dueErr) return jsonRes({ error: dueErr.message }, 500);
      const ids = (dueIds ?? []).map((r: { id: string }) => r.id);
      if (ids.length === 0) {
        return jsonRes({ ok: true, processed: 0, results: [], note: "Nessuna fonte due" });
      }
      const { data, error } = await supabase
        .from("ai_kb_external_sources")
        .select("id,name,url,scrape_strategy,scrape_config,last_content_hash,target_doc_id,target_language,target_category_path")
        .in("id", ids);
      if (error) return jsonRes({ error: error.message }, 500);
      sources = (data ?? []) as ExternalSource[];
    }

    // 2. Processa ogni fonte (in serie per evitare rate-limit dei siti pubblici)
    const results: SyncResult[] = [];
    for (const src of sources) {
      results.push(await syncOne(supabase, src, dryRun));
    }

    // 3. Embed i doc appena creati. Inline qui: abbiamo già content+lang,
    //    e vogliamo che il doc sia immediatamente queryable dopo il sync.
    if (!dryRun) {
      for (const r of results) {
        if (r.status !== "changed" || !r.new_doc_id) continue;
        try {
          const { data: doc, error: dErr } = await supabase
            .from("ai_brain_documents")
            .select("id, content, language")
            .eq("id", r.new_doc_id)
            .maybeSingle();
          if (dErr || !doc) {
            console.warn(`[kb-sync] embed: doc ${r.new_doc_id} non trovato`, dErr?.message);
            continue;
          }
          const emb = await generateEmbeddingMultilang(String(doc.content), {
            language: String(doc.language ?? "it"),
          });
          const { error: uErr } = await supabase
            .from("ai_brain_documents")
            .update({ embedding: emb.embedding, embedding_model: emb.model, embedding_dim: emb.dim })
            .eq("id", r.new_doc_id);
          if (uErr) console.warn(`[kb-sync] embed update fail ${r.new_doc_id}:`, uErr.message);
        } catch (e) {
          console.warn(`[kb-sync] embed error ${r.new_doc_id}:`, e instanceof Error ? e.message : e);
        }
      }
    }

    return jsonRes({
      ok: true,
      processed: results.length,
      changed: results.filter(r => r.status === "changed").length,
      no_change: results.filter(r => r.status === "no_change").length,
      errors: results.filter(r => r.status === "error").length,
      results,
      dry_run: dryRun,
    });
  } catch (e) {
    console.error("kb-sync-external-sources error:", e);
    return jsonRes({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});

async function syncOne(
  supabase: ReturnType<typeof createClient>,
  src: ExternalSource,
  dryRun: boolean,
): Promise<SyncResult> {
  const t0 = Date.now();
  try {
    // 1. Fetch
    const res = await fetchWithRetryAndTimeout(src.url, {
      method: "GET",
      headers: { "User-Agent": "EdiliziaInCloud-KbSync/1.0 (+https://www.ediliziaincloud.com)" },
      timeoutMs: 30_000,
    }, 2);
    if (!res.ok) {
      throw new Error(`HTTP ${res.status} fetching ${src.url}`);
    }
    const raw = await res.text();

    // 2. Estrai content secondo strategy
    const extracted = extractContent(raw, src.scrape_strategy, src.scrape_config);
    if (!extracted || extracted.trim().length < 20) {
      throw new Error(`Estrazione vuota o troppo corta (${extracted?.length ?? 0} chars)`);
    }

    // Normalizza whitespace per stabilità hash
    const normalized = extracted.replace(/\s+/g, " ").trim();
    const hash = await contentHash(normalized);

    // 3. Confronto con hash precedente
    if (src.last_content_hash && src.last_content_hash === hash) {
      if (!dryRun) {
        await supabase.rpc("kb_external_source_mark_unchanged", { p_source_id: src.id });
      }
      return {
        source_id: src.id,
        source_name: src.name,
        status: "no_change",
        hash,
        content_chars: normalized.length,
        duration_ms: Date.now() - t0,
      };
    }

    // 4. Cambio rilevato → apply_change
    if (dryRun) {
      return {
        source_id: src.id,
        source_name: src.name,
        status: "changed",
        hash,
        content_chars: normalized.length,
        duration_ms: Date.now() - t0,
      };
    }

    const title = String(src.scrape_config?.title ?? src.name).slice(0, 200);
    const { data: applyRes, error: applyErr } = await supabase.rpc("kb_external_source_apply_change", {
      p_source_id: src.id,
      p_new_content: normalized,
      p_new_hash: hash,
      p_new_title: title,
      p_new_metadata: {
        url: src.url,
        scrape_strategy: src.scrape_strategy,
        synced_at: new Date().toISOString(),
      },
    });
    if (applyErr) throw new Error(`apply_change RPC: ${applyErr.message}`);

    const row = (applyRes ?? [])[0] as { new_doc_id: string; replaced_doc_id: string | null } | undefined;
    return {
      source_id: src.id,
      source_name: src.name,
      status: "changed",
      hash,
      new_doc_id: row?.new_doc_id,
      replaced_doc_id: row?.replaced_doc_id ?? undefined,
      content_chars: normalized.length,
      duration_ms: Date.now() - t0,
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (!dryRun) {
      await supabase.rpc("kb_external_source_mark_error", {
        p_source_id: src.id,
        p_error: msg,
      });
    }
    return {
      source_id: src.id,
      source_name: src.name,
      status: "error",
      error: msg,
      duration_ms: Date.now() - t0,
    };
  }
}

/**
 * Estrai contenuto rilevante dal raw response secondo strategy.
 *
 * Config per strategy:
 *   http_regex:    { pattern: string, flags?: string, group?: number=1 }
 *   http_selector: { selector: 'tag.class' | '#id' | 'tag[attr="x"]' (limited) }
 *   http_json:     { path: string (es. "data.items[0].text"), join?: string }
 *   rss:           { max_items?: number=10, fields?: ['title','description','link'] }
 *   full_text:     {} → strip HTML/script/style, ritorna body text
 */
function extractContent(raw: string, strategy: string, config: Record<string, unknown>): string {
  switch (strategy) {
    case "http_regex": {
      const pattern = String(config.pattern ?? "");
      const flags = String(config.flags ?? "is");
      const group = Number(config.group ?? 1);
      if (!pattern) throw new Error("regex pattern mancante");
      const re = new RegExp(pattern, flags);
      const m = re.exec(raw);
      if (!m) throw new Error(`regex no match: /${pattern}/${flags}`);
      return stripHtml(m[group] ?? m[0]);
    }
    case "http_selector": {
      // Mini-selector: cerca primo match di una classe o id semplice.
      // Per casi complessi, preferire http_regex.
      const selector = String(config.selector ?? "");
      if (!selector) throw new Error("selector mancante");
      const fragment = simpleSelectorExtract(raw, selector);
      if (!fragment) throw new Error(`selector no match: ${selector}`);
      return stripHtml(fragment);
    }
    case "http_json": {
      const path = String(config.path ?? "");
      const join = String(config.join ?? "\n");
      if (!path) throw new Error("json path mancante");
      const obj = JSON.parse(raw);
      const value = jsonPath(obj, path);
      if (Array.isArray(value)) return value.map(v => String(v)).join(join);
      return String(value ?? "");
    }
    case "rss": {
      const maxItems = Number(config.max_items ?? 10);
      const fields = (config.fields as string[] | undefined) ?? ["title", "description", "link"];
      const items = parseRss(raw, maxItems, fields);
      return items.join("\n\n");
    }
    case "full_text":
    default:
      return stripHtml(raw);
  }
}

function stripHtml(html: string): string {
  return html
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, " ")
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, " ")
    .replace(/<noscript\b[^<]*(?:(?!<\/noscript>)<[^<]*)*<\/noscript>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/\s+/g, " ")
    .trim();
}

function simpleSelectorExtract(html: string, selector: string): string | null {
  // Supporta: "#id" e ".class" (primo match)
  if (selector.startsWith("#")) {
    const id = selector.slice(1);
    const re = new RegExp(`<([a-z0-9]+)[^>]*\\bid=["']${escapeRe(id)}["'][^>]*>([\\s\\S]*?)</\\1>`, "i");
    const m = re.exec(html);
    return m ? m[2] : null;
  }
  if (selector.startsWith(".")) {
    const cls = selector.slice(1);
    const re = new RegExp(`<([a-z0-9]+)[^>]*\\bclass=["'][^"']*\\b${escapeRe(cls)}\\b[^"']*["'][^>]*>([\\s\\S]*?)</\\1>`, "i");
    const m = re.exec(html);
    return m ? m[2] : null;
  }
  // Tag bare: "main" / "article"
  const re = new RegExp(`<${escapeRe(selector)}[^>]*>([\\s\\S]*?)</${escapeRe(selector)}>`, "i");
  const m = re.exec(html);
  return m ? m[1] : null;
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function jsonPath(obj: unknown, path: string): unknown {
  const parts = path.split(/\.|\[(\d+)\]/).filter(p => p !== undefined && p !== "");
  let cur: unknown = obj;
  for (const part of parts) {
    if (cur == null) return undefined;
    if (/^\d+$/.test(part)) {
      cur = (cur as unknown[])[Number(part)];
    } else {
      cur = (cur as Record<string, unknown>)[part];
    }
  }
  return cur;
}

function parseRss(xml: string, maxItems: number, fields: string[]): string[] {
  const items: string[] = [];
  const itemRe = /<item\b[^>]*>([\s\S]*?)<\/item>/gi;
  let m: RegExpExecArray | null;
  while ((m = itemRe.exec(xml)) !== null && items.length < maxItems) {
    const inner = m[1];
    const parts: string[] = [];
    for (const field of fields) {
      const fre = new RegExp(`<${field}\\b[^>]*>([\\s\\S]*?)</${field}>`, "i");
      const fm = fre.exec(inner);
      if (fm) parts.push(`${field}: ${stripHtml(unwrapCdata(fm[1]))}`);
    }
    if (parts.length) items.push(parts.join("\n"));
  }
  return items;
}

function unwrapCdata(s: string): string {
  return s.replace(/^\s*<!\[CDATA\[/, "").replace(/\]\]>\s*$/, "");
}

function jsonRes(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}
