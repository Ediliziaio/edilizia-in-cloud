import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import EmailClientPage from "@/pages/azienda/email/EmailClientPage";
vi.mock("@/integrations/supabase/client", () => ({supabase:{}}));
vi.mock("@/contexts/AuthContext", () => ({useAuth: () => ({user:{id:"me"},effectiveCompany:{id:"platform"}})}));
vi.mock("@tanstack/react-query", () => ({useQuery: () => ({data:[{id:"mine",provider:"imap",email_address:"demo@example.test",status:"active"}],isLoading:false,isError:false})}));
vi.mock("@/pages/azienda/email/EmailLayout", () => ({EmailLayout: ({companyIdOverride,aiSettingsPath}: {companyIdOverride?:string;aiSettingsPath?:string}) => <div data-testid="scope" data-company={companyIdOverride} data-ai={aiSettingsPath} />}));
afterEach(cleanup);
describe("Email superadmin e azienda", () => {
  it("passa lo scope interno e il collegamento AI amministrativo", () => {
    render(<EmailClientPage emailContext="admin" settingsPath="/admin/impostazioni/mio-profilo?tab=email" />);
    expect(screen.getByTestId("scope")).toHaveAttribute("data-company","platform");
    expect(screen.getByTestId("scope")).toHaveAttribute("data-ai","/admin/email/ai");
  });
  it("consente di nascondere la configurazione AI ai membri senza permesso", () => {
    render(<EmailClientPage emailContext="admin" aiSettingsPath={null} />);
    expect(screen.getByTestId("scope")).not.toHaveAttribute("data-ai");
  });
  it("conserva il comportamento del client aziendale", () => {
    render(<EmailClientPage />);
    expect(screen.getByTestId("scope")).not.toHaveAttribute("data-company");
    expect(screen.getByTestId("scope")).not.toHaveAttribute("data-ai");
  });
});
