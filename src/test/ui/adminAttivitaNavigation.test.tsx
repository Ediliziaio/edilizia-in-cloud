import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import AdminAttivita from "@/pages/admin/AdminAttivita";
import type { AdminTask } from "@/lib/adminTasks";
vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({user:{id:"me"}, profile:{first_name:"Demo"}}) }));
vi.mock("@/hooks/useSuperAdminPermissions", () => ({useSuperAdminPermissions: () => ({permissions:{can_manage_companies:true}})}));
vi.mock("@/hooks/useWeatherForecast", () => ({useWeatherForecast: () => ({data:undefined, isLoading:false, isError:false})}));
vi.mock("@/components/admin/tasks/NewTaskDialog", () => ({NewTaskDialog: () => null}));
vi.mock("@/pages/admin/AdminCSTasks", () => ({default: () => <p>Gestione completa caricata</p>}));
vi.mock("@tanstack/react-query", () => ({
  useQuery: ({queryKey}: {queryKey: readonly unknown[]}) => ({data: queryKey[0] === "cs-tasks" ? [{id:"demo", title:"Richiamare il cliente e verificare la richiesta", description:null, status:"open", priority:"medium", due_date:null, assigned_to:"me", company_id:null, completed_at:null, created_at:"2026-10-15", task_type:null} satisfies AdminTask] : [], isLoading:false, isError:false}),
  useMutation: () => ({mutate:vi.fn()}), useQueryClient: () => ({invalidateQueries:vi.fn()}),
}));
afterEach(cleanup);
describe("Attività: collegamenti e ambito dei conteggi", () => {
  it("apre la gestione completa dal collegamento della dashboard nella stessa pagina", async () => {
    render(<MemoryRouter initialEntries={["/admin/attivita/"]}><AdminAttivita /></MemoryRouter>);
    expect(screen.getByText("Richiamare il cliente e verificare la richiesta")).toBeInTheDocument();
    expect(screen.getByRole("region", {name:"Riepilogo degli altri membri del team"})).toHaveTextContent("escludono le tue attività");
    fireEvent.click(screen.getByRole("link", {name:/Apri gestione completa/}));
    expect(await screen.findByText("Gestione completa caricata")).toBeInTheDocument();
    expect(screen.getByRole("tab", {name:/Tutte le attività/})).toHaveAttribute("aria-selected", "true");
  });
});
