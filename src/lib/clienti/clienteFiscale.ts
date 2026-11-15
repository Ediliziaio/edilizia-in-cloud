// Il cliente come lo vede la fattura: Privato, Azienda o Pubblica Amministrazione
// (lotto 1 del piano «Clienti privati, aziende e PA», 15/11/2026).
//
// La fonte del tipo è anagrafiche_native.tipo_cliente (B2C, B2B, PA, Estero);
// tipo_soggetto lo segue da un trigger. Qui: etichette, campi per tipo, controlli
// e il pacchetto per salva_anagrafica_cliente().

import { validaCodiceFiscale, validaPartitaIva } from "@/lib/fatturazione/validazioniAnagrafiche";

export type TipoClienteFiscale = "B2C" | "B2B" | "PA" | "Estero";

export const ETICHETTA_TIPO_CLIENTE: Record<TipoClienteFiscale, string> = {
  B2C: "Privato",
  B2B: "Azienda",
  PA: "Pubblica Amministrazione",
  Estero: "Estero",
};

/** I tre tipi che si scelgono creando un cliente italiano. */
export const TIPI_SCEGLIBILI: TipoClienteFiscale[] = ["B2C", "B2B", "PA"];

export function etichettaTipoCliente(tipo: string | null | undefined): string {
  return ETICHETTA_TIPO_CLIENTE[(tipo ?? "") as TipoClienteFiscale] ?? "—";
}

/** Split payment sul cliente: sì, no, oppure come dice l'impostazione dell'azienda (null). */
export type SceltaSplit = "si" | "no" | "azienda";
export const splitDaScelta = (s: SceltaSplit): boolean | null => (s === "si" ? true : s === "no" ? false : null);
export const sceltaDaSplit = (v: boolean | null | undefined): SceltaSplit => (v === true ? "si" : v === false ? "no" : "azienda");

export interface ClienteFiscaleForm {
  tipo: TipoClienteFiscale;
  nome?: string;
  cognome?: string;
  /** Ragione sociale (azienda) o denominazione dell'ente (PA). */
  ragioneSociale?: string;
  partitaIva?: string;
  codiceFiscale?: string;
  /** Codice destinatario (azienda, 7 caratteri). Per la PA si usano gli uffici. */
  codiceDestinatario?: string;
  pec?: string;
  email?: string;
  emailAmministrazione?: string;
  telefono?: string;
  referenteAmministrativo?: string;
  indirizzoVia?: string;
  indirizzoCap?: string;
  indirizzoComune?: string;
  indirizzoProvincia?: string;
  indirizzoNazione?: string;
  /** PA: codice dell'ente in IPA (es. c_h501). */
  codiceIpa?: string;
  /** PA: split payment. */
  split?: SceltaSplit;
  /** PA, solo alla creazione: il primo ufficio. */
  ufficioCodice?: string;
  ufficioDescrizione?: string;
}

const t = (v: unknown): string => String(v ?? "").trim();
const senzaSpazi = (v: unknown): string => t(v).replace(/\s+/g, "");

