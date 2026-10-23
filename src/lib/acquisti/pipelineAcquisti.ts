/**
 * Pipeline degli acquisti — una sola regola per decidere dove sta ogni cosa.
 *
 *   Da ordinare       materiali validati dal tecnico ancora liberi (né offerta
 *                     né ordine) + ordini in bozza, non ancora mandati
 *   Richiesta d'offerta  richieste aperte (bozza, inviata, in valutazione)
 *   Ordinato          ordini inviati o confermati
 *   In consegna       ordini arrivati in parte
 *   Consegnato        ordini ricevuti
 *
 * Un materiale in offerta o in un ordine non si ripete: lo rappresenta la
 * richiesta o l'ordine che lo contiene. Gli annullati e le richieste chiuse o
 * aggiudicate (che sono diventate un ordine) restano fuori.
 *
 * I filtri (commessa, fornitore, fase, solo in ritardo, ricerca) sono gli
 * stessi per la pipeline e per l'elenco, e vivono nell'URL.
 */
import type { MaterialeFase } from "@/hooks/useMaterialiPerFase";

export interface MaterialeAcquisti extends MaterialeFase {
  commessa: string;
  fase: string;
  posizioneFase: number;
  /** Richiesta d'offerta in cui il materiale è stato chiesto. */
  rfqId: string | null;
  /** Ordini d'acquisto (non annullati) che coprono la riga. */
  odaIds: string[];
}

/** Il minimo di un ordine d'acquisto che serve alla pipeline. */
export interface OdaPipeline {
  id: string;
  oda_number: string;
  status: string;
  supplier_id: string | null;
  order_id: string | null;
  total: number | string | null;
  issue_date: string | null;
  expected_delivery_date: string | null;
  actual_delivery_date?: string | null;
  suppliers?: { name: string } | null;
  orders?: { order_code: string | null } | null;
}

/** Il minimo di una richiesta d'offerta che serve alla pipeline. */
export interface RfqPipeline {
  id: string;
  rfq_number: string;
  titolo: string;
  status: string;
  order_id: string | null;
  scadenza_offerte: string | null;
  data_fabbisogno: string | null;
  supplier_id_aggiudicato: string | null;
  created_at: string;
  orders?: { order_code: string | null } | null;
}

export interface ContatoriRfqPipeline {
  invitati: number;
  risposte: number;
  migliore: number | null;
  /** Fornitori invitati: servono al filtro per fornitore. */
  fornitori?: string[];
}

export type ColonnaId = "da_ordinare" | "offerta" | "ordinato" | "in_consegna" | "consegnato";

export const COLONNE: { id: ColonnaId; titolo: string; descrizione: string; colore: string }[] = [
  { id: "da_ordinare", titolo: "Da ordinare", descrizione: "Materiali validati e ordini in bozza", colore: "#64748b" },
  { id: "offerta", titolo: "Richiesta d'offerta", descrizione: "In attesa dei prezzi dei fornitori", colore: "#d97706" },
  { id: "ordinato", titolo: "Ordinato", descrizione: "Inviati o confermati dal fornitore", colore: "#2563eb" },
  { id: "in_consegna", titolo: "In consegna", descrizione: "Arrivati in parte", colore: "#7c3aed" },
  { id: "consegnato", titolo: "Consegnato", descrizione: "Merce ricevuta", colore: "#059669" },
];

export const STATI_RFQ_APERTE = ["bozza", "inviata", "in_valutazione"];

export interface FiltriAcquisti {
  /** null = tutte; "_nessuna" = senza commessa (scorte, attrezzatura). */
  commessa: string | null;
  /** null = tutti; "_nessuno" = materiali senza fornitore. */
  fornitore: string | null;
  /** id della fase (order_work_phases). */
  fase: string | null;
  soloRitardo: boolean;
  cerca: string;
}

export const FILTRI_VUOTI: FiltriAcquisti = { commessa: null, fornitore: null, fase: null, soloRitardo: false, cerca: "" };

export type VistaAcquisti = "pipeline" | "elenco";

