// Il cliente di una fattura: privato (nome, cognome, codice fiscale, indirizzo)
// o azienda (ragione sociale, partita IVA) — 01/10/2026.
//
// Per un privato la ragione sociale non esiste. Il giorno del go-live di Renova
// Fabio non riusciva a emettere una fattura a un privato «con tutti i dati»: la
// validazione, l'emissione e l'invio pretendevano la ragione sociale, e i clienti
// privati in anagrafica (32 su 32) hanno solo codice fiscale e indirizzo, senza
// nome. Qui c'è la regola unica: chi è privato si identifica con nome e cognome.

import type { ClienteSnapshot } from "@/types/fatturazione";

type Dati = Partial<ClienteSnapshot> | null | undefined;

const t = (v: unknown): string => String(v ?? "").trim();

/** Il privato (senza partita IVA, tipo B2C): si fattura a una persona fisica. */
export function ePrivato(s: Dati): boolean {
  return !!s && s.tipo_cliente === "B2C" && !t(s.partita_iva);
}

/** Come si chiama il cliente: ragione sociale, o «Nome Cognome» per un privato. */
export function nomeCliente(s: Dati): string {
  if (!s) return "";
  return t(s.ragione_sociale) || [t(s.nome), t(s.cognome)].filter(Boolean).join(" ");
}

/**
 * Il cliente com'è giusto salvarlo sulla fattura: per un privato con nome e/o
 * cognome la ragione sociale (che liste, PDF, e-mail e anteprime mostrano) è
 * «Nome Cognome», sempre allineata ai due campi.
 */
export function normalizzaCliente(s: ClienteSnapshot): ClienteSnapshot {
  if (!s) return s;
  if (s.tipo_cliente === "B2C" && (t(s.nome) || t(s.cognome))) {
    return { ...s, ragione_sociale: [t(s.nome), t(s.cognome)].filter(Boolean).join(" ") };
  }
  return s;
}

/**
 * Cosa manca per fatturare a questo cliente, in parole («il codice fiscale»,
 * «l'indirizzo»…). Vuoto = si può. Per un privato: nome, cognome, codice
 * fiscale, indirizzo completo. Per un'azienda: solo la ragione sociale (partita
 * IVA e indirizzo li controlla l'invio).
 */
export function datiClienteMancanti(s: Dati): string[] {
  if (!s) return ["il cliente"];
  const manca: string[] = [];
  if (ePrivato(s)) {
    const haRagione = !!t(s.ragione_sociale);
    if (!t(s.nome) && !haRagione) manca.push("il nome");
    if (!t(s.cognome) && !haRagione) manca.push("il cognome");
    if (!t(s.codice_fiscale)) manca.push("il codice fiscale");
    if (!t(s.indirizzo_via)) manca.push("l'indirizzo");
    if (!t(s.indirizzo_comune)) manca.push("il comune");
    if (String(s.indirizzo_nazione || "IT").toUpperCase() === "IT" && !/^\d{5}$/.test(t(s.indirizzo_cap))) manca.push("il CAP (5 cifre)");
  } else if (!nomeCliente(s)) {
    manca.push("la ragione sociale");
  }
  return manca;
}
