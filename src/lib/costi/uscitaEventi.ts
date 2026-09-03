/**
 * Pagamenti a fornitore: i termini come si dicono in Italia.
 *
 * "30 giorni data fattura", "60 giorni fine mese", "alla consegna": sono una
 * BASE di calcolo più dei giorni di dilazione, non una data digitata a mano.
 * Scritti così, la scadenza si ricalcola da sola quando la fattura arriva con
 * dieci giorni di ritardo, invece di restare quella di prima.
 *
 * Specchio di `lib/orders/rateEventi.ts` sul lato incassi. Le stesse regole
 * vivono in SQL (`data_pagamento_uscita` e la vista `v_uscite_stato`): se
 * cambi una regola qui, cambiala anche là.
 */

export type EventoUscita =
  | "data_fissa"
  | "data_fattura"
  | "fine_mese_fattura"
  | "ricezione_merce"
  | "data_ordine"
  | "fine_lavori";

export interface DefinizioneUscita {
  value: EventoUscita;
  label: string;
  /** Se true, i giorni di dilazione hanno senso ("30 gg data fattura"). */
  conGiorni: boolean;
  descrizione: string;
}

export const EVENTI_USCITA: readonly DefinizioneUscita[] = [
  { value: "data_fissa", label: "A una data precisa", conGiorni: false, descrizione: "La data la scegli tu e resta quella." },
  { value: "data_fattura", label: "Data fattura", conGiorni: true, descrizione: "Dalla data della fattura del fornitore." },
  { value: "fine_mese_fattura", label: "Fine mese fattura", conGiorni: true, descrizione: "Dall'ultimo giorno del mese in cui è datata la fattura." },
  { value: "ricezione_merce", label: "Alla consegna della merce", conGiorni: true, descrizione: "Da quando la merce dell'ordine è arrivata." },
  { value: "data_ordine", label: "Dalla data dell'ordine", conGiorni: true, descrizione: "Da quando hai emesso l'ordine d'acquisto." },
  { value: "fine_lavori", label: "A fine lavori", conGiorni: true, descrizione: "Dalla fine lavori della commessa collegata." },
] as const;

export function etichettaEventoUscita(evento: string | null | undefined): string {
  return EVENTI_USCITA.find((e) => e.value === evento)?.label ?? EVENTI_USCITA[0].label;
}

/** Come si legge il termine per intero: "60 gg fine mese fattura". */
export function termineLeggibile(evento: string | null | undefined, giorni: number | null | undefined): string {
  const def = EVENTI_USCITA.find((e) => e.value === evento) ?? EVENTI_USCITA[0];
  if (!def.conGiorni) return def.label;
  const g = Number(giorni) || 0;
  return g > 0 ? `${g} gg ${def.label.toLowerCase()}` : def.label;
}

/** Le date da cui si conta, quando il sistema le conosce già. */
export interface BasiUscita {
  /** Data della fattura del fornitore agganciata al costo o all'ordine. */
  data_fattura?: string | null;
  /** Consegna effettiva dell'ordine d'acquisto. */
  data_consegna?: string | null;
  /** Emissione dell'ordine d'acquisto. */
  data_ordine?: string | null;
  /** Fine lavori della commessa collegata. */
  data_fine_lavori?: string | null;
}

function soloData(v: string | null | undefined): string | null {
  return v ? v.split("T")[0] : null;
}

function sommaGiorni(iso: string, giorni: number): string {
  const [a, m, g] = iso.split("-").map(Number);
  const d = new Date(a, m - 1, g);
  d.setDate(d.getDate() + giorni);
  return d.toLocaleDateString("en-CA");
}

/** Ultimo giorno del mese di una data: è la base di "fine mese fattura". */
export function fineMese(iso: string): string {
  const [a, m] = iso.split("-").map(Number);
  return new Date(a, m, 0).toLocaleDateString("en-CA");
}

/**
 * Quando escono davvero i soldi. `null` se la base non c'è ancora (la fattura
 * del fornitore non è arrivata, la merce non è stata consegnata): in quel caso
 * non c'è nulla da pagare e non si inventa una scadenza.
 */
export function dataPagamentoUscita(
  evento: string | null | undefined,
  dueDate: string | null | undefined,
  giorniDilazione: number | null | undefined,
  basi: BasiUscita,
): string | null {
  const giorni = Number(giorniDilazione) || 0;
  // 9999-12-31 è la sentinella "senza scadenza" dei costi: non è una data.
  if (!evento || evento === "data_fissa") {
    const d = soloData(dueDate);
    return d === "9999-12-31" ? null : d;
  }

  let base: string | null = null;
  switch (evento) {
    case "data_fattura": base = soloData(basi.data_fattura); break;
    case "fine_mese_fattura": {
      const f = soloData(basi.data_fattura);
      base = f ? fineMese(f) : null;
      break;
    }
    case "ricezione_merce": base = soloData(basi.data_consegna); break;
    case "data_ordine": base = soloData(basi.data_ordine); break;
    case "fine_lavori": base = soloData(basi.data_fine_lavori); break;
    default: base = null;
  }
  return base ? sommaGiorni(base, giorni) : null;
}

export type StatoUscita = "pagata" | "ok" | "preavviso" | "scaduta" | "senza_data";

export function statoUscita(params: {
  isPaid: boolean;
  dataPagamento: string | null;
  giorniPreavviso?: number | null;
  oggi?: Date;
}): StatoUscita {
  if (params.isPaid) return "pagata";
  if (!params.dataPagamento) return "senza_data";
  const oggiIso = (params.oggi ?? new Date()).toLocaleDateString("en-CA");
  if (params.dataPagamento <= oggiIso) return "scaduta";
  const preavviso = Number.isFinite(Number(params.giorniPreavviso)) ? Number(params.giorniPreavviso) : 7;
  const limite = new Date(params.oggi ?? new Date());
  limite.setDate(limite.getDate() + preavviso);
  return params.dataPagamento <= limite.toLocaleDateString("en-CA") ? "preavviso" : "ok";
}

/** La frase da mostrare, già pronta: parla di soldi che escono, non di record. */
export function messaggioUscita(params: {
  stato: StatoUscita;
  giorni: number | null;
  importoEur: number;
  fornitore?: string | null;
}): string | null {
  const { stato, giorni, importoEur, fornitore } = params;
  const soldi = importoEur.toLocaleString("it-IT", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });
  const a = fornitore ? ` a ${fornitore}` : "";
  if (stato === "preavviso") {
    const quando = giorni === null ? "a breve" : giorni <= 1 ? "domani" : `tra ${giorni} giorni`;
    return `Escono ${soldi}${a} ${quando}`;
  }
  if (stato === "scaduta") {
    const ritardo = giorni === null ? "" : giorni <= -1 ? ` da ${Math.abs(giorni)} giorn${Math.abs(giorni) === 1 ? "o" : "i"}` : "";
    return `${soldi}${a} da pagare${ritardo}`;
  }
  return null;
}
