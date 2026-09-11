// Misurazione uniforme delle edge function (F3-01).
//
// PROBLEMA
// `recordMetric` esiste e funziona, ma è chiamata da 5 funzioni su 515: la
// piattaforma misura l'1% della propria superficie. Senza latenza ed errori per
// funzione non esiste modo di sapere se qualcosa sta degradando, e un guasto si
// scopre quando chiama il cliente.
//
// PERCHÉ UN WRAPPER
// Aggiungere try/finally e recordMetric a mano in centinaia di file significa
// centinaia di occasioni di sbagliare, e nessuna garanzia che la misura sia
// omogenea. Qui la strumentazione è una riga sola per funzione, e misura sempre
// le stesse cose allo stesso modo.
//
// USO
//   import { serveConMetriche } from "../_shared/withMetrics.ts";
//   serveConMetriche("nome-della-funzione", async (req) => { ... });
//
// La funzione originale non cambia: riceve la Request e restituisce la Response
// esattamente come prima. Le OPTIONS di preflight non vengono misurate (sono
// rumore che nasconderebbe la latenza vera).

import { recordMetric } from "./healthMetrics.ts";

type Gestore = (req: Request) => Promise<Response> | Response;

/**
 * Avvolge un gestore registrando durata ed esito di ogni chiamata.
 * Non altera il comportamento: un errore nella misurazione non può far
 * fallire la richiesta, e una richiesta fallita viene comunque misurata.
 */
export function conMetriche(nomeFunzione: string, gestore: Gestore): Gestore {
  return async (req: Request): Promise<Response> => {
    // Il preflight non è lavoro: misurarlo abbasserebbe artificialmente le medie.
    if (req.method === "OPTIONS") return await gestore(req);
    // Nemmeno il warmup del frontend (?warmup=1): sveglia il runtime senza
    // credenziali, e il 401 che riceve non è un guasto da mettere in Salute.
    if (new URL(req.url).searchParams.get("warmup") === "1") return await gestore(req);

    const inizio = Date.now();
    let statusCode = 200;
    let errore: string | undefined;

    try {
      const risposta = await gestore(req);
      statusCode = risposta.status;
      return risposta;
    } catch (e) {
      // Un gestore può lanciare una Response (pattern usato da requireAuth):
      // in quel caso è un esito, non un guasto.
      if (e instanceof Response) {
        statusCode = e.status;
        return e;
      }
      statusCode = 500;
      errore = (e as Error)?.message?.substring(0, 500);
      throw e;
    } finally {
      // La misurazione non deve mai rallentare la risposta né poterla rompere.
      void recordMetric({
        metricType: "edge_function_call",
        functionName: nomeFunzione,
        statusCode,
        latencyMs: Date.now() - inizio,
        errorMessage: errore,
      }).catch(() => {});
    }
  };
}

/** Scorciatoia: sostituisce `Deno.serve(handler)` misurando la funzione. */
export function serveConMetriche(nomeFunzione: string, gestore: Gestore): void {
  Deno.serve(conMetriche(nomeFunzione, gestore));
}
