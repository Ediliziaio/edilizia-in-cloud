import { describe, expect, it } from "vitest";
import { diagnosticaRecord, erroreChiaveTransazionale, nomeBreve, type Risolutore } from "../../../supabase/functions/_shared/diagnosiDnsEmail";

const DKIM = "k=rsa;t=s;p=MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQCbmGbQMzYe";
const dns = (tabella: Record<string, string[]>): Risolutore => async (n) => tabella[n] ?? [];

describe("nomeBreve", () => {
  it("accorcia rispetto alla zona", () => {
    expect(nomeBreve("api._domainkey.bemade.shop", "bemade.shop")).toBe("api._domainkey");
    expect(nomeBreve("tracking.bemade.shop", "bemade.shop")).toBe("tracking");
    expect(nomeBreve("bemade.shop", "bemade.shop")).toBe("@");
    expect(nomeBreve("_dmarc.bemade.shop", "mail.bemade.shop")).toBe("_dmarc");
  });
});

describe("diagnosticaRecord", () => {
  const rec = { type: "TXT", host: "api._domainkey.bemade.shop", value: DKIM };
  it("riconosce il nome doppio di OVH", async () => {
    const d = await diagnosticaRecord(rec, "bemade.shop", dns({ "api._domainkey.bemade.shop.bemade.shop": [`"${DKIM}"`] }));
    expect(d.stato).toBe("nome_doppio");
    expect(d.messaggio).toContain("api._domainkey");
  });
  it("ok quando il valore combacia", async () => {
    expect((await diagnosticaRecord(rec, "bemade.shop", dns({ "api._domainkey.bemade.shop": [`"${DKIM}"`] }))).stato).toBe("ok");
  });
  it("valore diverso", async () => {
    expect((await diagnosticaRecord(rec, "bemade.shop", dns({ "api._domainkey.bemade.shop": ['"altro"'] }))).stato).toBe("valore_diverso");
  });
  it("non trovato e non leggibile", async () => {
    expect((await diagnosticaRecord(rec, "bemade.shop", dns({}))).stato).toBe("non_trovato");
    expect((await diagnosticaRecord(rec, "bemade.shop", async () => null)).stato).toBe("non_leggibile");
  });
  it("CNAME con punto finale", async () => {
    const c = { type: "CNAME", host: "tracking.bemade.shop", value: "api.elasticemail.com" };
    expect((await diagnosticaRecord(c, "bemade.shop", dns({ "tracking.bemade.shop": ["api.elasticemail.com."] }))).stato).toBe("ok");
  });
});

describe("erroreChiaveTransazionale", () => {
  it("riconosce la chiave Resend limitata", () => {
    expect(erroreChiaveTransazionale("Resend addDomain 401: This API key is restricted to only send emails")).toBe(true);
    expect(erroreChiaveTransazionale("timeout")).toBe(false);
  });
});
