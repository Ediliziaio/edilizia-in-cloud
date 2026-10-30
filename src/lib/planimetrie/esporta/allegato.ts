/**
 * La pianta da allegare al preventivo: il PDF della tavola, con un nome di
 * file parlante e la descrizione da mostrare nell'elenco degli allegati.
 *
 * Solo predisposto: il preventivo non lo chiama ancora (arriva in una fase
 * dopo, come l'opzione «allega i render»). Il collegamento dovrà solo
 * chiamare `allegatoPreventivo` e salvare `dati` dove salva gli altri allegati.
 */
import { esportaPdf, type OpzioniPdf } from "./pdf";
import type { DatiCartiglio, VistaPianta } from "./tipi";

export interface AllegatoPianta {
  nomeFile: string;
  tipo: "application/pdf";
  dati: Uint8Array;
  /** «Pianta stato di progetto, scala 1:50, A3» */
  descrizione: string;
  scala: number;
}

const slug = (s: string) =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "pianta";

export function nomeFilePianta(vista: VistaPianta, versione: string | undefined, scala: number, estensione = "pdf"): string {
  const v = versione ? `-${slug(versione)}` : "";
  return `pianta-${slug(vista.titolo)}${v}-1-${scala}.${estensione}`;
}

export async function allegatoPreventivo(
  vista: VistaPianta,
  cartiglio: DatiCartiglio,
  opzioni: OpzioniPdf = {},
): Promise<AllegatoPianta> {
  // Per il preventivo il foglio di serie è l'A4 (si stampa con il resto) e la scala si adatta.
  const pdf = await esportaPdf(vista, cartiglio, { formato: "A4", orientamento: "orizzontale", scala: "auto", ...opzioni });
  return {
    nomeFile: nomeFilePianta(vista, cartiglio.versione, pdf.scala),
    tipo: "application/pdf",
    dati: pdf.dati,
    descrizione: `${cartiglio.oggetto ?? vista.livello ?? "Pianta"}, scala 1:${pdf.scala}, ${pdf.formato}`,
    scala: pdf.scala,
  };
}
