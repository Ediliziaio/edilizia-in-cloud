/**
 * Lo sconto veloce (06/10/2026): i tasti «Nessuno / 5% / 10%» e «Arriva a €», da solo e dentro il campo dello sconto
 * globale dei preventivatori edili. Componenti veri; le regole di scontistica sono finte e scelte dal test.
 */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { DiscountRule } from "@/hooks/useDiscountRules";
import { formatCurrency } from "@/lib/formatters";

const regoleMock = vi.hoisted(() => ({ value: [] as DiscountRule[] }));
const permessiMock = vi.hoisted(() => ({ canApproveDiscounts: false }));

vi.mock("@/hooks/useDiscountRules", () => ({ useDiscountRules: () => ({ data: regoleMock.value }) }));
vi.mock("@/hooks/usePermissions", () => ({ usePermissions: () => permessiMock }));

import { ScontoRapido } from "@/components/preventivi/ScontoRapido";
import { ScontoGlobaleField } from "@/components/preventivi/ScontoGlobaleField";

/** Come Testing Library vede il testo: gli spazi (anche quello non divisibile di «1.000,00 €») contano come uno. */
const testo = (s: string) => s.replace(/\s/g, " ");
const euro = (n: number) => testo(formatCurrency(n));

const regola = (patch: Partial<DiscountRule>): DiscountRule => ({
  id: "r1", company_id: "c1", name: "Standard", scope: "globale", salesperson_id: null, client_category: null, tipo_lavoro: null,
  importo_min: null, importo_max: null, margine_min_pct: 0, sconto_max_pct: 10, approva_oltre_pct: null, priority: 100,
  is_active: true, created_at: "2026-01-01", updated_at: "2026-01-01", ...patch,
});

beforeEach(() => { regoleMock.value = [regola({})]; permessiMock.canApproveDiscounts = false; });
afterEach(() => cleanup());

const tasto = (nome: string) => screen.getByRole("button", { name: nome });
const campoTotale = () => screen.getByLabelText(/Arriva a €/) as HTMLInputElement;
const scrivi = (valore: string) => fireEvent.change(campoTotale(), { target: { value: valore } });

describe("ScontoRapido: i tasti", () => {
  const monta = (extra: Partial<Parameters<typeof ScontoRapido>[0]> = {}) => {
    const onApplica = vi.fn();
    render(<ScontoRapido valorePct={0} massimoPct={null} imponibileLordo={20_000} onApplica={onApplica} {...extra} />);
    return onApplica;
  };

  it("ci sono «Nessuno», «5%» e «10%»; quello che coincide con lo sconto in vigore è premuto", () => {
    monta({ valorePct: 5 });
    expect(tasto("Nessuno").getAttribute("aria-pressed")).toBe("false");
    expect(tasto("5%").getAttribute("aria-pressed")).toBe("true");
    expect(tasto("10%").getAttribute("aria-pressed")).toBe("false");
  });

  it("un tasto applica la percentuale e l'importo che toglie (IVA esclusa)", () => {
    const onApplica = monta();
    fireEvent.click(tasto("5%"));
    expect(onApplica).toHaveBeenCalledWith({ pct: 5, importo: 1_000 });
    fireEvent.click(tasto("Nessuno"));
    expect(onApplica).toHaveBeenLastCalledWith({ pct: 0, importo: 0 });
  });

  it("oltre il massimo consentito il tasto è spento e non applica niente", () => {
    const onApplica = monta({ massimoPct: 8 });
    const dieci = tasto("10%") as HTMLButtonElement;
    expect(dieci.disabled).toBe(true);
    expect(dieci.title).toMatch(/massimo consentito \(8%\)/);
    fireEvent.click(dieci);
    expect(onApplica).not.toHaveBeenCalled();
    expect((tasto("5%") as HTMLButtonElement).disabled).toBe(false);
  });

  it("senza l'aliquota IVA c'è solo la riga dei tasti, niente «Arriva a»", () => {
    monta();
    expect(screen.queryByLabelText(/Arriva a €/)).toBeNull();
  });

  it("senza un prezzo (imponibile a zero) non c'è «Arriva a»: restano i tasti", () => {
    monta({ ivaPct: 10, imponibileLordo: 0 });
    expect(screen.queryByLabelText(/Arriva a €/)).toBeNull();
    expect(tasto("5%")).toBeTruthy();
  });

  it("disattivato, spegne tutto", () => {
    monta({ ivaPct: 10, disabled: true });
    expect((tasto("5%") as HTMLButtonElement).disabled).toBe(true);
    expect(campoTotale().disabled).toBe(true);
  });
});

