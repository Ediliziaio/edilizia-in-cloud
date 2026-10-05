/**
 * Sprint C — Catalogo Esteso
 * Edge Function: catalog-import-batch
 *
 * Importa un batch di articoli / famiglie / tariffe partendo dalle righe
 * normalizzate dal wizard (ListinoImportWizard).
 *
 * Body payload:
 *   {
 *     object_type: "product" | "family" | "tariffa",
 *     rows: Array<Record<string, unknown> & { custom_field_values?: Record<string, unknown> }>
 *   }
 *
 * Risoluzioni:
 *   - product.family    → article_families.nome (case-insensitive, stessa company)
 *   - product.supplier  → suppliers.name
 *   - tariffa.categoria → mapping su tipo (posa/trasporto/tiro_piano/smaltimento/nolo/pratica/altro)
 *
 * Dedup su re-import:
 *   - product → match su sku (se presente) o name esistente → UPDATE, non insert
 *   - family  → match su nome (stesso scope dell'indice parziale) → UPDATE campi da file
 *   - tariffa → match su nome → UPDATE prezzi/descrizione
 *   Gli UPDATE scrivono solo i campi che il file valorizza (vedi soloValorizzati).
 *   Righe duplicate nello stesso file vengono scartate (skipped + errore visibile).
 *
 * Output:
 *   { inserted: number, updated: number, skipped: number, errors: Array<{row: number, error: string}> }
 */
import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { getCorsHeaders, errorResponse, jsonResponse } from "../_shared/headers.ts";
import { requireAuth } from "../_shared/auth.ts";

// ─────────────────────────────────────────────────────────────────────────────

interface ImportPayload {
  object_type: "product" | "family" | "tariffa";
  rows: Array<Record<string, unknown>>;
}

interface ImportResult {
  inserted: number;
  updated: number;
  skipped: number;
  errors: Array<{ row: number; error: string }>;
}

/** Esegue update per-riga con concorrenza limitata (evita timeout su batch grandi). */
async function runUpdates(
  updates: Array<{ row: number; run: () => Promise<{ error: { message: string } | null }> }>,
  res: ImportResult,
  concurrency = 10,
): Promise<void> {
  for (let i = 0; i < updates.length; i += concurrency) {
    const group = updates.slice(i, i + concurrency);
    const outcomes = await Promise.all(group.map(async (u) => {
      const { error } = await u.run();
      return { row: u.row, error };
    }));
    for (const o of outcomes) {
      if (o.error) {
        res.skipped++;
        res.errors.push({ row: o.row, error: `aggiornamento fallito: ${o.error.message}` });
      } else {
        res.updated++;
      }
    }
  }
}

// Mapping tariffa "categoria" (input libero) → enum tipo richiesto dal DB
function mapTariffaTipo(categoria: string | null | undefined): string {
  if (!categoria) return "altro";
  const c = categoria.toLowerCase().trim();
  if (/posa|montaggio|manodoper|operaio|tecnico/.test(c)) return "posa";
  if (/trasporto|spediz/.test(c)) return "trasporto";
  if (/tiro.*piano|piano/.test(c)) return "tiro_piano";
  if (/smaltimento|rimoz/.test(c)) return "smaltimento";
  if (/nolo|nolegg/.test(c)) return "nolo";
  if (/pratica|permes/.test(c)) return "pratica";
  return "altro";
}

function str(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s === "" ? null : s;
}
function num(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : Number(String(v).replace(",", "."));
  return Number.isFinite(n) ? n : null;
}
function bool(v: unknown, fallback = true): boolean {
  if (v === null || v === undefined || v === "") return fallback;
  if (typeof v === "boolean") return v;
  const s = String(v).toLowerCase();
  return !["0", "false", "no", "n", "off"].includes(s);
}
function oggetto(v: unknown): Record<string, unknown> {
  return v && typeof v === "object" && !Array.isArray(v) ? v as Record<string, unknown> : {};
}

/**
 * Aggiornamento di una riga già in archivio: solo i campi che il file
 * valorizza. Una cella vuota, o una colonna che il formato non ha, vuol dire
 * «nessuna informazione», non «azzera»: prima un re-import senza costi
 * portava a 0 costo e prezzo delle tariffe, uno senza IVA rimetteva gli
 * articoli al 22% e uno senza categoria rifaceva «altro» il tipo (05/10/2026).
 */
function soloValorizzati(campi: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(campi).filter(([, v]) => v !== null && v !== undefined));
}

