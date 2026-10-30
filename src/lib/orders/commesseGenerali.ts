// src/lib/orders/commesseGenerali.ts
// Commesse generali: una commessa che raccoglie altre commesse (un appalto e i
// suoi ordini di lavoro, un complesso e le sue unità, un immobile da rivendere).
// Piano: docs/superpowers/plans/2026-10-30-commesse-generali-appalti-sviluppi.md
//
// Qui solo parole e conti, senza React né database: i numeri della generale si
// calcolano dalle figlie che arrivano da `commessa_generale_riepilogo`.

export const MODELLI_GENERALE = ["appalto", "sviluppo", "compravendita"] as const;
export type ModelloGenerale = typeof MODELLI_GENERALE[number];

export interface DefinizioneModello {
  id: ModelloGenerale;
  nome: string;
  /** Per chi è: la frase sotto il nome, in Impostazioni e nella scelta. */
  perChi: string;
  /** Come si chiamano le commesse dentro la generale. */
  figlia: { una: string; tante: string; nuova: string };
  /** Che cosa è il valore in alto. */
  valore: { etichetta: string; aiuto: string };
  /** Come si chiama chi sta sopra: il committente o nessuno (l'operazione è dell'azienda). */
  cliente: { etichetta: string; facoltativo: boolean };
  esempio: string;
}

export const DEFINIZIONI_MODELLI: Record<ModelloGenerale, DefinizioneModello> = {
  appalto: {
    id: "appalto",
    nome: "Appalto a contratto",
    perChi: "Un contratto con un committente, dentro cui partono tanti lavori, ognuno col suo cantiere.",
    figlia: { una: "ordine di lavoro", tante: "Ordini di lavoro", nuova: "Nuovo ordine di lavoro" },
    valore: { etichetta: "Valore del contratto", aiuto: "L'importo del contratto con il committente. Le commesse dentro lo «scalano»." },
    cliente: { etichetta: "Committente", facoltativo: false },
    esempio: "Appalto manutenzione scuole 2027 — 3.000.000 €",
  },
  sviluppo: {
    id: "sviluppo",
    nome: "Sviluppo immobiliare",
    perChi: "Compri un terreno, costruisci un complesso e vendi le unità a acquirenti diversi.",
    figlia: { una: "unità", tante: "Unità", nuova: "Nuova unità" },
    valore: { etichetta: "Ricavi previsti", aiuto: "Quanto pensi di incassare vendendo tutte le unità." },
    cliente: { etichetta: "Società dell'operazione", facoltativo: true },
    esempio: "Residenza Via Roma — 6 appartamenti",
  },
  compravendita: {
    id: "compravendita",
    nome: "Compra, ristruttura, vendi",
    perChi: "Compri uno o più immobili, li ristrutturi (magari li dividi) e li rivendi.",
    figlia: { una: "unità", tante: "Unità", nuova: "Nuova unità" },
    valore: { etichetta: "Ricavi previsti", aiuto: "Quanto pensi di incassare rivendendo." },
    cliente: { etichetta: "Società dell'operazione", facoltativo: true },
    esempio: "Appartamento Corso Italia — diviso in due",
  },
};

export const isModelloGenerale = (v: unknown): v is ModelloGenerale =>
  typeof v === "string" && (MODELLI_GENERALE as readonly string[]).includes(v);

/** I modelli accesi, sempre nell'ordine di lettura e senza doppioni né valori sconosciuti. */
export function modelliValidi(v: unknown): ModelloGenerale[] {
  if (!Array.isArray(v)) return [];
  const scelti = new Set(v.filter(isModelloGenerale));
  return MODELLI_GENERALE.filter((m) => scelti.has(m));
}

export interface FigliaGenerale {
  id: string;
  codice: string | null;
  nome: string;
  stato: string | null;
  statoNome: string | null;
  statoColore: string | null;
  indirizzo: string | null;
  inizio: string | null;
  fine: string | null;
  avanzamento: number;
  /** null = chi guarda non ha il permesso di vedere gli importi (o i costi, o i margini). */
  importo: number | null;
  eseguito: number | null;
  fatturato: number | null;
  incassato: number | null;
  costo: number | null;
  margine: number | null;
}

export interface RiepilogoGenerale {
  generale: {
    id: string;
    codice: string | null;
    nome: string;
    cliente: string | null;
    clienteId: string | null;
    modello: ModelloGenerale;
    creataIl: string | null;
    valore: number | null;
  };
  figlie: FigliaGenerale[];
  permessi: { importi: boolean; costi: boolean; margini: boolean };
}

const numero = (v: unknown): number | null => {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
};
const testo = (v: unknown): string | null => (typeof v === "string" && v.trim() !== "" ? v : null);

/** Legge la risposta di `commessa_generale_riepilogo` senza fidarsi della forma. */
export function leggiRiepilogo(data: unknown): RiepilogoGenerale | null {
  const d = data as Record<string, unknown> | null;
  const g = d?.generale as Record<string, unknown> | undefined;
  if (!g || typeof g.id !== "string") return null;
  const p = (d?.permessi ?? {}) as Record<string, unknown>;
  const figlie = Array.isArray(d?.figlie) ? (d!.figlie as Record<string, unknown>[]) : [];
  return {
    generale: {
      id: g.id,
      codice: testo(g.codice),
      nome: testo(g.nome) ?? "Commessa generale",
      cliente: testo(g.cliente),
      clienteId: testo(g.cliente_id),
      modello: isModelloGenerale(g.modello) ? g.modello : "appalto",
      creataIl: testo(g.creata_il),
      valore: numero(g.valore),
    },
    figlie: figlie
      .filter((f) => typeof f?.id === "string")
      .map((f) => ({
        id: f.id as string,
        codice: testo(f.codice),
        nome: testo(f.nome) ?? "Commessa senza nome",
        stato: testo(f.stato),
        statoNome: testo(f.stato_nome),
        statoColore: testo(f.stato_colore),
        indirizzo: testo(f.indirizzo),
        inizio: testo(f.inizio),
        fine: testo(f.fine),
        avanzamento: Math.min(100, Math.max(0, numero(f.avanzamento) ?? 0)),
        importo: numero(f.importo),
        eseguito: numero(f.eseguito),
        fatturato: numero(f.fatturato),
        incassato: numero(f.incassato),
        costo: numero(f.costo),
        margine: numero(f.margine),
      })),
    permessi: { importi: p.importi === true, costi: p.costi === true, margini: p.margini === true },
  };
}