describe("ScontoRapido: «Arriva a €»", () => {
  const monta = (extra: Partial<Parameters<typeof ScontoRapido>[0]> = {}) => {
    const onApplica = vi.fn();
    render(<ScontoRapido valorePct={0} massimoPct={10} imponibileLordo={20_000} ivaPct={10} onApplica={onApplica} {...extra} />);
    return onApplica;
  };
  const applica = () => screen.getByRole("button", { name: "Applica" }) as HTMLButtonElement;

  it("scrivendo il totale voluto si vede lo sconto che serve, e Applica lo scrive", () => {
    const onApplica = monta();
    expect(applica().disabled).toBe(true);
    scrivi("20.900");
    expect(screen.getByText(`Serve uno sconto del 5% (−${euro(1_000)}, IVA esclusa).`)).toBeTruthy();
    expect(applica().disabled).toBe(false);
    fireEvent.click(applica());
    expect(onApplica).toHaveBeenCalledWith({ pct: 5, importo: 1_000 });
    expect(campoTotale().value).toBe("");
  });

  it("con Invio si applica come col pulsante", () => {
    const onApplica = monta();
    scrivi("20900");
    fireEvent.keyDown(campoTotale(), { key: "Enter" });
    expect(onApplica).toHaveBeenCalledWith({ pct: 5, importo: 1_000 });
  });

  it("se lo sconto servirebbe oltre il massimo, lo dice e non si applica", () => {
    const onApplica = monta();
    scrivi("18000");
    expect(screen.getByText("Servirebbe il 18,18%: oltre il massimo consentito (10%).")).toBeTruthy();
    expect(applica().disabled).toBe(true);
    fireEvent.click(applica());
    expect(onApplica).not.toHaveBeenCalled();
  });

  it("a un centesimo dal tetto il messaggio non dice «il 10% oltre il 10%»: mostra la cifra che fa la differenza", () => {
    // 18.432,50 € + IVA 10%: per 18.248,18 serve il 9,999975% (entro il 10%), per 18.248,17 il 10,000025% (oltre).
    const entro = monta({ imponibileLordo: 18_432.5, massimoPct: 10 });
    scrivi("18248,18");
    expect(applica().disabled).toBe(false);
    cleanup();
    monta({ imponibileLordo: 18_432.5, massimoPct: 10 });
    scrivi("18248,17");
    expect(screen.getByText("Servirebbe il 10,000025%: oltre il massimo consentito (10%).")).toBeTruthy();
    expect(applica().disabled).toBe(true);
    expect(entro).not.toHaveBeenCalled();
  });

  it("senza massimo (chi può approvare) lo sconto grande si applica", () => {
    const onApplica = monta({ massimoPct: null });
    scrivi("18000");
    expect(applica().disabled).toBe(false);
    fireEvent.click(applica());
    expect(onApplica).toHaveBeenCalledWith({ pct: 18.18181818, importo: 3_636.36 });
  });

  it("se il totale senza sconto è già pari o sotto la cifra, dice che non serve", () => {
    const onApplica = monta();
    scrivi("23.000");
    expect(screen.getByText(`Il totale senza sconto è già ${euro(22_000)} (IVA inclusa): non serve nessuno sconto.`)).toBeTruthy();
    expect(applica().disabled).toBe(true);
    expect(onApplica).not.toHaveBeenCalled();
  });

  it("una cifra illeggibile non calcola niente", () => {
    monta();
    scrivi("abc");
    expect(screen.getByText("Scrivi una cifra, per esempio 24.500.")).toBeTruthy();
    expect(applica().disabled).toBe(true);
  });

  it("il messaggio è annunciato a voce senza rubare il cursore", () => {
    monta();
    scrivi("20900");
    const messaggio = screen.getByText(/Serve uno sconto del 5%/);
    expect(messaggio.getAttribute("aria-live")).toBe("polite");
  });
});

describe("ScontoGlobaleField con lo sconto veloce (i preventivatori edili)", () => {
  const monta = () => {
    const onCommit = vi.fn();
    render(
      <ScontoGlobaleField id="sconto" value={0} onCommit={onCommit} imponibileLordo={20_000} tipoLavoro="bagni" conScontoRapido ivaPct={10} />,
    );
    return onCommit;
  };

  it("un tasto scrive lo sconto nel preventivo", () => {
    const onCommit = monta();
    fireEvent.click(tasto("5%"));
    expect(onCommit).toHaveBeenCalledWith(5);
  });

  it("col massimo al 10% (regola) «Arriva a» entro il massimo si applica, oltre no", () => {
    const onCommit = monta();
    scrivi("20.900");
    fireEvent.click(screen.getByRole("button", { name: "Applica" }));
    expect(onCommit).toHaveBeenCalledWith(5);
    onCommit.mockClear();
    scrivi("18000");
    expect((screen.getByRole("button", { name: "Applica" }) as HTMLButtonElement).disabled).toBe(true);
    expect(onCommit).not.toHaveBeenCalled();
  });

  it("chi può approvare sconti non ha il tetto: «Arriva a» scrive anche lo sconto grande", () => {
    permessiMock.canApproveDiscounts = true;
    const onCommit = monta();
    scrivi("18000");
    fireEvent.click(screen.getByRole("button", { name: "Applica" }));
    expect(onCommit).toHaveBeenCalledWith(18.18181818);
  });

  it("senza `conScontoRapido` il campo è quello di sempre: nessun tasto veloce", () => {
    render(<ScontoGlobaleField id="sconto" value={0} onCommit={vi.fn()} imponibileLordo={20_000} tipoLavoro="bagni" />);
    expect(screen.queryByRole("group", { name: "Sconto veloce" })).toBeNull();
    expect(screen.getByLabelText("Sconto globale")).toBeTruthy();
  });
});
