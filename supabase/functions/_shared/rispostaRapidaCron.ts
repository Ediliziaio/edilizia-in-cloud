/**
 * rispostaRapidaCron — al cron si risponde subito, il lavoro finisce dopo.
 *
 * IL GUASTO CHE QUESTO FILE ESISTE PER EVITARE (20/09/2026)
 * ---------------------------------------------------------
 * pg_net ha un solo worker, che elabora le richieste a lotti dentro UNA sola
 * transazione (src/worker.c: StartTransactionCommand → consuma il lotto →
 * `while (running_handles > 0)` → CommitTransactionCommand; è così fino alla
 * 0.20.5, l'ultima). Finché la richiesta più lenta del lotto non ha risposto,
 * nessuna risposta del lotto diventa visibile e il lotto successivo non parte.
 *
 * Una funzione che lavora due minuti prima di rispondere tiene quindi ferma
 * per due minuti la coda di TUTTI i cron — process-automation compreso, che
 * gira ogni minuto, e la sonda del battito, che dopo 90 secondi senza risposta
 * segna «fallito» anche se la piattaforma sta benissimo.
 *
 * Il cron non legge la risposta: è «lancia e dimentica». Tenerlo in attesa non
 * serve a nessuno. Qui la funzione, quando a chiamarla è pg_net:
 *   · mette il lavoro sotto EdgeRuntime.waitUntil, così il worker non viene
 *     ritirato a metà (un worker che ha già risposto e non ha promesse in
 *     sospeso «sembra fermo» e può essere chiuso in anticipo);
 *   · risponde con l'esito vero se il lavoro finisce entro pochi secondi — il
 *     caso normale di chi interroga una coda vuota — e il monitoraggio continua
 *     a vedere 200, 401, 500 come prima;
 *   · altrimenti risponde 202 e lascia finire il lavoro. L'esito tardivo resta
 *     nei log della funzione.
 *
 * Chi chiama dall'interfaccia o da un'altra funzione riceve l'esito completo,
 * come sempre: «Sincronizza ora» nella posta, «Sincronizza» in Siti e Google e
 * il pulsante delle fonti KB leggono i contatori della risposta.
 *
 * COME SI RICONOSCE pg_net
 * Dallo User-Agent: pg_net si presenta sempre come `pg_net/<versione>`
 * (src/core.c). Non dall'header `x-cron-secret`: quello lo mandano anche le
 * funzioni che ne chiamano un'altra e ne aspettano l'esito. Passano da pg_net i
 * job pg_cron, i ponti SQL (silvio_invoke_edge, calendario_esterno_sveglia…) e
 * i trigger che svegliano una funzione: tutti «lancia e dimentica».
 *
 * Insieme a questo va tenuta corta l'attesa di pg_net (`timeout_milliseconds`)
 * nel comando del job: è la durata massima del blocco, per tutti. Vedi la
 * migrazione cron_attese_brevi_pg_net.
 *
 * COSA SI È VISTO IN PRODUZIONE (20/09/2026)
 * Il «DNS time: 120000 ms» dei messaggi di timeout non era un DNS lento: pg_net
 * lo scrive quando due contatori di curl restano a zero, cioè a connessione
 * riutilizzata. Erano due funzioni lente, sempre agli stessi minuti. E senza
 * waitUntil il lavoro NON finiva: alla chiusura della connessione il runtime
 * ritirava il worker (EarlyDrop) — outreach-imap-poll non completava un giro da
 * quattro giorni.
 */

/**
 * Oltre questo tempo pg_net riceve 202 e il lavoro prosegue da solo.
 *
 * Cinque secondi: abbastanza perché un giro a vuoto — il caso normale di chi
 * interroga una coda — risponda con l'esito vero, e abbastanza pochi da stare
 * sotto l'attesa più corta con cui pg_net chiama una di queste funzioni (gli
 * 8 secondi dei ponti SQL dei calendari), tolto il tempo di avvio a freddo.
 * I job pg_cron aspettano 15 secondi.
 */
export const ATTESA_RISPOSTA_CRON_MS = 5_000;

type RuntimeEdge = { waitUntil?: (promessa: Promise<unknown>) => void };

