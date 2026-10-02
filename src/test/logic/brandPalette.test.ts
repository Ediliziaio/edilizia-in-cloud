import { describe, expect, it } from "vitest";
import {
  contrasto, coloreDominante, garantisciContrasto, paletteDaColore, testoLeggibileSu, tintaChiara,
} from "../../lib/brandPalette";
import { coloriApplicati } from "../../lib/brandTheme";

const VERDE_LOGO = "#82B845";

describe("brandPalette", () => {
  it("il verde del logo con testo bianco NON è leggibile, il tono scurito sì", () => {
    expect(contrasto(VERDE_LOGO, "#FFFFFF")).toBeLessThan(4.5);
    const scuro = garantisciContrasto(VERDE_LOGO, "#FFFFFF", 4.5);
    expect(contrasto(scuro, "#FFFFFF")).toBeGreaterThanOrEqual(4.5);
    // stessa tinta: resta verde
    const [r, g, b] = [parseInt(scuro.slice(1, 3), 16), parseInt(scuro.slice(3, 5), 16), parseInt(scuro.slice(5, 7), 16)];
    expect(g).toBeGreaterThan(r);
    expect(g).toBeGreaterThan(b);
  });

  it("un colore già scuro non si tocca", () => {
    expect(garantisciContrasto("#1E40AF", "#FFFFFF")).toBe("#1E40AF");
  });

  it("la palette dal logo: secondario = logo, accento chiaro, testo leggibile", () => {
    const p = paletteDaColore(VERDE_LOGO);
    expect(p.secondary).toBe(VERDE_LOGO);
    expect(contrasto(p.primary, p.textOnPrimary)).toBeGreaterThanOrEqual(4.5);
    expect(contrasto(p.accent, "#FFFFFF")).toBeLessThan(1.25); // quasi bianco, delicato
  });

  it("su un giallo chiaro il testo diventa scuro o il fondo si scurisce, ma si legge sempre", () => {
    const p = paletteDaColore("#FFD400");
    expect(contrasto(p.primary, p.textOnPrimary)).toBeGreaterThanOrEqual(4.5);
  });

  it("testoLeggibileSu sceglie bianco su scuro e quasi nero su chiaro", () => {
    expect(testoLeggibileSu("#0B1F3A")).toBe("#FFFFFF");
    expect(testoLeggibileSu("#FDE68A")).toBe("#111827");
  });

  it("tintaChiara mantiene la tinta", () => {
    const t = tintaChiara(VERDE_LOGO);
    expect(parseInt(t.slice(3, 5), 16)).toBeGreaterThanOrEqual(parseInt(t.slice(1, 3), 16));
  });

  it("coloreDominante: sceglie il verde tra pixel verdi, bianchi e grigi", () => {
    const px: number[] = [];
    const push = (r: number, g: number, b: number, n: number) => { for (let i = 0; i < n; i++) px.push(r, g, b, 255); };
    push(255, 255, 255, 500); // sfondo bianco
    push(140, 140, 140, 200); // testo grigio
    push(130, 184, 69, 120);  // marchio verde
    push(40, 70, 200, 10);    // un po' di blu
    const c = coloreDominante(px)!;
    const [r, g, b] = [parseInt(c.slice(1, 3), 16), parseInt(c.slice(3, 5), 16), parseInt(c.slice(5, 7), 16)];
    expect(g).toBeGreaterThan(r);
    expect(g).toBeGreaterThan(b);
  });

  it("coloreDominante: logo tutto bianco/grigio/nero → null; pixel trasparenti ignorati", () => {
    expect(coloreDominante([255, 255, 255, 255, 120, 120, 120, 255, 0, 0, 0, 255])).toBeNull();
    expect(coloreDominante([200, 30, 30, 10])).toBeNull();
  });
});

