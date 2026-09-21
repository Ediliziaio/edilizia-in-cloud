/**
 * Edge Function: fv-onboarding-cliente
 * §7.1 — Layer 1 Onboarding cliente.
 *
 * Riceve: SolarLead (anagrafica + dati immobile + consumo + reddito)
 * Output: { progetto_id, incentivi_pre_qualifica, validazione_ok }
 *
 * Logica:
 *   1. Validazione Zod su payload (lat 35-48, lng 6-19, consumo > 500 kWh)
 *   2. Pre-qualifica incentivi (algoritmo §17 senza dettaglio importi)
 *   3. Crea progetto in fv_progetti con stato='bozza'
 *   4. Logga evento 'wizard_step_completed' (step 1)
 */

import { getCorsHeaders, errorResponse, jsonResponse } from "../_shared/headers.ts";
import { requireAuth } from "../_shared/auth.ts";
import { resolveEffectiveCompanyId, canAccessCompany } from "../_shared/effectiveCompany.ts";

interface FvSolarLeadInput {
  cliente_id?: string | null;
  /** Opportunità CRM di provenienza — collega il progetto al deal (parità serramenti). */
  opportunita_crm_id?: string | null;
  archetipo: "privato_prima" | "privato_seconda" | "privato_isee" | "pmi";
  titolo: string;
  indirizzo: string;
  comune?: string;
  provincia?: string;
  cap?: string;
  regione?: string;
  popolazione_comune?: number;
  latitudine: number;
  longitudine: number;
  tipologia_immobile?: string;
  superficie_immobile_mq?: number;
  prima_casa?: boolean;
  anno_costruzione?: number;
  ha_impianto_esistente?: boolean;
  consumo_annuo_kwh: number;
  costo_kwh_attuale?: number;
  tariffa_tipo?: "monoraria" | "bioraria" | "trioraria";
  profilo_consumo?: string;
  isee?: number;
  numero_figli?: number;
  reddito_annuo_dichiarato?: number;
}

function validateInput(p: FvSolarLeadInput): string | null {
  if (!p.archetipo) return "archetipo mancante";
  if (!p.titolo || p.titolo.trim().length < 3) return "titolo troppo corto";
  if (!p.indirizzo || p.indirizzo.trim().length < 5) return "indirizzo troppo corto";
  if (
    typeof p.latitudine !== "number" ||
    p.latitudine < 35 ||
    p.latitudine > 48
  ) {
    return "latitudine fuori range Italia (35-48)";
  }
  if (
    typeof p.longitudine !== "number" ||
    p.longitudine < 6 ||
    p.longitudine > 19
  ) {
    return "longitudine fuori range Italia (6-19)";
  }
  if (
    typeof p.consumo_annuo_kwh !== "number" ||
    p.consumo_annuo_kwh < 500 ||
    p.consumo_annuo_kwh > 100000
  ) {
    return "consumo_annuo_kwh deve essere tra 500 e 100.000";
  }
  return null;
}

function preQualificaIncentivi(p: FvSolarLeadInput): string[] {
  const codici: string[] = [];
  if (
    p.archetipo === "privato_prima" ||
    p.archetipo === "privato_seconda" ||
    p.archetipo === "privato_isee"
  ) {
    codici.push("IVA_10");
    codici.push("RID");
    if (p.prima_casa === true) {
      const sogliaIsee = (p.numero_figli ?? 0) >= 4 ? 30000 : 15000;
      if (p.isee !== undefined && p.isee !== null && p.isee <= sogliaIsee) {
        codici.push("REDDITO_ENERGETICO");
      }
      codici.push("DETR_50_PRIMA");
    } else {
      codici.push("DETR_36_SECONDA");
    }
    if (
      p.popolazione_comune !== undefined &&
      p.popolazione_comune !== null &&
      p.popolazione_comune < 50000
    ) {
      codici.push("CER_INFO");
    }
  } else if (p.archetipo === "pmi") {
    codici.push("RID");
    codici.push("AMMORTAMENTO_PMI");
  }
  return codici;
}

