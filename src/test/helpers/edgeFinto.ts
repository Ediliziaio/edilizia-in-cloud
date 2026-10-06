/**
 * Un database e un ambiente Deno finti, quanto basta per eseguire il gestore VERO
 * di una edge function nei test (senza rete, senza Supabase).
 *
 * Il database tiene le tabelle in memoria e capisce i verbi che le funzioni dei
 * preventivi usano davvero: select (con l'elenco colonne), insert, update,
 * eq/neq/in/gte/gt/lte/lt/is/not, order, limit, single/maybeSingle, e anche
 * `await` sulla query. Ricordiamo tutte le scritture, per controllarle.
 */

export type Riga = Record<string, unknown>;

type Filtro = (r: Riga) => boolean;
type Esito = { data: unknown; error: { message: string; code?: string } | null };

export class DbMinimo {
  tabelle: Record<string, Riga[]> = {};
  scritture: Array<{ tabella: string; tipo: "insert" | "update"; dati: unknown }> = [];
  rpcs: Record<string, (args: Record<string, unknown>) => unknown> = {};
  rpcChiamate: Array<{ nome: string; args: Record<string, unknown> }> = [];

  from(tabella: string) {
    return new Interrogazione(this, tabella);
  }

  rpc(nome: string, args: Record<string, unknown> = {}) {
    this.rpcChiamate.push({ nome, args });
    const gestore = this.rpcs[nome];
    return Promise.resolve({ data: gestore ? gestore(args) : null, error: null as Esito["error"] });
  }
}

class Interrogazione {
  private filtri: Filtro[] = [];
  private verbo: "select" | "insert" | "update" = "select";
  private colonne: string | null = null;
  private dati: unknown;
  private ordine: { colonna: string; crescente: boolean } | null = null;
  private massimo: number | null = null;
  private unica: "single" | "maybe" | null = null;
  private conSelectDopoScrittura = false;

  constructor(private db: DbMinimo, private tabella: string) {}

  select(colonne = "*") {
    if (this.verbo === "select") this.colonne = colonne;
    else this.conSelectDopoScrittura = true;
    return this;
  }
  insert(dati: unknown) { this.verbo = "insert"; this.dati = dati; return this; }
  update(dati: unknown) { this.verbo = "update"; this.dati = dati; return this; }
  eq(c: string, v: unknown) { this.filtri.push((r) => r[c] === v); return this; }
  neq(c: string, v: unknown) { this.filtri.push((r) => r[c] !== v); return this; }
  in(c: string, v: unknown[]) { this.filtri.push((r) => v.includes(r[c])); return this; }
  gte(c: string, v: unknown) { this.filtri.push((r) => String(r[c] ?? "") >= String(v)); return this; }
  gt(c: string, v: unknown) { this.filtri.push((r) => String(r[c] ?? "") > String(v)); return this; }
  lte(c: string, v: unknown) { this.filtri.push((r) => String(r[c] ?? "") <= String(v)); return this; }
  lt(c: string, v: unknown) { this.filtri.push((r) => String(r[c] ?? "") < String(v)); return this; }
  is(c: string, v: unknown) { this.filtri.push((r) => (v === null ? r[c] == null : r[c] === v)); return this; }
  not(c: string, op: string, v: unknown) {
    if (op === "is") this.filtri.push((r) => (v === null ? r[c] != null : r[c] !== v));
    return this;
  }
  order(colonna: string, opzioni?: { ascending?: boolean }) { this.ordine = { colonna, crescente: opzioni?.ascending !== false }; return this; }
  limit(n: number) { this.massimo = n; return this; }
  single() { this.unica = "single"; return this; }
  maybeSingle() { this.unica = "maybe"; return this; }

  private corrisponde(r: Riga) { return this.filtri.every((f) => f(r)); }

  private proietta(r: Riga): Riga {
    if (!this.colonne || this.colonne === "*" || this.colonne.includes("(")) return { ...r };
    const nomi = this.colonne.split(",").map((c) => c.trim()).filter(Boolean);
    return Object.fromEntries(nomi.map((n) => [n, r[n]]));
  }

  private esegui(): Esito {
    const righe = (this.db.tabelle[this.tabella] ??= []);
    let risultato: Riga[];
    if (this.verbo === "insert") {
      const nuove = (Array.isArray(this.dati) ? this.dati : [this.dati]) as Riga[];
      this.db.scritture.push({ tabella: this.tabella, tipo: "insert", dati: this.dati });
      const create = nuove.map((n, i) => ({ id: `${this.tabella}-${righe.length + i + 1}`, ...n }));
      righe.push(...create);
      risultato = create;
    } else if (this.verbo === "update") {
      this.db.scritture.push({ tabella: this.tabella, tipo: "update", dati: this.dati });
      const toccate = righe.filter((r) => this.corrisponde(r));
      for (const r of toccate) Object.assign(r, this.dati as Riga);
      risultato = toccate;
    } else {
      risultato = righe.filter((r) => this.corrisponde(r));
    }
    if (this.ordine) {
      const { colonna, crescente } = this.ordine;
      risultato = [...risultato].sort((a, b) => (String(a[colonna] ?? "") < String(b[colonna] ?? "") ? -1 : 1) * (crescente ? 1 : -1));
    }
    if (this.massimo != null) risultato = risultato.slice(0, this.massimo);
    const visibili = risultato.map((r) => (this.verbo === "select" || this.conSelectDopoScrittura ? this.proietta(r) : r));
    if (this.unica === "single") {
      return visibili.length === 1
        ? { data: visibili[0], error: null }
        : { data: null, error: { message: "JSON object requested, multiple (or no) rows returned", code: "PGRST116" } };
    }
    if (this.unica === "maybe") return { data: visibili[0] ?? null, error: null };
    return { data: this.verbo === "select" || this.conSelectDopoScrittura ? visibili : null, error: null };
  }

  then<T>(resolve: (v: Esito) => T) { return Promise.resolve(this.esegui()).then(resolve); }
}

/** Ambiente Deno per un test: variabili d'ambiente e `Deno.serve` che consegna il gestore. */
export function denoFinto(env: Record<string, string> = {}) {
  let gestore: ((req: Request) => Promise<Response> | Response) | null = null;
  const finto = {
    env: { get: (k: string) => env[k] },
    serve: (h: (req: Request) => Promise<Response> | Response) => { gestore = h; return { shutdown: async (): Promise<void> => undefined }; },
  };
  return { finto, gestore: () => gestore };
}
