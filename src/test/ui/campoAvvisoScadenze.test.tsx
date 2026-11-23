import { cleanup, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const stato = vi.hoisted(() => ({ righe: [] as unknown[] }));
vi.mock("@/hooks/useTimbratura", () => ({ useMyHrProfilo: () => ({ data: { id: "profilo" } }) }));
vi.mock("@/integrations/supabase/client", () => {
  const catena = { select: () => catena, eq: () => catena, not: () => Promise.resolve({ data: stato.righe, error: null }) };
  return { supabase: { from: () => catena } };
});
import { AvvisoScadenzePersonali } from "@/components/campo/AvvisoScadenzePersonali";

const disegna = () => render(
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    <MemoryRouter><AvvisoScadenzePersonali /></MemoryRouter>
  </QueryClientProvider>,
);

describe("Avviso scadenze personali in Home (collaudo 23/11)", () => {
  beforeEach(() => { vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(new Date("2026-11-23T10:00:00")); });
  afterEach(() => { cleanup(); vi.useRealTimers(); });

  it("documento scaduto e uno in scadenza: avviso rosso che porta ai Documenti", async () => {
    stato.righe = [
      { id: "1", categoria: "visita_medica", titolo: "Visita di idoneità", data_scadenza: "2026-10-01", alert_giorni_prima: 30 },
      { id: "2", categoria: "formazione", titolo: "Corso antincendio", data_scadenza: "2026-12-10", alert_giorni_prima: 30 },
      { id: "3", categoria: "formazione", titolo: "Valido", data_scadenza: "2027-12-10", alert_giorni_prima: 30 },
    ];
    disegna();
    expect(await screen.findByText("Un tuo documento è scaduto")).toBeInTheDocument();
    expect(screen.getByText(/Visita di idoneità · scaduto il/)).toBeInTheDocument();
    expect(screen.getByText(/Corso antincendio · scade il/)).toBeInTheDocument();
    expect(screen.queryByText(/Valido/)).not.toBeInTheDocument();
    expect(screen.getByRole("link")).toHaveAttribute("href", "/campo/documenti");
  });

  it("niente da avvisare: niente avviso", async () => {
    stato.righe = [{ id: "3", categoria: "formazione", titolo: "Valido", data_scadenza: "2027-12-10", alert_giorni_prima: 30 }];
    const { container } = disegna();
    await new Promise(r => setTimeout(r, 0));
    expect(container).toBeEmptyDOMElement();
  });
});
