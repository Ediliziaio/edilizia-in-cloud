/**
 * Il modulo di cantiere dell'azienda: quali parti del rapportino usa, quali campi propri aggiunge, quali voci ha il
 * verbale di collaudo. Senza un modello vale SCHEMA_COME_OGGI: nessuna azienda cambia finché non decide.
 *
 * Ogni documento conserva etichetta e tipo dentro il valore (ValoreCampo): rinominare o eliminare un campo non altera
 * i rapportini e i verbali già scritti.
 *
 * Modulo puro, condiviso tra il browser e le funzioni edge: niente React, niente Supabase, niente alias.
 */
export const BLOCCHI_STANDARD = ["fasi", "materiali", "mezzi", "foto", "straordinario", "avanzamento"] as const;
export type BloccoStandard = (typeof BLOCCHI_STANDARD)[number];
export const TIPI_CAMPO = ["text", "textarea", "number", "date", "select", "multiselect", "boolean"] as const;
export type TipoCampo = (typeof TIPI_CAMPO)[number];
export type Stampa = "mai" | "interno" | "cliente";

export interface CampoModulo {
  /** Identità stabile: non cambia quando si rinomina l'etichetta e non si riusa dopo l'archiviazione. */
  chiave: string;
  etichetta: string;
  tipo: TipoCampo;
  obbligatorio: boolean;
  opzioni?: string[];
  aiuto?: string;
  unita?: string;
  chi: "tutti" | "capo";
  ditte: "tutti" | "dipendenti" | "subappaltatori";
  quando: "giornaliero" | "fine_lavori" | "sempre";
  livello: "rapportino" | "fase";
  stampa: Stampa;
  /** Non si compila più, ma i dati già scritti restano leggibili e nei totali. */
  archiviato?: boolean;
}

export interface ModuloSchema {
  formato: 1;
  blocchi: Record<BloccoStandard, boolean>;
  campi: CampoModulo[];
  /** Solo verbale: le voci da controllare. */
  voci?: string[];
  /** Solo verbale: il titolo del documento. */
  titolo?: string;
  /** Solo verbale: il capocantiere interno lo può compilare e far firmare dal telefono. */
  dal_cantiere?: boolean;
}

export interface ValoreCampo {
  chiave: string;
  etichetta: string;
  tipo: TipoCampo;
  valore: string | number | boolean | string[];
  stampa: Stampa;
  unita?: string;
  phase_id?: string;
  fase_nome?: string;
}

export interface FaseScelta { id: string; nome: string }

export interface ContestoCampi {
  ruolo: "operaio" | "capo" | "ufficio";
  momento: "giornaliero" | "fine_lavori";
  subappaltatore: boolean;
  /** L'operaio nel flusso «ore proprie»: manda solo le ore. */
  soloOre: boolean;
}

export const MAX_CAMPI = 30;
// Lo stesso limite del verbale: un modello oltre non potrebbe generare verbali validi.
export const MAX_VOCI = 30;
const MAX_VOCE = 200;
const MAX_ETICHETTA = 80;

export const SCHEMA_COME_OGGI: ModuloSchema = {
  formato: 1,
  blocchi: { fasi: true, materiali: true, mezzi: true, foto: true, straordinario: true, avanzamento: true },
  campi: [],
};

type Grezzo = Record<string, unknown>;
const oggetto = (v: unknown): Grezzo => (v && typeof v === "object" && !Array.isArray(v) ? v as Grezzo : {});
const scelta = <T extends string>(v: unknown, ammessi: readonly T[], predefinito: T): T =>
  ammessi.includes(v as T) ? v as T : predefinito;
const STAMPE = ["mai", "interno", "cliente"] as const;

