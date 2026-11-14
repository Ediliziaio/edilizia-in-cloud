/**
 * Il cliente del contratto letto con l'AI, cercato nell'anagrafica prima di proporne uno nuovo (14/11/2026).
 *
 * Prima si confrontava solo il nome scritto identico (o invertito): bastava che l'AI leggesse «Famiglia DEMO 2026 45,
 * Sesto San Giovanni», «Sig. Rossi Mario» o il nome in altro ordine per aprire «Nuovo cliente» su un cliente che
 * c'era già. Ora, nell'ordine di fiducia:
 *  1. codice fiscale o partita IVA uguali;
 *  2. stessa email (non il segnaposto di chi l'email non l'ha data);
 *  3. stesso nome: le stesse parole in qualsiasi ordine, senza titoli («sig.», «dott.»…) e senza quello che viene
 *     dopo la prima virgola (di solito la città o l'indirizzo).
 * Un passo che trova più di un cliente non sceglie: si sceglie dall'elenco.
 */
export interface ClienteAnagrafica {
  id: string;
  first_name: string | null;
  last_name: string | null;
  email?: string | null;
  business_name?: string | null;
  fiscal_code?: string | null;
  vat_number?: string | null;
}

export interface ClienteDelContratto {
  nome_completo: string;
  email?: string | null;
  codice_fiscale?: string | null;
  partita_iva?: string | null;
}

export type EsitoAggancio =
  | { esito: "trovato"; cliente: ClienteAnagrafica; per: "codice" | "email" | "nome" }
  | { esito: "ambiguo"; candidati: ClienteAnagrafica[]; per: "codice" | "email" | "nome" }
  | { esito: "nessuno" };

const SEGNAPOSTO_EMAIL = "@no-email.ediliziaincloud.local";
const TITOLI = new Set(["sig", "sigra", "sigg", "signor", "signora", "signore", "dott", "dottssa", "dottor", "dottoressa", "ing", "arch", "geom", "avv", "rag", "prof", "spett", "spettle"]);

export function codiceNormalizzato(v: string | null | undefined): string {
  const c = (v ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  return c.startsWith("IT") && /^IT\d{11}$/.test(c) ? c.slice(2) : c;
}

export function paroleDelNome(v: string | null | undefined): string {
  const primaDellaVirgola = (v ?? "").split(",")[0];
  return primaDellaVirgola
    .toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/\./g, "").replace(/[^a-z0-9 ]+/g, " ")
    .split(/\s+/).filter((p) => p && !TITOLI.has(p))
    .sort().join(" ");
}

const emailValida = (v: string | null | undefined) => {
  const e = (v ?? "").trim().toLowerCase();
  return e.includes("@") && !e.endsWith(SEGNAPOSTO_EMAIL) ? e : "";
};

function esito(candidati: ClienteAnagrafica[], per: "codice" | "email" | "nome"): EsitoAggancio | null {
  const unici = [...new Map(candidati.map((c) => [c.id, c])).values()];
  if (unici.length === 1) return { esito: "trovato", cliente: unici[0], per };
  if (unici.length > 1) return { esito: "ambiguo", candidati: unici, per };
  return null;
}

export function trovaClienteDaContratto(dal: ClienteDelContratto, clienti: readonly ClienteAnagrafica[]): EsitoAggancio {
  const codici = [dal.codice_fiscale, dal.partita_iva].map(codiceNormalizzato).filter((c) => c.length >= 11);
  if (codici.length) {
    const r = esito(clienti.filter((c) => codici.includes(codiceNormalizzato(c.fiscal_code)) || codici.includes(codiceNormalizzato(c.vat_number))), "codice");
    if (r) return r;
  }
  const email = emailValida(dal.email);
  if (email) {
    const r = esito(clienti.filter((c) => emailValida(c.email) === email), "email");
    if (r) return r;
  }
  const nome = paroleDelNome(dal.nome_completo);
  if (nome) {
    const r = esito(clienti.filter((c) =>
      paroleDelNome(`${c.first_name ?? ""} ${c.last_name ?? ""}`) === nome || (!!c.business_name && paroleDelNome(c.business_name) === nome)), "nome");
    if (r) return r;
  }
  return { esito: "nessuno" };
}

/**
 * Dove sono i lavori secondo il contratto (14/11/2026): l'indirizzo del cantiere, se no quello scritto accanto al
 * cliente. In «Nuova commessa» vale prima dell'indirizzo in anagrafica, anche se il cliente si aggancia dopo.
 */
export function indirizzoCantiereDalContratto(ex: { indirizzo_cantiere?: string | null; cliente?: { indirizzo?: string | null } | null }): string | null {
  const v = (ex.indirizzo_cantiere ?? "").trim() || (ex.cliente?.indirizzo ?? "").trim();
  return v || null;
}
