import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import "@testing-library/jest-dom/vitest";
import sorgentePagina from "@/pages/azienda/fatturazione/FattureRicevutePage.tsx?raw";

// «L'ho pagata» sulle fatture dei fornitori: un clic, e si annulla dal messaggio.
const s = vi.hoisted(() => ({ chiamate: [] as unknown[][], toast: [] as string[] }));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { rpc: async (...a: unknown[]) => { s.chiamate.push(a); return { data: "2026-10-30", error: null as null }; } },
}));
vi.mock("sonner", () => ({ toast: { success: (m: string) => s.toast.push(m), error: (m: string) => s.toast.push(m) } }));

import { PagamentoRicevutaCella, etichettaTipoRicevuta, isNotaCreditoRicevuta } from "@/components/fatturazione/PagamentoRicevuta";

const monta = (pagataIl: string | null, tipo = "expense") => render(
  <QueryClientProvider client={new QueryClient()}>
    <PagamentoRicevutaCella id="r1" numero="611" tipo={tipo} pagataIl={pagataIl} />
  </QueryClientProvider>,
);

beforeEach(() => { s.chiamate = []; s.toast = []; });
afterEach(cleanup);

describe("Pagamento delle fatture ricevute", () => {
  it("«Segna pagata» con un clic chiama la funzione del database", async () => {
    monta(null);
    fireEvent.click(screen.getByRole("button", { name: /Segna pagata/ }));
    await waitFor(() => expect(s.chiamate).toHaveLength(1));
    expect(s.chiamate[0]).toEqual(["segna_fattura_ricevuta_pagata", { p_id: "r1", p_pagata: true, p_data: null }]);
    await waitFor(() => expect(s.toast[0]).toContain("segnata pagata"));
  });

  it("pagata: mostra il giorno e un clic la riporta da pagare", async () => {
    monta("2026-10-15");
    const badge = screen.getByRole("button", { name: /Pagata/ });
    fireEvent.click(badge);
    await waitFor(() => expect(s.chiamate[0]).toEqual(["segna_fattura_ricevuta_pagata", { p_id: "r1", p_pagata: false, p_data: null }]));
  });

  it("una nota di credito del fornitore non si paga", () => {
    monta(null, "passive_credit_note");
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(isNotaCreditoRicevuta("TD04")).toBe(true);
  });

  it("i tipi in parole, non le sigle dei gestionali", () => {
    expect(etichettaTipoRicevuta("expense")).toBe("Fattura");
    expect(etichettaTipoRicevuta("passive_credit_note")).toBe("Nota di credito");
    expect(etichettaTipoRicevuta("TD24")).toBe("Fattura differita");
  });

  it("la pagina ha il filtro «Da pagare» e il pagamento nella colonna Stato", () => {
    expect(sorgentePagina).toContain("Da pagare");
    expect(sorgentePagina).toContain("<PagamentoRicevutaCella");
    expect(sorgentePagina).not.toContain('<span className="text-xs font-mono">{f.tipo_documento}</span>');
  });
});
