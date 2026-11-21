import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DelegatedCompanyContent } from "@/components/accountant/DelegatedCompanyContent";

const stato = vi.hoisted(() => ({
  data: null as null | "read_only",
  isError: false,
  isLoading: false,
  refetch: vi.fn(),
}));

vi.mock("@/hooks/accountant/useAccountantPortalData", () => ({
  useCurrentCommercialistaAccessMode: () => stato,
}));

afterEach(() => {
  cleanup();
  stato.data = null;
  stato.isError = false;
  stato.isLoading = false;
});

function apri(aziendaEffettiva = "a1") {
  return render(<MemoryRouter>
    <DelegatedCompanyContent companyId="a1" effectiveCompanyId={aziendaEffettiva}>
      <p>Dati riservati della commessa</p>
    </DelegatedCompanyContent>
  </MemoryRouter>);
}

describe("Accesso alla piattaforma cliente dallo studio", () => {
  it("nasconde i dati se la delega manca o è stata revocata", () => {
    apri();
    expect(screen.getByText("Delega non disponibile")).toBeTruthy();
    expect(screen.queryByText("Dati riservati della commessa")).toBeNull();
  });

  it("aspetta l'azienda giusta anche se la delega è attiva", () => {
    stato.data = "read_only";
    apri("azienda-precedente");
    expect(screen.getByRole("status").textContent).toContain("Apertura dell’azienda delegata");
    expect(screen.queryByText("Dati riservati della commessa")).toBeNull();
  });

  it("mostra il contenuto quando delega ed azienda effettiva coincidono", () => {
    stato.data = "read_only";
    apri();
    expect(screen.getByText("Dati riservati della commessa")).toBeTruthy();
  });

  it("offre un nuovo tentativo in caso di errore di lettura", () => {
    stato.isError = true;
    apri();
    expect(screen.getByRole("button", { name: "Riprova" })).toBeTruthy();
    expect(screen.queryByText("Dati riservati della commessa")).toBeNull();
  });
});
