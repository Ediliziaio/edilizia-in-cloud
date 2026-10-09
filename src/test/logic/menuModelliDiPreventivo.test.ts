/**
 * Il menu delle impostazioni dei preventivi (09/10/2026): «Margini e sconti» non è più una voce a sé.
 * Prezzo e margini, sconti e approvazioni sono schede di «Modelli di preventivo».
 */
import { describe, expect, it } from "vitest";
import { buildSettingsGroups } from "@/lib/impostazioni/navigazioneImpostazioni";
import { GRUPPI_IMPOSTAZIONI, percorsoNelGruppo } from "@/lib/impostazioni/gruppiImpostazioni";
import type { StatoPiano } from "@/lib/impostazioni/pianoImpostazioni";
import type { Permissions } from "@/hooks/usePermissions";

const COMPLETO: StatoPiano = { tuttoVisibile: true, pianoLimitato: false, moduloIncluso: () => true, livelloFunzione: () => "enabled" };
const SENZA_PREVENTIVI: StatoPiano = { tuttoVisibile: false, pianoLimitato: false, moduloIncluso: () => false, livelloFunzione: () => "disabled" };

function voci(permessi: Record<string, boolean>, { isAdmin = false, piano = COMPLETO } = {}) {
  const gruppo = buildSettingsGroups(isAdmin, permessi as unknown as Permissions, piano, false).find((g) => g.label === "Preventivi & Listino");
  expect(gruppo).toBeDefined();
  return gruppo!.items;
}

describe("menu «Preventivi & Listino»", () => {
  it("quattro voci, nell'ordine: Listino, Finanziamenti, Modelli di preventivo, Firma e condizioni", () => {
    expect(voci({}, { isAdmin: true }).filter((v) => v.visible).map((v) => v.label)).toEqual([
      "Listino", "Finanziamenti", "Modelli di preventivo", "Firma e condizioni",
    ]);
  });

  it("niente voce «Margini e sconti», né a sé né come seconda voce dei modelli", () => {
    const etichette = voci({}, { isAdmin: true }).map((v) => v.label);
    expect(etichette).not.toContain("Margini e sconti");
    expect(etichette.filter((e) => e === "Modelli di preventivo")).toHaveLength(1);
    expect(GRUPPI_IMPOSTAZIONI.some((g) => g.titolo === "Margini e sconti")).toBe(false);
  });

  it("la voce apre la prima scheda che l'utente può vedere", () => {
    const apre = (permessi: Record<string, boolean>) => voci(permessi).find((v) => v.label === "Modelli di preventivo")!;
    expect(apre({ canViewSettingsPricing: true }).to).toBe("/azienda/impostazioni/template-preventivi");
    expect(apre({ canViewCosts: true }).to).toBe("/azienda/impostazioni/margini");
    expect(apre({ canViewSettingsScontistica: true }).to).toBe("/azienda/impostazioni/scontistica");
  });

  it("chi vede una scheda sola ha comunque la voce; chi non ne vede nessuna no", () => {
    expect(voci({ canViewCosts: true }).find((v) => v.label === "Modelli di preventivo")!.visible).toBe(true);
    expect(voci({}).find((v) => v.label === "Modelli di preventivo")!.visible).toBe(false);
  });

  it("la voce resta accesa su tutte le sue schede, anche con l'àncora", () => {
    const voce = voci({}, { isAdmin: true }).find((v) => v.label === "Modelli di preventivo")!;
    for (const sezione of ["template-preventivi", "margini", "scontistica", "approvazioni"]) {
      expect(voce.attivoSu?.(`/azienda/impostazioni/${sezione}`), sezione).toBe(true);
    }
    expect(voce.attivoSu?.("/azienda/impostazioni/margini#prezzo")).toBe(true);
    expect(voce.attivoSu?.("/azienda/impostazioni/listino")).toBe(false);
    expect(percorsoNelGruppo(GRUPPI_IMPOSTAZIONI.find((g) => g.id === "modelli")!, "/azienda/impostazioni/condizioni-firma")).toBe(false);
  });

  it("un piano senza preventivi non vede né i modelli né le regole", () => {
    const visibili = voci({}, { isAdmin: true, piano: SENZA_PREVENTIVI }).filter((v) => v.visible).map((v) => v.label);
    expect(visibili).not.toContain("Modelli di preventivo");
  });
});
