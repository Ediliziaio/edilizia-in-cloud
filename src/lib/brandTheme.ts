/**
 * brandTheme — applica i colori white-label al design system shadcn.
 *
 * Il tema dell'app è definito in index.css con variabili HSL "h s% l%"
 * (es. --primary: 214 80% 50%) consumate via hsl(var(--primary)).
 * I colori brand sono salvati in HEX su companies.brand_* — qui avviene
 * la conversione e l'override runtime quando il white-label è attivo.
 *
 * Punto di applicazione UNICO: i layout (CompanyLayout / CustomerLayout).
 * Nessun altro hook deve scrivere queste variabili.
 */

export interface BrandThemeColors {
  primaryColor: string;
  accentColor: string;
  textOnPrimary: string;
}

const HEX_REGEX = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;

export function isValidHexColor(value: string | null | undefined): value is string {
  return typeof value === "string" && HEX_REGEX.test(value.trim());
}

/** Converte "#RRGGBB" (o "#RGB") in componenti HSL formato shadcn "h s% l%". */
export function hexToHslComponents(hex: string): string | null {
  if (!isValidHexColor(hex)) return null;
  let value = hex.trim().slice(1);
  if (value.length === 3) {
    value = value.split("").map((c) => c + c).join("");
  }
  const r = parseInt(value.slice(0, 2), 16) / 255;
  const g = parseInt(value.slice(2, 4), 16) / 255;
  const b = parseInt(value.slice(4, 6), 16) / 255;

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  let h = 0;
  let s = 0;

  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break;
      case g: h = ((b - r) / d + 2) / 6; break;
      default: h = ((r - g) / d + 4) / 6; break;
    }
  }

  const hDeg = Math.round(h * 360);
  const sPct = Math.round(s * 1000) / 10;
  const lPct = Math.round(l * 1000) / 10;
  return `${hDeg} ${sPct}% ${lPct}%`;
}

/** Luminosità percepita 0–1 (per scegliere testo chiaro/scuro su un fondo). */
function perceivedLightness(hex: string): number {
  let value = hex.trim().slice(1);
  if (value.length === 3) value = value.split("").map((c) => c + c).join("");
  const r = parseInt(value.slice(0, 2), 16) / 255;
  const g = parseInt(value.slice(2, 4), 16) / 255;
  const b = parseInt(value.slice(4, 6), 16) / 255;
  return 0.299 * r + 0.587 * g + 0.114 * b;
}

const THEME_VARS = [
  "--primary",
  "--primary-foreground",
  "--ring",
  "--accent",
  "--accent-foreground",
  "--sidebar-primary",
  "--sidebar-primary-foreground",
  "--sidebar-ring",
  "--sidebar-accent",
] as const;

/**
 * Applica i colori brand alle variabili tema. I valori non validi vengono
 * ignorati (il default di index.css resta in vigore) — protegge da dati
 * sporchi nel DB (es. stringhe HSL salvate al posto dell'hex).
 */
export function applyBrandTheme(colors: BrandThemeColors): void {
  const root = document.documentElement;

  const primary = hexToHslComponents(colors.primaryColor);
  if (primary) {
    root.style.setProperty("--primary", primary);
    root.style.setProperty("--ring", primary);
    root.style.setProperty("--sidebar-primary", primary);
    root.style.setProperty("--sidebar-ring", primary);

    const fg = hexToHslComponents(colors.textOnPrimary) ?? "0 0% 100%";
    root.style.setProperty("--primary-foreground", fg);
    root.style.setProperty("--sidebar-primary-foreground", fg);
  }

  const accent = hexToHslComponents(colors.accentColor);
  if (accent) {
    root.style.setProperty("--accent", accent);
    root.style.setProperty("--sidebar-accent", accent);
    // Testo leggibile sull'accent: scuro se il fondo è chiaro, bianco se scuro
    if (isValidHexColor(colors.accentColor)) {
      const accentFg = perceivedLightness(colors.accentColor) > 0.6
        ? (primary ?? "222 47% 11%")
        : "0 0% 100%";
      root.style.setProperty("--accent-foreground", accentFg);
    }
  }
}

/** Ripristina il tema di default rimuovendo gli override inline. */
export function clearBrandTheme(): void {
  const root = document.documentElement;
  for (const v of THEME_VARS) root.style.removeProperty(v);
}
