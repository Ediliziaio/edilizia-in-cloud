/**
 * planimetria-motore — il cancello del motore planimetrie online (23/11/2026).
 *
 * Il render fotorealistico (Blender Cycles) e la lettura DWG girano in un
 * container a parte, che si accende alla richiesta e si spegne dopo. Il
 * container non vede il database: qui si decide chi può usarlo.
 *
 *   { azione: "biglietto", company_id, operazione: "render" | "dwg" | "dwg-modello" }
 *     utente autenticato, accesso all'azienda, permesso «Render AI»; per il
 *     render scala UN credito render (lo stesso del Render AI) con il biglietto
 *     come sessione. Risponde { biglietto, url, scade }.
 *
 *   { azione: "esito", biglietto, esito: "fallito", firma }
 *     chiamata dal CONTAINER (firma HMAC dell'esito con il segreto comune):
 *     restituisce il credito di un render non riuscito. Idempotente: il
 *     rimborso è per sessione, un secondo esito risponde «già rimborsato».
 *
 * Il DWG non scala crediti: sono pochi secondi di CPU, come la lettura DWG
 * delle commesse (`cad-leggi-commessa`), che è gratuita.
 *
 * Costo vero di un render: ~1–3 minuti su 4 vCPU ≈ 1 centesimo di dollaro; un
 * credito render vale molto di più, quindi l'incidenza sul margine è nulla.
 */
import { DURATA_BIGLIETTO_MS, emettiBiglietto, firmaValida, leggiBiglietto, OPERAZIONI_MOTORE, testoEsito, type OperazioneMotore } from "../../../shared/planimetrie/bigliettoMotore.ts";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type Dipendenze = {
  segreto: string | undefined;
  urlMotore: string | undefined;
  adesso: () => number;
  nuovoId: () => string;
  /** Lancia (Response o Error) se non autenticato; altrimenti l'utente. */
  autentica: () => Promise<string>;
  /** Lancia un Error «Non autorizzato…» se l'utente non può. */
  verificaPermesso: (utente: string, azienda: string) => Promise<void>;
  scalaCredito: (p: { azienda: string; sessione: string; utente: string }) => Promise<"ok" | "insufficient">;
  rimborsaCredito: (p: { azienda: string; sessione: string; utente: string }) => Promise<string>;
};

type Risposta = { stato: number; corpo: Record<string, unknown> };
const no = (stato: number, error: string): Risposta => ({ stato, corpo: { error } });

export async function gestisci(corpo: unknown, d: Dipendenze): Promise<Risposta> {
  const b = (corpo && typeof corpo === "object" ? corpo : {}) as Record<string, unknown>;
  if (!d.segreto || d.segreto.length < 32 || !d.urlMotore) {
    return no(503, "Il motore planimetrie online non è ancora attivo.");
  }

  if (b.azione === "esito") {
    // Viene dal container: niente utente, vale solo la firma.
    const token = typeof b.biglietto === "string" ? b.biglietto : "";
    if (b.esito !== "fallito" || typeof b.firma !== "string") return no(400, "Esito non valido.");
    if (!(await firmaValida(d.segreto, testoEsito(token, "fallito"), b.firma))) return no(403, "Firma dell'esito non valida.");
    // Anche scaduto: il render può essere finito dopo i 10 minuti del biglietto.
    const letto = await leggiBiglietto(d.segreto, token, { adesso: 0 });
    if (!letto.ok) return no(403, "Biglietto non valido.");
    const x = letto.biglietto;
    if (!x.addebitato) return { stato: 200, corpo: { rimborso: "nessun_addebito" } };
    const esito = await d.rimborsaCredito({ azienda: x.azienda, sessione: x.id, utente: x.utente });
    return { stato: 200, corpo: { rimborso: esito } };
  }

  if (b.azione !== "biglietto") return no(400, "Azione non riconosciuta.");
  const azienda = typeof b.company_id === "string" ? b.company_id : "";
  const operazione = b.operazione as OperazioneMotore;
  if (!UUID.test(azienda)) return no(400, "Manca l'azienda.");
  if (!OPERAZIONI_MOTORE.includes(operazione)) return no(400, "Operazione non valida.");

  const utente = await d.autentica();
  try {
    await d.verificaPermesso(utente, azienda);
  } catch (e) {
    return no(403, e instanceof Error && /^Non autorizzato/.test(e.message)
      ? "Non hai il permesso per i render di questa azienda." : "Verifica dei permessi non riuscita.");
  }

  const id = d.nuovoId();
  let addebitato = false;
  if (operazione === "render") {
    const credito = await d.scalaCredito({ azienda, sessione: id, utente });
    if (credito === "insufficient") return no(402, "Crediti render esauriti: ricaricali per il render fotorealistico.");
    addebitato = true;
  }
  const scade = d.adesso() + DURATA_BIGLIETTO_MS;
  const biglietto = await emettiBiglietto(d.segreto, { id, azienda, utente, operazione, scade, addebitato });
  return { stato: 200, corpo: { biglietto, url: d.urlMotore.replace(/\/+$/, ""), scade, addebitato } };
}
