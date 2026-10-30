import { supportaRequisitiAddettiPos } from "./posRequisitiAddetti.ts";
import { supportaDocumentiMezziPos } from "./posDocumentiMezzi.ts";
import { supportaMezziPos } from "./posMezzi.ts";
import { supportaFontiTecnichePos } from "./posFontiTecniche.ts";
import { supportaTecnicaPos } from "./posTecnica.ts";
import { supportaProdottiPos } from "./posProdotti.ts";
import { verificaVersionePos } from "./posVersione.ts";
import { normalizzaPos, vociMancanti, type PosContenuto } from "./posModello.ts";

/** Una risposta da dare così com'è: lo stato HTTP e il corpo JSON. Chi chiama la trasforma in Response. */
export interface RispostaPos { tipo: "risposta"; status: number; corpo: Record<string, unknown> }
export const rispostaPos = (status: number, corpo: Record<string, unknown>): RispostaPos => ({ tipo: "risposta", status, corpo });
export const erroreRispostaPos = (messaggio: string, status: number): RispostaPos => rispostaPos(status, { error: messaggio });

/**
 * I controlli che precedono ogni approvazione, comunque si disegni il PDF (approva, che lo disegna il server, e
 * prepara_emissione, che lo fa disegnare al browser): la stessa funzione, così le due strade non possono divergere.
 * Restituisce la risposta da dare (errore, o «già approvato») oppure il contenuto normalizzato da approvare.
 */
// deno-lint-ignore no-explicit-any
export function controlliApprovazione(pos: any, body: Record<string, any>): RispostaPos | { tipo: "contenuto"; contenuto: PosContenuto } {
  // check the editor token before any approval, rendering or replay.
  verificaVersionePos(pos, body);
  if (pos.contenuto?.versione_controlli === 2 && body.versione_client !== 2) return erroreRispostaPos("Questo POS richiede l’editor aggiornato: ricarica l’app prima di approvare", 409);
  if (pos.status === "approvato") return rispostaPos(200, { ok: true, gia_approvato: true });
  if (pos.status !== "bozza") return erroreRispostaPos("Apri una bozza prima di approvare il POS", 409);
  if (body.versione_client === 2 && pos.contenuto?.versione_controlli !== 2) return erroreRispostaPos("Apri il POS nell’editor aggiornato, verifica i controlli e salva la bozza prima di approvare", 409);
  const contenuto = normalizzaPos(pos.contenuto);
  if (contenuto.versione_prodotti === 1 && !supportaProdottiPos(body)) return erroreRispostaPos("Ricarica l’editor per riesaminare i prodotti di questo POS", 409);
  if (contenuto.versione_tecnica === 1 && !supportaTecnicaPos(body)) return erroreRispostaPos("Ricarica l’editor per riesaminare le schede tecniche di questo POS", 409);
  if (contenuto.versione_mezzi === 1 && !supportaMezziPos(body)) return erroreRispostaPos("Ricarica l’editor per verificare le attrezzature", 409);
  if (contenuto.versione_fonti_tecniche === 1 && !supportaFontiTecnichePos(body)) return erroreRispostaPos("Ricarica l’editor per verificare le fonti tecniche", 409);
  if (contenuto.versione_requisiti_addetti === 1 && !supportaRequisitiAddettiPos(body)) return erroreRispostaPos("Ricarica l’editor per i riscontri nominativi della propria impresa", 409);
  if (contenuto.versione_documenti_mezzi === 1 && !supportaDocumentiMezziPos(body)) return erroreRispostaPos("Ricarica l’editor per verificare documenti e controlli delle attrezzature", 409);
  if (contenuto.versione_psc === 1 && body.versione_psc_client !== 1) return erroreRispostaPos("Ricarica l’editor per il riferimento originale del PSC", 409);
  const mancanti = vociMancanti(contenuto);
  if (mancanti.length) return rispostaPos(422, { ok: false, error: "Il POS non ha ancora tutti i contenuti minimi dell'Allegato XV", mancanti });
  return { tipo: "contenuto", contenuto };
}
