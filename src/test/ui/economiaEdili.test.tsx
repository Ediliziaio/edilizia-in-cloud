/**
 * Lo step Economia degli otto preventivi edili (06/10/2026): prima il prezzo (sconto con i tasti veloci, poi IVA),
 * poi come paga il cliente, poi la detrazione con gli incentivi; e nel computo vuoto un pulsante per andarci.
 * Componenti veri, uno per modulo; i dati dell'azienda (promo, regole di sconto, permessi) sono finti.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { ComponentType } from "react";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { DiscountRule } from "@/hooks/useDiscountRules";

const ctl = vi.hoisted(() => ({ promo: true }));
const template = () => ({ data: ctl.promo ? { finanziamento_promo: { attivo: true, rate: 12, tan_pct: 0 } } : undefined });

vi.mock("@/hooks/useBagniProgetto", () => ({ useBgnTemplatePdf: () => template() }));
vi.mock("@/hooks/useTettiProgetto", () => ({ useTetTemplatePdf: () => template() }));
vi.mock("@/hooks/useClimatizzazioneProgetto", () => ({ useClmTemplatePdf: () => template() }));
vi.mock("@/hooks/useElettricoProgetto", () => ({ useEleTemplatePdf: () => template() }));
vi.mock("@/hooks/useTermoidraulicoProgetto", () => ({ useIdrTemplatePdf: () => template() }));
vi.mock("@/hooks/usePavimentiProgetto", () => ({ usePavTemplatePdf: () => template() }));
vi.mock("@/hooks/usePiscineProgetto", () => ({ usePisTemplatePdf: () => template() }));
vi.mock("@/hooks/useRistrutturazioneProgetto", () => ({ useRstTemplatePdf: () => template() }));
vi.mock("@/hooks/usePrezzoFinaleAMano", () => ({ usePrezzoFinaleAMano: () => ({ data: false, isLoading: false, isError: false }) }));
vi.mock("@/hooks/useDiscountRules", () => ({
  useDiscountRules: () => ({
    data: [{
      id: "r1", company_id: "c1", name: "Standard", scope: "globale", salesperson_id: null, client_category: null, tipo_lavoro: null,
      importo_min: null, importo_max: null, margine_min_pct: 0, sconto_max_pct: 10, approva_oltre_pct: null, priority: 100,
      is_active: true, created_at: "2026-01-01", updated_at: "2026-01-01",
    } as DiscountRule],
  }),
}));
vi.mock("@/hooks/usePermissions", () => ({ usePermissions: () => ({ canApproveDiscounts: false }) }));

import Bagni from "@/pages/azienda/bagni/BagniWizard/StepEconomia";
import Tetti from "@/pages/azienda/tetti/TettiWizard/StepEconomia";
import Climatizzazione from "@/pages/azienda/climatizzazione/ClimatizzazioneWizard/StepEconomia";
import Elettrico from "@/pages/azienda/elettrico/ElettricoWizard/StepEconomia";
import Termoidraulico from "@/pages/azienda/termoidraulico/TermoidraulicoWizard/StepEconomia";
import Pavimenti from "@/pages/azienda/pavimenti/PavimentiWizard/StepEconomia";
import Piscine from "@/pages/azienda/piscine/PiscineWizard/StepEconomia";
import Ristrutturazione from "@/pages/azienda/ristrutturazione/RistrutturazioneWizard/StepEconomia";

interface StepProps {
  form: Record<string, unknown>;
  onChange: (chiave: string, valore: unknown) => void;
  computo: unknown[];
  onVaiAlPasso?: (passo: "computo") => void;
  model?: { id: string } | null;
}

const MODULI: Array<{ modulo: string; cartella: string; prefisso: string; Step: ComponentType<StepProps> }> = [
  { modulo: "bagni", cartella: "Bagni", prefisso: "bgn", Step: Bagni as unknown as ComponentType<StepProps> },
  { modulo: "tetti", cartella: "Tetti", prefisso: "tet", Step: Tetti as unknown as ComponentType<StepProps> },
  { modulo: "climatizzazione", cartella: "Climatizzazione", prefisso: "clm", Step: Climatizzazione as unknown as ComponentType<StepProps> },
  { modulo: "elettrico", cartella: "Elettrico", prefisso: "ele", Step: Elettrico as unknown as ComponentType<StepProps> },
  { modulo: "termoidraulico", cartella: "Termoidraulico", prefisso: "idr", Step: Termoidraulico as unknown as ComponentType<StepProps> },
  { modulo: "pavimenti", cartella: "Pavimenti", prefisso: "pav", Step: Pavimenti as unknown as ComponentType<StepProps> },
  { modulo: "piscine", cartella: "Piscine", prefisso: "pis", Step: Piscine as unknown as ComponentType<StepProps> },
  { modulo: "ristrutturazione", cartella: "Ristrutturazione", prefisso: "rst", Step: Ristrutturazione as unknown as ComponentType<StepProps> },
];

/** Una voce da 20.000 € (IVA esclusa): basta ai conti dei tasti veloci. */
const VOCE = {
  id: "v1", progetto_id: "p1", company_id: "c1", capitolo_nome: "Lavori", descrizione: "Voce", unita_misura: "cad",
  quantita: 1, prezzo_unitario: 20_000, costo_materiali: 0, costo_manodopera: 0, sconto_pct: 0, ordine: 0,
};
const FORM = { company_id: "c1", sconto_pct: 0, iva_pct: 10, detrazione_pct: 0 };

