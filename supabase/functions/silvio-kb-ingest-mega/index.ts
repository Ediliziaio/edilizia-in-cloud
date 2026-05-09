/**
 * silvio-kb-ingest-mega — Ingestion del MEGA_CERVELLO_SUPERADMIN.md.
 *
 * Body opzionale:
 *   { content: string }  ← markdown completo del file (se invocato manualmente)
 *
 * Se body vuoto: legge da KB stored memo (Ruflo memory key 'mega-cervello-content')
 * o ritorna errore "passa content nel body".
 *
 * Strategia chunking:
 *   1. Split per sezioni livello 1: `# NN — TITLE` (00..21 + APPENDICE A/B/C)
 *   2. Per ogni sezione, split per sub-sezioni `## N.M` (es. "## 1.2")
 *   3. Ogni sub-sezione = 1 chunk (mantiene coerenza semantica)
 *   4. Se sub-sezione > 4000 char → split ulteriore per paragraph
 *   5. Embed via OpenAI text-embedding-3-small + insert in ai_brain_documents
 *      con scope='silvio_admin', persona_keys popolato dal mapping section→personas
 *
 * Auth: super_admin only.
 *
 * Idempotenza: usa source_path + content_hash. Se chunk identico esiste già, skip.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { generateEmbedding, contentHash } from "../_shared/brainEmbed.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// ─── Mapping: sezione MEGA → personas che la usano ─────────────────────────
const SECTION_PERSONAS: Record<string, { personas: string[]; title: string }> = {
  "00": { personas: [], title: "Fondamenta (universale)" },
  "01": { personas: ["beatrice", "federico"], title: "SaaS Metrics & Unit Economics" },
  "02": { personas: ["federico", "vittorio", "marco"], title: "Strategie di crescita" },
  "03": { personas: ["marco"], title: "Vendita B2B SaaS Italia" },
  "04": { personas: ["tommaso"], title: "Outbound & Paid Acquisition" },
  "05": { personas: ["sofia"], title: "Marketing & Brand" },
  "06": { personas: ["elena"], title: "Customer Success & Retention" },
  "07": { personas: ["giorgio"], title: "Support & Risposte clienti" },
  "08": { personas: ["chiara"], title: "Product Management" },
  "09": { personas: ["luca"], title: "Engineering Discipline" },
  "10": { personas: ["davide"], title: "Security" },
  "11": { personas: ["eleonora"], title: "Compliance: GDPR + AI Act" },
  "12": { personas: ["roberta"], title: "Amministrazione & Fiscale Italia" },
  "13": { personas: ["vittorio"], title: "Strategic Frameworks" },
  "14": { personas: ["antonio"], title: "Edilizia Italiana" },
  "15": { personas: ["laura"], title: "HR & People Ops" },
  "16": { personas: ["alessandro"], title: "AI/ML Applied" },
  "17": { personas: ["giulia"], title: "Data Analysis & SQL" },
  "18": { personas: ["ferrari"], title: "Legal Essentials B2B SaaS" },
  "19": { personas: ["matteo"], title: "DevOps / SRE" },
  "20": { personas: ["gabriele"], title: "Partnerships & BD" },
  "21": { personas: ["valentina"], title: "Onboarding cliente" },
  "A":  { personas: [], title: "Crisis Playbooks (universale)" },
  "B":  { personas: ["vittorio"], title: "Decision Frameworks" },
  "C":  { personas: ["sofia", "tommaso", "giorgio", "marco"], title: "Template Library" },
};

interface Chunk {
  section: string;       // '01' | 'A' | 'B' | 'C'
  subsection: string;    // '1.2' | '5.4' | 'A.1'
  title: string;         // 'Le 8 metriche che contano davvero'
  content: string;
  personas: string[];
}

const MAX_CHUNK_CHARS = 4000;
const MIN_CHUNK_CHARS = 80;

function parseMega(md: string): Chunk[] {
  const chunks: Chunk[] = [];

  // Split per sezione livello 1: # NN — ... oppure # APPENDICE X — ...
  // Lookahead per non perdere il delimitatore
  const sectionRe = /(?=^#\s+(?:[\w]{1,3})\s+—\s+|^#\s+APPENDICE\s+[A-Z]\s+—\s+)/gm;
  const sections = md.split(sectionRe).filter((s) => s.trim().length > 0);

  for (const section of sections) {
    // Header section: "# 01 — SAAS METRICS & UNIT ECONOMICS"
    // o "# APPENDICE A — CRISIS PLAYBOOKS"
    const headerMatch = section.match(/^#\s+(\S{1,12}(?:\s+\S+)?)\s+—\s+([^\n]+)/);
    if (!headerMatch) continue;

    let sectionId = headerMatch[1].trim();
    // Normalizza: "APPENDICE A" → "A"
    if (sectionId.startsWith("APPENDICE")) {
      sectionId = sectionId.replace(/APPENDICE\s+/, "").trim();
    }

    const personas = SECTION_PERSONAS[sectionId]?.personas ?? [];

    // Split per sub-sezione livello 2: ## N.M ... oppure ## A.N
    const subsectionRe = /(?=^##\s+(?:\d+\.\d+|[A-Z]\.\d+)\s+)/gm;
    const subsections = section.split(subsectionRe).filter((s) => s.trim().length > 0);

    if (subsections.length <= 1) {
      // Section senza sub-sezioni: 1 chunk solo
      const content = section.trim();
      if (content.length >= MIN_CHUNK_CHARS) {
        chunks.push({
          section: sectionId,
          subsection: "intro",
          title: headerMatch[2].trim(),
          content: content.slice(0, MAX_CHUNK_CHARS),
          personas,
        });
      }
      continue;
    }

    // Primo elemento di subsections è di solito il blocco prima della prima ##
    // (intro section). Lo trattiamo come "intro".
    for (let i = 0; i < subsections.length; i++) {
      const sub = subsections[i].trim();
      if (sub.length < MIN_CHUNK_CHARS) continue;

      let subsection: string;
      let title: string;
      let content: string;

      const subHeaderMatch = sub.match(/^##\s+(\d+\.\d+|[A-Z]\.\d+)\s+([^\n]+)/);
      if (subHeaderMatch) {
        subsection = subHeaderMatch[1].trim();
        title = subHeaderMatch[2].trim();
        content = sub;
      } else if (i === 0) {
        // Block prima della prima ## = intro della section
        subsection = "intro";
        title = `${headerMatch[2].trim()} (intro)`;
        content = sub;
      } else {
        continue;
      }

      // Se il chunk è troppo grosso (> MAX_CHUNK_CHARS), splittalo per paragrafi
      if (content.length <= MAX_CHUNK_CHARS) {
        chunks.push({ section: sectionId, subsection, title, content, personas });
      } else {
        // Split per blocchi (paragrafi separati da \n\n)
        const paragraphs = content.split(/\n\n+/);
        let buffer = "";
        let partNum = 1;
        for (const p of paragraphs) {
          if ((buffer + "\n\n" + p).length > MAX_CHUNK_CHARS && buffer.length > 0) {
            chunks.push({
              section: sectionId,
              subsection: `${subsection}-p${partNum}`,
              title: `${title} (parte ${partNum})`,
              content: buffer.trim(),
              personas,
            });
            buffer = p;
            partNum += 1;
          } else {
            buffer = buffer ? `${buffer}\n\n${p}` : p;
          }
        }
        if (buffer.trim().length >= MIN_CHUNK_CHARS) {
          chunks.push({
            section: sectionId,
            subsection: `${subsection}-p${partNum}`,
            title: `${title} (parte ${partNum})`,
            content: buffer.trim(),
            personas,
          });
        }
      }
    }
  }

  return chunks;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });

  try {
    // Auth: super_admin via JWT, oppure internal call via SILVIO_INGEST_SECRET
    const authHeader = req.headers.get("Authorization") ?? "";
    const ingestSecret = req.headers.get("x-ingest-secret");
    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    const expectedSecret = Deno.env.get("SILVIO_INGEST_SECRET") ?? "";
    const isInternal = expectedSecret.length > 8 && ingestSecret === expectedSecret;

    if (!isInternal) {
      const userRes = await supabase.auth.getUser(authHeader.replace("Bearer ", ""));
      const userId = userRes.data?.user?.id;
      if (!userId) return jsonRes({ error: "Unauthorized" }, 401);

      const { data: roleData } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", userId)
        .eq("role", "super_admin")
        .maybeSingle();
      if (!roleData) return jsonRes({ error: "Permesso negato: solo super_admin" }, 403);
    }

    const body = await req.json().catch(() => ({}));
    let content: string = body.content ?? "";
    const replaceExisting: boolean = body.replace_existing === true;
    const storagePath: string = body.storage_path ?? "admin/mega-cervello.md";
    const storageBucket: string = body.storage_bucket ?? "silvio-uploads";

    // Se content vuoto, leggi da Storage (workaround per file grossi via gateway)
    if (!content || content.length < 1000) {
      const { data: blob, error: dlErr } = await supabase.storage
        .from(storageBucket)
        .download(storagePath);
      if (dlErr || !blob) {
        return jsonRes({
          error: `Body content vuoto e storage download failed: ${dlErr?.message ?? "no blob"}`,
          tried_path: `${storageBucket}/${storagePath}`,
        }, 400);
      }
      content = await blob.text();
    }

    if (!content || content.length < 1000) {
      return jsonRes({ error: "Content vuoto o troppo corto." }, 400);
    }

    // Parse → chunks
    const chunks = parseMega(content);
    if (chunks.length === 0) {
      return jsonRes({ error: "Nessun chunk estratto. Markdown non riconosciuto." }, 400);
    }

    // Se replace=true, soft-delete tutti i chunk esistenti del MEGA
    if (replaceExisting) {
      await supabase
        .from("ai_brain_documents")
        .update({ deleted_at: new Date().toISOString() })
        .eq("scope", "silvio_admin")
        .eq("source_path", "MEGA_CERVELLO_SUPERADMIN.md")
        .is("deleted_at", null);
    }

    // Embed + insert in batch
    const results = {
      total: chunks.length,
      inserted: 0,
      skipped_dedup: 0,
      errors: 0,
      sections: new Set<string>(),
    };

    for (const chunk of chunks) {
      try {
        const fullContent = `# ${chunk.title}\n\n${chunk.content}`;
        const hash = await contentHash(fullContent);

        // Dedup check
        const { data: existing } = await supabase
          .from("ai_brain_documents")
          .select("id")
          .eq("scope", "silvio_admin")
          .eq("source_path", "MEGA_CERVELLO_SUPERADMIN.md")
          .eq("source_hash", hash)
          .is("deleted_at", null)
          .maybeSingle();
        if (existing) {
          results.skipped_dedup += 1;
          continue;
        }

        const embedding = await generateEmbedding(fullContent);

        const { error: insErr } = await supabase.from("ai_brain_documents").insert({
          scope: "silvio_admin",
          source_type: "mega_cervello",
          source_path: "MEGA_CERVELLO_SUPERADMIN.md",
          source_hash: hash,
          title: chunk.title,
          content: fullContent,
          embedding,
          category: chunk.section,
          category_path: `silvio_admin/${chunk.section}`,
          kb_section: chunk.section,
          kb_subsection: chunk.subsection,
          persona_keys: chunk.personas,
          embedding_model: "text-embedding-3-small",
          embedding_dim: 1536,
          last_verified_at: new Date().toISOString(),
          metadata: {
            ingested_from: "mega_cervello",
            section_personas: chunk.personas,
          },
        });

        if (insErr) {
          console.error(`[silvio-kb-ingest-mega] insert error sec ${chunk.section}.${chunk.subsection}:`, insErr.message);
          results.errors += 1;
          continue;
        }

        results.inserted += 1;
        results.sections.add(chunk.section);
      } catch (e) {
        console.error(`[silvio-kb-ingest-mega] chunk error:`, e);
        results.errors += 1;
      }
    }

    return jsonRes({
      ok: true,
      summary: {
        total_chunks: results.total,
        inserted: results.inserted,
        skipped_dedup: results.skipped_dedup,
        errors: results.errors,
        sections_covered: Array.from(results.sections),
      },
    });
  } catch (e) {
    console.error("[silvio-kb-ingest-mega] fatal:", e);
    return jsonRes({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});

function jsonRes(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}
