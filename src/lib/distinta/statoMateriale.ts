/**
 * La scala unica dello stato di un materiale della commessa.
 *
 * Prima la stessa riga aveva tre stati con nomi diversi: lo stato scritto
 * sulla riga (order_items.status), lo stato dell'ordine collegato e lo stato
 * d'acquisto calcolato. La testata contava uno, i filtri un altro, le righe un
 * terzo: «0 da ordinare» in alto e «6 Da Ordinare» nel filtro, sulla stessa
 * commessa. Qui c'è UNA scala, calcolata da tutti i dati insieme, e testata,
 * fasi, filtri e righe la leggono da questa funzione.
 *
 *   Da ordinare → In offerta → In bozza d'ordine → Ordinato → Consegnato → Installato
 *
 * Regole, dalla più avanzata:
 *   - Installato: la riga è segnata «installato».
 *   - Consegnato: gli ordini emessi hanno ricevuto tutta la quantità prevista;
 *     oppure la riga è segnata in magazzino / disponibile. Se l'unità dell'ordine
 *     è diversa da quella della riga le quantità non si confrontano: conta che
 *     ogni riga d'ordine emessa sia arrivata per intero.
 *   - Ordinato: c'è almeno un ordine emesso (inviato, confermato, parziale,
 *     ricevuto in parte) o la riga è segnata ordinata / in produzione / in arrivo.
 *     Se è arrivato qualcosa ma non tutto, il dettaglio lo dice.
 *   - In bozza d'ordine: c'è un ordine collegato ancora in bozza.
 *   - In offerta: la riga è in una richiesta d'offerta.
 *   - Da ordinare: niente di tutto questo.
 * Gli ordini annullati non contano.
 */
import { ODA_STATI_EMESSI } from "@/lib/odaStatus";
import { normalizzaUnita } from "./generaDistinta";

export type StatoMateriale = "da_ordinare" | "in_offerta" | "in_bozza_oda" | "ordinato" | "consegnato" | "installato";

export const SCALA_STATI: StatoMateriale[] = ["da_ordinare", "in_offerta", "in_bozza_oda", "ordinato", "consegnato", "installato"];

export const ETICHETTA_STATO_MATERIALE: Record<StatoMateriale, string> = {
  da_ordinare: "Da ordinare",
  in_offerta: "In offerta",
  in_bozza_oda: "In bozza d'ordine",
  ordinato: "Ordinato",
  consegnato: "Consegnato",
  installato: "Installato",
};

/** Gli stati in cui il materiale aspetta ancora un ordine emesso. */
export const STATI_DA_ORDINARE: StatoMateriale[] = ["da_ordinare", "in_offerta"];
/** Gli stati in cui il materiale è arrivato. */
export const STATI_ARRIVATI: StatoMateriale[] = ["consegnato", "installato"];

export interface RigaOrdineCollegata {
  order_item_id: string | null;
  quantity: number;
  quantity_received: number;
  unit_of_measure?: string | null;
  purchase_orders: {
    id?: string;
    oda_number: string;
    status: string;
    issue_date?: string | null;
    expected_delivery_date?: string | null;
    actual_delivery_date?: string | null;
  };
}

export interface OrdineDellaRiga {
  numero: string;
  stato: string;
  /** Data dell'ordine (emissione). */
  data: string | null;
  /** Arrivo: effettivo se c'è, altrimenti previsto. */
  arrivo: string | null;
  arrivato: boolean;
}

export interface InfoStatoMateriale {
  stato: StatoMateriale;
  /** «Arrivati 3 di 10», «Arrivo parziale»: solo quando serve. */
  dettaglio: string | null;
  ordini: OrdineDellaRiga[];
  /** L'ordine usa un'unità diversa dalla riga: le quantità non si confrontano. */
  unitaDaVerificare: { unitaRiga: string; unitaOrdine: string[] } | null;
  /**
   * La differenza si sistema senza rischi: la riga vale 1 pezzo (o non ha
   * unità) e ogni riga d'ordine è 1 «a corpo». Allineare vuol dire scrivere
   * «a corpo» sulla riga della commessa; l'ordine non si tocca.
   */
  allineaA: string | null;
}

export interface RigaPerStato {
  id?: string;
  quantity: number;
  status?: string | null;
  supplier_rfq_item_id?: string | null;
  unita_misura?: string | null;
}

const STATI_RIGA_ARRIVATI = ["in_magazzino", "disponibile"];
const STATI_RIGA_ORDINATI = ["ordinato", "in_arrivo", "in_produzione", "in_lavorazione"];

/** Come la confronta planMaterial: minuscole, vuota = pezzi. */
const unitaGrezza = (u: string | null | undefined) => (u ?? "").trim().toLowerCase();
const unitaRigaDi = (r: { unita_misura?: string | null }) => unitaGrezza(r.unita_misura) || "pz";

export const eACorpo = (u: string | null | undefined) => normalizzaUnita(u) === "a corpo";

const arrotonda = (n: number) => Math.round(n * 1_000_000) / 1_000_000;
const num = (n: unknown) => (Number.isFinite(Number(n)) ? Number(n) : 0);
const numero = (n: number) => n.toLocaleString("it-IT", { maximumFractionDigits: 2 });

