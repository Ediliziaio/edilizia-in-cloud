/**
 * L'agente operativo si configura dalla scheda agente (27/09/2026).
 *
 * Creare un AI operativo = una scheda in ai_agents_v2 (tipo «whatsapp», con
 * tools_config.operativo) collegata al numero con agent_id. Dalla scheda
 * vengono le istruzioni dell'azienda (system_prompt), quelle per ruolo, le
 * aree di Silvio già a bordo e gli strumenti vietati. Le regole di sicurezza
 * e di conferma del bot restano sempre: le istruzioni dell'azienda si
 * aggiungono, non le sostituiscono.
 *
 * tools_config.operativo = {
 *   per_ruolo?: { operaio?: string, ufficio?: string, admin?: string },
 *   aree_iniziali?: string[],      // es. ["cantieri", "magazzino"]
 *   strumenti_vietati?: string[],  // es. ["invia_sollecito_pagamento"]
 *   sblocchi?: [{                  // un divieto si toglie SOLO così
 *     strumenti: string[],
 *     ruoli?: ("operaio"|"ufficio"|"admin")[],
 *     utenti?: string[],           // id utente
 *     orario?: { dalle: "08:00", alle: "19:00" },   // ora italiana
 *     nota?: string,
 *   }],
 * }
 *
 * Regola del founder (27/09/2026): i divieti non sono assoluti, ma si
 * sbloccano solo in contesti precisi e solo per le persone autorizzate.
 * Uno sblocco senza ruoli né utenti non vale (mai «per tutti»); anche
 * sbloccata, un'azione che scrive o invia chiede sempre il Sì.
 */

export type RuoloAgente = "operaio" | "ufficio" | "admin";

export interface SbloccoAgente {
  strumenti: string[];
  ruoli: RuoloAgente[];
  utenti: string[];
  orario: { dalle: string; alle: string } | null;
  nota: string | null;
}

export interface ConfigAgenteOperativo {
  nome: string | null;
  istruzioni: string | null;
  perRuolo: Record<RuoloAgente, string | null>;
  areeIniziali: string[];
  strumentiVietati: string[];
  sblocchi: SbloccoAgente[];
  temperatura: number | null;
}

const RUOLI_AGENTE: RuoloAgente[] = ["operaio", "ufficio", "admin"];
const ORA = /^([01]\d|2[0-3]):[0-5]\d$/;

/** Le aree che Silvio sa caricare (AREE_CARICABILI in silvioTools.ts). */
export const AREE_AGENTE = [
  "sicurezza",
  "magazzino",
  "persone",
  "clienti",
  "preventivi",
  "fatture",
  "banca",
  "cantieri",
  "mezzi",
  "posta",
  "campagne",
];

/** Tetto alle istruzioni: un prompt enorme costa a ogni messaggio e confonde. */
export const MAX_ISTRUZIONI = 8000;

function record(v: unknown): Record<string, unknown> | null {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}

