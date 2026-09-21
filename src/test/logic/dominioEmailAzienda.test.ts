/**
 * Collegare il dominio email di un'azienda dall'app, senza entrare nei pannelli
 * dei provider (20/09/2026). In produzione nessuna azienda ci era mai riuscita:
 * «Aggiungi dominio» si fermava a «Nessun provider transactional configurato».
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  canaliDaCollegare,
  CANALI_EMAIL,
  chiaviTransazionali,
  dominioPrincipale,
  dominioSconosciutoAlProvider,
  haDmarc,
  type MittenteDelCanale,
  notaSpf,
  type PreferenzeMittente,
  prefissoMittente,
  provenienzaCanale,
  SPF_MARKETING_NUOVO,
  type StatoDominioEmail,
  trovaSpf,
  unisciSpf,
  utilizzabilePer,
  verificatoPer,
} from "../../../supabase/functions/_shared/dominioEmailAzienda";
import { dominiAmmessi } from "../../../supabase/functions/_shared/mittenteAutomazione";

const ROOT = join(__dirname, "../../..");
const leggi = (p: string) => readFileSync(join(ROOT, p), "utf8");

describe("chiaviTransazionali", () => {
  it("la piattaforma ha solo la chiave generica e il provider è Resend: è la chiave di Resend", () => {
    // getPlatformSetting restituisce "" per le chiavi che non esistono: col
    // vecchio `??` il ripiego non scattava mai.
    expect(chiaviTransazionali({ resend: "", sendgrid: "", generica: "re_123", provider: "resend" }))
      .toEqual({ resendKey: "re_123", sgKey: "" });
  });

  it("provider non impostato = Resend, come nel resto della piattaforma", () => {
    expect(chiaviTransazionali({ generica: "re_123" })).toEqual({ resendKey: "re_123", sgKey: "" });
  });

  it("la chiave di un provider non finisce mai all'API di un altro", () => {
    expect(chiaviTransazionali({ generica: "SG.abc", provider: "sendgrid" })).toEqual({ resendKey: "", sgKey: "SG.abc" });
    expect(chiaviTransazionali({ generica: "chiave-mailgun", provider: "mailgun" })).toEqual({ resendKey: "", sgKey: "" });
  });

  it("le chiavi dedicate vincono su quella generica", () => {
    expect(chiaviTransazionali({ resend: " re_dedicata ", sendgrid: "SG.dedicata", generica: "re_generica", provider: "resend" }))
      .toEqual({ resendKey: "re_dedicata", sgKey: "SG.dedicata" });
  });
});

describe("trovaSpf", () => {
  it("riconosce l'SPF fra gli altri TXT, anche fra virgolette e spezzato in pezzi", () => {
    expect(trovaSpf(['"google-site-verification=abc"', '"v=spf1 include:_spf.google.com ~all"']))
      .toBe("v=spf1 include:_spf.google.com ~all");
    expect(trovaSpf(['"v=spf1 include:spf.webapps.net " "include:_spf.google.com ~all"']))
      .toBe("v=spf1 include:spf.webapps.net include:_spf.google.com ~all");
  });

  it("niente SPF, niente record", () => {
    expect(trovaSpf(['"google-site-verification=abc"', null, ""])).toBeNull();
    expect(trovaSpf(['"v=spf10 finto"'])).toBeNull();
  });
});

describe("unisciSpf", () => {
  it("dominio senza SPF: il record standard", () => {
    expect(unisciSpf(null)).toEqual({ valore: SPF_MARKETING_NUOVO, stato: "nuovo" });
    expect(unisciSpf("google-site-verification=abc")).toEqual({ valore: SPF_MARKETING_NUOVO, stato: "nuovo" });
  });

  it("dominio con la posta su Google: l'autorizzazione entra prima della regola finale", () => {
    expect(unisciSpf("v=spf1 include:_spf.google.com ~all")).toEqual({
      valore: "v=spf1 include:_spf.google.com include:_spf.elasticemail.com ~all",
      stato: "unito",
    });
    expect(unisciSpf("v=spf1 a mx ip4:1.2.3.4 -all").valore)
      .toBe("v=spf1 a mx ip4:1.2.3.4 include:_spf.elasticemail.com -all");
  });

  it("con redirect= o senza regola finale resta un record valido", () => {
    expect(unisciSpf("v=spf1 redirect=_spf.aruba.it").valore)
      .toBe("v=spf1 include:_spf.elasticemail.com redirect=_spf.aruba.it");
    expect(unisciSpf("v=spf1 include:spf.webapps.net").valore)
      .toBe("v=spf1 include:spf.webapps.net include:_spf.elasticemail.com");
  });

  it("se l'autorizzazione c'è già non si tocca niente", () => {
    const pronto = "v=spf1 include:_spf.google.com include:_spf.elasticemail.com ~all";
    expect(unisciSpf(pronto)).toEqual({ valore: pronto, stato: "gia_pronto" });
  });

  it("il record unito resta UNO: un solo v=spf1", () => {
    const { valore } = unisciSpf("v=spf1 include:_spf.google.com ~all");
    expect(valore.match(/v=spf1/g)).toHaveLength(1);
  });

  it("la nota dice all'azienda cosa fare", () => {
    expect(notaSpf("unito")).toContain("non aggiungerne un secondo");
    expect(notaSpf("gia_pronto")).toContain("già a posto");
    expect(notaSpf("nuovo")).toBeUndefined();
  });
});

describe("dominioSconosciutoAlProvider", () => {
  it("dominio non registrato sull'account: si registra e si riprova", () => {
    expect(dominioSconosciutoAlProvider('Elastic Email verify 404: {"Error":"Domain not found"}')).toBe(true);
    expect(dominioSconosciutoAlProvider("Elastic Email verify 400: domain does not exist")).toBe(true);
  });

  it("chiave sbagliata o provider giù non sono «dominio sconosciuto»", () => {
    expect(dominioSconosciutoAlProvider("Elastic Email verify 401: Unauthorized")).toBe(false);
    expect(dominioSconosciutoAlProvider("Elastic Email verify 503: Service Unavailable")).toBe(false);
    expect(dominioSconosciutoAlProvider(null)).toBe(false);
  });
});

describe("DMARC", () => {
  it("il dominio principale di un sottodominio", () => {
    expect(dominioPrincipale("mkt.marketingedile.com")).toBe("marketingedile.com");
    expect(dominioPrincipale("bemade.it")).toBe("bemade.it");
    expect(dominioPrincipale("News.Mail.Azienda.CO.UK.")).toBe("azienda.co.uk");
  });

  it("riconosce il record fra i TXT", () => {
    expect(haDmarc(['"v=DMARC1; p=none; rua=mailto:dmarc@ediliziaincloud.com"'])).toBe(true);
    expect(haDmarc(['"google-site-verification=abc"'])).toBe(false);
    expect(haDmarc([])).toBe(false);
  });

  it("la funzione lo propone solo quando sa che manca", () => {
    const funzione = leggi("supabase/functions/manage-email-domain/index.ts");
    expect(funzione).toContain("if (spf?.dmarc === false) {");
    expect(funzione).toContain("host: `_dmarc.${dominioPrincipale(domain)}`,");
  });
});

describe("manage-email-domain usa le regole", () => {
  const funzione = leggi("supabase/functions/manage-email-domain/index.ts");

  it("le chiavi si leggono in un posto solo, senza il ripiego `??` che non scattava", () => {
    expect(funzione).toContain("async function leggiChiaviProvider()");
    expect(funzione.match(/await leggiChiaviProvider\(\)/g)).toHaveLength(3); // add, verify, remove
    expect(funzione).not.toContain('.then((v) => v ?? getPlatformSetting(');
  });

  it("il transazionale mancante non blocca più la registrazione del dominio", () => {
    expect(funzione).not.toContain("Nessun provider transactional configurato");
  });

  it("la verifica registra da sola il dominio che il provider non conosce", () => {
    const verifica = funzione.slice(funzione.indexOf("async function actionVerifyDomain("));
    expect(verifica).toContain("dominioSconosciutoAlProvider(");
    expect(verifica.indexOf("await eeAddDomain(eeKey, row.domain);")).toBeGreaterThan(verifica.indexOf("dominioSconosciutoAlProvider("));
  });

  it("i domini della piattaforma restano vietati alle aziende", () => {
    expect(funzione).toContain("i domini della piattaforma non sono utilizzabili");
  });

  it("la pagina mostra la nota sull'SPF e l'errore vero", () => {
    const pagina = leggi("src/pages/azienda/settings/SettingsEmailDomain.tsx");
    expect(pagina).toContain("{record.nota && !record.verified && (");
    expect(pagina).toContain('throw new Error(await edgeErrorMessage(error, "Errore durante l\'aggiunta del dominio"));');
  });
});

// ── Il dominio come mittente (21/09/2026) ───────────────────────────────────
// La verifica collegava solo il marketing, e solo quando il dominio si
// attivava: le transazionali restavano sul sottodominio della piattaforma
// mentre la pagina diceva «marketing e transazionali».

const NUOVO: StatoDominioEmail = {
  id: "d1",
  is_active: false,
  ee_spf_verified: false,
  ee_dkim_verified: false,
  resend_status: "pending",
};
const MARKETING_VERIFICATO: StatoDominioEmail = { ...NUOVO, ee_spf_verified: true, ee_dkim_verified: true };
const ATTIVO_SOLO_MARKETING: StatoDominioEmail = { ...MARKETING_VERIFICATO, is_active: true };
const ATTIVO_TUTTO: StatoDominioEmail = { ...ATTIVO_SOLO_MARKETING, resend_status: "verified" };
const NESSUNA_SCELTA: PreferenzeMittente = { marketing_domain_id: null, transactional_domain_id: null };

describe("verificatoPer e utilizzabilePer: le regole di resolveSender", () => {
  it("marketing = SPF e DKIM; transazionale = Resend verificato oppure i tre CNAME SendGrid", () => {
    expect(verificatoPer(MARKETING_VERIFICATO, "marketing")).toBe(true);
    expect(verificatoPer({ ...NUOVO, ee_spf_verified: true }, "marketing")).toBe(false);
    expect(verificatoPer(ATTIVO_TUTTO, "transactional")).toBe(true);
    expect(verificatoPer({ sg_cname_1_valid: true, sg_cname_2_valid: true, sg_cname_3_valid: true }, "transactional")).toBe(true);
    expect(verificatoPer({ sg_cname_1_valid: true, sg_cname_2_valid: true, sg_cname_3_valid: false }, "transactional")).toBe(false);
    expect(verificatoPer(null, "marketing")).toBe(false);
  });

  it("verificato non basta per spedire: il dominio deve essere anche attivo", () => {
    expect(utilizzabilePer(MARKETING_VERIFICATO, "marketing")).toBe(false);
    expect(utilizzabilePer(ATTIVO_SOLO_MARKETING, "marketing")).toBe(true);
    expect(utilizzabilePer(ATTIVO_SOLO_MARKETING, "transactional")).toBe(false);
  });

  it("dice le stesse cose di dominiAmmessi, che filtra i mittenti delle automazioni", () => {
    const righe: StatoDominioEmail[] = [
      NUOVO,
      MARKETING_VERIFICATO,
      ATTIVO_SOLO_MARKETING,
      ATTIVO_TUTTO,
      { ...NUOVO, resend_status: "verified" },
      { ...NUOVO, is_active: true, sg_cname_1_valid: true, sg_cname_2_valid: true, sg_cname_3_valid: true },
    ];
    for (const riga of righe) {
      for (const canale of CANALI_EMAIL) {
        const ammesso = dominiAmmessi([{ ...riga, domain: "rossi.it" }], canale).length === 1;
        expect(utilizzabilePer(riga, canale)).toBe(ammesso);
      }
    }
  });
});

describe("canaliDaCollegare: quando il dominio diventa il mittente dell'azienda", () => {
  it("prima attivazione con Resend ancora in verifica: diventa il mittente del marketing", () => {
    expect(canaliDaCollegare(NUOVO, ATTIVO_SOLO_MARKETING, NESSUNA_SCELTA)).toEqual(["marketing"]);
  });

  it("Resend diventa verde a una verifica successiva, a dominio già attivo: tocca al transazionale", () => {
    // Il caso che prima non si collegava mai: il blocco girava solo all'attivazione.
    expect(canaliDaCollegare(ATTIVO_SOLO_MARKETING, ATTIVO_TUTTO, { marketing_domain_id: "d1", transactional_domain_id: null }))
      .toEqual(["transactional"]);
  });

  it("tutto verde alla prima verifica: marketing e transazionale insieme", () => {
    expect(canaliDaCollegare(NUOVO, ATTIVO_TUTTO, NESSUNA_SCELTA)).toEqual(["marketing", "transactional"]);
  });

  it("il transazionale verificato aspetta che il dominio si attivi col marketing", () => {
    const soloResend: StatoDominioEmail = { ...NUOVO, resend_status: "verified" };
    expect(canaliDaCollegare(NUOVO, soloResend, NESSUNA_SCELTA)).toEqual([]);
    expect(canaliDaCollegare(soloResend, ATTIVO_TUTTO, NESSUNA_SCELTA)).toEqual(["marketing", "transactional"]);
  });

  it("un mittente già scelto non si tocca", () => {
    expect(canaliDaCollegare(NUOVO, ATTIVO_TUTTO, { marketing_domain_id: "d2", transactional_domain_id: "d2" })).toEqual([]);
    expect(canaliDaCollegare(NUOVO, ATTIVO_TUTTO, { marketing_domain_id: "d2", transactional_domain_id: null }))
      .toEqual(["transactional"]);
  });

  it("la piattaforma scelta dopo in Preferenze email resta: un dominio già utilizzabile non si ricollega", () => {
    expect(canaliDaCollegare(ATTIVO_TUTTO, ATTIVO_TUTTO, NESSUNA_SCELTA)).toEqual([]);
  });

  it("senza la riga delle preferenze vale come nessuna scelta", () => {
    expect(canaliDaCollegare(NUOVO, ATTIVO_TUTTO, null)).toEqual(["marketing", "transactional"]);
  });
});

describe("provenienzaCanale: da dove esce ogni canale rispetto al dominio mostrato", () => {
  const dalDominio = (id: string): MittenteDelCanale => ({
    from: `Rossi Costruzioni <no-reply@rossi.it>`,
    fromEmail: "no-reply@rossi.it",
    usingCustomDomain: true,
    customDomainId: id,
    domain: "rossi.it",
  });
  const dallaPiattaforma: MittenteDelCanale = {
    from: "Rossi Costruzioni via EdiliziaInCloud <no-reply@notifiche.ediliziaincloud.it>",
    fromEmail: "no-reply@notifiche.ediliziaincloud.it",
    usingCustomDomain: false,
    domain: "notifiche.ediliziaincloud.it",
  };

  it("esce da questo dominio o da un altro dell'azienda", () => {
    expect(provenienzaCanale(ATTIVO_TUTTO, "transactional", dalDominio("d1"))).toBe("dal_dominio");
    expect(provenienzaCanale(ATTIVO_TUTTO, "transactional", dalDominio("d2"))).toBe("altro_dominio");
  });

  it("esce dalla piattaforma: il motivo cambia col dominio", () => {
    // Il caso del 21/09: marketing attivo, Resend ancora in verifica.
    expect(provenienzaCanale(ATTIVO_SOLO_MARKETING, "transactional", dallaPiattaforma)).toBe("canale_non_verificato");
    expect(provenienzaCanale({ ...NUOVO, resend_status: "verified" }, "transactional", dallaPiattaforma)).toBe("dominio_non_attivo");
    expect(provenienzaCanale(ATTIVO_TUTTO, "transactional", dallaPiattaforma)).toBe("non_scelto");
  });

  it("la parte prima della @ è quella delle preferenze, uguale per ogni mittente dell'azienda", () => {
    expect(prefissoMittente(dallaPiattaforma)).toBe("no-reply");
    expect(prefissoMittente(dalDominio("d1"))).toBe("no-reply");
    expect(prefissoMittente(null)).toBe("");
  });
});

describe("manage-email-domain e la pagina usano il mittente vero", () => {
  const funzione = leggi("supabase/functions/manage-email-domain/index.ts");
  const pagina = leggi("src/pages/azienda/settings/SettingsEmailDomain.tsx");

  it("la verifica collega i canali con canaliDaCollegare, solo dove la scelta è ancora vuota", () => {
    const verifica = funzione.slice(funzione.indexOf("async function actionVerifyDomain("), funzione.indexOf("async function actionRemoveDomain("));
    expect(verifica).toContain("const collegati = await collegaComeMittente(admin, companyId, row, finale);");
    expect(verifica).toContain("const canali = canaliDaCollegare(prima, dopo, prefs);");
    expect(verifica).toContain(".is(colonna, null)");
    // Il vecchio collegamento del solo marketing, dentro il blocco di attivazione.
    expect(verifica).not.toContain(".update({ marketing_domain_id: row.id })");
  });

  it("get_status restituisce il mittente di ogni canale calcolato da resolveSender", () => {
    expect(funzione).toContain("const m = await resolveSender(companyId, canale, admin);");
    expect(funzione).toContain('mittenteVero(admin, companyId, "marketing"),');
    expect(funzione).toContain('mittenteVero(admin, companyId, "transactional"),');
    expect(funzione).toContain("return { domains, mittenti: { marketing, transactional } };");
  });

  it("la pagina non promette più «marketing e transazionali» né mostra from_email", () => {
    expect(pagina).not.toContain("Tutte le prossime email (marketing e transazionali)");
    expect(pagina).not.toContain("{domain.from_email}");
    expect(pagina).not.toContain("${domain.from_email}");
    expect(pagina).toContain('provenienzaCanale(domain, "transactional", mittenti?.transactional)');
    expect(pagina).toContain("{tuttiDaQui && (");
  });

  it("il modulo non chiede più nome e parte locale che add_domain buttava via", () => {
    expect(pagina).not.toContain('id="from-email"');
    expect(pagina).not.toContain('id="from-name"');
    expect(pagina).toContain('body: { action: "add_domain", company_id: companyId, domain: params.domain },');
  });
});
