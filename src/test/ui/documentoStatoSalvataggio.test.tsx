import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { EditorTopBar } from "@/pages/azienda/fatturazione/editor/EditorTopBar";

vi.mock("@/contexts/AuthContext", () => ({ useAuth: (): { effectiveCompany: null } => ({ effectiveCompany: null }) }));
vi.mock("@/hooks/use-mobile", () => ({ useIsMobile: () => false }));
afterEach(cleanup);

describe("Stato di salvataggio del documento", () => {
  const mostra = (isDirty: boolean, isSaving = false, lastSaved: Date | null = null) => render(
    <MemoryRouter><EditorTopBar state={{ id: "bozza-esistente", tipo: "fattura", stato: "bozza" }}
      isDirty={isDirty} isSaving={isSaving} lastSaved={lastSaved}
      onEmetti={vi.fn()} onDelete={vi.fn()} onFieldChange={vi.fn()} /></MemoryRouter>,
  );
  it("una bozza caricata dal server non viene indicata come non salvata", () => {
    mostra(false);
    expect(screen.getByText("Bozza salvata")).toBeInTheDocument();
    expect(screen.queryByText("Modifiche non salvate")).not.toBeInTheDocument();
  });
  it("una nuova modifica prevale sulla data dell'ultimo salvataggio", () => {
    mostra(true, false, new Date("2026-11-05T12:00:00Z"));
    expect(screen.getByText("Modifiche non salvate")).toBeInTheDocument();
    expect(screen.queryByText(/^Salvata /)).not.toBeInTheDocument();
  });
  it("mostra il salvataggio ancora in corso", () => {
    mostra(false, true);
    expect(screen.getByText("Salvataggio...")).toBeInTheDocument();
    expect(screen.queryByText("Bozza salvata")).not.toBeInTheDocument();
  });
});
