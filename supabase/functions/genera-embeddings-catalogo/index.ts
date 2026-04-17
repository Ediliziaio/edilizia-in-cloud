// FASE 8.2 — Edge Function: genera-embeddings-catalogo
//
// Input:
//   { company_id: string, mode?: "all" | "missing" | "single", article_id?: string }
//     mode='missing' (default): solo prodotti con embedding NULL
//     mode='all': rigenera TUTTI gli embeddings della azienda (costoso)
//     mode='single': solo il prodotto `article_id`
// Output:
//   { ok: true, processed: number, skipped: number, errors: number }
//
// Genera embeddings OpenAI text-embedding-3-small (1536 dim) sui prodotti
// del catalogo e li salva in article_templates.embedding.
//
// Batch size 50 per contenere sia la OpenAI request sia la nostra RAM.

import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders } from "../_shared/headers.ts";

const EMBEDDING_MODEL = "text-embedding-3-small";
const EMBEDDING_DIM = 1536;
const BATCH_SIZE = 50;

interface ArticleRow {
  id: string;
  name: string;
  sku: string | null;
  description: string | null;
  modalita_prezzo: string | null;
  unit_of_measure: string | null;
  categoria_nome?: string | null;
}

/** Compone il testo da embeddare: nome + sku + descrizione + metadata. */
function buildEmbeddingText(art: ArticleRow): string {
  const parts: string[] = [art.name];
  if (art.sku) parts.push(`SKU: ${art.sku}`);
  if (art.description) parts.push(art.description);
  if (art.modalita_prezzo) parts.push(`modalità: ${art.modalita_prezzo}`);
  if (art.unit_of_measure) parts.push(`UM: ${art.unit_of_measure}`);
  if (art.categoria_nome) parts.push(`categoria: ${art.categoria_nome}`);
  return parts.join(" | ").slice(0, 8000); // safety cap
}

async function openaiEmbed(texts: string[], apiKey: string): Promise<number[][]> {
  const res = await fetch("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: EMBEDDING_MODEL,
      input: texts,
      dimensions: EMBEDDING_DIM,
    }),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`OpenAI embeddings API error ${res.status}: ${err}`);
  }
  const data = await res.json();
  return (data.data ?? []).map((e: { embedding: number[] }) => e.embedding);
}

function json(data: unknown, status: number, req: Request): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
  });
}

async function verifyAccess(
  supabase: SupabaseClient,
  userId: string,
  companyId: string,
): Promise<void> {
  const { data: roles } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userId);
  const isSuperAdmin = Array.isArray(roles) && roles.some((r) => r.role === "super_admin");
  if (isSuperAdmin) return;

  const { data: profile } = await supabase
    .from("profiles")
    .select("company_id")
    .eq("id", userId)
    .maybeSingle();
  if (profile?.company_id === companyId) return;

  const { data: mca } = await supabase
    .from("multi_company_access")
    .select("id")
    .eq("user_id", userId)
    .eq("company_id", companyId)
    .maybeSingle();
  if (mca) return;

  const { data: imp } = await supabase
    .from("active_impersonations")
    .select("id")
    .eq("admin_user_id", userId)
    .eq("target_company_id", companyId)
    .gt("expires_at", new Date().toISOString())
    .maybeSingle();
  if (imp) return;

  throw new Error("Non autorizzato: accesso negato a questa azienda");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: getCorsHeaders(req) });
  }
  if (req.method !== "POST") {
    return json({ error: "Metodo non supportato" }, 405, req);
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const openaiKey = Deno.env.get("OPENAI_API_KEY");
    if (!openaiKey) {
      return json(
        { error: "OPENAI_API_KEY non configurata nelle env vars dell'edge function" },
        500,
        req,
      );
    }

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Token mancante" }, 401, req);
    const jwt = authHeader.replace(/^Bearer\s+/i, "");
    const anonClient = createClient(supabaseUrl, anonKey);
    const { data: userData, error: userErr } = await anonClient.auth.getUser(jwt);
    if (userErr || !userData.user) return json({ error: "Token non valido" }, 401, req);
    const userId = userData.user.id;

    const body = (await req.json().catch(() => null)) as
      | { company_id?: unknown; mode?: unknown; article_id?: unknown }
      | null;
    if (!body) return json({ error: "Body JSON non valido" }, 400, req);

    const companyId = typeof body.company_id === "string" ? body.company_id : "";
    const mode =
      body.mode === "all" || body.mode === "single" ? body.mode : "missing";
    const articleId = typeof body.article_id === "string" ? body.article_id : null;
    if (!companyId) return json({ error: "company_id mancante" }, 400, req);
    if (mode === "single" && !articleId) {
      return json({ error: "article_id richiesto con mode=single" }, 400, req);
    }

    const admin = createClient(supabaseUrl, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    await verifyAccess(admin, userId, companyId);

    // Query articles by mode
    // deno-lint-ignore no-explicit-any
    let q: any = admin
      .from("article_templates")
      .select("id,name,sku,description,modalita_prezzo,unit_of_measure,categoria_id,embedding")
      .eq("company_id", companyId);
    if (mode === "single") {
      q = q.eq("id", articleId);
    } else if (mode === "missing") {
      q = q.is("embedding", null);
    }
    const { data: articles, error: artErr } = await q;
    if (artErr) throw new Error(`Query article_templates: ${artErr.message}`);

    if (!articles || articles.length === 0) {
      return json({ ok: true, processed: 0, skipped: 0, errors: 0 }, 200, req);
    }

    // Preload categorie per nome (una sola query)
    const catIds = Array.from(
      new Set(articles.map((a: { categoria_id: string | null }) => a.categoria_id).filter(Boolean)),
    ) as string[];
    const categoriaMap = new Map<string, string>();
    if (catIds.length > 0) {
      const { data: cats } = await admin
        .from("product_categories")
        .select("id,name")
        .in("id", catIds);
      for (const c of (cats ?? []) as { id: string; name: string }[]) {
        categoriaMap.set(c.id, c.name);
      }
    }

    let processed = 0;
    let skipped = 0;
    let errors = 0;

    // Batch processing
    for (let i = 0; i < articles.length; i += BATCH_SIZE) {
      const batch = articles.slice(i, i + BATCH_SIZE) as Array<
        ArticleRow & { categoria_id: string | null }
      >;
      const texts = batch.map((a) =>
        buildEmbeddingText({
          ...a,
          categoria_nome: a.categoria_id ? categoriaMap.get(a.categoria_id) ?? null : null,
        }),
      );
      try {
        const embeddings = await openaiEmbed(texts, openaiKey);
        if (embeddings.length !== batch.length) {
          errors += batch.length;
          continue;
        }
        // Update rows singolarmente (Supabase non ha UPDATE ... FROM VALUES easy via JS client)
        for (let j = 0; j < batch.length; j++) {
          const emb = embeddings[j];
          const { error: upErr } = await admin
            .from("article_templates")
            .update({
              // Supabase PostgREST serializza gli array come JSON; pgvector accetta il formato
              embedding: JSON.stringify(emb),
              embedding_updated_at: new Date().toISOString(),
            })
            .eq("id", batch[j].id);
          if (upErr) {
            errors += 1;
          } else {
            processed += 1;
          }
        }
      } catch (e) {
        errors += batch.length;
        console.error(`Batch ${i}/${articles.length} fallito:`, e);
      }
    }

    skipped = articles.length - processed - errors;
    return json({ ok: true, processed, skipped, errors }, 200, req);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Errore sconosciuto";
    const status = message.startsWith("Non autorizzato") ? 403 : 500;
    return json({ error: message }, status, req);
  }
});
