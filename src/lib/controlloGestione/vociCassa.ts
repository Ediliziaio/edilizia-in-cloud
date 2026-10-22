/**
 * Voci del rendiconto di cassa (cash flow statement) e mappa categoria → voce.
 *
 * Le categorie arrivano dai dati veri:
 *  - prima nota (`prima_nota_entries.category`: «Incassi fatture», «pagamento_fornitore»,
 *    «subappalti», «stipendi», «giroconto», «altro»…);
 *  - spese (`company_costs.category`: «materiali», «trasporti_noleggi», «INPS», «affitti»,
 *    «leasing», «interessi», «commercialista»…), usata quando la prima nota dice solo «altro»;
 *  - movimenti del Previsionale (`FORECAST_CATEGORIES` + fonte + categoria della spesa);
 *  - voci manuali del Controllo di gestione (categoria scelta nell'editor).
 * Ciò che non si riconosce va in «Altri incassi» / «Altre uscite» e si conta come non classificato.
 */
import type { ForecastMovement } from "@/lib/finance/forecastLedger";

export type GruppoCassa = "incassi" | "uscite" | "investimenti" | "finanziamenti";

export type VoceCassa =
  | "inc_clienti"
  | "inc_acconti"
  | "inc_incentivi"
  | "inc_altri"
  | "inc_giroconti"
  | "inc_manuali"
  | "usc_materiali"
  | "usc_subappalti"
  | "usc_personale"
  | "usc_contributi"
  | "usc_iva"
  | "usc_generali"
  | "usc_consulenze"
  | "usc_mezzi"
  | "usc_provvigioni"
  | "usc_blocca_prezzo"
  | "usc_altre"
  | "usc_giroconti"
  | "usc_manuali"
  | "inv_cespiti"
  | "inv_manuali"
  | "fin_mutui_capitale"
  | "fin_mutui_interessi"
  | "fin_leasing"
  | "fin_entrate"
  | "fin_soci_uscite"
  | "fin_manuali";

export interface DefinizioneVoce {
  key: VoceCassa;
  gruppo: GruppoCassa;
  label: string;
  /** Se falsa, la riga si mostra solo quando ha almeno un importo. */
  sempre: boolean;
  /** Spiegazione breve (tooltip). */
  aiuto?: string;
}

/** Ordine delle righe nella tabella. */
export const VOCI_CASSA: DefinizioneVoce[] = [
  { key: "inc_clienti", gruppo: "incassi", label: "Da clienti (fatture e rate delle commesse)", sempre: true },
  { key: "inc_acconti", gruppo: "incassi", label: "Acconti dai clienti", sempre: true },
  { key: "inc_incentivi", gruppo: "incassi", label: "Incentivi e bonus (blocca prezzo, sconto in fattura)", sempre: true },
  { key: "inc_altri", gruppo: "incassi", label: "Altri incassi", sempre: true },
  { key: "inc_giroconti", gruppo: "incassi", label: "Giroconti in entrata (tra i tuoi conti)", sempre: false, aiuto: "Soldi spostati da un tuo conto all'altro: si compensano con i giroconti in uscita." },
  { key: "inc_manuali", gruppo: "incassi", label: "Voci manuali (solo Controllo di gestione)", sempre: false },
  { key: "usc_materiali", gruppo: "uscite", label: "Fornitori di materiali", sempre: true },
  { key: "usc_subappalti", gruppo: "uscite", label: "Subappalti e squadre esterne", sempre: true },
  { key: "usc_personale", gruppo: "uscite", label: "Personale (stipendi netti)", sempre: true },
  { key: "usc_contributi", gruppo: "uscite", label: "Contributi, ritenute e F24", sempre: true },
  { key: "usc_iva", gruppo: "uscite", label: "IVA versata", sempre: true },
  { key: "usc_generali", gruppo: "uscite", label: "Affitti, utenze e costi generali", sempre: true },
  { key: "usc_consulenze", gruppo: "uscite", label: "Consulenze (commercialista, consulente del lavoro)", sempre: true },
  { key: "usc_mezzi", gruppo: "uscite", label: "Carburanti, mezzi e trasporti", sempre: true },
  { key: "usc_provvigioni", gruppo: "uscite", label: "Provvigioni dei venditori", sempre: false },
  { key: "usc_blocca_prezzo", gruppo: "uscite", label: "Blocca prezzo da restituire", sempre: false },
  { key: "usc_altre", gruppo: "uscite", label: "Altre uscite", sempre: true },
  { key: "usc_giroconti", gruppo: "uscite", label: "Giroconti in uscita (tra i tuoi conti)", sempre: false, aiuto: "Soldi spostati da un tuo conto all'altro: si compensano con i giroconti in entrata." },
  { key: "usc_manuali", gruppo: "uscite", label: "Voci manuali (solo Controllo di gestione)", sempre: false },
  { key: "inv_cespiti", gruppo: "investimenti", label: "Acquisto di attrezzature e mezzi", sempre: true },
  { key: "inv_manuali", gruppo: "investimenti", label: "Voci manuali (solo Controllo di gestione)", sempre: false },
  { key: "fin_mutui_capitale", gruppo: "finanziamenti", label: "Rate mutui · quota capitale", sempre: true },
  { key: "fin_mutui_interessi", gruppo: "finanziamenti", label: "Rate mutui · interessi", sempre: true },
  { key: "fin_leasing", gruppo: "finanziamenti", label: "Canoni di leasing", sempre: true },
  { key: "fin_entrate", gruppo: "finanziamenti", label: "Nuovi finanziamenti e versamenti dei soci", sempre: true },
  { key: "fin_soci_uscite", gruppo: "finanziamenti", label: "Dividendi e rimborsi ai soci", sempre: false },
  { key: "fin_manuali", gruppo: "finanziamenti", label: "Voci manuali (solo Controllo di gestione)", sempre: false },
];

