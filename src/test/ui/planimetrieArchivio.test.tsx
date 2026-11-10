import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { PlanimetriaProjectCard } from "@/components/planimetrie/PlanimetriaProjectCard";
import type { RigaPlanimetria } from "@/lib/planimetrie/archivio";
vi.mock("@/hooks/usePermissions", () => ({
  usePermissions: () => ({
    canViewCustomers: true,
    canViewOrders: true,
    canViewPreventivi: true,
  }),
}));
const pianta: RigaPlanimetria = {
  id: "p1",
  company_id: "azienda",
  titolo: "Villa Rossi",
  descrizione: "Descrizione originale",
  stato: "bozza",
  versione_corrente: 3,
  customer_id: "c1",
  contact_id: null,
  quote_id: null,
  order_id: null,
  computo_upload_id: null,
  survey_id: null,
  created_by: null,
  created_at: "2026-11-10",
  updated_at: "2026-11-10",
  deleted_at: null,
};
const preview = {
  src: "data:image/svg+xml,test",
  piano: "Piano terra",
  stanze: 4,
  superficie: 92.5,
  piani: 2,
};
describe("Archivio planimetrie con anteprime e azioni contestuali", () => {
  it.each([true, false])(
    "mostra il documento e solo i collegamenti esistenti, vista elenco=%s",
    (list) => {
      const onAssocia = vi.fn();
      render(
        <MemoryRouter>
          <PlanimetriaProjectCard
            pianta={pianta}
            anteprima={preview}
            loading={false}
            mappa={{
              cliente: {
                c1: {
                  id: "c1",
                  nome: "Cliente Rossi",
                  percorso: "/azienda/clienti/c1",
                },
              },
              contatto: {},
              preventivo: {},
              commessa: {},
              computo: {},
            }}
            list={list}
            returnTo="/azienda/planimetrie?vista=elenco&q=Rossi"
            onAssocia={onAssocia}
          />
        </MemoryRouter>,
      );
      expect(
        screen.getByText(/Piano terra · 4 stanze · 92,5 m² · 2 piani/),
      ).toBeInTheDocument();
      expect(
        screen.getByRole("link", { name: "Cliente: Cliente Rossi" }),
      ).toHaveAttribute("href", "/azienda/clienti/c1");
      expect(
        screen
          .getByRole("link", { name: "Apri Villa Rossi" })
          .getAttribute("href"),
      ).toContain("torna=");
      fireEvent.click(
        screen.getByRole("button", { name: "Associa Villa Rossi" }),
      );
      expect(onAssocia).toHaveBeenCalledOnce();
      expect(
        screen.queryByText(/Crea cliente|Crea preventivo|Crea commessa/),
      ).not.toBeInTheDocument();
    },
  );
  it("senza anteprima non inventa superficie o stanze e permette comunque di aprire", () => {
    render(
      <MemoryRouter>
        <PlanimetriaProjectCard
          pianta={pianta}
          loading={false}
          list
          returnTo="/azienda/planimetrie"
        />
      </MemoryRouter>,
    );
    expect(screen.getByText("Versione 3")).toBeInTheDocument();
    expect(screen.queryByText(/m²/)).not.toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Apri progetto Villa Rossi" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Associa Villa Rossi" }),
    ).not.toBeInTheDocument();
  });
});
