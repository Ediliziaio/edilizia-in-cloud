// src/lib/orders/generali/unita.ts
// Modulo «Unità e vendite» della commessa generale (sviluppo, compravendita): le parole,
// gli stati di vendita e le loro regole, la lettura di `generale_unita_elenco`.
// Le regole degli stati sono le stesse della migrazione 20281031120000 (generale_unita_stato):
// qui servono a chiedere solo il necessario e a dire prima perché una cosa non si può fare.
// Conti (ripartizione, margine, incassi): unitaConti.ts. Serie e incolla da Excel: unitaSerie.ts.
import { isModelloGenerale, type ModelloGenerale } from "@/lib/orders/commesseGenerali";

export const STATI_VENDITA = ["libera", "prenotata", "compromesso", "rogitata"] as const;
export type StatoVendita = typeof STATI_VENDITA[number];

export const NOMI_STATO: Record<StatoVendita, { una: string; tante: string }> = {
  libera: { una: "Libera", tante: "Libere" },
  prenotata: { una: "Prenotata", tante: "Prenotate" },
  compromesso: { una: "Compromesso", tante: "Compromesso" },
  rogitata: { una: "Rogitata", tante: "Rogitate" },
};

export const isStatoVendita = (v: unknown): v is StatoVendita =>
  typeof v === "string" && (STATI_VENDITA as readonly string[]).includes(v);

export const TIPI_MOVIMENTO = ["caparra", "acconto", "saldo", "permuta"] as const;
export type TipoMovimento = typeof TIPI_MOVIMENTO[number];

export const NOMI_MOVIMENTO: Record<TipoMovimento, string> = {
  caparra: "Caparra",
  acconto: "Acconto",
  saldo: "Saldo al rogito",
  permuta: "Permuta",
};

/** Caparra, acconti e saldo sono soldi incassati; la permuta paga il prezzo senza incasso. */
export const isIncasso = (t: TipoMovimento) => t !== "permuta";

export const TIPOLOGIE_SUGGERITE = ["Appartamento", "Attico", "Villetta", "Box", "Posto auto", "Cantina", "Negozio", "Ufficio", "Magazzino"];

export interface MovimentoUnita {
  id: string;
  tipo: TipoMovimento;
  /** null = chi guarda non vede gli importi. */
  importo: number | null;
  data: string;
  descrizione: string | null;
}

export interface UnitaGenerale {
  /** La commessa figlia: la chiave dell'unità (1:1). */
  orderId: string;
  codice: string | null;
  nome: string;
  /** false = la figlia non ha ancora la scheda unità: nasce al primo salvataggio. */
  scheda: boolean;
  id: string | null;
  sigla: string;
  edificio: string | null;
  piano: string | null;
  tipologia: string | null;
  mq: number | null;
  millesimi: number | null;
  listino: number | null;
  trattato: number | null;
  rogito: number | null;
  provvigione: number | null;
  stato: StatoVendita;
  dataPrenotazione: string | null;
  dataCompromesso: string | null;
  rogitoPrevisto: string | null;
  dataRogito: string | null;
  acquirenteId: string | null;
  acquirente: string | null;
  agenzia: string | null;
  note: string | null;
  /** L'unità da cui questa è nata dividendola. */
  origineId: string | null;
  /** Questa unità è stata divisa: non si vende più, si vendono le parti. */
  divisaIl: string | null;
  movimenti: MovimentoUnita[];
  /** Importo della commessa figlia (null = non visibile). */
  importoCommessa: number | null;
  /** Costi registrati sulla figlia (null = non visibili). */
  costoDiretto: number | null;
}

export interface PermessiUnita { importi: boolean; costi: boolean; margini: boolean; modifica: boolean }

export interface ElencoUnita {
  modello: ModelloGenerale;
  /** Costi registrati sulla generale stessa (null = non visibili). Le permute si aggiungono nei conti. */
  costiGenerale: number | null;
  unita: UnitaGenerale[];
  permessi: PermessiUnita;
}

const numero = (v: unknown): number | null => {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
};
const testo = (v: unknown): string | null => (typeof v === "string" && v.trim() !== "" ? v.trim() : null);

