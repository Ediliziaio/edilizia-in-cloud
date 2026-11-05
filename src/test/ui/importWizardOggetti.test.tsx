import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, renderHook, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { MemoryRouter, useLocation } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ImportWizard } from "@/components/shared/ImportWizard";
import { useImportaDaUrl } from "@/components/shared/import-wizard/useImportaDaUrl";

const campi = [{ key: "first_name", label: "Nome", required: true }];
const Indirizzo = () => {
  const l = useLocation();
  return <output data-testid="indirizzo">{l.pathname + l.search}</output>;
};
const apri = (tipo: "contacts" | "opportunities", da = "/azienda/marketing/contatti", destinazione?: string) => render(
  <MemoryRouter initialEntries={[da]}>
    <ImportWizard
      open
      onClose={vi.fn()}
      defaultObjectType={tipo}
      destinazione={destinazione}
      contactFields={tipo === "contacts" ? campi : []}
      opportunityFields={tipo === "opportunities" ? campi : []}
      onImportContacts={vi.fn()}
      onImportOpportunities={vi.fn()}
    />
    <Indirizzo />
  </MemoryRouter>,
);
const indirizzo = () => screen.getByTestId("indirizzo").textContent;

afterEach(cleanup);

describe("importazione: ogni oggetto arriva dove ci sono i suoi campi", () => {
  it("dai Contatti, scegliendo Opportunità si va alla loro importazione", () => {
    apri("contacts");
    fireEvent.click(screen.getByRole("button", { name: /Opportunità/ }));
    expect(indirizzo()).toBe("/azienda/marketing/opportunita?importa=1");
  });

  it("dalle Opportunità, scegliendo Contatti si va alla loro importazione", () => {
    apri("opportunities", "/azienda/marketing/opportunita");
    fireEvent.click(screen.getByRole("button", { name: /Contatti/ }));
    expect(indirizzo()).toBe("/azienda/marketing/contatti?importa=1");
  });

  it("scegliendo l'oggetto della pagina si resta qui", () => {
    apri("contacts");
    fireEvent.click(screen.getByRole("button", { name: /Contatti/ }));
    expect(indirizzo()).toBe("/azienda/marketing/contatti");
  });

  it("dal CRM di piattaforma si resta nel CRM di piattaforma", () => {
    apri("contacts", "/admin/marketing/contatti");
    fireEvent.click(screen.getByRole("button", { name: /Opportunità/ }));
    expect(indirizzo()).toBe("/admin/marketing/opportunita?importa=1");
  });

  it("dice dove finiranno le righe", () => {
    apri("opportunities", "/azienda/marketing/opportunita", "Nella pipeline «Tetti», prima fase");
    expect(screen.getByText("Nella pipeline «Tetti», prima fase")).toBeInTheDocument();
  });
});

describe("?importa=1 apre l'importazione", () => {
  const prova = (url: string, pronto: boolean, puo: boolean) => {
    const apriWizard = vi.fn();
    const wrapper = ({ children }: { children: ReactNode }) => (
      <MemoryRouter initialEntries={[url]}>{children}<Indirizzo /></MemoryRouter>
    );
    const r = renderHook(({ p }) => useImportaDaUrl(p, puo, apriWizard), { wrapper, initialProps: { p: pronto } });
    return { apriWizard, r };
  };

  it("si apre una volta e il parametro sparisce, lasciando gli altri", () => {
    const { apriWizard, r } = prova("/x?importa=1&altro=2", true, true);
    expect(apriWizard).toHaveBeenCalledTimes(1);
    r.rerender({ p: true });
    expect(apriWizard).toHaveBeenCalledTimes(1);
    expect(indirizzo()).toBe("/x?altro=2");
  });

  it("aspetta i permessi", () => {
    const { apriWizard, r } = prova("/x?importa=1", false, true);
    expect(apriWizard).not.toHaveBeenCalled();
    expect(indirizzo()).toBe("/x?importa=1");
    r.rerender({ p: true });
    expect(apriWizard).toHaveBeenCalledTimes(1);
  });

  it("senza permesso non si apre", () => {
    const { apriWizard } = prova("/x?importa=1", true, false);
    expect(apriWizard).not.toHaveBeenCalled();
    expect(indirizzo()).toBe("/x");
  });

  it("senza il parametro non fa niente", () => {
    expect(prova("/x", true, true).apriWizard).not.toHaveBeenCalled();
  });
});
