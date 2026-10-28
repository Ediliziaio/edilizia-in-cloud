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
vi.stubGlobal(
  "ResizeObserver",
  class {
    observe() {}
    unobserve() {}
    disconnect() {}
  },
);
const s = vi.hoisted(() => ({
  canEdit: true,
  canRead: true,
  fail: false,
  saveRole: vi.fn(),
  saveContract: vi.fn(),
  upload: vi.fn(),
  download: vi.fn(),
  contracts: [] as unknown[],
}));
vi.mock("@/hooks/useSettingsDraftGuard", () => ({
  useSettingsDraftGuard: () => () => true,
}));
vi.mock("@/hooks/useSupplierWorkspace", () => ({
  useSupplierWorkspace: () => ({
    canRead: s.canRead,
    canEdit: s.canEdit,
    canSub: true,
    query: {
      data: { relation: null, contracts: s.contracts, documents: [] },
      isLoading: false,
      isError: s.fail,
      refetch: vi.fn(),
    },
    subs: { data: [], isLoading: false, isError: false },
    saveRelation: { mutateAsync: s.saveRole, isPending: false },
    saveContract: { mutateAsync: s.saveContract, isPending: false },
    upload: { mutateAsync: s.upload, isPending: false },
    download: s.download,
  }),
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
import { SupplierWorkspacePanel } from "@/components/suppliers/SupplierWorkspacePanel";
beforeEach(() => {
  s.canEdit = true;
  s.canRead = true;
  s.fail = false;
  s.contracts = [];
  for (const f of [s.saveRole, s.saveContract, s.upload, s.download])
    f.mockReset().mockResolvedValue(undefined);
});
afterEach(cleanup);
const open = () =>
  render(
    <MemoryRouter>
      <SupplierWorkspacePanel supplierId="S" />
    </MemoryRouter>,
  );
it("consulente e subappaltatore possono coesistere senza creare schede implicitamente", () => {
  open();
  fireEvent.click(screen.getByLabelText("Consulente esterno"));
  fireEvent.click(screen.getByLabelText("Subappaltatore"));
  expect(s.saveRole).not.toHaveBeenCalled();
  fireEvent.click(
    screen.getByRole("button", { name: "Salva ruoli e collegamento" }),
  );
  expect(s.saveRole).toHaveBeenCalledWith({
    roles: ["consulente", "subappaltatore"],
    subId: null,
    createSub: false,
  });
});
it("creazione della scheda dedicata richiede conferma e non crea account", () => {
  open();
  fireEvent.click(screen.getByLabelText("Subappaltatore"));
  fireEvent.click(
    screen.getByRole("button", { name: "Crea una nuova scheda dedicata" }),
  );
  expect(s.saveRole).not.toHaveBeenCalled();
  expect(screen.getByRole("dialog")).toHaveTextContent("Non crea account");
  fireEvent.click(
    screen.getByRole("button", { name: "Conferma creazione e collegamento" }),
  );
  expect(s.saveRole).toHaveBeenCalledWith(
    expect.objectContaining({ createSub: true, subId: null }),
  );
});
it("salva date, condizioni e importo facoltativo senza inventare uno zero", () => {
  open();
  fireEvent.click(screen.getByRole("button", { name: "Aggiungi contratto" }));
  const dialog = screen.getByRole("dialog");
  fireEvent.change(within(dialog).getByLabelText("Titolo *"), {
    target: { value: "Incarico consulente" },
  });
  fireEvent.change(within(dialog).getByLabelText("Data scadenza"), {
    target: { value: "2027-01-31" },
  });
  fireEvent.change(
    within(dialog).getByLabelText("Condizioni, pagamenti e note"),
    { target: { value: "Compenso mensile, IVA esclusa" } },
  );
  fireEvent.submit(
    within(dialog)
      .getByRole("button", { name: "Salva contratto" })
      .closest("form")!,
  );
  expect(s.saveContract).toHaveBeenCalledWith({
    existing: undefined,
    draft: expect.objectContaining({
      title: "Incarico consulente",
      ends_on: "2027-01-31",
      amount: null,
      conditions: "Compenso mensile, IVA esclusa",
    }),
  });
});
it("in sola lettura non offre creazione o upload", () => {
  s.canEdit = false;
  open();
  expect(
    screen.queryByRole("button", { name: "Aggiungi contratto" }),
  ).not.toBeInTheDocument();
  expect(screen.getByLabelText("Consulente esterno")).toBeDisabled();
});
it("fascicolo in errore non risulta vuoto", () => {
  s.fail = true;
  open();
  expect(screen.getByRole("alert")).toHaveTextContent(
    "Fascicolo non disponibile",
  );
  expect(
    screen.queryByText(/nessun contratto registrato/i),
  ).not.toBeInTheDocument();
});