function leggiCampo(raw: unknown): CampoModulo | null {
  const c = oggetto(raw);
  if (typeof c.chiave !== "string" || !c.chiave || !TIPI_CAMPO.includes(c.tipo as TipoCampo)) return null;
  return {
    chiave: c.chiave,
    etichetta: typeof c.etichetta === "string" ? c.etichetta : "",
    tipo: c.tipo as TipoCampo,
    obbligatorio: c.obbligatorio === true,
    ...(Array.isArray(c.opzioni) ? { opzioni: c.opzioni.filter((o): o is string => typeof o === "string") } : {}),
    ...(typeof c.aiuto === "string" && c.aiuto ? { aiuto: c.aiuto } : {}),
    ...(typeof c.unita === "string" && c.unita ? { unita: c.unita } : {}),
    chi: scelta(c.chi, ["tutti", "capo"] as const, "tutti"),
    ditte: scelta(c.ditte, ["tutti", "dipendenti", "subappaltatori"] as const, "tutti"),
    quando: scelta(c.quando, ["giornaliero", "fine_lavori", "sempre"] as const, "sempre"),
    livello: scelta(c.livello, ["rapportino", "fase"] as const, "rapportino"),
    stampa: scelta(c.stampa, STAMPE, "interno"),
    ...(c.archiviato === true ? { archiviato: true } : {}),
  };
}

/** Legge ciò che arriva dal database: quello che non è valido torna al «come oggi». */
export function leggiSchema(raw: unknown): ModuloSchema {
  const s = oggetto(raw);
  const blocchi = oggetto(s.blocchi);
  return {
    formato: 1,
    blocchi: Object.fromEntries(BLOCCHI_STANDARD.map(b => [b, blocchi[b] !== false])) as Record<BloccoStandard, boolean>,
    campi: (Array.isArray(s.campi) ? s.campi : []).map(leggiCampo).filter((c): c is CampoModulo => c !== null),
    ...(Array.isArray(s.voci) ? { voci: s.voci.filter((v): v is string => typeof v === "string") } : {}),
    ...(typeof s.titolo === "string" && s.titolo ? { titolo: s.titolo } : {}),
    ...(typeof s.dal_cantiere === "boolean" ? { dal_cantiere: s.dal_cantiere } : {}),
  };
}

export function validaSchema(s: ModuloSchema): string[] {
  const errori: string[] = [];
  if (s.campi.filter(c => !c.archiviato).length > MAX_CAMPI) errori.push(`Al massimo ${MAX_CAMPI} campi.`);
  if ((s.voci?.length ?? 0) > MAX_VOCI) errori.push(`Al massimo ${MAX_VOCI} voci.`);
  if (s.voci?.some(v => !v.trim())) errori.push("Ogni voce deve avere un testo.");
  if (s.voci?.some(v => v.length > MAX_VOCE)) errori.push(`Ogni voce può avere al massimo ${MAX_VOCE} caratteri.`);
  const viste = new Set<string>();
  for (const c of s.campi) {
    const nome = c.etichetta.trim();
    if (!nome) errori.push("Ogni campo deve avere un nome.");
    else if (nome.length > MAX_ETICHETTA) errori.push(`Il nome «${nome.slice(0, 30)}…» supera ${MAX_ETICHETTA} caratteri.`);
    if ((c.tipo === "select" || c.tipo === "multiselect") && !c.opzioni?.some(o => o.trim())) errori.push(`«${nome}»: aggiungi almeno un'opzione.`);
    if (viste.has(c.chiave)) errori.push(`«${nome}»: campo doppio.`);
    viste.add(c.chiave);
  }
  return errori;
}

/** `uso`: per ogni chiave, quanti documenti contengono già quel campo. */
export function validaModifica(prima: ModuloSchema, dopo: ModuloSchema, uso: Record<string, number>): string[] {
  const errori: string[] = [];
  for (const vecchio of prima.campi) {
    const n = uso[vecchio.chiave] ?? 0;
    if (n <= 0) continue;
    const nuovo = dopo.campi.find(c => c.chiave === vecchio.chiave);
    if (!nuovo) errori.push(`«${vecchio.etichetta}»: ${n} documenti lo contengono già, si può solo archiviare.`);
    else if (nuovo.tipo !== vecchio.tipo) errori.push(`«${vecchio.etichetta}»: il tipo non si cambia, ${n} documenti contengono già questo campo.`);
  }
  return errori;
}

