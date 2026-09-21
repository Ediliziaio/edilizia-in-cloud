/**
 * Collegare il dominio email di un'azienda senza passare dai pannelli dei
 * provider (20/09/2026).
 *
 * L'azienda scrive il suo dominio in Impostazioni → Dominio email, la
 * piattaforma lo registra sui provider via API, mostra i record DNS e li
 * verifica. Nessuno deve entrare in Elastic Email. Era progettato così, ma:
 *
 *  - le chiavi dei provider transazionali si cercavano sotto nomi mai
 *    impostati, e il ripiego sulla chiave vera usava `??`: getPlatformSetting
 *    restituisce "" e non null, quindi il ripiego non scattava MAI. Ogni
 *    «Aggiungi dominio» si fermava a «Nessun provider transactional
 *    configurato»: in produzione zero aziende con un dominio collegato;
 *  - un dominio ha UN SOLO record SPF. Chi ha già la posta su Google, Aruba o
 *    Register ce l'ha: aggiungerne un secondo rompe l'SPF di tutta la sua
 *    posta. Il record mostrato ora parte da quello che il dominio ha già;
 *  - se l'account Elastic non conosce il dominio (account cambiato, riga
 *    inserita a mano), la verifica lo registra da sola e riprova.
 *
 * Funzioni pure, provate da src/test/logic/dominioEmailAzienda.test.ts.
 */

export const SPF_MARKETING_INCLUDE = "include:_spf.elasticemail.com";
export const SPF_MARKETING_NUOVO = `v=spf1 a mx ${SPF_MARKETING_INCLUDE} ~all`;

export interface ChiaviTransazionaliDati {
  /** email_transactional_api_key_resend */
  resend?: string | null;
  /** email_transactional_api_key_sendgrid */
  sendgrid?: string | null;
  /** email_transactional_api_key: la chiave del provider scelto in email_transactional_provider */
  generica?: string | null;
  /** email_transactional_provider (vuoto = resend, come loadProviderSettings) */
  provider?: string | null;
}

/**
 * La chiave dedicata se c'è, altrimenti quella generica quando il provider
 * transazionale della piattaforma è proprio quello. Mai la chiave di un
 * provider spedita all'API di un altro.
 */
export function chiaviTransazionali(v: ChiaviTransazionaliDati): { resendKey: string; sgKey: string } {
  const pulita = (s: string | null | undefined) => String(s ?? "").trim();
  const provider = pulita(v.provider).toLowerCase() || "resend";
  const generica = pulita(v.generica);
  return {
    resendKey: pulita(v.resend) || (provider === "resend" ? generica : ""),
    sgKey: pulita(v.sendgrid) || (provider === "sendgrid" ? generica : ""),
  };
}

/**
 * Tra i TXT di un dominio (come li dà il DNS: fra virgolette, a volte spezzati
 * in più pezzi) quello SPF, se c'è.
 */
export function trovaSpf(txt: Array<string | null | undefined>): string | null {
  for (const grezzo of txt) {
    const pezzi = String(grezzo ?? "").match(/"((?:[^"\\]|\\.)*)"/g);
    const valore = (pezzi ? pezzi.map((p) => p.slice(1, -1)).join("") : String(grezzo ?? ""))
      .replace(/\s+/g, " ")
      .trim();
    if (/^v=spf1(\s|$)/i.test(valore)) return valore;
  }
  return null;
}

export type StatoSpf = "nuovo" | "unito" | "gia_pronto";

/**
 * Il record SPF da mettere sul dominio: quello che c'è già più la nostra
 * autorizzazione, messa prima della regola finale (~all, -all, redirect=).
 */
export function unisciSpf(esistente: string | null | undefined): { valore: string; stato: StatoSpf } {
  const attuale = String(esistente ?? "").replace(/\s+/g, " ").trim();
  if (!/^v=spf1(\s|$)/i.test(attuale)) return { valore: SPF_MARKETING_NUOVO, stato: "nuovo" };
  if (/_spf\.elasticemail\.com/i.test(attuale)) return { valore: attuale, stato: "gia_pronto" };

  const parti = attuale.split(" ");
  const finale = parti.findIndex((p) => /^[~+?-]?all$/i.test(p) || /^redirect=/i.test(p));
  if (finale === -1) parti.push(SPF_MARKETING_INCLUDE);
  else parti.splice(finale, 0, SPF_MARKETING_INCLUDE);
  return { valore: parti.join(" "), stato: "unito" };
}

