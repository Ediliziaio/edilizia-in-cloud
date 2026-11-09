import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";

const s = vi.hoisted(() => ({
  imp: null as Record<string, unknown> | null,
  rpc: [] as { fn: string; args: Record<string, unknown> }[],
  anno: [] as unknown[],
  righi: {} as Record<string, unknown>,
  admin: true,
}));
vi.mock("@/hooks/useEffectiveCompanyId", () => ({ useEffectiveCompanyId: () => "c1" }));
vi.mock("@/hooks/usePermissions", () => ({ usePermissions: () => ({ isAdmin: s.admin, solaLettura: false }) }));
vi.mock("@/hooks/useAnagraficaAzienda", () => ({ useAnagraficaAzienda: () => ({ data: { partita_iva: "IT01234567890" } }) }));
vi.mock("@/hooks/useImpostazioniIVA", () => ({ useImpostazioniIVA: () => ({ impostazioni: s.imp, isLoading: false }) }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    rpc: (fn: string, args: Record<string, unknown>) => {
      s.rpc.push({ fn, args });
      if (fn === "liquidazioni_iva_anno") return Promise.resolve({ data: s.anno, error: null });
      if (fn === "liquidazione_iva_righi") return Promise.resolve({ data: s.righi, error: null });
      return Promise.resolve({ data: {}, error: null });
    },
  },
}));
import { LiquidazioniIVA } from "@/components/contabilita/LiquidazioniIVA";

const righi = { vp2: 1000, vp3: 500, vp4: 220, vp5: 110, vp6_debito: 110, vp6_credito: 0, vp7: 0, vp8: 0, vp9: 0, vp10: 0, vp11: 0, vp12: 1.1, vp13: 0, vp14_debito: 111.1, vp14_credito: 0 };
const imp = { periodicita: "trimestrale", cf_contribuente: "01234567890", cf_dichiarante: "RSSMRA80A01H501U", codice_carica: "1", cf_intermediario: null as string | null };
const wrap = (ui: ReactNode) => render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>{ui}</QueryClientProvider>);

beforeEach(() => { s.imp = imp; s.rpc = []; s.anno = []; s.admin = true; s.righi = { calcolabile: true, trimestre: 1, righi }; });
afterEach(cleanup);

