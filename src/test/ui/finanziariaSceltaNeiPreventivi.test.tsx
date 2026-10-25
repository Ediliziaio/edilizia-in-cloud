/**
 * La finanziaria scelta subito nei preventivi dei moduli (24/10/2026): con le tabelle delle finanziarie
 * dell'azienda compare la scelta della finanziaria, i tasti sono le durate della sua tabella con la rata vera, e il
 * preventivo ricorda tabella, TAN, rata e importo. Il PDF usa la rata della tabella finché il totale non cambia.
 */
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  promoDelPreventivo, rataDelPreventivoPdf, sceltaFinanziariaDelPreventivo, calcolaRataMensile,
} from "@/lib/preventivi/finanziamentoLite";
import { formatCurrency } from "@/lib/formatters";

const TABELLA = {
  id: "t1", company_id: "c1", finanziaria_id: "f1", finanziaria_nome: "Banca Esempio", nome_prodotto: "Casa 2026",
  codice_condizione: null as string | null, subtariffa_default: null as string | null, tan_base: 6.5, pdf_url: null as string | null, csv_url: null as string | null,
  data_decorrenza: null as string | null, data_scadenza: null as string | null, attiva: true,
};
const riga = (durata: number, rata: number, tan: number | null) => ({
  id: `r${durata}`, tabella_id: "t1", subtariffa: null as string | null, importo_erogato: 20_000, spese_istruttoria: 0,
  importo_totale_credito: 20_000, numero_rate: durata, durata_mesi: durata, prima_rata_giorni: 30,
  importo_rata: rata, spese_incasso_rata: 0, interessi_cliente: 0, importo_totale_dovuto: rata * durata,
  tan, taeg: 7.1, icc: null as number | null,
});
const RIGHE = [riga(60, 400, 6.9), riga(84, 310, 6.5), riga(120, 240, 7.2)];

const stato = vi.hoisted(() => ({ tabelle: [] as unknown[], righe: [] as unknown[] }));
vi.mock("@/hooks/useTabelleFinanziamento", async (importOriginal) => {
  const originale = await importOriginal<typeof import("@/hooks/useTabelleFinanziamento")>();
  return {
    ...originale,
    useTabelleFinanziamentoAttive: () => ({ data: stato.tabelle, isLoading: false }),
    useTabellaFinanziamentoRighe: (id: string | null | undefined) => ({ data: id ? stato.righe : [], isLoading: false }),
  };
});

import { FinanziamentoQuoteToggle } from "@/components/moduli/FinanziamentoQuoteToggle";

afterEach(() => { cleanup(); stato.tabelle = []; stato.righe = []; });

const testo = (s: string) => s.replace(/\s/g, " ");
const euro = (n: number) => testo(formatCurrency(n));
const PROMO = { attivo: true, rate: 24, tan_pct: 0 };

const monta = (extra: Partial<Parameters<typeof FinanziamentoQuoteToggle>[0]> = {}) => {
  const onChangeFinanziaria = vi.fn();
  const view = render(
    <FinanziamentoQuoteToggle
      rawPromo={PROMO} total={20_000} value={undefined} onChange={vi.fn()} onChangeRate={vi.fn()}
      finanziaria={{ tabellaId: null, tanPct: null, rata: null, importo: null }}
      onChangeFinanziaria={onChangeFinanziaria} {...extra}
    />,
  );
  return { onChangeFinanziaria, ...view };
};

