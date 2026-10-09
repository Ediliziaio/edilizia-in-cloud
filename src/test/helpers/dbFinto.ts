/**
 * Un database finto per provare le edge function senza Supabase: tabelle in
 * memoria, le stesse domande che fa supabase-js (from, select, eq, or, single…)
 * e uno storage a file.
 *
 * Ogni istruzione (una select, un update…) si esegue tutta insieme, senza
 * interruzioni; prima di eseguirla si lascia passare un attimo, come succede con
 * il database vero fra una richiesta e la successiva: serve a provare le corse
 * fra chiamate che arrivano nello stesso istante (due «invia codice» insieme, due
 * generazioni dello stesso PDF).
 */
export type Riga = Record<string, unknown>;

export interface FileFinto {
  bytes: Uint8Array;
  contentType: string | null;
}

interface ErroreFinto {
  message: string;
}

interface Esito {
  data: unknown;
  error: ErroreFinto | null;
  count?: number | null;
}

type Condizione = (riga: Riga) => boolean;

const COME_DATA = /^\d{4}-\d{2}-\d{2}T/;

/** Le date ISO si confrontano come istanti; il resto com'è. null non si confronta con niente. */
function confronta(a: unknown, b: unknown): number | null {
  if (a === null || a === undefined || b === null || b === undefined) return null;
  const x = typeof a === "string" && COME_DATA.test(a) ? Date.parse(a) : a;
  const y = typeof b === "string" && COME_DATA.test(b) ? Date.parse(b) : b;
  if (x === y) return 0;
  return (x as number) < (y as number) ? -1 : 1;
}

function copia<T>(valore: T): T {
  return JSON.parse(JSON.stringify(valore)) as T;
}

/** «colonna.operatore.valore», come nel filtro or() di PostgREST. */
function condizioneDaTesto(pezzo: string): Condizione {
  const [colonna, operatore, ...resto] = pezzo.split(".");
  const valore = resto.join(".");
  switch (operatore) {
    case "is": return (r) => (valore === "null" ? (r[colonna] ?? null) === null : String(r[colonna]) === valore);
    case "eq": return (r) => String(r[colonna]) === valore;
    case "lte": return (r) => { const c = confronta(r[colonna], valore); return c !== null && c <= 0; };
    case "lt": return (r) => { const c = confronta(r[colonna], valore); return c !== null && c < 0; };
    case "gte": return (r) => { const c = confronta(r[colonna], valore); return c !== null && c >= 0; };
    case "gt": return (r) => { const c = confronta(r[colonna], valore); return c !== null && c > 0; };
    default: throw new Error(`Operatore non previsto nel database finto: ${operatore}`);
  }
}

export class DbFinto {
  tabelle: Record<string, Riga[]>;
  file = new Map<string, FileFinto>();
  chiamateRpc: { nome: string; args: Record<string, unknown> }[] = [];
  rispostaRpc: Record<string, unknown> = {};
  /** Un errore da restituire alla prossima operazione «tabella:operazione» (per esempio «sms_messages:insert»). */
  erroriProssimi: Record<string, string> = {};

  constructor(seme: Record<string, Riga[]> = {}) {
    this.tabelle = {};
    for (const nome of Object.keys(seme)) this.tabelle[nome] = copia(seme[nome]);
  }

  righe(tabella: string): Riga[] {
    return (this.tabelle[tabella] ??= []);
  }

  /** Il client che le funzioni credono di avere in mano. */
  get client(): ClienteFinto {
    return {
      from: (tabella: string) => new QueryFinta(this, tabella),
      rpc: async (nome: string, args: Record<string, unknown>) => {
        await Promise.resolve();
        this.chiamateRpc.push({ nome, args });
        return { data: this.rispostaRpc[nome] ?? null, error: null };
      },
      storage: { from: (bucket: string) => new BucketFinto(this, bucket) },
    };
  }
}

export interface ClienteFinto {
  from: (tabella: string) => QueryFinta;
  rpc: (nome: string, args: Record<string, unknown>) => Promise<Esito>;
  storage: { from: (bucket: string) => BucketFinto };
}

class BucketFinto {
  constructor(private db: DbFinto, private bucket: string) {}

  private chiave(percorso: string): string {
    return `${this.bucket}/${percorso}`;
  }

