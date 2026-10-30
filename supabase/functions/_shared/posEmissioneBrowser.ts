import { costruisciHtmlPos, type DatiStampaPos } from "./posHtml.ts";
import { layoutPdfPos } from "./posPdfLayout.ts";
import { fontsRiferimentoPos, verificaGlifiPos } from "./posGlifi.ts";
import { leggiLegamePdfPos } from "./posPdfLegame.ts";
import { LAYOUT_POS_VERSIONE, VERSIONE_RENDERER_POS_BROWSER } from "./posRenderer.ts";
import { sha256Hex } from "./improntaDocumento.ts";
import { strToU8 } from "fflate";
import {
  conErroreRegistrato, datiEmissionePos, ErroreEmissionePos, pacchettoEmissionePos, prenotaEmissionePos, pubblicaPacchettoEmissione,
  raccogliFontiEmissione, type RigaEmissionePos, type SorgenteEmissione,
} from "./posEmissione.ts";
// deno-lint-ignore no-explicit-any
type Db = any;

/**
 * L'emissione con il PDF disegnato dal browser. Il server ha 2 secondi di CPU per richiesta e disegnare un POS con
 * pdfmake ne costa da 0,5 (21 pagine) a oltre 2 (293): qui il server prepara e certifica, il browser disegna.
 *
 *   preparaEmissioneBrowser   prenota, verifica le fonti e i glifi, costruisce l'HTML del modello (nessun pdfmake)
 *   completaEmissioneBrowser  riceve il PDF, lo lega all'emissione e al modello, e conserva come sempre: upload, rilettura
 *                             con confronto SHA-256, completamento atomico (immutabile)
 *   annullaEmissioneBrowser   libera subito la prenotazione se il browser non riesce a disegnare
 *
 * Il server non rifà il PDF: lo lega al modello. Il PDF dichiara l'emissione e l'impronta dell'HTML (posPdfLegame.ts) e
 * il server le controlla; l'HTML resta congelato nello ZIP accanto al PDF e il manifest dice chi ha disegnato.
 */
export const LIMITE_PDF_BROWSER = 25 * 1024 * 1024;

export type PreparazioneBrowser =
  | { giaCompleta: true; emissione: RigaEmissionePos }
  | { giaCompleta: false; emissioneId: string; token: string; emessoIl: string; html: string; layout: string; codice: string; revisione: number };

/** L'HTML del modello, dopo aver controllato che il PDF si possa disegnare (struttura e glifi): stessi controlli del PDF del server. */
export function modelloHtmlPos(dati: DatiStampaPos, emessoIl: string, anteprima: boolean): string {
  const html = costruisciHtmlPos(anteprima ? { ...dati, stato: "bozza" } : dati);
  verificaGlifiPos(layoutPdfPos(html, dati.codiceCommessa || "Commessa", dati.revisione, emessoIl, anteprima).testo);
  return html;
}

export async function preparaEmissioneBrowser(db: Db, userId: string, sorgente: SorgenteEmissione): Promise<PreparazioneBrowser> {
  const e = await prenotaEmissionePos(db, userId, sorgente);
  if (e.stato === "completa") return { giaCompleta: true, emissione: e };
  return conErroreRegistrato(db, e, async () => {
    const dati = datiEmissionePos(e, sorgente);
    // Meglio saperlo ora che dopo l'attesa del disegno: una fonte che non torna ferma subito.
    await raccogliFontiEmissione(db, userId, e, sorgente, dati);
    const html = modelloHtmlPos(dati, e.emesso_il, false);
    return { giaCompleta: false as const, emissioneId: e.id, token: e.token, emessoIl: e.emesso_il, html, layout: LAYOUT_POS_VERSIONE, codice: dati.codiceCommessa || "Commessa", revisione: dati.revisione };
  });
}

export interface CompletamentoBrowser {
  companyId: string; emissioneId: string; token: string;
  pdf: Uint8Array; pdfSha256: string;
  /** Ricostruisce dal database la sorgente dell'emissione data la sua prenotazione (contenuto, autore, fonti dell'app). */
  sorgente: (e: RigaEmissionePos) => Promise<SorgenteEmissione>;
}

export async function completaEmissioneBrowser(db: Db, userId: string, c: CompletamentoBrowser): Promise<RigaEmissionePos> {
  const { data, error } = await db.from("pos_emissioni").select("*").eq("id", c.emissioneId).eq("company_id", c.companyId).maybeSingle();
  if (error || !data) throw new ErroreEmissionePos("Emissione non disponibile", 404);
  const e = data as RigaEmissionePos;
  if (e.stato === "completa") return e;
  // Il token è il segreto di chi ha prenotato: senza non si tocca nemmeno la prenotazione.
  if (e.token !== c.token || e.stato !== "preparazione") throw new ErroreEmissionePos("La preparazione è stata sostituita da un'altra: riprova", 409);
  return conErroreRegistrato(db, e, async traccia => {
    if (!e.riservata_fino || Date.parse(e.riservata_fino) < Date.now()) throw new ErroreEmissionePos("Preparazione scaduta: riprova", 409);
    if (c.pdf.length > LIMITE_PDF_BROWSER) throw new ErroreEmissionePos("Il PDF è troppo grande per essere conservato", 413);
    if (c.pdf.length < 5 || new TextDecoder().decode(c.pdf.subarray(0, 5)) !== "%PDF-") throw new ErroreEmissionePos("Il file ricevuto non è un PDF");
    if (await sha256Hex(c.pdf) !== c.pdfSha256.toLowerCase()) throw new ErroreEmissionePos("L'impronta del PDF ricevuto non corrisponde a quella dichiarata: riprova");
    const legame = leggiLegamePdfPos(c.pdf);
    if (!legame) throw new ErroreEmissionePos("Il PDF non dichiara a quale emissione appartiene: riprova dall'editor");
    if (legame.layout !== LAYOUT_POS_VERSIONE) throw new ErroreEmissionePos("Il PDF è stato disegnato con un modello di stampa diverso da quello del server: aggiorna l'app e riprova", 409);
    if (legame.emissioneId !== e.id) throw new ErroreEmissionePos("Il PDF è stato disegnato per un'altra emissione: riprova", 409);
    const sorgente = await c.sorgente(e);
    const dati = datiEmissionePos(e, sorgente);
    const html = costruisciHtmlPos(dati);
    if (legame.htmlSha256 !== await sha256Hex(strToU8(html))) throw new ErroreEmissionePos("Il POS è cambiato durante la preparazione del PDF: ricaricalo e riprova", 409);
    const fonti = await raccogliFontiEmissione(db, userId, e, sorgente, dati);
    const pacchetto = await pacchettoEmissionePos(db, e, sorgente, dati, fonti, { bytes: c.pdf, html, fonts: await fontsRiferimentoPos(), generatore: VERSIONE_RENDERER_POS_BROWSER });
    traccia.daRipulire = pacchetto.oggetti.map(f => f.path);
    return pubblicaPacchettoEmissione(db, userId, e, sorgente, pacchetto, fonti.pscVerificato);
  });
}

/** Se il browser non riesce a disegnare il PDF la prenotazione si libera subito, invece di aspettare i 5 minuti. Ripeterlo non è un errore. */
export async function annullaEmissioneBrowser(db: Db, companyId: string, emissioneId: string, token: string): Promise<void> {
  await db.from("pos_emissioni").update({ stato: "errore", errore: "Annullata: il PDF non è stato disegnato", updated_at: new Date().toISOString() })
    .eq("id", emissioneId).eq("company_id", companyId).eq("token", token).eq("stato", "preparazione").select("id").maybeSingle();
}
