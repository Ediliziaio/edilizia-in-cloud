/**
 * «Regole provvigioni» su localhost (sviluppo), 10/10/2026.
 *
 * Sul computer di sviluppo le regole restano nel browser, come prima: serve per
 * provare la schermata senza toccare il database. Ma adesso lo dice, in cima al
 * riquadro e nell'avviso di salvataggio, così nessuno scambia una prova per una
 * regola vera. In produzione (l'altro file di test) questo ripiego non c'è.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const stato = vi.hoisted(() => ({
  chiamateAlDatabase: 0,
  toasts: [] as Array<{ tipo: string; testo: string }>,
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: () => {
      stato.chiamateAlDatabase += 1;
      throw new Error("In prova su localhost il database non si tocca");
    },
    functions: { invoke: async () => ({ data: null as unknown, error: null as unknown }) },
  },
}));
vi.mock("sonner", () => ({
  toast: {
    success: (testo: string) => stato.toasts.push({ tipo: "ok", testo }),
    error: (testo: string) => stato.toasts.push({ tipo: "errore", testo }),
    warning: (testo: string) => stato.toasts.push({ tipo: "avviso", testo }),
  },
}));

Object.assign(Element.prototype, {
  hasPointerCapture: () => false,
  releasePointerCapture: () => {},
  setPointerCapture: () => {},
  scrollIntoView: () => {},
});

import { CommissionRulesDialog } from "@/components/salespeople/CommissionRulesDialog";

beforeEach(() => {
  stato.chiamateAlDatabase = 0;
  stato.toasts = [];
  localStorage.clear();
});
afterEach(cleanup);

describe("Regole provvigioni su localhost", () => {
  it("dice che le regole restano solo in questo browser e le salva lì", async () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
    render(
      <QueryClientProvider client={qc}>
        <CommissionRulesDialog open onOpenChange={() => {}} companyId="c1" />
      </QueryClientProvider>,
    );
    expect(await screen.findByText(/Prova su questo computer: le regole restano solo in questo browser/)).toBeVisible();

    fireEvent.click(await screen.findByRole("button", { name: /Salva la regola/ }));
    await waitFor(() => expect(stato.toasts.some((t) => /solo in questo browser \(prova\)/.test(t.testo))).toBe(true));
    expect(JSON.parse(localStorage.getItem("commission_rules:c1") ?? "[]")).toHaveLength(1);
    expect(stato.chiamateAlDatabase).toBe(0);
  });
});
