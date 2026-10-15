import { afterEach, describe, expect, it } from "vitest";
import { applyBrandTheme, clearBrandTheme, hexToHslComponents } from "@/lib/brandTheme";
import { paletteDaColore } from "@/lib/brandPalette";

const defaults = {
  primaryColor: "#1E40AF",
  accentColor: "#DBEAFE",
  textOnPrimary: "#FFFFFF",
};
const root = document.documentElement;

afterEach(() => {
  clearBrandTheme();
  root.classList.remove("dark");
});

describe("Attivazione white-label: colori standard fino alla personalizzazione", () => {
  it.each([false, true])("lascia al CSS tutti i colori predefiniti (tema scuro: %s)", (dark) => {
    root.classList.toggle("dark", dark);
    applyBrandTheme(defaults);
    for (const name of ["--primary", "--accent", "--sidebar-primary", "--brand-orange-500", "--brand-navy"]) {
      expect(root.style.getPropertyValue(name)).toBe("");
    }
  });

  it("applica i colori scelti dall'azienda e li rimuove passando a un'azienda senza personalizzazione", () => {
    const palette = paletteDaColore("#0F766E");
    applyBrandTheme({ primaryColor: palette.primary, accentColor: palette.accent, textOnPrimary: palette.textOnPrimary });
    expect(root.style.getPropertyValue("--primary")).toBe(hexToHslComponents(palette.primary));
    expect(root.style.getPropertyValue("--brand-orange-500")).not.toBe("");
    expect(root.style.getPropertyValue("--brand-navy")).not.toBe("");

    applyBrandTheme(defaults);
    expect(root.style.length).toBe(0);
  });

  it("permette di scegliere il blu dal selettore colori anche se il primario coincide con quello precompilato", () => {
    const palette = paletteDaColore(defaults.primaryColor);
    applyBrandTheme({ primaryColor: palette.primary, accentColor: palette.accent, textOnPrimary: palette.textOnPrimary });
    expect(root.style.getPropertyValue("--primary")).toBe(hexToHslComponents(palette.primary));
    expect(root.style.getPropertyValue("--brand-orange-500")).not.toBe("");
  });

  it("riconosce i valori precompilati indipendentemente da maiuscole e spazi", () => {
    applyBrandTheme({ primaryColor: " #1e40af ", accentColor: "#dbeafe", textOnPrimary: "#fff" });
    expect(root.style.length).toBe(0);
  });
});
