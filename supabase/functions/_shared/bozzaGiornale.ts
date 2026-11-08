/**
 * La bozza del giornale dei lavori composta dai dati del giorno, SENZA AI: riporta
 * quello che è stato registrato e non aggiunge niente. La rivede e la firma una persona.
 *
 * Modulo puro (niente Deno, niente browser): lo usano la pagina del giornale
 * («Prepara dalla giornata») e il giro serale `auto-genera-giornale-cantiere`.
 */
import { personeDelGiorno, type RapportinoPresenze } from "./presenzeGiornale.ts";

export type MeteoGiornale = "soleggiato" | "nuvoloso" | "pioggia" | "neve" | "vento forte";

export interface RapportinoPerBozza extends RapportinoPresenze {
  descrizione_lavori?: string | null;
  materiali_usati?: unknown;
  meteo?: string | null;
  percentuale_avanzamento?: unknown;
}

export interface DdtPerBozza {
  id: string;
  numero_ddt?: string | null;
  stato?: string | null;
  order_id?: string | null;
  destinazione?: string | null;
  has_damages?: boolean | null;
  fornitore?: { name?: string | null } | null;
  oda?: { order_id?: string | null } | null;
}

export interface SegnalazionePerBozza {
  id: string;
  titolo?: string | null;
  subject?: string | null;
  descrizione?: string | null;
}

export interface FontiBozza {
  source_rapportini_ids: string[];
  source_ddt_ids: string[];
  source_segnalazioni_ids: string[];
  source_foto_ids: string[];
}

export interface CampiBozza {
  lavorazioni_eseguite: string;
  materiali_utilizzati: string;
  note: string;
  condizioni_meteo: MeteoGiornale | null;
  personale_presente: number | null;
  avanzamento_percentuale: number | null;
}

export interface BozzaGiornale {
  /** Niente da scrivere: non si crea una pagina vuota. */
  vuota: boolean;
  campi: CampiBozza;
  fonti: FontiBozza;
}

export interface GiornataPerBozza {
  rapportini: RapportinoPerBozza[];
  ddt?: DdtPerBozza[];
  segnalazioni?: SegnalazionePerBozza[];
  fotoIds?: string[];
  /** user_id → nome di chi ha scritto il rapportino. */
  nomiAutori?: Record<string, string>;
}

/** Solo i rapportini arrivati: niente bozze, niente rifiutati. */
export const STATI_RAPPORTINO_BOZZA = ["inviato", "approvato"] as const;
/** Una bolla «attesa» non è ancora arrivata. */
export const STATI_DDT_NON_ARRIVATO = ["atteso", "attesa"] as const;
/** Le colonne di `ddt_ricezione` che servono: uguali nel browser e nel giro serale. */
export const COLONNE_DDT_BOZZA =
  "id, numero_ddt, stato, order_id, destinazione, has_damages, fornitore:suppliers(name), oda:purchase_orders(order_id)";

const pulito = (v: unknown) => (typeof v === "string" ? v.replace(/\s+/g, " ").trim() : "");
/** Per riconoscere lo stesso testo: maiuscole, spazi e punto finale non contano. */
const chiaveTesto = (t: string) => t.toLowerCase().replace(/\s+/g, " ").trim().replace(/[.;,:!]+$/, "");
const senzaDoppioni = (ids: Array<string | null | undefined>) => [...new Set(ids.filter((x): x is string => !!x))];

/** La commessa della bolla: scritta sulla bolla o dedotta dall'ordine d'acquisto. */
export function commessaDelDdt(d: DdtPerBozza): string | null {
  return d.order_id ?? d.oda?.order_id ?? null;
}

/** Il meteo nei valori che la pagina del giornale accetta; quello che non si riconosce non si inventa. */
export function meteoGiornale(v: unknown): MeteoGiornale | null {
  const t = pulito(v).toLowerCase();
  if (!t) return null;
  if (/piogg|piov|temporal/.test(t)) return "pioggia";
  if (/nev/.test(t)) return "neve";
  if (/vent/.test(t)) return "vento forte";
  if (/nuvol|copert/.test(t)) return "nuvoloso";
  if (/sole|seren/.test(t)) return "soleggiato";
  return null;
}

