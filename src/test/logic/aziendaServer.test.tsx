import { act, render, renderHook, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const s = vi.hoisted(() => ({
  rpc: vi.fn(),
  auth: {} as Record<string, unknown>,
}));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    rpc: s.rpc,
    from: () => ({
      select: () => ({
        eq: () => ({ maybeSingle: () => Promise.resolve({ data: { name: "Altra Srl" } }) }),
      }),
    }),
  },
}));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => s.auth }));

import {
  ATTESA_CONFERMA_MS,
  INTERVALLO_MINIMO_MS,
  INTERVALLO_PERIODICO_MS,
  confrontaAziende,
  controlloDovuto,
  controlloNecessario,
  testoAvviso,
} from "@/lib/auth/aziendaServer";
import { useAziendaDelServer } from "@/hooks/useAziendaDelServer";
import { AvvisoAziendaServer } from "@/components/layouts/AvvisoAziendaServer";

const server = (id: string | null) => ({ data: id, error: null as { message: string } | null });
const scorri = (ms: number) => act(() => vi.advanceTimersByTimeAsync(ms));

describe("confronto fra schermata e server", () => {
  it("riconosce i tre casi", () => {
    expect(confrontaAziende("a", "a")).toEqual({ stato: "allineata" });
    expect(confrontaAziende("a", "b")).toEqual({ stato: "altra_azienda", aziendaServer: "b" });
    expect(confrontaAziende("a", null)).toEqual({ stato: "nessuna_azienda" });
  });

  it("controlla solo chi può divergere", () => {
    const base = { aziendaMostrata: "a", staImpersonando: false, numeroAccessiMultiAzienda: 0, commercialista: false };
    expect(controlloNecessario(base)).toBe(false);
    expect(controlloNecessario({ ...base, staImpersonando: true })).toBe(true);
    expect(controlloNecessario({ ...base, numeroAccessiMultiAzienda: 1 })).toBe(false);
    expect(controlloNecessario({ ...base, numeroAccessiMultiAzienda: 2 })).toBe(true);
    expect(controlloNecessario({ ...base, staImpersonando: true, commercialista: true })).toBe(false);
    expect(controlloNecessario({ ...base, staImpersonando: true, aziendaMostrata: null })).toBe(false);
  });

  it("non controlla più spesso del minimo", () => {
    expect(controlloDovuto(null, 1000)).toBe(true);
    expect(controlloDovuto(1000, 1000 + INTERVALLO_MINIMO_MS - 1)).toBe(false);
    expect(controlloDovuto(1000, 1000 + INTERVALLO_MINIMO_MS)).toBe(true);
  });

  it("il testo nomina le due aziende, e non inventa il nome che non conosce", () => {
    const esito = { stato: "altra_azienda", aziendaServer: "b" } as const;
    expect(testoAvviso(esito, "Alfa", "Beta").titolo).toBe("Stai guardando Alfa, ma il server sta lavorando su Beta");
    expect(testoAvviso(esito, "Alfa", null).titolo).toContain("un'altra azienda");
    expect(testoAvviso({ stato: "nessuna_azienda" }, "Alfa", null).titolo).toContain("non è più attivo");
  });
});

