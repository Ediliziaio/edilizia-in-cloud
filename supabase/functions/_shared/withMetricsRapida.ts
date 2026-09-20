// serveConMetriche per le funzioni che i cron chiamano e che possono lavorare a
// lungo: a pg_net si risponde entro pochi secondi, il lavoro finisce in
// background. Il perché sta in rispostaRapidaCron.ts.
//
// La misura avvolge il LAVORO, non la risposta: in Salute resta la durata vera
// anche quando a pg_net è già arrivato il 202. È da lì che si vede quali
// funzioni tenevano ferma la coda, e per quanto.
//
// File a parte apposta: ritoccare withMetrics.ts farebbe ripubblicare tutte le
// funzioni che lo importano (scripts/funzioni-da-ripubblicare.mjs risale gli
// import), mentre qui si ripubblica solo chi passa alla risposta rapida.
//
// USO — una riga, al posto di serveConMetriche:
//   import { serveConMetricheRapida } from "../_shared/withMetricsRapida.ts";
//   serveConMetricheRapida("nome-della-funzione", async (req) => { ... });

import { conMetriche } from "./withMetrics.ts";
import { conRispostaRapida } from "./rispostaRapidaCron.ts";

type Gestore = (req: Request) => Promise<Response> | Response;

export function serveConMetricheRapida(nomeFunzione: string, gestore: Gestore): void {
  const misurato = conMetriche(nomeFunzione, gestore);
  Deno.serve((req) => conRispostaRapida(req, async (r) => await misurato(r), { nome: nomeFunzione }));
}
