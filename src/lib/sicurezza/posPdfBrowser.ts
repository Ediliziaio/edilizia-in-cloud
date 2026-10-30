import { sha256Hex } from "../../../supabase/functions/_shared/improntaDocumento";
import { LAYOUT_POS_VERSIONE } from "../../../supabase/functions/_shared/posRenderer";
import type { ParametriDisegnoPos } from "../../../supabase/functions/_shared/posPdfBrowser";
import { ErroreAnnullato, ErroreDisegnoPos, type FasePdf } from "./posPdfErrori";
export { ErroreAnnullato, ErroreDisegnoPos, type FasePdf };

/**
 * Il PDF del POS lo disegna il browser: il server ha 2 secondi di CPU per richiesta e pdfmake ne chiede da 0,5 (21
 * pagine) a oltre 2 (293). La sequenza: il server prepara e prenota (e costruisce l'HTML del modello, con la data di
 * emissione sua: il browser non usa il suo orologio), il browser lo disegna, il server controlla e conserva. Il browser
 * dichiara nella richiesta le impronte del PDF e del modello da cui l'ha disegnato e la versione del suo layout; il
 * server le confronta con quelle che ricostruisce dalla versione prenotata del POS e non interpreta il file.
 * Le dipendenze si passano da fuori: rete e Worker sono i soli confini.
 */
export interface DipendenzePdfPos {
  /** Una chiamata JSON a genera-pos. */
  chiama: <T>(corpo: Record<string, unknown>) => Promise<T>;
  /** Il completamento: i dati di sempre come JSON e il PDF come file (multipart). */
  carica: (meta: Record<string, unknown>, pdf: Uint8Array) => Promise<{ emissione_id: string; approvato_da_nome?: string }>;
  /** Il disegno, nel Worker; si ferma se arriva il segnale di annullamento. */
  disegna: (p: ParametriDisegnoPos, segnale?: AbortSignal) => Promise<Uint8Array>;
}
export interface OpzioniPdfPos {
  /** Annulla (solo finché si prepara o si disegna). */
  segnale?: AbortSignal;
  /** Avvisa a ogni cambio di fase, per l'avanzamento. */
  onFase?: (fase: FasePdf) => void;
}

interface Preparazione {
  gia_approvato?: boolean; gia_completa?: boolean;
  emissione_id: string; token: string; emesso_il: string; html: string; layout: string; codice: string; revisione: number;
}

const impronta = (testo: string) => sha256Hex(new TextEncoder().encode(testo));

async function disegna(dip: DipendenzePdfPos, p: ParametriDisegnoPos, segnale?: AbortSignal): Promise<Uint8Array> {
  try {
    return await dip.disegna(p, segnale);
  } catch (e) {
    if (e instanceof ErroreAnnullato) throw e;
    throw new ErroreDisegnoPos(e instanceof Error && e.message ? e.message : "Il browser non è riuscito a disegnare il PDF");
  }
}

/**
 * Approva il POS (o emette una copia di un contenuto già approvato, con `snapshotId`) disegnando il PDF nel browser.
 * Se qualcosa non va dopo la prenotazione, la libera subito invece di lasciarla scadere in 5 minuti.
 */
export async function emettiPdfConBrowser(dip: DipendenzePdfPos, r: { companyId: string; posId: string; attesaUpdatedAt?: string | null; snapshotId?: string }, opz: OpzioniPdfPos = {}):
  Promise<{ gia?: true; emissioneId?: string; approvatoDaNome?: string }> {
  const { segnale, onFase } = opz;
  const controlla = () => { if (segnale?.aborted) throw new ErroreAnnullato(); };
  controlla();
  onFase?.("prepara");
  const prep = await dip.chiama<Preparazione>({ azione: "prepara_emissione", company_id: r.companyId, pos_id: r.posId,
    ...(r.snapshotId ? { snapshot_id: r.snapshotId } : { attesa_updated_at: r.attesaUpdatedAt }) });
  if (prep.gia_approvato) return { gia: true };
  if (prep.gia_completa) return { gia: true, emissioneId: prep.emissione_id };
  try {
    controlla();
    onFase?.("disegna");
    const pdf = await disegna(dip, { html: prep.html, codice: prep.codice, revisione: prep.revisione, emessoIl: prep.emesso_il, anteprima: false, layoutServer: prep.layout }, segnale);
    controlla();
    // Da qui il documento parte verso il server, che potrebbe conservarlo prima che la risposta torni: non si annulla più.
    onFase?.("conserva");
    const esito = await dip.carica({ azione: "completa_emissione", company_id: r.companyId, emissione_id: prep.emissione_id, token: prep.token,
      pdf_sha256: await sha256Hex(pdf), html_sha256: await impronta(prep.html), layout: LAYOUT_POS_VERSIONE }, pdf);
    return { emissioneId: esito.emissione_id, approvatoDaNome: esito.approvato_da_nome };
  } catch (e) {
    await dip.chiama({ azione: "annulla_emissione", company_id: r.companyId, emissione_id: prep.emissione_id, token: prep.token }).catch((): void => undefined);
    throw e;
  }
}

/** L'anteprima della bozza, con la filigrana: l'HTML lo costruisce il server (e ne controlla i glifi), il PDF lo disegna il browser. */
export async function anteprimaPdfConBrowser(dip: DipendenzePdfPos, r: { companyId: string; posId: string }, opz: OpzioniPdfPos = {}): Promise<Blob> {
  const { segnale, onFase } = opz;
  const controlla = () => { if (segnale?.aborted) throw new ErroreAnnullato(); };
  controlla();
  onFase?.("prepara");
  const a = await dip.chiama<{ html: string; layout: string; codice: string; revisione: number; emessoIl: string }>({ azione: "anteprima_html", company_id: r.companyId, pos_id: r.posId });
  controlla();
  onFase?.("disegna");
  const pdf = await disegna(dip, { html: a.html, codice: a.codice, revisione: a.revisione, emessoIl: a.emessoIl, anteprima: true, layoutServer: a.layout }, segnale);
  controlla();
  return new Blob([pdf as BlobPart], { type: "application/pdf" });
}