export interface TotaliGenerale {
  figlie: number;
  /** Somma degli importi delle figlie. */
  assegnato: number | null;
  /** Valore − assegnato: quanto del contratto (o dei ricavi previsti) non è ancora dentro una figlia. Negativo = oltre. */
  daAssegnare: number | null;
  eseguito: number | null;
  fatturato: number | null;
  incassato: number | null;
  /** Fatturato non ancora incassato. */
  daIncassare: number | null;
  costo: number | null;
  margine: number | null;
  /** Avanzamento pesato sugli importi; senza importi, la media semplice. */
  avanzamento: number;
  /** Il riferimento delle barre: il valore se c'è, altrimenti l'assegnato. */
  base: number | null;
}

const arrotonda = (n: number) => Math.round(n * 100) / 100;
const somma = (valori: (number | null)[]): number | null =>
  valori.some((v) => v === null) ? null : arrotonda(valori.reduce<number>((t, v) => t + (v ?? 0), 0));

/** I numeri della generale. Un totale è null se chi guarda non può vedere anche una sola delle sue parti. */
export function totaliGenerale(r: Pick<RiepilogoGenerale, "figlie" | "generale" | "permessi">): TotaliGenerale {
  const f = r.figlie;
  const importi = r.permessi.importi;
  const assegnato = importi ? somma(f.map((x) => x.importo)) : null;
  const eseguito = importi ? somma(f.map((x) => x.eseguito)) : null;
  const fatturato = importi ? somma(f.map((x) => x.fatturato)) : null;
  const incassato = importi ? somma(f.map((x) => x.incassato)) : null;
  const valore = importi ? r.generale.valore : null;
  const pesoTotale = f.reduce((t, x) => t + Math.max(0, x.importo ?? 0), 0);
  const avanzamento = f.length === 0
    ? 0
    : pesoTotale > 0
      ? f.reduce((t, x) => t + x.avanzamento * Math.max(0, x.importo ?? 0), 0) / pesoTotale
      : f.reduce((t, x) => t + x.avanzamento, 0) / f.length;
  return {
    figlie: f.length,
    assegnato,
    daAssegnare: valore !== null && assegnato !== null ? arrotonda(valore - assegnato) : null,
    eseguito,
    fatturato,
    incassato,
    daIncassare: fatturato !== null && incassato !== null ? arrotonda(Math.max(0, fatturato - incassato)) : null,
    costo: r.permessi.costi && f.length > 0 ? somma(f.map((x) => x.costo ?? 0)) : null,
    margine: r.permessi.margini && f.length > 0 ? somma(f.map((x) => x.margine ?? 0)) : null,
    avanzamento: Math.round(avanzamento * 10) / 10,
    base: valore ?? assegnato,
  };
}

/** Percentuale di `parte` su `base`, tra 0 e 100; null se non si può dire. */
export function quota(parte: number | null, base: number | null): number | null {
  if (parte === null || base === null || base <= 0) return null;
  return Math.min(100, Math.max(0, (parte / base) * 100));
}

export interface AvvisoGenerale { id: string; testo: string; tono: "attenzione" | "info" }

/** «Cosa richiede attenzione»: poche righe, solo quelle che chiedono di fare qualcosa. */
export function avvisiGenerale(r: RiepilogoGenerale, t: TotaliGenerale): AvvisoGenerale[] {
  const def = DEFINIZIONI_MODELLI[r.generale.modello];
  const avvisi: AvvisoGenerale[] = [];
  if (r.figlie.length === 0) {
    avvisi.push({ id: "vuota", testo: `Aggiungi il primo ${def.figlia.una}: crealo da qui o collega una commessa che c'è già.`, tono: "info" });
  }
  if (r.permessi.importi && r.generale.valore === null) {
    avvisi.push({ id: "valore", testo: `Scrivi ${def.valore.etichetta.toLowerCase()} per vedere quanto resta da assegnare.`, tono: "info" });
  }
  if (t.daAssegnare !== null && t.daAssegnare < 0) {
    avvisi.push({ id: "oltre", testo: `Le commesse dentro superano ${def.valore.etichetta.toLowerCase()} di ${formattaEuro(-t.daAssegnare)}.`, tono: "attenzione" });
  }
  const oltreCosto = r.figlie.filter((f) => f.margine !== null && f.margine < 0);
  if (r.permessi.margini && oltreCosto.length > 0) {
    avvisi.push({
      id: "perdita",
      testo: oltreCosto.length === 1
        ? `${oltreCosto[0].codice ?? oltreCosto[0].nome} è in perdita.`
        : `${oltreCosto.length} ${def.figlia.tante.toLowerCase()} sono in perdita.`,
      tono: "attenzione",
    });
  }
  return avvisi;
}

const EURO = new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });
/** Importi in euro senza decimali: nei riepiloghi i centesimi sono rumore. */
export const formattaEuro = (n: number) => EURO.format(n);
