import { afterEach, describe, expect, it, vi } from "vitest";
import "@testing-library/jest-dom/vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { F24Generator } from "@/components/contabilita/F24Generator";
import type { F24Entry } from "@/hooks/useF24";
import { fiscalToday } from "@/lib/fatturazione/fiscalInsights";

vi.mock("@/components/ui/select", () => ({
  Select: ({
    children,
    value,
    onValueChange,
  }: {
    children: React.ReactNode;
    value: string;
    onValueChange: (v: string) => void;
  }) => (
    <select value={value} onChange={(e) => onValueChange(e.target.value)}>
      {children}
    </select>
  ),
  SelectTrigger: (): null => null,
  SelectValue: (): null => null,
  SelectContent: ({ children }: { children: React.ReactNode }) => (
    <>{children}</>
  ),
  SelectItem: ({
    children,
    value,
  }: {
    children: React.ReactNode;
    value: string;
  }) => <option value={value}>{children}</option>,
}));
afterEach(cleanup);
const base = () => ({
  entries: [] as F24Entry[],
  isLoading: false,
  onSalva: vi.fn(async () => {}),
  onAnteprima: vi.fn(async () => "version-1"),
  isSalvando: false,
  totaleAPagare: 0,
  scadentiProssimi30gg: [] as F24Entry[],
  readOnly: false,
  periodMonth: 9,
});
function fill() {
  fireEvent.click(screen.getByRole("button", { name: "Nuovo F24" }));
  fireEvent.change(
    screen
      .getByRole("option", { name: /1001.*Ritenute su retribuzioni/ })
      .closest("select")!,
    {
      target: { value: "1001" },
    },
  );
  fireEvent.change(screen.getByPlaceholderText("0,00"), {
    target: { value: "123.45" },
  });
  fireEvent.change(screen.getByPlaceholderText("Note aggiuntive..."), {
    target: { value: "Prospetto consulente 123" },
  });
}
describe("explicit F24 confirmation", () => {
  it("drills into overdue and today's records without confirming any payment", () => {
    const props = base();
    const row = (
      id: string,
      date: string,
      stato: F24Entry["stato"],
    ): F24Entry => ({
      id,
      company_id: "demo",
      anno: 2026,
      mese: 10,
      tributo_code: id,
      tributo_descrizione: `Voce ${id}`,
      importo: 10,
      stato,
      data_scadenza: date,
      data_pagamento: null,
      note: "Riferimento consulente",
      pdf_url: null,
      created_at: "2026-10-01",
    });
    render(
      <F24Generator
        {...props}
        readOnly
        entries={[
          row("late", "2020-01-01", "da_pagare"),
          row("today", fiscalToday(), "da_pagare"),
          row("paid", "2020-01-01", "pagato"),
        ]}
        totaleAPagare={20}
      />,
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Filtra: Scadute nel periodo" }),
    );
    expect(screen.getByText("Voce late")).toBeVisible();
    expect(screen.queryByText("Voce today")).toBeNull();
    expect(screen.queryByText("Voce paid")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Dati e documenti" }));
    expect(screen.getByRole("dialog")).toHaveTextContent("Verifica quietanza");
    expect(screen.getByRole("dialog")).toHaveTextContent(
      "Nessun riferimento ad allegato",
    );
    expect(props.onSalva).not.toHaveBeenCalled();
  });
  it("does not represent missing totals as zero or duplicate the upcoming count", () => {
    const props = base();
    render(<F24Generator {...props} totaleAPagare={null} />);
    expect(screen.getByText("Importo da verificare")).toBeVisible();
    expect(screen.queryByText(/Hai .* in scadenza/)).toBeNull();
    expect(props.onSalva).not.toHaveBeenCalled();
  });
  it("only offers months within the selected quarter", async () => {
    const props = base();
    render(
      <F24Generator
        {...props}
        periodMonth={undefined}
        periodMonths={[10, 11, 12]}
      />,
    );
    fill();
    expect(screen.queryByRole("option", { name: "Gennaio" })).toBeNull();
    expect(screen.getByRole("option", { name: "Ottobre" })).toBeInTheDocument();
    fireEvent.change(
      screen.getByRole("option", { name: "Novembre" }).closest("select")!,
      {
        target: { value: "11" },
      },
    );
    fireEvent.click(screen.getByRole("button", { name: "Verifica anteprima" }));
    await screen.findByRole("button", { name: "Conferma registrazione" });
    expect(props.onAnteprima).toHaveBeenCalledWith(11);
    expect(props.onSalva).not.toHaveBeenCalled();
  });
  it("only reads on preview and writes once on a separate confirmation", async () => {
    const props = base();
    render(<F24Generator {...props} />);
    fill();
    fireEvent.click(screen.getByRole("button", { name: "Verifica anteprima" }));
    await screen.findByRole("button", { name: "Conferma registrazione" });
    expect(props.onAnteprima).toHaveBeenCalledWith(9);
    expect(props.onSalva).not.toHaveBeenCalled();
    expect(screen.getByRole("status")).toHaveTextContent(
      "senza trasmissioni o pagamenti",
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Conferma registrazione" }),
    );
    await waitFor(() => expect(props.onSalva).toHaveBeenCalledTimes(1));
    expect(props.onSalva).toHaveBeenCalledWith(
      expect.objectContaining({
        tributo_code: "1001",
        importo: 123.45,
        mese: 9,
      }),
      "version-1",
    );
  });
  it("invalidates a prepared preview if any input changes", async () => {
    const props = base();
    render(<F24Generator {...props} />);
    fill();
    fireEvent.click(screen.getByRole("button", { name: "Verifica anteprima" }));
    await screen.findByRole("button", { name: "Conferma registrazione" });
    fireEvent.change(screen.getByPlaceholderText("0,00"), {
      target: { value: "150" },
    });
    expect(
      screen.queryByRole("button", { name: "Conferma registrazione" }),
    ).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Verifica anteprima" }));
    await screen.findByRole("button", { name: "Conferma registrazione" });
    expect(props.onAnteprima).toHaveBeenCalledTimes(2);
    expect(props.onSalva).not.toHaveBeenCalled();
  });
  it("retains data and requests a fresh preview after a failed confirmation", async () => {
    const props = base();
    props.onSalva.mockRejectedValueOnce(Error("stale version"));
    render(<F24Generator {...props} />);
    fill();
    fireEvent.click(screen.getByRole("button", { name: "Verifica anteprima" }));
    fireEvent.click(
      await screen.findByRole("button", { name: "Conferma registrazione" }),
    );
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Registrazione non riuscita",
    );
    expect(screen.getByPlaceholderText("0,00")).toHaveValue(123.45);
    expect(
      screen.getByRole("button", { name: "Verifica anteprima" }),
    ).toBeEnabled();
  });
  it("never offers new registrations in read-only mode", () => {
    const props = base();
    render(<F24Generator {...props} readOnly />);
    expect(
      screen.queryByRole("button", { name: "Nuovo F24" }),
    ).not.toBeInTheDocument();
    expect(props.onAnteprima).not.toHaveBeenCalled();
    expect(props.onSalva).not.toHaveBeenCalled();
  });
  it("keeps the shared month after cancelling and reopening the form", async () => {
    const props = base();
    render(<F24Generator {...props} />);
    fill();
    fireEvent.click(screen.getByRole("button", { name: "Annulla" }));
    fill();
    fireEvent.click(screen.getByRole("button", { name: "Verifica anteprima" }));
    await screen.findByRole("button", { name: "Conferma registrazione" });
    expect(props.onAnteprima).toHaveBeenCalledWith(9);
    expect(props.onSalva).not.toHaveBeenCalled();
  });
});
