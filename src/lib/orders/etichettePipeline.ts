import type { OrderDetailDestination } from "@/lib/orders/detailNavigation";
import type { OrderWithDetails } from "@/lib/orderUtils";

export type Tono = "critico" | "attenzione" | "ok" | "neutro";

export interface Etichetta {
  testo: string;
  tono: Tono;
  /** Frase intera, per il suggerimento. */
  dettaglio: string;
}

/** Giorni da oggi alla scadenza: negativo = in ritardo, null = senza data. */
type GiorniAllaScadenza = number | null;

export function inizioOggi(): Date {
  const oggi = new Date();
  oggi.setHours(0, 0, 0, 0);
  return oggi;
}

export function scadenzaPipeline(ordine: Pick<OrderWithDetails, "work_end_date" | "expected_date">) {
  return ordine.work_end_date || ordine.expected_date;
}

export function lavoriCompletati({ fasiPipeline }: Pick<OrderWithDetails, "fasiPipeline">) {
  return !!fasiPipeline?.total && fasiPipeline.done === fasiPipeline.total;
}

export function ritardoLavori(
  ordine: Pick<OrderWithDetails, "work_end_date" | "expected_date" | "fasiPipeline">,
  oggi = inizioOggi(),
): number {
  if (lavoriCompletati(ordine)) return 0;
  const data = scadenzaPipeline(ordine);
  if (!data) return 0;
  const scadenza = new Date(data.length === 10 ? `${data}T00:00:00` : data);
  scadenza.setHours(0, 0, 0, 0);
  return Number.isNaN(scadenza.getTime()) ? 0 : Math.max(0, Math.round((oggi.getTime() - scadenza.getTime()) / 86_400_000));
}

export function statoMateriali(totale: number, pronti: number, daOrdinare: number): Etichetta {
  if (totale === 0) {
    return { testo: "Nessun articolo", tono: "neutro", dettaglio: "Alla commessa non sono stati aggiunti articoli o materiali." };
  }
  const base = `${pronti} su ${totale} articoli sono pronti (in magazzino, prenotati o già installati).`;
  if (pronti >= totale) return { testo: `${pronti}/${totale} pronti`, tono: "ok", dettaglio: base };
  return {
    testo: `${pronti}/${totale} pronti`,
    tono: pronti === 0 ? "critico" : "attenzione",
    dettaglio: `${base}${daOrdinare > 0 ? ` ${daOrdinare} ${daOrdinare === 1 ? "è ancora da ordinare" : "sono ancora da ordinare"}.` : " Gli altri non sono ancora arrivati."}`,
  };
}

export function statoIncasso(totale: number, incassato: number, daIncassare: number): Etichetta {
  if (totale > 0 && daIncassare === 0 && incassato > 0) {
    return { testo: "Pagata", tono: "ok", dettaglio: "La commessa è stata incassata per intero." };
  }
  if (incassato <= 0) {
    return { testo: "Nessun incasso", tono: "attenzione", dettaglio: "Non è stato ancora incassato nulla su questa commessa." };
  }
  const pct = totale > 0 ? Math.min(100, Math.round((incassato / totale) * 100)) : 0;
  return { testo: `Incassato ${pct}%`, tono: "neutro", dettaglio: `Incassato il ${pct}% del valore: restano da incassare ${daIncassare.toLocaleString("it-IT", { style: "currency", currency: "EUR" })}.` };
}

export function statoSquadra(nomi: string[], interna: boolean, subappalto: boolean): Etichetta {
  if (nomi.length === 0) {
    return { testo: "Da assegnare", tono: "attenzione", dettaglio: "Nessuna squadra (interna o in subappalto) è assegnata alla commessa." };
  }
  const principale = nomi[0];
  const tipo = subappalto && !interna ? "in subappalto" : "interna";
  return {
    testo: `${principale}${nomi.length > 1 ? ` +${nomi.length - 1}` : ""}`,
    tono: "neutro",
    dettaglio: `Squadra ${tipo}: ${nomi.join(", ")}.`,
  };
}

export interface DatiPassaggio {
  ritardo: number;
  lavoriCompletati?: boolean;
  daIncassare: number;
  incassato: number;
  articoli: number;
  pronti: number;
  daOrdinare: number;
}

export interface Passaggio {
  testo: string;
  motivo: string;
  /** «pronto» = niente da sbloccare, si può procedere. */
  tipo: "azione" | "pronto";
  destinazione?: OrderDetailDestination;
}

/** Il prossimo passo da fare, con la ragione. Stesso ordine di priorità di prima. */
export function prossimoPasso(d: DatiPassaggio): Passaggio {
  if (d.lavoriCompletati) {
    return d.daIncassare > 0
      ? { testo: "Verificare il saldo", motivo: "I lavori sono completati e c’è ancora un residuo da incassare.", tipo: "azione", destinazione: { tab: "finanza", economiaView: "pagamenti" } }
      : { testo: "Aprire la scheda", motivo: "I lavori sono completati.", tipo: "pronto" };
  }
  if (d.daIncassare > 0 && d.incassato === 0) {
    return { testo: "Verificare gli incassi", motivo: "Nessun incasso registrato per la commessa.", tipo: "azione", destinazione: { tab: "finanza", economiaView: "pagamenti" } };
  }
  if (d.ritardo > 0) {
    return { testo: "Verificare il ritardo", motivo: "La scadenza prevista è passata. Controlla date e lavorazioni nel cronoprogramma.", tipo: "azione", destinazione: { tab: "cantiere", cantiereView: "cronoprogramma" } };
  }
  if (d.articoli > 0 && d.daOrdinare > 0) {
    return { testo: "Ordinare i materiali", motivo: `${d.daOrdinare} ${d.daOrdinare === 1 ? "articolo è" : "articoli sono"} ancora da ordinare.`, tipo: "azione", destinazione: { tab: "articoli", materialiView: "acquisti" } };
  }
  if (d.articoli > 0 && d.pronti < d.articoli) {
    return { testo: "Verificare gli arrivi", motivo: "I materiali sono ordinati ma non tutti sono arrivati.", tipo: "azione", destinazione: { tab: "articoli", materialiView: "acquisti" } };
  }
  if (d.articoli > 0 && d.pronti === d.articoli) {
    return { testo: "Controllare il cronoprogramma", motivo: "Tutti i materiali sono pronti.", tipo: "pronto", destinazione: { tab: "cantiere", cantiereView: "cronoprogramma" } };
  }
  return { testo: "Aprire la scheda", motivo: "Mancano dati (articoli o date) per dire cosa fare.", tipo: "azione" };
}

/** Quante commesse sono oltre la data prevista. */
export function contaInRitardo(giorni: GiorniAllaScadenza[]): number {
  return giorni.filter((g) => g !== null && g < 0).length;
}
