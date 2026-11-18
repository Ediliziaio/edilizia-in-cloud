import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { ModificaCollegamentiMovimento } from "@/components/prima-nota/ModificaCollegamentiMovimento";
import type { PrimaNotaEntry } from "@/hooks/usePrimaNota";

const update = vi.hoisted(() => vi.fn());
vi.mock("@/integrations/supabase/client", () => ({ supabase: { from: () => ({ update }) } }));
vi.mock("@/components/orders/CommessaCombobox", () => ({
  CommessaCombobox: ({ onChange }: { onChange: (id: string) => void }) =>
    <button onClick={() => onChange("macro1")}>Scegli macrocommessa</button>,
}));

it("collega la macrocommessa all’incasso automatico senza riscrivere i dati della fattura", async () => {
  const query = { eq: vi.fn().mockReturnThis(), is: vi.fn().mockReturnThis(), select: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockResolvedValue({ data: { id: "mov1" }, error: null }) };
  update.mockReturnValue(query);
  const movimento = { id: "mov1", company_id: "azienda1", is_auto: true, amount: 150, order_id: null, notes: "Segnata pagata" } as PrimaNotaEntry;
  render(<QueryClientProvider client={new QueryClient()}><ModificaCollegamentiMovimento movimento={movimento} /></QueryClientProvider>);
  fireEvent.click(screen.getByRole("button", { name: "Modifica movimento" }));
  fireEvent.click(screen.getByRole("button", { name: "Scegli macrocommessa" }));
  fireEvent.click(screen.getByRole("button", { name: "Salva modifiche" }));
  await waitFor(() => expect(query.maybeSingle).toHaveBeenCalled());
  expect(update).toHaveBeenCalledWith({ order_id: "macro1" });
  expect(query.eq).toHaveBeenCalledWith("company_id", "azienda1");
  expect(query.eq).toHaveBeenCalledWith("id", "mov1");
  expect(query.is).toHaveBeenCalledWith("order_id", null);
});
