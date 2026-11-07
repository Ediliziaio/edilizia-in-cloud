import { afterEach, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { EmailPipelineStatus } from "@/components/email-ai/EmailPipelineStatus";
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ effectiveCompany: { id: "azienda" }, role: "company_admin" }) }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { from: () => {
  const result = Promise.resolve({ data: null as null, error: { message: "non disponibile" } });
  const query = { select: () => query, eq: () => query, gte: () => query, in: () => query, limit: () => query, then: result.then.bind(result) };
  return query;
} } }));
afterEach(cleanup);
it("distingue un errore dai conteggi a zero", async () => {
  render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><EmailPipelineStatus /></QueryClientProvider>);
  expect(await screen.findByRole("alert")).toHaveTextContent("conteggi non sono disponibili");
  expect(screen.getByRole("button", { name: "Riprova" })).toBeEnabled();
  expect(screen.queryByText("Email ricevute (24h)")).toBeNull();
});