/** Filtri e vista dall'URL: chi copia il link ritrova la stessa schermata. */
export function leggiFiltriAcquisti(params: URLSearchParams): FiltriAcquisti & { vista: VistaAcquisti } {
  return {
    vista: params.get("vista") === "elenco" ? "elenco" : "pipeline",
    commessa: params.get("commessa") || null,
    fornitore: params.get("forn") || null,
    fase: params.get("fase") || null,
    soloRitardo: params.get("ritardo") === "1",
    cerca: params.get("cerca") ?? "",
  };
}

/** Scrive un filtro nell'URL; i valori vuoti spariscono dall'indirizzo. */
export function scriviFiltroAcquisti(params: URLSearchParams, chiave: string, valore: string | null | boolean): URLSearchParams {
  const p = new URLSearchParams(params);
  const v = typeof valore === "boolean" ? (valore ? "1" : null) : valore;
  if (v == null || v === "") p.delete(chiave);
  else p.set(chiave, v);
  return p;
}

function giorniTra(da: string, a: string): number {
  return Math.floor((new Date(a).getTime() - new Date(da).getTime()) / 86400000);
}

/**
 * Giorni di ritardo di un ordine, o null. In ritardo = mandato al fornitore,
 * data di consegna passata, merce non ancora tutta arrivata. Bozze e annullati
 * non possono esserlo: le prime non le ha viste nessuno, i secondi non arrivano.
 */
export function giorniRitardoOda(o: Pick<OdaPipeline, "status" | "expected_delivery_date">, oggi: string): number | null {
  if (!o.expected_delivery_date) return null;
  if (!["inviato", "confermato", "parziale"].includes(o.status)) return null;
  const d = o.expected_delivery_date.slice(0, 10);
  if (d >= oggi) return null;
  const gg = giorniTra(d, oggi);
  return gg > 0 ? gg : null;
}

/** Una richiesta aperta è in ritardo se la scadenza delle offerte è passata. */
export function giorniRitardoRfq(r: Pick<RfqPipeline, "status" | "scadenza_offerte">, oggi: string): number | null {
  if (!r.scadenza_offerte || !STATI_RFQ_APERTE.includes(r.status)) return null;
  const d = r.scadenza_offerte.slice(0, 10);
  if (d >= oggi) return null;
  const gg = giorniTra(d, oggi);
  return gg > 0 ? gg : null;
}

/** In quale colonna va un ordine (null = fuori dalla pipeline: annullato). */
export function colonnaOda(status: string): ColonnaId | null {
  switch (status) {
    case "bozza": return "da_ordinare";
    case "inviato":
    case "confermato": return "ordinato";
    case "parziale": return "in_consegna";
    case "ricevuto": return "consegnato";
    default: return null;
  }
}

export interface CartaAcquisto {
  tipo: "oda" | "rfq";
  id: string;
  numero: string;
  /** Fornitore (ordine) o titolo (richiesta). */
  titolo: string;
  commessa: string | null;
  orderId: string | null;
  importo: number | null;
  /** Consegna prevista (ordine) o scadenza delle offerte (richiesta). */
  data: string | null;
  etichettaData: string;
  ritardo: number | null;
  stato: string;
  /** Una riga in più: «2/3 risposte», «Bozza da mandare». */
  nota: string | null;
  href: string;
}

export interface ColonnaAcquisti {
  id: ColonnaId;
  titolo: string;
  descrizione: string;
  colore: string;
  carte: CartaAcquisto[];
  /** Solo nella colonna «Da ordinare». */
  materiali: MaterialeAcquisti[];
  conteggio: number;
  importo: number;
  /** Carte non mostrate per non allungare la colonna (vedi l'elenco). */
  nascoste: number;
}

const contiene = (testo: string | null | undefined, q: string) => (testo ?? "").toLowerCase().includes(q);

export const importoMateriale = (m: Pick<MaterialeFase, "purchase_price" | "quantity">) =>
  (Number(m.purchase_price) || 0) * (Number(m.quantity) || 0);

/** Ordini e richieste che toccano una fase: lo dicono i materiali della fase. */
function indiciFase(materiali: MaterialeAcquisti[], fase: string | null) {
  if (!fase) return null;
  const oda = new Set<string>();
  const rfq = new Set<string>();
  for (const m of materiali) {
    if (m.phase_id !== fase) continue;
    for (const id of m.odaIds) oda.add(id);
    if (m.rfqId) rfq.add(m.rfqId);
  }
  return { oda, rfq };
}

