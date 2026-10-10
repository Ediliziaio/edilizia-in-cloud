/**
 * I rimandi alle Impostazioni (10/10/2026).
 *
 * Il menu è cambiato più volte e in giro per l'app restavano frasi che mandavano a pagine che non esistono più:
 * «Impostazioni → Tariffe aziendali», «Impostazioni → Template Moduli Vendita → Serramenti», «Impostazioni → Bundle &
 * Pacchetti», «Impostazioni → Listino prodotti». Chi le leggeva cercava nel menu un nome che non c'era.
 * Qui si fissa che quei file dicano i nomi di oggi, e che i nomi di oggi esistano davvero nel menu: se qualcuno
 * rinomina una scheda, questo test dice quali frasi vanno aggiornate.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { GRUPPI_IMPOSTAZIONI } from "@/lib/impostazioni/gruppiImpostazioni";

const leggi = (file: string) => readFileSync(file, "utf8");
const conta = (testo: string, frammento: string) => testo.split(frammento).length - 1;

const MANODOPERA = "Impostazioni → Listino → Manodopera e servizi";
const KIT = "Impostazioni → Listino → Kit e pacchetti";
const MODULO_SERRAMENTI = "Impostazioni → Modelli di preventivo → Moduli → Serramenti";
const TIPOLOGIE = "Impostazioni → Listino → Tipologie";

/** Dove stanno i rimandi, e quante volte compare il nome di oggi (comprese le righe di commento). */
const RIMANDI: { file: string; nuovi: [string, number][] }[] = [
  { file: "src/components/serramenti/ServiziSection.tsx", nuovi: [[MANODOPERA, 5], ["«Manodopera e servizi» del listino", 1]] },
  { file: "src/components/quotes/MatchTariffaPickerDialog.tsx", nuovi: [[MANODOPERA, 1]] },
  { file: "src/components/serramenti/StepContenuti.tsx", nuovi: [[MODULO_SERRAMENTI, 3], ["libreria dei modelli", 6]] },
  { file: "src/components/marketing/preventivi/ApplyBundleDialog.tsx", nuovi: [[KIT, 1], ["installa i pacchetti di esempio", 1]] },
  { file: "src/components/serramenti/ListinoPickerDialog.tsx", nuovi: [["collegale da Impostazioni → Listino.", 1], ["(Impostazioni → Listino).", 1]] },
  { file: "src/components/listino/TariffaProdottiCollegati.tsx", nuovi: [["Vai in <strong>Listino → modifica un prodotto", 1], ["Vai al listino per collegarne altri", 1]] },
  { file: "src/components/fotovoltaico/FotovoltaicoTemplateEditor.tsx", nuovi: [["Apri il listino", 1], ["Impostazioni → Modelli di preventivo", 1]] },
  { file: "src/components/listino/MacroCategorieManager.tsx", nuovi: [["Impostazioni → Modelli di preventivo → Moduli → Serramenti (o Fotovoltaico)", 1], ["<strong>Listino</strong>", 1]] },
  { file: "src/components/listino/DynamicFieldsRenderer.tsx", nuovi: [[TIPOLOGIE, 1]] },
];

/** I nomi che non esistono più: in nessuno di questi file. */
const NOMI_VECCHI: [string, RegExp][] = [
  ["Tariffe aziendali", /Tariffe aziendali/],
  ["Impostazioni → Tariffe", /Impostazioni → Tariffe/],
  ["Template Moduli Vendita", /Template Moduli Vendita/],
  ["Libreria Template Preventivi", /Libreria Template Preventivi/],
  ["Bundle & Pacchetti", /Bundle (&|&amp;) Pacchetti/],
  ["Impostazioni → Listino prodotti", /Impostazioni → Listino prodotti/],
  ["Listino prodotti →", /Listino prodotti →/],
  ["Impostazioni → Preventivi Serramenti", /Impostazioni → Preventivi Serramenti/],
  ["Listino → Macrocategorie", /Listino → Macrocategorie/],
  ["libreria template", /libreria template/i],
  ["listino tariffe aziendali", /listino tariffe aziendali/i],
];

describe("Rimandi alle Impostazioni: i nomi di oggi", () => {
  describe.each(RIMANDI)("$file", ({ file, nuovi }) => {
    const testo = leggi(file);
    it.each(NOMI_VECCHI)("non dice più «%s»", (_nome, vecchio) => {
      expect(testo).not.toMatch(vecchio);
    });
    it.each(nuovi)("dice «%s»", (nuovo, volte) => {
      expect(conta(testo, nuovo)).toBe(volte);
    });
  });
});

describe("Rimandi alle Impostazioni: i nomi di oggi esistono nel menu", () => {
  const schede = (gruppo: string) => GRUPPI_IMPOSTAZIONI.find((g) => g.titolo === gruppo)?.schede.map((s) => s.etichetta) ?? [];

  it("«Listino» ha le schede Prodotti (la prima), Manodopera e servizi, Kit e pacchetti", () => {
    expect(schede("Listino")[0]).toBe("Prodotti");
    expect(schede("Listino")).toEqual(expect.arrayContaining(["Manodopera e servizi", "Kit e pacchetti"]));
  });

  it("«Modelli di preventivo» ha la scheda Modelli, e dentro i Moduli (serramenti, fotovoltaico…)", () => {
    expect(schede("Modelli di preventivo")).toContain("Modelli");
    expect(leggi("src/pages/azienda/settings/SettingsQuoteTemplates.tsx")).toMatch(/<TabsTrigger value="moduli-vendita"[\s\S]*?Moduli/);
  });

  it("«Tipologie» è il pulsante del Listino che apre la gestione delle tipologie", () => {
    expect(leggi("src/components/listino/ListinoBarra.tsx")).toMatch(/<span className="hidden sm:inline">Tipologie<\/span>/);
  });

  it("le frasi dei rimandi usano proprio quei nomi", () => {
    const nomiNelleFrasi = [MANODOPERA, KIT, MODULO_SERRAMENTI, TIPOLOGIE].flatMap((frase) => frase.split(" → ").slice(1));
    const gruppiESchede = new Set(GRUPPI_IMPOSTAZIONI.flatMap((g) => [g.titolo, ...g.schede.map((s) => s.etichetta)]));
    // Moduli e Serramenti sono le linguette interne dei Modelli, Tipologie un pulsante del Listino: li controllano i test sopra.
    const internoAiModelliOAlListino = new Set(["Moduli", "Serramenti", "Tipologie"]);
    for (const nome of nomiNelleFrasi) {
      expect(gruppiESchede.has(nome) || internoAiModelliOAlListino.has(nome), nome).toBe(true);
    }
  });
});
