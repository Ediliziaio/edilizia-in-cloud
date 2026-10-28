export interface VerbaleDpi {
  revisione?: string | null;
  impronta: string;
  id: string;
  operaio_id: string;
  titolo: string;
  file_name: string | null;
  catalogo_id: string;
  catalogo_versione: number;
  order_id: string | null;
  fase_id: string | null;
  applicabile_dal: string | null;
  applicabile_al: string | null;
  stato: string;
  data_rilascio: string | null;
  data_scadenza: string | null;
  updated_at: string;
}
export interface ConsegnaDpi {
  evidenza_impronta?: string | null;
  evidenza_id?: string | null;
  evidenza_attesa?: string | null;
  evidenza_snapshot?: VerbaleDpi | null;
  versione?: number;
  aggiornato_il?: string;
  taglia?: string | null;
  note?: string;
  annullata?: boolean;
  annullamento_motivo?: string | null;
  id: string;
  tipo: string;
  marca: string | null;
  matricola: string | null;
  consegnato_il: string;
  scade_il: string | null;
  stato: string | null;
  restituito_il: string | null;
  modulo_registrato: boolean;
}
export interface AddettoDpi {
  id: string;
  nome: string;
  cognome: string;
  qualifica: string | null;
  attivo: boolean | null;
  assegnazioni: Array<{
    fonte: "commessa" | "campo";
    dal: string | null;
    al: string | null;
    fase_id: string | null;
  }>;
  consegne: ConsegnaDpi[];
}
export interface QuadroDpi {
  esterni_legacy?: number;
  data: string;
  fase_id: string | null;
  addetti: AddettoDpi[];
  campo_senza_dipendente: number;
}
export const TIPI_DPI: Record<string, string> = {
  casco: "Casco",
  scarpe_antinfortunistiche: "Scarpe antinfortunistiche",
  imbragatura: "Imbragatura",
  occhiali: "Occhiali",
  guanti: "Guanti",
  mascherina_ffp: "Mascherina FFP",
  tappi_auricolari: "Tappi auricolari",
  giubbino_alta_visibilita: "Giubbino ad alta visibilità",
  tuta_chimica: "Tuta chimica",
  elmetto_arrampicata: "Elmetto da arrampicata",
};
export type StatoConsegna =
  | "annullata"
  | "da_controllare"
  | "futura"
  | "restituita"
  | "scaduta"
  | "danneggiata"
  | "smarrita"
  | "in_uso";
const dataValida = (s: string) =>
  /^\d{4}-\d{2}-\d{2}$/.test(s) &&
  Number.isFinite(Date.parse(`${s}T12:00:00Z`)) &&
  new Date(`${s}T12:00:00Z`).toISOString().slice(0, 10) === s;
/** Current status plus selected date: this is not a reconstruction of past possession. */
export function statoConsegnaDpi(d: ConsegnaDpi, data: string): StatoConsegna {
  if (d.annullata) return "annullata";
  if (
    !dataValida(data) ||
    !dataValida(d.consegnato_il) ||
    (d.scade_il && !dataValida(d.scade_il)) ||
    (d.restituito_il && !dataValida(d.restituito_il))
  )
    return "da_controllare";
  if (
    (d.scade_il && d.scade_il < d.consegnato_il) ||
    (d.restituito_il && d.restituito_il < d.consegnato_il)
  )
    return "da_controllare";
  if (d.consegnato_il > data) return "futura";
  if (d.stato === "returned" || (d.restituito_il && d.restituito_il <= data))
    return "restituita";
  if (d.stato === "damaged") return "danneggiata";
  if (d.stato === "lost") return "smarrita";
  if (d.stato === "expired" || (d.scade_il && d.scade_il < data))
    return "scaduta";
  return d.stato === "in_use" ? "in_uso" : "da_controllare";
}
export const ETICHETTE_CONSEGNA: Record<StatoConsegna, string> = {
  annullata: "Registrazione annullata",
  da_controllare: "Dati da controllare",
  futura: "Consegna futura",
  restituita: "Restituito",
  scaduta: "Scaduto",
  danneggiata: "Danneggiato",
  smarrita: "Smarrito",
  in_uso: "Registrato in uso",
};
export function riepilogoDpi(q: QuadroDpi) {
  const consegne = q.addetti.flatMap((a) => a.consegne);
  return {
    addetti: q.addetti.length,
    senzaConsegne: q.addetti.filter(
      (a) => !a.consegne.some((d) => statoConsegnaDpi(d, q.data) === "in_uso"),
    ).length,
    criticita: consegne.filter((d) =>
      ["da_controllare", "scaduta", "danneggiata", "smarrita"].includes(
        statoConsegnaDpi(d, q.data),
      ),
    ).length,
    senzaModulo: consegne.filter(
      (d) => statoConsegnaDpi(d, q.data) === "in_uso" && !d.modulo_registrato,
    ).length,
  };
}
