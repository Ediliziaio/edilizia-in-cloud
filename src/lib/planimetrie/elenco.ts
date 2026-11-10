import type { RigaPlanimetria } from "./archivio";
import {
  DEFINIZIONI_COLLEGAMENTI,
  haCollegamenti,
  TIPI_COLLEGAMENTO,
  type MappaCollegamenti,
  type TipoCollegamento,
} from "./collegamenti";
export const STATI_PIANTA = {
  bozza: "Bozza",
  in_uso: "In uso",
  archiviata: "Archiviata",
} as const;
export interface FiltriElencoPiante {
  stato: "attive" | "tutte" | "bozza" | "in_uso" | "archiviata";
  ricerca: string;
  collegamento: "tutti" | "collegate" | "libere" | TipoCollegamento;
  ordine: "recenti" | "nome" | "meno_recenti";
  dal?: string;
  al?: string;
  soloMie?: boolean;
  riferimento?: string;
  cliente?: string;
  contatto?: string;
  preventivo?: string;
  commessa?: string;
  computo?: string;
}
export type FiltriArchivioPiante = FiltriElencoPiante & {
  pagina: number;
  dal: string;
  al: string;
  soloMie: boolean;
  riferimento: string;
} & Record<TipoCollegamento, string>;
export const FILTRI_PIANTE_INIZIALI: FiltriArchivioPiante = {
  stato: "attive",
  ricerca: "",
  collegamento: "tutti",
  ordine: "recenti",
  pagina: 0,
  dal: "",
  al: "",
  soloMie: false,
  riferimento: "",
  cliente: "",
  contatto: "",
  preventivo: "",
  commessa: "",
  computo: "",
};
const tipoValido = (value: string): value is TipoCollegamento =>
  TIPI_COLLEGAMENTO.includes(value as TipoCollegamento);
