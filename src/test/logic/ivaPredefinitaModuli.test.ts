// L'IVA di riserva degli otto moduli edili è quella della colonna nel database
// (05/10/2026). Prima l'editor del computo partiva dal 22% anche dove la tabella
// dice 10% (bagni, tetti) e lo step Economia e il salvataggio dal 10% dove la
// tabella dice 22%: la stessa bozza mostrava due IVA diverse.
//
// Default delle colonne (letti dal database il 05/10/2026, uguali alle migrazioni):
//   <modulo>_progetti.iva_pct           bgn 10, tet 10, rst 22, clm/ele/idr/pav/pis 22
//   <modulo>_template_pdf.default_iva_pct  bgn 10, tet 10, rst 10, clm/ele/idr/pav/pis 22
// (20271101020000_bgn_modulo, 20271102020000_tet_modulo, 20271001000000_rst_modulo_wave1,
//  20271001030000_rst_personalization, 20271103020000_clm_modulo, 20271104020000_ele_modulo,
//  20271105020000_idr_modulo, 20271106020000_pav_modulo, 20271107020000_pis_modulo).
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const SRC = join(__dirname, "../..");
const leggi = (percorso: string) => readFileSync(join(SRC, percorso), "utf8");

const MODULI = [
  { cartella: "bagni", wizard: "BagniWizard", hook: "Bagni", progetto: 10, template: 10 },
  { cartella: "tetti", wizard: "TettiWizard", hook: "Tetti", progetto: 10, template: 10 },
  { cartella: "ristrutturazione", wizard: "RistrutturazioneWizard", hook: "Ristrutturazione", progetto: 22, template: 10 },
  { cartella: "climatizzazione", wizard: "ClimatizzazioneWizard", hook: "Climatizzazione", progetto: 22, template: 22 },
  { cartella: "elettrico", wizard: "ElettricoWizard", hook: "Elettrico", progetto: 22, template: 22 },
  { cartella: "termoidraulico", wizard: "TermoidraulicoWizard", hook: "Termoidraulico", progetto: 22, template: 22 },
  { cartella: "pavimenti", wizard: "PavimentiWizard", hook: "Pavimenti", progetto: 22, template: 22 },
  { cartella: "piscine", wizard: "PiscineWizard", hook: "Piscine", progetto: 22, template: 22 },
] as const;

describe.each(MODULI)("IVA di riserva del modulo $cartella", ({ cartella, wizard, hook, progetto, template }) => {
  it(`editor del computo: ${progetto}%`, () => {
    const editor = leggi(`components/${cartella}/ComputoEditor/ComputoEditor.tsx`);
    expect(editor).toContain(`ivaPct = ${progetto},`);
  });

  it(`step Economia: ${progetto}% nel calcolo e nel campo`, () => {
    const economia = leggi(`pages/azienda/${cartella}/${wizard}/StepEconomia.tsx`);
    expect(economia).toContain(`Number(form.iva_pct ?? ${progetto})`);
    expect(economia).toContain(`value={form.iva_pct ?? ${progetto}}`);
    expect(economia).not.toMatch(new RegExp(`iva_pct \\?\\? ${progetto === 10 ? 22 : 10}\\b`));
  });

  it(`salvataggio: totali al ${progetto}%, template al ${template}%`, () => {
    const sorgente = leggi(`hooks/use${hook}Progetto.ts`);
    expect(sorgente).toContain(`Number(parametri.iva_pct ?? ${progetto})`);
    expect(sorgente).toContain(`default_iva_pct: (r.default_iva_pct as number | null) ?? ${template},`);
  });
});
