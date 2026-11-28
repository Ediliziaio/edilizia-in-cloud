import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import ScadenzarioTable from "@/components/scadenzario/ScadenzarioTable";
import type { Scadenza } from "@/hooks/useScadenzario";

afterEach(cleanup);

// 28/11/2026, collaudo sui dati veri: un fornitore tutto pagato apriva su «Aperte» vuota senza dire
// che in «Pagate» ce n'erano dieci. L'elenco vuoto ora porta dove le righe ci sono.
describe("Scadenzario: elenco vuoto", () => {
  const base = { scadenze: [] as Scadenza[], onMarkPaid: vi.fn(), onCancel: vi.fn() };

  it("mostra il rimando e lo esegue al clic", () => {
    const onClick = vi.fn();
    render(<ScadenzarioTable {...base} rimandoVuoto={{ testo: "Vedi le 10 scadenze in «Tutte»", onClick }} />);
    expect(screen.getByText("Nessuna scadenza trovata")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Vedi le 10 scadenze in «Tutte»" }));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("senza rimando resta il solo messaggio", () => {
    render(<ScadenzarioTable {...base} />);
    expect(screen.getByText("Nessuna scadenza trovata")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Vedi le/ })).toBeNull();
  });
});
