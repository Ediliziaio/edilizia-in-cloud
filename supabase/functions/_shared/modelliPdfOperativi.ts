/** Contratto condiviso da editor, generatori nel browser e rapportini server. */
export const TIPI_MODELLI_PDF = [
  "materiali",
  "richiesta",
  "servizi",
  "trasporti",
  "economia",
  "rapportino",
  "fine_lavori",
] as const;
export type TipoModelloPdf = (typeof TIPI_MODELLI_PDF)[number];
export interface ModelloPdf {
  nome: string;
  titolo: string;
  colore: string;
  carattere: "helvetica" | "times" | "courier";
  mostraLogo: boolean;
  margine: number;
  dimensioneTesto: number;
  scalaLogo: number;
  coloreRiquadri: string;
  righeAlternate: boolean;
  numerazione: boolean;
  notaPagina: string;
  introduzione: string;
  conclusione: string;
  condizioni: string;
  mostraFirma: boolean;
  etichettaFirma: string;
}
export const NOMI_MODELLI_PDF: Record<TipoModelloPdf, string> = {
  materiali: "Ordini d’acquisto",
  richiesta: "Richieste d’offerta",
  servizi: "Servizi e lavori",
  trasporti: "Rapporti trasporti",
  economia: "Lavori in economia",
  rapportino: "Rapportino giornaliero",
  fine_lavori: "Rapporto di fine lavori",
};
export function modelloPdfStandard(tipo: TipoModelloPdf): ModelloPdf {
  return {
    nome: NOMI_MODELLI_PDF[tipo],
    titolo: "",
    colore: "",
    carattere: "helvetica",
    mostraLogo: true,
    margine: 0,
    dimensioneTesto: 0,
    scalaLogo: 100,
    coloreRiquadri: "",
    righeAlternate: false,
    numerazione: true,
    notaPagina: "",
    introduzione: "",
    conclusione: "",
    condizioni: "",
    mostraFirma: true,
    etichettaFirma: "",
  };
}
/** Whitelist: dati non validi nel database non possono alterare il renderer. */
export function normalizzaModelloPdf(
  tipo: TipoModelloPdf,
  value: unknown,
): ModelloPdf {
  const d = modelloPdfStandard(tipo);
  const v =
    value && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  const testo = (key: keyof ModelloPdf, max: number) =>
    typeof v[key] === "string"
      ? (v[key] as string).trim().slice(0, max)
      : String(d[key]);
  return {
    nome: testo("nome", 120) || d.nome,
    titolo: testo("titolo", 70),
    colore:
      typeof v.colore === "string" && /^#[0-9a-f]{6}$/i.test(v.colore)
        ? v.colore
        : "",
    carattere:
      v.carattere === "times" || v.carattere === "courier"
        ? v.carattere
        : "helvetica",
    mostraLogo: typeof v.mostraLogo === "boolean" ? v.mostraLogo : true,
    margine: [10, 14, 18].includes(v.margine as number)
      ? (v.margine as number)
      : 0,
    dimensioneTesto: [8, 9, 10].includes(v.dimensioneTesto as number)
      ? (v.dimensioneTesto as number)
      : 0,
    scalaLogo: [70, 85, 100].includes(v.scalaLogo as number)
      ? (v.scalaLogo as number)
      : 100,
    coloreRiquadri:
      typeof v.coloreRiquadri === "string" &&
      /^#[0-9a-f]{6}$/i.test(v.coloreRiquadri)
        ? v.coloreRiquadri
        : "",
    righeAlternate: v.righeAlternate === true,
    numerazione: typeof v.numerazione === "boolean" ? v.numerazione : true,
    notaPagina: testo("notaPagina", 100),
    introduzione: testo("introduzione", 1200),
    conclusione: testo("conclusione", 1200),
    condizioni: testo("condizioni", 4000),
    mostraFirma: typeof v.mostraFirma === "boolean" ? v.mostraFirma : true,
    etichettaFirma: testo("etichettaFirma", 90),
  };
}
export function rgbModello(colore: string): [number, number, number] {
  const n = parseInt(colore.replace("#", ""), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