  async download(percorso: string): Promise<Esito> {
    await Promise.resolve();
    const f = this.db.file.get(this.chiave(percorso));
    if (!f) return { data: null, error: { message: "Object not found" } };
    const bytes = f.bytes;
    // Come un Blob, per quel che ne fanno le funzioni.
    const blob = {
      size: bytes.length,
      arrayBuffer: async (): Promise<ArrayBuffer> => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer,
    };
    return { data: blob, error: null };
  }

  async upload(percorso: string, corpo: Uint8Array | ArrayBuffer, opzioni: { upsert?: boolean; contentType?: string } = {}): Promise<Esito> {
    await Promise.resolve();
    const chiave = this.chiave(percorso);
    if (this.db.file.has(chiave) && !opzioni.upsert) return { data: null, error: { message: "The resource already exists" } };
    const bytes = corpo instanceof Uint8Array ? new Uint8Array(corpo) : new Uint8Array(corpo);
    this.db.file.set(chiave, { bytes, contentType: opzioni.contentType ?? null });
    return { data: { path: percorso }, error: null };
  }

  async createSignedUrl(percorso: string, _scadenza: number, opzioni: { download?: string | boolean } = {}): Promise<Esito> {
    await Promise.resolve();
    if (!this.db.file.has(this.chiave(percorso))) return { data: null, error: { message: "Object not found" } };
    const scarica = opzioni.download ? `&download=${encodeURIComponent(String(opzioni.download))}` : "";
    return { data: { signedUrl: `https://finto.supabase.co/storage/v1/object/sign/${this.chiave(percorso)}?token=t${scarica}` }, error: null };
  }

  async createSignedUrls(percorsi: string[], _scadenza: number): Promise<Esito> {
    await Promise.resolve();
    return {
      data: percorsi.map((p) => ({ path: p, signedUrl: `https://finto.supabase.co/storage/v1/object/sign/${this.chiave(p)}?token=t`, error: null as string | null })),
      error: null,
    };
  }

  async remove(percorsi: string[]): Promise<Esito> {
    await Promise.resolve();
    for (const p of percorsi) this.db.file.delete(this.chiave(p));
    return { data: percorsi.map((p) => ({ name: p })), error: null };
  }
}

type Modo = "select" | "insert" | "update" | "delete";
type Forma = "molte" | "una" | "forse_una";

export class QueryFinta {
  private modo: Modo = "select";
  private condizioni: Condizione[] = [];
  private nuove: Riga[] = [];
  private modifica: Riga = {};
  private restituisce = false;
  private forma: Forma = "molte";
  private conteggio = false;
  private soloConteggio = false;
  private ordine: { colonna: string; crescente: boolean } | null = null;
  private massimo: number | null = null;

  constructor(private db: DbFinto, private tabella: string) {}

  select(_colonne?: string, opzioni: { count?: string; head?: boolean } = {}): this {
    if (this.modo === "select") {
      this.conteggio = !!opzioni.count;
      this.soloConteggio = !!opzioni.head;
    } else {
      this.restituisce = true;
    }
    return this;
  }

  insert(righe: Riga | Riga[]): this {
    this.modo = "insert";
    this.nuove = (Array.isArray(righe) ? righe : [righe]).map((r) => ({ ...r }));
    return this;
  }

  update(modifica: Riga): this {
    this.modo = "update";
    this.modifica = { ...modifica };
    return this;
  }

  delete(): this {
    this.modo = "delete";
    return this;
  }

  eq(colonna: string, valore: unknown): this {
    this.condizioni.push((r) => (r[colonna] ?? null) === (valore ?? null) && valore !== null);
    return this;
  }

  neq(colonna: string, valore: unknown): this {
    this.condizioni.push((r) => (r[colonna] ?? null) !== null && r[colonna] !== valore);
    return this;
  }

  in(colonna: string, valori: unknown[]): this {
    this.condizioni.push((r) => valori.includes(r[colonna]));
    return this;
  }

  is(colonna: string, valore: unknown): this {
    this.condizioni.push((r) => (r[colonna] ?? null) === valore);
    return this;
  }

  gt(colonna: string, valore: unknown): this {
    this.condizioni.push((r) => { const c = confronta(r[colonna], valore); return c !== null && c > 0; });
    return this;
  }

  gte(colonna: string, valore: unknown): this {
    this.condizioni.push((r) => { const c = confronta(r[colonna], valore); return c !== null && c >= 0; });
    return this;
  }

  lt(colonna: string, valore: unknown): this {
    this.condizioni.push((r) => { const c = confronta(r[colonna], valore); return c !== null && c < 0; });
    return this;
  }

