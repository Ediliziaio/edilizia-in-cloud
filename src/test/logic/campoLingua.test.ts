import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { LINGUE, linguaDelTelefono } from "@/lib/campo/lingua/lingue";
import { traduci } from "@/lib/campo/lingua/LinguaCampo";
import ro from "@/lib/campo/lingua/dizionari/ro?dizionario";
import sq from "@/lib/campo/lingua/dizionari/sq?dizionario";
import arMA from "@/lib/campo/lingua/dizionari/arMA?dizionario";
import arEG from "@/lib/campo/lingua/dizionari/arEG?dizionario";
import de from "@/lib/campo/lingua/dizionari/de?dizionario";
import fr from "@/lib/campo/lingua/dizionari/fr?dizionario";
import en from "@/lib/campo/lingua/dizionari/en?dizionario";
import es from "@/lib/campo/lingua/dizionari/es?dizionario";
import esAR from "@/lib/campo/lingua/dizionari/esAR?dizionario";
import esPE from "@/lib/campo/lingua/dizionari/esPE?dizionario";

const DIZIONARI = { ro, sq, arMA, arEG, de, fr, en, es, esAR, esPE };
const segnaposti = (s: string) => (s.match(/\{\w+\}/g) ?? []).sort();

describe("Lingue dell'area operai (23/11/2026)", () => {
  it("11 lingue, arabo da destra a sinistra", () => {
    expect(LINGUE.map(l => l.codice)).toEqual(["it", "ro", "sq", "ar-MA", "ar-EG", "de", "fr", "en", "es", "es-AR", "es-PE"]);
    expect(LINGUE.filter(l => l.rtl).map(l => l.codice)).toEqual(["ar-MA", "ar-EG"]);
  });

  it("propone la lingua del telefono", () => {
    expect(linguaDelTelefono(["ro-RO", "it-IT"])).toBe("ro");
    expect(linguaDelTelefono(["sq"])).toBe("sq");
    expect(linguaDelTelefono(["es-AR"])).toBe("es-AR");
    expect(linguaDelTelefono(["es-PE"])).toBe("es-PE");
    expect(linguaDelTelefono(["es-ES"])).toBe("es");
    expect(linguaDelTelefono(["ar-EG"])).toBe("ar-EG");
    expect(linguaDelTelefono(["ar"])).toBe("ar-MA");
    expect(linguaDelTelefono(["pt-BR", "en-US"])).toBe("en");
    expect(linguaDelTelefono(["zh-CN"])).toBeNull();
  });

  it("senza traduzione resta l'italiano; i valori entrano al loro posto", () => {
    expect(traduci(null, "Rapportino del {data}", { data: "22 nov" })).toBe("Rapportino del 22 nov");
    expect(traduci({ "Ciao": "Salut" }, "Frase nuova")).toBe("Frase nuova");
    expect(traduci(en, "Rapportino del {data}", { data: "22 nov" })).toContain("22 nov");
  });

  it("ogni traduzione ha gli stessi segnaposto dell'italiano", () => {
    // Mezzo milione di voci: si raccolgono i difetti e si asserisce una volta
    // sola (un expect per voce fa scadere il tempo del test).
    const difetti: string[] = [];
    for (const [nome, d] of Object.entries(DIZIONARI)) {
      for (const [chiave, valore] of Object.entries(d)) {
        if (valore.trim() === "") { difetti.push(`${nome}: traduzione vuota per «${chiave}»`); continue; }
        const attesi = segnaposti(chiave).join(","), trovati = segnaposti(valore).join(",");
        if (attesi !== trovati) difetti.push(`${nome}: «${chiave}» → segnaposto [${trovati}] invece di [${attesi}]`);
      }
    }
    expect(difetti.slice(0, 20)).toEqual([]);
  });

  it("le frasi delle schermate tradotte ci sono in tutte le lingue", () => {
    // Ogni file dell'area operai che usa la lingua (più i componenti condivisi che il campo mostra).
    const cartelle = ["src/pages/campo", "src/components/campo", "src/components/calendar/mappa",
      // Editor del sopralluogo: l'operaio lo apre da /campo/sopralluoghi/:id.
      "src/components/sopralluoghi", "src/components/surveys/engine"];
    const schermate = [
      // Anche le sottocartelle (es. src/pages/campo/subappaltatore).
      ...cartelle.flatMap(c => (readdirSync(c, { recursive: true }) as string[]).filter(f => f.endsWith(".tsx")).map(f => join(c, f))),
      "src/components/layouts/CampoLayout.tsx", "src/pages/azienda/InternalChat.tsx",
      "src/pages/azienda/impostazioni/MioProfilo.tsx", "src/pages/azienda/sopralluoghi/SopralluogoEditor.tsx",
      // Campanella comune: nel campo si traduce (anche le notifiche, vedi lib/campo/lingua/notifiche.ts).
      "src/components/notifications/NotificationsBellPopover.tsx", "src/components/notifications/PannelloNotifiche.tsx",
    ].filter(f => /\b(useT|useLinguaCampo)\b/.test(readFileSync(f, "utf8")));
    const frasi = new Set<string>();
    for (const file of schermate) {
      for (const m of readFileSync(file, "utf8").matchAll(/\b(?:t|tr)\(\s*"((?:[^"\\]|\\.)*)"/g)) frasi.add(JSON.parse(`"${m[1]}"`));
    }
    expect(frasi.size).toBeGreaterThan(1000);
    for (const [nome, d] of Object.entries(DIZIONARI)) {
      if (nome === "esAR" || nome === "esPE") continue;
      const mancanti = [...frasi].filter(f => !(f in d));
      expect(mancanti, nome).toEqual([]);
    }
  });
});