Deno.serve(async (req: Request) => {
  const corsHeaders = getCorsHeaders(req);
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });
  if (req.method !== "POST") return errorResponse("Method not allowed", 405, corsHeaders);

  const startTime = Date.now();
  // deno-lint-ignore no-explicit-any
  let supabaseAdmin: any = null;
  let userId: string | null = null;
  let progettoId: string | null = null;

  try {
    const auth = await requireAuth(req, corsHeaders);
    userId = auth.userId;
    supabaseAdmin = auth.supabaseAdmin;

    const payload = (await req.json()) as FvSolarLeadInput;
    const errore = validateInput(payload);
    if (errore) {
      await logFunction(supabaseAdmin, "fv-onboarding-cliente", null, userId, null, payload, 400, errore, Date.now() - startTime);
      return errorResponse(errore, 400, corsHeaders);
    }

    // Company effettiva: gestisce "Visualizza come" / impersonation super-admin
    // (active_impersonations) con fallback a profiles.company_id. Prima si leggeva
    // direttamente profiles.company_id → sotto impersonation tornava "no company_id".
    // BUGFIX multi-azienda: un utente con più aziende (multi_company_access) che
    // cambia tenant col company-switcher del frontend NON crea una riga
    // active_impersonations, quindi resolveEffectiveCompanyId tornava la sua
    // company PRIMARIA. Il progetto veniva creato sotto l'azienda sbagliata e il
    // salvataggio consumi (useAggiornaProgetto, filtrato per la company effettiva
    // del frontend) falliva con "Progetto non trovato o non modificabile". Ora il
    // frontend passa company_id nel body: se presente e accessibile all'utente
    // (canAccessCompany copre multi-company + super_admin) lo usiamo.
    const bodyCompanyId = typeof (payload as { company_id?: unknown }).company_id === "string"
      ? (payload as { company_id: string }).company_id
      : null;
    const company_id = (bodyCompanyId && await canAccessCompany(supabaseAdmin, userId, bodyCompanyId))
      ? bodyCompanyId
      : await resolveEffectiveCompanyId(supabaseAdmin, userId);
    if (!company_id) {
      await logFunction(supabaseAdmin, "fv-onboarding-cliente", null, userId, null, payload, 403, "no company_id", Date.now() - startTime);
      return errorResponse("Company non identificata", 403, corsHeaders);
    }

    // Verifica accesso al modulo Fotovoltaico. UNA fonte sola: la funzione di
    // piano `modulo_fotovoltaico_attivo` (resolve_company_feature), la stessa
    // che guardano la rotta della pagina, il menu e i moduli di vendita.
    // Accesso se access_level ≠ 'disabled'/'hidden'.
    // Fino al 21/09/2026 qui c'era anche il ripiego sulla vecchia colonna
    // `companies.fv_modulo_attivo`: nessuna schermata la accende più, e le
    // aziende che l'avevano accesa hanno tutte il modulo nel piano. Due fonti
    // per la stessa cosa erano il motivo per cui la pagina diceva «contatta il
    // team» a chi il modulo lo aveva (Renova, Best Infissi, Bagni Milano).
    const { data: featRows, error: featErr } = await supabaseAdmin.rpc("resolve_company_feature", {
      p_company_id: company_id,
      p_feature_key: "modulo_fotovoltaico_attivo",
    });
    if (featErr) {
      // Non sapere non vuol dire «non attivo»: si dice il vero e si riprova.
      await logFunction(supabaseAdmin, "fv-onboarding-cliente", company_id, userId, null, payload, 503, `verifica modulo non riuscita: ${featErr.message}`, Date.now() - startTime);
      return errorResponse("Non riesco a verificare il modulo Fotovoltaico: riprova tra poco", 503, corsHeaders);
    }
    let moduloAttivo = false;
    if (Array.isArray(featRows) && featRows.length > 0) {
      const lvl = (featRows[0] as { access_level?: string }).access_level;
      moduloAttivo = lvl != null && lvl !== "disabled" && lvl !== "hidden";
    }
    if (!moduloAttivo) {
      await logFunction(supabaseAdmin, "fv-onboarding-cliente", company_id, userId, null, payload, 403, "modulo fotovoltaico non attivo", Date.now() - startTime);
      return errorResponse("Modulo Fotovoltaico non attivo per questa azienda", 403, corsHeaders);
    }

    // Genera numero progressivo
    const { data: numero } = await supabaseAdmin.rpc("fv_genera_numero_progetto", {
      p_company_id: company_id,
    });

    // Crea progetto
    const { data: progetto, error: errCreate } = await supabaseAdmin
      .from("fv_progetti")
      .insert({
        company_id,
        cliente_id: payload.cliente_id ?? null,
        opportunita_crm_id: payload.opportunita_crm_id ?? null,
        numero,
        titolo: payload.titolo,
        // Snapshot recapiti cliente (per ripristino bozza, anche senza CRM).
        cliente_nome: payload.cliente_nome ?? null,
        cliente_cognome: payload.cliente_cognome ?? null,
        cliente_telefono: payload.cliente_telefono ?? null,
        cliente_email: payload.cliente_email ?? null,
        archetipo: payload.archetipo,
        stato: "bozza",
        indirizzo: payload.indirizzo,
        comune: payload.comune ?? null,
        provincia: payload.provincia ?? null,
        cap: payload.cap ?? null,
        regione: payload.regione ?? null,
        popolazione_comune: payload.popolazione_comune ?? null,
        latitudine: payload.latitudine,
        longitudine: payload.longitudine,
        tipologia_immobile: payload.tipologia_immobile ?? null,
        superficie_immobile_mq: payload.superficie_immobile_mq ?? null,
        prima_casa: payload.prima_casa ?? null,
        anno_costruzione: payload.anno_costruzione ?? null,
        ha_impianto_esistente: payload.ha_impianto_esistente ?? false,
        consumo_annuo_kwh: payload.consumo_annuo_kwh,
        costo_kwh_attuale: payload.costo_kwh_attuale ?? 0.32,
        tariffa_tipo: payload.tariffa_tipo ?? "monoraria",
        profilo_consumo: payload.profilo_consumo ?? null,
        isee: payload.isee ?? null,
        numero_figli: payload.numero_figli ?? 0,
        reddito_annuo_dichiarato: payload.reddito_annuo_dichiarato ?? null,
        created_by: userId,
        ultima_modifica_by: userId,
      })
      .select()
      .single();

    if (errCreate) {
      await logFunction(supabaseAdmin, "fv-onboarding-cliente", company_id, userId, null, payload, 500, errCreate.message, Date.now() - startTime);
      throw errCreate;
    }

    progettoId = progetto.id;
    const incentivi_pre_qualifica = preQualificaIncentivi(payload);

    // Logga evento
    await supabaseAdmin.from("fv_eventi").insert({
      company_id,
      user_id: userId,
      progetto_id: progettoId,
      evento: "wizard_step_completed",
      step: 1,
      payload: { archetipo: payload.archetipo, prima_casa: payload.prima_casa },
    });

    await logFunction(supabaseAdmin, "fv-onboarding-cliente", company_id, userId, progettoId, payload, 200, null, Date.now() - startTime);

    return jsonResponse(
      {
        progetto_id: progettoId,
        numero: progetto.numero,
        incentivi_pre_qualifica,
        validazione_ok: true,
      },
      200,
      corsHeaders
    );
  } catch (err) {
    if (err instanceof Response) return err;
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[fv-onboarding-cliente] ERROR:", msg);
    if (supabaseAdmin) {
      await logFunction(supabaseAdmin, "fv-onboarding-cliente", null, userId, progettoId, null, 500, msg, Date.now() - startTime);
    }
    // msg loggato server-side e nei function_logs: al client un messaggio generico.
    return errorResponse("Errore interno", 500, corsHeaders);
  }
});

// deno-lint-ignore no-explicit-any
async function logFunction(supabase: any, name: string, company_id: string | null, user_id: string | null, progetto_id: string | null, payload: unknown, status: number, error: string | null, duration: number) {
  try {
    await supabase.from("fv_function_logs").insert({
      function_name: name,
      company_id,
      user_id,
      progetto_id,
      request_payload: redactSensitive(payload),
      response_status: status,
      error_message: error,
      duration_ms: duration,
    });
  } catch {
    // silently fail
  }
}

function redactSensitive(payload: unknown): unknown {
  if (!payload || typeof payload !== "object") return payload;
  const obj = { ...(payload as Record<string, unknown>) };
  // Redact fields PII
  ["telefono", "email", "indirizzo", "isee", "reddito_annuo_dichiarato"].forEach((f) => {
    if (f in obj) obj[f] = "***";
  });
  return obj;
}
