// L'IVA di riserva degli otto moduli edili è quella della colonna nel database
// (05/10/2026). Prima l'editor del computo partiva dal 22% anche dove la tabella
// dice 10% (bagni, tetti) e lo step Economia e il salvataggio dal 10% dove la
// tabella dice 22%: la stessa bozza mostrava due IVA diverse.
// Dal preventivatore unico l'editor non calcola più i totali: l'IVA di riserva
// dell'anteprima a destra la dice il wizard (`ivaDefault`).
//
// Dal 27/10/2026 l'IVA di riserva è una sola, `IVA_PREDEFINITA_PCT` (10%), e la
// migrazione 20281027143000 ha portato a 10 anche i default delle colonne che
// erano a 22. Default delle colonne dopo quella migrazione, per tutti e otto:
//   <modulo>_progetti.iva_pct                 10
//   <modulo>_template_pdf.default_iva_pct     10
// Quindi anteprima, step Economia, salvataggio e modello devono leggere tutti la
// stessa costante: un'aliquota scritta a mano farebbe di nuovo divergere la bozza.
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { IVA_PREDEFINITA_PCT } from "@/lib/preventivi/ivaPredefinita";

const SRC = join(__dirname, "../..");
const leggi = (percorso: string) => readFileSync(join(SRC, percorso), "utf8");

const MODULI = [
  { cartella: "bagni", wizard: "BagniWizard", hook: "Bagni" },
  { cartella: "tetti", wizard: "TettiWizard", hook: "Tetti" },
  { cartella: "ristrutturazione", wizard: "RistrutturazioneWizard", hook: "Ristrutturazione" },
  { cartella: "climatizzazione", wizard: "ClimatizzazioneWizard", hook: "Climatizzazione" },
  { cartella: "elettrico", wizard: "ElettricoWizard", hook: "Elettrico" },
  { cartella: "termoidraulico", wizard: "TermoidraulicoWizard", hook: "Termoidraulico" },
  { cartella: "pavimenti", wizard: "PavimentiWizard", hook: "Pavimenti" },
  { cartella: "piscine", wizard: "PiscineWizard", hook: "Piscine" },
] as const;

const IMPORT_COSTANTE = `import { IVA_PREDEFINITA_PCT } from "@/lib/preventivi/ivaPredefinita";`;

it("l'IVA di riserva comune è il 10%, come il default delle colonne", () => {
  expect(IVA_PREDEFINITA_PCT).toBe(10);
});

describe.each(MODULI)("IVA di riserva del modulo $cartella", ({ cartella, wizard, hook }) => {
  it("anteprima a destra: l'IVA di riserva comune, come la colonna del database", () => {
    const pagina = leggi(`pages/azienda/${cartella}/${wizard}.tsx`);
    expect(pagina).toContain(IMPORT_COSTANTE);
    expect(pagina).toContain("ivaDefault: IVA_PREDEFINITA_PCT,");
    expect(pagina).not.toMatch(/ivaDefault:\s*\d/);
  });

  it("editor del computo: nessuna IVA, i totali non sono più lì", () => {
    const editor = leggi(`components/${cartella}/ComputoEditor/ComputoEditor.tsx`);
    expect(editor).not.toMatch(/ivaPct|scontoPct|calcTotaliComputo/);
  });

  it("step Economia: l'IVA di riserva comune nel calcolo e nel campo", () => {
    const economia = leggi(`pages/azienda/${cartella}/${wizard}/StepEconomia.tsx`);
    expect(economia).toContain(IMPORT_COSTANTE);
    expect(economia).toContain("Number(form.iva_pct ?? IVA_PREDEFINITA_PCT)");
    expect(economia).toContain("value={form.iva_pct ?? IVA_PREDEFINITA_PCT}");
    expect(economia).not.toMatch(/iva_pct \?\? \d/);
  });

  it("salvataggio e modello: totali e template con l'IVA di riserva comune", () => {
    const sorgente = leggi(`hooks/use${hook}Progetto.ts`);
    expect(sorgente).toContain(IMPORT_COSTANTE);
    expect(sorgente).toContain("Number(parametri.iva_pct ?? IVA_PREDEFINITA_PCT)");
    expect(sorgente).toContain("default_iva_pct: (r.default_iva_pct as number | null) ?? IVA_PREDEFINITA_PCT,");
    expect(sorgente).not.toMatch(/iva_pct(?: as number \| null\))? \?\? \d/);
  });
});
