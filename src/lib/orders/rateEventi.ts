/**
 * Rate ancorate agli eventi del cantiere.
 *
 * In edilizia le rate si incassano a eventi, non al calendario: l'acconto alla
 * firma, la seconda quando arriva la merce, la terza prima di partire, il saldo
 * a fine lavori. Qui l'evento è un dato, così la data attesa si sposta da sola
 * quando sposti il cantiere e il sistema può avvisare PRIMA che sia tardi.
 *
 * Le stesse regole vivono in SQL (`data_attesa_rata` e la vista
 * `v_rate_commessa_stato`): se cambi una regola qui, cambiala anche là.
 */

export type EventoRata =
  | "data_fissa"
  | "firma_contratto"
  | "merce_magazzino"
  | "inizio_lavori"
  | "fine_lavori"
  | "stato_commessa";

export interface DefinizioneEvento {
  value: EventoRata;
  label: string;
  /** Come si legge nella frase "la rata si incassa …". */
  descrizione: string;
}

export const EVENTI_RATA: readonly DefinizioneEvento[] = [
  { value: "data_fissa", label: "A una data precisa", descrizione: "La data la scegli tu e resta quella." },
  { value: "firma_contratto", label: "Alla firma del contratto", descrizione: "Dal giorno in cui hai aperto la commessa." },
  { value: "merce_magazzino", label: "All'arrivo della merce", descrizione: "Segue la data di arrivo merce in magazzino." },
  { value: "inizio_lavori", label: "Prima dell'inizio lavori", descrizione: "Segue la data di inizio lavori: se la sposti, si sposta." },
  { value: "fine_lavori", label: "A fine lavori", descrizione: "Segue la data di fine lavori." },
  { value: "stato_commessa", label: "Quando la commessa arriva a…", descrizione: "Scatta quando il cantiere raggiunge lo stato che scegli." },
] as const;

export function etichettaEvento(evento: string | null | undefined): string {
  return EVENTI_RATA.find((e) => e.value === evento)?.label ?? EVENTI_RATA[0].label;
}

/** Date del cantiere da cui si ricava la scadenza di una rata. */
export interface DateCommessa {
  created_at?: string | null;
  warehouse_arrival_date?: string | null;
  work_start_date?: string | null;
  work_end_date?: string | null;
  /** Data in cui la commessa ha raggiunto lo stato agganciato alla rata, se già raggiunto. */
  data_stato?: string | null;
}

function soloData(v: string | null | undefined): string | null {
  if (!v) return null;
  return v.split("T")[0];
}

/**
 * La data in cui la rata diventa esigibile. `null` quando l'evento non è ancora
 * determinato (per esempio uno stato che la commessa non ha ancora raggiunto):
 * in quel caso non c'è nulla da sollecitare, e va bene così.
 */
export function dataAttesaRata(
  evento: string | null | undefined,
  expectedDate: string | null | undefined,
  date: DateCommessa,
): string | null {
  switch (evento) {
    case "firma_contratto": return soloData(date.created_at);
    case "merce_magazzino": return soloData(date.warehouse_arrival_date);
    case "inizio_lavori": return soloData(date.work_start_date);
    case "fine_lavori": return soloData(date.work_end_date);
    case "stato_commessa": return soloData(date.data_stato);
    default: return soloData(expectedDate);
  }
}

export type StatoIncasso = "pagata" | "ok" | "preavviso" | "scaduta" | "senza_data";

/**
 * Stato di incasso della rata. `preavviso` è il caso che serviva: l'evento è
 * vicino e i soldi non sono ancora arrivati, quindi c'è tempo per sollecitare.
 */
export function statoIncassoRata(params: {
  isPaid: boolean;
  dataAttesa: string | null;
  giorniPreavviso?: number | null;
  oggi?: Date;
}): StatoIncasso {
  if (params.isPaid) return "pagata";
  if (!params.dataAttesa) return "senza_data";
  const oggi = (params.oggi ?? new Date()).toLocaleDateString("en-CA");
  if (params.dataAttesa <= oggi) return "scaduta";
  const preavviso = Number.isFinite(Number(params.giorniPreavviso)) ? Number(params.giorniPreavviso) : 7;
  const limite = new Date(params.oggi ?? new Date());
  limite.setDate(limite.getDate() + preavviso);
  return params.dataAttesa <= limite.toLocaleDateString("en-CA") ? "preavviso" : "ok";
}

/** Giorni che mancano all'evento; negativo se è già passato. */
export function giorniAllEvento(dataAttesa: string | null, oggi = new Date()): number | null {
  if (!dataAttesa) return null;
  const [a, m, g] = dataAttesa.split("-").map(Number);
  const target = new Date(a, m - 1, g);
  const base = new Date(oggi.getFullYear(), oggi.getMonth(), oggi.getDate());
  return Math.round((target.getTime() - base.getTime()) / 86400000);
}

/** La frase da mostrare all'utente, già pronta. */
export function messaggioRata(params: {
  stato: StatoIncasso;
  evento: string | null | undefined;
  giorni: number | null;
  importoEur: number;
}): string | null {
  const { stato, evento, giorni, importoEur } = params;
  const soldi = importoEur.toLocaleString("it-IT", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });
  if (stato === "preavviso") {
    const quando = giorni === null ? "a breve" : giorni <= 1 ? "domani" : `tra ${giorni} giorni`;
    if (evento === "inizio_lavori") return `Si parte ${quando} e mancano ${soldi}`;
    if (evento === "merce_magazzino") return `La merce arriva ${quando} e mancano ${soldi}`;
    return `Scade ${quando}: ${soldi} da incassare`;
  }
  if (stato === "scaduta") {
    if (evento === "inizio_lavori") return `Lavori avviati senza incassare ${soldi}`;
    if (evento === "fine_lavori") return `Lavori chiusi, ${soldi} ancora da incassare`;
    return `${soldi} scaduti e non incassati`;
  }
  return null;
}
