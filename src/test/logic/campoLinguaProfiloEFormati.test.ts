/**
 * Lingua dell'area operai — dove sta la scelta e come si scrivono date e numeri
 * (piano 2026-11-23-lingua-piattaforma, punti 2 e 6).
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { decidiLingua, leggiSceltaDispositivo, scriviSceltaDispositivo, type SceltaDispositivo } from "@/lib/campo/lingua/sceltaLingua";
import { caricaLocaleDateFns, formatiPer, localeIntl } from "@/lib/campo/lingua/formati";
import { LINGUE, linguaDa } from "@/lib/campo/lingua/lingue";
import { traduci } from "@/lib/campo/lingua/LinguaCampo";
// @ts-expect-error — script node senza tipi
import { classiFisiche, generaCss, regola } from "../../../scripts/campo/genera-rtl-campo.mjs";

const IERI = "2026-11-22T10:00:00.000Z";
const OGGI = "2026-11-23T10:00:00.000Z";
const scelta = (o: Partial<SceltaDispositivo>): SceltaDispositivo => ({ codice: "ro", utente: "u1", quando: OGGI, salvata: true, ...o });

function archivio() {
  const dati = new Map<string, string>();
  return {
    getItem: (k: string): string | null => dati.get(k) ?? null,
    setItem: (k: string, v: string): void => { dati.set(k, v); },
    dati,
  };
}

describe("quale lingua mostrare", () => {
  it("senza nessuna scelta: italiano, come oggi", () => {
    expect(decidiLingua(null, null)).toEqual({ codice: "it", daSalvare: null });
    expect(decidiLingua({ id: "u1", lingua: null, updated_at: IERI }, null)).toEqual({ codice: "it", daSalvare: null });
  });

  it("prima che arrivi il profilo vale la scelta del dispositivo", () => {
    expect(decidiLingua(null, scelta({ codice: "sq" })).codice).toBe("sq");
  });

  it("la lingua del profilo vale su ogni dispositivo", () => {
    const d = decidiLingua({ id: "u1", lingua: "ar-MA", updated_at: OGGI }, null);
    expect(d.codice).toBe("ar-MA");
    expect(d.daSalvare).toBeNull();
    expect(d.dispositivo).toMatchObject({ codice: "ar-MA", utente: "u1", salvata: true });
  });

  it("scelta fatta senza rete: resta, e si riprova a portarla sul profilo", () => {
    const d = decidiLingua({ id: "u1", lingua: "it", updated_at: IERI }, scelta({ codice: "es-AR", salvata: false }));
    expect(d).toEqual({ codice: "es-AR", daSalvare: "es-AR" });
  });

  it("il profilo vuoto riceve la lingua già scelta su questo telefono (scelta storica, senza utente)", () => {
    expect(decidiLingua({ id: "u1", lingua: null, updated_at: IERI }, scelta({ codice: "de", utente: null, salvata: false }))).toEqual({ codice: "de", daSalvare: "de" });
  });

  it("dopo il salvataggio la copia vecchia del profilo (lingua vuota) non fa risalvare all'infinito", () => {
    expect(decidiLingua({ id: "u1", lingua: null, updated_at: IERI }, scelta({ codice: "de", salvata: true }))).toEqual({ codice: "de", daSalvare: null });
  });

  it("la copia vecchia del profilo (cache del telefono) non rimette la lingua di prima", () => {
    const d = decidiLingua({ id: "u1", lingua: "fr", updated_at: IERI }, scelta({ codice: "ro", quando: OGGI }));
    expect(d).toEqual({ codice: "ro", daSalvare: null });
  });

  it("scelta cambiata su un altro telefono: vince il profilo, più recente", () => {
    const d = decidiLingua({ id: "u1", lingua: "fr", updated_at: OGGI }, scelta({ codice: "ro", quando: IERI }));
    expect(d.codice).toBe("fr");
    expect(d.dispositivo?.codice).toBe("fr");
  });

  it("la scelta di un altro utente sullo stesso telefono non passa al profilo nuovo", () => {
    const d = decidiLingua({ id: "u2", lingua: null, updated_at: IERI }, scelta({ codice: "ro", utente: "u1" }));
    expect(d).toEqual({ codice: "it", daSalvare: null });
  });

  it("legge il formato storico (solo il codice) e scrive quello nuovo, compatibile", () => {
    const a = archivio();
    a.setItem("campo-lingua", "sq");
    expect(leggiSceltaDispositivo(a)).toMatchObject({ codice: "sq", utente: null, salvata: false });
    scriviSceltaDispositivo(scelta({ codice: "ar-EG" }), a);
    expect(leggiSceltaDispositivo(a)).toMatchObject({ codice: "ar-EG", utente: "u1", salvata: true });
    expect(a.dati.get("campo-lingua")).toBe("ar-EG");
    a.setItem("campo-lingua-scelta", "{rotto");
    expect(leggiSceltaDispositivo(a)).toMatchObject({ codice: "ar-EG" });
  });

  it("la colonna del database accetta esattamente le lingue dell'app", () => {
    const sql = readFileSync("supabase/migrations/20290523090000_profiles_lingua.sql", "utf8");
    const nelDb = [...sql.matchAll(/'([a-zA-Z-]+)'/g)].map(m => m[1]).filter(c => linguaDa(c));
    expect(nelDb).toEqual(LINGUE.map(l => l.codice));
  });
});

describe("date, numeri ed euro per lingua", () => {
  const data = new Date("2026-11-23T07:05:00.000Z"); // 08:05 in Italia
  const f = (codice: string) => formatiPer(linguaDa(codice)!);

  it("italiano identico a oggi", () => {
    expect(f("it").data(data)).toBe("23/11/2026");
    expect(f("it").ora(data)).toBe("08:05");
    expect(f("it").numero(1234.5)).toBe("1234,5");
    expect(f("it").euro(1234.5).replace(/\s/g, " ")).toBe("1234,50 €");
  });

  it("inglese con il giorno prima del mese (en-GB), non all'americana", () => {
    expect(f("en").data(data)).toBe("23/11/2026");
    expect(f("en").euro(1234.5)).toBe("€1,234.50");
  });

  it("arabo con le cifre 0–9, uguali al PDF dell'ufficio", () => {
    for (const c of ["ar-MA", "ar-EG"]) {
      expect(localeIntl(linguaDa(c)!)).toBe(`${c}-u-nu-latn`);
      const testo = `${f(c).data(data)} ${f(c).ora(data)} ${f(c).numero(7.5)}`;
      expect(testo, c).not.toMatch(/[٠-٩۰-۹]/);
      expect(testo, c).toContain("08:05");
    }
  });

  it("sempre l'ora del cantiere (Italia) e sempre l'euro", () => {
    for (const l of LINGUE) {
      expect(formatiPer(l).ora(data), l.codice).toContain("08");
      expect(formatiPer(l).euro(10), l.codice).toContain("€");
    }
  });

  it("i calendari delle lingue si caricano tutti", async () => {
    for (const l of LINGUE) {
      const locale = await caricaLocaleDateFns(l.codice);
      expect(locale.code, l.codice).toBeTruthy();
    }
    expect((await caricaLocaleDateFns("en")).code).toBe("en-GB");
    expect((await caricaLocaleDateFns("ar-MA")).code).toBe("ar-MA");
  });
});

describe("arabo da destra a sinistra", () => {
  it("i valori dentro le frasi restano interi e nel loro verso (isolati)", () => {
    expect(traduci({ "{ore} lavorate": "{ore} تخدمو" }, "{ore} lavorate", { ore: "7h 30" }, true)).toBe("\u20687h 30\u2069 تخدمو");
    // Nelle lingue da sinistra a destra niente segni in più: l'italiano resta identico.
    expect(traduci(null, "{ore} lavorate", { ore: "7h 30" })).toBe("7h 30 lavorate");
  });

  it("il foglio rtlCampo.css è aggiornato con le classi delle schermate (rigenera: node scripts/campo/genera-rtl-campo.mjs)", () => {
    const atteso = generaCss(classiFisiche());
    expect(readFileSync("src/lib/campo/lingua/rtlCampo.css", "utf8")).toBe(atteso);
  });

  it("gira i lati senza toccare i riquadri centrati", () => {
    expect(regola("ml-2")).toEqual({ sposta: "margin-right: 0.5rem", azzera: "margin-left: 0px" });
    expect(regola("-left-2.5")).toEqual({ sposta: "right: calc(0.625rem * -1)", azzera: "left: auto" });
    expect(regola("max-sm:pr-1")).toEqual({ sposta: "padding-left: 0.25rem", azzera: "padding-right: 0px" });
    expect(regola("text-left")).toEqual({ sposta: "text-align: right", azzera: null });
    expect(regola("rounded-r-md").sposta).toBe("border-top-left-radius: 0.375rem; border-bottom-left-radius: 0.375rem");
    expect(regola("left-[50%]")).toEqual({ simmetrica: true });
  });

  it("vale solo sotto dir=rtl: in italiano il foglio non tocca niente", () => {
    const css = readFileSync("src/lib/campo/lingua/rtlCampo.css", "utf8");
    const regole = css.split("\n").filter((r: string) => r.includes("{") && !r.startsWith("@media") && !r.startsWith("/*"));
    for (const r of regole) {
      if (r.trim().startsWith(".lucide") || r.trim().startsWith("html[dir=\"rtl\"] :is(")) continue;
      expect(r.trim(), r).toMatch(/^html\[dir="rtl"\] /);
    }
  });
});
