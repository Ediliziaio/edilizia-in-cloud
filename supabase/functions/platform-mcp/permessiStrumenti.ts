// Cosa può fare l'assistente collegato da un dipendente (25/11/2026).
//
// «Un operaio che collega Claude non può fare tutto.» Gli strumenti girano col
// service role: il limite lo mette questa tabella, che per ogni strumento dice
// quali permessi dell'app (riga staff_permissions dell'utente) servono. Presa
// dalla mappa di Silvio (DOMAIN_STAFF_PERMISSION, silvioPermissionContracts).
//
// Regole per chi NON è amministratore dell'azienda:
// - strumento assente dalla tabella → negato (fail-closed);
// - ogni requisito deve essere vero: una stringa è un permesso, un elenco vuol
//   dire «almeno uno di questi»;
// - le scritture sono negate con sola_lettura e ai ruoli operaio/subappaltatore
//   (SOLO_LETTURA_PER_RUOLO dell'app);
// - gli strumenti «ampi» restituiscono righe di tutta l'azienda senza filtrare
//   per utente: negati a chi vede solo ciò che gli è assegnato (only_assigned)
//   e a operai e subappaltatori;
// - «importi» segue l'app: vero salvo che sia spento esplicitamente;
//   «costi» = Costi o Acquisti.
// Amministratori e super admin: tutto, come prima.

export type Requisito = string | string[];
export interface RegolaStrumento { permessi: Requisito[]; ampio?: boolean }

export interface Attore {
  admin: boolean;
  ruolo: string;
  permessi: Record<string, unknown> | null;
}

export const RUOLI_COLLEGABILI = ["company_staff", "salesperson", "call_center", "employee", "subcontractor"];
const SOLO_LETTURA_PER_RUOLO = ["employee", "subcontractor"];

const CONTATTI = ["can_view_marketing_contacts", "can_view_customers"];
const CALENDARIO = ["can_view_calendar", "can_view_marketing_appointments"];
const POSTA = "can_view_marketing_email";

