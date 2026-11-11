import {
  nomeCantiere,
  oreDi,
  personeDi,
  statoDi,
  type FiltriRapportini,
  type RapportinoRiga,
} from "./rapportiniMese";
import { statoGiornale } from "@/lib/campo/statoGiornale";

export type TipoDocumentoCantiere = "tutti" | "rapportino" | "giornale";
export interface GiornaleRiga {
  id: string;
  order_id: string;
  data_lavori: string;
  stato?: string | null;
  lavorazioni_eseguite?: string | null;
  personale_presente?: number | null;
  giornale_foto?: { id: string }[] | null;
  order?:
    | (NonNullable<RapportinoRiga["order"]> & { deleted_at?: string | null })
    | null;
}
export type DocumentoCantiere =
  | { tipo: "rapportino"; chiave: string; data: string; riga: RapportinoRiga }
  | { tipo: "giornale"; chiave: string; data: string; riga: GiornaleRiga };

export function filtraGiornali(
  righe: readonly GiornaleRiga[],
  f: FiltriRapportini,
) {
  const testo = f.testo?.trim().toLocaleLowerCase("it") ?? "";
  return righe.filter((r) => {
    if (f.giorno && r.data_lavori !== f.giorno) return false;
    if (f.cantiere && r.order_id !== f.cantiere) return false;
    if (f.stato && statoGiornale(r) !== f.stato) return false;
    // Il giornale riepiloga le presenze: non attribuisce ore a una singola persona.
    if (f.persona) return false;
    return (
      !testo ||
      [
        r.lavorazioni_eseguite,
        r.order?.order_code,
        r.order?.client_name,
        r.order?.description,
      ]
        .filter(Boolean)
        .join(" ")
        .toLocaleLowerCase("it")
        .includes(testo)
    );
  });
}

/** Le due fonti restano distinte: il giornale non diventa un altro rapportino. */
export function documentiCantiere(
  rapportini: readonly RapportinoRiga[],
  giornali: readonly GiornaleRiga[],
  tipo: TipoDocumentoCantiere = "tutti",
): DocumentoCantiere[] {
  const righe: DocumentoCantiere[] = [
    ...(tipo === "giornale"
      ? []
      : rapportini.map(
          (r): DocumentoCantiere => ({
            tipo: "rapportino",
            chiave: `rapportino:${r.id}`,
            data: r.data_lavoro,
            riga: r,
          }),
        )),
    ...(tipo === "rapportino"
      ? []
      : giornali.map(
          (r): DocumentoCantiere => ({
            tipo: "giornale",
            chiave: `giornale:${r.id}`,
            data: r.data_lavori,
            riga: r,
          }),
        )),
  ];
  return righe.sort(
    (a, b) => b.data.localeCompare(a.data) || a.chiave.localeCompare(b.chiave),
  );
}

export function linkGiornale(r: Pick<GiornaleRiga, "id" | "order_id">) {
  return `/azienda/giornale-lavori?${new URLSearchParams({ ordine: r.order_id, pagina: r.id })}`;
}

export const nomeCantiereGiornale = (r: GiornaleRiga) =>
  r.order?.client_name?.trim() ||
  r.order?.description?.trim() ||
  r.order?.order_code ||
  "Cantiere";

export const COLONNE_DOCUMENTI_CANTIERE = [
  { key: "data", label: "Data" },
  { key: "tipo", label: "Tipo" },
  { key: "stato", label: "Stato" },
  { key: "codice", label: "Codice cantiere" },
  { key: "cantiere", label: "Cantiere" },
  { key: "lavori", label: "Lavori eseguiti" },
  { key: "persone", label: "Persone / presenze" },
  { key: "ore", label: "Ore dei rapportini" },
  { key: "foto", label: "Foto" },
];

const ETICHETTE_STATI: Record<string, string> = {
  inviato: "Da approvare",
  approvato: "Approvato",
  rifiutato: "Rifiutato",
  bozza: "Bozza",
  firmata: "Firmata",
};
export function righeCsvDocumenti(righe: readonly DocumentoCantiere[]) {
  return righe.map((d) => {
    const r = d.riga;
    return {
      data: d.data,
      tipo: d.tipo === "giornale" ? "Giornale lavori" : "Rapportino",
      stato:
        ETICHETTE_STATI[
          d.tipo === "giornale" ? statoGiornale(d.riga) : statoDi(d.riga)
        ],
      codice: r.order?.order_code ?? "",
      cantiere:
        d.tipo === "giornale"
          ? nomeCantiereGiornale(d.riga)
          : nomeCantiere(d.riga),
      lavori:
        d.tipo === "giornale"
          ? (d.riga.lavorazioni_eseguite ?? "")
          : (d.riga.descrizione_lavori ?? ""),
      persone:
        d.tipo === "giornale"
          ? d.riga.personale_presente == null
            ? ""
            : String(d.riga.personale_presente)
          : personeDi(d.riga)
              .map((p) => p.nome)
              .join(", "),
      ore: d.tipo === "giornale" ? "" : String(oreDi(d.riga)),
      foto: String(
        d.tipo === "giornale"
          ? (d.riga.giornale_foto?.length ?? 0)
          : (d.riga.foto_urls?.length ?? 0),
      ),
    };
  });
}
