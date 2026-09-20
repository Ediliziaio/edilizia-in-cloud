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
