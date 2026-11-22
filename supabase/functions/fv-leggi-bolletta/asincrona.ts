import { creaHandlerBollettaFv, preparaLetturaBollettaFv, type DipendenzeBollettaFv } from "./handler.ts";

export type LavoroBollettaFv = {
  id: string; token?: string; avviata: boolean;
  stato: "in_corso" | "completata" | "fallita";
  documenti?: unknown; errore?: string | null;
};
export type LavoriBollettaFv = {
  prendi: (db: unknown, parametri: Record<string, unknown>) => Promise<LavoroBollettaFv>;
  concludi: (db: unknown, id: string, token: string, status: number, esito: unknown) => Promise<boolean>;
  prosegui: (lavoro: Promise<void>) => void;
};

/** Compatibile con i vecchi client sincroni; nessun risultato va perso al cambio pagina. */
export function creaHandlerBollettaFvAsincrona(deps: DipendenzeBollettaFv, lavori: LavoriBollettaFv) {
  const leggi = creaHandlerBollettaFv(deps);
  return async (req: Request): Promise<Response> => {
    if (req.method !== "POST") return leggi(req);
    const cors = deps.headers.getCorsHeaders(req);
    let input: { asincrona?: boolean; riprova?: boolean };
    try { input = await req.clone().json(); }
    catch { return deps.headers.errorResponse("Richiesta di lettura non valida.", 400, cors); }
    if (!input?.asincrona) return leggi(req);
    try {
      // Stesse verifiche del percorso sincrono: JWT, visibilità staff, modifica,
      // azienda, stato della bozza e percorso immutabile del documento.
      const { progetto, userId, supabaseAdmin, p } = await preparaLetturaBollettaFv(req, input, deps, cors);
      const token = crypto.randomUUID();
      const job = await lavori.prendi(supabaseAdmin, {
        p_progetto: progetto.id, p_path: p.path, p_nome: p.nome,
        p_user: userId, p_token: token, p_riprova: input.riprova === true, p_versione: 1,
      });
      if (job.avviata) {
        const esegui = async () => {
          try {
            // Anche qui il lettore certifica contenuto/hash e scarica con il JWT,
            // prima di contattare l'AI. La richiesta originale non è consumata.
            const risposta = await leggi(req);
            const esito = await risposta.json();
            await lavori.concludi(supabaseAdmin, job.id, token, risposta.status, esito);
          } catch {
            // Solo il detentore della presa ancora valida può registrare l'errore.
            await lavori.concludi(supabaseAdmin, job.id, token, 500, {
              error: "Lettura non completata. Riprova tra poco: il file è già caricato.",
            }).catch(() => {});
          }
        };
        lavori.prosegui(esegui());
      }
      return deps.headers.jsonResponse({
        lettura: { id: job.id, stato: job.stato, errore: job.errore ?? null },
        ...(job.stato === "completata" ? { documenti: job.documenti } : {}),
      }, job.stato === "in_corso" ? 202 : 200, cors);
    } catch (e) {
      if (e instanceof Response) return e;
      return deps.headers.errorResponse("Non è stato possibile avviare la lettura. Il file resta caricato: riprova tra poco.", 503, cors);
    }
  };
}
