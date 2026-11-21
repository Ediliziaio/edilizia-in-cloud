import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import ExcelJS from "exceljs";
import { BankStatementImportDialog } from "@/components/tesoreria/BankStatementImportDialog";

const mock = vi.hoisted(() => ({ importRows: vi.fn(async () => undefined) }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));
vi.mock("@/hooks/useManualTreasury", () => ({ useManualTreasury: () => ({ bulkInsert: { mutateAsync: mock.importRows } }) }));

it("legge la stessa data da una cella Excel nativa e da una cella testuale e segnala la riga non valida", async () => {
  const book = new ExcelJS.Workbook();
  const sheet = book.addWorksheet("Movimenti");
  sheet.addRow(["Data", "Descrizione", "Importo"]);
  sheet.addRow([new Date(Date.UTC(2026, 10, 20)), "Data nativa", 100]);
  sheet.addRow(["20/11/2026", "Data testuale", 20]);
  sheet.addRow(["31/02/2026", "Data non valida", 999]);
  const bytes = await book.xlsx.writeBuffer();
  const file = new File([], "estratto.xlsx");
  Object.defineProperty(file, "arrayBuffer", { value: async () => bytes });
  const { baseElement } = render(<BankStatementImportDialog
    account={{ id: "conto", display_name: "Conto test", account_name: null, currency: "EUR", iban: null, opening_balance: 0, current_balance: 0, is_active: true }}
    open onOpenChange={() => undefined} onImported={() => undefined}
  />);
  fireEvent.change(baseElement.querySelector('input[accept^=".csv"]')!, { target: { files: [file] } });

  const importa = await screen.findByRole("button", { name: "Importa 2 movimenti" });
  expect(screen.getByText(/1 riga esclusa/)).toBeInTheDocument();
  fireEvent.click(importa);
  await waitFor(() => expect(mock.importRows).toHaveBeenCalledTimes(1));
  expect(mock.importRows).toHaveBeenCalledWith({
    account_id: "conto",
    source: "import_csv",
    rows: [
      expect.objectContaining({ booking_date: "2026-11-20", amount: 100, external_transaction_id: "csv:2026-11-20:100:Data nativa:0" }),
      expect.objectContaining({ booking_date: "2026-11-20", amount: 20, external_transaction_id: "csv:2026-11-20:20:Data testuale:0" }),
    ],
  });
});
