import { TIPI_DPI, dataValidaDpi, statoConsegnaDpi, type ConsegnaRegistrata } from "./consegneDpi.ts";
export const CAMPI_EMERGENZE_POS = {
  raccolta: "Punti di raccolta",
  esodo: "Vie di esodo e uscite",
  primo_soccorso: "Presidi di primo soccorso",
  antincendio: "Presidi antincendio",
  accesso_soccorsi: "Accesso dei soccorsi",
  allarme: "Allarme, chiamata e procedura",
  planimetria: "Riferimento a PSC o planimetria",
} as const;
export type CampoEmergenzePos = keyof typeof CAMPI_EMERGENZE_POS;
export type PianoEmergenzePos = Partial<Record<CampoEmergenzePos, string>>;
export interface FonteRumorePos {
  origine: "archivio" | "allegato";
  id: string;
  titolo: string;
  data_archivio: string | null;
  sha256: string;
}
export interface RapportoRumorePos {
  codice: string;
  data: string;
  revisione: string;
  fonte?: FonteRumorePos;
  collocazione?: string;
  esiti_riesaminati?: boolean;
}
export interface RiscontroDpiPos {
  previsto: string;
  consegna_id: string;
  addetto_id: string;
  addetto: string;
  tipo: string;
  data: string;
  versione: number;
}
export interface AddettoConConsegne {
  id: string;
  nome: string;
  cognome: string;
  attivo: boolean | null;
  assegnazioni: Array<{ fase_id: string | null }>;
  consegne: ConsegnaRegistrata[];
}

const oggetto = (v: unknown): Record<string, unknown> =>
  v !== null && typeof v === "object" && !Array.isArray(v) ? v as Record<string, unknown> : {};
const testo = (v: unknown, limite = 250) => typeof v === "string" ? v.trim().slice(0, limite) : "";
const uuid = (v: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
export function normalizzaPianoEmergenze(v: unknown): PianoEmergenzePos | undefined {
  const o = oggetto(v);
  const entries = Object.keys(CAMPI_EMERGENZE_POS).map(k => [k, testo(o[k], 3000)]).filter(([, val]) => val);
  return entries.length ? Object.fromEntries(entries) : undefined;
}
export function normalizzaRapportoRumore(v: unknown): RapportoRumorePos | undefined {
  if (!v || typeof v !== "object") return;
  const o = oggetto(v);
  const f = oggetto(o.fonte);
  const id = testo(f.id, 1024), sha256 = testo(f.sha256, 64);
  const origine = f.origine;
  const fonte: FonteRumorePos | undefined = /^[a-f0-9]{64}$/.test(sha256) &&
    ((origine === "archivio" && uuid(id)) || (origine === "allegato" && id))
    ? { origine, id, sha256, titolo: testo(f.titolo), data_archivio: typeof f.data_archivio === "string" && dataValidaDpi(f.data_archivio) ? f.data_archivio : null }
    : undefined;
  return { esiti_riesaminati: o.esiti_riesaminati === true, collocazione: testo(o.collocazione), codice: testo(o.codice, 120), data: testo(o.data, 10), revisione: testo(o.revisione, 120), ...(fonte ? { fonte } : {}) };
}
export function normalizzaRiscontriDpi(v: unknown): RiscontroDpiPos[] {
  if (!Array.isArray(v)) return [];
  const visti = new Set<string>();
  return v.slice(0, 250).flatMap(raw => {
    const o = oggetto(raw);
    const r = { previsto: testo(o.previsto, 350), consegna_id: testo(o.consegna_id), addetto_id: testo(o.addetto_id),
      addetto: testo(o.addetto), tipo: testo(o.tipo), data: testo(o.data, 10), versione: typeof o.versione === "number" ? o.versione : 0 };
    const chiave = JSON.stringify([r.previsto, r.consegna_id]);
    if (!r.previsto || !r.addetto || !r.tipo || !uuid(r.consegna_id) || !uuid(r.addetto_id) ||
        !Number.isSafeInteger(r.versione) || r.versione < 1 || !dataValidaDpi(r.data) || visti.has(chiave)) return [];
    visti.add(chiave);
    return [r];
  });
}
export function dpiPrevistiPos(dpi: string): string[] {
  return [...new Set(dpi.split(/\n|;/).map(x => x.replace(/^[-•\s]+/, "").trim()).filter(Boolean))];
}
export function riscontriDpiDisponibili(addetti: AddettoConConsegne[], previsto: string, data: string, fase?: string | null): RiscontroDpiPos[] {
  return addetti.filter(a => a.attivo !== false && a.assegnazioni.some(s => !fase || !s.fase_id || s.fase_id === fase)).flatMap(a => {
    const addetto = [a.nome, a.cognome].filter(Boolean).join(" ").trim();
    return a.consegne.filter(d => addetto && (d.versione ?? 0) > 0 && statoConsegnaDpi(d, data) === "in_uso")
      .map(d => ({ previsto, consegna_id: d.id, addetto_id: a.id, addetto, tipo: d.tipo, data: d.consegnato_il, versione: d.versione! }));
  });
}
export function stessoRiscontroDpi(a: RiscontroDpiPos, b: RiscontroDpiPos) {
  return a.previsto === b.previsto && a.consegna_id === b.consegna_id && a.addetto_id === b.addetto_id &&
    a.addetto === b.addetto && a.tipo === b.tipo && a.data === b.data && a.versione === b.versione;
}
export const dataRiscontriDpiPos = (ora = new Date()) => new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Rome" }).format(ora);

const nomeDpi = (v: string) => v.toLowerCase().normalize("NFD").replace(/\p{M}/gu, "").replace(/[_\s]+/g, " ").trim();
const perTipoDpi = new Map(Object.entries(TIPI_DPI).flatMap(([k, label]) => [[nomeDpi(k), k], [nomeDpi(label), k]]));
perTipoDpi.set("casco di protezione", "casco");
perTipoDpi.set("occhiali di protezione", "occhiali");

/** Suggerimenti solo per una corrispondenza di tipo univoca. Ogni requisito specifico resta da associare a mano. */
export function suggerisciRiscontriDpiPos(previsti: string[], addetti: AddettoConConsegne[], giaCollegati: RiscontroDpiPos[], data: string, fase?: string | null) {
  const proposte: RiscontroDpiPos[] = [];
  const daScegliere: string[] = [];
  const mancanti: string[] = [];
  const manuali: string[] = [];
  const riconosciuti = previsti.map(previsto => ({ previsto, tipo: perTipoDpi.get(nomeDpi(previsto)) }));
  for (const { previsto, tipo } of riconosciuti) {
    if (!tipo || riconosciuti.filter(r => r.tipo === tipo).length > 1) {
      manuali.push(previsto);
      continue;
    }
    const disponibili = riscontriDpiDisponibili(addetti, previsto, data, fase).filter(d => d.tipo === tipo);
    for (const a of addetti) {
      if (a.attivo === false || !a.assegnazioni.some(s => !fase || !s.fase_id || s.fase_id === fase)) continue;
      if (giaCollegati.some(r => r.previsto === previsto && r.addetto_id === a.id)) continue;
      const compatibili = disponibili.filter(d => d.addetto_id === a.id);
      const nome = [a.nome, a.cognome].filter(Boolean).join(" ").trim();
      if (!nome) continue;
      if (compatibili.length === 1) proposte.push(compatibili[0]);
      else if (compatibili.length > 1) daScegliere.push(`${nome} · ${previsto}`);
      else mancanti.push(`${nome} · ${previsto}`);
    }
  }
  return { proposte, daScegliere, mancanti, manuali };
}
