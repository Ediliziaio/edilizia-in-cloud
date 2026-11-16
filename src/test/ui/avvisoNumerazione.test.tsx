import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({ dati: undefined as undefined | { prima: boolean; prossimo: number | null; massimoArchivio: number | null } }));

vi.mock("@tanstack/react-query", () => ({
  useQuery: () => ({ data: m.dati, isLoading: false, isError: false }),
}));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { from: vi.fn() } }));

import { AvvisoNumerazione } from "@/components/fatturazione/AvvisoNumerazione";

afterEach(cleanup);
const disegna = () =>
  render(
    <MemoryRouter>
      <AvvisoNumerazione companyId="c1" tipo="fattura" anno={2026} />
    </MemoryRouter>,
  );

describe("l'avviso sulla numerazione prima di emettere", () => {
  it("il caso Vulcano: dice che il numero è già usato e qual è quello giusto", () => {
    m.dati = { prima: true, prossimo: 227, massimoArchivio: 238 };
    disegna();
    const avviso = screen.getByRole("alert");
    expect(avviso).toHaveTextContent("Il numero 227 è già stato usato");
    expect(avviso).toHaveTextContent("arriva già alla 238");
    expect(avviso).toHaveTextContent("dovrebbe essere la 239");
    // E dice dove si sistema, perché dopo l'emissione non si cambia più.
    expect(screen.getByRole("link", { name: /Numeratori/ })).toHaveAttribute(
      "href",
      expect.stringContaining("sezione=numeratori"),
    );
  });

  it("prima fattura senza storia importata: invito a controllare, non allarme", () => {
    m.dati = { prima: true, prossimo: 1, massimoArchivio: null };
    disegna();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.getByText(/È la prima fattura di questa azienda/)).toBeVisible();
    expect(screen.getByText("1")).toBeVisible();
  });

  it("numerazione a posto: il popup resta com'era", () => {
    m.dati = { prima: false, prossimo: 239, massimoArchivio: 238 };
    const { container } = disegna();
    expect(container).toBeEmptyDOMElement();
  });

  it("finché non si sa, non si dice niente", () => {
    m.dati = undefined;
    const { container } = disegna();
    expect(container).toBeEmptyDOMElement();
  });

  it("su un preventivo non si parla di numerazione fiscale", () => {
    m.dati = { prima: true, prossimo: 1, massimoArchivio: null };
    const { container } = render(
      <MemoryRouter>
        <AvvisoNumerazione companyId="c1" tipo="preventivo" anno={2026} />
      </MemoryRouter>,
    );
    expect(container).toBeEmptyDOMElement();
  });
});
