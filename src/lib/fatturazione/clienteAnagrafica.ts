// Il cliente nuovo creato dall'editor del documento (01/10/2026).
//
// Prima «Crea e seleziona» metteva i dati solo sul documento: il cliente non entrava
// in anagrafica, e alla fattura dopo bisognava riscriverlo da capo. Ora si controllano
// i dati come li vuole lo SDI e si salva il cliente in anagrafica, così lo si ritrova.

import type { ClienteSnapshot } from "@/types/fatturazione";
import { validaCodiceFiscale, validaPartitaIva } from "@/lib/fatturazione/validazioniAnagrafiche";

export interface NuovoClienteForm {
  tipo: "B2C" | "B2B" | "PA";
  nome?: string;
  cognome?: string;
  ragioneSociale?: string;
  partitaIva?: string;
  codiceFiscale?: string;
  codiceSdi?: string;
  pec?: string;
  indirizzo_via?: string;
  indirizzo_cap?: string;
  indirizzo_comune?: string;
  indirizzo_provincia?: string;
  indirizzo_nazione?: string;
}

const t = (v: unknown): string => String(v ?? "").trim();
const vuotoNull = (v: unknown): string | null => t(v) || null;
const senzaSpazi = (v: unknown): string => t(v).replace(/\s+/g, "");

/** I dati del form, puliti: niente spazi in P.IVA, CF, codice destinatario e PEC; CF e codici maiuscoli. */
export function pulisciNuovoCliente(f: NuovoClienteForm): NuovoClienteForm {
  return {
    ...f,
    nome: t(f.nome),
    cognome: t(f.cognome),
    ragioneSociale: t(f.ragioneSociale),
    partitaIva: senzaSpazi(f.partitaIva),
    codiceFiscale: senzaSpazi(f.codiceFiscale).toUpperCase(),
    codiceSdi: senzaSpazi(f.codiceSdi).toUpperCase(),
    pec: senzaSpazi(f.pec).toLowerCase(),
    indirizzo_via: t(f.indirizzo_via),
    indirizzo_cap: senzaSpazi(f.indirizzo_cap),
    indirizzo_comune: t(f.indirizzo_comune),
    indirizzo_provincia: senzaSpazi(f.indirizzo_provincia).toUpperCase(),
    indirizzo_nazione: senzaSpazi(f.indirizzo_nazione).toUpperCase() || "IT",
  };
}

/** Cosa manca o è sbagliato, in parole. Vuoto = il cliente si può creare. */
export function problemiNuovoCliente(form: NuovoClienteForm): string[] {
  const f = pulisciNuovoCliente(form);
  const p: string[] = [];
  const italia = f.indirizzo_nazione === "IT";

  if (f.tipo === "B2C") {
    if (!f.nome) p.push("il nome");
    if (!f.cognome) p.push("il cognome");
    if (!f.codiceFiscale) p.push("il codice fiscale");
  } else {
    if (!f.ragioneSociale) p.push(f.tipo === "PA" ? "la denominazione dell'ente" : "la ragione sociale");
    if (f.tipo === "B2B" && !f.partitaIva && !f.codiceFiscale) p.push("la partita IVA o il codice fiscale");
    if (f.tipo === "PA" && f.codiceSdi?.length !== 6) p.push("il codice univoco ufficio (6 caratteri)");
  }
  if (f.partitaIva) {
    const v = validaPartitaIva(f.partitaIva);
    if (!v.valida) p.push(`una partita IVA valida (${v.errore ?? "non valida"})`);
  }
  if (f.codiceFiscale) {
    const v = validaCodiceFiscale(f.codiceFiscale);
    if (!v.valida) p.push(`un codice fiscale valido (${v.errore ?? "non valido"})`);
  }
  if (f.tipo !== "PA" && f.codiceSdi && f.codiceSdi.length !== 7) p.push("il codice destinatario di 7 caratteri");
  if (!f.indirizzo_via) p.push("l'indirizzo");
  if (!f.indirizzo_comune) p.push("il comune");
  if (italia && !/^\d{5}$/.test(f.indirizzo_cap ?? "")) p.push("il CAP (5 cifre)");
  return p;
}

export function snapshotDaForm(form: NuovoClienteForm): ClienteSnapshot {
  const f = pulisciNuovoCliente(form);
  const privato = f.tipo === "B2C";
  return {
    ragione_sociale: privato ? [f.nome, f.cognome].filter(Boolean).join(" ") : f.ragioneSociale ?? "",
    ...(privato ? { nome: f.nome, cognome: f.cognome } : {}),
    partita_iva: f.partitaIva || undefined,
    codice_fiscale: f.codiceFiscale || undefined,
    codice_sdi: f.codiceSdi || undefined,
    pec: f.pec || undefined,
    indirizzo_via: f.indirizzo_via || undefined,
    indirizzo_cap: f.indirizzo_cap || undefined,
    indirizzo_comune: f.indirizzo_comune || undefined,
    indirizzo_provincia: f.indirizzo_provincia || undefined,
    indirizzo_nazione: f.indirizzo_nazione || "IT",
    tipo_cliente: f.tipo,
  };
}

const TIPO_SOGGETTO: Record<string, string> = { B2C: "fisico", B2B: "giuridico", PA: "pa", Estero: "estero" };

/** La riga di anagrafiche_native per questo cliente (senza company_id e id). */
export function payloadAnagrafica(s: ClienteSnapshot): Record<string, unknown> {
  const privato = s.tipo_cliente === "B2C" && !t(s.partita_iva);
  return {
    tipo: "cliente",
    tipo_cliente: s.tipo_cliente,
    tipo_soggetto: TIPO_SOGGETTO[s.tipo_cliente] ?? "giuridico",
    ragione_sociale: vuotoNull(s.ragione_sociale),
    nome: privato ? vuotoNull(s.nome) : null,
    cognome: privato ? vuotoNull(s.cognome) : null,
    partita_iva: vuotoNull(s.partita_iva),
    codice_fiscale: vuotoNull(s.codice_fiscale),
    codice_sdi: vuotoNull(s.codice_sdi),
    pec: vuotoNull(s.pec),
    indirizzo_via: vuotoNull(s.indirizzo_via),
    indirizzo_cap: vuotoNull(s.indirizzo_cap),
    indirizzo_comune: vuotoNull(s.indirizzo_comune),
    indirizzo_provincia: vuotoNull(s.indirizzo_provincia),
    indirizzo_nazione: vuotoNull(s.indirizzo_nazione) ?? "IT",
    attivo: true,
  };
}