export const REGOLE_STRUMENTI: Record<string, RegolaStrumento> = {
  guida_piattaforma: { permessi: [] },
  // CRM
  cerca_contatti: { permessi: [CONTATTI], ampio: true },
  cerca_contatto: { permessi: [CONTATTI], ampio: true },
  crea_contatto: { permessi: [["can_edit_marketing_contacts", "can_edit_customers"]] },
  crea_lead: { permessi: [["can_edit_marketing_contacts", "can_edit_customers"]] },
  lista_opportunita: { permessi: ["can_view_marketing_opportunities"], ampio: true },
  crea_opportunita: { permessi: ["can_edit_marketing_opportunities"] },
  aggiorna_opportunita: { permessi: ["can_edit_marketing_opportunities"], ampio: true },
  lista_attivita: { permessi: ["can_view_team_tasks"], ampio: true },
  crea_attivita: { permessi: [] },
  crea_promemoria: { permessi: [] },
  crea_reclamo: { permessi: [["can_edit_tickets", "can_edit_marketing_contacts"]] },
  // Commesse
  cerca_commesse: { permessi: ["can_view_orders"], ampio: true },
  riepilogo_commesse: { permessi: ["can_view_orders", "importi"], ampio: true },
  flusso_commessa: { permessi: ["can_view_orders"], ampio: true },
  crea_commessa: { permessi: ["can_edit_orders"] },
  // Filtrano già per utente nel database (can_see_order).
  commesse_generali: { permessi: ["can_view_orders"] },
  commessa_generale: { permessi: ["can_view_orders"] },
  scadenze_generali: { permessi: ["can_view_orders"] },
  cantieri_a_rischio: { permessi: ["can_view_orders", "can_view_margins"], ampio: true },
  dove_sono_mezzi_attrezzi: { permessi: ["can_view_mezzi"] },
  mezzi_del_cantiere: { permessi: ["can_view_mezzi"] },
  // Listino
  lista_listino: { permessi: [["can_view_settings_pricing", "can_view_preventivi"]] },
  carica_voce_listino: { permessi: ["can_edit_settings_pricing", "costi"] },
  // Numeri
  statistiche_azienda: { permessi: [["can_view_cruscotto", "can_view_financial_reports"]], ampio: true },
  kpi_azienda: { permessi: [["can_view_cruscotto", "can_view_financial_reports"]], ampio: true },
  performance_mensile: { permessi: [["can_view_cruscotto", "can_view_financial_reports"]], ampio: true },
  serie_grafico: { permessi: [["can_view_cruscotto", "can_view_financial_reports"]], ampio: true },
  cashflow: { permessi: ["can_view_tesoreria", "can_view_bank_balances"], ampio: true },
  quadro_incassi: { permessi: ["can_view_orders", "importi"], ampio: true },
  pagamenti_in_ritardo: { permessi: ["can_view_orders", "importi"], ampio: true },
  scadenze_pagamenti: { permessi: [["can_view_scadenzario", "can_view_billing"]], ampio: true },
  previsione_ricavi: { permessi: ["can_view_forecast", "can_view_bank_balances"], ampio: true },
  previsione_pipeline: { permessi: ["can_view_marketing_opportunities", "importi"], ampio: true },
  top_clienti: { permessi: ["can_view_customers", "importi"], ampio: true },
  // Preventivi
  riepilogo_preventivi: { permessi: ["can_view_preventivi"], ampio: true },
  preventivi_da_ricontattare: { permessi: ["can_view_preventivi"], ampio: true },
  probabilita_chiusura: { permessi: ["can_view_preventivi"] },
  azione_su_preventivo: { permessi: ["can_view_preventivi"] },
  richieste_preventivo: { permessi: [POSTA], ampio: true },
  proponi_voci_preventivo: { permessi: ["can_edit_preventivi"] },
  crea_preventivo: { permessi: ["can_edit_preventivi"] },
  pdf_preventivo: { permessi: ["can_view_preventivi"] },
  invia_preventivo_in_firma: { permessi: ["can_edit_preventivi"] },
  // Magazzino e acquisti
  magazzino: { permessi: ["can_view_warehouse"], ampio: true },
  stockout_imminenti: { permessi: ["can_view_warehouse"], ampio: true },
  fornitori: { permessi: [["can_manage_suppliers", "can_view_settings_suppliers", "can_manage_purchasing"]] },
  proposta_ordine_fornitore: { permessi: ["can_manage_purchasing"] },
  // Persone e sicurezza
  team: { permessi: [["can_view_employees", "can_view_persone"]], ampio: true },
  dipendenti_oggi: { permessi: [["can_view_employees", "can_view_persone"]], ampio: true },
  registra_assenza: { permessi: [["can_edit_operai", "can_edit_settings_people"]] },
  documenti_in_scadenza: { permessi: ["can_view_sicurezza_cantiere"], ampio: true },
  scadenze_durc: { permessi: ["can_view_sicurezza_cantiere"], ampio: true },
  subappaltatori: { permessi: ["can_view_subappaltatori"], ampio: true },
  // Calendario
  slot_liberi: { permessi: [CALENDARIO] },
  fissa_appuntamento: { permessi: [CALENDARIO] },
  crea_sopralluogo: { permessi: [["can_view_sopralluoghi", "can_view_calendar"]] },
  // Posta e invii (gli invii veri restano agli amministratori: il consenso del dipendente non li ha)
  posta_da_lavorare: { permessi: [POSTA], ampio: true },
  stato_invio: { permessi: [POSTA] },
  invia_email: { permessi: [POSTA] },
  invia_messaggio: { permessi: [POSTA] },
  invia_followup_preventivo: { permessi: ["can_edit_preventivi"] },
  invia_sollecito_pagamento: { permessi: ["can_manage_payments", "can_view_billing"] },
  // File dall'assistente
  link_caricamento: { permessi: [["can_edit_preventivi", "can_edit_orders"]] },
  carica_file_dalla_chat: { permessi: [["can_edit_preventivi", "can_edit_orders"]] },
  leggi_file_caricato: { permessi: [["can_edit_preventivi", "can_edit_orders"]] },
  importa_computo: { permessi: ["can_edit_preventivi"] },
};

function vero(permessi: Record<string, unknown>, chiave: string): boolean {
  if (chiave === "importi") return permessi.can_view_order_amounts !== false;
  if (chiave === "costi") return permessi.can_view_costs === true || permessi.can_manage_purchasing === true;
  return permessi[chiave] === true;
}

/** Perché lo strumento è negato a questo utente, o null se può usarlo. */
export function motivoNegato(attore: Attore | undefined, nome: string, scrive: boolean): string | null {
  if (attore?.admin) return null;
  if (!attore) return "Permessi dell'utente non verificabili.";
  if (!RUOLI_COLLEGABILI.includes(attore.ruolo)) return "Il tuo ruolo non può usare l'assistente su questa azienda.";
  const regola = REGOLE_STRUMENTI[nome];
  if (!regola) return "Strumento riservato agli amministratori dell'azienda.";
  const p = attore.permessi;
  if (!p) return "Nessun permesso impostato per il tuo utente: chiedi all'amministratore.";
  if (scrive && (p.sola_lettura === true || SOLO_LETTURA_PER_RUOLO.includes(attore.ruolo))) {
    return "Il tuo accesso è in sola lettura: l'assistente non può modificare niente.";
  }
  if (regola.ampio && (p.only_assigned === true || SOLO_LETTURA_PER_RUOLO.includes(attore.ruolo))) {
    return "Vedi solo ciò che ti è assegnato: questo strumento mostrerebbe dati di tutta l'azienda.";
  }
  for (const req of regola.permessi) {
    const ok = Array.isArray(req) ? req.some((k) => vero(p, k)) : vero(p, req);
    if (!ok) return `Non hai il permesso per questa area (${Array.isArray(req) ? req.join(" o ") : req}).`;
  }
  return null;
}
