/**
 * La rata nel PDF e la scelta del numero di rate PER OGNI PREVENTIVO (06/10/2026): componente vero, la promo del
 * modello (rate e TAN) arriva dal template; sul preventivo si sceglie quante rate.
 */
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FinanziamentoQuoteToggle } from "@/components/moduli/FinanziamentoQuoteToggle";
import { calcolaRataMensile, FINANZIAMENTO_RATE_OPZIONI } from "@/lib/preventivi/finanziamentoLite";
import { formatCurrency } from "@/lib/formatters";

afterEach(() => cleanup());

/** Come Testing Library vede il testo: gli spazi (anche quello non divisibile di «1.000,00 €») contano come uno. */
const testo = (s: string) => s.replace(/\s/g, " ");
const euro = (n: number) => testo(formatCurrency(n));

const PROMO_24 = { attivo: true, rate: 24, tan_pct: 0 };
const TOTALE = 12_000;

const monta = (extra: Partial<Parameters<typeof FinanziamentoQuoteToggle>[0]> = {}) => {
  const onChange = vi.fn();
  const onChangeRate = vi.fn();
  render(
    <FinanziamentoQuoteToggle rawPromo={PROMO_24} total={TOTALE} value={undefined} onChange={onChange} onChangeRate={onChangeRate} {...extra} />,
  );
  return { onChange, onChangeRate };
};
const gruppo = () => screen.getByRole("group", { name: "Numero di rate" });
const tasto = (rate: number) => within(gruppo()).getByRole("button", { name: new RegExp(`^${rate} rate`) });

describe("FinanziamentoQuoteToggle: il numero di rate", () => {
  it("senza la promo nel modello non compare niente (né interruttore né tasti)", () => {
    const { container } = render(<FinanziamentoQuoteToggle rawPromo={null} total={TOTALE} value={undefined} onChange={vi.fn()} onChangeRate={vi.fn()} />);
    expect(container.firstChild).toBeNull();
    const spenta = render(<FinanziamentoQuoteToggle rawPromo={{ attivo: false, rate: 24, tan_pct: 0 }} total={TOTALE} value={undefined} onChange={vi.fn()} onChangeRate={vi.fn()} />);
    expect(spenta.container.firstChild).toBeNull();
  });

  it("con la rata accesa ci sono i tasti di tutte le durate, e su ognuno la rata già calcolata", () => {
    monta();
    for (const n of FINANZIAMENTO_RATE_OPZIONI) {
      expect(tasto(n).textContent).toContain(`${n} rate`);
      expect(testo(tasto(n).textContent ?? "")).toContain(`${euro(calcolaRataMensile(TOTALE, n, 0))}/mese`);
    }
    expect(testo(tasto(24).textContent ?? "")).toContain(`${euro(500)}/mese`);
  });

  it("finché non se ne sceglie una vale quella del modello: il suo tasto è premuto e l'intestazione dice quelle rate", () => {
    monta();
    expect(tasto(24).getAttribute("aria-pressed")).toBe("true");
    expect(tasto(12).getAttribute("aria-pressed")).toBe("false");
    expect(testo(screen.getByText(/“da .*\/mese” in 24 rate a tasso zero/).textContent ?? "")).toContain(`“da ${euro(500)}/mese” in 24 rate`);
  });

  it("un tasto sceglie quel numero di rate", () => {
    const { onChangeRate, onChange } = monta();
    fireEvent.click(tasto(48));
    expect(onChangeRate).toHaveBeenCalledWith(48);
    expect(onChange).not.toHaveBeenCalled();
  });

  it("con una scelta già fatta il suo tasto è premuto, l'intestazione la dice e la nota ricorda quella del modello", () => {
    monta({ rateScelte: 48 });
    expect(tasto(48).getAttribute("aria-pressed")).toBe("true");
    expect(tasto(24).getAttribute("aria-pressed")).toBe("false");
    expect(testo(screen.getByText(/“da .*\/mese” in 48 rate/).textContent ?? "")).toContain(`“da ${euro(250)}/mese” in 48 rate`);
    expect(screen.getByText(/Il modello propone 24 rate/)).toBeTruthy();
  });

  it("una scelta uguale a quella del modello non fa comparire la nota", () => {
    monta({ rateScelte: 24 });
    expect(screen.queryByText(/Il modello propone/)).toBeNull();
  });

  it("col TAN la rata di ogni tasto è quella dell'ammortamento, non una divisione semplice", () => {
    monta({ rawPromo: { attivo: true, rate: 24, tan_pct: 6 } });
    const attesa = calcolaRataMensile(TOTALE, 60, 6);
    expect(attesa).toBeGreaterThan(TOTALE / 60);
    expect(testo(tasto(60).textContent ?? "")).toContain(`${euro(attesa)}/mese`);
    expect(screen.getByText(/TAN 6%, come nel modello/)).toBeTruthy();
  });

  it("se il modello ha un numero di rate fuori elenco (30) compare comunque, e così una scelta fuori elenco", () => {
    monta({ rawPromo: { attivo: true, rate: 30, tan_pct: 0 }, rateScelte: 18 });
    expect(tasto(30).getAttribute("aria-pressed")).toBe("false");
    expect(tasto(18).getAttribute("aria-pressed")).toBe("true");
    const ordine = within(gruppo()).getAllByRole("button").map((b) => Number((b.textContent ?? "").match(/^(\d+) rate/)?.[1]));
    expect(ordine).toEqual([...ordine].sort((a, b) => a - b));
  });

  it("una scelta senza senso (0, 400, 2,5, testo) è come nessuna scelta: vale il modello", () => {
    for (const cattiva of [0, 400, 2.5, -3]) {
      cleanup();
      monta({ rateScelte: cattiva });
      expect(tasto(24).getAttribute("aria-pressed"), String(cattiva)).toBe("true");
    }
    cleanup();
    monta({ rateScelte: "abc" as unknown as number });
    expect(tasto(24).getAttribute("aria-pressed")).toBe("true");
  });

  it("senza totale (computo vuoto) i tasti ci sono ma senza cifre inventate", () => {
    monta({ total: 0 });
    expect(testo(tasto(24).textContent ?? "")).toContain("—");
    expect(testo(tasto(24).textContent ?? "")).not.toContain("0,00");
    expect(screen.getByText(/Aggiungi voci al computo per calcolare la rata \(24 rate\)/)).toBeTruthy();
  });

  it("spenta la rata, i tasti spariscono; l'interruttore riaccende", () => {
    const { onChange } = monta({ value: false });
    expect(screen.queryByRole("group", { name: "Numero di rate" })).toBeNull();
    fireEvent.click(screen.getByRole("switch"));
    expect(onChange).toHaveBeenCalledWith(true);
  });

  it("senza `onChangeRate` il componente è quello di prima: solo l'interruttore, nessun tasto", () => {
    render(<FinanziamentoQuoteToggle rawPromo={PROMO_24} total={TOTALE} value={undefined} onChange={vi.fn()} />);
    expect(screen.queryByRole("group", { name: "Numero di rate" })).toBeNull();
    expect(screen.getByText("Mostra la rata nel PDF")).toBeTruthy();
  });

  it("cliccare un tasto non spegne né accende l'interruttore (i tasti stanno fuori dall'etichetta)", () => {
    const { onChange } = monta();
    fireEvent.click(tasto(36));
    fireEvent.click(tasto(60));
    expect(onChange).not.toHaveBeenCalled();
  });
});