describe("scelta della finanziaria nei preventivi dei moduli", () => {
  it("senza tabelle dell'azienda resta il selettore di sempre: niente scelta della finanziaria", () => {
    monta();
    expect(screen.queryByLabelText("Finanziaria")).toBeNull();
    expect(screen.getByRole("group", { name: "Numero di rate" })).toBeTruthy();
  });

  it("con le tabelle compare la finanziaria, anche se il modello non ha la promo", () => {
    stato.tabelle = [TABELLA];
    const { container } = monta({ rawPromo: null });
    expect(container.firstChild).not.toBeNull();
    expect(screen.getByLabelText("Finanziaria")).toBeTruthy();
    expect(testo(container.textContent ?? "")).toContain("Scegli la finanziaria");
  });

  it("con la tabella scelta i tasti sono le durate della tabella, ognuno con la rata vera", () => {
    stato.tabelle = [TABELLA]; stato.righe = RIGHE;
    monta({ rateScelte: 84, finanziaria: { tabellaId: "t1", tanPct: 6.5, rata: 310, importo: 20_000 } });
    const gruppo = screen.getByRole("group", { name: "Numero di rate" });
    for (const r of RIGHE) {
      const tasto = within(gruppo).getByRole("button", { name: new RegExp(`^${r.durata_mesi} rate`) });
      expect(testo(tasto.textContent ?? "")).toContain(euro(r.importo_rata));
    }
    expect(within(gruppo).getByRole("button", { name: /^84 rate/ }).getAttribute("aria-pressed")).toBe("true");
    expect(within(gruppo).queryByRole("button", { name: /^12 rate/ })).toBeNull();
  });

  it("toccare una durata salva rate, tabella, TAN, rata e importo di quella riga", () => {
    stato.tabelle = [TABELLA]; stato.righe = RIGHE;
    const { onChangeFinanziaria } = monta({ rateScelte: 84, finanziaria: { tabellaId: "t1", tanPct: 6.5, rata: 310, importo: 20_000 } });
    fireEvent.click(within(screen.getByRole("group", { name: "Numero di rate" })).getByRole("button", { name: /^120 rate/ }));
    expect(onChangeFinanziaria).toHaveBeenLastCalledWith({ rate: 120, tabellaId: "t1", tanPct: 7.2, rata: 240, importo: 20_000 });
  });

  it("appena si sceglie la finanziaria il preventivo si riempie da solo con la rata della durata più vicina", () => {
    stato.tabelle = [TABELLA]; stato.righe = RIGHE;
    const { onChangeFinanziaria } = monta({ rateScelte: 80, finanziaria: { tabellaId: "t1", tanPct: null, rata: null, importo: null } });
    expect(onChangeFinanziaria).toHaveBeenCalledWith({ rate: 84, tabellaId: "t1", tanPct: 6.5, rata: 310, importo: 20_000 });
  });

  it("se il totale cambia la rata si riallinea alla tabella sul totale di adesso", () => {
    stato.tabelle = [TABELLA]; stato.righe = RIGHE;
    const { onChangeFinanziaria } = monta({ total: 18_500, rateScelte: 84, finanziaria: { tabellaId: "t1", tanPct: 6.5, rata: 310, importo: 20_000 } });
    expect(onChangeFinanziaria).toHaveBeenCalledWith({ rate: 84, tabellaId: "t1", tanPct: 6.5, rata: 310, importo: 18_500 });
  });

  it("un importo oltre le fasce della tabella lo dice, invece di mostrare una rata sbagliata", () => {
    stato.tabelle = [TABELLA]; stato.righe = RIGHE;
    monta({ total: 35_000, rateScelte: 84, finanziaria: { tabellaId: "t1", tanPct: 6.5, rata: 310, importo: 20_000 } });
    expect(screen.getByRole("alert").textContent).toContain("non ha una rata");
    expect(screen.queryByRole("group", { name: "Numero di rate" })).toBeNull();
  });

  it("tornare alle condizioni del modello azzera tabella, TAN, rata e importo e tiene le rate", () => {
    stato.tabelle = [TABELLA]; stato.righe = RIGHE;
    const { onChangeFinanziaria } = monta({ rateScelte: 84, finanziaria: { tabellaId: "t1", tanPct: 6.5, rata: 310, importo: 20_000 } });
    fireEvent.click(screen.getByLabelText("Finanziaria"));
    fireEvent.click(screen.getByRole("option", { name: /Condizioni del modello/ }));
    expect(onChangeFinanziaria).toHaveBeenLastCalledWith({ rate: 84, tabellaId: null, tanPct: null, rata: null, importo: null });
  });
});

describe("il PDF con la finanziaria scelta", () => {
  const scelta = { tanPct: 6.5, rata: 310, importo: 20_000 };

  it("legge la scelta dal progetto solo se c'è la tabella; i numeri dal database possono essere stringhe", () => {
    expect(sceltaFinanziariaDelPreventivo({})).toBeNull();
    expect(sceltaFinanziariaDelPreventivo({ finanziamento_tabella_id: "t1", finanziamento_tan_pct: "6.5", finanziamento_rata: "310.00", finanziamento_importo: "20000.00" })).toEqual(scelta);
    expect(sceltaFinanziariaDelPreventivo({ finanziamento_tabella_id: "t1", finanziamento_rata: "x" })?.rata).toBeNull();
  });

  it("la promo prende il TAN della finanziaria, e vale anche senza promo nel modello", () => {
    expect(promoDelPreventivo(PROMO, 84, scelta)).toEqual({ attivo: true, rate: 84, tan_pct: 6.5 });
    expect(promoDelPreventivo(null, 84, scelta)).toEqual({ attivo: true, rate: 84, tan_pct: 6.5 });
    expect(promoDelPreventivo(null, null, scelta)).toBeNull();
    expect(promoDelPreventivo(null, 84, null)).toBeNull();
    expect(promoDelPreventivo(PROMO, 48, null)).toEqual({ attivo: true, rate: 48, tan_pct: 0 });
  });

  it("col totale uguale vale la rata esatta della tabella; se il totale è cambiato si ricalcola col TAN", () => {
    const promo = promoDelPreventivo(null, 84, scelta)!;
    expect(rataDelPreventivoPdf(20_000, promo, scelta)).toBe(310);
    expect(rataDelPreventivoPdf(20_000.3, promo, scelta)).toBe(310);
    expect(rataDelPreventivoPdf(16_000, promo, scelta)).toBeCloseTo(calcolaRataMensile(16_000, 84, 6.5), 6);
    expect(rataDelPreventivoPdf(16_000, promo, scelta)).toBeLessThan(310);
  });

  it("senza la finanziaria la rata è quella di sempre", () => {
    const promo = promoDelPreventivo(PROMO, null, null)!;
    expect(rataDelPreventivoPdf(12_000, promo, null)).toBe(calcolaRataMensile(12_000, 24, 0));
  });
});