function righeLavorazioni(rapportini: RapportinoPerBozza[], nomi: Record<string, string>): string[] {
  const voci = new Map<string, { testo: string; autori: string[] }>();
  for (const r of rapportini) {
    const testo = pulito(r.descrizione_lavori);
    if (!testo) continue;
    const chiave = chiaveTesto(testo);
    const voce = voci.get(chiave) ?? { testo, autori: [] };
    const nome = r.user_id ? nomi[r.user_id]?.trim() : "";
    if (nome && !voce.autori.includes(nome)) voce.autori.push(nome);
    voci.set(chiave, voce);
  }
  const elenco = [...voci.values()];
  // Una riga sola non ha bisogno di dire di chi è.
  if (elenco.length <= 1) return elenco.map((v) => v.testo);
  return elenco.map((v) => (v.autori.length ? `${v.autori.join(", ")}: ${v.testo}` : v.testo));
}

function righeMateriali(rapportini: RapportinoPerBozza[]): string[] {
  const voci = new Map<string, { nome: string; unita: string; quantita: number | null }>();
  for (const r of rapportini) {
    for (const m of Array.isArray(r.materiali_usati) ? r.materiali_usati : []) {
      const o = (typeof m === "string" ? { nome: m } : m ?? {}) as Record<string, unknown>;
      const nome = pulito(o.nome) || pulito(o.descrizione) || pulito(o.articolo);
      if (!nome) continue;
      const unita = pulito(o.unita) || pulito(o.unita_misura);
      const n = o.quantita === null || o.quantita === undefined || o.quantita === "" ? NaN : Number(o.quantita);
      const quantita = Number.isFinite(n) ? n : null;
      // Si sommano solo le quantità della stessa voce con la stessa unità.
      const chiave = `${chiaveTesto(nome)}|${unita.toLowerCase()}`;
      const voce = voci.get(chiave) ?? { nome, unita, quantita: null };
      if (quantita !== null) voce.quantita = (voce.quantita ?? 0) + quantita;
      voci.set(chiave, voce);
    }
  }
  return [...voci.values()].map((v) => {
    if (v.quantita === null) return v.nome;
    const q = (Math.round(v.quantita * 100) / 100).toLocaleString("it-IT", { maximumFractionDigits: 2 });
    return `${v.nome}: ${q}${v.unita ? ` ${v.unita}` : ""}`;
  });
}

function rigaConsegne(ddt: DdtPerBozza[]): string {
  const pezzi = ddt.map((d) => {
    const numero = pulito(d.numero_ddt);
    const fornitore = pulito(d.fornitore?.name);
    const note = [d.destinazione === "magazzino" ? "a magazzino" : "", d.has_damages ? "danni segnalati" : ""].filter(Boolean).join(", ");
    return `${numero ? `DDT ${numero}` : "DDT senza numero"}${fornitore ? ` di ${fornitore}` : ""}${note ? ` (${note})` : ""}`;
  });
  return pezzi.length ? `Consegne: ${pezzi.join("; ")}.` : "";
}

function rigaSegnalazioni(segnalazioni: SegnalazionePerBozza[]): string {
  const viste = new Set<string>();
  const pezzi: string[] = [];
  for (const s of segnalazioni) {
    const titolo = pulito(s.titolo) || pulito(s.subject);
    const descrizione = pulito(s.descrizione).slice(0, 200);
    const testo = titolo && descrizione && chiaveTesto(titolo) !== chiaveTesto(descrizione) ? `${titolo} (${descrizione})` : titolo || descrizione;
    const chiave = chiaveTesto(testo);
    if (!testo || viste.has(chiave)) continue;
    viste.add(chiave);
    pezzi.push(testo);
  }
  return pezzi.length ? `Segnalazioni dal campo: ${pezzi.join("; ")}.` : "";
}

export function componiBozzaGiornale(g: GiornataPerBozza): BozzaGiornale {
  const nomi = g.nomiAutori ?? {};
  const rapportini = g.rapportini.filter((r) => (STATI_RAPPORTINO_BOZZA as readonly string[]).includes(String(r.stato)));
  const ddt = (g.ddt ?? []).filter((d) => !(STATI_DDT_NON_ARRIVATO as readonly string[]).includes(String(d.stato)));
  const segnalazioni = g.segnalazioni ?? [];

  const lavorazioni = righeLavorazioni(rapportini, nomi).join("\n");
  const materiali = righeMateriali(rapportini).join("\n");
  const note = [rigaConsegne(ddt), rigaSegnalazioni(segnalazioni)].filter(Boolean).join("\n");
  const persone = personeDelGiorno(rapportini, nomi).length;
  // Lo 0 è il valore di base della colonna, non una percentuale dichiarata.
  const percentuali = rapportini.map((r) => Number(r.percentuale_avanzamento)).filter((n) => Number.isFinite(n) && n > 0);

  return {
    vuota: !lavorazioni && !materiali && !note,
    campi: {
      lavorazioni_eseguite: lavorazioni,
      materiali_utilizzati: materiali,
      note,
      condizioni_meteo: rapportini.map((r) => meteoGiornale(r.meteo)).find(Boolean) ?? null,
      personale_presente: persone > 0 ? persone : null,
      avanzamento_percentuale: percentuali.length ? Math.min(100, Math.round(Math.max(...percentuali))) : null,
    },
    fonti: {
      source_rapportini_ids: senzaDoppioni(rapportini.map((r) => r.id)),
      source_ddt_ids: senzaDoppioni(ddt.map((d) => d.id)),
      source_segnalazioni_ids: senzaDoppioni(segnalazioni.map((s) => s.id)),
      source_foto_ids: senzaDoppioni(g.fotoIds ?? []),
    },
  };
}

