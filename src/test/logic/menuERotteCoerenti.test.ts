/**
 * Il menu delle impostazioni e le rotte dicono la stessa cosa.
 *
 * Una voce visibile che poi la rotta nega (o una pagina aperta all'indirizzo che nel menu non si trova) è un vicolo
 * cieco: qui ogni voce del menu, per ogni permesso, viene confrontata con la rotta che apre.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { GRUPPI_IMPOSTAZIONI, sezioneDaPercorso } from "@/lib/impostazioni/gruppiImpostazioni";
import { buildSettingsGroups } from "@/lib/impostazioni/navigazioneImpostazioni";
import { SETTINGS_INDEX } from "@/lib/impostazioni/indiceImpostazioni";
import type { Permissions } from "@/hooks/usePermissions";
import type { StatoPiano } from "@/lib/impostazioni/pianoImpostazioni";

const radice = resolve(__dirname, "../../..");
const rotte = readFileSync(resolve(radice, "src/routes/companyRoutes.tsx"), "utf8");
const blocco = rotte.slice(rotte.indexOf("<Route index element={<SettingsIndexRoute />} />"), rotte.indexOf('<Route path="ritenute-garanzia"'));

/** Le rotte, una per una: il testo che va da un <Route a quello dopo (anche su più righe). */
const PEZZI_DI_ROTTA = blocco.split(/<Route\b/).slice(1);

