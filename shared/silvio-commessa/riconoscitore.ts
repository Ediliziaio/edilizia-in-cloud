/**
 * Il riconoscitore dei documenti (31/10/2026, fase 1, lotto 1.2). Vedi
 * docs/piano-silvio-commessa-ai.md, sezione 3.3: «nessun lettore nuovo dove ce n'è già uno».
 *
 * Guarda nome, tipo MIME e prime righe del file e sceglie chi lo legge:
 * - XPWE e PDF stampati da PriMus → i lettori dei computi, senza AI (`leggiFileComputo`);
 * - offerte delle ditte e dei fornitori → `rdo-ai-estrai-offerta`;
 * - tutto il resto (contratti, capitolati, PDF qualsiasi, foto, piantine, testo) → il
 *   lettore unico `silvio-commessa`, con il tipo di fonte che decide la fiducia.
 *
 * Sceglie, non legge: il lettore dei computi rifiuta un PDF che non è di PriMus, e chi
 * chiama ripiega allora su `silvio-commessa`. Un errore qui costa una lettura in più,
 * mai un dato sbagliato.
 *
 * Senza dipendenze, compatibile con Deno.
 */
import type { FonteLetturaAI } from "./letturaAI.ts";

export type Lettore = "computo_xpwe" | "computo_primus" | "offerta_ditta" | "silvio_commessa" | "non_letto";

export interface DocumentoDaRiconoscere {
  nome: string;
  mime?: string | null;
  /** Le prime righe del file: il testo della prima pagina di un PDF, l'inizio di un XML. */
  inizio?: string | null;
}

export interface Riconosciuto {
  lettore: Lettore;
  /** Il tipo di fonte del frammento (per i computi è «computo», deciso dal loro lettore). */
  fonte: FonteLetturaAI | "computo" | "offerta";
  /** Costa crediti AI: il popup mostra la stima prima di partire. */
  ai: boolean;
  /** Foto o piantina: si legge con la visione. */
  immagine: boolean;
  /** Perché, in una riga, per la ⓘ della fonte. */
  motivo: string;
}

const estensione = (nome: string) => /\.([a-z0-9]+)$/i.exec(nome.trim())?.[1]?.toLowerCase() ?? "";

const IMMAGINI = new Set(["jpg", "jpeg", "png", "webp"]);
const NON_LETTI = new Set(["doc", "docx", "odt", "xls", "xlsx", "ods", "csv", "zip", "rar", "7z", "dwg", "dxf", "heic", "mp4", "mov"]);

/** I segni di un computo stampato da PriMus (gli stessi che cerca `eComputoPrimus`). */
const PRIMUS = [/\bprimus\b/i, /designazione dei lavori/i, /\bsommano\b/i, /num\.?\s*ord\.?/i, /\btariffa\b/i];
const CONTRATTO = /\bcontratto\b|scrittura privata/i;
const CAPITOLATO = /capitolato/i;
const OFFERTA_NEL_NOME = /\boffert[ae]\b|\bofferta[-_ ]|\bquotazione\b/i;
const OFFERTA_NEL_TESTO = /(?:nostra|ns\.?)\s+(?:migliore\s+)?offerta|offerta\s+(?:economica\s+)?n[°.r]|validit[àa]\s+(?:dell'?\s*)?offerta|in\s+riferimento\s+alla\s+(?:vs\.?|vostra)\s+richiesta/i;
const PIANTINA = /piantin|planimetri|\bpianta\b|\blayout\b/i;

/**
 * Contratto o capitolato? Decide il nome; se tace, la parola che il testo dice per prima
 * (un capitolato «speciale d'appalto» nomina il contratto, un contratto il capitolato).
 */
function tipoScritto(nome: string, inizio: string): "contratto" | "capitolato" | null {
  if (CAPITOLATO.test(nome)) return "capitolato";
  if (CONTRATTO.test(nome)) return "contratto";
  const c = inizio.search(CONTRATTO);
  const k = inizio.search(CAPITOLATO);
  if (c < 0 && k < 0) return null;
  if (c < 0) return "capitolato";
  if (k < 0) return "contratto";
  return c < k ? "contratto" : "capitolato";
}

export function riconosciDocumento(doc: DocumentoDaRiconoscere): Riconosciuto {
  const nome = doc.nome ?? "";
  const ext = estensione(nome);
  const mime = (doc.mime ?? "").toLowerCase();
  const inizio = (doc.inizio ?? "").slice(0, 6000);

  if (ext === "xpwe" || ext === "dcf" || (/^(xml|txt)$/.test(ext) && /<Pwe(Documento|DatiGenerali|Misurazioni)\b/.test(inizio))) {
    return { lettore: "computo_xpwe", fonte: "computo", ai: false, immagine: false, motivo: "computo di PriMus (XPWE): lettore del computo, senza AI" };
  }

  const pdf = ext === "pdf" || mime === "application/pdf";
  if (pdf && PRIMUS.filter((re) => re.test(inizio)).length >= 2 && /computo|sommano|tariffa/i.test(inizio)) {
    return { lettore: "computo_primus", fonte: "computo", ai: false, immagine: false, motivo: "computo stampato da PriMus: lettore del computo, senza AI" };
  }

  const immagine = IMMAGINI.has(ext) || /^image\/(jpeg|png|webp)$/.test(mime);
  if (!pdf && !immagine && (NON_LETTI.has(ext) || (mime && !/^text\//.test(mime) && !/^image\//.test(mime)))) {
    return {
      lettore: "non_letto", fonte: "documento", ai: false, immagine: false,
      motivo: /^(xls|xlsx|ods|csv)$/.test(ext)
        ? "foglio di calcolo: per un computo usa «Importa computo», per il resto salvalo in PDF"
        : "formato non letto: carica un PDF, una foto (JPG, PNG, WEBP) o un testo",
    };
  }
  if (/^image\//.test(mime) && !/^image\/(jpeg|png|webp)$/.test(mime) && !IMMAGINI.has(ext)) {
    return { lettore: "non_letto", fonte: "documento", ai: false, immagine: false, motivo: "formato d'immagine non letto: usa JPG, PNG o WEBP" };
  }

  // Un contratto parla di offerte («l'offerta del … è parte del contratto»): vince il contratto.
  const contratto = tipoScritto(nome, inizio) === "contratto";
  if (!contratto && (OFFERTA_NEL_NOME.test(nome) || OFFERTA_NEL_TESTO.test(inizio))) {
    return { lettore: "offerta_ditta", fonte: "offerta", ai: true, immagine, motivo: "offerta di una ditta o di un fornitore: lettore delle offerte" };
  }

  if (immagine) {
    return {
      lettore: "silvio_commessa", fonte: "documento", ai: true, immagine: true,
      motivo: PIANTINA.test(nome) ? "piantina: lettura con la visione" : "foto: lettura con la visione",
    };
  }
  if (!pdf && (ext === "txt" || ext === "md" || /^text\//.test(mime))) {
    return { lettore: "silvio_commessa", fonte: "testo", ai: true, immagine: false, motivo: "testo: lettore unico di Silvio" };
  }
  if (contratto) return { lettore: "silvio_commessa", fonte: "contratto", ai: true, immagine: false, motivo: "contratto: lettore unico di Silvio" };
  return {
    lettore: "silvio_commessa", fonte: "documento", ai: true, immagine: false,
    motivo: tipoScritto(nome, inizio) === "capitolato" ? "capitolato: lettore unico di Silvio"
      : PIANTINA.test(nome) ? "piantina: lettore unico di Silvio" : "documento: lettore unico di Silvio",
  };
}
