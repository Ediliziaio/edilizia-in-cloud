import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { eAccessoConLink, testoLinkAccesso } from "./linkAccesso";

describe("accesso con link", () => {
  it("riconosce solo l'indirizzo costruito per il link", () => {
    expect(eAccessoConLink("operaio-abc@operai.ediliziaincloud.com")).toBe(true);
    expect(eAccessoConLink("OPERAIO-ABC@OPERAI.EDILIZIAINCLOUD.COM")).toBe(true);
    expect(eAccessoConLink("mario@ediliziaincloud.com")).toBe(false);
    expect(eAccessoConLink(null)).toBe(false);
  });

  it("il messaggio usa il primo nome e porta il link", () => {
    const testo = testoLinkAccesso("Ion Popescu", "Impresa Esempio", "https://x.it/entra/abc");
    expect(testo).toContain("Ciao Ion, da Impresa Esempio.");
    expect(testo.endsWith("https://x.it/entra/abc")).toBe(true);
  });

  it("il dominio è lo stesso che il server scarta dalle email", () => {
    const server = readFileSync("supabase/functions/_shared/emailSuppression.ts", "utf8");
    const dominio = server.match(/DOMINIO_ACCESSO_CON_LINK = "([^"]+)"/)?.[1];
    expect(eAccessoConLink(`x@${dominio}`)).toBe(true);
  });
});
