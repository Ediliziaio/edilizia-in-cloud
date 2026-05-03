/**
 * cg-bootstrap-classificazione
 *
 * Idempotent bootstrap: al primo accesso al modulo Controllo di Gestione
 * popola `cg_classificazione_voci` per la company chiamante con un set
 * default di 45 voci (mappa categoria → macro_voce + tipo F/V/Z) tradotto
 * dal template Excel "CE Riclassificato" di Florin.
 *
 * - Idempotente: ON CONFLICT DO NOTHING su (company_id, voce_chiave,
 *   source_table, source_value).
 * - Permessi: richiede JWT valido. Inserisce solo per la company dell'utente
 *   (derivata via get_my_company_id) — nessuna possibilità di
 *   inquinare un'altra company.
 *
 * Risposta:
 *   { inserted: number, alreadyPresent: number, total: number }
 */

import { getCorsHeaders, errorResponse } from "../_shared/headers.ts";
import { requireAuth } from "../_shared/auth.ts";

interface SeedRow {
  voce_chiave: string;
  voce_descrizione: string;
  macro_voce: string;
  tipo: "F" | "V" | "Z";
  source_table: "company_costs" | "bank_transactions" | "invoices" | "prima_nota" | "manual";
  source_field: string | null;
  source_value: string;
  ordering: number;
}

