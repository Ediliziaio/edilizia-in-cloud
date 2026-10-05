// I preventivatori col guscio comune (fasi in alto, anteprima a destra, piede fisso).
//
// Due cose si rompono in silenzio, e questo test le tiene ferme:
//  1. la rotta di un modulo che usa il guscio deve avere l'altezza bloccata
//     (`rottaDelGuscio` → CompanyLayout): senza, scorre il documento intero e
//     barra, anteprima e piede non restano fermi — e nessun errore lo dice;
//  2. i totali stanno in UN posto, l'anteprima: se un editor o lo step Economia
//     rimette un riepilogo suo, i numeri di due schermi possono divergere.
import { describe, expect, it } from "vitest";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { MODULI_COL_GUSCIO, rottaDelGuscio } from "@/components/preventivatore/rotte";

const SRC = join(__dirname, "../..");
const leggi = (percorso: string) => readFileSync(join(SRC, percorso), "utf8");

const EDILI = [
  { cartella: "bagni", wizard: "BagniWizard" },
  { cartella: "climatizzazione", wizard: "ClimatizzazioneWizard" },
  { cartella: "elettrico", wizard: "ElettricoWizard" },
  { cartella: "pavimenti", wizard: "PavimentiWizard" },
  { cartella: "piscine", wizard: "PiscineWizard" },
  { cartella: "ristrutturazione", wizard: "RistrutturazioneWizard" },
  { cartella: "termoidraulico", wizard: "TermoidraulicoWizard" },
  { cartella: "tetti", wizard: "TettiWizard" },
] as const;

describe("rotte con l'altezza bloccata", () => {
  it("coincidono con i wizard che importano il guscio comune", () => {
    const radice = join(SRC, "pages/azienda");
    const conGuscio = readdirSync(radice, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => d.name)
      .filter((cartella) =>
        readdirSync(join(radice, cartella)).some(
          (f) => f.endsWith("Wizard.tsx") && leggi(`pages/azienda/${cartella}/${f}`).includes("@/components/preventivatore"),
        ),
      );
    // la cartella del modulo è l'ultimo pezzo del percorso («marketing/fotovoltaico» → fotovoltaico)
    expect([...conGuscio].sort()).toEqual(MODULI_COL_GUSCIO.map((m) => m.split("/").pop()).sort());
  });

  it("nuovo e modifica sì; elenco, listino e altri preventivatori no", () => {
    for (const modulo of MODULI_COL_GUSCIO) {
      expect(rottaDelGuscio(`/azienda/${modulo}/nuovo`)).toBe(true);
      expect(rottaDelGuscio(`/azienda/${modulo}/9f1c2d3e-0000-4000-8000-000000000000/modifica`)).toBe(true);
      expect(rottaDelGuscio(`/azienda/${modulo}/nuovo/`)).toBe(true);
      expect(rottaDelGuscio(`/azienda/${modulo}`)).toBe(false);
      expect(rottaDelGuscio(`/azienda/${modulo}/listino`)).toBe(false);
    }
    expect(rottaDelGuscio("/azienda/marketing/preventivi/nuovo")).toBe(false);
    expect(rottaDelGuscio("/azienda/fotovoltaico/nuovo")).toBe(false); // il Fotovoltaico sta sotto «marketing»
    // …e lì l'elenco, i componenti e la scheda del progetto non sono il wizard
    expect(rottaDelGuscio("/azienda/marketing/fotovoltaico")).toBe(false);
    expect(rottaDelGuscio("/azienda/marketing/fotovoltaico/componenti")).toBe(false);
    expect(rottaDelGuscio("/azienda/marketing/fotovoltaico/9f1c2d3e-0000-4000-8000-000000000000")).toBe(false);
    expect(rottaDelGuscio("/azienda/bagni/nuovo/altro")).toBe(false);
  });

  it("ogni rotta dell'elenco esiste davvero nelle rotte dell'app", () => {
    const rotte = leggi("routes/companyRoutes.tsx");
    for (const modulo of MODULI_COL_GUSCIO) {
      expect(rotte).toContain(`path="${modulo}/nuovo"`);
      expect(rotte).toContain(`path="${modulo}/:id/modifica"`);
    }
  });
});

