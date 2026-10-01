import {
  render,
  screen,
  fireEvent,
  waitFor,
  cleanup,
} from "@testing-library/react";
import { beforeEach, afterEach, describe, it, expect, vi } from "vitest";
import { AcceptanceTaskActions } from "@/components/orders/AcceptanceTaskActions";

const mocks = vi.hoisted(() => ({
  data: [] as unknown[],
  error: false,
  loading: false,
  rpc: vi.fn(),
  invalidate: vi.fn(),
  success: vi.fn(),
  failure: vi.fn(),
}));
vi.mock("@tanstack/react-query", () => ({
  useQuery: () => ({
    data: mocks.data,
    isLoading: mocks.loading,
    isError: mocks.error,
    refetch: vi.fn(),
  }),
  useQueryClient: () => ({ invalidateQueries: mocks.invalidate }),
}));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { rpc: mocks.rpc },
}));
vi.mock("sonner", () => ({
  toast: { success: mocks.success, error: mocks.failure },
}));
const actions = [
  {
    work: "Ripristinare sigillatura",
    owner: "Idraulico DEMO",
    due: "2026-10-05",
  },
];
const show = (canCreate = true, onOpenTasks = vi.fn()) =>
  render(
    <AcceptanceTaskActions
      reportId="report"
      companyId="company"
      orderId="order"
      actions={actions}
      canCreate={canCreate}
      onOpenTasks={onOpenTasks}
    />,
  );
beforeEach(() => {
  vi.clearAllMocks();
  mocks.data = [];
  mocks.error = false;
  mocks.loading = false;
  mocks.rpc.mockResolvedValue({ data: 1, error: null });
});
afterEach(cleanup);
describe("Attività dalle riserve del collaudo", () => {
  it("non crea niente in automatico e mostra referente e scadenza", () => {
    show();
    expect(mocks.rpc).not.toHaveBeenCalled();
    expect(screen.getByText(/Idraulico DEMO/)).toBeInTheDocument();
    expect(screen.getByText(/05\/10\/2026/)).toBeInTheDocument();
  });
  it("crea con un comando e aggiorna attività e prossima attività", async () => {
    show();
    fireEvent.click(
      screen.getByRole("button", { name: "Crea attività per me" }),
    );
    await waitFor(() => expect(mocks.invalidate).toHaveBeenCalledTimes(2));
    expect(mocks.rpc).toHaveBeenCalledWith("create_acceptance_tasks", {
      p_report_id: "report",
    });
    expect(mocks.invalidate).toHaveBeenCalledWith({ queryKey: ["tasks"] });
    expect(mocks.invalidate).toHaveBeenCalledWith({
      queryKey: ["order-next-task", "order"],
    });
  });
  it("blocca un doppio clic durante la richiesta", async () => {
    let finish!: (v: unknown) => void;
    mocks.rpc.mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    show();
    const button = screen.getByRole("button", { name: "Crea attività per me" });
    fireEvent.click(button);
    fireEvent.click(button);
    expect(mocks.rpc).toHaveBeenCalledTimes(1);
    finish({ data: 1, error: null });
    await waitFor(() => expect(mocks.success).toHaveBeenCalled());
  });
  it("non ricrea attività completate e mostra la scadenza aggiornata", () => {
    mocks.data = [
      {
        id: "task",
        title: "Collaudo · Ripristinare sigillatura",
        status: "completata",
        due_date: "2026-10-07",
        acceptance_action_index: 0,
      },
    ];
    show();
    expect(
      screen.getByRole("button", { name: "Attività già collegate" }),
    ).toBeDisabled();
    expect(screen.getByText("1/1 completate")).toBeInTheDocument();
    expect(
      screen.getByText(/07\/10\/2026 · Nel verbale: 05\/10\/2026/),
    ).toBeInTheDocument();
  });
  it("non offre creazione senza permesso e apre il flusso attività esistente", () => {
    const open = vi.fn();
    show(false, open);
    expect(
      screen.queryByRole("button", { name: "Crea attività per me" }),
    ).not.toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("button", { name: "Apri attività della commessa" }),
    );
    expect(open).toHaveBeenCalledOnce();
  });
  it("blocca creazione se non può verificare le attività esistenti", () => {
    mocks.error = true;
    show();
    expect(screen.getByRole("alert")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Crea attività per me" }),
    ).toBeDisabled();
  });
  it("non segnala successo se il server rifiuta", async () => {
    mocks.rpc.mockResolvedValue({
      data: null,
      error: { message: "Non autorizzato" },
    });
    show();
    fireEvent.click(
      screen.getByRole("button", { name: "Crea attività per me" }),
    );
    await waitFor(() => expect(mocks.failure).toHaveBeenCalled());
    expect(mocks.success).not.toHaveBeenCalled();
    expect(mocks.invalidate).not.toHaveBeenCalled();
  });
});
