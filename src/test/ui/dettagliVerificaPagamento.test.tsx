import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it } from "vitest";
import { DettagliVerificaPagamento } from "@/components/operazioni/DettagliVerificaPagamento";

afterEach(cleanup);
const esito = (ddt: Array<{ numero: string; candidati: number }>) => ({ stato: "da_verificare" as const, bloccata: true, impronta: "x", ddt });
const mostra = (ddt: Array<{ numero: string; candidati: number }>) => render(<MemoryRouter><DettagliVerificaPagamento esito={esito(ddt)} /></MemoryRouter>);

describe("bolle da collegare prima del pagamento (23/11/2026)", () => {
  it("oltre 3 bolle solo da collegare: una riga che si apre, le scelte restano in vista", () => {
    mostra([...Array.from({ length: 41 }, (_, i) => ({ numero: `2026-DT05-${i}`, candidati: 0 })), { numero: "77", candidati: 2 }]);
    expect(screen.getByText("41 bolle citate in fattura ancora da caricare o collegare")).toBeInTheDocument();
    expect(screen.getByText(/DDT 77.*più bolle possibili/)).toBeInTheDocument();
    expect(screen.queryByText(/2026-DT05-3 · da collegare/)).toBeNull();
  });
  it("poche bolle: una per riga, come prima", () => {
    mostra([{ numero: "A1", candidati: 0 }, { numero: "A2", candidati: 0 }]);
    expect(screen.getByText(/DDT A1.*da collegare/)).toBeInTheDocument();
    expect(screen.getByText(/DDT A2.*da collegare/)).toBeInTheDocument();
  });
});