describe("useAziendaDelServer", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    s.rpc.mockReset();
  });
  afterEach(() => vi.useRealTimers());

  it("spento non fa nessuna chiamata", async () => {
    renderHook(() => useAziendaDelServer(null));
    await scorri(INTERVALLO_PERIODICO_MS * 2);
    expect(s.rpc).not.toHaveBeenCalled();
  });

  it("allineato legge una volta sola e non avvisa", async () => {
    s.rpc.mockResolvedValue(server("a"));
    const { result } = renderHook(() => useAziendaDelServer("a"));
    await scorri(0);
    expect(s.rpc).toHaveBeenCalledTimes(1);
    expect(result.current.esito.stato).toBe("allineata");
  });

  it("una differenza va confermata da una seconda lettura", async () => {
    s.rpc.mockResolvedValue(server("b"));
    const { result } = renderHook(() => useAziendaDelServer("a"));
    await scorri(0);
    expect(result.current.esito.stato).toBe("allineata");
    await scorri(ATTESA_CONFERMA_MS);
    expect(result.current.esito).toEqual({ stato: "altra_azienda", aziendaServer: "b" });
  });

  it("se la seconda lettura torna allineata l'avviso non si accende", async () => {
    s.rpc.mockResolvedValueOnce(server("b")).mockResolvedValue(server("a"));
    const { result } = renderHook(() => useAziendaDelServer("a"));
    await scorri(ATTESA_CONFERMA_MS);
    expect(result.current.esito.stato).toBe("allineata");
  });

  it("un errore di rete non accende e non spegne l'avviso", async () => {
    s.rpc.mockResolvedValue({ data: null, error: { message: "rete" } });
    const { result } = renderHook(() => useAziendaDelServer("a"));
    await scorri(ATTESA_CONFERMA_MS);
    expect(result.current.esito.stato).toBe("allineata");

    s.rpc.mockResolvedValue(server("b"));
    await act(() => result.current.ricontrolla());
    await scorri(ATTESA_CONFERMA_MS);
    expect(result.current.esito.stato).toBe("altra_azienda");

    s.rpc.mockRejectedValue(new Error("rete"));
    await act(() => result.current.ricontrolla());
    expect(result.current.esito.stato).toBe("altra_azienda");
  });

  it("la risposta arrivata dopo un cambio d'azienda di questa scheda si butta", async () => {
    let rispondi: (v: unknown) => void = () => undefined;
    s.rpc.mockReturnValueOnce(new Promise((r) => { rispondi = r; }));
    s.rpc.mockResolvedValue(server("c"));
    const { result, rerender } = renderHook(({ id }) => useAziendaDelServer(id), {
      initialProps: { id: "a" },
    });
    rerender({ id: "c" });
    await act(async () => rispondi(server("a")));
    await scorri(ATTESA_CONFERMA_MS);
    expect(result.current.esito.stato).toBe("allineata");
  });

  it("al ritorno sulla scheda rilegge, ma non a raffica", async () => {
    s.rpc.mockResolvedValue(server("a"));
    renderHook(() => useAziendaDelServer("a"));
    await scorri(0);
    window.dispatchEvent(new Event("focus"));
    window.dispatchEvent(new Event("focus"));
    await scorri(0);
    expect(s.rpc).toHaveBeenCalledTimes(1);
    await scorri(INTERVALLO_MINIMO_MS);
    window.dispatchEvent(new Event("focus"));
    await scorri(0);
    expect(s.rpc).toHaveBeenCalledTimes(2);
  });

  it("legge una volta al minuto a scheda visibile, mai se nascosta", async () => {
    s.rpc.mockResolvedValue(server("a"));
    renderHook(() => useAziendaDelServer("a"));
    await scorri(INTERVALLO_PERIODICO_MS);
    expect(s.rpc).toHaveBeenCalledTimes(2);
    const visibilita = vi.spyOn(document, "visibilityState", "get").mockReturnValue("hidden");
    await scorri(INTERVALLO_PERIODICO_MS * 3);
    expect(s.rpc).toHaveBeenCalledTimes(2);
    visibilita.mockRestore();
  });
});

describe("AvvisoAziendaServer", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    s.rpc.mockReset();
    s.auth = {
      effectiveCompany: { id: "a", name: "Alfa" },
      impersonatedCompanyId: "a",
      isImpersonating: true,
      multiCompanyAccesses: [],
      riportaServerSuAzienda: vi.fn().mockResolvedValue(true),
      passaAdAziendaDelServer: vi.fn().mockResolvedValue(true),
    };
  });
  afterEach(() => vi.useRealTimers());

  it("allineato non mostra nulla", async () => {
    s.rpc.mockResolvedValue(server("a"));
    const { container } = render(<AvvisoAziendaServer commercialista={false} />);
    await scorri(ATTESA_CONFERMA_MS);
    expect(container).toBeEmptyDOMElement();
  });

  it("azienda diversa: avviso e due azioni, che dopo l'azione si spegne", async () => {
    s.rpc.mockResolvedValue(server("b"));
    render(<AvvisoAziendaServer commercialista={false} />);
    await scorri(ATTESA_CONFERMA_MS);
    expect(screen.getByRole("alert")).toHaveTextContent("Stai guardando Alfa, ma il server sta lavorando su Altra Srl");

    s.rpc.mockResolvedValue(server("a"));
    await act(async () => screen.getByRole("button", { name: "Riporta su Alfa" }).click());
    await scorri(0);
    expect(s.auth.riportaServerSuAzienda).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("apre qui l'azienda del server", async () => {
    s.rpc.mockResolvedValue(server("b"));
    render(<AvvisoAziendaServer commercialista={false} />);
    await scorri(ATTESA_CONFERMA_MS);
    await act(async () => screen.getByRole("button", { name: "Apri Altra Srl qui" }).click());
    expect(s.auth.passaAdAziendaDelServer).toHaveBeenCalledWith("b");
  });

  it("accesso scaduto: una sola azione, per riattivarlo", async () => {
    s.rpc.mockResolvedValue(server(null));
    render(<AvvisoAziendaServer commercialista={false} />);
    await scorri(ATTESA_CONFERMA_MS);
    expect(screen.getByRole("alert")).toHaveTextContent("L'accesso a Alfa non è più attivo");
    expect(screen.getAllByRole("button")).toHaveLength(1);
    expect(screen.getByRole("button", { name: "Riattiva Alfa" })).toBeInTheDocument();
  });

  it("il commercialista non fa controlli", async () => {
    render(<AvvisoAziendaServer commercialista />);
    await scorri(INTERVALLO_PERIODICO_MS);
    expect(s.rpc).not.toHaveBeenCalled();
  });
});