beforeEach(() => { ctl.promo = true; });
afterEach(() => cleanup());

/** a precede b nel documento? */
const prima = (a: Element, b: Element) => Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);
const campo = (id: string) => document.getElementById(id) as HTMLElement;

describe.each(MODULI)("Economia $modulo", ({ prefisso, Step }) => {
  const monta = (extra: Partial<StepProps> = {}) => {
    const onChange = vi.fn();
    render(<Step form={FORM} onChange={onChange} computo={[VOCE]} {...extra} />);
    return onChange;
  };

  it("l'ordine è: sconto, IVA, come paga il cliente, detrazione, incentivi rapidi", () => {
    monta();
    const sconto = campo(`${prefisso}-sconto`);
    const iva = campo(`${prefisso}-iva`);
    const rata = screen.getByText("Mostra la rata nel PDF");
    const detrazione = campo(`${prefisso}-detrazione`);
    const incentivi = screen.getByText(/Incentivi rapidi/);
    expect([sconto, iva, rata, detrazione, incentivi].every(Boolean)).toBe(true);
    expect(prima(sconto, iva)).toBe(true);
    expect(prima(iva, rata)).toBe(true);
    expect(prima(rata, detrazione)).toBe(true);
    expect(prima(detrazione, incentivi)).toBe(true);
  });

  it("senza la promo di finanziamento restano sconto, IVA e poi la detrazione", () => {
    ctl.promo = false;
    monta();
    expect(screen.queryByText("Mostra la rata nel PDF")).toBeNull();
    expect(prima(campo(`${prefisso}-iva`), campo(`${prefisso}-detrazione`))).toBe(true);
  });

  it("sotto lo sconto ci sono i tasti veloci: un clic scrive la percentuale nel preventivo", () => {
    const onChange = monta();
    fireEvent.click(screen.getByRole("button", { name: "5%" }));
    expect(onChange).toHaveBeenCalledWith("sconto_pct", 5);
  });

  it("«Arriva a €» usa l'IVA del preventivo: 20.000 € + 10% = 22.000 €, per 20.900 serve il 5%", () => {
    const onChange = monta();
    fireEvent.change(screen.getByLabelText(/Arriva a €/), { target: { value: "20.900" } });
    fireEvent.click(screen.getByRole("button", { name: "Applica" }));
    expect(onChange).toHaveBeenCalledWith("sconto_pct", 5);
  });

  it("scrivere lo sconto o l'IVA a mano funziona come prima", () => {
    const onChange = monta();
    fireEvent.change(campo(`${prefisso}-sconto`), { target: { value: "7" } });
    expect(onChange).toHaveBeenCalledWith("sconto_pct", 7);
    fireEvent.change(campo(`${prefisso}-iva`), { target: { value: "4" } });
    expect(onChange).toHaveBeenCalledWith("iva_pct", 4);
    fireEvent.change(campo(`${prefisso}-detrazione`), { target: { value: "50" } });
    expect(onChange).toHaveBeenCalledWith("detrazione_pct", 50);
  });

  it("sotto «Mostra la rata nel PDF» si sceglie il numero di rate: di serie quelle del modello (12), un tasto scrive la scelta nel preventivo", () => {
    const onChange = monta();
    const gruppo = screen.getByRole("group", { name: "Numero di rate" });
    const tasto = (n: number) => within(gruppo).getByRole("button", { name: new RegExp(`^${n} rate`) });
    expect(tasto(12).getAttribute("aria-pressed")).toBe("true");
    expect(tasto(48).getAttribute("aria-pressed")).toBe("false");
    fireEvent.click(tasto(48));
    expect(onChange).toHaveBeenCalledWith("finanziamento_rate", 48);
  });

  it("con le rate già scelte sul preventivo (36) è quel tasto a essere premuto", () => {
    monta({ form: { ...FORM, finanziamento_rate: 36 } });
    const gruppo = screen.getByRole("group", { name: "Numero di rate" });
    expect(within(gruppo).getByRole("button", { name: /^36 rate/ }).getAttribute("aria-pressed")).toBe("true");
    expect(within(gruppo).getByRole("button", { name: /^12 rate/ }).getAttribute("aria-pressed")).toBe("false");
  });

  it("senza la promo nel modello non c'è né la rata né la scelta delle rate", () => {
    ctl.promo = false;
    monta();
    expect(screen.queryByRole("group", { name: "Numero di rate" })).toBeNull();
  });

  it("computo vuoto: il pulsante «Vai al Computo» porta al passo del computo", () => {
    const onVaiAlPasso = vi.fn();
    monta({ computo: [], onVaiAlPasso });
    fireEvent.click(screen.getByRole("button", { name: "Vai al Computo" }));
    expect(onVaiAlPasso).toHaveBeenCalledTimes(1);
    expect(onVaiAlPasso).toHaveBeenCalledWith("computo");
  });

  it("computo vuoto senza chi ascolta: il messaggio c'è, il pulsante no", () => {
    monta({ computo: [] });
    expect(screen.getAllByText(/computo/i).length).toBeGreaterThan(0);
    expect(screen.queryByRole("button", { name: "Vai al Computo" })).toBeNull();
  });

  it("col computo pieno non c'è né il messaggio né il pulsante", () => {
    monta({ onVaiAlPasso: vi.fn() });
    expect(screen.queryByRole("button", { name: "Vai al Computo" })).toBeNull();
    expect(screen.queryByText(/Il computo è ancora vuoto/)).toBeNull();
  });
});

describe("Termoidraulico: Conto Termico e Casa Full Electric", () => {
  it.each(["conto-termico", "full-electric"])("con «%s» la detrazione generica lascia il posto ai loro incentivi, sconto e IVA restano", (id) => {
    render(<Termoidraulico form={FORM as never} onChange={vi.fn()} computo={[VOCE] as never} model={{ id }} />);
    expect(campo("idr-sconto")).toBeTruthy();
    expect(campo("idr-iva")).toBeTruthy();
    expect(campo("idr-detrazione")).toBeNull();
    expect(screen.queryByText(/Incentivi rapidi/)).toBeNull();
  });
});

describe("i wizard passano al passo Economia il modo di andare al Computo", () => {
  it.each(MODULI)("$modulo", ({ cartella, modulo }) => {
    const sorgente = readFileSync(join(process.cwd(), `src/pages/azienda/${modulo}/${cartella}Wizard.tsx`), "utf8");
    const chiamata = sorgente.match(/<StepEconomia\b[\s\S]*?\/>/);
    expect(chiamata).not.toBeNull();
    expect(chiamata?.[0]).toContain("onVaiAlPasso={(passo) => void handleStepClick(passo)}");
  });
});