  lte(colonna: string, valore: unknown): this {
    this.condizioni.push((r) => { const c = confronta(r[colonna], valore); return c !== null && c <= 0; });
    return this;
  }

  /** or("a.is.null,b.lte.2026-10-05T10:00:00.000Z") */
  or(espressione: string): this {
    const alternative = espressione.split(",").map(condizioneDaTesto);
    this.condizioni.push((r) => alternative.some((c) => c(r)));
    return this;
  }

  order(colonna: string, opzioni: { ascending?: boolean } = {}): this {
    this.ordine = { colonna, crescente: opzioni.ascending !== false };
    return this;
  }

  limit(n: number): this {
    this.massimo = n;
    return this;
  }

  single(): Promise<Esito> {
    this.forma = "una";
    return this.esegui();
  }

  maybeSingle(): Promise<Esito> {
    this.forma = "forse_una";
    return this.esegui();
  }

  then<T>(riuscita?: (e: Esito) => T, fallita?: (motivo: unknown) => T): Promise<T> {
    return this.esegui().then(riuscita, fallita);
  }

  private risposta(trovate: Riga[], conteggio: number | null = null): Esito {
    if (this.forma === "molte") return { data: trovate.map(copia), error: null, count: conteggio };
    if (this.forma === "una") {
      if (trovate.length !== 1) return { data: null, error: { message: "JSON object requested, multiple (or no) rows returned" } };
      return { data: copia(trovate[0]), error: null };
    }
    if (trovate.length > 1) return { data: null, error: { message: "JSON object requested, multiple (or no) rows returned" } };
    return { data: trovate[0] ? copia(trovate[0]) : null, error: null };
  }

  private async esegui(): Promise<Esito> {
    // Un attimo: fra una domanda e l'altra altri chiamanti possono passare.
    await Promise.resolve();
    const chiaveErrore = `${this.tabella}:${this.modo}`;
    const errore = this.db.erroriProssimi[chiaveErrore];
    if (errore) {
      delete this.db.erroriProssimi[chiaveErrore];
      return { data: null, error: { message: errore } };
    }
    const righe = this.db.righe(this.tabella);
    const corrisponde: Condizione = (r) => this.condizioni.every((c) => c(r));

    if (this.modo === "select") {
      let trovate = righe.filter(corrisponde);
      const quante = trovate.length;
      if (this.soloConteggio) return { data: null, error: null, count: quante };
      const ord = this.ordine;
      if (ord) {
        trovate = [...trovate].sort((a, b) => {
          const c = confronta(a[ord.colonna], b[ord.colonna]) ?? 0;
          return ord.crescente ? c : -c;
        });
      }
      if (this.massimo !== null) trovate = trovate.slice(0, this.massimo);
      return this.risposta(trovate, this.conteggio ? quante : null);
    }

    if (this.modo === "insert") {
      const inserite = this.nuove.map((r) => ({ id: crypto.randomUUID(), created_at: new Date().toISOString(), ...r }));
      righe.push(...inserite);
      return this.restituisce ? this.risposta(inserite) : { data: null, error: null };
    }

    if (this.modo === "update") {
      const toccate = righe.filter(corrisponde);
      for (const r of toccate) Object.assign(r, this.modifica);
      return this.restituisce ? this.risposta(toccate) : { data: null, error: null };
    }

    const tolte = righe.filter(corrisponde);
    this.db.tabelle[this.tabella] = righe.filter((r) => !tolte.includes(r));
    return this.restituisce ? this.risposta(tolte) : { data: null, error: null };
  }
}

/** Un Deno finto per le funzioni: legge le variabili d'ambiente e consegna il gestore a chi lo prova. */
export function denoFinto(ambiente: Record<string, string> = {}): {
  deno: { env: { get: (nome: string) => string | undefined }; serve: (gestore: (req: Request) => Promise<Response> | Response) => void };
  gestore: () => (req: Request) => Promise<Response>;
} {
  let registrato: ((req: Request) => Promise<Response> | Response) | null = null;
  return {
    deno: {
      env: { get: (nome: string) => ambiente[nome] },
      serve: (gestore) => { registrato = gestore; },
    },
    gestore: () => {
      if (!registrato) throw new Error("La funzione non ha chiamato Deno.serve");
      const g = registrato;
      return async (req: Request) => await g(req);
    },
  };
}
