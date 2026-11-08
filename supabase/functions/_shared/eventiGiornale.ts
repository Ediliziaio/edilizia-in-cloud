/**
 * Gli eventi di una pagina del giornale dei lavori: tipi, regole, doppioni.
 * Le stesse regole le fa rispettare il database (trigger trg_giornale_eventi_guardia):
 * qui servono per non mostrare bottoni che finirebbero in un errore.
 *
 * Modulo puro (niente Deno, niente browser): lo usano la pagina, il giro serale e il PDF.
 */

export const TIPI_EVENTO = ["consegna", "problema", "sospensione", "ripresa", "istruzione", "sopralluogo", "sicurezza", "nota"] as const;
export type TipoEvento = (typeof TIPI_EVENTO)[number];

export const ETICHETTA_EVENTO: Record<TipoEvento, string> = {
  consegna: "Consegna",
  problema: "Problema",
  sospensione: "Sospensione",
  ripresa: "Ripresa",
  istruzione: "Istruzione",
  sopralluogo: "Sopralluogo",
  sicurezza: "Sicurezza",
  nota: "Nota",
};

export function tipoEventoValido(v: unknown): v is TipoEvento {
  return typeof v === "string" && (TIPI_EVENTO as readonly string[]).includes(v);
}

export interface EventoGiornale {
  id: string;
  tipo: string;
  testo: string;
  ora?: string | null;
  stato?: string | null;
  chiuso_il?: string | null;
  chiuso_da?: string | null;
  nota_chiusura?: string | null;
  autore_id?: string | null;
  ddt_id?: string | null;
  ticket_id?: string | null;
  fase_id?: string | null;
  created_at?: string | null;
}

/** Un evento proposto da «Prepara dalla giornata», non ancora salvato. */
export interface EventoProposto {
  tipo: "consegna" | "problema";
  testo: string;
  ddt_id?: string;
  ticket_id?: string;
}

export interface RegoleEvento {
  puoEliminare: boolean;
  puoChiudere: boolean;
  puoRiaprire: boolean;
}

export const problemaAperto = (e: { tipo?: string | null; stato?: string | null }) => e.tipo === "problema" && e.stato !== "chiuso";

/** In bozza si aggiunge e si toglie; chiudere o riaprire un problema vale anche sulla firmata. */
export function regoleEvento(
  evento: { tipo?: string | null; stato?: string | null },
  statoPagina: string | null | undefined,
  haPermesso: boolean,
): RegoleEvento {
  const aperto = problemaAperto(evento);
  return {
    puoEliminare: haPermesso && statoPagina !== "firmata",
    puoChiudere: haPermesso && aperto,
    puoRiaprire: haPermesso && evento.tipo === "problema" && !aperto,
  };
}

export function puoAggiungereEvento(statoPagina: string | null | undefined, haPermesso: boolean): boolean {
  return haPermesso && statoPagina !== "firmata";
}

/** Da quanti giorni di calendario è aperto un problema, contati dalla data della pagina. */
export function giorniAperto(dataLavori: string, oggi: string): number {
  const inizio = Date.parse(`${dataLavori}T00:00:00Z`);
  const fine = Date.parse(`${oggi}T00:00:00Z`);
  if (Number.isNaN(inizio) || Number.isNaN(fine)) return 0;
  return Math.max(0, Math.round((fine - inizio) / 86_400_000));
}

export function testoGiorniAperto(giorni: number): string {
  if (giorni <= 0) return "da oggi";
  return giorni === 1 ? "da 1 giorno" : `da ${giorni} giorni`;
}

/** `08:30:00` → `08:30`. */
export function oraBreve(ora: string | null | undefined): string {
  return ora ? ora.slice(0, 5) : "";
}

/** Prima per ora (senza ora in fondo), poi nell'ordine in cui sono stati scritti. */
export function ordinaEventi<T extends { ora?: string | null; created_at?: string | null }>(eventi: readonly T[]): T[] {
  return [...eventi].sort((a, b) =>
    (a.ora ?? "99:99").localeCompare(b.ora ?? "99:99") || String(a.created_at ?? "").localeCompare(String(b.created_at ?? "")));
}

/** Gli eventi divisi per tipo, nell'ordine fisso dei tipi; i tipi vuoti non ci sono. */
export function eventiPerTipo<T extends { tipo: string; ora?: string | null; created_at?: string | null }>(eventi: readonly T[]): Array<{ tipo: TipoEvento; etichetta: string; eventi: T[] }> {
  return TIPI_EVENTO
    .map((tipo) => ({ tipo, etichetta: ETICHETTA_EVENTO[tipo], eventi: ordinaEventi(eventi.filter((e) => e.tipo === tipo)) }))
    .filter((g) => g.eventi.length > 0);
}

const stessoCollegamento = (a: Pick<EventoProposto, "ddt_id" | "ticket_id">, b: { ddt_id?: string | null; ticket_id?: string | null }) =>
  (!!a.ddt_id && a.ddt_id === b.ddt_id) || (!!a.ticket_id && a.ticket_id === b.ticket_id);

/** Si aggiungono solo le proposte che non ci sono già, né tra quelle in attesa né tra le salvate. */
export function unisciEventiProposti(
  attuali: readonly EventoProposto[],
  nuovi: readonly EventoProposto[],
  salvati: ReadonlyArray<{ ddt_id?: string | null; ticket_id?: string | null }> = [],
): EventoProposto[] {
  const esito = attuali.filter((p) => !salvati.some((s) => stessoCollegamento(p, s)));
  for (const n of nuovi) {
    if (salvati.some((s) => stessoCollegamento(n, s)) || esito.some((p) => stessoCollegamento(n, p))) continue;
    esito.push(n);
  }
  return esito;
}

export interface RigaEventoNuovo extends EventoProposto {
  company_id: string;
  giornale_id: string;
}

/** Le righe da scrivere, una chiamata per collegamento: ognuna ha il suo indice unico. */
export function righeEventiProposti(proposti: readonly EventoProposto[], companyId: string, giornaleId: string): { conDdt: RigaEventoNuovo[]; conTicket: RigaEventoNuovo[] } {
  const righe = proposti.map((p) => ({ ...p, company_id: companyId, giornale_id: giornaleId }));
  return { conDdt: righe.filter((r) => !!r.ddt_id), conTicket: righe.filter((r) => !!r.ticket_id) };
}