export function chiaveDaEtichetta(etichetta: string, esistenti: string[]): string {
  const base = etichetta.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase()
    .replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "") || "campo";
  if (!esistenti.includes(base)) return base;
  let n = 2;
  while (esistenti.includes(`${base}_${n}`)) n++;
  return `${base}_${n}`;
}

/** La chiave di un valore nel form: una per campo, o una per campo e fase. */
export function chiaveValore(chiave: string, phaseId?: string): string {
  return phaseId ? `${chiave}@${phaseId}` : chiave;
}

export function campiPerContesto(s: ModuloSchema, c: ContestoCampi): CampoModulo[] {
  if (c.soloOre) return [];
  return s.campi.filter(campo => {
    if (campo.archiviato) return false;
    if (campo.quando === "giornaliero" && c.momento !== "giornaliero") return false;
    if (campo.quando === "fine_lavori" && c.momento !== "fine_lavori") return false;
    if (c.ruolo === "ufficio") return true;
    if (campo.chi === "capo" && c.ruolo !== "capo") return false;
    if (campo.ditte === "dipendenti" && c.subappaltatore) return false;
    if (campo.ditte === "subappaltatori" && !c.subappaltatore) return false;
    return true;
  });
}

/** Il valore come va salvato, o undefined se il campo è vuoto (false e 0 sono risposte). */
function normalizza(c: CampoModulo, raw: unknown): ValoreCampo["valore"] | undefined {
  if (raw === null || raw === undefined) return undefined;
  switch (c.tipo) {
    case "boolean":
      return typeof raw === "boolean" ? raw : undefined;
    case "number": {
      const n = typeof raw === "number" ? raw : Number(String(raw).trim().replace(",", "."));
      return String(raw).trim() !== "" && Number.isFinite(n) ? n : undefined;
    }
    case "multiselect": {
      const v = Array.isArray(raw) ? raw.filter((x): x is string => typeof x === "string" && !!x.trim()) : [];
      return v.length ? v : undefined;
    }
    default: {
      const v = typeof raw === "string" ? raw.trim() : "";
      return v || undefined;
    }
  }
}

function faseDelCampo(c: CampoModulo, fasi?: FaseScelta[]): Array<FaseScelta | null> {
  return c.livello === "fase" && fasi?.length ? fasi : [null];
}

export function componiValori(campi: CampoModulo[], valori: Record<string, unknown>, precedenti: ValoreCampo[] = [], fasi?: FaseScelta[]): ValoreCampo[] {
  const out: ValoreCampo[] = [];
  for (const c of campi) {
    for (const f of faseDelCampo(c, fasi)) {
      const valore = normalizza(c, valori[chiaveValore(c.chiave, f?.id)]);
      if (valore === undefined) continue;
      out.push({
        chiave: c.chiave, etichetta: c.etichetta, tipo: c.tipo, valore, stampa: c.stampa,
        ...(c.unita ? { unita: c.unita } : {}),
        ...(f ? { phase_id: f.id, fase_nome: f.nome } : {}),
      });
    }
  }
  // Quello che questa persona non compila (campo eliminato, campo del capo) resta com'era; anche i valori per fase di un
  // campo che ora sta sul rapportino, che qui nessuno potrebbe più riscrivere.
  const compilati = new Map(campi.map(c => [c.chiave, c]));
  return [...out, ...precedenti.filter(p => {
    const c = compilati.get(p.chiave);
    return !c || (c.livello === "rapportino" && !!p.phase_id);
  })];
}

export function valoriInBozza(precedenti: ValoreCampo[]): Record<string, unknown> {
  return Object.fromEntries(precedenti.map(v => [chiaveValore(v.chiave, v.phase_id), v.valore]));
}