// ── Mettere la proposta in una pagina che ha già del testo ─────────────────────

export type ModoBozza = "aggiungi" | "sostituisci";

export interface ModuloBozza {
  lavorazioni_eseguite: string;
  materiali_utilizzati: string;
  note: string;
  condizioni_meteo: string;
  personale_presente: number;
  avanzamento_percentuale: number;
}

export function testoGiaScritto(f: Pick<ModuloBozza, "lavorazioni_eseguite" | "materiali_utilizzati" | "note">): boolean {
  return !!(f.lavorazioni_eseguite.trim() || f.materiali_utilizzati.trim() || f.note.trim());
}

/** In coda solo le righe che non ci sono già: premere due volte non raddoppia niente. */
export function unisciTesto(esistente: string, proposta: string, modo: ModoBozza): string {
  if (!proposta.trim()) return esistente; // Dove non c'è proposta si tiene quello che è scritto.
  if (modo === "sostituisci" || !esistente.trim()) return proposta;
  const presenti = new Set(esistente.split("\n").map(chiaveTesto));
  const nuove = proposta.split("\n").filter((r) => !presenti.has(chiaveTesto(r)));
  return nuove.length ? `${esistente.replace(/\s+$/, "")}\n${nuove.join("\n")}` : esistente;
}

export function applicaBozza<F extends ModuloBozza>(
  form: F,
  b: BozzaGiornale,
  modo: ModoBozza,
  opzioni: { paginaNuova: boolean },
): F {
  const sostituisci = modo === "sostituisci";
  const { condizioni_meteo: meteo, personale_presente: persone, avanzamento_percentuale: avanzamento } = b.campi;
  return {
    ...form,
    lavorazioni_eseguite: unisciTesto(form.lavorazioni_eseguite, b.campi.lavorazioni_eseguite, modo),
    materiali_utilizzati: unisciTesto(form.materiali_utilizzati, b.campi.materiali_utilizzati, modo),
    note: unisciTesto(form.note, b.campi.note, modo),
    // Meteo e numeri: si riempiono se sono ancora al valore di partenza, si cambiano solo se si è scelto di sostituire.
    condizioni_meteo: meteo && (sostituisci || !form.condizioni_meteo || (opzioni.paginaNuova && form.condizioni_meteo === "soleggiato")) ? meteo : form.condizioni_meteo,
    personale_presente: persone !== null && (sostituisci || form.personale_presente <= 1) ? persone : form.personale_presente,
    avanzamento_percentuale: avanzamento !== null && (sostituisci || form.avanzamento_percentuale === 0) ? avanzamento : form.avanzamento_percentuale,
  };
}

export function unisciFonti(a: { [K in keyof FontiBozza]?: string[] | null } | null | undefined, b: FontiBozza): FontiBozza {
  const unisci = (k: keyof FontiBozza) => senzaDoppioni([...(a?.[k] ?? []), ...b[k]]);
  return {
    source_rapportini_ids: unisci("source_rapportini_ids"),
    source_ddt_ids: unisci("source_ddt_ids"),
    source_segnalazioni_ids: unisci("source_segnalazioni_ids"),
    source_foto_ids: unisci("source_foto_ids"),
  };
}

/** L'inizio e la fine (istanti UTC) della giornata `data` (AAAA-MM-GG) a Roma. */
export function intervalloGiornoRoma(data: string): { inizio: string; fine: string } {
  const mezzanotteUtc = new Date(`${data}T00:00:00Z`);
  const ora = Number(new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Rome", hour: "2-digit", hourCycle: "h23" }).format(mezzanotteUtc));
  const inizio = new Date(mezzanotteUtc.getTime() - ora * 3600 * 1000);
  return { inizio: inizio.toISOString(), fine: new Date(inizio.getTime() + 24 * 3600 * 1000 - 1000).toISOString() };
}
