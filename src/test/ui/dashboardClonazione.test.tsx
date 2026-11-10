import { afterEach, beforeEach, expect, it, vi } from "vitest";
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
const state = vi.hoisted(() => ({ save: vi.fn(), read: vi.fn(), clone: vi.fn(), notifyError: vi.fn(), readonly: false, dashError: false, templateError: false, retry: vi.fn() }));
vi.mock("@/hooks/usePermissions", () => ({ usePermissions: () => ({ isLoading: false, isAdmin: true, solaLettura: state.readonly }) }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { auth: { getUser: async () => ({ data: { user: null as null } }) } } }));
vi.mock("@tanstack/react-query", () => ({ useQuery: () => ({ data: [] as unknown[], refetch: vi.fn() }) }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: state.notifyError } }));
vi.mock("@/lib/dashboardBuilder/api", () => ({ getDashboard: state.read }));
vi.mock("@/lib/dashboardBuilder/hooks", () => {
 const mutation = () => ({ isPending: false, mutate: vi.fn() });
 return {
  useDashboards: () => ({ data: [{ id: "source", name: "Dashboard sorgente", description: null as null, scope: "personal", is_owner: true, can_edit: true, versions_count: 1 }], isLoading: false, isError: state.dashError, refetch: state.retry }),
  useDashboardTemplates: () => ({ data: [] as unknown[], isLoading: false, isError: state.templateError, refetch: state.retry }),
  useSaveDashboard: () => ({ isPending: false, mutate: state.save, mutateAsync: state.save }),
  useCloneTemplateToCompany: () => ({ isPending: false, mutate: state.clone, mutateAsync: state.clone }),
  useDeleteDashboard: mutation, useUpdateDashboardScope: mutation, useSetDashboardUserAccess: mutation, useUnsetDashboardUserAccess: mutation,
  useCompanyMembers: () => ({ data: [] as unknown[], isLoading: false }),
 };
});
import CruscottoHub from "@/pages/azienda/CruscottoHub";
const layout = { widgets: [{ id: "text-1", type: "text_markdown", x: 0, y: 0, w: 6, h: 3, config: { markdown: "Contenuto da conservare" } }] };
beforeEach(() => {
 vi.clearAllMocks();
 state.readonly = false; state.dashError = false; state.templateError = false;
 state.read.mockResolvedValue({ dashboard: { description: "Descrizione sorgente", icon: "chart" }, version: { layout } });
 state.save.mockResolvedValue({ dashboard_id: "copy", version: 1 });
});
afterEach(cleanup);
function openClone() {
 render(<MemoryRouter><CruscottoHub /></MemoryRouter>);
 fireEvent.click(screen.getAllByRole("button", { name: "Aggiungi dashboard" })[0]);
 fireEvent.click(screen.getByRole("button", { name: "Clona dashboard esistente" }));
 fireEvent.click(screen.getByRole("button", { name: /Dashboard sorgente\s*Privata/ }));
 return screen.getByRole("textbox", { name: "Nome della dashboard" });
}
it("clona il layout della sorgente, senza salvarne una versione vuota", async () => {
 openClone();
 fireEvent.click(screen.getByRole("button", { name: "Conferma" }));
 await waitFor(() => expect(state.save).toHaveBeenCalledOnce());
 expect(state.read).toHaveBeenCalledWith("source");
 expect(state.save.mock.calls[0][0]).toMatchObject({ name: "Dashboard sorgente (copia)", layout });
});
it("se non può leggere la sorgente non crea un clone vuoto e consente di riprovare", async () => {
 state.read.mockRejectedValueOnce(new Error("Sorgente non disponibile"));
 openClone();
 fireEvent.click(screen.getByRole("button", { name: "Conferma" }));
 await waitFor(() => expect(state.notifyError).toHaveBeenCalled());
 expect(state.save).not.toHaveBeenCalled();
 expect(screen.getByRole("textbox", { name: "Nome della dashboard" })).toHaveValue("Dashboard sorgente (copia)");
 fireEvent.click(screen.getByRole("button", { name: "Conferma" }));
 await waitFor(() => expect(state.save).toHaveBeenCalledOnce());
});
it("blocca Invio ripetuto e chiusura durante la lettura della sorgente", async () => {
 let finish!: (value: unknown) => void;
 state.read.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
 const name = openClone();
 fireEvent.keyDown(name, { key: "Enter" });
 fireEvent.keyDown(name, { key: "Enter" });
 await waitFor(() => expect(state.read).toHaveBeenCalledOnce());
 fireEvent.click(screen.getByRole("button", { name: "Annulla" }));
 expect(screen.getByRole("textbox", { name: "Nome della dashboard" })).toBeInTheDocument();
 const modal = screen.getAllByRole("dialog").find(el => within(el).queryByRole("textbox", { name: "Nome della dashboard" }));
 fireEvent.keyDown(modal!, { key: "Escape" });
 expect(name).toBeInTheDocument();
 finish({ dashboard: {}, version: { layout } });
 await waitFor(() => expect(state.save).toHaveBeenCalledOnce());
});
it("mantiene la creazione da zero senza leggere una dashboard sorgente", async () => {
 render(<MemoryRouter><CruscottoHub /></MemoryRouter>);
 fireEvent.click(screen.getAllByRole("button", { name: "Aggiungi dashboard" })[0]);
 fireEvent.click(screen.getByRole("button", { name: "Crea una dashboard vuota" }));
 fireEvent.change(screen.getByRole("textbox", { name: "Nome della dashboard" }), { target: { value: "Nuova vista" } });
 fireEvent.click(screen.getByRole("button", { name: "Conferma" }));
 await waitFor(() => expect(state.save).toHaveBeenCalledOnce());
 expect(state.read).not.toHaveBeenCalled();
 expect(state.save.mock.calls[0][0]).toMatchObject({ name: "Nuova vista", scope: "personal", layout: { widgets: [] } });
});