describe("coloriApplicati (tema): la barra laterale resta leggibile", () => {
  it("verde del logo come primario: lo applica scurito, con testo bianco leggibile", () => {
    const c = coloriApplicati({ primaryColor: VERDE_LOGO, accentColor: "#EEF5E3", textOnPrimary: "#FFFFFF" });
    expect(contrasto(c.primary!, c.textOnPrimary)).toBeGreaterThanOrEqual(4.5);
    expect(contrasto(c.accentText!, c.sidebarAccent!)).toBeGreaterThanOrEqual(7);
  });

  it("un accento troppo scuro non diventa lo sfondo delle voci: si usa una tinta chiara del primario", () => {
    const c = coloriApplicati({ primaryColor: "#1E40AF", accentColor: "#0F172A", textOnPrimary: "#FFFFFF" });
    expect(contrasto(c.sidebarAccent!, "#FFFFFF")).toBeLessThan(1.3);
    expect(contrasto(c.accentText!, c.sidebarAccent!)).toBeGreaterThanOrEqual(7);
  });

  it("dati sporchi nel DB: nessun errore, si usano i default del tema", () => {
    const c = coloriApplicati({ primaryColor: "hsl(214 80% 50%)", accentColor: "boh", textOnPrimary: "x" });
    expect(c.primary).toBeNull();
    expect(c.sidebarAccent).toBeNull();
  });
});

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { rampaBrand } from "../../lib/brandPalette";

describe("rampaBrand: il marchio al posto dell'arancione e del blu di EdiliziaInCloud", () => {
  it("dal verde del logo: 11 toni dal chiaro allo scuro, in formato «R G B»", () => {
    const r = rampaBrand("#5B8030")!;
    expect(Object.keys(r.orange)).toHaveLength(11);
    for (const v of [...Object.values(r.orange), r.accent, r.navy, r.navyDeep]) expect(v).toMatch(/^\d{1,3} \d{1,3} \d{1,3}$/);
    const lum = (t: string) => t.split(" ").map(Number).reduce((a, b) => a + b, 0);
    expect(lum(r.orange["50"])).toBeGreaterThan(lum(r.orange["500"]));
    expect(lum(r.orange["500"])).toBeGreaterThan(lum(r.orange["900"]));
    expect(r.orange["500"]).toBe("91 128 48");
    // i blocchi scuri sono davvero scuri (testo bianco sopra si legge)
    expect(Math.max(...r.navyDeep.split(" ").map(Number))).toBeLessThan(110);
  });

  it("colore non valido: nessuna rampa (restano i colori di EdiliziaInCloud)", () => {
    expect(rampaBrand("verde")).toBeNull();
  });
});

describe("l'arancione e il blu scuro non si scrivono più come colori fissi nelle classi", () => {
  // Con `bg-[#F97415]` il white-label non può cambiarli: si usano i nomi del tema
  // (eic-orange, eic-orange-dark, eic-orange-deep, eic-navy, eic-navy-deep, orange-*).
  const VIETATI = /(?:bg|text|border|from|to|via|ring|shadow|accent|fill|stroke|outline|decoration|divide|caret)-\[#(?:F97415|D95E0B|d95f0e|e8650e|C94F06|173b67|1E3A5F)\]/i;
  const files: string[] = [];
  const cammina = (d: string) => {
    for (const f of readdirSync(d)) {
      const p = join(d, f);
      if (statSync(p).isDirectory()) { if (f !== "test") cammina(p); }
      else if (/\.(ts|tsx)$/.test(f)) files.push(p);
    }
  };
  it("nessun file", () => {
    cammina(join(__dirname, "../.."));
    const colpevoli = files.filter((f) => VIETATI.test(readFileSync(f, "utf8")));
    expect(colpevoli.map((f) => f.split("/src/")[1])).toEqual([]);
  });

  it("tailwind.config legge le variabili del marchio, con i colori di sempre come valore predefinito", () => {
    const cfg = readFileSync(join(__dirname, "../../../tailwind.config.ts"), "utf8");
    expect(cfg).toContain('marchio("brand-accent", "249 115 22")');
    expect(cfg).toContain('marchio("brand-orange-500", "249 115 22")');
    expect(cfg).toContain('marchio("brand-navy-deep", "23 59 103")');
  });
});
