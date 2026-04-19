// FASE 8.2 + 8.bis — Edge Function: genera-embeddings-catalogo
//
// Input:
//   { company_id: string, mode?: "all" | "missing" | "single", article_id?: string,
//     targets?: ("articles" | "families" | "tariffe")[] }
//     mode='missing' (default): solo righe con embedding NULL
//     mode='all': rigenera TUTTI gli embeddings (costoso)
//     mode='single': solo article_id (vale solo per articles)
//     targets: default ["articles","families","tariffe"]
// Output:
//   { ok: true, processed: { articles, families, tariffe },
//                skipped:   { articles, families, tariffe },
//                errors:    { articles, families, tariffe } }
//
// Genera embeddings OpenAI text-embedding-3-small (1536 dim) su:
//   - article_templates.embedding (FASE 8.2)
//   - article_families.embedding   (FASE 8.bis)
//   - tariffe_aziendali.embedding  (FASE 8.bis)

import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders } from "../_shared/headers.ts";

const EMBEDDING_MODEL = "text-embedding-3-small";
const EMBEDDING_DIM = 1536;
// Addendum P2-02: aumento da 50 a 100 inputs per chiamata OpenAI.
// text-embedding-3-small supporta fino a 2048 inputs/req; 100 è il
// sweet-spot tra throughput (meno round-trip) e rischio timeout OpenAI
// per cataloghi grandi. Ogni batch resta sotto i limiti soft rate-limit.
const BATCH_SIZE = 100;

type Mode = "all" | "missing" | "single";
type Target = "articles" | "families" | "tariffe";

interface ArticleRow {
  id: string;
  name: string;
  sku: string | null;
  description: string | null;
  modalita_prezzo: string | null;
  unit_of_measure: string | null;
  categoria_nome?: string | null;
}

interface FamilyRow {
  id: string;
  nome: string;
  descrizione: string | null;
  modalita_prezzo_base: string | null;
  unit_of_measure: string | null;
  vertical: string | null;
  categoria_nome?: string | null;
  axes_text?: string | null;
}

interface TariffaRow {
  id: string;
  nome: string;
  tipo: string | null;
  descrizione: string | null;
  unita: string | null;
  unita_fatturazione: string | null;
  vertical_associato: string | null;
}

function buildArticleText(art: ArticleRow): string {
  const parts: string[] = [art.name];
  if (art.sku) parts.push(`SKU: ${art.sku}`);
  if (art.description) parts.push(art.description);
  if (art.modalita_prezzo) parts.push(`modalità: ${art.modalita_prezzo}`);
  if (art.unit_of_measure) parts.push(`UM: ${art.unit_of_measure}`);
  if (art.categoria_nome) parts.push(`categoria: ${art.categoria_nome}`);
  return parts.join(" | ").slice(0, 8000);
}

function buildFamilyText(fam: FamilyRow): string {
  const parts: string[] = [fam.nome];
  if (fam.categoria_nome) parts.push(`categoria: ${fam.categoria_nome}`);
  if (fam.descrizione) parts.push(fam.descrizione);
  if (fam.modalita_prezzo_base) parts.push(`base: ${fam.modalita_prezzo_base}`);
  if (fam.unit_of_measure) parts.push(`UM: ${fam.unit_of_measure}`);
  if (fam.vertical) parts.push(`vertical: ${fam.vertical}`);
  if (fam.axes_text) parts.push(`assi: ${fam.axes_text}`);
  return parts.join(" | ").slice(0, 8000);
}

