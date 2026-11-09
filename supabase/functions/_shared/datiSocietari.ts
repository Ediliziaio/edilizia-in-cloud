/**
 * Dati del registro imprese sulle fatture delle società (art. 2250 c.c.).
 *
 * «Negli atti e nella corrispondenza delle società soggette all'obbligo
 * dell'iscrizione nel registro delle imprese devono essere indicati la sede
 * della società e l'ufficio del registro delle imprese presso il quale questa
 * è iscritta e il numero d'iscrizione», e per S.p.A. e S.r.l. anche il
 * capitale effettivamente versato, l'eventuale unico socio e lo stato di
 * liquidazione. In FatturaPA è il blocco <IscrizioneREA> del cedente, che le
 * specifiche chiedono per le società iscritte.
 *
 * Fino al 24/09/2026 la pagina Impostazioni non aveva dove scrivere numero REA
 * e capitale sociale: il blocco non usciva mai, nemmeno per le S.r.l. Qui la
 * regola sta in un posto solo: la usano il generatore XML, invia-sdi (che non
 * spedisce una fattura di società senza REA) e la pagina Impostazioni.
 *
 * Modulo puro, provato in src/test/logic/datiSocietari.test.ts.
 */

/** Forme giuridiche della pagina Impostazioni, ridotte a sole lettere maiuscole. */
export function formaGiuridica(forma: unknown): string {
  return String(forma ?? "").toUpperCase().replace(/[^A-Z]/g, "");
}

/** Società iscritte al registro delle imprese: il REA va in fattura. */
const SOCIETA = new Set(["SRL", "SRLS", "SPA", "SAPA", "SAS", "SNC", "SS", "COOPERATIVA", "SCARL", "SCRL"]);
/** Società di capitali: anche il capitale versato va in fattura (art. 2250 c. 2). */
const CAPITALI = new Set(["SRL", "SRLS", "SPA", "SAPA"]);

export function eSocieta(forma: unknown): boolean {
  return SOCIETA.has(formaGiuridica(forma));
}

export function eSocietaDiCapitali(forma: unknown): boolean {
  return CAPITALI.has(formaGiuridica(forma));
}

export interface AziendaRea {
  forma_giuridica?: string | null;
  codice_rea?: string | null;
  rea_ufficio?: string | null;
  indirizzo_provincia?: string | null;
  capitale_sociale?: number | string | null;
  socio_unico?: boolean | null;
  stato_liquidazione?: string | null;
}

export interface IscrizioneRea {
  ufficio: string;
  numero: string;
  capitale: number | null;
  socioUnico: "SU" | "SM" | null;
  stato: "LN" | "LS";
}

/**
 * Il blocco IscrizioneREA pronto per l'XML, o null se il numero manca.
 * Chi scrive «PN-123456» nel numero ottiene ufficio PN e numero 123456: il
 * formato in cui il REA compare nelle visure.
 */
export function iscrizioneRea(a: AziendaRea): IscrizioneRea | null {
  let numero = String(a.codice_rea ?? "").trim().toUpperCase();
  if (!numero) return null;
  let ufficio = String(a.rea_ufficio ?? "").trim().toUpperCase();
  const conProvincia = /^([A-Z]{2})[\s./-]+([A-Z0-9]+)$/.exec(numero);
  if (conProvincia) {
    if (!ufficio) ufficio = conProvincia[1];
    numero = conProvincia[2];
  }
  if (!/^[A-Z]{2}$/.test(ufficio)) ufficio = String(a.indirizzo_provincia ?? "").trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(ufficio)) return null;

  const capitale = Number(a.capitale_sociale);
  const conCapitale = Number.isFinite(capitale) && capitale > 0;
  return {
    ufficio,
    numero: numero.slice(0, 20),
    capitale: conCapitale ? Math.round(capitale * 100) / 100 : null,
    // SocioUnico solo per S.p.A. e S.r.l. (e solo se il capitale è indicato).
    socioUnico: conCapitale && eSocietaDiCapitali(a.forma_giuridica) ? (a.socio_unico ? "SU" : "SM") : null,
    stato: a.stato_liquidazione === "LS" ? "LS" : "LN",
  };
}

/** Cosa manca perché le fatture di questa azienda siano in regola con l'art. 2250 c.c. */
export function datiReaMancanti(a: AziendaRea): string[] {
  const mancanti: string[] = [];
  if (!eSocieta(a.forma_giuridica)) return mancanti;
  if (!iscrizioneRea(a)) {
    mancanti.push(
      "Numero REA mancante: per le società va indicato in fattura (art. 2250 c.c.). " +
        "Inseriscilo in Impostazioni → Fatturazione → Dati Fiscali: lo trovi nella visura camerale.",
    );
  }
  const capitale = Number(a.capitale_sociale);
  if (eSocietaDiCapitali(a.forma_giuridica) && !(Number.isFinite(capitale) && capitale > 0)) {
    mancanti.push(
      "Capitale sociale versato mancante: per S.r.l. e S.p.A. va indicato in fattura (art. 2250 c.c.). " +
        "Inseriscilo in Impostazioni → Fatturazione → Dati Fiscali.",
    );
  }
  return mancanti;
}

// ─── I dati dell'azienda nel piè di pagina dei documenti (09/11/2026) ──────

/**
 * Florin: «nel footer i dati dell'azienda: ragione sociale, P.IVA, capitale sociale… solo i dati».
 * Stanno in due tabelle: `companies` (tutte le aziende) e `anagrafica_azienda` (solo chi ha compilato i dati
 * fiscali, ed è l'unica ad avere capitale e ufficio REA). Per i dati legali vale l'anagrafica, come in fattura;
 * quello che manca si salta: nel piè non deve mai comparire un «REA —».
 */