export function materialeVisibile(m: MaterialeAcquisti, f: FiltriAcquisti): boolean {
  if (f.soloRitardo) return false; // un materiale da ordinare non ha ancora una data da mancare
  if (f.commessa && m.order_id !== f.commessa) return false;
  if (f.fornitore === "_nessuno" ? !!m.supplier_id : f.fornitore && m.supplier_id !== f.fornitore) return false;
  if (f.fase && m.phase_id !== f.fase) return false;
  const q = f.cerca.trim().toLowerCase();
  if (q && !(contiene(m.name, q) || contiene(m.specifiche, q) || contiene(m.commessa, q) || contiene(m.fase, q))) return false;
  return true;
}

export function odaVisibile(o: OdaPipeline, f: FiltriAcquisti, oggi: string, faseOda: Set<string> | null): boolean {
  if (f.commessa === "_nessuna" ? !!o.order_id : f.commessa && o.order_id !== f.commessa) return false;
  if (f.fornitore === "_nessuno" || (f.fornitore && o.supplier_id !== f.fornitore)) return false;
  if (faseOda && !faseOda.has(o.id)) return false;
  if (f.soloRitardo && giorniRitardoOda(o, oggi) === null) return false;
  const q = f.cerca.trim().toLowerCase();
  if (q && !(contiene(o.oda_number, q) || contiene(o.suppliers?.name, q) || contiene(o.orders?.order_code, q))) return false;
  return true;
}

function rfqVisibile(r: RfqPipeline, c: ContatoriRfqPipeline | undefined, f: FiltriAcquisti, oggi: string, faseRfq: Set<string> | null): boolean {
  if (f.commessa === "_nessuna" ? !!r.order_id : f.commessa && r.order_id !== f.commessa) return false;
  if (f.fornitore === "_nessuno") return false;
  if (f.fornitore && r.supplier_id_aggiudicato !== f.fornitore && !(c?.fornitori ?? []).includes(f.fornitore)) return false;
  if (faseRfq && !faseRfq.has(r.id)) return false;
  if (f.soloRitardo && giorniRitardoRfq(r, oggi) === null) return false;
  const q = f.cerca.trim().toLowerCase();
  if (q && !(contiene(r.rfq_number, q) || contiene(r.titolo, q) || contiene(r.orders?.order_code, q))) return false;
  return true;
}

/** Gli ordini che passano i filtri comuni: li usa anche la vista elenco. */
export function filtraOda<T extends OdaPipeline>(oda: T[], materiali: MaterialeAcquisti[], f: FiltriAcquisti, oggi: string): T[] {
  const fase = indiciFase(materiali, f.fase);
  return oda.filter((o) => odaVisibile(o, f, oggi, fase?.oda ?? null));
}

function cartaOda(o: OdaPipeline, oggi: string): CartaAcquisto {
  return {
    tipo: "oda",
    id: o.id,
    numero: o.oda_number,
    titolo: o.suppliers?.name ?? "Fornitore",
    commessa: o.orders?.order_code ?? null,
    orderId: o.order_id,
    importo: Number(o.total) || 0,
    data: o.status === "ricevuto" ? (o.actual_delivery_date ?? o.expected_delivery_date) : o.expected_delivery_date,
    etichettaData: o.status === "ricevuto" ? "arrivato" : "consegna",
    ritardo: giorniRitardoOda(o, oggi),
    stato: o.status,
    nota: o.status === "bozza" ? "Bozza da mandare" : null,
    href: `/azienda/ordini-acquisto/${o.id}`,
  };
}

function cartaRfq(r: RfqPipeline, c: ContatoriRfqPipeline | undefined, oggi: string): CartaAcquisto {
  const invitati = c?.invitati ?? 0;
  const risposte = c?.risposte ?? 0;
  return {
    tipo: "rfq",
    id: r.id,
    numero: r.rfq_number,
    titolo: r.titolo,
    commessa: r.orders?.order_code ?? null,
    orderId: r.order_id,
    importo: c?.migliore ?? null,
    data: r.scadenza_offerte,
    etichettaData: "scadenza",
    ritardo: giorniRitardoRfq(r, oggi),
    stato: r.status,
    nota: invitati === 0 ? "Nessun fornitore invitato" : `${risposte}/${invitati} risposte`,
    href: `/azienda/richieste-offerta/${r.id}`,
  };
}

