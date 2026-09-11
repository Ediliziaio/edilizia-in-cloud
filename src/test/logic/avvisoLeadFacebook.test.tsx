import { renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const canale = vi.hoisted(() => ({
  gestori: [] as { tabella: string; evento: string; filtro?: string; cb: (p: any) => void }[],
  rimossi: 0,
}));
const toastInfo = vi.hoisted(() => vi.fn());
const naviga = vi.hoisted(() => vi.fn());

vi.mock("@/integrations/supabase/client", () => {
  const ch: any = {
    on: (_tipo: string, o: any, cb: (p: any) => void) => {
      canale.gestori.push({ tabella: o.table, evento: o.event, filtro: o.filter, cb });
      return ch;
    },
    subscribe: () => ch,
  };
  return { supabase: { channel: () => ch, removeChannel: () => { canale.rimossi++; return Promise.resolve("ok"); } } };
});
vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ effectiveCompany: { id: "az1" }, user: { id: "io" } }),
}));
vi.mock("sonner", () => ({ toast: { info: toastInfo, success: vi.fn(), warning: vi.fn(), error: vi.fn() } }));
vi.mock("react-router-dom", async (originale) => ({
  ...(await originale<typeof import("react-router-dom")>()),
  useNavigate: () => naviga,
}));

import { daFacebook, useMetaLeadNotifications } from "@/hooks/useMetaLeadNotifications";

const nasce = (riga: Record<string, unknown>) => canale.gestori.forEach((g) => g.cb({ new: riga }));

function monta() {
  const wrapper = ({ children }: { children: ReactNode }) => (
    <MemoryRouter initialEntries={["/azienda/marketing"]}>{children}</MemoryRouter>
  );
  return renderHook(() => useMetaLeadNotifications(), { wrapper });
}

describe("quali opportunità vengono da Facebook", () => {
  it("le fonti vere viste in produzione", () => {
    for (const s of ["facebook", "facebook green", "Facebook infissi", "facebook energia più", "facebook6/9", "Meta Best Infissi", "meta_lead_123"]) {
      expect(daFacebook(s), s).toBe(true);
    }
    for (const s of ["Modulo sito", "Passaparola", "Google Ads", "", null, undefined]) {
      expect(daFacebook(s), String(s)).toBe(false);
    }
  });
});

describe("avviso «Nuovo lead da Facebook»", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    canale.gestori = []; canale.rimossi = 0;
    toastInfo.mockReset(); naviga.mockReset();
  });
  afterEach(() => { vi.useRealTimers(); });

  it("ascolta solo la nascita delle opportunità dell'azienda (non più webhook né notifiche)", () => {
    monta();
    expect(canale.gestori.map((g) => [g.tabella, g.evento, g.filtro])).toEqual([
      ["marketing_opportunities", "INSERT", "company_id=eq.az1"],
    ]);
  });

  it("un lead: avviso con il nome, e «Apri» porta alla sua scheda", () => {
    monta();
    nasce({ id: "o1", pipeline_id: "p1", source: "facebook green", name: "Mario Rossi" });
    vi.advanceTimersByTime(1499);
    expect(toastInfo).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(toastInfo).toHaveBeenCalledTimes(1);
    const [titolo, opzioni] = toastInfo.mock.calls[0];
    expect(titolo).toBe("Nuovo lead da Facebook");
    expect(opzioni.description).toBe("Mario Rossi");
    opzioni.action.onClick();
    expect(naviga).toHaveBeenCalledWith("/azienda/marketing/opportunita?pipeline=p1&apri=o1");
  });

  it("anche se il lead nasce assegnato a me: la notifica di assegnazione non parte più", () => {
    monta();
    nasce({ id: "o2", pipeline_id: "p1", source: "meta_lead_9", name: "Lead Ads - Anna Verdi", assigned_to: "io" });
    vi.advanceTimersByTime(1500);
    expect(toastInfo).toHaveBeenCalledTimes(1);
    expect(toastInfo.mock.calls[0][1].description).toBe("Anna Verdi");
  });

  it("più lead insieme (un'importazione): UN avviso, con due nomi e il conto degli altri", () => {
    monta();
    for (let i = 1; i <= 5; i++) nasce({ id: `o${i}`, pipeline_id: "p1", source: "Meta Best Infissi", name: `Cliente ${i}` });
    vi.advanceTimersByTime(1500);
    expect(toastInfo).toHaveBeenCalledTimes(1);
    const [titolo, opzioni] = toastInfo.mock.calls[0];
    expect(titolo).toBe("5 nuovi lead da Facebook");
    expect(opzioni.description).toBe("Cliente 1, Cliente 2 e altri 3");
    opzioni.action.onClick();
    expect(naviga).toHaveBeenCalledWith("/azienda/marketing/opportunita?pipeline=p1");
  });

  it("lead di pipeline diverse: «Vedi» apre le opportunità senza scegliere la pipeline", () => {
    monta();
    nasce({ id: "a", pipeline_id: "p1", source: "facebook", name: "Uno" });
    nasce({ id: "b", pipeline_id: "p2", source: "facebook", name: "Due" });
    vi.advanceTimersByTime(1500);
    toastInfo.mock.calls[0][1].action.onClick();
    expect(naviga).toHaveBeenCalledWith("/azienda/marketing/opportunita");
  });

  it("le opportunità che non vengono da Facebook non avvisano", () => {
    monta();
    nasce({ id: "x", pipeline_id: "p1", source: "Modulo sito", name: "Richiesta preventivo" });
    nasce({ id: "y", pipeline_id: "p1", source: null, name: "Manuale" });
    vi.advanceTimersByTime(5000);
    expect(toastInfo).not.toHaveBeenCalled();
  });

  it("smontando la pagina il canale si chiude e l'avviso in attesa non esce", () => {
    const { unmount } = monta();
    nasce({ id: "o1", pipeline_id: "p1", source: "facebook", name: "Tardivo" });
    unmount();
    vi.advanceTimersByTime(5000);
    expect(canale.rimossi).toBe(1);
    expect(toastInfo).not.toHaveBeenCalled();
  });
});
