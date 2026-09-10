/**
 * @vitest-environment jsdom
 * @vitest-environment-options { "url": "https://app.ediliziaincloud.com/azienda/attivita" }
 */
import { beforeEach, describe, expect, it } from "vitest";

import {
  authStorage,
  cancellaSessioniSalvate,
  sessioneSalvataPresente,
  _perTest,
} from "@/integrations/supabase/authStorage";

/**
 * Qui il browser finto sta su `app.ediliziaincloud.com`: è l'unico modo di
 * provare il cookie di dominio senza aspettare il deploy. Su localhost (l'altro
 * file di test) lo stesso codice deve invece restare sulla memoria locale.
 */
const CHIAVE = "sb-rsbrguhkodgnqfomrevo-auth-token";

function pulisci() {
  localStorage.clear();
  for (const pezzo of document.cookie.split("; ")) {
    const nome = pezzo.split("=")[0];
    if (nome) document.cookie = `${nome}=; Domain=.ediliziaincloud.com; Path=/; Max-Age=0`;
  }
}

describe("Sul dominio vero la sessione va nel cookie condiviso", () => {
  beforeEach(pulisci);

  it("riconosce il dominio padre", () => {
    expect(_perTest.dominioPerCookie()).toBe(".ediliziaincloud.com");
  });

  it("scrive la sessione nel cookie e la rilegge identica", () => {
    const sessione = JSON.stringify({ access_token: "a".repeat(800), refresh_token: "r".repeat(40) });
    authStorage.setItem(CHIAVE, sessione);

    expect(document.cookie).toContain(`${CHIAVE}.0`);
    expect(authStorage.getItem(CHIAVE)).toBe(sessione);
  });

  it("una sessione grande viene spezzata e rimessa insieme", () => {
    const grande = JSON.stringify({ token: "x".repeat(5_000) });
    expect(grande.length).toBeGreaterThan(_perTest.MAX_PER_COOKIE);

    authStorage.setItem(CHIAVE, grande);
    expect(document.cookie).toContain(`${CHIAVE}.1`); // più di un pezzo
    expect(authStorage.getItem(CHIAVE)).toBe(grande);
  });

  it("chi aveva già la sessione nella memoria locale non rifà login", () => {
    // È il caso di tutti gli utenti al primo caricamento dopo il rilascio.
    const vecchia = JSON.stringify({ access_token: "gia-dentro" });
    localStorage.setItem(CHIAVE, vecchia);
    expect(document.cookie).not.toContain(CHIAVE);

    expect(authStorage.getItem(CHIAVE)).toBe(vecchia);
    // e da questo momento vale su tutti i sottodomini
    expect(document.cookie).toContain(`${CHIAVE}.0`);
  });

  it("una sessione rotta si butta via davvero, cookie compresi", () => {
    // Se la pulizia toccasse solo la memoria locale, il cookie rimetterebbe in
    // circolo la stessa sessione al ricaricamento dopo, all'infinito.
    authStorage.setItem(CHIAVE, JSON.stringify({ access_token: "x".repeat(200) }));
    expect(sessioneSalvataPresente()).toBe(true);

    cancellaSessioniSalvate();

    expect(sessioneSalvataPresente()).toBe(false);
    expect(document.cookie).not.toContain(`${CHIAVE}.0`);
    expect(localStorage.getItem(CHIAVE)).toBeNull();
  });

  it("chi arriva da un altro sottodominio risulta gia' dentro (niente landing di passaggio)", () => {
    // Sessione nel solo cookie: e' il caso di chi ha fatto login su admin.* e
    // apre app.* per la prima volta.
    const sessione = JSON.stringify({ access_token: "y".repeat(300) });
    _perTest.scriviSuCookie(CHIAVE, sessione, ".ediliziaincloud.com");
    localStorage.clear();

    expect(sessioneSalvataPresente()).toBe(true);
  });

  it("il logout cancella cookie e memoria locale", () => {
    authStorage.setItem(CHIAVE, JSON.stringify({ access_token: "t" }));
    authStorage.removeItem(CHIAVE);

    expect(authStorage.getItem(CHIAVE)).toBeNull();
    expect(localStorage.getItem(CHIAVE)).toBeNull();
    expect(document.cookie).not.toContain(`${CHIAVE}.0`);
  });
});
