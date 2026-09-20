/**
 * Collegare il dominio email di un'azienda dall'app, senza entrare nei pannelli
 * dei provider (20/09/2026). In produzione nessuna azienda ci era mai riuscita:
 * «Aggiungi dominio» si fermava a «Nessun provider transactional configurato».
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  chiaviTransazionali,
  dominioPrincipale,
  dominioSconosciutoAlProvider,
  haDmarc,
  notaSpf,
  SPF_MARKETING_NUOVO,
  trovaSpf,
  unisciSpf,
} from "../../../supabase/functions/_shared/dominioEmailAzienda";

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