/** segmento → permesso della rotta (la prima chiave di withCompanyPermission("chiave", …) nel suo testo). */
const PERMESSO_DELLA_ROTTA = new Map<string, { chiave: string; composto: boolean }>();
for (const pezzo of PEZZI_DI_ROTTA) {
  const percorso = pezzo.match(/^\s*path="([^"/]+)"/)?.[1];
  const permesso = pezzo.match(/withCompanyPermission\(\s*"(\w+)"/);
  if (percorso && permesso) PERMESSO_DELLA_ROTTA.set(percorso, { chiave: permesso[1], composto: /\(p\)\s*=>/.test(pezzo) });
}
const segmenti = new Set(PEZZI_DI_ROTTA.map((p) => p.match(/^\s*path="([^"]+)"/)?.[1]?.split("/")[0]).filter((s): s is string => Boolean(s)));
const rimandi = new Set(
  [...segmenti].filter((s) =>
    PEZZI_DI_ROTTA.filter((p) => p.match(/^\s*path="([^"]+)"/)?.[1]?.split("/")[0] === s).every((p) => /element=\{<Navigate/.test(p)),
  ),
);

const piano: StatoPiano = { tuttoVisibile: true, pianoLimitato: false, moduloIncluso: () => true, livelloFunzione: () => "enabled" };
const solo = (chiave: string) => ({ isAdmin: false, isLoading: false, [chiave]: true }) as unknown as Permissions;
const nessuno = { isAdmin: false, isLoading: false } as unknown as Permissions;
const menu = (p: Permissions) => buildSettingsGroups(p.isAdmin, p, piano, false).flatMap((g) => g.items);

/**
 * Voci del menu che non coincidono con la rotta, e perché. Ognuna è una scelta ancora aperta o un caso voluto:
 * togliere una riga da qui senza sistemare menu o rotta fa fallire il test.
 */
const DIFFERENZE_NOTE: Record<string, string> = {
  branding: "il menu mostra Marchio e colori solo all'amministratore, la rotta lo apre a chi ha «Personalizzazione» (decisione aperta)",
  abbonamento: "la rotta vuole «Fatturazione» e l'amministratore insieme (regola composta): coincide con il menu, che è solo dell'amministratore",
};

/** Pagine con una rotta e nessuna voce di menu, e perché. */
const SENZA_VOCE_NOTE: Record<string, string> = {
  "ai-automazioni": "non è promossa nel menu (scelta di prodotto)",
  "whatsapp-bot": "pagina da ritirare: il bot si governa dai numeri di /azienda/whatsapp",
  "ai-test-lab": "per l'azienda dimostrativa, si apre da dentro la pagina",
  "listini-serramenti": "funzione a richiesta: ci si arriva dal link nella pagina del listino",
  utenti: "la scheda di una persona: ci si arriva dall'elenco di Persone & Accessi",
};

describe("menu e rotte", () => {
  it("la lettura delle rotte funziona: decine di permessi trovati", () => {
    expect(PERMESSO_DELLA_ROTTA.size).toBeGreaterThan(40);
    expect(PERMESSO_DELLA_ROTTA.get("fornitori")?.chiave).toBe("canViewSettingsSuppliers");
    expect(PERMESSO_DELLA_ROTTA.get("abbonamento")?.composto).toBe(true);
  });

  it("ogni voce del menu si vede con il permesso della sua rotta e con nient'altro", () => {
    const voci = menu(nessuno).concat(menu(solo("canViewBilling"))).filter((v, i, tutte) => tutte.findIndex((x) => x.to === v.to) === i);
    const controllate: string[] = [];
    for (const voce of voci) {
      const s = sezioneDaPercorso(voce.to)!;
      if (GRUPPI_IMPOSTAZIONI.some((g) => g.schede.some((sc) => sc.sezione === s))) continue; // le voci con le schede, qui sotto
      const rotta = PERMESSO_DELLA_ROTTA.get(s);
      if (!rotta || s === "mio-profilo" || s === "notifiche") continue; // di tutti: la rotta non chiede niente
      controllate.push(s);
      if (s in DIFFERENZE_NOTE) continue;
      const conIlPermesso = menu(solo(rotta.chiave)).find((v) => v.to === voce.to)!;
      expect(Boolean(conIlPermesso.visible), `${s}: la rotta chiede ${rotta.chiave}, il menu la nasconde a chi ce l'ha`).toBe(true);
      const senza = menu(nessuno).find((v) => v.to === voce.to)!;
      expect(Boolean(senza.visible), `${s}: senza permessi il menu la mostra`).toBe(false);
    }
    expect(controllate.length).toBeGreaterThan(25);
  });

  it("le differenze note sono ancora differenze (se si sistemano, si toglie la riga)", () => {
    // Marchio e colori: la rotta lo apre a chi ha il permesso, il menu no
    expect(PERMESSO_DELLA_ROTTA.get("branding")?.composto).toBe(false);
    const conPermesso = menu(solo(PERMESSO_DELLA_ROTTA.get("branding")!.chiave)).find((v) => v.to === "/azienda/impostazioni/branding")!;
    expect(Boolean(conPermesso.visible)).toBe(false);
    // Piano abbonamento: la rotta ha la regola composta, quindi menu e rotta coincidono
    expect(PERMESSO_DELLA_ROTTA.get("abbonamento")?.composto).toBe(true);
  });

  it("ogni scheda di un gruppo (Listino, Modelli di preventivo, Firma e condizioni) vuole il permesso della sua rotta", () => {
    let schede = 0;
    for (const gruppo of GRUPPI_IMPOSTAZIONI) {
      for (const scheda of gruppo.schede) {
        schede++;
        expect(scheda.permesso, `scheda ${scheda.sezione}`).toBe(PERMESSO_DELLA_ROTTA.get(scheda.sezione)?.chiave);
        // gli alias che reindirizzano non hanno un permesso loro: li ha la pagina a cui portano
        for (const alias of (scheda.alias ?? []).filter((a) => !rimandi.has(a))) expect(PERMESSO_DELLA_ROTTA.get(alias)?.chiave, `alias ${alias}`).toBe(scheda.permesso);
      }
    }
    expect(schede).toBe(9);
  });
});

describe("le pagine con una rotta hanno una porta d'ingresso", () => {
  const nelMenu = new Set(menu({ isAdmin: true, isLoading: false } as unknown as Permissions).map((v) => sezioneDaPercorso(v.to)));
  const nelleSchede = new Set(GRUPPI_IMPOSTAZIONI.flatMap((g) => g.schede.flatMap((s) => [s.sezione, ...(s.alias ?? [])])));
  const nellaRicerca = new Set(SETTINGS_INDEX.map((v) => sezioneDaPercorso(v.url)));

  it("nel menu, nelle schede o nella ricerca; le eccezioni hanno un motivo scritto", () => {
    const senzaPorta = [...segmenti].filter((s) => !rimandi.has(s)).filter((s) => !nelMenu.has(s) && !nelleSchede.has(s) && !nellaRicerca.has(s));
    expect(senzaPorta.sort()).toEqual(Object.keys(SENZA_VOCE_NOTE).filter((s) => !nellaRicerca.has(s)).sort());
  });

  it("«Mittente e aspetto delle email» e «Crediti e ricariche» hanno una porta d'ingresso", () => {
    expect(nellaRicerca.has("preferenze-email")).toBe(true);
    expect(nelMenu.has("crediti")).toBe(true);
  });

  it("le eccezioni sono rotte vere", () => {
    for (const s of Object.keys(SENZA_VOCE_NOTE)) expect(segmenti.has(s), s).toBe(true);
  });
});
