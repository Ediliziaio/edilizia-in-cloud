import { afterEach, describe, expect, it, vi } from "vitest";
import {
  render,
  screen,
  cleanup,
  fireEvent,
  within,
} from "@testing-library/react";
import { CompanyConsumptionRanking } from "@/components/admin/company/CompanyConsumptionRanking";
import { report, footprint } from "../fixtures/companyConsumption";
const database = vi.hoisted(() => ({
  data: null as typeof footprint | null,
  isLoading: false,
  isError: false,
  isFetching: false,
  error: null as Error | null,
  refetch: vi.fn(),
}));
vi.mock("@/hooks/useCompanyDatabaseFootprint", () => ({
  useCompanyDatabaseFootprint: () => database,
}));
afterEach(() => {
  cleanup();
  database.data = null;
  database.isError = false;
  database.error = null;
  database.refetch.mockClear();
});
describe("Classifica consumi in scheda azienda", () => {
  it("distingue costo registrato, stime e quote comuni senza attribuire CPU", () => {
    render(<CompanyConsumptionRanking data={report} companyId="a" />);
    expect(
      screen.getByText("Include stime per 2 operazioni"),
    ).toBeInTheDocument();
    expect(screen.getByText("1 costo non misurato")).toBeInTheDocument();
    expect(
      screen.getByText("Tempi SQL e CPU per azienda: non disponibili."),
    ).toBeInTheDocument();
    const table = screen.getByRole("table");
    expect(within(table).getAllByRole("row")[1]).toHaveTextContent(
      "Azienda Beta",
    );
  });
  it("filtra senza cambiare posizione o quota e segnala i backup inclusi", () => {
    render(<CompanyConsumptionRanking data={report} companyId="a" />);
    fireEvent.click(screen.getByRole("button", { name: /File e backup/ }));
    expect(
      screen.getByText("Spazio file misurato, backup inclusi"),
    ).toBeInTheDocument();
    fireEvent.change(
      screen.getByLabelText("Cerca azienda nella classifica consumi"),
      { target: { value: "Beta" } },
    );
    const row = within(screen.getByRole("table")).getAllByRole("row")[1];
    expect(row).toHaveTextContent("2");
    expect(row).toHaveTextContent("10%");
    expect(screen.getByText(/1 di 2 aziende/)).toBeInTheDocument();
  });
  it("mostra copertura reale e bytes stimati con conteggi di record distinti", () => {
    database.data = footprint;
    render(<CompanyConsumptionRanking data={report} companyId="a" />);
    fireEvent.click(screen.getByRole("button", { name: /Spazio DB stimato/ }));
    expect(
      screen.getByText("Copertura: 2 di 50 tabelle con azienda"),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        /Non attribuiti o fuori elenco: 20 record · 200 B stimati/,
      ),
    ).toBeInTheDocument();
    expect(
      within(screen.getByRole("table")).getAllByRole("row")[1],
    ).toHaveTextContent("Azienda Alfa");
    fireEvent.click(screen.getByRole("button", { name: /Record DB/ }));
    expect(
      within(screen.getByRole("table")).getAllByRole("row")[1],
    ).toHaveTextContent("Azienda Beta");
    expect(screen.getByText("61")).toBeInTheDocument();
  });
  it("un errore database lascia disponibili i costi e non diventa zero", () => {
    database.isError = true;
    database.error = new Error("Accesso riservato");
    render(<CompanyConsumptionRanking data={report} companyId="a" />);
    fireEvent.click(screen.getByRole("button", { name: /Record DB/ }));
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Classifica database non disponibile",
    );
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Rileva database/ }));
    expect(database.refetch).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByRole("button", { name: /Costi registrati/ }));
    expect(screen.getByRole("table")).toBeInTheDocument();
  });
});