/**
 * Campi personalizzati in aggiornamento: solo se il file ne porta, e sopra
 * quelli che la riga ha già. Riscriverli con l'oggetto vuoto del file
 * cancellava tutto, anche le chiavi di sistema delle tariffe
 * (_costo_lavorazione, _gruppo_lavorazione).
 */
function campiPersonalizzatiAggiornati(esistenti: unknown, dalFile: unknown): Record<string, unknown> | null {
  const file = oggetto(dalFile);
  if (Object.keys(file).length === 0) return null;
  return { ...oggetto(esistenti), ...file };
}

/** Accoda l'aggiornamento; senza campi da scrivere la riga conta come aggiornata e basta. */
function accodaAggiornamento(
  updates: Array<{ row: number; run: () => Promise<{ error: { message: string } | null }> }>,
  res: ImportResult,
  row: number,
  payload: Record<string, unknown>,
  run: (payload: Record<string, unknown>) => Promise<{ error: { message: string } | null }>,
): void {
  if (Object.keys(payload).length === 0) {
    res.updated++;
    return;
  }
  updates.push({ row, run: () => run(payload) });
}

// ─────────────────────────────────────────────────────────────────────────────

async function resolveCompanyId(
  supabaseAdmin: ReturnType<typeof createSupabaseAdmin>,
  userId: string,
): Promise<string | null> {
  const { data } = await (supabaseAdmin as any)
    .from("profiles")
    .select("company_id")
    .eq("id", userId)
    .maybeSingle();
  return (data as { company_id: string | null } | null)?.company_id ?? null;
}

type SupabaseAdmin = ReturnType<typeof createSupabaseAdmin>;
function createSupabaseAdmin() {
  // Stub type, reale creato da requireAuth
  return null as any;
}

// Cache suppliers/families per batch
async function loadSupplierMap(supabaseAdmin: any, companyId: string): Promise<Map<string, string>> {
  const { data, error } = await supabaseAdmin
    .from("suppliers")
    .select("id, name")
    .eq("company_id", companyId);
  if (error) throw error;
  const m = new Map<string, string>();
  for (const r of data ?? []) m.set((r.name ?? "").toLowerCase().trim(), r.id);
  return m;
}

async function loadFamilyMap(supabaseAdmin: any, companyId: string): Promise<Map<string, string>> {
  const { data, error } = await supabaseAdmin
    .from("article_families")
    .select("id, nome")
    .eq("company_id", companyId);
  if (error) throw error;
  const m = new Map<string, string>();
  for (const r of data ?? []) m.set((r.nome ?? "").toLowerCase().trim(), r.id);
  return m;
}

// ─────────────────────────────────────────────────────────────────────────────
// Importers per object_type
// ─────────────────────────────────────────────────────────────────────────────