/** Legge la risposta di `generale_unita_elenco` senza fidarsi della forma. */
export function leggiElencoUnita(data: unknown): ElencoUnita | null {
  const d = data as Record<string, unknown> | null;
  if (!d || !Array.isArray(d.figlie)) return null;
  const p = (d.permessi ?? {}) as Record<string, unknown>;
  const unita = (d.figlie as Record<string, unknown>[])
    .filter((f) => typeof f?.order_id === "string")
    .map((f): UnitaGenerale => {
      const u = (f.unita ?? null) as Record<string, unknown> | null;
      const importoCommessa = numero(f.importo);
      const movimenti = Array.isArray(u?.movimenti) ? (u!.movimenti as Record<string, unknown>[]) : [];
      return {
        orderId: f.order_id as string,
        codice: testo(f.codice),
        nome: testo(f.nome) ?? "Unità senza nome",
        scheda: !!u,
        id: testo(u?.id),
        sigla: testo(u?.sigla) ?? testo(f.codice) ?? testo(f.nome) ?? "—",
        edificio: testo(u?.edificio),
        piano: testo(u?.piano),
        tipologia: testo(u?.tipologia),
        mq: numero(u?.mq_commerciali),
        millesimi: numero(u?.millesimi),
        // Senza scheda il prezzo di listino è l'importo della commessa (come farà il primo salvataggio).
        listino: u ? numero(u.prezzo_listino) : importoCommessa !== null && importoCommessa > 0 ? importoCommessa : null,
        trattato: numero(u?.prezzo_trattato),
        rogito: numero(u?.prezzo_rogito),
        provvigione: numero(u?.provvigione_agenzia),
        stato: isStatoVendita(u?.stato) ? u!.stato : "libera",
        dataPrenotazione: testo(u?.data_prenotazione),
        dataCompromesso: testo(u?.data_compromesso),
        rogitoPrevisto: testo(u?.rogito_previsto),
        dataRogito: testo(u?.data_rogito),
        acquirenteId: testo(u?.acquirente_id),
        acquirente: testo(u?.acquirente),
        agenzia: testo(u?.agenzia),
        note: testo(u?.note),
        origineId: testo(u?.origine_id),
        divisaIl: testo(u?.divisa_il),
        movimenti: movimenti
          .filter((m) => typeof m?.id === "string" && (TIPI_MOVIMENTO as readonly string[]).includes(m.tipo as string))
          .map((m) => ({
            id: m.id as string,
            tipo: m.tipo as TipoMovimento,
            importo: numero(m.importo),
            data: testo(m.data) ?? "",
            descrizione: testo(m.descrizione),
          })),
        importoCommessa,
        costoDiretto: numero(f.costo),
      };
    });
  return {
    modello: isModelloGenerale(d.modello) ? d.modello : "sviluppo",
    costiGenerale: numero(d.costi_comuni),
    unita,
    permessi: { importi: p.importi === true, costi: p.costi === true, margini: p.margini === true, modifica: p.modifica === true },
  };
}

/** Le unità che si vendono: tutte tranne quelle divise (restano solo come storia). */
export const unitaVive = (unita: UnitaGenerale[]) => unita.filter((u) => !u.divisaIl);

/** Il prezzo di oggi: quello dell'atto, altrimenti il trattato, altrimenti il listino. */
export const prezzoCorrente = (u: Pick<UnitaGenerale, "rogito" | "trattato" | "listino">): number | null =>
  u.rogito ?? u.trattato ?? u.listino;

// ── Stati di vendita ─────────────────────────────────────────────────────────

export interface RequisitiStato {
  acquirente: boolean;
  /** Il prezzo che si chiede: nessuno (libera), facoltativo (prenotata), obbligatorio (compromesso, rogito). */
  prezzo: "nessuno" | "facoltativo" | "obbligatorio";
  etichettaPrezzo: string;
  etichettaData: string | null;
  caparra: boolean;
  saldo: boolean;
  rogitoPrevisto: boolean;
}

