/**
 * Il mittente di un'email di automazione: prima il passo, poi le Impostazioni
 * dell'automazione (19/09/2026).
 *
 * «Dettagli mittente email» nelle Impostazioni si salvava e il motore non lo
 * leggeva; e il solo nome scritto sul passo, senza indirizzo, veniva scartato
 * (200 passi in bozza così: Il Bagno Group, Green Energy, Energia Più…).
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  dominiAmmessi,
  dominioDi,
  indirizzoMittenteValido,
  mittenteDelPasso,
  soloDominiDellAzienda,
} from "../../../supabase/functions/_shared/mittenteAutomazione";

const ROOT = join(__dirname, "../../..");

describe("mittenteDelPasso", () => {
  it("tutto vuoto: nessuna scelta, resta il mittente dell'azienda come prima", () => {
    expect(mittenteDelPasso({}, null)).toEqual({ nome: null, email: null });
    expect(mittenteDelPasso({ from_name: "  ", from_email: "" }, { sender_name: "", sender_email: null }))
      .toEqual({ nome: null, email: null });
  });

  it("senza mittente sul passo valgono le Impostazioni", () => {
    expect(mittenteDelPasso({}, { sender_name: "Vincenzo - Il Bagno Group", sender_email: "vincenzo@ilbagnogroup.it" }))
      .toEqual({ nome: "Vincenzo - Il Bagno Group", email: "vincenzo@ilbagnogroup.it" });
  });

  it("il passo vince sulle Impostazioni, campo per campo", () => {
    expect(mittenteDelPasso(
      { from_name: "Flo di Marketing Edile", from_email: "flo@marketingedile.com" },
      { sender_name: "Marketing Edile", sender_email: "info@marketingedile.com" },
    )).toEqual({ nome: "Flo di Marketing Edile", email: "flo@marketingedile.com" });
    // Nome dal passo, indirizzo dalle Impostazioni.
    expect(mittenteDelPasso({ from_name: "Flo" }, { sender_email: "info@marketingedile.com" }))
      .toEqual({ nome: "Flo", email: "info@marketingedile.com" });
    // Indirizzo dal passo, nome dalle Impostazioni.
    expect(mittenteDelPasso({ from_email: "flo@marketingedile.com" }, { sender_name: "Marketing Edile" }))
      .toEqual({ nome: "Marketing Edile", email: "flo@marketingedile.com" });
  });

  it("solo il nome: l'indirizzo lo decide l'azienda", () => {
    expect(mittenteDelPasso({ from_name: "Energia Più" }, null)).toEqual({ nome: "Energia Più", email: null });
  });

  it("un indirizzo scritto male vale come vuoto", () => {
    expect(mittenteDelPasso({ from_email: "flo" }, { sender_email: "info@marketingedile.com" }).email)
      .toBe("info@marketingedile.com");
    expect(mittenteDelPasso({ from_email: "Flo <flo@marketingedile.com>" }, null).email).toBeNull();
    expect(mittenteDelPasso({}, { sender_email: "flo@@marketingedile.com" }).email).toBeNull();
    expect(mittenteDelPasso({ from_email: "  flo@marketingedile.com  " }, null).email).toBe("flo@marketingedile.com");
  });
});

describe("indirizzoMittenteValido", () => {
  it("un indirizzo nudo, con dominio vero", () => {
    expect(indirizzoMittenteValido("flo@marketingedile.com")).toBe(true);
    expect(indirizzoMittenteValido("info@il-bagno.group")).toBe(true);
    expect(indirizzoMittenteValido("flo@marketingedile")).toBe(false);
    expect(indirizzoMittenteValido("flo marketing@edile.com")).toBe(false);
    expect(indirizzoMittenteValido("")).toBe(false);
    expect(indirizzoMittenteValido(null)).toBe(false);
  });
});

describe("il motore usa davvero il mittente scelto", () => {
  const motore = readFileSync(join(ROOT, "supabase/functions/process-automation/index.ts"), "utf8");
  const mittenti = readFileSync(join(ROOT, "supabase/functions/_shared/resolveSender.ts"), "utf8");

  it("passo prima, Impostazioni dopo, lette dal flusso dell'iscrizione", () => {
    expect(motore).toContain("const mittenteScelto = mittenteDelPasso(cfg, await mittenteDelFlusso(supabase, idFlusso, companyId));");
    expect(motore).toContain('.select("sender_name, sender_email")');
    expect(motore).toContain("idFlusso: unknown = queueItem?.flow_id");
  });

  it("l'indirizzo scelto va nell'intestazione, e il provider segue il suo dominio", () => {
    expect(motore).toContain("? safeFromName ? `${safeFromName} <${mittente.email}>` : mittente.email");
    expect(motore).toContain('? mittente.email.split("@").pop() ?? null');
    // Il vecchio mittente letto solo dal passo non c'è più.
    expect(motore).not.toContain("sanitizeFromName(cfg.from_name)");
    expect(motore).not.toContain("const fromAddress = cfg.from_email");
  });

  it("solo il nome: va sull'indirizzo dell'azienda, con le regole di sempre (anche il «via»)", () => {
    expect(motore).toContain("await resolveSender(companyId, stream, supabase, { nome: safeFromName })");
    expect(mittenti).toContain("const senderName = nomeScelto ?? (prefs?.sender_name as string | undefined) ?? fallbackFromName;");
    expect(mittenti).toContain("const customName = nomeScelto ?? ((domainRow.from_name as string | undefined) || senderName);");
  });

  it("dalla casella collegata cambia il nome, non l'indirizzo", () => {
    expect(motore).toContain("fromName: mittente.nome,");
  });

  it("anche l'email scritta dall'AI prende il mittente dell'automazione", () => {
    expect(motore).toContain("entityId, companyId, undefined, queueItem?.flow_id);");
  });
});

// 20/09/2026 — il provider è condiviso fra le aziende: l'indirizzo scelto vale
// solo se il suo dominio è uno di quelli che l'azienda ha collegato e verificato.
describe("da quali domini può spedire un'azienda", () => {
  const eic = { domain: "mkt.ediliziaincloud.com", is_active: true, ee_spf_verified: true, ee_dkim_verified: true, resend_status: "pending" };
  const me = { domain: "MKT.MarketingEdile.com", is_active: true, ee_spf_verified: true, ee_dkim_verified: true, resend_status: "verified" };
  const inAttesa = { domain: "bemade.it", is_active: false, ee_spf_verified: false, ee_dkim_verified: false, resend_status: "pending" };

  it("il dominio di un indirizzo", () => {
    expect(dominioDi(" Flo@MKT.MarketingEdile.com ")).toBe("mkt.marketingedile.com");
    expect(dominioDi("senza-chiocciola")).toBe("");
    expect(dominioDi(null)).toBe("");
  });

  it("marketing: attivo con SPF e DKIM; il transazionale ha le sue regole", () => {
    expect(dominiAmmessi([eic, me, inAttesa], "marketing")).toEqual(["mkt.ediliziaincloud.com", "mkt.marketingedile.com"]);
    expect(dominiAmmessi([eic, me, inAttesa], "transactional")).toEqual(["mkt.marketingedile.com"]);
    expect(dominiAmmessi(null, "marketing")).toEqual([]);
  });

  it("due marchi nella stessa azienda: ognuno spedisce dal suo dominio", () => {
    const ammessi = dominiAmmessi([eic, me], "marketing");
    expect(soloDominiDellAzienda({ nome: "Flo", email: "flo@mkt.marketingedile.com" }, ammessi).email).toBe("flo@mkt.marketingedile.com");
    expect(soloDominiDellAzienda({ nome: "Flo", email: "flo@mkt.ediliziaincloud.com" }, ammessi).email).toBe("flo@mkt.ediliziaincloud.com");
  });

  it("l'indirizzo di un'altra azienda si scarta, il nome resta", () => {
    const ammessi = dominiAmmessi([eic], "marketing");
    expect(soloDominiDellAzienda({ nome: "Finto", email: "info@bemade.it" }, ammessi)).toEqual({ nome: "Finto", email: null });
    // Un sottodominio non verificato non eredita niente dal dominio verificato.
    expect(soloDominiDellAzienda({ nome: null, email: "x@news.mkt.ediliziaincloud.com" }, ammessi).email).toBeNull();
  });

  it("dominio non ancora verificato, o domini illeggibili: si spedisce dal mittente dell'azienda", () => {
    expect(soloDominiDellAzienda({ nome: "BeMade", email: "info@bemade.it" }, dominiAmmessi([inAttesa], "marketing")).email).toBeNull();
    expect(soloDominiDellAzienda({ nome: "BeMade", email: "info@bemade.it" }, []).email).toBeNull();
  });

  it("senza indirizzo scelto non cambia niente", () => {
    expect(soloDominiDellAzienda({ nome: "Flo", email: null }, [])).toEqual({ nome: "Flo", email: null });
  });

  it("il motore applica la regola, tranne che dalla casella collegata", () => {
    const motore = readFileSync(join(__dirname, "../../../supabase/functions/process-automation/index.ts"), "utf8");
    expect(motore).toContain("soloDominiDellAzienda(mittenteScelto, dominiAmmessi(await dominiCollegati(supabase, companyId), stream))");
    expect(motore).toContain("const mittente = casellaId || !mittenteScelto.email");
  });
});
