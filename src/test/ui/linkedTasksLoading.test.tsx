import { cleanup, render, screen, fireEvent } from "@testing-library/react";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { LinkedTasks } from "@/components/tasks/LinkedTasks";
const m = vi.hoisted(() => ({
  from: vi.fn(),
  queryFn: null as null | (() => Promise<unknown>),
  error: false,
  loading: false,
  refetch: vi.fn(),
}));
vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ effectiveCompany: { id: "company" } }),
}));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { from: m.from },
}));
vi.mock("@/components/tasks/TaskDialog", () => ({ TaskDialog: (): null => null }));
vi.mock("@tanstack/react-query", () => ({
  useQuery: (config: { queryFn: () => Promise<unknown> }) => {
    m.queryFn = config.queryFn;
    return {
      data: [] as unknown[],
      isError: m.error,
      isLoading: m.loading,
      error: m.error ? new Error("Errore query") : null,
      refetch: m.refetch,
    };
  },
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
  useMutation: () => ({ mutate: vi.fn() }),
}));
beforeEach(() => {
  vi.clearAllMocks();
  m.error = false;
  m.loading = false;
});
afterEach(cleanup);
const show = () => render(<LinkedTasks orderId="order" category="ordini" />);
describe("Attività collegate: caricamento e dipendenze", () => {
  it("un errore non viene presentato come elenco vuoto", () => {
    m.error = true;
    show();
    expect(screen.getByRole("alert")).toBeInTheDocument();
    expect(
      screen.queryByText("Nessuna attività collegata"),
    ).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Riprova" }));
    expect(m.refetch).toHaveBeenCalledOnce();
  });
  it("attende i dati prima di dichiarare assenti le attività", () => {
    m.loading = true;
    show();
    expect(screen.getByRole("status")).toHaveTextContent(
      "Caricamento attività",
    );
    expect(
      screen.queryByText("Nessuna attività collegata"),
    ).not.toBeInTheDocument();
  });
  it("carica i predecessori in una query separata e circoscritta alla stessa azienda", async () => {
    const task = { id: "task", bloccata_da_task_id: "predecessor" };
    const main = {
      select: vi.fn(),
      eq: vi.fn(),
      order: vi.fn(),
      then: (resolve: (value: unknown) => unknown) =>
        Promise.resolve({ data: [task], error: null }).then(resolve),
    };
    main.select.mockReturnValue(main);
    main.eq.mockReturnValue(main);
    main.order.mockReturnValue(main);
    const deps = {
      select: vi.fn(),
      eq: vi.fn(),
      in: vi
        .fn()
        .mockResolvedValue({
          data: [{ id: "predecessor", title: "Prima attività" }],
          error: null,
        }),
    };
    deps.select.mockReturnValue(deps);
    deps.eq.mockReturnValue(deps);
    m.from.mockReturnValueOnce(main).mockReturnValueOnce(deps);
    show();
    expect(await m.queryFn!()).toEqual([
      { ...task, bloccata_da: { id: "predecessor", title: "Prima attività" } },
    ]);
    expect(main.select.mock.calls[0][0]).not.toContain("bloccata_da:tasks!");
    expect(main.eq).toHaveBeenCalledWith("order_id", "order");
    expect(deps.eq).toHaveBeenCalledWith("company_id", "company");
    expect(deps.in).toHaveBeenCalledWith("id", ["predecessor"]);
  });
});

describe("Attività nella commessa: una riga sola finché non ce ne sono (06/10/2026)", () => {
  const compatta = () => render(<LinkedTasks orderId="order" category="ordini" compatta />);

  it("vuota: «Attività · nessuna · Aggiungi» su una riga, senza il riquadro col messaggio al centro", () => {
    compatta();
    expect(screen.getByText("nessuna")).toBeInTheDocument();
    expect(screen.queryByText("Nessuna attività collegata")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Aggiungi" })).toBeInTheDocument();
  });

  it("mentre carica non dice «nessuna»; se non carica lo dice con l'errore, non come elenco vuoto", () => {
    m.loading = true;
    const { unmount } = compatta();
    expect(screen.queryByText("nessuna")).not.toBeInTheDocument();
    unmount();
    m.loading = false;
    m.error = true;
    compatta();
    expect(screen.getByRole("alert")).toBeInTheDocument();
    expect(screen.queryByText("nessuna")).not.toBeInTheDocument();
  });
});