it("distingue l’errore dell’elenco dashboard e consente una nuova lettura", () => {
 state.dashError = true;
 render(<MemoryRouter><CruscottoHub /></MemoryRouter>);
 expect(screen.getByRole("alert")).toHaveTextContent("Impossibile aggiornare le dashboard personalizzate");
 fireEvent.click(screen.getByRole("button", { name: "Riprova caricamento dashboard" }));
 expect(state.retry).toHaveBeenCalledOnce();
});
it("non presenta un errore della libreria come assenza di modelli", () => {
 state.templateError = true;
 render(<MemoryRouter><CruscottoHub /></MemoryRouter>);
 fireEvent.click(screen.getAllByRole("button", { name: "Aggiungi dashboard" })[0]);
 fireEvent.click(screen.getByRole("button", { name: "Dalla Libreria di modelli" }));
 expect(screen.getByRole("alert")).toHaveTextContent("Impossibile caricare i modelli personalizzati");
 expect(screen.queryByText("Nessun template trovato")).not.toBeInTheDocument();
 fireEvent.click(screen.getByRole("button", { name: "Riprova caricamento modelli" }));
 expect(state.retry).toHaveBeenCalledOnce();
});

it("in sola lettura impedisce creazione, modifica, permessi ed eliminazione", () => {
 state.readonly = true;
 render(<MemoryRouter><CruscottoHub /></MemoryRouter>);
 for (const button of screen.getAllByRole("button", { name: "Aggiungi dashboard" })) expect(button).toBeDisabled();
 expect(screen.queryByRole("link", { name: "Modifica" })).not.toBeInTheDocument();
 expect(screen.getByRole("button", { name: "Elimina dashboard" })).toBeDisabled();
 const card = screen.getByText("Dashboard sorgente", { exact: true }).closest(".group");
 expect(within(card as HTMLElement).getByRole("button", { name: "Permessi dashboard" })).toBeDisabled();
 fireEvent.click(screen.getAllByRole("button", { name: "Aggiungi dashboard" })[0]);
 expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
 expect(state.save).not.toHaveBeenCalled();
});
