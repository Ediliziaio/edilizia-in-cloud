import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import AdminCSTasks from "@/pages/admin/AdminCSTasks";
import { PLATFORM_ADMIN_COMPANY_ID } from "@/lib/adminConstants";
import type { AdminTask } from "@/lib/adminTasks";
vi.mock("@/integrations/supabase/client", () => ({supabase:{}}));
vi.mock("@/hooks/use-mobile", () => ({useIsMobile: () => false}));
vi.mock("@/hooks/useSuperAdminPermissions", () => ({useSuperAdminPermissions: () => ({permissions:{can_manage_companies:true}})}));
vi.mock("@/components/admin/tasks/NewTaskDialog", async importOriginal => {
  const actual = await importOriginal<typeof import("@/components/admin/tasks/NewTaskDialog")>();
  return {...actual, NewTaskDialog: (): null => null};
});
function task(id: string, companyId: string): AdminTask {
  return {id, company_id:companyId, title:id, status:"open", priority:"medium", description:null, due_date:null, assigned_to:"me", completed_at:null, created_at:"2026-10-15", task_type:"manual"};
}
vi.mock("@tanstack/react-query", () => ({
  useQuery: ({queryKey}: {queryKey: readonly unknown[]}) => ({data:queryKey[0] === "cs-tasks" ? [task("Attività piattaforma", PLATFORM_ADMIN_COMPANY_ID),task("Attività cliente", "customer"),task("Attività da verificare", "unavailable")] : [{id:"customer", name:"Cliente demo"}], isLoading:false, isError:false}),
  useMutation: () => ({mutate:vi.fn()}), useQueryClient: () => ({invalidateQueries:vi.fn()}),
}));
afterEach(cleanup);
describe("Collegamenti delle attività interne", () => {
  it("non collega l'azienda tecnica esclusa dal portafoglio e conserva il link ai clienti", () => {
    render(<MemoryRouter><AdminCSTasks /></MemoryRouter>);
    expect(screen.getByText("Attività interna")).toBeInTheDocument();
    expect(screen.getByText("Azienda non disponibile")).toBeInTheDocument();
    expect(screen.queryByRole("link", {name:"—"})).not.toBeInTheDocument();
    expect(screen.getByRole("link", {name:/Cliente demo/})).toHaveAttribute("href", "/admin/aziende/customer");
  });
});