const SEED: ReadonlyArray<SeedRow> = [
  // ── Costo personale ────────────────────────────────────────────────
  { voce_chiave: "salari_stipendi",     voce_descrizione: "Salari e stipendi (banca)",  macro_voce: "costo_personale", tipo: "F", source_table: "bank_transactions", source_field: "category", source_value: "Stipendi",        ordering: 100 },
  { voce_chiave: "salari_stipendi_cc",  voce_descrizione: "Salari e stipendi (costi)",  macro_voce: "costo_personale", tipo: "F", source_table: "company_costs",     source_field: "category", source_value: "stipendi",        ordering: 101 },
  { voce_chiave: "inps",                voce_descrizione: "Contributi INPS",            macro_voce: "costo_personale", tipo: "F", source_table: "company_costs",     source_field: "category", source_value: "INPS",            ordering: 110 },
  { voce_chiave: "inail",               voce_descrizione: "Contributi INAIL",           macro_voce: "costo_personale", tipo: "F", source_table: "company_costs",     source_field: "category", source_value: "INAIL",           ordering: 111 },
  { voce_chiave: "tfr",                 voce_descrizione: "Accantonamento TFR",         macro_voce: "costo_personale", tipo: "F", source_table: "company_costs",     source_field: "category", source_value: "TFR",             ordering: 120 },
  { voce_chiave: "trasferte_personale", voce_descrizione: "Trasferte personale",        macro_voce: "costo_personale", tipo: "F", source_table: "company_costs",     source_field: "category", source_value: "trasferte",       ordering: 130 },

  // ── Acquisti materie prime ─────────────────────────────────────────
  { voce_chiave: "materie_prime",       voce_descrizione: "Materie prime / merci",      macro_voce: "acquisti_materie", tipo: "V", source_table: "company_costs",     source_field: "category", source_value: "merci",            ordering: 200 },
  { voce_chiave: "materie_prime_bt",    voce_descrizione: "Materie prime (banca)",      macro_voce: "acquisti_materie", tipo: "V", source_table: "bank_transactions", source_field: "category", source_value: "Fornitori",        ordering: 201 },

  // ── Costi produttivi ───────────────────────────────────────────────
  { voce_chiave: "subappalti",          voce_descrizione: "Subappalti / lavorazioni",   macro_voce: "costi_produttivi", tipo: "V", source_table: "company_costs",     source_field: "category", source_value: "subappalti",       ordering: 300 },
  { voce_chiave: "carburanti_furg",     voce_descrizione: "Carburanti automezzi",       macro_voce: "costi_produttivi", tipo: "V", source_table: "bank_transactions", source_field: "category", source_value: "carburante",       ordering: 310 },
  { voce_chiave: "carburanti_cc",       voce_descrizione: "Carburanti (costi)",         macro_voce: "costi_produttivi", tipo: "V", source_table: "company_costs",     source_field: "category", source_value: "carburante",       ordering: 311 },
  { voce_chiave: "manutenzioni",        voce_descrizione: "Manutenzioni e riparazioni", macro_voce: "costi_produttivi", tipo: "V", source_table: "company_costs",     source_field: "category", source_value: "manutenzione",     ordering: 320 },
  { voce_chiave: "noleggi_attrezzi",    voce_descrizione: "Noleggio attrezzature",      macro_voce: "costi_produttivi", tipo: "V", source_table: "company_costs",     source_field: "category", source_value: "noleggi",          ordering: 330 },
  { voce_chiave: "affitti",             voce_descrizione: "Affitti immobili",           macro_voce: "costi_produttivi", tipo: "F", source_table: "bank_transactions", source_field: "category", source_value: "affitti",          ordering: 340 },
  { voce_chiave: "leasing",             voce_descrizione: "Leasing",                    macro_voce: "costi_produttivi", tipo: "F", source_table: "bank_transactions", source_field: "category", source_value: "leasing",          ordering: 341 },
  { voce_chiave: "assicurazioni",       voce_descrizione: "Assicurazioni",              macro_voce: "costi_produttivi", tipo: "F", source_table: "bank_transactions", source_field: "category", source_value: "Assicurazioni",    ordering: 350 },
  { voce_chiave: "utenze_acqua",        voce_descrizione: "Utenze (acqua/luce/gas)",    macro_voce: "costi_produttivi", tipo: "V", source_table: "bank_transactions", source_field: "category", source_value: "utenze",           ordering: 360 },
  { voce_chiave: "utenze_telefonia",    voce_descrizione: "Telefonia / connettività",   macro_voce: "costi_produttivi", tipo: "F", source_table: "company_costs",     source_field: "category", source_value: "telefonia",        ordering: 361 },
  { voce_chiave: "smaltimento_rifiuti", voce_descrizione: "Smaltimento rifiuti",        macro_voce: "costi_produttivi", tipo: "V", source_table: "company_costs",     source_field: "category", source_value: "rifiuti",          ordering: 370 },

  // ── Costi commerciali ──────────────────────────────────────────────
  { voce_chiave: "pubblicita",          voce_descrizione: "Pubblicità",                 macro_voce: "costi_commerciali", tipo: "F", source_table: "company_costs",    source_field: "category", source_value: "pubblicita",       ordering: 400 },
  { voce_chiave: "marketing_digital",   voce_descrizione: "Marketing digitale (Meta/Google)", macro_voce: "costi_commerciali", tipo: "F", source_table: "company_costs", source_field: "category", source_value: "marketing", ordering: 401 },
  { voce_chiave: "provvigioni",         voce_descrizione: "Provvigioni venditori",      macro_voce: "costi_commerciali", tipo: "V", source_table: "company_costs",    source_field: "category", source_value: "provvigioni",      ordering: 410 },
  { voce_chiave: "fiere_congressi",     voce_descrizione: "Fiere e congressi",          macro_voce: "costi_commerciali", tipo: "F", source_table: "company_costs",    source_field: "category", source_value: "fiere",            ordering: 420 },
  { voce_chiave: "rappresentanza",      voce_descrizione: "Spese di rappresentanza",    macro_voce: "costi_commerciali", tipo: "V", source_table: "company_costs",    source_field: "category", source_value: "rappresentanza",   ordering: 430 },

  // ── Costi amministrativi ───────────────────────────────────────────
  { voce_chiave: "consulenze_fiscali",  voce_descrizione: "Commercialista",             macro_voce: "costi_amministrativi", tipo: "F", source_table: "company_costs", source_field: "category", source_value: "commercialista",  ordering: 500 },
  { voce_chiave: "consulenze_legali",   voce_descrizione: "Studio legale",              macro_voce: "costi_amministrativi", tipo: "F", source_table: "company_costs", source_field: "category", source_value: "legale",          ordering: 510 },
  { voce_chiave: "consulenze_lavoro",   voce_descrizione: "Consulenza del lavoro",      macro_voce: "costi_amministrativi", tipo: "F", source_table: "company_costs", source_field: "category", source_value: "consulenza_lavoro", ordering: 511 },
  { voce_chiave: "software_sw",         voce_descrizione: "Software / SaaS",            macro_voce: "costi_amministrativi", tipo: "F", source_table: "company_costs", source_field: "category", source_value: "software",        ordering: 520 },
  { voce_chiave: "cancelleria",         voce_descrizione: "Cancelleria / ufficio",      macro_voce: "costi_amministrativi", tipo: "F", source_table: "company_costs", source_field: "category", source_value: "cancelleria",     ordering: 530 },
  { voce_chiave: "formazione",          voce_descrizione: "Formazione personale",       macro_voce: "costi_amministrativi", tipo: "F", source_table: "company_costs", source_field: "category", source_value: "formazione",      ordering: 540 },

  // ── Oneri finanziari ───────────────────────────────────────────────
  { voce_chiave: "spese_bancarie",      voce_descrizione: "Spese bancarie",             macro_voce: "oneri_finanziari", tipo: "F", source_table: "bank_transactions", source_field: "category", source_value: "Bancario",        ordering: 600 },
  { voce_chiave: "interessi_passivi",   voce_descrizione: "Interessi passivi",          macro_voce: "oneri_finanziari", tipo: "F", source_table: "company_costs",     source_field: "category", source_value: "interessi",       ordering: 610 },
  { voce_chiave: "commissioni_pos",     voce_descrizione: "Commissioni POS / circuiti", macro_voce: "oneri_finanziari", tipo: "V", source_table: "bank_transactions", source_field: "category", source_value: "commissioni",     ordering: 620 },

  // ── Oneri tributari ────────────────────────────────────────────────
  { voce_chiave: "f24_iva",             voce_descrizione: "F24 IVA",                    macro_voce: "oneri_tributari", tipo: "F", source_table: "bank_transactions", source_field: "category", source_value: "Tasse",            ordering: 700 },
  { voce_chiave: "f24_irpef",           voce_descrizione: "F24 IRPEF / IRES",           macro_voce: "oneri_tributari", tipo: "F", source_table: "company_costs",     source_field: "category", source_value: "f24",              ordering: 710 },
  { voce_chiave: "imu_tari",            voce_descrizione: "IMU / TARI",                 macro_voce: "oneri_tributari", tipo: "F", source_table: "company_costs",     source_field: "category", source_value: "imu",              ordering: 720 },

  // ── Ammortamenti (manuali da cespiti) ──────────────────────────────
  { voce_chiave: "amm_immobili",        voce_descrizione: "Ammortamento immobili",      macro_voce: "ammortamenti", tipo: "F", source_table: "manual",            source_field: null,       source_value: "amm_immobili",     ordering: 800 },
  { voce_chiave: "amm_macchinari",      voce_descrizione: "Ammortamento macchinari",    macro_voce: "ammortamenti", tipo: "F", source_table: "manual",            source_field: null,       source_value: "amm_macchinari",   ordering: 810 },
  { voce_chiave: "amm_automezzi",       voce_descrizione: "Ammortamento automezzi",     macro_voce: "ammortamenti", tipo: "F", source_table: "manual",            source_field: null,       source_value: "amm_automezzi",    ordering: 820 },
  { voce_chiave: "amm_software",        voce_descrizione: "Ammortamento software",      macro_voce: "ammortamenti", tipo: "F", source_table: "manual",            source_field: null,       source_value: "amm_software",     ordering: 830 },

  // ── Extra-gestionale (Z) ───────────────────────────────────────────
  { voce_chiave: "sopravv_attive",      voce_descrizione: "Sopravvenienze attive",      macro_voce: "ricavi_extra", tipo: "Z", source_table: "prima_nota",        source_field: "category", source_value: "sopravvenienze",   ordering: 900 },
  { voce_chiave: "sopravv_passive",     voce_descrizione: "Sopravvenienze passive",     macro_voce: "costi_extra",  tipo: "Z", source_table: "prima_nota",        source_field: "category", source_value: "sopravvenienze_p", ordering: 901 },
  { voce_chiave: "plusvalenze",         voce_descrizione: "Plusvalenze",                macro_voce: "ricavi_extra", tipo: "Z", source_table: "prima_nota",        source_field: "category", source_value: "plusvalenze",      ordering: 910 },
  { voce_chiave: "minusvalenze",        voce_descrizione: "Minusvalenze",               macro_voce: "costi_extra",  tipo: "Z", source_table: "prima_nota",        source_field: "category", source_value: "minusvalenze",     ordering: 911 },
  { voce_chiave: "donazioni",           voce_descrizione: "Donazioni",                  macro_voce: "costi_extra",  tipo: "Z", source_table: "company_costs",    source_field: "category", source_value: "donazioni",        ordering: 920 },
];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: getCorsHeaders(req) });
  }

  const corsH = getCorsHeaders(req);

  try {
    const { userId, supabaseAdmin } = await requireAuth(req, corsH);

    // Risolvi la company dell'utente.
    const { data: companyRes, error: companyErr } = await supabaseAdmin
      .rpc("get_my_company_id" as never)
      .single();

    if (companyErr || !companyRes) {
      return errorResponse("Nessuna azienda associata all'utente", 400, corsH);
    }
    // Quando chiamato come service-role, get_my_company_id() ritorna null perché
    // auth.uid() non è settato. In questo caso prendiamo la company dal profilo.
    let companyId = (companyRes as unknown as string) ?? null;
    if (!companyId) {
      const { data: prof } = await supabaseAdmin
        .from("profiles")
        .select("company_id")
        .eq("id", userId)
        .maybeSingle();
      companyId = (prof?.company_id as string) ?? null;
    }
    if (!companyId) {
      return errorResponse("Profilo utente senza company_id valido", 400, corsH);
    }

    // Quante voci sono già presenti per la company?
    const { count: presentBefore } = await supabaseAdmin
      .from("cg_classificazione_voci")
      .select("id", { count: "exact", head: true })
      .eq("company_id", companyId);

    const rows = SEED.map((row) => ({ ...row, company_id: companyId, is_active: true }));

    const { error: insertErr, count: insertedCount } = await supabaseAdmin
      .from("cg_classificazione_voci")
      .upsert(rows, {
        onConflict: "company_id,voce_chiave,source_table,source_value",
        ignoreDuplicates: true,
        count: "exact",
      });

    if (insertErr) {
      return errorResponse(`Errore inserimento seed: ${insertErr.message}`, 500, corsH);
    }

    const inserted = insertedCount ?? 0;
    const total = SEED.length;
    const alreadyPresent = (presentBefore ?? 0);

    return new Response(
      JSON.stringify({
        success: true,
        inserted,
        alreadyPresent,
        total,
        company_id: companyId,
      }),
      { status: 200, headers: { ...corsH, "Content-Type": "application/json" } },
    );
  } catch (err) {
    if (err instanceof Response) return err;
    const msg = err instanceof Error ? err.message : "Errore sconosciuto";
    return errorResponse(msg, 500, corsH);
  }
});