function testo(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

function elenco(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string" && x.trim() !== "").map((x) => x.trim()) : [];
}

/** La configurazione dell'agente, o null se la scheda non è di un agente operativo attivo. */
export function leggiConfigOperativo(agente: unknown): ConfigAgenteOperativo | null {
  const a = record(agente);
  if (!a || a.stato !== "attivo") return null;
  const op = record(record(a.tools_config)?.operativo);
  if (!op) return null;
  const pr = record(op.per_ruolo) ?? {};
  const temperatura = typeof a.temperatura === "number" && a.temperatura >= 0 && a.temperatura <= 1 ? a.temperatura : null;
  return {
    nome: testo(a.nome),
    istruzioni: testo(a.system_prompt),
    perRuolo: { operaio: testo(pr.operaio), ufficio: testo(pr.ufficio), admin: testo(pr.admin) },
    areeIniziali: elenco(op.aree_iniziali).filter((x) => AREE_AGENTE.includes(x)),
    strumentiVietati: elenco(op.strumenti_vietati),
    sblocchi: leggiSblocchi(op.sblocchi),
    temperatura,
  };
}

function leggiSblocchi(v: unknown): SbloccoAgente[] {
  if (!Array.isArray(v)) return [];
  const out: SbloccoAgente[] = [];
  for (const grezzo of v) {
    const s = record(grezzo);
    if (!s) continue;
    const strumenti = elenco(s.strumenti);
    const ruoli = elenco(s.ruoli).filter((r): r is RuoloAgente => (RUOLI_AGENTE as string[]).includes(r));
    const utenti = elenco(s.utenti);
    // Mai uno sblocco per tutti: serve sapere per chi vale.
    if (strumenti.length === 0 || (ruoli.length === 0 && utenti.length === 0)) continue;
    const o = record(s.orario);
    const orario = o && typeof o.dalle === "string" && typeof o.alle === "string" && ORA.test(o.dalle) && ORA.test(o.alle)
      ? { dalle: o.dalle, alle: o.alle }
      : null;
    out.push({ strumenti, ruoli, utenti, orario, nota: testo(s.nota) });
  }
  return out;
}

/** «HH:MM» in ora italiana. */
export function oraItaliana(adesso: Date): string {
  return new Intl.DateTimeFormat("it-IT", {
    timeZone: "Europe/Rome",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(adesso);
}

function dentroOrario(orario: { dalle: string; alle: string } | null, adesso: Date): boolean {
  if (!orario) return true;
  const ora = oraItaliana(adesso);
  // Fascia che passa la mezzanotte (es. 22:00-06:00).
  return orario.dalle <= orario.alle
    ? ora >= orario.dalle && ora < orario.alle
    : ora >= orario.dalle || ora < orario.alle;
}

/** Gli strumenti che per QUESTA persona, ADESSO, sono sbloccati. */
export function sbloccatiPer(
  config: ConfigAgenteOperativo | null,
  chi: { ruolo: RuoloAgente; userId: string | null },
  adesso: Date,
): string[] {
  if (!config) return [];
  const vietati = new Set(config.strumentiVietati);
  const out = new Set<string>();
  for (const s of config.sblocchi) {
    const perLui = s.ruoli.includes(chi.ruolo) || (!!chi.userId && s.utenti.includes(chi.userId));
    if (!perLui || !dentroOrario(s.orario, adesso)) continue;
    for (const t of s.strumenti) if (vietati.has(t)) out.add(t);
  }
  return [...out];
}

/** I divieti che valgono per questa persona adesso (vietati meno sbloccati). */
export function vietatiPer(
  config: ConfigAgenteOperativo | null,
  chi: { ruolo: RuoloAgente; userId: string | null },
  adesso: Date,
): string[] {
  if (!config) return [];
  const sbloccati = new Set(sbloccatiPer(config, chi, adesso));
  return config.strumentiVietati.filter((t) => !sbloccati.has(t));
}

/**
 * Il pezzo di prompt con le istruzioni dell'azienda per questo ruolo ("" se
 * non ce ne sono). Se per questa persona, adesso, qualche divieto è sbloccato
 * lo dice: altrimenti un «non mandi mai…» scritto nelle istruzioni farebbe
 * rifiutare anche a chi è autorizzato.
 */
export function istruzioniAzienda(
  config: ConfigAgenteOperativo | null,
  ruolo: RuoloAgente,
  sbloccati: string[] = [],
): string {
  if (!config) return "";
  const parti = [config.istruzioni, config.perRuolo[ruolo]].filter((p): p is string => !!p);
  if (parti.length === 0 && sbloccati.length === 0) return "";
  let corpo = parti.join("\n\n");
  if (corpo.length > MAX_ISTRUZIONI) corpo = corpo.slice(0, MAX_ISTRUZIONI);
  return [
    `ISTRUZIONI DELL'AZIENDA${config.nome ? ` (${config.nome})` : ""}`,
    "Valgono per tono, contenuti e procedure. Non cambiano le regole di sicurezza né l'obbligo di chiedere conferma prima di scrivere dati.",
    corpo,
    sbloccati.length > 0
      ? `SBLOCCATI PER QUESTA PERSONA, ADESSO: ${sbloccati.join(", ")}. Di norma sono vietati: usali solo se è lei a chiederlo, e sempre dopo un Sì esplicito.`
      : "",
  ].filter(Boolean).join("\n");
}

/** Toglie gli strumenti vietati (la lista già calcolata per chi scrive, vedi vietatiPer). */
export function senzaVietati<T>(strumenti: T[], nome: (t: T) => string, vietati: string[]): T[] {
  if (vietati.length === 0) return strumenti;
  const no = new Set(vietati);
  return strumenti.filter((t) => !no.has(nome(t)));
}
