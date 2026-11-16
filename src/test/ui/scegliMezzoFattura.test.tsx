/**
 * Il selettore del mezzo nel collegamento della fattura ricevuta (16/11/2026).
 *
 * All'Impresa Vulcano dicono: «l'elenco mezzi c'è, ma quando cerco il mezzo nella fattura
 * non lo trova». Il database risponde (200) e la riga c'è: qui si controlla che quello che
 * torna dal server arrivi davvero in elenco, anche quando si cerca una targa.
 */
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, waitFor, fireEvent } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({ righe: [] as Array<{ id: string; nome: string; targa: string | null }>, filtro: null as string | null }));
vi.mock("@/integrations/supabase/client", () => {
  const catena: Record<string, unknown> = {};
  catena.select = () => catena;
  catena.eq = () => catena;
  catena.is = () => catena;
  catena.order = () => catena;
  catena.or = (f: string) => { m.filtro = f; return catena; };
  catena.limit = async () => ({ data: m.righe, error: null as unknown });
  return { supabase: { from: () => catena } };
});

import { ScegliMezzoFattura } from "@/components/fatturazione/ScegliMezzoFattura";

class RO { observe() {} unobserve() {} disconnect() {} }
(globalThis as unknown as { ResizeObserver: typeof RO }).ResizeObserver ??= RO;
Element.prototype.scrollIntoView ??= () => {};
afterEach(cleanup);

describe("Scegli il mezzo da collegare alla fattura", () => {
  it("i mezzi che tornano dal server finiscono in elenco", async () => {
    m.righe = [
      { id: "1", nome: "HE749NF", targa: "A131804PD26" },
      { id: "2", nome: "FORD TRANSIT", targa: "GA640YJ" },
    ];
    render(<QueryClientProvider client={new QueryClient()}>
      <ScegliMezzoFattura companyId="c1" collegati={new Set()} occupato={false} onSelect={vi.fn()} />
    </QueryClientProvider>);
    expect(await screen.findByText("HE749NF")).toBeInTheDocument();
    expect(screen.getByText("FORD TRANSIT")).toBeInTheDocument();
    expect(screen.getByText("GA640YJ")).toBeInTheDocument();
  });

  it("cercando una targa, il mezzo si sceglie", async () => {
    m.righe = [{ id: "2", nome: "FORD TRANSIT", targa: "GA640YJ" }];
    const scelto = vi.fn();
    render(<QueryClientProvider client={new QueryClient()}>
      <ScegliMezzoFattura companyId="c1" collegati={new Set()} occupato={false} onSelect={scelto} />
    </QueryClientProvider>);
    fireEvent.change(screen.getByPlaceholderText("Cerca nome o targa…"), { target: { value: "GA640YJ" } });
    const voce = await screen.findByText("FORD TRANSIT");
    fireEvent.click(voce);
    await waitFor(() => expect(scelto).toHaveBeenCalledWith("2"));
  });

  it("un mezzo già collegato resta in elenco, detto e non ricliccabile", async () => {
    // Prima spariva, e chi cercava la targa leggeva «Nessun mezzo disponibile»: sembrava
    // che il mezzo non ci fosse (Impresa Vulcano, 16/11/2026).
    m.righe = [{ id: "2", nome: "FORD TRANSIT", targa: "GA640YJ" }];
    const scelto = vi.fn();
    render(<QueryClientProvider client={new QueryClient()}>
      <ScegliMezzoFattura companyId="c1" collegati={new Set(["2"])} occupato={false} onSelect={scelto} />
    </QueryClientProvider>);
    expect(await screen.findByText("FORD TRANSIT")).toBeInTheDocument();
    expect(screen.getByText("già collegato")).toBeInTheDocument();
    expect(screen.queryByText(/Nessun mezzo disponibile/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByText("FORD TRANSIT"));
    expect(scelto).not.toHaveBeenCalled();
  });

  it("se davvero non c'è niente, lo dice", async () => {
    m.righe = [];
    render(<QueryClientProvider client={new QueryClient()}>
      <ScegliMezzoFattura companyId="c1" collegati={new Set()} occupato={false} onSelect={vi.fn()} />
    </QueryClientProvider>);
    expect(await screen.findByText(/Nessun mezzo disponibile/)).toBeInTheDocument();
  });
});
