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

export interface ConsegnaRegistrata {
  id: string;
  tipo: string;
  consegnato_il: string;
  scade_il: string | null;
  restituito_il: string | null;
  stato: string | null;
  annullata?: boolean;
  versione?: number;
}

export const dataValidaDpi = (s: string) =>
  /^\d{4}-\d{2}-\d{2}$/.test(s) && Number.isFinite(Date.parse(s)) && new Date(s).toISOString().slice(0, 10) === s;


export type StatoConsegna =
  | "annullata"
  | "da_controllare"
  | "futura"
  | "restituita"
  | "scaduta"
  | "danneggiata"
  | "smarrita"
  | "in_uso";
/** Current status plus selected date: this is not a reconstruction of past possession. */
export function statoConsegnaDpi(d: ConsegnaRegistrata, data: string): StatoConsegna {
  if (d.annullata) return "annullata";
  if (
    !dataValidaDpi(data) ||
    !dataValidaDpi(d.consegnato_il) ||
    (d.scade_il && !dataValidaDpi(d.scade_il)) ||
    (d.restituito_il && !dataValidaDpi(d.restituito_il))
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