/** Cosa chiede ogni stato: solo quello che serve lì (piano, flusso F5). */
export function requisitiStato(stato: StatoVendita): RequisitiStato {
  switch (stato) {
    case "libera":
      return { acquirente: false, prezzo: "nessuno", etichettaPrezzo: "", etichettaData: null, caparra: false, saldo: false, rogitoPrevisto: false };
    case "prenotata":
      return { acquirente: true, prezzo: "facoltativo", etichettaPrezzo: "Prezzo trattato", etichettaData: "Data della prenotazione", caparra: true, saldo: false, rogitoPrevisto: false };
    case "compromesso":
      return { acquirente: true, prezzo: "obbligatorio", etichettaPrezzo: "Prezzo del compromesso", etichettaData: "Data del compromesso", caparra: true, saldo: false, rogitoPrevisto: true };
    case "rogitata":
      return { acquirente: true, prezzo: "obbligatorio", etichettaPrezzo: "Prezzo dell'atto", etichettaData: "Data del rogito", caparra: false, saldo: true, rogitoPrevisto: false };
  }
}

/** Il prezzo che il database userebbe se non se ne scrive uno (generale_unita_stato). */
export function prezzoProposto(u: Pick<UnitaGenerale, "rogito" | "trattato" | "listino">, verso: StatoVendita): number | null {
  if (verso === "rogitata") return u.rogito ?? u.trattato ?? u.listino;
  if (verso === "compromesso") return u.trattato ?? u.listino;
  if (verso === "prenotata") return u.trattato;
  return null;
}

/** Perché questa unità non può passare a quello stato; null se può. Stesse regole del database. */
export function bloccoCambioStato(u: Pick<UnitaGenerale, "sigla" | "divisaIl" | "movimenti">, verso: StatoVendita): string | null {
  if (u.divisaIl) return "Questa unità è stata divisa: si vendono le parti.";
  if (verso === "libera" && u.movimenti.length > 0) {
    return `Su ${u.sigla} ci sono pagamenti registrati: toglili prima di rimetterla in vendita.`;
  }
  if (verso !== "libera" && verso !== "rogitata" && u.movimenti.some((m) => m.tipo === "saldo")) {
    return `Su ${u.sigla} è registrato il saldo del rogito: toglilo prima di tornare indietro.`;
  }
  return null;
}

/** I pagamenti che si possono registrare in ogni stato: niente su una libera, il saldo solo al rogito. */
export function tipiMovimentoAmmessi(stato: StatoVendita): TipoMovimento[] {
  if (stato === "libera") return [];
  if (stato === "rogitata") return ["caparra", "acconto", "saldo", "permuta"];
  return ["caparra", "acconto", "permuta"];
}

export interface DatiCambioStato {
  acquirenteId: string | null;
  data: string | null;
  prezzo: number | null;
  caparra: number | null;
  saldo: number | null;
  rogitoPrevisto: string | null;
}

/**
 * Cosa manca per confermare il cambio di stato. `vedeImporti` false: il prezzo non si chiede
 * (lo tiene il database) e non si registrano pagamenti.
 */
export function erroriCambioStato(
  u: Pick<UnitaGenerale, "sigla" | "divisaIl" | "movimenti" | "rogito" | "trattato" | "listino">,
  verso: StatoVendita,
  dati: DatiCambioStato,
  vedeImporti: boolean,
): string[] {
  const blocco = bloccoCambioStato(u, verso);
  if (blocco) return [blocco];
  const r = requisitiStato(verso);
  const errori: string[] = [];
  // L'acquirente è quello del modulo (parte da quello dell'unità): toglierlo vuol dire non averlo.
  if (r.acquirente && !dati.acquirenteId) errori.push("Scegli l'acquirente.");
  const prezzo = dati.prezzo ?? prezzoProposto(u, verso);
  if (vedeImporti && r.prezzo === "obbligatorio" && (prezzo === null || prezzo <= 0)) {
    errori.push(verso === "rogitata" ? "Scrivi il prezzo dell'atto." : "Scrivi il prezzo pattuito nel compromesso.");
  }
  for (const [n, etichetta] of [[dati.prezzo, "Il prezzo"], [dati.caparra, "La caparra"], [dati.saldo, "Il saldo"]] as const) {
    if (n !== null && n < 0) errori.push(`${etichetta} non può essere negativo.`);
  }
  return errori;
}