export const GRUPPI_CASSA: { key: GruppoCassa; label: string; totale: string }[] = [
  { key: "incassi", label: "Incassi", totale: "Totale incassi" },
  { key: "uscite", label: "Uscite della gestione", totale: "Totale uscite della gestione" },
  { key: "investimenti", label: "Investimenti", totale: "Totale investimenti" },
  { key: "finanziamenti", label: "Finanziamenti", totale: "Totale finanziamenti" },
];

export const VOCE_PER_CHIAVE = new Map(VOCI_CASSA.map((v) => [v.key, v]));

/** «Pagamento Fornitore», «materiali-edili», «Materiali e forniture» → «pagamento_fornitore», … */
export function normalizzaCategoria(c: string | null | undefined): string {
  return (c ?? "")
    .trim()
    .toLocaleLowerCase("it-IT")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

/** Categorie che non dicono niente: si guarda la spesa collegata o il resto. */
const CATEGORIE_VUOTE = new Set(["", "altro", "altri", "varie", "generico", "generica", "costi_aziendali", "uscita", "entrata"]);

/** Categoria di un'uscita → voce. Le chiavi sono normalizzate. */
export const MAPPA_USCITE: Record<string, VoceCassa> = {
  // Fornitori di materiali
  materiali: "usc_materiali",
  materiali_edili: "usc_materiali",
  materiali_e_forniture: "usc_materiali",
  materie_prime: "usc_materiali",
  merci: "usc_materiali",
  acquisti: "usc_materiali",
  forniture: "usc_materiali",
  fornitore: "usc_materiali",
  fornitori: "usc_materiali",
  pagamento_fornitore: "usc_materiali",
  pagamento_fornitori: "usc_materiali",
  // Subappalti e squadre
  subappalti: "usc_subappalti",
  subappalto: "usc_subappalti",
  squadre: "usc_subappalti",
  squadre_esterne: "usc_subappalti",
  manodopera: "usc_subappalti",
  manodopera_esterna: "usc_subappalti",
  // Personale
  stipendi: "usc_personale",
  stipendio: "usc_personale",
  salari: "usc_personale",
  salari_stipendi: "usc_personale",
  personale: "usc_personale",
  tfr: "usc_personale",
  rimborsi_dipendenti: "usc_personale",
  // Contributi, ritenute, imposte
  inps: "usc_contributi",
  inail: "usc_contributi",
  cassa_edile: "usc_contributi",
  f24: "usc_contributi",
  tasse: "usc_contributi",
  imposte: "usc_contributi",
  imposte_e_contributi: "usc_contributi",
  imposte_tasse: "usc_contributi",
  contributi: "usc_contributi",
  ritenute: "usc_contributi",
  irpef: "usc_contributi",
  ires: "usc_contributi",
  irap: "usc_contributi",
  imu: "usc_contributi",
  // IVA
  iva: "usc_iva",
  iva_versata: "usc_iva",
  // Costi generali
  affitti: "usc_generali",
  affitto: "usc_generali",
  immobili: "usc_generali",
  utenze: "usc_generali",
  telefonia: "usc_generali",
  assicurazioni: "usc_generali",
  assicurazione: "usc_generali",
  cancelleria: "usc_generali",
  struttura_servizi: "usc_generali",
  servizi: "usc_generali",
  servizi_generali: "usc_generali",
  software: "usc_generali",
  marketing: "usc_generali",
  marketing_pubblicita: "usc_generali",
  pubblicita: "usc_generali",
  rifiuti: "usc_generali",
  smaltimento_rifiuti: "usc_generali",
  manutenzione: "usc_generali",
  manutenzioni: "usc_generali",
  formazione: "usc_generali",
  trasferte: "usc_generali",
  viaggi_trasferte: "usc_generali",
  sicurezza: "usc_generali",
  spese_bancarie: "usc_generali",
  commissioni_bancarie: "usc_generali",
  // Consulenze
  commercialista: "usc_consulenze",
  consulenza_lavoro: "usc_consulenze",
  consulenze: "usc_consulenze",
  consulenza: "usc_consulenze",
  consulenze_professionali: "usc_consulenze",
  professionisti: "usc_consulenze",
  legale: "usc_consulenze",
  notaio: "usc_consulenze",
  // Carburanti, mezzi, trasporti
  carburante: "usc_mezzi",
  carburanti: "usc_mezzi",
  trasporti: "usc_mezzi",
  trasporti_noleggi: "usc_mezzi",
  trasporti_logistica: "usc_mezzi",
  veicoli: "usc_mezzi",
  mezzi: "usc_mezzi",
  noleggi: "usc_mezzi",
  noleggio: "usc_mezzi",
  noleggio_mezzi_attrezzature: "usc_mezzi",
  // Provvigioni
  provvigioni: "usc_provvigioni",
  // Investimenti
  attrezzature: "inv_cespiti",
  cespiti: "inv_cespiti",
  investimenti: "inv_cespiti",
  macchinari: "inv_cespiti",
  // Finanziamenti
  leasing: "fin_leasing",
  interessi: "fin_mutui_interessi",
  interessi_passivi: "fin_mutui_interessi",
  mutuo: "fin_mutui_capitale",
  mutui: "fin_mutui_capitale",
  rata_mutuo: "fin_mutui_capitale",
  finanziamento: "fin_mutui_capitale",
  finanziamenti: "fin_mutui_capitale",
  dividendo: "fin_soci_uscite",
  dividendi: "fin_soci_uscite",
  prelievo_soci: "fin_soci_uscite",
  // Tra conti
  giroconto: "usc_giroconti",
  giroconti: "usc_giroconti",
};

/** Categoria di un'entrata → voce. */
export const MAPPA_ENTRATE: Record<string, VoceCassa> = {
  incassi_fatture: "inc_clienti",
  incasso_fattura: "inc_clienti",
  incassi_clienti: "inc_clienti",
  incasso_cliente: "inc_clienti",
  incasso: "inc_clienti",
  incassi: "inc_clienti",
  clienti: "inc_clienti",
  sal: "inc_clienti",
  saldo: "inc_clienti",
  balance: "inc_clienti",
  acconto: "inc_acconti",
  acconti: "inc_acconti",
  caparra: "inc_acconti",
  anticipo_cliente: "inc_acconti",
  deposit: "inc_acconti",
  bonus: "inc_incentivi",
  incentivi: "inc_incentivi",
  contributi_pubblici: "inc_incentivi",
  sconto_in_fattura: "inc_incentivi",
  cessione_credito: "inc_incentivi",
  blocca_prezzo: "inc_incentivi",
  conto_termico: "inc_incentivi",
  finanziamento: "fin_entrate",
  finanziamenti: "fin_entrate",
  mutuo: "fin_entrate",
  anticipo_socio: "fin_entrate",
  versamento_soci: "fin_entrate",
  apporto_soci: "fin_entrate",
  immissione_capitale: "fin_entrate",
  giroconto: "inc_giroconti",
  giroconti: "inc_giroconti",
};

export interface Classificazione {
  voce: VoceCassa;
  /** Vero se è finito in «Altri incassi» / «Altre uscite» perché la categoria non si riconosce. */
  nonClassificato: boolean;
}

/** Categorie che dicono solo «pagato un fornitore». */
const CATEGORIE_FORNITORE = new Set(["pagamento_fornitore", "pagamento_fornitori", "fornitore", "fornitori"]);

const ALTRO_IN: Classificazione = { voce: "inc_altri", nonClassificato: true };
const ALTRO_OUT: Classificazione = { voce: "usc_altre", nonClassificato: true };

function daMappa(direzione: "in" | "out", categoria: string | null | undefined): VoceCassa | null {
  const c = normalizzaCategoria(categoria);
  if (CATEGORIE_VUOTE.has(c)) return null;
  return (direzione === "in" ? MAPPA_ENTRATE : MAPPA_USCITE)[c] ?? null;
}

/** Un movimento di prima nota: prima la sua categoria, poi quella della spesa collegata, poi i collegamenti. */
export function classificaRegistrato(m: {
  direction: string;
  category: string | null | undefined;
  costCategory?: string | null;
  installmentType?: string | null;
  supplierId?: string | null;
  orderItemId?: string | null;
  invoiceId?: string | null;
  documentoFiscaleId?: string | null;
  installmentId?: string | null;
}): Classificazione {
  const dir = m.direction === "entrata" ? "in" : "out";
  if (dir === "in") {
    // Un incasso collegato a una rata «acconto» è un acconto, anche se la categoria dice «incasso».
    if (normalizzaCategoria(m.installmentType) === "deposit") return { voce: "inc_acconti", nonClassificato: false };
    const voce = daMappa("in", m.category);
    if (voce) return { voce, nonClassificato: false };
    if (m.invoiceId || m.documentoFiscaleId || m.installmentId) return { voce: "inc_clienti", nonClassificato: false };
    return ALTRO_IN;
  }
  // «pagamento_fornitore» dice solo chi è stato pagato: se la spesa collegata dice cosa (affitto,
  // commercialista, subappalto…), vale la spesa.
  const voce = CATEGORIE_FORNITORE.has(normalizzaCategoria(m.category))
    ? daMappa("out", m.costCategory) ?? daMappa("out", m.category)
    : daMappa("out", m.category) ?? daMappa("out", m.costCategory);
  if (voce) return { voce, nonClassificato: false };
  if (m.supplierId || m.orderItemId) return { voce: "usc_materiali", nonClassificato: false };
  return ALTRO_OUT;
}

/** Un movimento atteso del Previsionale. */
export function classificaPrevisto(m: Pick<ForecastMovement, "category" | "direction" | "source" | "description" | "sourceCategory">): Classificazione {
  if (m.direction === "in") {
    if (m.category === "blocca-prezzo") return { voce: "inc_incentivi", nonClassificato: false };
    if (normalizzaCategoria(m.sourceCategory) === "deposit") return { voce: "inc_acconti", nonClassificato: false };
    if (m.category === "clienti") return { voce: "inc_clienti", nonClassificato: false };
    const voce = daMappa("in", m.sourceCategory);
    return voce ? { voce, nonClassificato: false } : ALTRO_IN;
  }
  switch (m.category) {
    case "blocca-prezzo":
      return { voce: "usc_blocca_prezzo", nonClassificato: false };
    case "squadre":
      return { voce: "usc_subappalti", nonClassificato: false };
    case "personale":
      return { voce: "usc_personale", nonClassificato: false };
    case "provvigioni":
      return { voce: "usc_provvigioni", nonClassificato: false };
    case "fisco":
      return {
        voce: m.source === "Stima IVA" || /\biva\b/i.test(m.description) ? "usc_iva" : "usc_contributi",
        nonClassificato: false,
      };
    default: {
      // Fornitori e altri costi: la categoria della spesa, se c'è, dice di più.
      const voce = daMappa("out", m.sourceCategory);
      if (voce) return { voce, nonClassificato: false };
      if (m.category === "fornitori") return { voce: "usc_materiali", nonClassificato: false };
      return ALTRO_OUT;
    }
  }
}

/** Categorie delle voci manuali che sono finanziamenti (versamenti dei soci, mutui, dividendi…). */
const MANUALI_FINANZIAMENTI = new Set([
  "anticipo_socio", "immissione_capitale", "dividendo", "mutuo", "leasing", "finanziamento", "versamento_soci",
]);
const MANUALI_INVESTIMENTI = new Set(["attrezzature", "cespiti", "investimenti", "macchinari"]);

/** Una voce manuale del CdG resta «voce manuale», ma dentro il gruppo giusto. */
export function classificaManuale(categoria: string | null | undefined, tipo: "entrata" | "uscita"): VoceCassa {
  const c = normalizzaCategoria(categoria);
  if (MANUALI_FINANZIAMENTI.has(c)) return "fin_manuali";
  if (MANUALI_INVESTIMENTI.has(c)) return "inv_manuali";
  return tipo === "entrata" ? "inc_manuali" : "usc_manuali";
}
