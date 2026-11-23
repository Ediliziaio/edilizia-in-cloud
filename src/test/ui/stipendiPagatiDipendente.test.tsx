import { afterEach, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { readFileSync } from "node:fs";
import { StipendiPagatiDipendente } from "@/components/employees/StipendiPagatiDipendente";

let righe: { amount: number; entry_date: string }[] = [];
vi.mock("@/integrations/supabase/client", () => ({ supabase: { from: () => {
  const q = { select: () => q, eq: () => q, gte: () => q, lte: () => q, order: () => Promise.resolve({ data: righe, error: null }) };
  return q;
} } }));
afterEach(cleanup);

it("la scheda del dipendente dice quanto ha ricevuto nell'anno", async () => {
  righe = [{ amount: 1500, entry_date: "2026-11-10" }, { amount: 1450.5, entry_date: "2026-10-10" }];
  render(<QueryClientProvider client={new QueryClient()}><StipendiPagatiDipendente employeeId="e1" anno={2026} /></QueryClientProvider>);
  expect(await screen.findByText(/Stipendi pagati nel 2026: .*2\.950,50/)).toBeTruthy();
  expect(screen.getByText(/2 pagamenti · l'ultimo il 10\/11\/2026/)).toBeTruthy();
});

it("senza stipendi registrati non mostra niente; la lista della Prima Nota raggruppa i movimenti divisi", async () => {
  righe = [];
  const { container } = render(<QueryClientProvider client={new QueryClient()}><StipendiPagatiDipendente employeeId="e1" /></QueryClientProvider>);
  await new Promise(r => setTimeout(r, 0));
  expect(container.textContent).toBe("");
  const pagina = readFileSync("src/pages/azienda/PrimaNota.tsx", "utf8");
  expect(pagina).toContain("righeElenco.map(r => r.k === \"gruppo\"");
  expect(pagina).toContain("righeElenco.map((r) => r.k === \"gruppo\"");
});
