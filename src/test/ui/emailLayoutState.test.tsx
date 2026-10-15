import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { EmailLayout } from "@/pages/azienda/email/EmailLayout";
import type { EmailConnectionSummary } from "@/pages/azienda/email/EmailLayout";
const state = vi.hoisted(() => ({rows:[] as EmailConnectionSummary[], failed:false, loading:false, retry:vi.fn(), invalidate:vi.fn()}));
const client = {invalidateQueries:state.invalidate};
vi.mock("@/contexts/AuthContext", () => ({useAuth: () => ({user:{id:"me"},effectiveCompany:{id:"platform"}})}));
vi.mock("@tanstack/react-query", () => ({useQuery: () => ({data:state.rows,isError:state.failed,isLoading:state.loading,refetch:state.retry}), useQueryClient: () => client, useMutation: () => ({mutate:vi.fn(),isPending:false,isError:false})}));
vi.mock("@/integrations/supabase/client", () => {
  const channel = {on:vi.fn().mockReturnThis(),subscribe:vi.fn().mockReturnThis()};
  return {supabase:{channel: () => channel,removeChannel:vi.fn()}};
});
vi.mock("@/pages/azienda/email/components/EmailList", () => ({EmailList: ({scopedAccountIds}: {scopedAccountIds?:string[]}) => <p data-testid="messages" data-accounts={scopedAccountIds?.join(",")}>Messaggi personali</p>}));
vi.mock("@/pages/azienda/email/components/EmailSidebar", () => ({EmailSidebar: (): null => null}));
vi.mock("@/pages/azienda/email/components/EmailAiCommandCenter", () => ({EmailAiCommandCenter: (): null => null}));
vi.mock("@/pages/azienda/email/components/EmailViewer", () => ({EmailViewer: (): null => null}));
vi.mock("@/pages/azienda/email/components/EmailComposeDialog", () => ({EmailComposeDialog: (): null => null}));
vi.mock("@/pages/azienda/email/components/EmailSearchBar", () => ({EmailSearchBar: (): null => null}));
afterEach(() => {cleanup();state.rows=[];state.failed=false;state.loading=false;});
describe("Caselle email e stato della lettura", () => {
  it("non presenta una casella vuota quando la verifica delle connessioni fallisce", () => {
    state.failed=true;render(<MemoryRouter><EmailLayout companyIdOverride="platform" /></MemoryRouter>);
    expect(screen.getByRole("alert")).toHaveTextContent("Non è stato possibile verificare");
    expect(screen.queryByTestId("messages")).not.toBeInTheDocument();
    expect(screen.queryByText("Aggiornata")).not.toBeInTheDocument();
  });
  it("attende i metadati prima di chiedere i messaggi", () => {
    state.loading=true;render(<MemoryRouter><EmailLayout companyIdOverride="platform" /></MemoryRouter>);
    expect(screen.getByText("Caricamento caselle…")).toBeInTheDocument();
    expect(screen.queryByTestId("messages")).not.toBeInTheDocument();
  });
  it("limita la lista alle caselle del workspace e mostra un problema di sync", () => {
    state.rows=[{id:"mine",provider:"imap",email_address:"demo@example.test",status:"active",last_sync_error:"authentication failed"}];
    render(<MemoryRouter><EmailLayout companyIdOverride="platform" /></MemoryRouter>);
    expect(screen.getByTestId("messages")).toHaveAttribute("data-accounts","mine");
    expect(screen.getAllByText("Problemi di sincronizzazione").length).toBeGreaterThan(0);
  });
});
