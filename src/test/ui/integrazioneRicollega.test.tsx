/**
 * Integrazioni: quando Meta chiude il collegamento la scheda dice «Scollegato» e il pulsante è
 * «Ricollega», che apre subito il collegamento (21/10/2026: BeMade, Il Bagno Group, Ener e Green
 * Energy scollegati insieme; prima il pulsante era «Risolvi» e portava a una diagnosi).
 */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import IntegrationsGrid from "@/components/integrations/IntegrationsGrid";
import { INTEGRATIONS_CATALOG } from "@/components/integrations/IntegrationsCatalog";

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() } }));

const meta = INTEGRATIONS_CATALOG.filter((i) => i.id === "meta");

afterEach(cleanup);

describe("Scheda di un collegamento chiuso dal fornitore", () => {
  it("dice «Scollegato» e «Ricollega» apre il collegamento, non la diagnosi", () => {
    const onRicollega = vi.fn();
    const onTroubleshoot = vi.fn();
    render(
      <MemoryRouter>
        <IntegrationsGrid
          items={meta}
          statuses={{ meta: { status: "error", daRicollegare: true } }}
          canManage
          onRicollega={onRicollega}
          onTroubleshoot={onTroubleshoot}
        />
      </MemoryRouter>,
    );
    expect(screen.getByText("Scollegato")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Ricollega" }));
    expect(onRicollega).toHaveBeenCalledTimes(1);
    expect(onTroubleshoot).not.toHaveBeenCalled();
  });

  it("un errore di altro tipo resta «Risolvi»", () => {
    render(
      <MemoryRouter>
        <IntegrationsGrid items={meta} statuses={{ meta: { status: "error" } }} canManage onRicollega={vi.fn()} />
      </MemoryRouter>,
    );
    expect(screen.getByRole("button", { name: "Risolvi" })).toBeTruthy();
    expect(screen.queryByText("Scollegato")).toBeNull();
  });
});
