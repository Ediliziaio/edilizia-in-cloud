/**
 * Le porte del popup «Crea con Silvio» (31/10/2026, fase 3, lotto 3.3): da dove si entra
 * con una fonte già pronta. Vedi docs/piano-silvio-commessa-ai.md, sezione 3.1.
 *
 * - `RifDocumento`: un documento che il popup fa leggere dove sta, senza copiarlo (un
 *   documento della commessa, un allegato di un'email): l'id della riga, mai il percorso.
 *   La funzione `silvio-commessa` lo risolve con la RLS di chi chiama (documenti.ts).
 * - `linkCreaCommessa`: il link che apre Nuova commessa col popup già al lavoro. Lo danno la
 *   chat di Silvio e WhatsApp («crea la commessa da questo documento»), che non aprono
 *   finestre: rispondono col link.
 *
 * Senza dipendenze, compatibile con Deno.
 */

export type RifDocumento =
  | { tipo: "allegato_commessa"; id: string }
  | { tipo: "allegato_email"; email_id: string; indice: number };

/** Una fonte che arriva da un link. */
export type FonteDaLink =
  /** Un file già caricato in silvio-uploads (`<azienda>/<utente>/…`), es. un allegato della chat. */
  | { tipo: "caricato"; path: string; nome: string; mime?: string | null }
  | { tipo: "contratto"; id: string }
  | { tipo: "preventivo"; id: string }
  | { tipo: "email"; email_id: string; indice: number; nome: string; mime?: string | null }
  | { tipo: "testo"; testo: string };

export const PERCORSO_NUOVA_COMMESSA = "/azienda/ordini/nuovo";
/** Al massimo tante fonti in un link: una email ha di rado di più, e il link resta corto. */
export const MAX_FONTI_LINK = 5;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** Come `percorsoStorageSicuro` (supabase/functions/_shared/storageAmmesso.ts). */
const percorsoSicuro = (p: unknown): p is string => typeof p === "string" && p.length > 0 && p.length <= 400
  // eslint-disable-next-line no-control-regex -- i caratteri di controllo sono proprio quelli da rifiutare
  && !/[\\%?#\u0000-\u001f\u007f\u2028\u2029\u202a-\u202e\u2066-\u2069]/.test(p)
  && p.split("/").every((s) => s !== "" && s !== "." && s !== "..");
const nomeBreve = (n: unknown) => (typeof n === "string" && n.trim() ? n.trim().slice(0, 120) : null);

/** Una fonte del link, controllata: null se la forma non va. */
export function fonteValida(x: unknown): FonteDaLink | null {
  const f = (x ?? {}) as Record<string, unknown>;
  const mime = typeof f.mime === "string" ? f.mime.slice(0, 100) : null;
  switch (f.tipo) {
    case "caricato": {
      const nome = nomeBreve(f.nome) ?? (percorsoSicuro(f.path) ? f.path.split("/").pop()! : null);
      return percorsoSicuro(f.path) && UUID.test(f.path.split("/")[0]) && nome ? { tipo: "caricato", path: f.path, nome, mime } : null;
    }
    case "contratto":
    case "preventivo":
      return typeof f.id === "string" && UUID.test(f.id) ? { tipo: f.tipo, id: f.id } : null;
    case "email": {
      const nome = nomeBreve(f.nome);
      return typeof f.email_id === "string" && UUID.test(f.email_id) && Number.isInteger(f.indice)
        && (f.indice as number) >= 0 && (f.indice as number) < 50 && nome
        ? { tipo: "email", email_id: f.email_id, indice: f.indice as number, nome, mime }
        : null;
    }
    case "testo":
      return typeof f.testo === "string" && f.testo.trim() ? { tipo: "testo", testo: f.testo.trim().slice(0, 2000) } : null;
    default:
      return null;
  }
}

/** Il link (percorso e query) che apre Nuova commessa col popup e queste fonti. */
export function linkCreaCommessa(fonti: readonly FonteDaLink[]): string {
  const q = new URLSearchParams({ silvio: "1" });
  for (const f of fonti.slice(0, MAX_FONTI_LINK)) q.append("fonte", JSON.stringify(f));
  return `${PERCORSO_NUOVA_COMMESSA}?${q.toString()}`;
}

/** Le fonti di un link; null se il link non chiede il popup. Le fonti con una forma sbagliata si scartano. */
export function fontiDalLink(params: URLSearchParams): FonteDaLink[] | null {
  if (params.get("silvio") !== "1") return null;
  const out: FonteDaLink[] = [];
  for (const grezza of params.getAll("fonte").slice(0, MAX_FONTI_LINK)) {
    try {
      const f = fonteValida(JSON.parse(grezza));
      if (f) out.push(f);
    } catch {
      // Una fonte illeggibile non ferma le altre.
    }
  }
  return out;
}
