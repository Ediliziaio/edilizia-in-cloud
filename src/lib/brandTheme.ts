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

import { garantisciContrasto, rampaBrand, tintaChiara } from "./brandPalette";

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
  "--sidebar-accent-foreground",
  // Il marchio al posto dell'arancione e del blu scuro di EdiliziaInCloud
  // (vedi tailwind.config: orange-*, eic-orange, eic-navy leggono queste variabili).
  ...["50", "100", "200", "300", "400", "500", "600", "700", "800", "900", "950"].map((n) => `--brand-orange-${n}`),
  "--brand-accent",
  "--brand-accent-dark",
  "--brand-accent-deep",
  "--brand-accent-soft",
  "--brand-navy",
  "--brand-navy-deep",
] as const;

/**
 * I colori effettivamente applicati. Il brand arriva dall'azienda e può avere
 * un contrasto scarso (un verde lime con testo bianco): qui si corregge SENZA
 * cambiare i dati salvati, tenendo la tinta e regolando solo la luminosità.
 *   · primario: scurito finché il testo sopra si legge (4.5:1);
 *   · evidenziazione della barra: se non è un fondo chiaro si usa una tinta
 *     delicata del primario, altrimenti le voci attive escono illeggibili;
 *   · testo sulla voce evidenziata: il primario scurito fino a un contrasto alto.
 */
export function coloriApplicati(colors: BrandThemeColors): {
  primary: string | null;
  textOnPrimary: string;
  sidebarAccent: string | null;
  accentText: string | null;
} {
  const testo = isValidHexColor(colors.textOnPrimary) ? colors.textOnPrimary : "#FFFFFF";
  const primary = isValidHexColor(colors.primaryColor)
    ? garantisciContrasto(colors.primaryColor, testo, 4.5)
    : null;
  let sidebarAccent: string | null = null;
  if (isValidHexColor(colors.accentColor)) {
    sidebarAccent = perceivedLightness(colors.accentColor) >= 0.85
      ? colors.accentColor
      : (primary ? tintaChiara(primary) : null);
  } else if (primary) {
    sidebarAccent = tintaChiara(primary);
  }
  const accentText = primary && sidebarAccent ? garantisciContrasto(primary, sidebarAccent, 7) : primary;
  return { primary, textOnPrimary: testo, sidebarAccent, accentText };
}

/**
 * Applica i colori brand alle variabili tema. I valori non validi vengono
 * ignorati (il default di index.css resta in vigore) — protegge da dati
 * sporchi nel DB (es. stringhe HSL salvate al posto dell'hex).
 */
export function applyBrandTheme(colors: BrandThemeColors): void {
  const root = document.documentElement;
  const c = coloriApplicati(colors);

  const primary = c.primary ? hexToHslComponents(c.primary) : null;
  if (primary) {
    root.style.setProperty("--primary", primary);
    root.style.setProperty("--ring", primary);
    root.style.setProperty("--sidebar-primary", primary);
    root.style.setProperty("--sidebar-ring", primary);

    const fg = hexToHslComponents(c.textOnPrimary) ?? "0 0% 100%";
    root.style.setProperty("--primary-foreground", fg);
    root.style.setProperty("--sidebar-primary-foreground", fg);
  }

  // Arancione e blu scuro della piattaforma → il marchio, in tutta l'applicazione.
  const rampa = c.primary ? rampaBrand(c.primary) : null;
  if (rampa) {
    for (const [n, v] of Object.entries(rampa.orange)) root.style.setProperty(`--brand-orange-${n}`, v);
    root.style.setProperty("--brand-accent", rampa.accent);
    root.style.setProperty("--brand-accent-dark", rampa.accentDark);
    root.style.setProperty("--brand-accent-deep", rampa.accentDeep);
    root.style.setProperty("--brand-accent-soft", rampa.accentSoft);
    root.style.setProperty("--brand-navy", rampa.navy);
    root.style.setProperty("--brand-navy-deep", rampa.navyDeep);
  }

  // Le voci evidenziate (barra laterale, hover) restano coerenti con la tinta
  // scelta. Nel tema scuro si lasciano i colori del tema: sono fondi scuri.
  const scuro = root.classList.contains("dark");
  if (c.sidebarAccent && !scuro) {
    const accent = hexToHslComponents(c.sidebarAccent);
    if (accent) {
      root.style.setProperty("--accent", accent);
      root.style.setProperty("--sidebar-accent", accent);
      const accentFg = c.accentText ? hexToHslComponents(c.accentText) : null;
      if (accentFg) {
        root.style.setProperty("--accent-foreground", accentFg);
        root.style.setProperty("--sidebar-accent-foreground", accentFg);
      }
    }
  }
}

/** Ripristina il tema di default rimuovendo gli override inline. */
export function clearBrandTheme(): void {
  const root = document.documentElement;
  for (const v of THEME_VARS) root.style.removeProperty(v);
}
