// ═══════════════════════════════════════════════════════════════════════════
// silvioTools.ts — ponte tra il server MCP e il catalogo di funzioni interne
// silvio_tool_* (gli strumenti dell'assistente Silvio, ~186 RPC SECURITY DEFINER,
// tutte legate all'azienda via p_company_id).
//
// Un'azienda che collega Claude/ChatGPT ottiene qui le stesse capacità di
// Silvio, con l'ambito FORZATO dalla chiave: p_company_id è quello della chiave
// (mai un valore scelto dal client) e p_user_id è chi ha emesso la chiave.
//
// Non si espongono tutte le 186: si cura la lista. Fuori restano quelle che
// «applicano» risultati già calcolati da un'AI (prendono punteggi/qualità come
// input) o che dipendono da upload su storage: non hanno senso per un assistente
// esterno. Ogni strumento ha uno scope; gli invii reali e gli strumenti a
// pagamento stanno dietro lo scope dedicato «actions:sensitive», spento di serie.
//
// Aggiungere uno strumento = una riga nelle tabelle FASE_*. Il fattore
// makeSilvioTool costruisce lo schema e il handler.
// ═══════════════════════════════════════════════════════════════════════════
import { type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { type KeyCtx, type ToolDef, ToolError, resolveCompany } from "./lib.ts";

type TipoParam = "string" | "number" | "boolean" | "date" | "timestamp" | "time" | "uuid" | "uuid[]" | "json";

interface Param {
  /** Nome esposto all'AI. Il nome RPC è `p_<arg>` salvo `rpc` esplicito. */
  arg: string;
  rpc?: string;
  tipo: TipoParam;
  descrizione: string;
  obbligatorio?: boolean;
}

interface SilvioSpec {
  /** Nome dello strumento MCP (quello che l'AI vede). */
  name: string;
  /** Funzione RPC silvio_tool_*. */
  rpc: string;
  scope: string;
  description: string;
  params?: Param[];
  /** Aggiunge p_user_id = chi ha emesso la chiave. */
  injectUser?: boolean;
}

function schemaTipo(t: TipoParam): Record<string, unknown> {
  switch (t) {
    case "number": return { type: "number" };
    case "boolean": return { type: "boolean" };
    case "uuid[]": return { type: "array", items: { type: "string" } };
    case "json": return { type: "object" };
    // date (YYYY-MM-DD), timestamp (ISO), time (HH:MM), uuid, string
    default: return { type: "string" };
  }
}

/** Converte il valore in ingresso; `undefined` = non fornito/da ignorare. */
function coerce(v: unknown, t: TipoParam): unknown {
  if (v === null || v === undefined) return undefined;
  switch (t) {
    case "number": return typeof v === "number" && Number.isFinite(v) ? v : undefined;
    case "boolean": return typeof v === "boolean" ? v : undefined;
    case "json": return typeof v === "object" ? v : undefined;
    case "uuid[]": return Array.isArray(v) ? v.filter((x) => typeof x === "string" && x) : undefined;
    default: return typeof v === "string" && v.trim() !== "" ? v.trim() : undefined;
  }
}

function makeSilvioTool(spec: SilvioSpec): ToolDef {
  const properties: Record<string, unknown> = {};
  const required: string[] = [];
  for (const p of spec.params ?? []) {
    properties[p.arg] = { ...schemaTipo(p.tipo), description: p.descrizione };
    if (p.obbligatorio) required.push(p.arg);
  }
  // Le chiavi di piattaforma indicano l'azienda con "company"; per le chiavi
  // d'azienda è ignorato.
  properties["company"] = { type: "string", description: "Nome o UUID azienda (solo chiavi piattaforma)" };

  return {
    name: spec.name,
    description: spec.description,
    scope: spec.scope,
    inputSchema: { type: "object", properties, required: required.length ? required : undefined, additionalProperties: false },
    handler: async (admin: SupabaseClient, ctx: KeyCtx, args: Record<string, unknown>) => {
      const company = await resolveCompany(admin, ctx, args);
      const rpcArgs: Record<string, unknown> = { p_company_id: company.id };
      if (spec.injectUser) rpcArgs.p_user_id = ctx.created_by;
      for (const p of spec.params ?? []) {
        const val = coerce(args[p.arg], p.tipo);
        if (val === undefined) {
          if (p.obbligatorio) throw new ToolError(`Parametro '${p.arg}' obbligatorio`);
          continue;
        }
        rpcArgs[p.rpc ?? `p_${p.arg}`] = val;
      }
      const { data, error } = await admin.rpc(spec.rpc, rpcArgs);
      if (error) throw new ToolError(error.message);
      return { azienda: company.name, risultato: data };
    },
  };
}

// ── FASE 1 — Lettura e analisi (nessuna scrittura) ──────────────────────────
const FASE_1_LETTURA: SilvioSpec[] = [
  { name: "kpi_azienda", rpc: "silvio_tool_company_kpi", scope: "stats:read",
    description: "KPI dell'azienda: team, venduto/fatturato/incassato, note di lettura." },
  { name: "performance_mensile", rpc: "silvio_tool_monthly_performance", scope: "stats:read",
    description: "Performance di un mese specifico.",
    params: [{ arg: "anno", rpc: "p_year", tipo: "number", descrizione: "Anno", obbligatorio: true },
             { arg: "mese", rpc: "p_month", tipo: "number", descrizione: "Mese 1-12", obbligatorio: true }] },
  { name: "cashflow", rpc: "silvio_tool_cashflow_status", scope: "stats:read",
    description: "Saldo dei conti e stato del flusso di cassa.",
    params: [{ arg: "giorni_indietro", rpc: "p_days_back", tipo: "number", descrizione: "Finestra in giorni (default 30)" }] },
  { name: "quadro_incassi", rpc: "silvio_tool_quadro_incassi", scope: "stats:read",
    description: "Incassi e scaduto degli ultimi mesi.",
    params: [{ arg: "mesi", rpc: "p_mesi", tipo: "number", descrizione: "Quanti mesi indietro" }] },
  { name: "pagamenti_in_ritardo", rpc: "silvio_tool_overdue_payments", scope: "stats:read",
    description: "Fatture/rate scadute e non incassate." },
  { name: "previsione_ricavi", rpc: "silvio_tool_revenue_forecast", scope: "stats:read",
    description: "Previsione di ricavi sui prossimi giorni.",
    params: [{ arg: "giorni_avanti", rpc: "p_days_ahead", tipo: "number", descrizione: "Orizzonte in giorni" }] },
  { name: "previsione_pipeline", rpc: "silvio_tool_get_pipeline_forecast", scope: "stats:read",
    description: "Previsione della pipeline commerciale.",
    params: [{ arg: "orizzonte_giorni", rpc: "p_horizon_days", tipo: "number", descrizione: "Orizzonte in giorni" }] },
  { name: "serie_grafico", rpc: "silvio_tool_serie_grafico", scope: "stats:read",
    description: "Serie temporale di una metrica per grafici.",
    params: [{ arg: "metrica", rpc: "p_metric", tipo: "string", descrizione: "Nome metrica", obbligatorio: true },
             { arg: "mesi", rpc: "p_mesi", tipo: "number", descrizione: "Quanti mesi" }] },
  { name: "top_clienti", rpc: "silvio_tool_top_customers", scope: "stats:read",
    description: "I migliori clienti per valore.",
    params: [{ arg: "limite", rpc: "p_limit", tipo: "number", descrizione: "Quanti (default 10)" }] },
  { name: "scadenze_pagamenti", rpc: "silvio_tool_lista_scadenze", scope: "stats:read", injectUser: true,
    description: "Scadenze di pagamento in arrivo.",
    params: [{ arg: "giorni_avanti", rpc: "p_days_ahead", tipo: "number", descrizione: "Finestra in giorni" },
             { arg: "solo_non_pagate", rpc: "p_only_unpaid", tipo: "boolean", descrizione: "Solo le non pagate" }] },

  { name: "riepilogo_commesse", rpc: "silvio_tool_orders_summary", scope: "orders:read",
    description: "Riepilogo commesse/cantieri, filtrabile per stato.",
    params: [{ arg: "stato", rpc: "p_status", tipo: "string", descrizione: "Filtro stato" },
             { arg: "limite", rpc: "p_limit", tipo: "number", descrizione: "Quante" }] },
  { name: "flusso_commessa", rpc: "silvio_tool_flusso_commessa", scope: "orders:read",
    description: "Stato e flusso di una commessa (per codice o id).",
    params: [{ arg: "codice", rpc: "p_order_code", tipo: "string", descrizione: "Codice commessa" },
             { arg: "commessa_id", rpc: "p_order_id", tipo: "uuid", descrizione: "UUID commessa" }] },
  { name: "cantieri_a_rischio", rpc: "silvio_tool_lista_cantieri_a_rischio", scope: "orders:read",
    description: "Cantieri a rischio (ritardo, margine, ecc.).",
    params: [{ arg: "rischio_minimo", rpc: "p_risk_level_min", tipo: "string", descrizione: "Soglia rischio (es. medio/alto)" }] },

  { name: "riepilogo_preventivi", rpc: "silvio_tool_quotes_summary", scope: "quotes:read",
    description: "Riepilogo preventivi, filtrabile per stato.",
    params: [{ arg: "stato", rpc: "p_status", tipo: "string", descrizione: "Filtro stato" }] },
  { name: "preventivi_da_ricontattare", rpc: "silvio_tool_identifica_quotes_da_followup", scope: "quotes:read",
    description: "Preventivi che meritano un follow-up, per priorità.",
    params: [{ arg: "soglia_priorita", rpc: "p_priority_threshold", tipo: "number", descrizione: "Soglia priorità 0-1" }] },
  { name: "probabilita_chiusura", rpc: "silvio_tool_stima_probabilita_close_quote", scope: "quotes:read",
    description: "Stima la probabilità di chiudere un preventivo.",
    params: [{ arg: "preventivo_id", rpc: "p_quote_id", tipo: "uuid", descrizione: "UUID preventivo", obbligatorio: true }] },
  { name: "azione_su_preventivo", rpc: "silvio_tool_suggerisci_azione_per_quote", scope: "quotes:read",
    description: "Suggerisce la prossima azione su un preventivo.",
    params: [{ arg: "preventivo_id", rpc: "p_quote_id", tipo: "uuid", descrizione: "UUID preventivo", obbligatorio: true }] },
  { name: "richieste_preventivo", rpc: "silvio_tool_richieste_preventivo", scope: "quotes:read", injectUser: true,
    description: "Richieste di preventivo in arrivo.",
    params: [{ arg: "limite", rpc: "p_limit", tipo: "number", descrizione: "Quante" }] },

  { name: "magazzino", rpc: "silvio_tool_warehouse_status", scope: "warehouse:read",
    description: "Stato del magazzino/scorte.",
    params: [{ arg: "cerca", rpc: "p_search", tipo: "string", descrizione: "Testo da cercare" }] },
  { name: "stockout_imminenti", rpc: "silvio_tool_lista_stockout_imminenti", scope: "warehouse:read", injectUser: true,
    description: "Materiali che stanno per finire.",
    params: [{ arg: "giorni_avanti", rpc: "p_days_ahead", tipo: "number", descrizione: "Finestra in giorni" }] },
  { name: "fornitori", rpc: "silvio_tool_suppliers_summary", scope: "warehouse:read",
    description: "Riepilogo fornitori.",
    params: [{ arg: "cerca", rpc: "p_search", tipo: "string", descrizione: "Testo da cercare" }] },

  { name: "team", rpc: "silvio_tool_team_summary", scope: "hr:read",
    description: "Riepilogo del team/personale." },
  { name: "dipendenti_oggi", rpc: "silvio_tool_lista_dipendenti_oggi", scope: "hr:read", injectUser: true,
    description: "Dipendenti e loro stato di oggi.",
    params: [{ arg: "solo_attivi", rpc: "p_only_active", tipo: "boolean", descrizione: "Solo attivi" }] },
  { name: "documenti_in_scadenza", rpc: "silvio_tool_lista_documenti_in_scadenza", scope: "safety:read", injectUser: true,
    description: "Documenti (patenti, visite, certificati) in scadenza.",
    params: [{ arg: "giorni_avanti", rpc: "p_days_ahead", tipo: "number", descrizione: "Finestra in giorni" }] },
  { name: "scadenze_durc", rpc: "silvio_tool_lista_scadenze_durc", scope: "safety:read", injectUser: true,
    description: "DURC in scadenza (azienda e subappaltatori).",
    params: [{ arg: "giorni", rpc: "p_giorni", tipo: "number", descrizione: "Finestra in giorni" }] },
  { name: "subappaltatori", rpc: "silvio_tool_subappaltatori_summary", scope: "safety:read",
    description: "Riepilogo subappaltatori e conformità." },

  { name: "cerca_contatto", rpc: "silvio_tool_lookup_contact_live", scope: "contacts:read",
    description: "Cerca un contatto per email, telefono o nome.",
    params: [{ arg: "email", rpc: "p_email", tipo: "string", descrizione: "Email" },
             { arg: "telefono", rpc: "p_phone", tipo: "string", descrizione: "Telefono" },
             { arg: "nome", rpc: "p_name_hint", tipo: "string", descrizione: "Nome (anche parziale)" }] },
  { name: "posta_da_lavorare", rpc: "silvio_tool_posta_da_lavorare", scope: "email:read", injectUser: true,
    description: "Email in arrivo che richiedono una risposta o un'azione.",
    params: [{ arg: "giorni_indietro", rpc: "p_days_back", tipo: "number", descrizione: "Finestra in giorni" },
             { arg: "limite", rpc: "p_limit", tipo: "number", descrizione: "Quante" }] },
  { name: "slot_liberi", rpc: "silvio_tool_trova_slot_liberi", scope: "appointments:read", injectUser: true,
    description: "Trova slot liberi in agenda per un appuntamento.",
    params: [{ arg: "durata_minuti", rpc: "p_durata_minuti", tipo: "number", descrizione: "Durata in minuti", obbligatorio: true },
             { arg: "giorni_avanti", rpc: "p_giorni_avanti", tipo: "number", descrizione: "Entro quanti giorni" },
             { arg: "orario_inizio", rpc: "p_orario_inizio", tipo: "time", descrizione: "Ora inizio finestra HH:MM" },
             { arg: "orario_fine", rpc: "p_orario_fine", tipo: "time", descrizione: "Ora fine finestra HH:MM" }] },
];

// ── FASE 2 — Azioni sicure (creano bozze/righe, non inviano nulla) ──────────
const FASE_2_AZIONI: SilvioSpec[] = [
  { name: "crea_promemoria", rpc: "silvio_tool_crea_promemoria", scope: "tasks:write", injectUser: true,
    description: "Crea un promemoria/attività con eventuale data.",
    params: [{ arg: "titolo", rpc: "p_title", tipo: "string", descrizione: "Titolo", obbligatorio: true },
             { arg: "nota", rpc: "p_note", tipo: "string", descrizione: "Nota" },
             { arg: "ricorda_il", rpc: "p_remind_on", tipo: "date", descrizione: "Data promemoria YYYY-MM-DD" }] },
  { name: "crea_reclamo", rpc: "silvio_tool_create_complaint", scope: "contacts:write",
    description: "Registra un reclamo di un cliente.",
    params: [{ arg: "fonte", rpc: "p_source", tipo: "string", descrizione: "Canale: email | whatsapp | telegram | web_form | phone | review_google | review_facebook | visit_in_person | manual (default manual)" },
             { arg: "testo", rpc: "p_raw_text", tipo: "string", descrizione: "Testo del reclamo", obbligatorio: true },
             { arg: "nome_cliente", rpc: "p_customer_name", tipo: "string", descrizione: "Nome cliente" },
             { arg: "email", rpc: "p_customer_email", tipo: "string", descrizione: "Email cliente" },
             { arg: "telefono", rpc: "p_customer_phone", tipo: "string", descrizione: "Telefono cliente" }] },
  { name: "crea_lead", rpc: "silvio_tool_crea_lead_first_touch", scope: "contacts:write", injectUser: true,
    description: "Crea un lead in arrivo (primo contatto).",
    params: [{ arg: "canale", rpc: "p_source_channel", tipo: "string", descrizione: "Provenienza: meta_lead_ads | google_ads | tiktok_lead | linkedin | website_form | whatsapp_inbound | telegram_inbound | missed_call | email_inbound | referral", obbligatorio: true },
             { arg: "nome", rpc: "p_contact_name", tipo: "string", descrizione: "Nome" },
             { arg: "telefono", rpc: "p_contact_phone", tipo: "string", descrizione: "Telefono" },
             { arg: "email", rpc: "p_contact_email", tipo: "string", descrizione: "Email" },
             { arg: "indirizzo", rpc: "p_contact_address", tipo: "string", descrizione: "Indirizzo" },
             { arg: "interesse", rpc: "p_vertical_interest", tipo: "string", descrizione: "Interesse (es. serramenti)" }] },
  { name: "proposta_ordine_fornitore", rpc: "silvio_tool_crea_proposta_ordine_fornitore", scope: "warehouse:write", injectUser: true,
    description: "Crea una PROPOSTA di ordine a fornitore (bozza, non inviata).",
    params: [{ arg: "fornitore_id", rpc: "p_supplier_id", tipo: "uuid", descrizione: "UUID fornitore", obbligatorio: true },
             { arg: "cantiere_id", rpc: "p_for_cantiere_id", tipo: "uuid", descrizione: "UUID cantiere" },
             { arg: "articoli", rpc: "p_items", tipo: "json", descrizione: "Righe {descrizione, quantita, prezzo}" },
             { arg: "motivo", rpc: "p_proposal_reason", tipo: "string", descrizione: "Perché" },
             { arg: "totale_eur", rpc: "p_total_amount_eur", tipo: "number", descrizione: "Totale stimato €" }] },
  { name: "blocca_slot_calendario", rpc: "silvio_tool_blocca_slot_calendario", scope: "appointments:write", injectUser: true,
    description: "Blocca uno slot in agenda (indisponibilità).",
    params: [{ arg: "inizio", rpc: "p_inizio", tipo: "timestamp", descrizione: "Inizio ISO", obbligatorio: true },
             { arg: "fine", rpc: "p_fine", tipo: "timestamp", descrizione: "Fine ISO", obbligatorio: true },
             { arg: "motivo", rpc: "p_motivo", tipo: "string", descrizione: "Motivo" }] },
  { name: "registra_assenza", rpc: "silvio_tool_registra_assenza", scope: "hr:write", injectUser: true,
    description: "Registra un'assenza di un dipendente.",
    params: [{ arg: "dipendente_id", rpc: "p_employee_id", tipo: "uuid", descrizione: "UUID dipendente", obbligatorio: true },
             { arg: "data_inizio", rpc: "p_data_inizio", tipo: "date", descrizione: "Dal YYYY-MM-DD", obbligatorio: true },
             { arg: "data_fine", rpc: "p_data_fine", tipo: "date", descrizione: "Al YYYY-MM-DD", obbligatorio: true },
             { arg: "tipo", rpc: "p_tipo_assenza", tipo: "string", descrizione: "Tipo: ferie | permesso_retribuito | malattia | infortunio | maternita | congedo_studio | sciopero | permesso_legge_104 | rol | altro", obbligatorio: true },
             { arg: "ore_giorno", rpc: "p_ore_giorno", tipo: "number", descrizione: "Ore al giorno" },
             { arg: "note", rpc: "p_note", tipo: "string", descrizione: "Note" }] },
];

// ── FASE 3 — Invii reali e strumenti a pagamento (scope dedicato, off) ──────
const FASE_3_SENSIBILI: SilvioSpec[] = [
  { name: "invia_messaggio", rpc: "silvio_tool_componi_e_invia_messaggio", scope: "actions:sensitive", injectUser: true,
    description: "Compone e INVIA DAVVERO un messaggio a un contatto/cliente sul canale scelto.",
    params: [{ arg: "destinatario_tipo", rpc: "p_dest_tipo", tipo: "string", descrizione: "Tipo destinatario (contatto/cliente)", obbligatorio: true },
             { arg: "destinatario_id", rpc: "p_dest_id", tipo: "uuid", descrizione: "UUID destinatario", obbligatorio: true },
             { arg: "canale", rpc: "p_canale", tipo: "string", descrizione: "email/whatsapp/sms", obbligatorio: true },
             { arg: "oggetto", rpc: "p_oggetto", tipo: "string", descrizione: "Oggetto (email)" },
             { arg: "corpo", rpc: "p_corpo", tipo: "string", descrizione: "Testo del messaggio", obbligatorio: true },
             { arg: "scopo", rpc: "p_scopo", tipo: "string", descrizione: "Scopo (per il log)" }] },
  { name: "invia_followup_preventivo", rpc: "silvio_tool_invia_followup_preventivo", scope: "actions:sensitive", injectUser: true,
    description: "INVIA DAVVERO un follow-up su un preventivo.",
    params: [{ arg: "cliente_id", rpc: "p_cliente_id", tipo: "uuid", descrizione: "UUID cliente", obbligatorio: true },
             { arg: "preventivo_id", rpc: "p_quote_id", tipo: "uuid", descrizione: "UUID preventivo", obbligatorio: true },
             { arg: "canale", rpc: "p_canale", tipo: "string", descrizione: "email/whatsapp" }] },
  { name: "invia_sollecito_pagamento", rpc: "silvio_tool_invia_sollecito_pagamento", scope: "actions:sensitive", injectUser: true,
    description: "INVIA DAVVERO un sollecito di pagamento su una fattura.",
    params: [{ arg: "cliente_id", rpc: "p_cliente_id", tipo: "uuid", descrizione: "UUID cliente", obbligatorio: true },
             { arg: "fattura_id", rpc: "p_fattura_id", tipo: "uuid", descrizione: "UUID fattura", obbligatorio: true },
             { arg: "tono", rpc: "p_tono", tipo: "string", descrizione: "Tono (cortese/fermo)" },
             { arg: "canale", rpc: "p_canale", tipo: "string", descrizione: "email/whatsapp" }] },
];

export const SILVIO_TOOLS: ToolDef[] = [
  ...FASE_1_LETTURA,
  ...FASE_2_AZIONI,
  ...FASE_3_SENSIBILI,
].map(makeSilvioTool);