function buildTariffaText(tar: TariffaRow): string {
  const parts: string[] = [tar.nome];
  if (tar.tipo) parts.push(`tipo: ${tar.tipo}`);
  if (tar.descrizione) parts.push(tar.descrizione);
  if (tar.unita) parts.push(`unità: ${tar.unita}`);
  if (tar.unita_fatturazione && tar.unita_fatturazione !== tar.unita) {
    parts.push(`fatturata in: ${tar.unita_fatturazione}`);
  }
  if (tar.vertical_associato) parts.push(`vertical: ${tar.vertical_associato}`);
  return parts.join(" | ").slice(0, 8000);
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

/**
 * Embedding loop generico per una tabella.
 * Aggiorna `tableName.embedding` + `embedding_updated_at`.
 */
async function embedAndUpdate<T extends { id: string }>(
  admin: SupabaseClient,
  tableName: string,
  rows: T[],
  textBuilder: (row: T) => string,
  openaiKey: string,
): Promise<{ processed: number; errors: number }> {
  let processed = 0;
  let errors = 0;
  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE);
    const texts = batch.map(textBuilder);
    try {
      const embeddings = await openaiEmbed(texts, openaiKey);
      if (embeddings.length !== batch.length) {
        errors += batch.length;
        continue;
      }
      for (let j = 0; j < batch.length; j++) {
        // `tableName` è ristretto a una di 3 tabelle reali tutte con colonna
        // `embedding` + `embedding_updated_at` + PK `id`. Il cast `as never`
        // salta il narrowing di Supabase (che non può unificare i 3 Row type)
        // ma resta type-safe su nomi colonne perché le tre tabelle li
        // condividono per design (migration 20260915000003 + affini).
        const { error: upErr } = await admin
          .from(tableName as never)
          .update({
            embedding: JSON.stringify(embeddings[j]),
            embedding_updated_at: new Date().toISOString(),
          } as never)
          .eq("id" as never, batch[j].id);
        if (upErr) {
          errors += 1;
        } else {
          processed += 1;
        }
      }
    } catch (e) {
      errors += batch.length;
      console.error(`[${tableName}] Batch ${i}/${rows.length} fallito:`, e);
    }
  }
  return { processed, errors };
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
      | { company_id?: unknown; mode?: unknown; article_id?: unknown; targets?: unknown }
      | null;
    if (!body) return json({ error: "Body JSON non valido" }, 400, req);

    const companyId = typeof body.company_id === "string" ? body.company_id : "";
    const mode: Mode =
      body.mode === "all" || body.mode === "single" ? body.mode : "missing";
    const articleId = typeof body.article_id === "string" ? body.article_id : null;
    if (!companyId) return json({ error: "company_id mancante" }, 400, req);
    if (mode === "single" && !articleId) {
      return json({ error: "article_id richiesto con mode=single" }, 400, req);
    }
    const allowedTargets: Target[] = ["articles", "families", "tariffe"];
    const targets: Target[] = Array.isArray(body.targets)
      ? (body.targets as unknown[]).filter((t): t is Target =>
          typeof t === "string" && (allowedTargets as string[]).includes(t),
        )
      : allowedTargets;

    // mode=single ha senso solo per articles: forza targets=["articles"]
    const effectiveTargets: Target[] =
      mode === "single" ? ["articles"] : targets;

    const admin = createClient(supabaseUrl, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    await verifyAccess(admin, userId, companyId);

    const result = {
      processed: { articles: 0, families: 0, tariffe: 0 },
      skipped: { articles: 0, families: 0, tariffe: 0 },
      errors: { articles: 0, families: 0, tariffe: 0 },
    };

    // ─── ARTICLES ───────────────────────────────────────────────────────────
    if (effectiveTargets.includes("articles")) {
      // Build-then-narrow pattern: niente `let: any` — il PostgrestFilterBuilder
      // conserva il tipo corretto grazie al chain ternario.
      const baseQ = admin
        .from("article_templates")
        .select("id,name,sku,description,modalita_prezzo,unit_of_measure,categoria_id,embedding")
        .eq("company_id", companyId);
      const q = mode === "single"
        ? baseQ.eq("id", articleId!)
        : mode === "missing"
        ? baseQ.is("embedding", null)
        : baseQ;
      const { data: articles, error: artErr } = await q;
      if (artErr) throw new Error(`Query article_templates: ${artErr.message}`);
      const arts = (articles ?? []) as Array<ArticleRow & { categoria_id: string | null }>;

      const catIds = Array.from(
        new Set(arts.map((a) => a.categoria_id).filter(Boolean)),
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
      const enriched = arts.map((a) => ({
        ...a,
        categoria_nome: a.categoria_id ? categoriaMap.get(a.categoria_id) ?? null : null,
      }));
      const { processed, errors } = await embedAndUpdate(
        admin,
        "article_templates",
        enriched,
        buildArticleText,
        openaiKey,
      );
      result.processed.articles = processed;
      result.errors.articles = errors;
      result.skipped.articles = enriched.length - processed - errors;
    }

    // ─── FAMILIES ───────────────────────────────────────────────────────────
    if (effectiveTargets.includes("families")) {
      const baseQf = admin
        .from("article_families")
        .select("id,nome,descrizione,modalita_prezzo_base,unit_of_measure,vertical,categoria_id,embedding")
        .eq("company_id", companyId)
        .eq("attivo", true);
      const qf = mode === "missing" ? baseQf.is("embedding", null) : baseQf;
      const { data: families, error: famErr } = await qf;
      if (famErr) throw new Error(`Query article_families: ${famErr.message}`);
      const fams = (families ?? []) as Array<FamilyRow & { categoria_id: string | null }>;

      // Categorie listino
      const catIds = Array.from(
        new Set(fams.map((f) => f.categoria_id).filter(Boolean)),
      ) as string[];
      const categoriaMap = new Map<string, string>();
      if (catIds.length > 0) {
        const { data: cats } = await admin
          .from("listino_categorie")
          .select("id,nome")
          .in("id", catIds);
        for (const c of (cats ?? []) as { id: string; nome: string }[]) {
          categoriaMap.set(c.id, c.nome);
        }
      }

      // Assi+valori per costruire axes_text
      const famIds = fams.map((f) => f.id);
      const axesByFamily = new Map<string, string[]>();
      if (famIds.length > 0) {
        const { data: axes } = await admin
          .from("article_family_axes")
          .select("id,family_id,nome,codice,sort_order")
          .in("family_id", famIds);
        const axisIds = (axes ?? []).map((a: { id: string }) => a.id);
        const valuesByAxis = new Map<string, string[]>();
        if (axisIds.length > 0) {
          const { data: vals } = await admin
            .from("article_family_axis_values")
            .select("axis_id,label,attivo")
            .in("axis_id", axisIds)
            .eq("attivo", true);
          for (const v of (vals ?? []) as { axis_id: string; label: string }[]) {
            const arr = valuesByAxis.get(v.axis_id) ?? [];
            arr.push(v.label);
            valuesByAxis.set(v.axis_id, arr);
          }
        }
        for (const a of (axes ?? []) as {
          id: string;
          family_id: string;
          nome: string;
          codice: string;
        }[]) {
          const labels = valuesByAxis.get(a.id) ?? [];
          const desc = `${a.nome} [${labels.join("/")}]`;
          const arr = axesByFamily.get(a.family_id) ?? [];
          arr.push(desc);
          axesByFamily.set(a.family_id, arr);
        }
      }

      const enriched = fams.map((f) => ({
        ...f,
        categoria_nome: f.categoria_id ? categoriaMap.get(f.categoria_id) ?? null : null,
        axes_text: (axesByFamily.get(f.id) ?? []).join(" · ") || null,
      }));
      const { processed, errors } = await embedAndUpdate(
        admin,
        "article_families",
        enriched,
        buildFamilyText,
        openaiKey,
      );
      result.processed.families = processed;
      result.errors.families = errors;
      result.skipped.families = enriched.length - processed - errors;
    }

    // ─── TARIFFE ────────────────────────────────────────────────────────────
    if (effectiveTargets.includes("tariffe")) {
      const baseQt = admin
        .from("tariffe_aziendali")
        .select(
          "id,nome,tipo,descrizione,unita,unita_fatturazione,vertical_associato,attiva,embedding",
        )
        .eq("company_id", companyId)
        .eq("attiva", true);
      const qt = mode === "missing" ? baseQt.is("embedding", null) : baseQt;
      const { data: tariffe, error: tarErr } = await qt;
      if (tarErr) throw new Error(`Query tariffe_aziendali: ${tarErr.message}`);
      const tars = (tariffe ?? []) as TariffaRow[];

      const { processed, errors } = await embedAndUpdate(
        admin,
        "tariffe_aziendali",
        tars,
        buildTariffaText,
        openaiKey,
      );
      result.processed.tariffe = processed;
      result.errors.tariffe = errors;
      result.skipped.tariffe = tars.length - processed - errors;
    }

    return json({ ok: true, ...result }, 200, req);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Errore sconosciuto";
    const status = message.startsWith("Non autorizzato") ? 403 : 500;
    return json({ error: message }, status, req);
  }
});