export function statoMateriale(riga: RigaPerStato, copertura: RigaOrdineCollegata[]): InfoStatoMateriale {
  const q = num(riga.quantity);
  const attive = copertura.filter((c) => (riga.id == null || c.order_item_id === riga.id) && c.purchase_orders?.status !== "annullato");
  const emesse = attive.filter((c) => (ODA_STATI_EMESSI as string[]).includes(c.purchase_orders.status));
  const bozze = attive.filter((c) => c.purchase_orders.status === "bozza");

  const unitaRiga = unitaRigaDi(riga);
  const diverse = [...new Set(attive.map((c) => unitaGrezza(c.unit_of_measure)).filter((u) => u && u !== unitaRiga))];
  const unitaDaVerificare = diverse.length ? { unitaRiga, unitaOrdine: diverse } : null;
  const allineaA = unitaDaVerificare
    && unitaRiga === "pz"
    && q === 1 && diverse.length === 1 && eACorpo(diverse[0])
    && attive.every((c) => num(c.quantity) === 1 && unitaGrezza(c.unit_of_measure) === diverse[0])
    ? diverse[0] : null;

  const ordini = new Map<string, OrdineDellaRiga>();
  for (const c of attive) {
    const po = c.purchase_orders;
    const prima = ordini.get(po.oda_number);
    const arrivata = num(c.quantity_received) >= num(c.quantity) && num(c.quantity) > 0;
    ordini.set(po.oda_number, {
      numero: po.oda_number,
      stato: po.status,
      data: po.issue_date ?? null,
      arrivo: po.actual_delivery_date ?? po.expected_delivery_date ?? null,
      arrivato: (prima?.arrivato ?? true) && (arrivata || po.status === "ricevuto"),
    });
  }

  const ordinata = arrotonda(emesse.reduce((n, c) => n + num(c.quantity), 0));
  const ricevuta = arrotonda(emesse.reduce((n, c) => n + num(c.quantity_received), 0));
  const tuttoArrivato = unitaDaVerificare
    ? emesse.length > 0 && emesse.every((c) => c.purchase_orders.status === "ricevuto" || (num(c.quantity) > 0 && num(c.quantity_received) >= num(c.quantity)))
    : q > 0 && ricevuta >= q;

  const info = (stato: StatoMateriale, dettaglio: string | null = null): InfoStatoMateriale => ({
    stato, dettaglio, ordini: [...ordini.values()], unitaDaVerificare, allineaA,
  });

  if (riga.status === "installato") return info("installato");
  if (tuttoArrivato || STATI_RIGA_ARRIVATI.includes(riga.status ?? "")) return info("consegnato");
  if (emesse.length > 0 || STATI_RIGA_ORDINATI.includes(riga.status ?? "")) {
    let dettaglio: string | null = null;
    if (ricevuta > 0) dettaglio = unitaDaVerificare ? "Arrivo parziale" : `Arrivati ${numero(ricevuta)} di ${numero(q)}`;
    else if (!unitaDaVerificare && emesse.length > 0 && ordinata < q) dettaglio = `Ordinati ${numero(ordinata)} di ${numero(q)}`;
    return info("ordinato", dettaglio);
  }
  if (bozze.length > 0) return info("in_bozza_oda");
  if (riga.supplier_rfq_item_id) return info("in_offerta");
  return info("da_ordinare");
}

/** Lo stato d'acquisto di prima (5 valori) portato sulla scala: per le righe che non hanno la copertura. */
export function scalaDaStatoAcquisto(stato: string, status?: string | null): StatoMateriale {
  if (status === "installato") return "installato";
  return (SCALA_STATI as string[]).includes(stato) ? (stato as StatoMateriale) : "da_ordinare";
}

export type ConteggioStati = Record<StatoMateriale, number> & { totale: number };

/** Quanti materiali per stato: lo stesso conto per testata, fasi e filtri. */
export function contaStati(stati: StatoMateriale[]): ConteggioStati {
  const c = { totale: stati.length } as ConteggioStati;
  for (const s of SCALA_STATI) c[s] = 0;
  for (const s of stati) c[s]++;
  return c;
}

/** «2 da ordinare · 1 ordinato»: solo gli stati presenti, nell'ordine della scala. */
export function riassuntoStati(c: ConteggioStati): string {
  return SCALA_STATI.filter((s) => c[s] > 0).map((s) => `${c[s]} ${ETICHETTA_STATO_MATERIALE[s].toLowerCase()}`).join(" · ");
}

/** Una fase è completa quando tutti i suoi materiali sono arrivati. */
export function faseCompleta(c: ConteggioStati): boolean {
  return c.totale > 0 && STATI_ARRIVATI.reduce((n, s) => n + c[s], 0) === c.totale;
}

/**
 * La descrizione da mostrare sotto il nome: senza le etichette tecniche tra
 * parentesi quadre («[DEMO HISTORY 2026 v1]»), e solo se dice qualcosa in più
 * del nome.
 */
export function descrizioneVisibile(nome: string, descrizione: string | null | undefined): string | null {
  const pulita = (descrizione ?? "").replace(/\[[^[\]]*\]/g, " ").replace(/\s+/g, " ").trim();
  if (!pulita) return null;
  const n = (s: string) => s.toLowerCase().replace(/[^a-z0-9àèéìòù]+/g, " ").trim();
  if (n(pulita) === n(nome) || n(nome).includes(n(pulita))) return null;
  return pulita;
}

/** Quantità leggibile: «a corpo» per le voci a corpo, altrimenti «37 pz». */
export function quantitaLeggibile(quantita: number, unita: string | null | undefined, unitaOrdine?: string[] | null): { numero: string; unita: string } {
  const aCorpo = eACorpo(unita) || (!unitaGrezza(unita) && (unitaOrdine ?? []).some(eACorpo));
  if (aCorpo) return { numero: quantita === 1 ? "" : numero(quantita), unita: "a corpo" };
  return { numero: numero(quantita), unita: unitaGrezza(unita) || "pz" };
}