describe("liquidazione IVA", () => {
  it("senza impostazioni manda a compilarle", () => {
    s.imp = null;
    const apri = vi.fn();
    wrap(<LiquidazioniIVA anno={2026} onApriImpostazioni={apri} />);
    fireEvent.click(screen.getByRole("button", { name: "Compila le impostazioni IVA" }));
    expect(apri).toHaveBeenCalled();
  });

  it("apre il periodo, passa gli importi a mano e conferma", async () => {
    wrap(<LiquidazioniIVA anno={2026} onApriImpostazioni={vi.fn()} />);
    // Il primo periodo da confermare è già aperto.
    fireEvent.change(await screen.findByLabelText("Versamenti auto UE"), { target: { value: "12,50" } });
    await waitFor(() => expect(s.rpc.some((r) => r.fn === "liquidazione_iva_righi" && (r.args.p_manuali as { vp10?: number }).vp10 === 12.5)).toBe(true));
    fireEvent.click(await screen.findByRole("button", { name: "Conferma liquidazione" }));
    await waitFor(() => expect(s.rpc.find((r) => r.fn === "liquidazione_iva_conferma")?.args).toMatchObject({ p_periodo: 1, p_manuali: { vp10: 12.5 } }));
  });

  it("periodo non calcolabile: dice il motivo e non si conferma", async () => {
    s.righi = { calcolabile: false, motivo: "Conferma prima il periodo precedente." };
    wrap(<LiquidazioniIVA anno={2026} onApriImpostazioni={vi.fn()} />);
    expect(await screen.findByRole("alert")).toHaveTextContent("Conferma prima");
    expect(screen.queryByRole("button", { name: "Conferma liquidazione" })).toBeNull();
  });

  it("un periodo in corso si vede ma non si conferma", async () => {
    wrap(<LiquidazioniIVA anno={2099} onApriImpostazioni={vi.fn()} />);
    expect(await screen.findByText(/ancora in corso/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Conferma liquidazione" })).toBeDisabled();
  });

  it("un importo scritto male blocca la conferma", async () => {
    wrap(<LiquidazioniIVA anno={2026} onApriImpostazioni={vi.fn()} />);
    fireEvent.change(await screen.findByLabelText("Versamenti auto UE"), { target: { value: "abc" } });
    expect(await screen.findByText(/importo valido/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Conferma liquidazione" })).toBeDisabled();
  });

  it("il file si scarica solo col trimestre confermato", async () => {
    s.anno = [{ id: "r1", dal: "2026-01-01", al: "2026-03-31", stato: "reviewed_commercialista", protocollo: null, dati: { calcolabile: true, trimestre: 1, righi } }];
    wrap(<LiquidazioniIVA anno={2026} onApriImpostazioni={vi.fn()} />);
    expect(await screen.findAllByRole("button", { name: "Scarica XML" })).toHaveLength(1);
  });

  it("dati del frontespizio sbagliati: niente file e dice perché", async () => {
    s.imp = { ...imp, cf_dichiarante: null };
    s.anno = [{ id: "r1", dal: "2026-01-01", al: "2026-03-31", stato: "reviewed_commercialista", protocollo: null, dati: { calcolabile: true, trimestre: 1, righi } }];
    wrap(<LiquidazioniIVA anno={2026} onApriImpostazioni={vi.fn()} />);
    expect(await screen.findByText(/Manca il codice fiscale di chi firma/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Scarica XML" })).toBeNull();
  });
});

describe("dopo la conferma", () => {
  const confermata = (r = righi, stato = "reviewed_commercialista") => ({ id: "r1", dal: "2026-01-01", al: "2026-03-31", stato, protocollo: null as string | null, dati: { calcolabile: true, trimestre: 1, righi: r } });

  it("avvisa se i documenti sono cambiati", async () => {
    s.anno = [confermata()];
    s.righi = { calcolabile: true, trimestre: 1, righi: { ...righi, vp4: 300 } };
    wrap(<LiquidazioniIVA anno={2026} onApriImpostazioni={vi.fn()} />);
    fireEvent.click(await screen.findByRole("button", { name: /1° trimestre/ }));
    expect(await screen.findByText(/cambiati dopo la conferma/)).toBeInTheDocument();
  });

  it("crea l'F24 solo se c'è da versare oltre 100 €", async () => {
    s.anno = [confermata()];
    s.righi = { calcolabile: true, trimestre: 1, righi };
    wrap(<LiquidazioniIVA anno={2026} onApriImpostazioni={vi.fn()} />);
    fireEvent.click(await screen.findByRole("button", { name: /1° trimestre/ }));
    fireEvent.click(await screen.findByRole("button", { name: "Crea F24 da questa liquidazione" }));
    await waitFor(() => expect(s.rpc.find((r) => r.fn === "liquidazione_iva_crea_f24")?.args).toEqual({ p_report: "r1" }));
  });

  it("sotto 100 € niente F24, e lo dice", async () => {
    const piccolo = { ...righi, vp4: 170, vp5: 110, vp6_debito: 60, vp12: 0, vp14_debito: 60 };
    s.anno = [confermata(piccolo)];
    s.righi = { calcolabile: true, trimestre: 1, righi: piccolo };
    wrap(<LiquidazioniIVA anno={2026} onApriImpostazioni={vi.fn()} />);
    fireEvent.click(await screen.findByRole("button", { name: /1° trimestre/ }));
    expect(await screen.findByText(/Fino a 100 € non si versa/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Crea F24 da questa liquidazione" })).toBeNull();
  });
});