async function importProducts(
  supabaseAdmin: any,
  companyId: string,
  rows: Array<Record<string, unknown>>,
): Promise<ImportResult> {
  const supplierMap = await loadSupplierMap(supabaseAdmin, companyId);
  const familyMap = await loadFamilyMap(supabaseAdmin, companyId);
  const res: ImportResult = { inserted: 0, updated: 0, skipped: 0, errors: [] };

  // Articoli esistenti: match per sku (prioritario) o name, case-insensitive.
  // NB: esiste anche il vincolo UNIQUE(company_id, name) — senza questo pre-match
  // un solo duplicato faceva fallire l'intero chunk da 100 insert.
  const { data: existing, error: exErr } = await supabaseAdmin
    .from("article_templates")
    .select("id, name, sku, custom_field_values")
    .eq("company_id", companyId);
  if (exErr) throw exErr;
  const bySku = new Map<string, string>();
  const byName = new Map<string, string>();
  const campiById = new Map<string, unknown>();
  for (const e of existing ?? []) {
    if (e.sku) bySku.set(String(e.sku).toLowerCase().trim(), e.id);
    if (e.name) byName.set(String(e.name).toLowerCase().trim(), e.id);
    campiById.set(e.id, e.custom_field_values);
  }

  const inserts: any[] = [];
  const updates: Array<{ row: number; run: () => Promise<{ error: { message: string } | null }> }> = [];
  const seenInFile = new Set<string>();
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    const name = str(r.name);
    if (!name) {
      res.skipped++;
      res.errors.push({ row: i + 1, error: "name mancante" });
      continue;
    }
    const sku = str(r.code);
    const skuKey = sku ? `sku:${sku.toLowerCase()}` : null;
    const nameKey = `name:${name.toLowerCase().trim()}`;
    if ((skuKey && seenInFile.has(skuKey)) || seenInFile.has(nameKey)) {
      res.skipped++;
      res.errors.push({ row: i + 1, error: `duplicato nel file: "${sku ?? name}" — riga ignorata` });
      continue;
    }
    if (skuKey) seenInFile.add(skuKey);
    seenInFile.add(nameKey);

    const supplierName = str(r.supplier);
    const familyName = str(r.family);
    // Quello che il file dice; null = cella vuota o colonna assente.
    const dalFile: Record<string, unknown> = {
      name,
      sku,
      description: str(r.name),
      category: str(r.category),
      family_id: familyName ? familyMap.get(familyName.toLowerCase()) ?? null : null,
      supplier_id: supplierName ? supplierMap.get(supplierName.toLowerCase()) ?? null : null,
      unit_of_measure: str(r.unit),
      unit_price: num(r.base_price),
      prezzo_vendita: num(r.list_price),
      standard_cost: num(r.cost),
      prezzo_acquisto_netto: num(r.cost),
      margine_minimo_percentuale: num(r.margin_pct),
      vat_rate: num(r.vat_rate),
      note_interne: [str(r.barcode) ? `Barcode: ${str(r.barcode)}` : null, str(r.notes)]
        .filter(Boolean)
        .join(" · ") || null,
    };

    const existingId = (skuKey ? bySku.get(sku!.toLowerCase().trim()) : undefined)
      ?? byName.get(name.toLowerCase().trim());
    if (existingId) {
      // Non tocca modalita_prezzo/attivo dell'articolo esistente, né i campi
      // che il file lascia vuoti.
      const payload = soloValorizzati(dalFile);
      const campi = campiPersonalizzatiAggiornati(campiById.get(existingId), r.custom_field_values);
      if (campi) payload.custom_field_values = campi;
      accodaAggiornamento(updates, res, i + 1, payload,
        (p) => supabaseAdmin.from("article_templates").update(p).eq("id", existingId));
    } else {
      // modalita_prezzo "pz": il CHECK ammette pz/mq/misura_libera/griglia, e
      // il "fisso" di prima faceva fallire ogni blocco di inserimenti (05/10/2026).
      inserts.push({
        ...dalFile,
        unit_price: dalFile.unit_price ?? 0,
        vat_rate: dalFile.vat_rate ?? 22,
        custom_field_values: oggetto(r.custom_field_values),
        company_id: companyId,
        modalita_prezzo: "pz",
        attivo: true,
      });
    }
  }

  // Batch insert in chunks da 100
  for (let i = 0; i < inserts.length; i += 100) {
    const chunk = inserts.slice(i, i + 100);
    const { error } = await supabaseAdmin.from("article_templates").insert(chunk);
    if (error) {
      res.errors.push({ row: i + 1, error: `chunk ${i / 100}: ${error.message}` });
      res.skipped += chunk.length;
    } else {
      res.inserted += chunk.length;
    }
  }
  await runUpdates(updates, res);
  return res;
}

