/**
 * La bolla «Scrivici su WhatsApp» di Edilizia in Cloud non va sulle pagine che un
 * CLIENTE di un'azienda apre dal link ricevuto: il cliente scriverebbe a noi
 * credendo di scrivere alla sua impresa (lo dice il commento in App.tsx).
 * L'elenco dimenticava /offerta/<token>, la pagina di firma del preventivo, che
 * però condivide il prefisso con il checkout dei piani di EiC (lì la bolla serve).
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { eLinkFirmaPreventivo } from "@/lib/preventivi/offertaPubblica";

const TOKEN = "5f1c0a9e-7d2b-4c3a-8e11-0123456789ab";
const sorgente = readFileSync("src/App.tsx", "utf8");

describe("eLinkFirmaPreventivo: il link di firma del preventivo, non il checkout dei piani", () => {
  it.each([`/offerta/${TOKEN}`, `/offerta/${TOKEN}/`, `/offerta/${TOKEN.toUpperCase()}`])("%s → pagina del cliente", (percorso) => {
    expect(eLinkFirmaPreventivo(percorso)).toBe(true);
  });

  it.each([
    "/offerta/clienti-marketing", // checkout dei piani: il prospect di EiC può voler scrivere a EiC
    "/offerta/offerta-clienti-marketing",
    "/offerta/grazie",
    "/offerta/",
    "/offerta",
    `/firma-fea/${TOKEN}`,
    "/",
  ])("%s → non è il link di firma", (percorso) => {
    expect(eLinkFirmaPreventivo(percorso)).toBe(false);
  });
});

describe("App.tsx: il gate della bolla usa il controllo", () => {
  it("PublicSiteChatWidgetGate nasconde la bolla sul link di firma del preventivo", () => {
    const gate = /function PublicSiteChatWidgetGate\(\) \{[\s\S]*?\n\}/.exec(sorgente)?.[0] ?? "";
    expect(gate).toContain("eLinkFirmaPreventivo(pathname");
    // La bolla resta il ritorno finale: le altre pagine pubbliche (home, landing, checkout) la mostrano.
    expect(gate).toContain("return <WhatsAppFab />;");
  });
});
