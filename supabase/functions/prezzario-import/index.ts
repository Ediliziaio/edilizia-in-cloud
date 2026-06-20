import { getCorsHeaders, errorResponse, jsonResponse } from "../_shared/headers.ts";
import { requireAuth, requireRole } from "../_shared/auth.ts";

/**
 * prezzario-import — ingestione di un prezzario regionale ufficiale nelle
 * tabelle CONDIVISE (prezzario_fonte / prezzario_capitolo / prezzario_voce).
 * Vedi docs/superpowers/specs/2026-06-20-prezzari-regionali-design.md.
 *
 * GATE super_admin (fail-closed): requireRole(... ["super_admin"]) interroga
 * `user_roles` (role='super_admin') E applica l'allowlist email come difesa in
 * profondità (vedi _shared/auth.ts). Solo DOPO il gate si usa il client
 * service-role (RLS bypassata) per scrivere nelle tabelle condivise.
 *
 * Idempotente per (regione, anno, COALESCE(versione,'')): se la fonte esiste,
 * riusa l'id e CANCELLA capitoli+voci esistenti (re-import pulito). La fonte
 * resta in stato 'bozza' — la pubblicazione è un'azione separata, non qui.
 *
 * Body (contratto):
 *   { fonte: { regione, anno, versione, nome, url_fonte, licenza },
 *     capitoli: [{ codice, titolo, livello, ordine, parentCodice }],
 *     voci:     [{ codice, descrizione, unita_misura, prezzo,
 *                  incidenza_manodopera_pct, incidenza_sicurezza_pct,
 *                  capitoloCodice, ordine }] }
 *
 * Risposta: { fonte_id, capitoli_inseriti, voci_inserite, voci_scartate }
 */

interface FonteInput {
  regione: string;
  anno: number;
  versione: string | null;
  nome: string;
  url_fonte: string | null;
  licenza: string | null;
}

interface CapitoloInput {
  codice: string | null;
  titolo: string;
  livello: number;
  ordine: number;
  parentCodice: string | null;
}

interface VoceInput {
  codice: string | null;
  descrizione: string;
  unita_misura: string | null;
  prezzo: number;
  incidenza_manodopera_pct: number | null;
  incidenza_sicurezza_pct: number | null;
  capitoloCodice: string | null;
  ordine: number;
}

interface ImportPayload {
  fonte?: Partial<FonteInput>;
  capitoli?: CapitoloInput[];
  voci?: VoceInput[];
}

// Chunk per bulk insert: sta sotto i limiti di payload/righe di PostgREST.
const INSERT_CHUNK = 500;

function toFiniteNumber(v: unknown): number | null {
  const n = typeof v === "string" ? Number(v) : (v as number);
  return typeof n === "number" && Number.isFinite(n) ? n : null;
}

function toNullableNumber(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  return toFiniteNumber(v);
}