/** La riga che spiega all'azienda cosa fare col record SPF. */
export function notaSpf(stato: StatoSpf): string | undefined {
  if (stato === "unito") {
    return "Il tuo dominio ha già un record SPF, e ce ne può essere uno solo: non aggiungerne un secondo. Apri quello che c'è e sostituisci il valore con questo (è il tuo, con in più la nostra autorizzazione).";
  }
  if (stato === "gia_pronto") return "Il record SPF del tuo dominio è già a posto: non serve toccarlo.";
  return undefined;
}

/** Elastic risponde così quando il dominio non è fra quelli del suo account. */
export function dominioSconosciutoAlProvider(errore: string | null | undefined): boolean {
  const e = String(errore ?? "").toLowerCase();
  return /\b(404|400)\b/.test(e) || e.includes("not found") || e.includes("does not exist") || e.includes("not exist");
}

// ── DMARC ───────────────────────────────────────────────────────────────────
// Gmail e Yahoo lo pretendono da chi fa invii di massa. Si mette sul dominio
// principale (vale anche per i sottodomini). Se il dominio ce l'ha già non si
// tocca; se manca, la pagina lo propone fra i record, senza bloccare la
// verifica.

export const DMARC_CONSIGLIATO = "v=DMARC1; p=none;";

/** Secondi livelli che contano come suffisso (il dominio principale ha tre etichette). */
const SUFFISSI_DOPPI = new Set(["co.uk", "org.uk", "com.au", "com.br", "co.nz", "com.mt", "co.za"]);

/** Il dominio principale: mkt.azienda.it → azienda.it. */
export function dominioPrincipale(dominio: string): string {
  const etichette = String(dominio ?? "").trim().toLowerCase().replace(/\.$/, "").split(".").filter(Boolean);
  if (etichette.length <= 2) return etichette.join(".");
  const ultimeDue = etichette.slice(-2).join(".");
  return etichette.slice(SUFFISSI_DOPPI.has(ultimeDue) ? -3 : -2).join(".");
}

