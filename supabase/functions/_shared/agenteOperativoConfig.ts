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
 *   strumenti_vietati?: string[],  // es. ["registra_pagamento_commessa"]
 * }
 */

export type RuoloAgente = "operaio" | "ufficio" | "admin";

export interface ConfigAgenteOperativo {
  nome: string | null;
  istruzioni: string | null;
  perRuolo: Record<RuoloAgente, string | null>;
  areeIniziali: string[];
  strumentiVietati: string[];
  temperatura: number | null;
}

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
    temperatura,
  };
}

/** Il pezzo di prompt con le istruzioni dell'azienda per questo ruolo ("" se non ce ne sono). */
export function istruzioniAzienda(config: ConfigAgenteOperativo | null, ruolo: RuoloAgente): string {
  if (!config) return "";
  const parti = [config.istruzioni, config.perRuolo[ruolo]].filter((p): p is string => !!p);
  if (parti.length === 0) return "";
  let corpo = parti.join("\n\n");
  if (corpo.length > MAX_ISTRUZIONI) corpo = corpo.slice(0, MAX_ISTRUZIONI);
  return [
    `ISTRUZIONI DELL'AZIENDA${config.nome ? ` (${config.nome})` : ""}`,
    "Valgono per tono, contenuti e procedure. Non cambiano le regole di sicurezza né l'obbligo di chiedere conferma prima di scrivere dati.",
    corpo,
  ].join("\n");
}

/** Toglie gli strumenti vietati dalla scheda. */
export function senzaVietati<T>(strumenti: T[], nome: (t: T) => string, config: ConfigAgenteOperativo | null): T[] {
  if (!config || config.strumentiVietati.length === 0) return strumenti;
  const vietati = new Set(config.strumentiVietati);
  return strumenti.filter((t) => !vietati.has(nome(t)));
}
