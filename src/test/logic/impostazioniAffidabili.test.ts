import { describe, expect, it } from "vitest";
import { buildSettingsGroups, impostazioneAccessibile } from "@/lib/impostazioni/navigazioneImpostazioni";
import { campiMarginiModificati, percentualeImpostazione } from "@/lib/impostazioni/salvataggioMargini";
import { verificaWhatsAppDaConservare } from "@/lib/impostazioni/verificaCanaleWhatsApp";
import { PAGAMENTI_FORNITORI, etichettaPagamentoFornitore } from "@/lib/impostazioni/pagamentiFornitori";
import type { Permissions } from "@/hooks/usePermissions";
import type { StatoPiano } from "@/lib/impostazioni/pianoImpostazioni";

const piano: StatoPiano = { tuttoVisibile: false, pianoLimitato: false, moduloIncluso: () => true, livelloFunzione: () => "enabled" };
const permessi = (values: Partial<Permissions> = {}) => ({ isAdmin: false, ...values }) as Permissions;
const url = (sezione: string) => `/azienda/impostazioni/${sezione}`;

describe("Navigazione condivisa delle impostazioni", () => {
  it("mantiene l'ordine azienda → persone e nessuna voce duplicata", () => {
    const groups = buildSettingsGroups(true, permessi({ isAdmin: true }), piano, false);
    expect(groups.map(g => g.label).slice(0, 3)).toEqual(["Il mio account", "La mia azienda", "Persone & Accessi"]);
    const entries = groups.flatMap(g => g.items).filter(i => i.visible).map(i => i.to);
    expect(new Set(entries).size).toBe(entries.length);
    expect(entries).toContain(url("fornitori"));
  });
  it("senza permessi lascia solo le preferenze personali", () => {
    const entries = buildSettingsGroups(false, permessi(), piano, false).flatMap(g => g.items).filter(i => i.visible).map(i => i.to);
    expect(entries).toEqual([url("mio-profilo"), url("notifiche")]);
  });
  it("un permesso su una scheda non apre le altre schede del gruppo", () => {
    const p = permessi({ canViewSettingsBundle: true });
    expect(impostazioneAccessibile(url("bundle"), p, piano, false)).toBe(true);
    expect(impostazioneAccessibile(url("bundle-serramentista"), p, piano, false)).toBe(true);
    expect(impostazioneAccessibile(url("listino"), p, piano, false)).toBe(false);
    expect(impostazioneAccessibile(url("tariffe"), p, piano, false)).toBe(false);
  });
  it("importazione richiede modifica, non solo lettura del listino", () => {
    const p = permessi({ canViewSettingsPricing: true });
    expect(impostazioneAccessibile(url("listino"), p, piano, false)).toBe(true);
    expect(impostazioneAccessibile(url("listino/import"), p, piano, false)).toBe(false);
    expect(impostazioneAccessibile(url("listino/import"), { ...p, canEditSettingsPricing: true }, piano, false)).toBe(true);
  });
  it("rispetta il piano anche con permesso di lettura", () => {
    const marketing: StatoPiano = { ...piano, moduloIncluso: () => false, livelloFunzione: () => "disabled" };
    expect(impostazioneAccessibile(url("fornitori"), permessi({ canViewSettingsSuppliers: true }), marketing, false)).toBe(false);
  });
  it("rimuove le integrazioni dal menu solo sul telefono", () => {
    const p = permessi({ isAdmin: true });
    const visibili = (mobile: boolean) => buildSettingsGroups(true, p, piano, mobile).flatMap(g => g.items).filter(i => i.visible).map(i => i.to);
    expect(visibili(false)).toContain(url("integrazioni"));
    expect(visibili(true)).not.toContain(url("integrazioni"));
  });
  it("nega link secondari non autorizzati e indirizzi sconosciuti", () => {
    expect(impostazioneAccessibile(url("whatsapp-bot"), permessi(), piano, false)).toBe(false);
    expect(impostazioneAccessibile(url("inventata"), permessi({ isAdmin: true }), piano, false)).toBe(false);
    expect(impostazioneAccessibile(url("persone?tab=template-permessi"), permessi({ canViewSettingsPeople: true }), piano, false)).toBe(false);
  });
});

describe("Salvataggio delle percentuali", () => {
  it("invia solo i campi modificati, compresi azzeramenti e disattivazioni", () => {
    expect(campiMarginiModificati({ target: 25, fee: 0, enabled: false, note: null }, { target: 25, fee: 8, enabled: true, note: "x" })).toEqual({ fee: 0, enabled: false, note: null });
    expect(campiMarginiModificati({ target: 25 }, { target: 25 })).toEqual({});
  });
  it.each([["25,5", 25.5], ["0", 0], ["100", 100], ["", null], ["  ", null]])("interpreta %s senza coercizioni spurie", (value, expected) => {
    expect(percentualeImpostazione(value as string, "Target")).toBe(expected);
  });
  it.each(["abc", "NaN", "Infinity", "-1", "100.01", "1,2,3"])("rifiuta %s", value => {
    expect(() => percentualeImpostazione(value, "Target")).toThrow("Target");
  });
  it("il margine sul prezzo non può raggiungere 100%", () => {
    expect(() => percentualeImpostazione("100", "Margine", 99.99)).toThrow();
  });
});

describe("WhatsApp: preferenza e verifica sono distinte", () => {
  const verified = "2026-10-01T12:00:00Z";
  it("un numero nuovo non risulta verificato", () => expect(verificaWhatsAppDaConservare("+393331234567", null, null)).toBeNull());
  it("conserva una verifica precedente soltanto per lo stesso numero", () => {
    expect(verificaWhatsAppDaConservare("0039 333-1234567", "+393331234567", verified)).toBe(verified);
    expect(verificaWhatsAppDaConservare("+393331234568", "+393331234567", verified)).toBeNull();
    expect(verificaWhatsAppDaConservare(null, "+393331234567", verified)).toBeNull();
  });
});

describe("Condizioni di pagamento fornitori", () => {
  it.each([30, 60, 90])("mantiene le condizioni già salvate: bonifico %s giorni", giorni => {
    expect(PAGAMENTI_FORNITORI.some(p => p.value === `bonifico_${giorni}gg`)).toBe(true);
    expect(etichettaPagamentoFornitore(`bonifico_${giorni}gg`)).toMatch(new RegExp(String(giorni)));
  });
  it("mantiene leggibili le condizioni personalizzate", () => {
    expect(etichettaPagamentoFornitore("accordo_speciale")).toBe("accordo speciale");
    expect(etichettaPagamentoFornitore(null)).toBe("—");
  });
});
