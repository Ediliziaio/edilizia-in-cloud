import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { readFileSync } from "node:fs";
import { QuoteDelMovimento, etichettaQuota } from "@/components/prima-nota/QuoteDelMovimento";

const righe = [
  { id: "a", description: "Incasso fattura 12 - Rossi", category: "Incassi fatture", amount: 1000, direction: "entrata", orders: { order_code: "C-01" } },
  { id: "b", description: "Incasso fattura FT/40 - Rossi", category: "incasso", amount: 2500.5, direction: "entrata", orders: null },
];
vi.mock("@/integrations/supabase/client", () => ({ supabase: { from: () => {
  const q = { select: () => q, eq: () => q, order: () => Promise.resolve({ data: righe, error: null }) };
  return q;
} } }));
afterEach(cleanup);

it("il dettaglio di una quota elenca tutte le quote dello stesso movimento e apre le altre", async () => {
  const onApri = vi.fn();
  render(<QueryClientProvider client={new QueryClient()}>
    <QuoteDelMovimento gruppo={{ id: "g", descrizione: "Bonifico Rossi", importo: 3500.5 }} correnteId="a" onApri={onApri} />
  </QueryClientProvider>);
  expect(screen.getByText("Movimento diviso: Bonifico Rossi")).toBeTruthy();
  expect(await screen.findByText("Commessa C-01")).toBeTruthy();
  expect(screen.getByRole("button", { name: /fattura 12/ })).toBeDisabled();
  fireEvent.click(screen.getByRole("button", { name: /FT\/40/ }));
  expect(onApri).toHaveBeenCalledWith("b");
  expect(screen.queryByText(/una quota è stata tolta/)).toBeNull();
});

it("se una quota è stata stornata lo dice, e la riga della lista porta il movimento a cui appartiene", async () => {
  render(<QueryClientProvider client={new QueryClient()}>
    <QuoteDelMovimento gruppo={{ id: "g", descrizione: "Bonifico Rossi", importo: 4000 }} correnteId="a" onApri={vi.fn()} />
  </QueryClientProvider>);
  expect(await screen.findByText(/una quota è stata tolta o stornata/)).toBeTruthy();
  expect(etichettaQuota({ descrizione: "RiBa Bianchi", importo: 1200 })).toMatch(/^Quota di «RiBa Bianchi» · 1\.200,00/);
  const pagina = readFileSync("src/pages/azienda/PrimaNota.tsx", "utf8");
  expect(pagina.match(/etichettaQuota\(e\.prima_nota_gruppi\)/g)?.length).toBe(2);
  expect(readFileSync("src/hooks/usePrimaNota.ts", "utf8").match(/prima_nota_gruppi\(id, descrizione, importo\)/g)?.length).toBe(2);
});
