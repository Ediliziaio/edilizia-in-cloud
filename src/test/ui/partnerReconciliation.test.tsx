import { beforeEach, afterEach, it, expect, vi } from "vitest";
import {
  render,
  screen,
  fireEvent,
  cleanup,
  within,
} from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { MemoryRouter } from "react-router-dom";
const s = vi.hoisted(() => ({
  kind: "cliente",
  readonly: false,
  fail: false,
  save: vi.fn(),
  targets: [
    { id: "target", company_id: "A", name: "Cliente vero", vat: "01234567890" },
  ],
  fiscal: [
    {
      id: "fiscal",
      company_id: "A",
      name: "Intestazione fiscale",
      vat: "IT01234567890",
      tipo: "entrambi",
      cliente_id: null as null,
      fornitore_id: null as null,
      receiptIds: undefined as string[] | undefined,
    },
  ],
  permissions: true,
}));
vi.mock("@/hooks/usePermissions", () => ({
  usePermissions: () => ({
    isAdmin: s.permissions,
    canViewBilling: s.permissions,
    solaLettura: s.readonly,
  }),
}));
vi.mock("@/hooks/billing/usePartnerReconciliation", () => ({
  usePartnerReconciliation: (_company: string, kind: string) => {
    s.kind = kind;
    return {
      data: { fiscal: s.fiscal, targets: s.targets },
      isError: s.fail,
      isLoading: false,
      refetch: vi.fn(),
    };
  },
  useReconcilePartner: () => ({ mutateAsync: s.save, isPending: false }),
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
import { PartnerReconciliationPanel } from "@/components/fatturazione/PartnerReconciliationPanel";
beforeEach(() => {
  s.readonly = false;
  s.fail = false;
  s.permissions = true;
  s.targets[0].vat = "01234567890";
  s.fiscal[0].vat = "IT01234567890";
  s.fiscal[0].name = "Intestazione fiscale";
  s.fiscal[0].receiptIds = undefined;
  s.save.mockReset().mockResolvedValue(undefined);
});
afterEach(cleanup);
it("senza identificativi non basta premere Conferma", () => {
  s.targets[0].vat = "";
  s.fiscal[0].vat = "";
  s.fiscal[0].name = "Cliente vero";
  open();
  fireEvent.click(
    screen.getByRole("button", { name: "Verifica collegamento" }),
  );
  const dialog = screen.getByRole("dialog");
  expect(
    within(dialog).getByRole("button", { name: "Conferma" }),
  ).toBeDisabled();
  fireEvent.click(
    within(dialog).getByLabelText("Ho verificato che è lo stesso soggetto"),
  );
  expect(
    within(dialog).getByRole("button", { name: "Conferma" }),
  ).toBeEnabled();
  expect(s.save).not.toHaveBeenCalled();
});
it("ricevute e rubrica usano salvataggi distinti e le ricevute non copiano recapiti", () => {
  s.fiscal[0].receiptIds = ["invoice-1", "invoice-2"];
  open();
  fireEvent.mouseDown(
    screen.getByRole("tab", { name: "Fornitori operativi" }),
    { button: 0, ctrlKey: false },
  );
  fireEvent.click(
    screen.getByRole("button", { name: "Verifica collegamento" }),
  );
  const dialog = screen.getByRole("dialog");
  expect(
    within(dialog).queryByLabelText("Completa solo email e telefono mancanti"),
  ).not.toBeInTheDocument();
  expect(dialog).toHaveTextContent("2 fatture");
  fireEvent.click(within(dialog).getByRole("button", { name: "Conferma" }));
  expect(s.save).toHaveBeenCalledWith(
    expect.objectContaining({
      kind: "fornitore",
      receiptIds: ["invoice-1", "invoice-2"],
    }),
  );
});
const open = () =>
  render(
    <MemoryRouter>
      <PartnerReconciliationPanel companyId="A" />
    </MemoryRouter>,
  );
it("mostra suggerimenti ma non collega prima della conferma esplicita", async () => {
  open();
  fireEvent.click(
    screen.getByRole("button", { name: "Verifica collegamento" }),
  );
  expect(s.save).not.toHaveBeenCalled();
  const dialog = screen.getByRole("dialog");
  expect(
    within(dialog).getByText(/non attiva sincronizzazioni future/i),
  ).toBeInTheDocument();
  fireEvent.click(within(dialog).getByRole("button", { name: "Conferma" }));
  expect(s.save).toHaveBeenCalledWith({
    fiscalId: "fiscal",
    kind: "cliente",
    targetId: "target",
    completeMissing: false,
  });
});
it("fornitore usa una relazione separata dal cliente", () => {
  open();
  fireEvent.mouseDown(
    screen.getByRole("tab", { name: "Fornitori operativi" }),
    { button: 0, ctrlKey: false },
  );
  expect(s.kind).toBe("fornitore");
  fireEvent.click(
    screen.getByRole("button", { name: "Verifica collegamento" }),
  );
  fireEvent.click(
    within(screen.getByRole("dialog")).getByRole("button", {
      name: "Conferma",
    }),
  );
  expect(s.save).toHaveBeenCalledWith(
    expect.objectContaining({ kind: "fornitore" }),
  );
});
it("sola lettura non espone azioni di collegamento", () => {
  s.readonly = true;
  open();
  expect(
    screen.queryByRole("button", { name: "Verifica collegamento" }),
  ).not.toBeInTheDocument();
  expect(
    screen.getByText(/consultazione: non puoi modificare/i),
  ).toBeInTheDocument();
});
it("errori non diventano un elenco vuoto o zero collegamenti", () => {
  s.fail = true;
  open();
  expect(screen.getByRole("alert")).toHaveTextContent(
    "Collegamenti non disponibili",
  );
  expect(screen.queryByText(/0 anagrafiche/)).not.toBeInTheDocument();
});
it("richiede anche il permesso del registro operativo", () => {
  s.permissions = false;
  open();
  expect(screen.getByRole("alert")).toHaveTextContent("permesso di lettura");
  expect(s.save).not.toHaveBeenCalled();
});
