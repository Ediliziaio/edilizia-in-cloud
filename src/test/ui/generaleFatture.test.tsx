import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { leggiDatiFattura, type DatiFattura, type ElencoFattureGenerale } from "@/lib/orders/generali/fatture";

/**
 * «Crea fattura» dalla commessa generale (sessione cg-fatture, 30/10/2026): cosa vede chi usa l'app.
 * I conti della bozza sono in src/test/logic/generaleFatture.test.ts.
 */
const m = vi.hoisted(() => ({
  mobile: false,
  elenco: null as ElencoFattureGenerale | null,
  dati: null as DatiFattura | null,
  crea: vi.fn(),
}));

vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));
vi.mock("@/hooks/use-mobile", () => ({ useIsMobile: () => m.mobile }));
vi.mock("@/hooks/useGeneraleFatture", () => ({
  useFattureGenerale: () => ({ data: m.elenco }),
  useDatiFatturaGenerale: () => ({ data: m.dati, isLoading: false, error: null }),
  useCreaFatturaGenerale: () => ({ mutate: m.crea, isPending: false }),
}));

import { BottoneFattura } from "@/components/orders/generali/fatture/BottoneFattura";

const pagamento = (tipo: string) => leggiDatiFattura({
  cliente: { tipo_cliente: "B2C", nome: "Mario", cognome: "Rossi", codice_fiscale: "RSSMRA80A01H501U", indirizzo_via: "Via Roma 1", indirizzo_cap: "00100", indirizzo_comune: "Roma" },
  esistente: null,
  movimento: { id: "mov-1", tipo, importo: 22000, data: "2026-10-15", unita_sigla: "A1", piano: "2", mq: 85.5, generale_nome: "Residenza Le Querce" },
});

const disegna = () => render(
  <MemoryRouter><BottoneFattura generaleId="g" origine="movimento" id="mov-1" /></MemoryRouter>,
);

beforeEach(() => {
  m.mobile = false;
  m.elenco = { fatture: [], puoFatturare: true };
  m.dati = pagamento("acconto");
  m.crea.mockReset();
});
afterEach(cleanup);

describe("Crea fattura da un pagamento dell'unità", () => {
  it("prepara la bozza al 10% con l'IVA scorporata", () => {
    disegna();
    fireEvent.click(screen.getByRole("button", { name: /Crea fattura/ }));
    expect(screen.getByText("Mario Rossi")).toBeVisible();
    expect(screen.getByRole("radio", { name: /10%/ })).toBeChecked();
    fireEvent.click(screen.getByRole("button", { name: /Prepara la bozza/ }));
    expect(m.crea).toHaveBeenCalledTimes(1);
    const arg = m.crea.mock.calls[0][0] as { origine: string; id: string; bozza: { totale_documento: number; imponibile_totale: number } };
    expect(arg.origine).toBe("movimento");
    expect(arg.id).toBe("mov-1");
    expect(arg.bozza.totale_documento).toBe(22000);
    expect(arg.bozza.imponibile_totale).toBe(20000);
  });

  it("la caparra confirmatoria avvisa e chiede una conferma esplicita", () => {
    m.dati = pagamento("caparra");
    disegna();
    fireEvent.click(screen.getByRole("button", { name: /Crea fattura/ }));
    expect(screen.getByText(/caparra confirmatoria di norma non si fattura/)).toBeVisible();
    const prepara = screen.getByRole("button", { name: /Prepara la bozza/ });
    expect(prepara).toBeDisabled();
    fireEvent.click(screen.getByRole("checkbox", { name: /La fatturo lo stesso/ }));
    expect(prepara).toBeEnabled();
  });

  it("con la fattura già nata mostra il link, non il bottone", () => {
    m.elenco = { puoFatturare: true, fatture: [{ documentoId: "doc-1", salId: null, movimentoId: "mov-1", numero: "FT-2026-0012", stato: "emessa", data: null, totale: 22000, pagato: 0 }] };
    disegna();
    expect(screen.getByRole("link", { name: /Fattura FT-2026-0012 \(emessa\)/ })).toHaveAttribute("href", "/azienda/documenti/doc-1");
    expect(screen.queryByRole("button", { name: /Crea fattura/ })).toBeNull();
  });

  it("da telefono o senza «Fatturazione» non si crea", () => {
    m.mobile = true;
    const { unmount } = disegna();
    expect(screen.queryByRole("button", { name: /Crea fattura/ })).toBeNull();
    unmount();
    m.mobile = false;
    m.elenco = { fatture: [], puoFatturare: false };
    disegna();
    expect(screen.queryByRole("button", { name: /Crea fattura/ })).toBeNull();
  });
});
