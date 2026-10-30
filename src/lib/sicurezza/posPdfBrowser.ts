import { sha256Hex } from "../../../supabase/functions/_shared/improntaDocumento";
import type { ParametriDisegnoPos } from "../../../supabase/functions/_shared/posPdfBrowser";

/**
 * Il PDF del POS lo disegna il browser: il server ha 2 secondi di CPU per richiesta e pdfmake ne chiede da 0,5 (21
 * pagine) a oltre 2 (293). La sequenza: il server prepara e prenota (e costruisce l'HTML del modello), il browser lo
 * disegna dichiarando nel PDF a quale emissione e a quale HTML appartiene, il server conserva e certifica.
 * Le dipendenze si passano da fuori: rete e Worker sono i soli confini.
 */

/** Il browser non è riuscito a disegnare il PDF: chi chiama può ripiegare sul server (va bene per i POS piccoli). */
export class ErroreDisegnoPos extends Error {}

export interface DipendenzePdfPos {
  /** Una chiamata JSON a genera-pos. */
  chiama: <T>(corpo: Record<string, unknown>) => Promise<T>;
  /** Il completamento: i dati di sempre come JSON e il PDF come file (multipart). */
  carica: (meta: Record<string, unknown>, pdf: Uint8Array) => Promise<{ emissione_id: string; approvato_da_nome?: string }>;
  /** Il disegno, nel Worker. */
  disegna: (p: ParametriDisegnoPos) => Promise<Uint8Array>;
}

interface Preparazione {
  gia_approvato?: boolean; gia_completa?: boolean;
  emissione_id: string; token: string; emesso_il: string; html: string; layout: string; codice: string; revisione: number;
}

const impronta = (testo: string) => sha256Hex(new TextEncoder().encode(testo));

async function disegna(dip: DipendenzePdfPos, p: ParametriDisegnoPos): Promise<Uint8Array> {
  try {
    return await dip.disegna(p);
  } catch (e) {
    throw new ErroreDisegnoPos(e instanceof Error && e.message ? e.message : "Il browser non è riuscito a disegnare il PDF");
  }
}

/**
 * Approva il POS (o emette una copia di un contenuto già approvato, con `snapshotId`) disegnando il PDF nel browser.
 * Se qualcosa non va dopo la prenotazione, la libera subito invece di lasciarla scadere in 5 minuti.
 */
export async function emettiPdfConBrowser(dip: DipendenzePdfPos, r: { companyId: string; posId: string; attesaUpdatedAt?: string | null; snapshotId?: string }):
  Promise<{ gia?: true; emissioneId?: string; approvatoDaNome?: string }> {
  const prep = await dip.chiama<Preparazione>({ azione: "prepara_emissione", company_id: r.companyId, pos_id: r.posId,
    ...(r.snapshotId ? { snapshot_id: r.snapshotId } : { attesa_updated_at: r.attesaUpdatedAt }) });
  if (prep.gia_approvato) return { gia: true };
  if (prep.gia_completa) return { gia: true, emissioneId: prep.emissione_id };
  try {
    const pdf = await disegna(dip, { html: prep.html, codice: prep.codice, revisione: prep.revisione, emessoIl: prep.emesso_il, anteprima: false, layoutServer: prep.layout,
      legame: { emissioneId: prep.emissione_id, htmlSha256: await impronta(prep.html) } });
    const esito = await dip.carica({ azione: "completa_emissione", company_id: r.companyId, emissione_id: prep.emissione_id, token: prep.token, pdf_sha256: await sha256Hex(pdf) }, pdf);
    return { emissioneId: esito.emissione_id, approvatoDaNome: esito.approvato_da_nome };
  } catch (e) {
    await dip.chiama({ azione: "annulla_emissione", company_id: r.companyId, emissione_id: prep.emissione_id, token: prep.token }).catch((): void => undefined);
    throw e;
  }
}

/** L'anteprima della bozza, con la filigrana: l'HTML lo costruisce il server (e ne controlla i glifi), il PDF lo disegna il browser. */
export async function anteprimaPdfConBrowser(dip: DipendenzePdfPos, r: { companyId: string; posId: string }): Promise<Blob> {
  const a = await dip.chiama<{ html: string; layout: string; codice: string; revisione: number; emessoIl: string }>({ azione: "anteprima_html", company_id: r.companyId, pos_id: r.posId });
  const pdf = await disegna(dip, { html: a.html, codice: a.codice, revisione: a.revisione, emessoIl: a.emessoIl, anteprima: true, layoutServer: a.layout });
  return new Blob([pdf as BlobPart], { type: "application/pdf" });
}