// ── Piani ed edifici ─────────────────────────────────────────────────────────

const PIANI_A_PAROLE: Record<string, number> = {
  primo: 1, secondo: 2, terzo: 3, quarto: 4, quinto: 5, sesto: 6, settimo: 7, ottavo: 8, nono: 9, decimo: 10,
};

/**
 * Un numero per mettere in ordine i piani come si scrivono in cantiere: S2 < S1 < seminterrato
 * < terra < rialzato < 1 < 2 < … < attico. Un piano scritto in un altro modo va dopo i numeri.
 */
export function ordinePiano(piano: string | null): number {
  if (!piano) return -1000;
  const p = piano.toLowerCase().replace(/piano|°|º|\./g, " ").replace(/\s+/g, " ").trim();
  if (p === "") return -1000;
  const interrato = /^(?:s|-|interrato\s*)(\d+)$/.exec(p.replace(/\s/g, ""));
  if (interrato) return -Number(interrato[1]);
  if (/^(interrato|sotterraneo|s)$/.test(p)) return -1;
  if (/^seminterrato/.test(p)) return -0.5;
  if (/^(t|pt|terra|terreno|0)$/.test(p)) return 0;
  if (/^(r|pr|rialzato)$/.test(p)) return 0.25;
  if (/^-?\d+(?:[.,]\d+)?$/.test(p)) return Number(p.replace(",", "."));
  if (p in PIANI_A_PAROLE) return PIANI_A_PAROLE[p];
  if (/^(attico|sottotetto|mansarda)/.test(p)) return 100;
  return 50;
}

/** «1» → «1° piano», «T» → «Piano terra»; il resto come è stato scritto. */
export function etichettaPiano(piano: string | null): string {
  if (!piano) return "Piano non indicato";
  const o = ordinePiano(piano);
  if (o === 0) return "Piano terra";
  if (Number.isInteger(o) && o > 0 && o < 50 && /^\d+$/.test(piano.trim())) return `${o}° piano`;
  return piano;
}

/** A1, A2, A10 nell'ordine giusto (non A1, A10, A2). */
export const confrontaSigle = (a: string, b: string) => a.localeCompare(b, "it", { numeric: true, sensitivity: "base" });

export interface PianoTabellone { piano: string | null; etichetta: string; unita: UnitaGenerale[] }
export interface EdificioTabellone { edificio: string | null; piani: PianoTabellone[] }

/**
 * Il tabellone come la facciata: per edificio, e dentro ogni edificio i piani dall'alto in
 * basso, le unità in ordine di sigla. Le unità divise non ci sono: ci sono le loro parti.
 */
export function raggruppaTabellone(unita: UnitaGenerale[]): EdificioTabellone[] {
  const edifici = new Map<string, UnitaGenerale[]>();
  for (const u of unitaVive(unita)) {
    const chiave = u.edificio ?? "";
    edifici.set(chiave, [...(edifici.get(chiave) ?? []), u]);
  }
  return [...edifici.entries()]
    .sort(([a], [b]) => (a === "" ? 1 : b === "" ? -1 : confrontaSigle(a, b)))
    .map(([edificio, lista]) => {
      const piani = new Map<string, UnitaGenerale[]>();
      for (const u of lista) piani.set(u.piano ?? "", [...(piani.get(u.piano ?? "") ?? []), u]);
      return {
        edificio: edificio || null,
        piani: [...piani.entries()]
          .map(([piano, l]) => ({
            piano: piano || null,
            etichetta: etichettaPiano(piano || null),
            unita: [...l].sort((a, b) => confrontaSigle(a.sigla, b.sigla)),
          }))
          .sort((a, b) => ordinePiano(b.piano) - ordinePiano(a.piano) || confrontaSigle(a.piano ?? "", b.piano ?? "")),
      };
    });
}