async function importFamilies(
  supabaseAdmin: any,
  companyId: string,
  rows: Array<Record<string, unknown>>,
): Promise<ImportResult> {
  const supplierMap = await loadSupplierMap(supabaseAdmin, companyId);
  const res: ImportResult = { inserted: 0, updated: 0, skipped: 0, errors: [] };

  // Famiglie esistenti nello stesso scope dell'indice parziale
  // (company, vertical=generico, attive, non cancellate, senza categoria):
  // senza pre-match l'insert violava l'unique e scartava l'intero chunk.
  const { data: existing, error: exErr } = await supabaseAdmin
    .from("article_families")
    .select("id, nome, custom_field_values")
    .eq("company_id", companyId)
    .eq("vertical", "generico")
    .eq("attivo", true)
    .is("deleted_at", null)
    .is("categoria_id", null);
  if (exErr) throw exErr;
  const byNome = new Map<string, string>();
  const campiById = new Map<string, unknown>();
  for (const e of existing ?? []) {
    if (e.nome) byNome.set(String(e.nome).toLowerCase().trim(), e.id);
    campiById.set(e.id, e.custom_field_values);
  }

  const inserts: any[] = [];
  const updates: Array<{ row: number; run: () => Promise<{ error: { message: string } | null }> }> = [];
  const seenInFile = new Set<string>();
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    const nome = str(r.name);
    if (!nome) {
      res.skipped++;
      res.errors.push({ row: i + 1, error: "name mancante" });
      continue;
    }
    const nomeKey = nome.toLowerCase().trim();
    if (seenInFile.has(nomeKey)) {
      res.skipped++;
      res.errors.push({ row: i + 1, error: `duplicato nel file: "${nome}" — riga ignorata` });
      continue;
    }
    seenInFile.add(nomeKey);

    const supplierName = str(r.supplier);
    // Prezzi, IVA e unità quando il file li porta: il modello «famiglie» non
    // li ha, le righe dell'import AI sì (stesse colonne dei prodotti:
    // list_price/base_price, cost, vat_rate, unit). Prima non si scriveva
    // nessun prezzo e la famiglia nasceva a 0 € (05/10/2026).
    const dalFile: Record<string, unknown> = {
      descrizione: str(r.description),
      supplier_id: supplierName ? supplierMap.get(supplierName.toLowerCase()) ?? null : null,
      prezzo_base_vendita: num(r.list_price) ?? num(r.base_price),
      prezzo_base_acquisto: num(r.cost),
      vat_rate: num(r.vat_rate),
      unit_of_measure: str(r.unit),
    };
    const existingId = byNome.get(nomeKey);
    if (existingId) {
      // Aggiorna solo i campi che arrivano dal file — non tocca
      // modalita_prezzo_base (potrebbe essere una famiglia a griglia)
      const payload = soloValorizzati(dalFile);
      const campi = campiPersonalizzatiAggiornati(campiById.get(existingId), r.custom_field_values);
      if (campi) payload.custom_field_values = campi;
      accodaAggiornamento(updates, res, i + 1, payload,
        (p) => supabaseAdmin.from("article_families").update(p).eq("id", existingId));
    } else {
      // "pz", non "fisso": il CHECK su modalita_prezzo_base ammette solo
      // pz/mq/griglia/misura_libera, e "fisso" faceva fallire ogni blocco di
      // inserimenti. Il file non dice la modalità: una famiglia importata ha
      // un prezzo per pezzo (o per la sua unità), non a misure L×H.
      // Sempre le stesse chiavi, coi default della tabella scritti a mano:
      // nell'insert a blocchi una chiave assente in una riga ma presente in
      // un'altra diventa NULL, non il DEFAULT (IVA NULL invece di 22).
      inserts.push({
        ...dalFile,
        prezzo_base_vendita: dalFile.prezzo_base_vendita ?? 0,
        prezzo_base_acquisto: dalFile.prezzo_base_acquisto ?? 0,
        vat_rate: dalFile.vat_rate ?? 22,
        unit_of_measure: dalFile.unit_of_measure ?? "pz",
        company_id: companyId,
        nome,
        modalita_prezzo_base: "pz",
        vertical: "generico",
        attivo: true,
        custom_field_values: oggetto(r.custom_field_values),
      });
    }
  }

  for (let i = 0; i < inserts.length; i += 100) {
    const chunk = inserts.slice(i, i + 100);
    const { error } = await supabaseAdmin.from("article_families").insert(chunk);
    if (error) {
      res.errors.push({ row: i + 1, error: `chunk ${i / 100}: ${error.message}` });
      res.skipped += chunk.length;
    } else {
      res.inserted += chunk.length;
    }
  }
  await runUpdates(updates, res);
  return res;
}