/** Le fasi di un rapportino già scritto: quelle dichiarate, più quelle dei valori, col nome che avevano allora. */
export function fasiDelRapportino(fasiLavorate: unknown, valori: ValoreCampo[]): FaseScelta[] {
  const fasi = new Map<string, string>();
  for (const f of Array.isArray(fasiLavorate) ? fasiLavorate : []) {
    const v = oggetto(f);
    if (typeof v.phase_id === "string" && v.phase_id) fasi.set(v.phase_id, typeof v.nome === "string" ? v.nome : "");
  }
  for (const v of valori) if (v.phase_id && !fasi.get(v.phase_id)) fasi.set(v.phase_id, v.fase_nome ?? "");
  return [...fasi].map(([id, nome]) => ({ id, nome }));
}

/** Le etichette degli obbligatori non compilati, con la fase quando il campo è per fase. */
export function mancanti(campi: CampoModulo[], valori: Record<string, unknown>, fasi?: FaseScelta[]): string[] {
  const out: string[] = [];
  for (const c of campi) {
    if (!c.obbligatorio) continue;
    for (const f of faseDelCampo(c, fasi)) {
      if (normalizza(c, valori[chiaveValore(c.chiave, f?.id)]) === undefined) out.push(f ? `${c.etichetta} (${f.nome})` : c.etichetta);
    }
  }
  return out;
}

/**
 * Cosa manca a un rapportino già arrivato, per «Da completare». Non si chiedono i campi del capo: chi l'ha mandato può
 * essere un operaio. Chi ha mandato solo le ore (nessuna descrizione) non deve nulla.
 */
export function daCompletare(s: ModuloSchema, r: { descrizione: string; subappaltatore: boolean; fineLavori: boolean; valori: ValoreCampo[]; fasi?: FaseScelta[] }): string[] {
  if (!r.descrizione.trim()) return [];
  const campi = campiPerContesto(s, { ruolo: "operaio", momento: r.fineLavori ? "fine_lavori" : "giornaliero", subappaltatore: r.subappaltatore, soloOre: false });
  return mancanti(campi, valoriInBozza(r.valori), r.fasi);
}

function numeroInTesto(n: number): string {
  const [intero, decimali] = String(Math.abs(n)).split(".");
  const conPunti = intero.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return `${n < 0 ? "-" : ""}${conPunti}${decimali ? `,${decimali}` : ""}`;
}

export function valoreInTesto(v: ValoreCampo): string {
  if (typeof v.valore === "boolean") return v.valore ? "Sì" : "No";
  if (Array.isArray(v.valore)) return v.valore.join(", ");
  if (typeof v.valore === "number") return `${numeroInTesto(v.valore)}${v.unita ? ` ${v.unita}` : ""}`;
  if (v.tipo === "date") {
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(v.valore);
    if (m) return `${m[3]}/${m[2]}/${m[1]}`;
  }
  return v.valore;
}

export function leggiValori(raw: unknown): ValoreCampo[] {
  if (!Array.isArray(raw)) return [];
  const out: ValoreCampo[] = [];
  for (const r of raw) {
    const v = oggetto(r);
    if (typeof v.chiave !== "string" || !v.chiave || typeof v.etichetta !== "string" || !TIPI_CAMPO.includes(v.tipo as TipoCampo)) continue;
    const valore = v.valore;
    const buono = typeof valore === "string" || typeof valore === "number" || typeof valore === "boolean"
      || (Array.isArray(valore) && valore.every(x => typeof x === "string"));
    if (!buono) continue;
    out.push({
      chiave: v.chiave, etichetta: v.etichetta, tipo: v.tipo as TipoCampo, valore: valore as ValoreCampo["valore"],
      stampa: scelta(v.stampa, STAMPE, "interno"),
      ...(typeof v.unita === "string" && v.unita ? { unita: v.unita } : {}),
      ...(typeof v.phase_id === "string" && v.phase_id ? { phase_id: v.phase_id } : {}),
      ...(typeof v.fase_nome === "string" && v.fase_nome ? { fase_nome: v.fase_nome } : {}),
    });
  }
  return out;
}

export function valoriDaStampare(valori: ValoreCampo[], documento: "interno" | "cliente"): ValoreCampo[] {
  return valori.filter(v => v.stampa === "cliente" || (documento === "interno" && v.stampa === "interno"));
}