/** Ritardi in cima (dal più grave), poi per data più vicina; senza data in fondo. */
function ordinaCarte(a: CartaAcquisto, b: CartaAcquisto): number {
  if ((b.ritardo ?? 0) !== (a.ritardo ?? 0)) return (b.ritardo ?? 0) - (a.ritardo ?? 0);
  if (a.data && b.data) return a.data.localeCompare(b.data);
  if (a.data) return -1;
  if (b.data) return 1;
  return a.numero.localeCompare(b.numero, "it", { numeric: true });
}

/** Quante carte mostrare al massimo nella colonna dei consegnati. */
export const MASSIMO_CONSEGNATI = 40;

export function costruisciPipeline(input: {
  materiali: MaterialeAcquisti[];
  rfqs: RfqPipeline[];
  contatori: Record<string, ContatoriRfqPipeline>;
  oda: OdaPipeline[];
  filtri: FiltriAcquisti;
  oggi: string;
}): ColonnaAcquisti[] {
  const { materiali, rfqs, contatori, oda, filtri, oggi } = input;
  const colonne = new Map<ColonnaId, ColonnaAcquisti>(
    COLONNE.map((c) => [c.id, { ...c, carte: [] as CartaAcquisto[], materiali: [] as MaterialeAcquisti[], conteggio: 0, importo: 0, nascoste: 0 }]),
  );
  const fase = indiciFase(materiali, filtri.fase);

  for (const m of materiali) {
    if (m.stato !== "da_ordinare" || !materialeVisibile(m, filtri)) continue;
    const col = colonne.get("da_ordinare")!;
    col.materiali.push(m);
    col.conteggio += 1;
    col.importo += importoMateriale(m);
  }

  for (const r of rfqs) {
    if (!STATI_RFQ_APERTE.includes(r.status)) continue;
    if (!rfqVisibile(r, contatori[r.id], filtri, oggi, fase?.rfq ?? null)) continue;
    const col = colonne.get("offerta")!;
    const carta = cartaRfq(r, contatori[r.id], oggi);
    col.carte.push(carta);
    col.conteggio += 1;
    col.importo += carta.importo ?? 0;
  }

  for (const o of oda) {
    const id = colonnaOda(o.status);
    if (!id || !odaVisibile(o, filtri, oggi, fase?.oda ?? null)) continue;
    const col = colonne.get(id)!;
    col.carte.push(cartaOda(o, oggi));
    col.conteggio += 1;
    col.importo += Number(o.total) || 0;
  }

  for (const col of colonne.values()) {
    col.importo = Math.round(col.importo * 100) / 100;
    if (col.id === "consegnato") {
      // I più recenti per primi; i vecchi restano nell'elenco.
      col.carte.sort((a, b) => (b.data ?? "").localeCompare(a.data ?? ""));
      col.nascoste = Math.max(0, col.carte.length - MASSIMO_CONSEGNATI);
      col.carte = col.carte.slice(0, MASSIMO_CONSEGNATI);
    } else {
      col.carte.sort(ordinaCarte);
    }
  }
  return [...colonne.values()];
}

/** Materiali raggruppati per commessa › fase (le fasi nell'ordine della commessa). */
export function raggruppaMateriali(materiali: MaterialeAcquisti[]) {
  const m = new Map<string, { orderId: string; commessa: string; fasi: Map<string, { id: string; nome: string; posizione: number; materiali: MaterialeAcquisti[] }> }>();
  for (const x of materiali) {
    const c = m.get(x.order_id) ?? { orderId: x.order_id, commessa: x.commessa, fasi: new Map() };
    const chiave = x.phase_id ?? "_senza";
    const f = c.fasi.get(chiave) ?? { id: chiave, nome: x.fase, posizione: x.posizioneFase, materiali: [] };
    f.materiali.push(x);
    c.fasi.set(chiave, f);
    m.set(x.order_id, c);
  }
  return [...m.values()]
    .sort((a, b) => a.commessa.localeCompare(b.commessa, "it", { numeric: true }))
    .map((c) => ({ ...c, fasi: [...c.fasi.values()].sort((a, b) => a.posizione - b.posizione) }));
}
