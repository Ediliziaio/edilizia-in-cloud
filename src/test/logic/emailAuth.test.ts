/**
 * SPF/DKIM/DMARC: "presente" non basta, deve essere GIUSTO. Questi test
 * fissano i casi che la v1 non vedeva (record doppi, +all, include del
 * provider mancante, DKIM revocato, DMARC senza policy o p=none).
 */
import { describe, it, expect } from "vitest";
import { analizzaSpf, analizzaDkim, analizzaDmarc, providerDaMx, providerDaConnessione } from "../../../supabase/functions/_shared/emailAuth";

describe("SPF", () => {
  it("assente", () => {
    expect(analizzaSpf(["google-site-verification=abc"], null).stato).toBe("assente");
  });
  it("ok: unico, con include del provider e ~all", () => {
    const r = analizzaSpf(["v=spf1 include:_spf.google.com ~all"], "google");
    expect(r.stato).toBe("ok");
    expect(r.problemi).toEqual([]);
  });
  it("errato: due record SPF (permerror)", () => {
    const r = analizzaSpf(["v=spf1 include:_spf.google.com ~all", "v=spf1 mx -all"], "google");
    expect(r.stato).toBe("errato");
    expect(r.problemi.join(" ")).toMatch(/2 record SPF/);
  });
  it("errato: +all spalanca il dominio", () => {
    const r = analizzaSpf(["v=spf1 include:_spf.google.com +all"], null);
    expect(r.stato).toBe("errato");
    expect(r.problemi.join(" ")).toMatch(/\+all/);
  });
  it("errato: manca il meccanismo all", () => {
    expect(analizzaSpf(["v=spf1 include:_spf.google.com"], null).problemi.join(" ")).toMatch(/Manca il meccanismo finale/);
  });
  it("errato: casella Microsoft ma SPF senza include Outlook", () => {
    const r = analizzaSpf(["v=spf1 include:_spf.google.com ~all"], "microsoft");
    expect(r.stato).toBe("errato");
    expect(r.problemi.join(" ")).toMatch(/spf\.protection\.outlook\.com/);
  });
  it("errato: oltre 10 lookup", () => {
    const inc = Array.from({ length: 11 }, (_, i) => `include:s${i}.example.com`).join(" ");
    expect(analizzaSpf([`v=spf1 ${inc} ~all`], null).problemi.join(" ")).toMatch(/oltre 10/);
  });
});

describe("DKIM", () => {
  it("assente", () => {
    expect(analizzaDkim([]).stato).toBe("assente");
  });
  it("ok con selettore trovato", () => {
    const r = analizzaDkim([{ selettore: "google", txt: ["v=DKIM1; k=rsa; p=MIGfMA0GCSq"] }]);
    expect(r.stato).toBe("ok");
    expect(r.selettore).toBe("google");
  });
  it("errato: chiave pubblica vuota = revocata", () => {
    const r = analizzaDkim([{ selettore: "selector1", txt: ["v=DKIM1; k=rsa; p="] }]);
    expect(r.stato).toBe("errato");
    expect(r.problemi.join(" ")).toMatch(/vuota/);
  });
});

describe("DMARC", () => {
  it("assente", () => {
    expect(analizzaDmarc([]).stato).toBe("assente");
  });
  it("debole con p=none", () => {
    const r = analizzaDmarc(["v=DMARC1; p=none; rua=mailto:d@x.it"]);
    expect(r.stato).toBe("debole");
    expect(r.policy).toBe("none");
  });
  it("ok con quarantine/reject", () => {
    expect(analizzaDmarc(["v=DMARC1; p=reject"]).stato).toBe("ok");
    expect(analizzaDmarc(["v=DMARC1; p=quarantine; pct=100"]).stato).toBe("ok");
  });
  it("errato senza policy", () => {
    expect(analizzaDmarc(["v=DMARC1; rua=mailto:d@x.it"]).stato).toBe("errato");
  });
});

describe("provider di posta", () => {
  it("dagli MX", () => {
    expect(providerDaMx(["aspmx.l.google.com."])).toBe("google");
    expect(providerDaMx(["azienda-it.mail.protection.outlook.com."])).toBe("microsoft");
    expect(providerDaMx(["mx.aruba.it."])).toBe("aruba");
    expect(providerDaMx(["mail.qualcosa.it."])).toBe("altro");
  });
  it("dalla connessione configurata", () => {
    expect(providerDaConnessione("gmail", null)).toBe("google");
    expect(providerDaConnessione("imap", "smtps.aruba.it")).toBe("aruba");
    expect(providerDaConnessione("imap", "mail.miodominio.it")).toBeNull();
  });
});