/**
 * true se la richiesta arriva dalla coda di pg_net. Non è un controllo di
 * accesso — quello resta alla funzione (cronSecretValido in cronAuth.ts): qui
 * si decide soltanto QUANDO rispondere, non SE eseguire. A chi si fingesse
 * pg_net la funzione risponde 401 in pochi millisecondi, come prima.
 */
export function chiamataDaPgNet(req: Request): boolean {
  return /^pg_net\//i.test(req.headers.get("user-agent") ?? "");
}

export interface OpzioniRispostaRapida {
  /** Nome della funzione, per ritrovare l'esito tardivo nei log. */
  nome?: string;
  /** Attesa massima prima del 202. Predefinita: ATTESA_RISPOSTA_CRON_MS. */
  attesaMs?: number;
}

/**
 * Esegue `gestisci`. Se la chiamata arriva da pg_net e il lavoro supera
 * l'attesa, risponde 202 e lo lascia finire in background.
 *
 *   Deno.serve((req) => conRispostaRapida(req, gestisci, { nome: "email-poll-inbox" }));
 *
 * Per le funzioni già misurate c'è serveConMetricheRapida in
 * withMetricsRapida.ts, che misura il lavoro vero e non i pochi secondi della
 * risposta.
 */
export async function conRispostaRapida(
  req: Request,
  gestisci: (req: Request) => Promise<Response>,
  opzioni: OpzioniRispostaRapida = {},
): Promise<Response> {
  if (!chiamataDaPgNet(req)) return gestisci(req);

  const nome = opzioni.nome ?? new URL(req.url).pathname.split("/").filter(Boolean).pop() ?? "funzione";
  const attesaMs = opzioni.attesaMs ?? ATTESA_RISPOSTA_CRON_MS;
  const partenza = Date.now();

  // Il corpo si legge ADESSO: dopo il 202 lo stream della richiesta originale
  // non è più garantito, e una funzione che lo leggesse tardi troverebbe vuoto.
  // I corpi dei cron sono poche decine di byte.
  const richiesta = await copiaConCorpoLetto(req);

  const lavoro: Promise<Response> = (async () => {
    try {
      return await gestisci(richiesta);
    } catch (e) {
      // Un gestore può lanciare una Response (pattern usato da requireAuth e
      // requireInternalSecret): è un esito, non un guasto.
      if (e instanceof Response) return e;
      const messaggio = e instanceof Error ? e.message : String(e);
      console.error(`[${nome}] errore non gestito:`, messaggio);
      return new Response(JSON.stringify({ error: messaggio }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }
  })();

  const runtime = (globalThis as unknown as { EdgeRuntime?: RuntimeEdge }).EdgeRuntime;
  if (runtime?.waitUntil) runtime.waitUntil(lavoro);

  let sveglia: ReturnType<typeof setTimeout> | undefined;
  const scaduta = new Promise<"scaduta">((risolvi) => {
    sveglia = setTimeout(() => risolvi("scaduta"), attesaMs);
  });
  const esito = await Promise.race([lavoro, scaduta]);
  if (sveglia !== undefined) clearTimeout(sveglia);

  if (esito !== "scaduta") return esito;

  // L'esito vero non lo vedrà più nessuno nella risposta HTTP: va nei log.
  lavoro.then((risposta) => {
    const durata = Date.now() - partenza;
    if (risposta.status >= 400) {
      console.error(`[${nome}] finito in background con status ${risposta.status} dopo ${durata} ms`);
    } else {
      console.log(`[${nome}] finito in background: status ${risposta.status} dopo ${durata} ms`);
    }
  });

  return new Response(
    JSON.stringify({ accettato: true, in_background: true, funzione: nome, attesa_ms: attesaMs }),
    { status: 202, headers: { "Content-Type": "application/json" } },
  );
}

async function copiaConCorpoLetto(req: Request): Promise<Request> {
  if (req.method === "GET" || req.method === "HEAD") return req;
  const corpo = await req.arrayBuffer();
  return new Request(req.url, {
    method: req.method,
    headers: req.headers,
    body: corpo.byteLength > 0 ? corpo : undefined,
  });
}
