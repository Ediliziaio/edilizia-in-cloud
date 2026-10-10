/**
 * Ogni pagina delle impostazioni ha il suo titolo e la sua frase nella testata, e ogni riga della mappa è di una
 * pagina che si apre davvero: gli indirizzi che reindirizzano e le pagine con le schede (che prendono il titolo del
 * loro gruppo) non hanno una riga propria.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { TITOLI_IMPOSTAZIONI, TITOLO_PREDEFINITO, titoloDaPercorso } from "@/lib/impostazioni/titoliImpostazioni";
import { GRUPPI_IMPOSTAZIONI, gruppoDellaSezione, sezioneDaPercorso } from "@/lib/impostazioni/gruppiImpostazioni";
import { buildSettingsGroups } from "@/lib/impostazioni/navigazioneImpostazioni";
import type { Permissions } from "@/hooks/usePermissions";
import type { StatoPiano } from "@/lib/impostazioni/pianoImpostazioni";

const radice = resolve(__dirname, "../../..");
const rotte = readFileSync(resolve(radice, "src/routes/companyRoutes.tsx"), "utf8");
const blocco = rotte.slice(rotte.indexOf("<Route index element={<SettingsIndexRoute />} />"), rotte.indexOf('<Route path="ritenute-garanzia"'));
const tutte = [...blocco.matchAll(/<Route\s+path="([^"]+)"([^\n]*)/g)].map((m) => ({ percorso: m[1], resto: m[2] }));
const segmenti = [...new Set(tutte.map((r) => r.percorso.split("/")[0]))];
/** Gli indirizzi che reindirizzano altrove (tutte le loro rotte): non hanno una testata loro. */
const rimandi = new Set(segmenti.filter((s) => tutte.filter((r) => r.percorso.split("/")[0] === s).every((r) => /element=\{<Navigate/.test(r.resto))));
const conPagina = segmenti.filter((s) => !rimandi.has(s));

const piano: StatoPiano = { tuttoVisibile: true, pianoLimitato: false, moduloIncluso: () => true, livelloFunzione: () => "enabled" };
const amministratore = { isAdmin: true, isLoading: false } as unknown as Permissions;

/** Pagine raggiungibili dall'indirizzo che non hanno un titolo loro (e nessuna voce nel menu). */
const DA_RITIRARE = new Set(["whatsapp-bot"]);

describe("titoli delle impostazioni", () => {
  it("la lettura delle rotte funziona: più di 50 pagine, una trentina di rimandi", () => {
    expect(conPagina.length).toBeGreaterThan(45);
    expect(rimandi.size).toBeGreaterThan(8);
    expect([...rimandi]).toEqual(expect.arrayContaining(["venditori", "staff", "team", "sicurezza", "privacy", "fatturazione-nativa"]));
    // «utenti» ha un rimando (l'elenco) e una pagina vera (la scheda di una persona): la sua testata si vede
    expect(rimandi.has("utenti")).toBe(false);
  });

  it("ogni pagina ha il suo titolo (o quello del suo gruppo di schede)", () => {
    const senza = conPagina.filter((s) => !DA_RITIRARE.has(s)).filter((s) => !gruppoDellaSezione(s) && !(s in TITOLI_IMPOSTAZIONI));
    expect(senza).toEqual([]);
  });

  it("le pagine senza menu (Silvio, preferenze email, AI Test Lab, listini serramenti) hanno un titolo loro", () => {
    for (const s of ["ai-automazioni", "preferenze-email", "ai-test-lab", "listini-serramenti"]) {
      expect(titoloDaPercorso(`/azienda/impostazioni/${s}`).title, s).not.toBe(TITOLO_PREDEFINITO.title);
    }
    // …il Bot WhatsApp «classico» non ha un titolo suo
    expect(titoloDaPercorso("/azienda/impostazioni/whatsapp-bot")).toEqual(TITOLO_PREDEFINITO);
  });

  it("nessuna riga della mappa è irraggiungibile: ogni titolo è di una pagina vera, che non è un rimando né ha le schede", () => {
    for (const chiave of Object.keys(TITOLI_IMPOSTAZIONI)) {
      expect(segmenti, `«${chiave}» non è una rotta delle impostazioni`).toContain(chiave);
      expect(rimandi.has(chiave), `«${chiave}» è solo un rimando: la sua testata non si vede mai`).toBe(false);
      expect(gruppoDellaSezione(chiave), `«${chiave}» ha le schede del suo gruppo: il titolo è quello del gruppo`).toBeNull();
    }
  });

  it("le pagine con le schede hanno titolo e frase del gruppo", () => {
    for (const gruppo of GRUPPI_IMPOSTAZIONI) {
      for (const scheda of gruppo.schede) {
        expect(titoloDaPercorso(scheda.to)).toEqual({ title: gruppo.titolo, description: gruppo.descrizione });
      }
    }
  });

  it("il titolo è il nome della voce nel menu: un nome solo per pagina", () => {
    // «Assistente AI» nel menu, «Assistente AI — chat e memoria» nella testata: lo stesso nome.
    const stessoNome = new Set(["ai-memoria"]);
    const voci = buildSettingsGroups(true, amministratore, piano, false).flatMap((g) => g.items);
    let controllate = 0;
    for (const voce of voci) {
      const s = sezioneDaPercorso(voce.to)!;
      if (gruppoDellaSezione(s) || stessoNome.has(s)) continue;
      controllate++;
      expect(TITOLI_IMPOSTAZIONI[s]?.title, voce.to).toBe(voce.label);
    }
    expect(controllate).toBeGreaterThan(30);
  });

  it("ogni frase dice a cosa serve la pagina: non è vuota e non ripete il titolo", () => {
    for (const [chiave, t] of Object.entries(TITOLI_IMPOSTAZIONI)) {
      expect(t.description.trim().length, chiave).toBeGreaterThan(15);
      expect(t.description.toLowerCase(), chiave).not.toBe(t.title.toLowerCase());
    }
  });

  it("la pagina delle chiavi di accesso non promette ChatGPT: non usa le chiavi, si collega da Integrazioni", () => {
    expect(TITOLI_IMPOSTAZIONI.api.description).not.toMatch(/chatgpt/i);
    expect(TITOLI_IMPOSTAZIONI["sicurezza-privacy"].description).not.toMatch(/dashboard/i);
  });

  it("niente numeri scritti a mano nelle frasi (il numero delle AI cambia)", () => {
    expect(Object.values(TITOLI_IMPOSTAZIONI).some((t) => /\b\d+ AI\b/.test(t.description))).toBe(false);
  });

  it("l'elenco delle impostazioni (senza pagina) ha il titolo di sempre", () => {
    expect(titoloDaPercorso("/azienda/impostazioni")).toEqual(TITOLO_PREDEFINITO);
  });
});