async function importTariffe(
  supabaseAdmin: any,
  companyId: string,
  rows: Array<Record<string, unknown>>,
): Promise<ImportResult> {
  const res: ImportResult = { inserted: 0, updated: 0, skipped: 0, errors: [] };

  // Nessun vincolo unique su tariffe_aziendali: senza pre-match ogni
  // re-import duplicava tutte le tariffe. Match per nome case-insensitive.
  const { data: existing, error: exErr } = await supabaseAdmin
    .from("tariffe_aziendali")
    .select("id, nome, custom_field_values")
    .eq("company_id", companyId);
  if (exErr) throw exErr;
  const byNome = new Map<string, string>();
  const campiById = new Map<string, unknown>();
  for (const e of existing ?? []) {
    if (e.nome) byNome.set(String(e.nome).toLowerCase().trim(), e.id);
    campiById.set(e.id, e.custom_field_values);
  }

  const inserts: any[] = [];
  const updates: Array<{ row: number; run: () => Promise<{ error: { message: string } | null }> }> = [];
  const seenInFile = new Set<string>();
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    const nome = str(r.nome);
    if (!nome) {
      res.skipped++;
      res.errors.push({ row: i + 1, error: "nome mancante" });
      continue;
    }
    const nomeKey = nome.toLowerCase().trim();
    if (seenInFile.has(nomeKey)) {
      res.skipped++;
      res.errors.push({ row: i + 1, error: `duplicato nel file: "${nome}" — riga ignorata` });
      continue;
    }
    seenInFile.add(nomeKey);

    // Il costo nelle tre colonne che le pagine leggono (costo_interno,
    // prezzo_costo, costo_default), come il salvataggio della pagina Tariffe:
    // prima solo prezzo_costo, e costo_interno restava allo 0 di default.
    const costo = num(r.costo_orario);
    const categoria = str(r.categoria);
    const dalFile: Record<string, unknown> = {
      descrizione: str(r.descrizione) ?? str(r.qualifica),
      // Senza categoria nel file il tipo resta quello che c'è: mapTariffaTipo
      // di una cella vuota direbbe «altro».
      tipo: categoria ? mapTariffaTipo(categoria) : null,
      costo_interno: costo,
      prezzo_costo: costo,
      costo_default: costo,
      prezzo_vendita: num(r.prezzo_orario),
      categoria_prodotto: str(r.qualifica) ?? str(r.ccnl),
    };
    const existingId = byNome.get(nomeKey);
    if (existingId) {
      // Cella vuota = non toccare: prima costo e prezzo tornavano a 0.
      const payload = soloValorizzati(dalFile);
      const campi = campiPersonalizzatiAggiornati(campiById.get(existingId), r.custom_field_values);
      if (campi) payload.custom_field_values = campi;
      accodaAggiornamento(updates, res, i + 1, payload,
        (p) => supabaseAdmin.from("tariffe_aziendali").update(p).eq("id", existingId));
    } else {
      // Tariffa nuova: quello che manca vale 0 (nessun costo noto), come i
      // DEFAULT della tabella. I campi del file sono orari: unità «h» in
      // entrambe le colonne (unita_fatturazione restava al «pz» di default).
      inserts.push({
        ...dalFile,
        tipo: mapTariffaTipo(categoria),
        costo_interno: costo ?? 0,
        prezzo_costo: costo ?? 0,
        costo_default: costo ?? 0,
        prezzo_vendita: dalFile.prezzo_vendita ?? 0,
        custom_field_values: oggetto(r.custom_field_values),
        company_id: companyId,
        nome,
        unita: "h",
        unita_fatturazione: "h",
      });
    }
  }

  for (let i = 0; i < inserts.length; i += 100) {
    const chunk = inserts.slice(i, i + 100);
    const { error } = await supabaseAdmin.from("tariffe_aziendali").insert(chunk);
    if (error) {
      res.errors.push({ row: i + 1, error: `chunk ${i / 100}: ${error.message}` });
      res.skipped += chunk.length;
    } else {
      res.inserted += chunk.length;
    }
  }
  await runUpdates(updates, res);
  return res;
}

// ─────────────────────────────────────────────────────────────────────────────
// Handler
// ─────────────────────────────────────────────────────────────────────────────

serve(async (req: Request) => {
  const corsHeaders = getCorsHeaders(req);

  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return errorResponse("Method not allowed", 405, corsHeaders);
  }

  try {
    const { userId, supabaseAdmin } = await requireAuth(req, corsHeaders);
    const companyId = await resolveCompanyId(supabaseAdmin as any, userId);
    if (!companyId) {
      return errorResponse("Nessuna azienda associata all'utente", 400, corsHeaders);
    }

    const payload = (await req.json()) as ImportPayload;
    if (!payload || !Array.isArray(payload.rows) || !payload.object_type) {
      return errorResponse("Payload non valido", 400, corsHeaders);
    }
    if (payload.rows.length === 0) {
      return jsonResponse({ inserted: 0, updated: 0, skipped: 0, errors: [] }, 200, corsHeaders);
    }
    if (payload.rows.length > 5000) {
      return errorResponse("Troppe righe in un singolo batch (max 5000)", 400, corsHeaders);
    }

    let result: ImportResult;
    switch (payload.object_type) {
      case "product":
        result = await importProducts(supabaseAdmin as any, companyId, payload.rows);
        break;
      case "family":
        result = await importFamilies(supabaseAdmin as any, companyId, payload.rows);
        break;
      case "tariffa":
        result = await importTariffe(supabaseAdmin as any, companyId, payload.rows);
        break;
      default:
        return errorResponse(`object_type non supportato: ${payload.object_type}`, 400, corsHeaders);
    }

    return jsonResponse(result, 200, corsHeaders);
  } catch (err) {
    if (err instanceof Response) return err;
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[catalog-import-batch] error:", msg);
    return errorResponse(msg, 500, corsHeaders);
  }
});
