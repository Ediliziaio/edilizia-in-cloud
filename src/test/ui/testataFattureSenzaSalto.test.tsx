// @vitest-environment jsdom
/**
 * 23/11/2026 — la testata delle fatture non deve spostare l'elenco.
 *
 * Sulle emesse la striscia dei mesi e i sei numeri aspettavano i numeri dal
 * database: misurato, la pagina si disegnava a 157 ms e la striscia compariva
 * a 500 ms, spingendo giù la tabella. Adesso la striscia parte dai dodici mesi
 * vuoti dell'anno scelto (che si sa al primo disegno) e i sei riquadri ci sono
 * già con «…» al posto della cifra: stessa altezza, niente salto.
 *
 * Senza caricamento in corso i riquadri restano invisibili: un'azienda senza
 * fatture non deve vedere sei zeri.
 */
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import sorgenteEmesse from "@/pages/azienda/fatturazione/DocumentiFiscaliList.tsx?raw";
import { mesiVuoti } from "@/hooks/billing/useMonthlyTimeline";
import { RiepilogoFatture, TESTI_RICEVUTE } from "@/components/fatturazione/RiepilogoFatture";

describe("i dodici mesi vuoti", () => {
  it("sono dodici, dell'anno chiesto, a zero", () => {
    const mesi = mesiVuoti(2026);
    expect(mesi).toHaveLength(12);
    expect(mesi[0]).toMatchObject({ year: 2026, month: 1, label: "Gennaio", key: "2026-01", docCount: 0 });
    expect(mesi[11]).toMatchObject({ month: 12, label: "Dicembre", key: "2026-12" });
    expect(mesi.every(m => m.totalAmount === 0 && m.incassato === 0 && m.daIncassare === 0 && m.scaduto === 0)).toBe(true);
  });
});

describe("i sei numeri mentre arrivano", () => {
  it("ci sono già, con «…» al posto delle cifre", () => {
    render(<RiepilogoFatture mesi={mesiVuoti(2026)} meseScelto={null} caricamento />);
    const sezione = screen.getByLabelText("Numeri delle fatture");
    expect(sezione.getAttribute("aria-busy")).toBe("true");
    expect(screen.getByText("Fatturato 2026")).toBeTruthy();
    expect(screen.getByText("Imponibile")).toBeTruthy();
    expect(screen.getByText("Scaduto")).toBeTruthy();
    // Nessuno zero finto: solo puntini finché i numeri non ci sono.
    expect(sezione.textContent).not.toMatch(/0,00|€/);
  });

  it("sul telefono sono tre", () => {
    render(<RiepilogoFatture mesi={mesiVuoti(2026)} meseScelto={null} caricamento isMobile testi={TESTI_RICEVUTE} />);
    const sezione = screen.getByLabelText("Numeri delle fatture");
    expect(sezione.children).toHaveLength(3);
    expect(screen.getByText("Pagato")).toBeTruthy();
  });

  it("finito il caricamento, un'azienda senza fatture non vede niente", () => {
    const { container } = render(<RiepilogoFatture mesi={mesiVuoti(2026)} meseScelto={null} />);
    expect(container.textContent).toBe("");
  });
});

describe("la pagina delle emesse", () => {
  it("non aspetta i numeri per disegnare la striscia", () => {
    // Il guardiano: `timelineMonths &&` davanti alla striscia è esattamente ciò
    // che la faceva comparire mezzo secondo dopo la pagina.
    expect(sorgenteEmesse).not.toMatch(/timelineMonths && timelineMonths\.length/);
    expect(sorgenteEmesse).toContain("months={mesiStriscia}");
    expect(sorgenteEmesse).toContain("caricamento={caricaTimeline}");
  });
});
