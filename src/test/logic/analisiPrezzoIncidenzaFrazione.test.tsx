import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * Analisi prezzi → «Salva e applica» (05/10/2026): incidenza_manodopera_pct su
 * tariffe_aziendali è una frazione 0..1. Prima si scriveva il percento (35,5):
 * la pagina Tariffe mostrava 3550% e il salvataggio successivo la portava a 100%.
 */

const scritture = vi.hoisted(() => [] as Array<{ tabella: string; op: string; dati?: unknown }>);

vi.mock("@/hooks/useEffectiveCompanyId", () => ({ useEffectiveCompanyId: () => "company-demo" }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/integrations/supabase/client", () => {
  const catena = (tabella: string) => {
    const c: Record<string, unknown> = {
      then: (ok: (v: unknown) => unknown) => Promise.resolve({ data: null, error: null }).then(ok),
      maybeSingle: () => Promise.resolve({ data: null, error: null }),
      single: () => Promise.resolve({ data: { id: "analisi-demo" }, error: null }),
      insert: (dati: unknown) => { scritture.push({ tabella, op: "insert", dati }); return c; },
      update: (dati: unknown) => { scritture.push({ tabella, op: "update", dati }); return c; },
      delete: () => { scritture.push({ tabella, op: "delete" }); return c; },
    };
    for (const metodo of ["select", "eq", "not", "order", "in"]) c[metodo] = () => c;
    return c;
  };
  return { supabase: { from: (tabella: string) => catena(tabella) } };
});

import { AnalisiPrezzoDialog } from "@/components/listino/AnalisiPrezzoDialog";

afterEach(cleanup);

describe("AnalisiPrezzoDialog — Salva e applica", () => {
  it("scrive l'incidenza come frazione (0,3162), non come percento (31,62)", async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <AnalisiPrezzoDialog
          tariffa={{ id: "tariffa-demo", nome: "Posa gres", unita: "mq", unita_fatturazione: "pz", prezzo_vendita: 40 }}
          onClose={vi.fn()}
        />
      </QueryClientProvider>,
    );

    // 2 h × 20 € di manodopera + 6 × 10 € di materiale, SG 15%, utile 10%:
    // prezzo 126,50 €, incidenza 40 / 126,50 = 31,62%.
    fireEvent.click(await screen.findByRole("button", { name: "Manodopera" }));
    fireEvent.click(screen.getByRole("button", { name: "Materiale" }));
    const descrizioni = screen.getAllByPlaceholderText("Descrizione (es. Operaio specializzato)");
    const quantita = screen.getAllByLabelText("Quantità");
    const prezzi = screen.getAllByLabelText("Prezzo unitario");
    fireEvent.change(descrizioni[0], { target: { value: "Operaio" } });
    fireEvent.change(quantita[0], { target: { value: "2" } });
    fireEvent.change(prezzi[0], { target: { value: "20" } });
    fireEvent.change(descrizioni[1], { target: { value: "Colla" } });
    fireEvent.change(quantita[1], { target: { value: "6" } });
    fireEvent.change(prezzi[1], { target: { value: "10" } });

    // Unità vera (mq) e non il «pz» di default di unita_fatturazione.
    expect(screen.getByText("Prezzo di applicazione / mq")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Salva e applica/ }));

    await waitFor(() => expect(scritture.some((s) => s.tabella === "tariffe_aziendali" && s.op === "update")).toBe(true));
    const patch = scritture.find((s) => s.tabella === "tariffe_aziendali" && s.op === "update")!.dati as Record<string, unknown>;
    expect(patch.prezzo_vendita).toBe(126.5);
    expect(patch.incidenza_manodopera_pct).toBe(0.3162);
    // Costo pieno (diretto + spese generali) nelle tre colonne.
    expect(patch).toMatchObject({ prezzo_costo: 115, costo_interno: 115, costo_default: 115 });
    client.clear();
  });
});
