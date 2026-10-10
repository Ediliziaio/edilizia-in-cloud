/**
 * «Crediti e ricariche» nel menu delle impostazioni e i permessi delle schede interne.
 *
 * Il saldo e la ricarica automatica sono tra le prime cose che un titolare cerca quando l'AI si ferma: la voce sta in
 * «La mia azienda» per chi è amministratore o ha «Fatturazione». Le schede dentro una pagina (Persone & Accessi,
 * Sicurezza & Privacy) hanno permessi loro, più stretti di quelli della pagina.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { buildSettingsGroups, impostazioneAccessibile } from "@/lib/impostazioni/navigazioneImpostazioni";
import type { Permissions } from "@/hooks/usePermissions";
import type { StatoPiano } from "@/lib/impostazioni/pianoImpostazioni";

const piano: StatoPiano = { tuttoVisibile: false, pianoLimitato: false, moduloIncluso: () => true, livelloFunzione: () => "enabled" };
const permessi = (valori: Record<string, unknown> = {}) => ({ isAdmin: false, isLoading: false, ...valori }) as unknown as Permissions;
const url = (s: string) => `/azienda/impostazioni/${s}`;
const voci = (p: Permissions, mobile = false) => buildSettingsGroups(p.isAdmin, p, piano, mobile);

afterEach(() => vi.resetModules());

describe("«Crediti e ricariche» nel menu", () => {
  it("sta in «La mia azienda», subito dopo «Piano abbonamento»", () => {
    const gruppo = voci(permessi({ isAdmin: true })).find((g) => g.label === "La mia azienda")!;
    expect(gruppo.items.filter((i) => i.visible).map((i) => i.label)).toEqual([
      "Profilo aziendale", "Sedi", "White-Label", "Piano abbonamento", "Crediti e ricariche",
    ]);
    expect(gruppo.items.find((i) => i.label === "Crediti e ricariche")!.to).toBe(url("crediti"));
  });

  it("lo vede l'amministratore e chi ha il permesso di fatturazione, anche senza essere amministratore", () => {
    const visibile = (p: Permissions) => Boolean(voci(p).flatMap((g) => g.items).find((i) => i.to === url("crediti"))!.visible);
    expect(visibile(permessi({ isAdmin: true }))).toBe(true);
    expect(visibile(permessi({ canViewBilling: true }))).toBe(true);
    expect(visibile(permessi({ canViewSettingsProfile: true, canViewCosts: true }))).toBe(false);
    expect(visibile(permessi())).toBe(false);
  });

  it("chi lo vede nel menu lo apre dalla ricerca, e viceversa", () => {
    for (const p of [permessi({ isAdmin: true }), permessi({ canViewBilling: true }), permessi()]) {
      const nelMenu = Boolean(voci(p).flatMap((g) => g.items).find((i) => i.to === url("crediti"))!.visible);
      expect(impostazioneAccessibile(url("crediti"), p, piano, false)).toBe(nelMenu);
    }
  });

  it("su iPhone e iPad dell'app no (le ricariche con la carta non si fanno dentro l'app: regola Apple 3.1.1)", async () => {
    vi.resetModules();
    vi.doMock("@/lib/mobile/platform", () => ({ isIOS: true }));
    const nav = await import("@/lib/impostazioni/navigazioneImpostazioni");
    const p = permessi({ isAdmin: true });
    const crediti = nav.buildSettingsGroups(true, p, piano, false).flatMap((g) => g.items).find((i) => i.to === url("crediti"))!;
    expect(crediti.visible).toBe(false);
    expect(nav.impostazioneAccessibile(url("crediti"), p, piano, false)).toBe(false);
    vi.doUnmock("@/lib/mobile/platform");
  });

  it("la voce nuova non cambia l'ordine dei gruppi", () => {
    expect(voci(permessi({ isAdmin: true })).map((g) => g.label).slice(0, 3)).toEqual(["Il mio account", "La mia azienda", "Persone & Accessi"]);
  });
});

describe("le schede dentro una pagina hanno i permessi loro", () => {
  const apre = (scheda: string, p: Permissions) => impostazioneAccessibile(url(`persone?tab=${scheda}`), p, piano, false);

  it("Persone & Accessi: i dipendenti non sono il commercialista", () => {
    const soloPersone = permessi({ canViewSettingsPeople: true });
    for (const scheda of ["dipendenti", "subappaltatori", "venditori", "team"]) expect(apre(scheda, soloPersone), scheda).toBe(true);
    for (const scheda of ["utenti", "commercialista", "accessi-azienda", "sicurezza-accessi", "template-permessi"]) expect(apre(scheda, soloPersone), scheda).toBe(false);
  });

  it("chi vede gli utenti apre utenti, commercialista, accessi da altre aziende e controllo accessi", () => {
    const conUtenti = permessi({ canViewSettingsPeople: true, canViewUsers: true });
    for (const scheda of ["utenti", "commercialista", "accessi-azienda", "sicurezza-accessi"]) expect(apre(scheda, conUtenti), scheda).toBe(true);
    expect(apre("template-permessi", conUtenti)).toBe(false);
    // chi ha solo «Sicurezza & Privacy» apre il controllo accessi ma non gli utenti
    const conSicurezza = permessi({ canViewSettingsPeople: true, canViewSettingsSecurity: true });
    expect(apre("sicurezza-accessi", conSicurezza)).toBe(true);
    expect(apre("utenti", conSicurezza)).toBe(false);
  });

  it("i modelli di permessi li apre solo l'amministratore", () => {
    expect(apre("template-permessi", permessi({ canViewSettingsPeople: true, canEditSettingsPeople: true }))).toBe(false);
    expect(apre("template-permessi", permessi({ isAdmin: true }))).toBe(true);
  });

  it("l'amministratore apre tutte le schede", () => {
    for (const scheda of ["utenti", "commercialista", "accessi-azienda", "sicurezza-accessi", "template-permessi", "dipendenti", "venditori"]) {
      expect(apre(scheda, permessi({ isAdmin: true })), scheda).toBe(true);
    }
  });

  it("senza il permesso della pagina non si apre nessuna scheda", () => {
    expect(apre("dipendenti", permessi({ canViewUsers: true }))).toBe(false);
  });

  it("Sicurezza & Privacy: il registro delle attività e gli accessi sono dell'amministratore", () => {
    const sicurezza = permessi({ canViewSettingsSecurity: true });
    expect(impostazioneAccessibile(url("sicurezza-privacy?tab=privacy"), sicurezza, piano, false)).toBe(true);
    expect(impostazioneAccessibile(url("sicurezza-privacy?tab=attivita"), sicurezza, piano, false)).toBe(false);
    expect(impostazioneAccessibile(url("sicurezza-privacy?tab=dashboard"), sicurezza, piano, false)).toBe(false);
    expect(impostazioneAccessibile(url("sicurezza-privacy?tab=attivita"), permessi({ isAdmin: true }), piano, false)).toBe(true);
  });

  it("le schede di «Il mio profilo» sono di tutti", () => {
    for (const scheda of ["profilo", "sicurezza", "email", "calendari", "notifiche"]) {
      expect(impostazioneAccessibile(url(`mio-profilo?tab=${scheda}`), permessi(), piano, false), scheda).toBe(true);
    }
  });
});

describe("la voce con le schede dice tutti gli indirizzi che può aprire", () => {
  it("Listino, Modelli di preventivo e Firma e condizioni portano l'elenco delle loro schede", () => {
    const gruppo = voci(permessi({ isAdmin: true })).find((g) => g.label === "Preventivi & Listino")!;
    const modelli = gruppo.items.find((i) => i.label === "Modelli di preventivo")!;
    expect(modelli.indirizzi).toEqual([url("template-preventivi"), url("margini"), url("scontistica"), url("approvazioni")]);
    expect(gruppo.items.find((i) => i.label === "Listino")!.indirizzi).toEqual([url("listino"), url("tariffe"), url("bundle")]);
    expect(gruppo.items.find((i) => i.label === "Finanziamenti")!.indirizzi).toBeUndefined();
  });
});
