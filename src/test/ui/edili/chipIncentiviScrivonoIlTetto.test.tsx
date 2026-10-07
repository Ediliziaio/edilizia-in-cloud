/**
 * I chip degli «Incentivi rapidi» nello step Economia degli otto edili (06/10/2026): un tocco scrive la
 * percentuale della detrazione E il suo tetto di spesa (96.000 € per il 50% e il 36%, niente tetto per «Nessuna»).
 *
 * Nei Tetti il chip scriveva solo la percentuale: chi sceglieva «Prima casa 50%» otteneva un preventivo con il 50% ma
 * senza tetto, e sopra i 96.000 € di imponibile la detrazione promessa al cliente (anteprima e PDF) saliva oltre il
 * limite di legge. Gli altri sette moduli scrivevano già anche il tetto: qui sono provati tutti e otto allo stesso modo,
 * così non si separano più. Componenti veri, i dati dell'azienda (modello, permessi, regole di sconto) sono finti.
 */
import type { ComponentType } from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.setConfig({ testTimeout: 30_000 });

const template = () => ({ data: { finanziamento_promo: { attivo: true, rate: 12, tan_pct: 0 } } });
vi.mock("@/hooks/useBagniProgetto", () => ({ useBgnTemplatePdf: () => template() }));
vi.mock("@/hooks/useTettiProgetto", () => ({ useTetTemplatePdf: () => template() }));
vi.mock("@/hooks/useClimatizzazioneProgetto", () => ({ useClmTemplatePdf: () => template() }));
vi.mock("@/hooks/useElettricoProgetto", () => ({ useEleTemplatePdf: () => template() }));
vi.mock("@/hooks/useTermoidraulicoProgetto", () => ({ useIdrTemplatePdf: () => template() }));
vi.mock("@/hooks/usePavimentiProgetto", () => ({ usePavTemplatePdf: () => template() }));
vi.mock("@/hooks/usePiscineProgetto", () => ({ usePisTemplatePdf: () => template() }));
vi.mock("@/hooks/useRistrutturazioneProgetto", () => ({ useRstTemplatePdf: () => template() }));
vi.mock("@/hooks/usePrezzoFinaleAMano", () => ({ usePrezzoFinaleAMano: () => ({ data: false, isLoading: false, isError: false }) }));
vi.mock("@/hooks/useDiscountRules", () => ({ useDiscountRules: () => ({ data: [] as unknown[] }) }));
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
}

const MODULI: Array<{ modulo: string; Step: ComponentType<StepProps>; ha36: boolean }> = [
  { modulo: "bagni", Step: Bagni as unknown as ComponentType<StepProps>, ha36: true },
  { modulo: "tetti", Step: Tetti as unknown as ComponentType<StepProps>, ha36: true },
  { modulo: "climatizzazione", Step: Climatizzazione as unknown as ComponentType<StepProps>, ha36: true },
  { modulo: "elettrico", Step: Elettrico as unknown as ComponentType<StepProps>, ha36: true },
  { modulo: "termoidraulico", Step: Termoidraulico as unknown as ComponentType<StepProps>, ha36: true },
  { modulo: "pavimenti", Step: Pavimenti as unknown as ComponentType<StepProps>, ha36: true },
  // Le piscine hanno solo «Nessuna» e «Prima casa 50%»: la piscina in sé non accede ai bonus.
  { modulo: "piscine", Step: Piscine as unknown as ComponentType<StepProps>, ha36: false },
  { modulo: "ristrutturazione", Step: Ristrutturazione as unknown as ComponentType<StepProps>, ha36: true },
];

const VOCE = {
  id: "v1", progetto_id: "p1", company_id: "c1", capitolo_nome: "Lavori", descrizione: "Voce", unita_misura: "cad",
  quantita: 1, prezzo_unitario: 20_000, costo_materiali: 0, costo_manodopera: 0, sconto_pct: 0, ordine: 0,
};
const FORM_BASE = { company_id: "c1", sconto_pct: 0, iva_pct: 10, detrazione_pct: 0, massimale_detrazione: null as number | null };

afterEach(() => cleanup());

/** Il chip è «acceso» (verde) o spento (bianco)? */
const acceso = (nome: string | RegExp): boolean =>
  screen.getByRole("button", { name: nome }).className.split(/\s+/).includes("text-emerald-700");

describe.each(MODULI)("chip degli incentivi: $modulo", ({ Step, ha36 }) => {
  const monta = (form: Record<string, unknown> = FORM_BASE) => {
    const onChange = vi.fn();
    render(<Step form={form} onChange={onChange} computo={[VOCE]} />);
    return onChange;
  };

  it("«Prima casa 50%» scrive il 50% e il tetto di 96.000 €", () => {
    const onChange = monta();
    fireEvent.click(screen.getByRole("button", { name: "Prima casa 50%" }));
    expect(onChange).toHaveBeenCalledWith("detrazione_pct", 50);
    expect(onChange).toHaveBeenCalledWith("massimale_detrazione", 96_000);
  });

  it.runIf(ha36)("«Altre abitazioni 36%» scrive il 36% e il tetto di 96.000 €", () => {
    const onChange = monta();
    fireEvent.click(screen.getByRole("button", { name: "Altre abitazioni 36%" }));
    expect(onChange).toHaveBeenCalledWith("detrazione_pct", 36);
    expect(onChange).toHaveBeenCalledWith("massimale_detrazione", 96_000);
  });

  it("«Nessuna» toglie la detrazione e anche il tetto (null, non zero)", () => {
    const onChange = monta({ ...FORM_BASE, detrazione_pct: 50, massimale_detrazione: 96_000 });
    fireEvent.click(screen.getByRole("button", { name: "Nessuna" }));
    expect(onChange).toHaveBeenCalledWith("detrazione_pct", 0);
    expect(onChange).toHaveBeenCalledWith("massimale_detrazione", null);
  });

  it("il chip è acceso solo se coincidono percentuale E tetto: un 50% senza tetto non accende «Prima casa 50%»", () => {
    monta({ ...FORM_BASE, detrazione_pct: 50, massimale_detrazione: 96_000 });
    expect(acceso("Prima casa 50%")).toBe(true);
    cleanup();
    // Un preventivo vecchio (50% scritto a mano, nessun tetto): il chip si offre per aggiungere il tetto.
    monta({ ...FORM_BASE, detrazione_pct: 50, massimale_detrazione: null });
    expect(acceso("Prima casa 50%")).toBe(false);
  });

  it("«Nessuna» è accesa con detrazione 0 e nessun tetto", () => {
    monta(FORM_BASE);
    expect(acceso("Nessuna")).toBe(true);
    expect(acceso("Prima casa 50%")).toBe(false);
  });
});