export interface DatiSocietari extends AziendaRea {
  ragioneSociale: string;
  sede?: string | null;
  partitaIva?: string | null;
  codiceFiscale?: string | null;
  pec?: string | null;
}

// deno-lint-ignore no-explicit-any
type Riga = Record<string, any> | null | undefined;
const pulito = (v: unknown): string => String(v ?? "").trim();
const primo = (...v: unknown[]): string => v.map(pulito).find(Boolean) ?? "";

function indirizzoDi(via: unknown, cap: unknown, citta: unknown, provincia: unknown): string {
  const luogo = [pulito(cap), pulito(citta)].filter(Boolean).join(" ");
  const pr = pulito(provincia);
  return [pulito(via), [luogo, pr ? `(${pr})` : ""].filter(Boolean).join(" ")].filter(Boolean).join(", ");
}

/** Le due righe del database, in una: non legge niente, così si prova da sola. */
export function datiSocietariDa(azienda: Riga, anagrafica: Riga): DatiSocietari {
  const c = azienda ?? {};
  const a = anagrafica ?? {};
  const viaAnagrafica = [pulito(a.indirizzo_via), pulito(a.indirizzo_numero_civico)].filter(Boolean).join(" ");
  return {
    ragioneSociale: primo(c.business_name, a.ragione_sociale, c.name),
    sede: indirizzoDi(c.legal_address, c.legal_postal_code, c.legal_city, c.legal_province)
      || indirizzoDi(viaAnagrafica, a.indirizzo_cap, a.indirizzo_comune, a.indirizzo_provincia) || null,
    partitaIva: primo(c.vat_number, a.partita_iva) || null,
    codiceFiscale: primo(c.fiscal_code, a.codice_fiscale) || null,
    pec: primo(a.pec, c.pec) || null,
    forma_giuridica: a.forma_giuridica ?? null,
    codice_rea: primo(a.codice_rea, c.numero_rea) || null,
    rea_ufficio: a.rea_ufficio ?? null,
    indirizzo_provincia: primo(a.indirizzo_provincia, c.legal_province) || null,
    capitale_sociale: a.capitale_sociale ?? null,
    socio_unico: a.socio_unico ?? null,
    stato_liquidazione: a.stato_liquidazione ?? null,
  };
}

const euroPie = (n: number): string =>
  `€ ${n.toLocaleString("it-IT", { minimumFractionDigits: 2, maximumFractionDigits: 2, useGrouping: "always" } as Intl.NumberFormatOptions)}`;

/** Il piè di pagina, in due righe: chi è e dove sta; i numeri che la legge chiede. Vuoto se non si sa niente. */
export function righeSocietarie(d: DatiSocietari | null | undefined): string[] {
  if (!d) return [];
  const chi = [pulito(d.ragioneSociale), d.sede ? `Sede legale ${pulito(d.sede)}` : ""].filter(Boolean).join(" · ");
  const rea = iscrizioneRea(d);
  const numeroRea = rea ? `${rea.ufficio}-${rea.numero}` : pulito(d.codice_rea);
  const capitale = Number(d.capitale_sociale);
  const partitaIva = pulito(d.partitaIva);
  const codiceFiscale = pulito(d.codiceFiscale);
  const legali = [
    partitaIva ? `P.IVA ${partitaIva}` : "",
    codiceFiscale && codiceFiscale !== partitaIva ? `C.F. ${codiceFiscale}` : "",
    numeroRea ? `REA ${numeroRea}` : "",
    Number.isFinite(capitale) && capitale > 0 ? `Capitale sociale versato ${euroPie(capitale)}` : "",
    d.socio_unico && eSocietaDiCapitali(d.forma_giuridica) ? "Socio unico" : "",
    d.stato_liquidazione === "LS" ? "In liquidazione" : "",
    pulito(d.pec) ? `PEC ${pulito(d.pec)}` : "",
  ].filter(Boolean).join(" · ");
  return [chi, legali].filter(Boolean);
}

/**
 * Legge i dati societari di un'azienda. Stessa lettura per il browser e per il server. Se l'anagrafica non si
 * può leggere (chi non è d'ufficio) restano quelli di `companies`; se non si legge niente, null: il documento
 * esce lo stesso.
 */
export async function caricaDatiSocietari(
  // deno-lint-ignore no-explicit-any
  supabase: any,
  companyId: string | null | undefined,
): Promise<DatiSocietari | null> {
  if (!companyId) return null;
  try {
    const [azienda, anagrafica] = await Promise.all([
      supabase.from("companies")
        .select("name,business_name,legal_address,legal_city,legal_postal_code,legal_province,vat_number,fiscal_code,pec,numero_rea")
        .eq("id", companyId).maybeSingle(),
      supabase.from("anagrafica_azienda")
        .select("ragione_sociale,partita_iva,codice_fiscale,forma_giuridica,indirizzo_via,indirizzo_numero_civico,indirizzo_cap,indirizzo_comune,indirizzo_provincia,pec,codice_rea,rea_ufficio,capitale_sociale,socio_unico,stato_liquidazione")
        .eq("company_id", companyId).maybeSingle(),
    ]);
    const c = azienda?.error ? null : azienda?.data;
    const a = anagrafica?.error ? null : anagrafica?.data;
    return c || a ? datiSocietariDa(c, a) : null;
  } catch {
    return null;
  }
}