describe.each(EDILI)("$cartella nel preventivatore unico", ({ cartella, wizard }) => {
  const pagina = leggi(`pages/azienda/${cartella}/${wizard}.tsx`);
  const passi = `pages/azienda/${cartella}/${wizard}`;

  it("il wizard usa il guscio comune, con le fasi in alto e l'anteprima live", () => {
    expect(pagina).toContain("<GuscioEdile");
    expect(pagina).toContain("anteprimaComputo(");
    expect(pagina).toContain("onVociChange={setComputoLive}");
    // niente più testata fissa, stepper a parte, barra laterale dei passi né pulsanti in fondo fatti a mano
    expect(pagina).not.toContain("Sidebar step (desktop)");
    expect(pagina).not.toContain("Stepper mobile");
    expect(pagina).not.toContain("Navigation footer");
  });

  it("lo step Computo manda su le voci e il suo salvataggio, e non riceve più i totali", () => {
    const step = leggi(`${passi}/StepComputo.tsx`);
    expect(step).toContain("onVociChange?.(next)");
    expect(step).toContain("onStato");
    // il salvataggio all'uscita dal passo dice com'è andato, e se è fallito il passo riparte «da salvare»
    expect(step).toContain('statoRef.current?.("modifiche")');
    expect(step).toContain("useState(initialDirty)");
    expect(pagina).toContain('initialDirty={statoComputo === "modifiche"}');
    expect(step).not.toMatch(/scontoPct|ivaPct|prezzoManuale/);
    expect(pagina).not.toMatch(/scontoPct=|ivaPct=|prezzoManuale=/);
  });

  it("l'editor del computo non ha il riepilogo a destra", () => {
    const editor = leggi(`components/${cartella}/ComputoEditor/ComputoEditor.tsx`);
    expect(editor).not.toContain("lg:grid-cols-[1fr_300px]");
    expect(editor).not.toContain("Riepilogo computo");
    expect(editor).not.toContain("Totale preventivo");
    expect(editor).not.toMatch(/<aside\b/);
  });

  it("lo step Economia ha i parametri e non ripete riepilogo, totali e margine", () => {
    const economia = leggi(`${passi}/StepEconomia.tsx`);
    expect(economia).toContain("Parametri");
    expect(economia).not.toContain("Riepilogo per capitolo");
    expect(economia).not.toContain("Totali complessivi");
    expect(economia).not.toContain("Margine complessivo");
    expect(economia).not.toContain("SummaryRow");
  });

  it("i file del modulo ci sono tutti (il test non guarda il vuoto)", () => {
    expect(existsSync(join(SRC, `${passi}/StepComputo.tsx`))).toBe(true);
    expect(existsSync(join(SRC, `${passi}/StepEconomia.tsx`))).toBe(true);
  });
});

describe("Ristrutturazione: ciò che non è un totale resta", () => {
  it("il verdetto «Prezzo di zona» sta sotto il computo, il riepilogo per ambiente in Economia", () => {
    const editor = leggi("components/ristrutturazione/ComputoEditor/ComputoEditor.tsx");
    expect(editor).toContain("<PrezzoDiZonaRiepilogo");
    const economia = leggi("pages/azienda/ristrutturazione/RistrutturazioneWizard/StepEconomia.tsx");
    expect(economia).toContain("Riepilogo per ambiente");
  });
});

describe("Termoidraulico: Conto Termico e Casa Full Electric", () => {
  it("i loro incentivi restano nello step Economia e l'anteprima non mostra la detrazione generica", () => {
    const economia = leggi("pages/azienda/termoidraulico/TermoidraulicoWizard/StepEconomia.tsx");
    expect(economia).toContain("<ContoTermicoEconomia");
    expect(economia).toContain("<FullElectricEconomia");
    const pagina = leggi("pages/azienda/termoidraulico/TermoidraulicoWizard.tsx");
    expect(pagina).toContain('senzaDetrazione: model?.id === "conto-termico" || model?.id === "full-electric"');
  });
});
