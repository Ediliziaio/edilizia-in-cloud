// Le fatture ricevute ed emesse usano lo stesso modello leggibile dell’XML.
import { type ElementoXml, type LettoreXml } from "../../../supabase/functions/_shared/fatturapaReader";
import { leggiFatturaRicevuta, senzaPrefissi } from "../../../supabase/functions/_shared/fatturaRicevutaXml";
import { fatturaXmlTabellareHtml } from './fatturaXmlTabellare';

export const TIPI_DOCUMENTO: Record<string, string> = {
  TD01: "Fattura", TD02: "Acconto/anticipo su fattura", TD03: "Acconto/anticipo su parcella",
  TD04: "Nota di credito", TD05: "Nota di debito", TD06: "Parcella",
  TD16: "Integrazione fattura reverse charge interno", TD17: "Integrazione/autofattura per acquisto servizi dall'estero",
  TD18: "Integrazione per acquisto di beni intracomunitari", TD19: "Integrazione/autofattura per acquisto di beni ex art. 17 c.2",
  TD20: "Autofattura per regolarizzazione", TD24: "Fattura differita", TD25: "Fattura differita (triangolari)",
  TD26: "Cessione di beni ammortizzabili", TD27: "Autoconsumo o cessioni gratuite",
};

/** Un allegato PDF dentro l'XML (spesso il PDF di cortesia del fornitore). */
export interface AllegatoPdf {
  nome: string;
  base64: string;
}

export interface AllegatoXml extends AllegatoPdf {
  formato: string;
  compressione: string;
  descrizione: string;
}

export interface FatturaRicevutaVista {
  html: string;
  /** Sorgente e corpo da usare anche per il download PDF, senza ricostruzioni. */
  xmlOriginale?: string;
  indiceCorpo?: number;
  /** I PDF che il fornitore ha incorporato nell'XML, se ci sono. */
  allegatiPdf: AllegatoPdf[];
  /** Tutti gli allegati, anche CSV, fogli di calcolo e file compressi. */
  allegatiFile?: AllegatoXml[];
  /** Nome suggerito per il file PDF. */
  titolo: string;
}


/** Stesso modello delle emesse; il lotto mostra esclusivamente il corpo scelto. */
export function fatturaRicevutaHtml(
  xml: string,
  parser: DOMParser,
  opzioni: { emessa?: boolean; indiceCorpo?: number } = {},
): FatturaRicevutaVista | null {
  const indiceCorpo = opzioni.indiceCorpo ?? 0;
  if (!Number.isInteger(indiceCorpo) || indiceCorpo < 0) return null;
  try {
    const f = leggiFatturaRicevuta(senzaPrefissi(xml), parser, indiceCorpo);
    if (!f) return null;
    const comune = fatturaXmlTabellareHtml(xml, { parser, indiceCorpo });
    const titolo = opzioni.emessa ? comune.titolo : `Fattura ${f.numero_fattura} - ${f.cedente_ragione_sociale}`;
    const allegatiFile = allegatiFatturaXml(xml, parser, indiceCorpo);
    return { html: comune.html, titolo, xmlOriginale: xml, indiceCorpo, allegatiPdf: pdfTraAllegati(allegatiFile), allegatiFile };
  } catch {
    return null;
  }
}

/**
 * I PDF incorporati nell'XML (elemento Allegati): molti fornitori ci mettono la
 * loro fattura «da guardare». Si riconosce dal formato dichiarato o dal nome, e
 * dall'intestazione %PDF del contenuto, così un allegato di altro tipo non si
 * apre come PDF.
 */
export function allegatiPdfDaXml(xml: string, parser: LettoreXml, indiceCorpo = 0): AllegatoPdf[] {
  return pdfTraAllegati(allegatiFatturaXml(xml, parser, indiceCorpo));
}

const pdfTraAllegati = (allegati: AllegatoXml[]): AllegatoPdf[] => allegati.filter(a => !a.compressione && (/pdf/i.test(a.formato) || /\.pdf$/i.test(a.nome)) && a.base64.startsWith('JVBER')).map(({ nome, base64 }) => ({ nome, base64 }));

export function allegatiFatturaXml(xml: string, parser: LettoreXml, indiceCorpo = 0): AllegatoXml[] {
  let doc;
  try {
    doc = parser.parseFromString(senzaPrefissi(xml), "text/xml");
  } catch {
    return [];
  }
  if (!doc || doc.getElementsByTagName("parsererror").length > 0) return [];
  const corpi = doc.getElementsByTagName("FatturaElettronicaBody");
  return allegatiDalCorpo(corpi[indiceCorpo]);
}

function allegatiDalCorpo(corpo: ElementoXml | undefined): AllegatoXml[] {
  if (!corpo) return [];
  const trovati: AllegatoXml[] = [];
  for (const a of Array.from(corpo.getElementsByTagName("Allegati"))) {
    const formato = a.getElementsByTagName("FormatoAttachment")[0]?.textContent?.trim() || "";
    const nome = a.getElementsByTagName("NomeAttachment")[0]?.textContent?.trim() || `allegato.${/^[a-z0-9]{1,8}$/i.test(formato) ? formato.toLowerCase() : 'bin'}`;
    const base64 = (a.getElementsByTagName("Attachment")[0]?.textContent ?? "").replace(/\s+/g, "");
    if (!base64) continue;
    trovati.push({ nome, base64, formato, compressione: a.getElementsByTagName('AlgoritmoCompressione')[0]?.textContent?.trim() ?? '', descrizione: a.getElementsByTagName('DescrizioneAttachment')[0]?.textContent?.trim() ?? '' });
  }
  return trovati;
}