Deno.serve(async (req: Request) => {
  const corsHeaders = getCorsHeaders(req);
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });
  if (req.method !== "POST") return errorResponse("Method not allowed", 405, corsHeaders);

  try {
    // ── 1. Auth + GATE super_admin (fail-closed) ──────────────────────────────
    const { userId, supabaseAdmin } = await requireAuth(req, corsHeaders);
    await requireRole(supabaseAdmin, userId, ["super_admin"], corsHeaders);

    // ── 2. Parse + validazione input ─────────────────────────────────────────
    const body = (await req.json().catch(() => null)) as ImportPayload | null;
    if (!body || typeof body !== "object") {
      return errorResponse("Body JSON mancante o non valido", 400, corsHeaders);
    }

    const fonteIn = body.fonte;
    const regione = typeof fonteIn?.regione === "string" ? fonteIn.regione.trim() : "";
    const anno = toFiniteNumber(fonteIn?.anno);
    const nome = typeof fonteIn?.nome === "string" ? fonteIn.nome.trim() : "";
    if (!regione || anno === null || !nome) {
      return errorResponse("fonte.regione, fonte.anno e fonte.nome sono obbligatori", 400, corsHeaders);
    }

    const capitoliIn = Array.isArray(body.capitoli) ? body.capitoli : [];
    const vociIn = Array.isArray(body.voci) ? body.voci : [];
    if (vociIn.length === 0) {
      return errorResponse("voci deve essere un array non vuoto", 400, corsHeaders);
    }

    const versione =
      typeof fonteIn?.versione === "string" && fonteIn.versione.trim() !== ""
        ? fonteIn.versione.trim()
        : null;
    const urlFonte = typeof fonteIn?.url_fonte === "string" && fonteIn.url_fonte.trim() !== "" ? fonteIn.url_fonte.trim() : null;
    const licenza = typeof fonteIn?.licenza === "string" && fonteIn.licenza.trim() !== "" ? fonteIn.licenza.trim() : null;

    // ── 3. Upsert FONTE su (regione, anno, COALESCE(versione,'')) ─────────────
    // PostgREST non sa eseguire COALESCE nel filtro, quindi distinguo a mano il
    // caso versione=null (IS NULL) da versione valorizzata (eq).
    let fonteQuery = supabaseAdmin
      .from("prezzario_fonte")
      .select("id")
      .eq("regione", regione)
      .eq("anno", anno);
    fonteQuery = versione === null ? fonteQuery.is("versione", null) : fonteQuery.eq("versione", versione);

    const { data: esistente, error: lookupErr } = await fonteQuery.maybeSingle();
    if (lookupErr) throw lookupErr;

    let fonteId: string;
    const nowIso = new Date().toISOString();

    if (esistente?.id) {
      // Re-import pulito: riusa l'id, aggiorna i metadati (stato NON toccato →
      // la pubblicazione è un'azione separata), poi cancella capitoli+voci.
      fonteId = esistente.id as string;
      const { error: updErr } = await supabaseAdmin
        .from("prezzario_fonte")
        .update({
          nome,
          url_fonte: urlFonte,
          licenza,
          created_by: userId,
          updated_at: nowIso,
        })
        .eq("id", fonteId);
      if (updErr) throw updErr;

      // Cancella prima le voci, poi i capitoli (cascade coprirebbe comunque, ma
      // l'ordine esplicito evita ambiguità su capitolo_id ON DELETE SET NULL).
      const { error: delVociErr } = await supabaseAdmin.from("prezzario_voce").delete().eq("fonte_id", fonteId);
      if (delVociErr) throw delVociErr;
      const { error: delCapErr } = await supabaseAdmin.from("prezzario_capitolo").delete().eq("fonte_id", fonteId);
      if (delCapErr) throw delCapErr;
    } else {
      const { data: nuova, error: insErr } = await supabaseAdmin
        .from("prezzario_fonte")
        .insert({
          regione,
          anno,
          versione,
          nome,
          url_fonte: urlFonte,
          licenza,
          stato: "bozza",
          created_by: userId,
          updated_at: nowIso,
        })
        .select("id")
        .single();
      if (insErr) throw insErr;
      fonteId = nuova.id as string;
    }

    // ── 4. Insert CAPITOLI in due passate ─────────────────────────────────────
    // Passata 1: inserisco tutti i capitoli (senza parent) e costruisco la mappa
    // codice→uuid. Passata 2: risolvo parentCodice→uuid con UPDATE.
    const codiceToCapitoloId = new Map<string, string>();
    let capitoliInseriti = 0;

    const capitoliRows = capitoliIn
      .filter((c) => c && typeof c.titolo === "string" && c.titolo.trim() !== "")
      .map((c) => ({
        fonte_id: fonteId,
        codice: typeof c.codice === "string" && c.codice.trim() !== "" ? c.codice.trim() : null,
        titolo: c.titolo.trim(),
        livello: toFiniteNumber(c.livello) ?? 0,
        ordine: toFiniteNumber(c.ordine) ?? 0,
        // parent risolto nella passata 2
        _parentCodice: typeof c.parentCodice === "string" && c.parentCodice.trim() !== "" ? c.parentCodice.trim() : null,
      }));

    for (let i = 0; i < capitoliRows.length; i += INSERT_CHUNK) {
      const chunk = capitoliRows.slice(i, i + INSERT_CHUNK).map(({ _parentCodice: _omit, ...row }) => row);
      const { data: inserted, error: capErr } = await supabaseAdmin
        .from("prezzario_capitolo")
        .insert(chunk)
        .select("id, codice");
      if (capErr) throw capErr;
      for (const row of (inserted ?? []) as Array<{ id: string; codice: string | null }>) {
        if (row.codice) codiceToCapitoloId.set(row.codice, row.id);
      }
      capitoliInseriti += inserted?.length ?? 0;
    }

    // Passata 2: collega i parent risolvendo parentCodice→uuid nella stessa fonte.
    for (const c of capitoliRows) {
      if (!c.codice || !c._parentCodice) continue;
      const childId = codiceToCapitoloId.get(c.codice);
      const parentId = codiceToCapitoloId.get(c._parentCodice);
      if (!childId || !parentId || childId === parentId) continue;
      const { error: linkErr } = await supabaseAdmin
        .from("prezzario_capitolo")
        .update({ parent_id: parentId })
        .eq("id", childId);
      if (linkErr) throw linkErr;
    }

    // ── 5. Insert VOCI (risolvo capitoloCodice→capitolo_id; scarto invalide) ──
    let vociScartate = 0;
    const vociRows: Array<Record<string, unknown>> = [];
    for (const v of vociIn) {
      const descrizione = typeof v?.descrizione === "string" ? v.descrizione.trim() : "";
      const prezzo = toFiniteNumber(v?.prezzo);
      // Scarta voci senza descrizione o con prezzo non numerico.
      if (!descrizione || prezzo === null) {
        vociScartate++;
        continue;
      }
      const capCodice = typeof v.capitoloCodice === "string" && v.capitoloCodice.trim() !== "" ? v.capitoloCodice.trim() : null;
      vociRows.push({
        fonte_id: fonteId,
        capitolo_id: capCodice ? (codiceToCapitoloId.get(capCodice) ?? null) : null,
        codice: typeof v.codice === "string" && v.codice.trim() !== "" ? v.codice.trim() : null,
        descrizione,
        unita_misura: typeof v.unita_misura === "string" && v.unita_misura.trim() !== "" ? v.unita_misura.trim() : null,
        prezzo,
        incidenza_manodopera_pct: toNullableNumber(v.incidenza_manodopera_pct),
        incidenza_sicurezza_pct: toNullableNumber(v.incidenza_sicurezza_pct),
        ordine: toFiniteNumber(v.ordine) ?? 0,
      });
    }

    let vociInserite = 0;
    for (let i = 0; i < vociRows.length; i += INSERT_CHUNK) {
      const chunk = vociRows.slice(i, i + INSERT_CHUNK);
      const { data: insVoci, error: voceErr } = await supabaseAdmin
        .from("prezzario_voce")
        .insert(chunk)
        .select("id");
      if (voceErr) throw voceErr;
      vociInserite += insVoci?.length ?? 0;
    }

    return jsonResponse(
      {
        fonte_id: fonteId,
        capitoli_inseriti: capitoliInseriti,
        voci_inserite: vociInserite,
        voci_scartate: vociScartate,
      },
      200,
      corsHeaders,
    );
  } catch (err) {
    // Response lanciate dagli helper (401/403) passano inalterate.
    if (err instanceof Response) return err;
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[prezzario-import] ERROR:", msg);
    return errorResponse("Errore interno del server durante l'import del prezzario", 500, corsHeaders);
  }
});