export function giornoLocalePianta(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
function dataValida(value: string | null | undefined) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return "";
  const date = new Date(`${value}T12:00:00Z`);
  return Number.isFinite(date.getTime()) &&
    date.toISOString().slice(0, 10) === value
    ? value
    : "";
}
const testoRicerca = (value: string) =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("it-IT");
export function filtraElencoPiante(
  righe: RigaPlanimetria[],
  filtri: FiltriElencoPiante,
  mappa?: MappaCollegamenti,
  userId?: string,
): RigaPlanimetria[] {
  const parole = testoRicerca(filtri.ricerca.trim())
    .split(/\s+/)
    .filter(Boolean);
  const dal = dataValida(filtri.dal);
  const al = dataValida(filtri.al);
  return righe
    .filter((riga) => {
      if (
        filtri.stato === "attive"
          ? riga.stato === "archiviata"
          : filtri.stato !== "tutte" && riga.stato !== filtri.stato
      )
        return false;
      if (filtri.soloMie && (!userId || riga.created_by !== userId))
        return false;
      if (filtri.collegamento === "collegate" && !haCollegamenti(riga))
        return false;
      if (filtri.collegamento === "libere" && haCollegamenti(riga))
        return false;
      if (tipoValido(filtri.collegamento)) {
        const id = riga[DEFINIZIONI_COLLEGAMENTI[filtri.collegamento].colonna];
        if (!id || (filtri.riferimento && id !== filtri.riferimento))
          return false;
      }
      for (const tipo of TIPI_COLLEGAMENTO) {
        const value = filtri[tipo];
        const id = riga[DEFINIZIONI_COLLEGAMENTI[tipo].colonna];
        if (
          value === "presenti"
            ? !id
            : value === "nessuno"
              ? !!id
              : value && id !== value
        )
          return false;
      }
      if (dal || al) {
        const date = new Date(riga.updated_at);
        if (!Number.isFinite(date.getTime())) return false;
        const day = giornoLocalePianta(date);
        if ((dal && day < dal) || (al && day > al)) return false;
      }
      const testo = testoRicerca(
        [
          riga.titolo,
          riga.descrizione,
          ...TIPI_COLLEGAMENTO.map((tipo) => {
            const id = riga[DEFINIZIONI_COLLEGAMENTI[tipo].colonna];
            return id ? mappa?.[tipo][id]?.nome : null;
          }),
        ]
          .filter(Boolean)
          .join(" "),
      );
      return parole.every((parola) => testo.includes(parola));
    })
    .sort(
      (a, b) =>
        (filtri.ordine === "nome"
          ? a.titolo.localeCompare(b.titolo, "it")
          : filtri.ordine === "meno_recenti"
            ? a.updated_at.localeCompare(b.updated_at)
            : b.updated_at.localeCompare(a.updated_at)) ||
        a.id.localeCompare(b.id),
    );
}
export function leggiFiltriElenco(
  params: URLSearchParams,
): FiltriArchivioPiante {
  const stato = params.get("stato");
  const link = params.get("collegamento") || "tutti";
  const ordine = params.get("ordine");
  const page = Number(params.get("pagina") || 1);
  const collegamento =
    ["collegate", "libere"].includes(link) || tipoValido(link)
      ? (link as FiltriElencoPiante["collegamento"])
      : "tutti";
  return {
    stato: ["tutte", "bozza", "in_uso", "archiviata"].includes(stato || "")
      ? (stato as FiltriElencoPiante["stato"])
      : "attive",
    ricerca: params.get("q") || "",
    collegamento,
    ordine: ordine === "nome" || ordine === "meno_recenti" ? ordine : "recenti",
    pagina: Number.isInteger(page) && page > 0 && page < 1000000 ? page - 1 : 0,
    dal: dataValida(params.get("dal")),
    al: dataValida(params.get("al")),
    soloMie: params.get("mie") === "1",
    riferimento: tipoValido(collegamento) ? params.get("scheda") || "" : "",
    cliente: params.get("cliente") || "",
    contatto: params.get("contatto") || "",
    preventivo: params.get("preventivo") || "",
    commessa: params.get("commessa") || "",
    computo: params.get("computo") || "",
  };
}
export function scriviFiltriElenco(
  params: URLSearchParams,
  patch: Partial<FiltriArchivioPiante>,
) {
  const next = new URLSearchParams(params);
  const previous = leggiFiltriElenco(params);
  const values = { ...previous, ...patch };
  if (
    patch.collegamento !== undefined &&
    patch.collegamento !== previous.collegamento &&
    patch.riferimento === undefined
  )
    values.riferimento = "";
  if (!tipoValido(values.collegamento)) values.riferimento = "";
  for (const [key, value, defaultValue] of [
    ["q", values.ricerca, ""],
    ["stato", values.stato, "attive"],
    ["collegamento", values.collegamento, "tutti"],
    ["ordine", values.ordine, "recenti"],
    ["pagina", String(values.pagina + 1), "1"],
    ["dal", dataValida(values.dal), ""],
    ["al", dataValida(values.al), ""],
    ["mie", values.soloMie ? "1" : "", ""],
    ["scheda", values.riferimento, ""],
    ...TIPI_COLLEGAMENTO.map((tipo) => [tipo, values[tipo], ""]),
  ]) {
    if (value === defaultValue) next.delete(key);
    else next.set(key, value);
  }
  return next;
}

/** I vecchi link continuano a funzionare, presentati come filtro della scheda corretta. */
export function valoreFiltroPianta(
  filtri: FiltriArchivioPiante,
  tipo: TipoCollegamento,
) {
  return (
    filtri[tipo] ||
    (filtri.collegamento === tipo ? filtri.riferimento || "presenti" : "")
  );
}
export function scegliFiltroPianta(
  filtri: FiltriArchivioPiante,
  tipo: TipoCollegamento,
  value: string,
): Partial<FiltriArchivioPiante> {
  return {
    [tipo]: value,
    ...(filtri.collegamento === tipo
      ? { collegamento: "tutti", riferimento: "" }
      : {}),
  };
}
