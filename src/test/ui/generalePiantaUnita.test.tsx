import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/** La pianta disegnata col modulo Planimetrie dentro il pannello dell'unità. */
const m = vi.hoisted(() => ({ attiva: true, permesso: true, piante: [] as { id: string; titolo: string; versione_corrente: number }[] }));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ effectiveCompany: { id: "azienda" } }) }));
vi.mock("@/hooks/useFeatureAccess", () => ({ useFeatureAccess: () => ({ isEnabled: m.attiva }) }));
vi.mock("@/hooks/usePermissions", () => ({ usePermissions: () => ({ canViewRenderAi: m.permesso }) }));
vi.mock("@/lib/planimetrie/archivio", () => ({ useElencoPlanimetrie: () => ({ data: m.piante, isError: false }) }));
import { PiantaUnita } from "@/components/orders/generali/vendita/PiantaUnita";

afterEach(cleanup);
beforeEach(() => { m.attiva = true; m.permesso = true; m.piante = []; });

const disegna = (puoCreare = true) => render(
  <MemoryRouter><PiantaUnita orderId="ord1" sigla="A1" generaleId="gen1" puoCreare={puoCreare} /></MemoryRouter>,
);

describe("la pianta dell'unità", () => {
  it("manca: si disegna, si ricava da un file o a parole, e nasce collegata all'unità", () => {
    disegna();
    const link = screen.getByRole("link", { name: /Da PDF o foto/ }).getAttribute("href")!;
    const q = new URLSearchParams(link.split("?")[1]);
    expect(q.get("da")).toBe("documento");
    expect(q.get("commessa")).toBe("ord1");
    expect(q.get("titolo")).toBe("Pianta A1");
    expect(q.get("torna")).toBe("/azienda/ordini/gen1?scheda=unita");
    expect(screen.getByRole("link", { name: /Disegna/ })).toBeInTheDocument();
  });

  it("c'è: si apre, e non si propone di crearne un'altra", () => {
    m.piante = [{ id: "p1", titolo: "Pianta A1", versione_corrente: 3 }];
    disegna();
    expect(screen.getByRole("link", { name: "Pianta A1" })).toHaveAttribute("href", "/azienda/render/planimetrie/p1");
    expect(screen.queryByRole("link", { name: /Disegna/ })).not.toBeInTheDocument();
  });

  it("da telefono si guarda soltanto", () => {
    disegna(false);
    expect(screen.queryByRole("link", { name: /Disegna/ })).not.toBeInTheDocument();
  });

  it("senza Render AI, o senza permesso, non compare", () => {
    m.attiva = false;
    disegna();
    expect(screen.queryByText("Pianta")).not.toBeInTheDocument();
    cleanup();
    m.attiva = true; m.permesso = false;
    disegna();
    expect(screen.queryByText("Pianta")).not.toBeInTheDocument();
  });
});
