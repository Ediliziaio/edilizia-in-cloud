import { cleanup, render, screen, fireEvent } from "@testing-library/react";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { LinkedTasks } from "@/components/tasks/LinkedTasks";
const m = vi.hoisted(() => ({
  from: vi.fn(),
  queryFn: null as null | (() => Promise<unknown>),
  error: false,
  loading: false,
  mobile: false,
  refetch: vi.fn(),
  tasks: [] as {id: string; title: string; status: string; priority: string}[],
  mutationFn: null as null | ((args: {id: string; completed: boolean}) => Promise<unknown>),
}));
vi.mock("@/hooks/use-mobile", () => ({ useIsMobile: () => m.mobile }));
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
      data: m.tasks,
      isError: m.error,
      isLoading: m.loading,
      error: m.error ? new Error("Errore query") : null,
      refetch: m.refetch,
    };
  },
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
  useMutation: (config: {mutationFn: typeof m.mutationFn}) => {m.mutationFn = config.mutationFn; return { mutate: vi.fn() };},
}));
beforeEach(() => {
  vi.clearAllMocks();
  m.error = false;
  m.loading = false;
  m.mobile = false;
  m.tasks = [];
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

  it("dal telefono, vuota, non c'è proprio: l'attività si aggiunge dall'icona in testata", () => {
    m.mobile = true;
    compatta();
    expect(screen.queryByText("Attività")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Aggiungi" })).not.toBeInTheDocument();
  });
  it("non apre un elenco invasivo e mantiene le completate dietro una seconda scelta", () => {
    m.tasks = [{id: "done", title: "Attività chiusa", status: "completata", priority: "normale"}];
    compatta();
    expect(screen.queryByText("Attività chiusa")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", {name: "Mostra attività"}));
    expect(screen.queryByText("Attività chiusa")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", {name: "Mostra completate (1)"}));
    expect(screen.getByRole("button", {name: "Attività chiusa"})).toBeInTheDocument();
  });
  it("le attività aperte restano disponibili senza mescolarle allo storico", () => {
    m.tasks = [{id: "open", title: "Verifica materiale", status: "da_fare", priority: "alta"}, {id: "done", title: "Attività chiusa", status: "completata", priority: "normale"}];
    compatta(); expect(screen.getByText("1 da fare")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", {name: "Mostra attività"}));
    expect(screen.getByRole("button", {name: "Verifica materiale"})).toBeInTheDocument();
    expect(screen.queryByText("Attività chiusa")).not.toBeInTheDocument();
  });
  it("nella commessa in sola lettura non offre aggiunta o spunte modificabili", () => {
    m.tasks = [{id: "open", title: "Verifica materiale", status: "da_fare", priority: "alta"}];
    render(<LinkedTasks orderId="order" category="ordini" compatta editable={false} />);
    expect(screen.queryByRole("button", {name: "Aggiungi"})).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", {name: "Mostra attività"}));
    expect(screen.getByRole("checkbox")).toBeDisabled();
    expect(screen.getByRole("button", {name: "Verifica materiale"})).toBeDisabled();
  });
  it("non considera riuscita una spunta che il server non registra", async () => {
    const q = {update: vi.fn(), eq: vi.fn(), select: vi.fn(), maybeSingle: vi.fn().mockResolvedValue({data: null, error: null})};
    q.update.mockReturnValue(q); q.eq.mockReturnValue(q); q.select.mockReturnValue(q); m.from.mockReturnValue(q);
    compatta(); await expect(m.mutationFn!({id: "task", completed: true})).rejects.toThrow("Attività non aggiornata");
    expect(q.eq).toHaveBeenCalledWith("company_id", "company"); expect(q.eq).toHaveBeenCalledWith("order_id", "order");
  });
});