/** Tra i TXT di _dmarc.<dominio>, c'è un record DMARC? */
export function haDmarc(txt: Array<string | null | undefined>): boolean {
  return txt.some((t) => /^"?\s*v=DMARC1/i.test(String(t ?? "").trim()));
}

// ── Il dominio come mittente dell'azienda (21/09/2026) ─────────────────────
// resolveSender spedisce dal dominio dell'azienda solo se le preferenze lo
// indicano per quel canale (marketing_domain_id, transactional_domain_id) e se
// il dominio è attivo e verificato PER QUEL canale. La verifica collegava solo
// il marketing, e solo nell'istante in cui il dominio si attivava: il
// transazionale restava sul sottodominio della piattaforma, mentre la pagina
// prometteva «marketing e transazionali» dal dominio. Resend poi diventa verde
// di solito a una verifica successiva, a dominio già attivo: estendere quel
// blocco al transazionale non sarebbe bastato.
//
// Regola: il dominio diventa il mittente di un canale quando diventa
// utilizzabile per quel canale (prima della verifica no, dopo sì) e l'azienda
// non ne ha già scelto uno. Una scelta fatta dopo in Preferenze email non si
// tocca più: non c'è più un passaggio da «no» a «sì».

export type CanaleEmail = "marketing" | "transactional";

export const CANALI_EMAIL: readonly CanaleEmail[] = ["marketing", "transactional"];

/** Le colonne di company_email_domains che dicono se un dominio può spedire. */
export interface StatoDominioEmail {
  id?: string | null;
  is_active?: boolean | null;
  ee_spf_verified?: boolean | null;
  ee_dkim_verified?: boolean | null;
  resend_status?: string | null;
  sg_cname_1_valid?: boolean | null;
  sg_cname_2_valid?: boolean | null;
  sg_cname_3_valid?: boolean | null;
}

/** La colonna di company_email_preferences che sceglie il dominio di un canale. */
export const COLONNA_MITTENTE: Record<CanaleEmail, "marketing_domain_id" | "transactional_domain_id"> = {
  marketing: "marketing_domain_id",
  transactional: "transactional_domain_id",
};

export type PreferenzeMittente = Partial<Record<"marketing_domain_id" | "transactional_domain_id", string | null>>;

/**
 * Verificato per quel canale, con le regole di resolveSender: marketing = SPF
 * e DKIM di Elastic; transazionale = Resend verificato oppure i tre CNAME di
 * SendGrid.
 */
export function verificatoPer(dominio: StatoDominioEmail | null | undefined, canale: CanaleEmail): boolean {
  if (!dominio) return false;
  if (canale === "marketing") return dominio.ee_spf_verified === true && dominio.ee_dkim_verified === true;
  return dominio.resend_status === "verified" ||
    (dominio.sg_cname_1_valid === true && dominio.sg_cname_2_valid === true && dominio.sg_cname_3_valid === true);
}

/** Può spedire su quel canale: resolveSender vuole il dominio attivo E verificato. */
export function utilizzabilePer(dominio: StatoDominioEmail | null | undefined, canale: CanaleEmail): boolean {
  return dominio?.is_active === true && verificatoPer(dominio, canale);
}

/**
 * I canali di cui il dominio diventa il mittente con questa verifica: quelli
 * per cui è diventato utilizzabile adesso e per cui l'azienda non ha ancora
 * scelto un dominio. `prima` è la riga prima della verifica, `dopo` quella
 * aggiornata (ed eventualmente attivata).
 */
export function canaliDaCollegare(
  prima: StatoDominioEmail | null | undefined,
  dopo: StatoDominioEmail | null | undefined,
  preferenze: PreferenzeMittente | null | undefined,
): CanaleEmail[] {
  return CANALI_EMAIL.filter((canale) =>
    !utilizzabilePer(prima, canale) &&
    utilizzabilePer(dopo, canale) &&
    !preferenze?.[COLONNA_MITTENTE[canale]]
  );
}

// ── Da dove parte davvero ogni canale (pagina «Dominio email») ──────────────
// La pagina mostrava `from_email@dominio` (valore mai scritto da nessuno:
// resta il predefinito "noreply") e diceva «marketing e transazionali» anche
// col transazionale sulla piattaforma. Ora il mittente di ogni canale lo
// calcola il server con resolveSender, come per le email vere, e qui si
// decide solo come spiegarlo.

/** Il mittente che resolveSender sceglie per un canale, come lo restituisce get_status. */
export interface MittenteDelCanale {
  from: string;
  fromEmail: string;
  usingCustomDomain: boolean;
  customDomainId?: string | null;
  domain: string;
}

/**
 * Da dove esce un canale rispetto al dominio mostrato:
 * - "dal_dominio": da questo dominio;
 * - "altro_dominio": da un altro dominio dell'azienda, scelto in Preferenze email;
 * - "canale_non_verificato": dalla piattaforma, finché il canale non è verificato;
 * - "dominio_non_attivo": dalla piattaforma, finché il dominio non si attiva
 *   (si attiva col marketing verificato);
 * - "non_scelto": dalla piattaforma, anche se il dominio potrebbe: l'azienda
 *   non l'ha scelto (o l'ha tolto) in Preferenze email.
 */
export type ProvenienzaCanale =
  | "dal_dominio"
  | "altro_dominio"
  | "canale_non_verificato"
  | "dominio_non_attivo"
  | "non_scelto";

export function provenienzaCanale(
  dominio: StatoDominioEmail | null | undefined,
  canale: CanaleEmail,
  mittente: MittenteDelCanale | null | undefined,
): ProvenienzaCanale {
  if (mittente?.usingCustomDomain) {
    return dominio?.id && mittente.customDomainId === dominio.id ? "dal_dominio" : "altro_dominio";
  }
  if (!verificatoPer(dominio, canale)) return "canale_non_verificato";
  if (dominio?.is_active !== true) return "dominio_non_attivo";
  return "non_scelto";
}

/** La parte prima della @ dei mittenti dell'azienda (sender_prefix delle preferenze). */
export function prefissoMittente(mittente: MittenteDelCanale | null | undefined): string {
  const email = String(mittente?.fromEmail ?? "");
  const at = email.lastIndexOf("@");
  return at > 0 ? email.slice(0, at) : "";
}