export function pulisciClienteFiscale(f: ClienteFiscaleForm): ClienteFiscaleForm {
  return {
    ...f,
    nome: t(f.nome),
    cognome: t(f.cognome),
    ragioneSociale: t(f.ragioneSociale),
    partitaIva: senzaSpazi(f.partitaIva).toUpperCase().replace(/^IT(?=\d{11}$)/, ""),
    codiceFiscale: senzaSpazi(f.codiceFiscale).toUpperCase(),
    codiceDestinatario: senzaSpazi(f.codiceDestinatario).toUpperCase(),
    pec: senzaSpazi(f.pec).toLowerCase(),
    email: senzaSpazi(f.email).toLowerCase(),
    emailAmministrazione: senzaSpazi(f.emailAmministrazione).toLowerCase(),
    telefono: t(f.telefono),
    referenteAmministrativo: t(f.referenteAmministrativo),
    indirizzoVia: t(f.indirizzoVia),
    indirizzoCap: senzaSpazi(f.indirizzoCap),
    indirizzoComune: t(f.indirizzoComune),
    indirizzoProvincia: senzaSpazi(f.indirizzoProvincia).toUpperCase(),
    indirizzoNazione: senzaSpazi(f.indirizzoNazione).toUpperCase() || "IT",
    codiceIpa: senzaSpazi(f.codiceIpa),
    split: f.split ?? "azienda",
    ufficioCodice: senzaSpazi(f.ufficioCodice).toUpperCase(),
    ufficioDescrizione: t(f.ufficioDescrizione),
  };
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Codice Univoco Ufficio della PA: 6 caratteri, lettere maiuscole o cifre. */
export function erroreCodiceUfficio(raw: string | null | undefined): string | null {
  const c = senzaSpazi(raw).toUpperCase();
  if (!c) return "Il codice univoco ufficio è obbligatorio";
  if (!/^[A-Z0-9]{6}$/.test(c)) return "Il codice univoco ufficio ha 6 caratteri, lettere o cifre";
  if (c === "000000") return "000000 non è un ufficio: serve il codice dell'ufficio che riceve la fattura";
  return null;
}

/**
 * Cosa manca o è sbagliato, campo per campo. Vuoto = si può salvare.
 * `perFattura` chiede anche l'indirizzo completo (serve all'XML); alla creazione
 * del cliente basta l'identità.
 */
export function problemiClienteFiscale(form: ClienteFiscaleForm, perFattura = false): Record<string, string> {
  const f = pulisciClienteFiscale(form);
  const e: Record<string, string> = {};
  const italia = f.indirizzoNazione === "IT";

  if (f.tipo === "B2C") {
    if (!f.nome) e.nome = "Il nome è obbligatorio";
    if (!f.cognome) e.cognome = "Il cognome è obbligatorio";
    if (perFattura && italia && !f.codiceFiscale) e.codiceFiscale = "Il codice fiscale è obbligatorio per fatturare";
  } else if (f.tipo === "PA") {
    if (!f.ragioneSociale) e.ragioneSociale = "La denominazione dell'ente è obbligatoria";
    if (!f.codiceFiscale) e.codiceFiscale = "Il codice fiscale dell'ente è obbligatorio";
  } else {
    if (!f.ragioneSociale) e.ragioneSociale = "La ragione sociale è obbligatoria";
    if (perFattura && italia && !f.partitaIva && !f.codiceFiscale) e.partitaIva = "Serve la partita IVA (o il codice fiscale)";
  }

  if (f.partitaIva) {
    const v = validaPartitaIva(f.partitaIva);
    if (!v.valida) e.partitaIva = v.errore ?? "Partita IVA non valida";
  }
  if (f.codiceFiscale && !e.codiceFiscale) {
    const v = validaCodiceFiscale(f.codiceFiscale);
    if (!v.valida) e.codiceFiscale = v.errore ?? "Codice fiscale non valido";
    else if (f.tipo === "PA" && !/^\d{11}$/.test(f.codiceFiscale)) e.codiceFiscale = "Il codice fiscale di un ente ha 11 cifre";
  }
  if (f.tipo === "B2B" && f.codiceDestinatario && !/^[A-Z0-9]{7}$/.test(f.codiceDestinatario)) {
    e.codiceDestinatario = "Il codice destinatario ha 7 caratteri";
  }
  if (f.pec && !EMAIL.test(f.pec)) e.pec = "PEC non valida";
  if (f.email && !EMAIL.test(f.email)) e.email = "Email non valida";
  if (f.emailAmministrazione && !EMAIL.test(f.emailAmministrazione)) e.emailAmministrazione = "Email non valida";
  if (f.tipo === "PA" && f.codiceIpa && !/^[A-Za-z0-9_]{2,20}$/.test(f.codiceIpa)) {
    e.codiceIpa = "Il codice IPA dell'ente è breve, lettere, cifre e _ (es. c_h501)";
  }
  if (f.tipo === "PA" && f.ufficioCodice) {
    const u = erroreCodiceUfficio(f.ufficioCodice);
    if (u) e.ufficioCodice = u;
  }
  if (perFattura) {
    if (!f.indirizzoVia) e.indirizzoVia = "L'indirizzo è obbligatorio per fatturare";
    if (!f.indirizzoComune) e.indirizzoComune = "Il comune è obbligatorio per fatturare";
    if (italia && !/^\d{5}$/.test(f.indirizzoCap ?? "")) e.indirizzoCap = "Il CAP ha 5 cifre";
  } else if (italia && f.indirizzoCap && !/^\d{5}$/.test(f.indirizzoCap)) {
    e.indirizzoCap = "Il CAP ha 5 cifre";
  }
  return e;
}

/**
 * Il pacchetto per salva_anagrafica_cliente(): solo i campi che il tipo usa.
 * I campi che il tipo non usa si svuotano (un privato diventato azienda non si
 * porta dietro nome e cognome come intestatario).
 */
export function payloadSalvaAnagrafica(form: ClienteFiscaleForm, opzioni: { conUfficio?: boolean } = {}): Record<string, unknown> {
  const f = pulisciClienteFiscale(form);
  const privato = f.tipo === "B2C";
  const pa = f.tipo === "PA";
  const p: Record<string, unknown> = {
    tipo_cliente: f.tipo,
    ragione_sociale: privato ? [f.nome, f.cognome].filter(Boolean).join(" ") : f.ragioneSociale,
    nome: privato ? f.nome : "",
    cognome: privato ? f.cognome : "",
    partita_iva: privato ? "" : f.partitaIva,
    codice_fiscale: f.codiceFiscale,
    pec: f.pec,
    email: f.email,
    email_fatture: privato ? "" : f.emailAmministrazione,
    telefono: f.telefono,
    referente_amministrativo: privato ? "" : f.referenteAmministrativo,
    indirizzo_via: f.indirizzoVia,
    indirizzo_cap: f.indirizzoCap,
    indirizzo_comune: f.indirizzoComune,
    indirizzo_provincia: f.indirizzoProvincia,
    indirizzo_nazione: f.indirizzoNazione,
    codice_ipa: pa ? f.codiceIpa : "",
    split_payment: pa ? splitDaScelta(f.split ?? "azienda") : null,
  };
  // Per la PA il codice destinatario viene dall'ufficio predefinito: non si scrive qui.
  if (!pa) p.codice_sdi = privato ? "" : f.codiceDestinatario;
  if (pa && opzioni.conUfficio && f.ufficioCodice) {
    p.ufficio_codice = f.ufficioCodice;
    p.ufficio_descrizione = f.ufficioDescrizione || "Ufficio di fatturazione";
  }
  return p;
}

/** Riga di anagrafiche_native → form. */
export function formDaAnagrafica(a: Record<string, unknown> | null | undefined): ClienteFiscaleForm {
  const s = (k: string) => (a?.[k] == null ? "" : String(a[k]));
  const tipo = (["B2C", "B2B", "PA", "Estero"].includes(s("tipo_cliente")) ? s("tipo_cliente") : "B2B") as TipoClienteFiscale;
  return {
    tipo,
    nome: s("nome"),
    cognome: s("cognome"),
    ragioneSociale: s("ragione_sociale"),
    partitaIva: s("partita_iva"),
    codiceFiscale: s("codice_fiscale"),
    codiceDestinatario: tipo === "PA" ? "" : s("codice_sdi"),
    pec: s("pec"),
    email: s("email"),
    emailAmministrazione: s("email_fatture"),
    telefono: s("telefono"),
    referenteAmministrativo: s("referente_amministrativo"),
    indirizzoVia: s("indirizzo_via"),
    indirizzoCap: s("indirizzo_cap"),
    indirizzoComune: s("indirizzo_comune"),
    indirizzoProvincia: s("indirizzo_provincia"),
    indirizzoNazione: s("indirizzo_nazione") || "IT",
    codiceIpa: s("codice_ipa"),
    split: sceltaDaSplit(a?.split_payment as boolean | null | undefined),
  };
}

/** I campi del profilo (profiles) che seguono il tipo scelto. */
export function campiProfiloDaForm(form: ClienteFiscaleForm): {
  is_business: boolean;
  business_name: string | null;
  vat_number: string | null;
  fiscal_code: string | null;
} {
  const f = pulisciClienteFiscale(form);
  const privato = f.tipo === "B2C";
  return {
    is_business: !privato,
    business_name: privato ? null : f.ragioneSociale || null,
    vat_number: privato ? null : f.partitaIva || null,
    fiscal_code: f.codiceFiscale || null,
  };
}

export interface ClienteBase {
  id: string;
  first_name: string | null;
  last_name: string | null;
  email?: string | null;
  phone?: string | null;
  address?: string | null;
  city?: string | null;
  postal_code?: string | null;
  province?: string | null;
  country?: string | null;
  fiscal_code: string | null;
  vat_number: string | null;
  is_business?: boolean | null;
  business_name?: string | null;
}

/** Il form di partenza per un cliente che non ha ancora l'anagrafica fiscale. */
export function formDaProfilo(c: ClienteBase): ClienteFiscaleForm {
  return {
    tipo: c.is_business ? "B2B" : "B2C",
    nome: c.first_name ?? "",
    cognome: c.last_name ?? "",
    ragioneSociale: c.is_business ? c.business_name ?? "" : "",
    partitaIva: c.vat_number ?? "",
    codiceFiscale: c.fiscal_code ?? "",
    email: c.email && !c.email.endsWith("@no-email.ediliziaincloud.local") ? c.email : "",
    telefono: c.phone ?? "",
    indirizzoVia: c.address ?? "",
    indirizzoCap: c.postal_code ?? "",
    indirizzoComune: c.city ?? "",
    indirizzoProvincia: c.province ?? "",
    indirizzoNazione: c.country && c.country.length === 2 ? c.country : "IT",
    split: "azienda",
  };
}
