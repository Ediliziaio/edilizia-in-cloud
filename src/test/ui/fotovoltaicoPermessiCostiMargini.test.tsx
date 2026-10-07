/**
 * Fotovoltaico: costi d'acquisto e margini solo a chi ha il permesso (06/10/2026).
 *
 * L'anteprima del preventivo (il pulsante «Impresa»), l'elenco e la scheda del Fotovoltaico seguono da sempre la regola
 * `canViewMargins || canViewCosts`; il wizard no: chi lo usa senza quei permessi (il venditore di serie) vedeva
 *  · Fase 5, scheda sconto: «margine post-sconto» in € e in %, e il costo d'acquisto dei prodotti extra («Acquisto €»);
 *  · Fase 6: «Economia pronta per vendita e campagne» con margine reale, margine lordo e CPL massimo;
 *  · Fase 7 «Vista impresa»: costo diretto, margine in € e in %.
 * Qui i tre pezzi veri (e la Fase 5 intera, per l'«Acquisto»), con e senza permesso.
 *
 * 07/10/2026: anche il selettore «+ Dal catalogo» dei servizi (Fase 5) scriveva accanto a ogni servizio il suo
 * `prezzo_netto_default`, che è il COSTO del servizio, a chiunque aprisse la tendina.
 */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { INITIAL, LS_KEY_NEW } from "@/pages/azienda/fotovoltaico/FotovoltaicoWizard/constants";
import type { WizardData } from "@/pages/azienda/fotovoltaico/FotovoltaicoWizard/types";

// La Fase 5 intera importa il wizard (e il suo mondo): con la macchina carica supera i 5 secondi di partenza.
vi.setConfig({ testTimeout: 30_000 });

const { stato, NESSUNO } = vi.hoisted(() => ({
  stato: { margini: true, catalogo: [] as unknown[] },
  NESSUNO: [] as unknown[],
}));

vi.mock("react-router-dom", () => ({
  useParams: () => ({}),
  useNavigate: () => vi.fn(),
  useSearchParams: () => [new URLSearchParams(), vi.fn()],
  Link: ({ to, children }: { to: string; children: React.ReactNode }) => <a href={String(to)}>{children}</a>,
}));
vi.mock("sonner", () => ({ toast: Object.assign(vi.fn(), { info: vi.fn(), success: vi.fn(), error: vi.fn(), warning: vi.fn(), dismiss: vi.fn() }) }));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ user: { id: "u1" }, effectiveCompany: { id: "c1", name: "Bianchi Solare" } }) }));
vi.mock("@/integrations/supabase/client", () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const catena: any = new Proxy({}, { get: (_t, p) => (p === "then" ? undefined : p === "maybeSingle" || p === "single" ? () => Promise.resolve({ data: null as null, error: null as null }) : () => catena) });
  const nulla = () => Promise.resolve({ data: null as null, error: null as null });
  return { supabase: { from: () => catena, rpc: nulla, functions: { invoke: nulla }, storage: { from: () => catena } } };
});
vi.mock("@/hooks/usePermissions", () => ({ usePermissions: () => ({ canViewMargins: stato.margini, canViewCosts: stato.margini }) }));
vi.mock("@/hooks/useSupportoModelliPreventivo", () => ({ useSupportoModelloPreventivo: () => ({ supported: true, isLoading: false }) }));
vi.mock("@/hooks/useEffectiveCompanyId", () => ({ useEffectiveCompanyId: () => "c1" }));
vi.mock("@/hooks/useDiscountRules", () => ({ useDiscountRules: () => ({ data: NESSUNO, isLoading: false }) }));
vi.mock("@/hooks/useBundles", () => ({ useBundlesList: () => ({ bundles: NESSUNO }) }));
vi.mock("@/lib/fotovoltaico/queries", () => {
  const lista = { data: NESSUNO, isLoading: false };
  const niente = { data: undefined as unknown, isLoading: false };
  const mutazione = { mutateAsync: vi.fn(() => Promise.resolve({})), mutate: vi.fn(), isPending: false };
  return {
    useProgetto: () => niente, useAggiornaProgetto: () => mutazione, useProfiliAutoconsumo: () => lista,
    useArticoliFv: () => lista, useComponentiProgetto: () => niente, useListinoPerFv: () => lista,
    useUpsertComponenti: () => mutazione, useUpsertManodopera: () => mutazione, useUpsertServizi: () => mutazione,
    useTariffeFv: () => lista, useManodoperaProgetto: () => niente, useServiziProgetto: () => niente,
    useTabelleFinanziamentoFv: () => lista, useTopFinanziamentiFv: () => lista, useTemplatePdf: () => niente,
    useServiziCatalogo: () => ({ data: stato.catalogo, isLoading: false }), useDuplicaProgetto: () => mutazione,
  };
});
vi.mock("@/components/fotovoltaico/FvContactPicker", () => ({ FvContactPicker: () => <p>scelta del contatto</p> }));
vi.mock("@/components/fotovoltaico/CassaCumulataChart", () => ({ CassaCumulataChart: (): null => null }));
vi.mock("@/components/fotovoltaico/FvConfrontoVarianti", () => ({ FvConfrontoVarianti: (): null => null }));
vi.mock("@/components/fotovoltaico/FvLayoutTetto", () => ({ FvLayoutTetto: (): null => null }));
vi.mock("@/components/fotovoltaico/FvSimulatoreInterattivo", () => ({ FvSimulatoreInterattivo: (): null => null }));
vi.mock("@/components/fotovoltaico/FvDimensionamentoStringhe", () => ({ FvDimensionamentoStringhe: (): null => null }));

import FotovoltaicoWizard, { FvControlloEconomico, FvScontoCard, Step7VistaImpresa } from "@/pages/azienda/fotovoltaico/FotovoltaicoWizard";
import { calcolaFvEconomicsGuard } from "@/lib/fotovoltaico/preventivatore";

// La tendina del catalogo è un Select di Radix: in jsdom servono questi tre metodi per aprirla.
beforeAll(() => {
  Element.prototype.scrollIntoView = Element.prototype.scrollIntoView ?? (() => {});
  Element.prototype.hasPointerCapture = Element.prototype.hasPointerCapture ?? (() => false);
  Element.prototype.releasePointerCapture = Element.prototype.releasePointerCapture ?? (() => {});
});
afterAll(() => { stato.catalogo = []; });
beforeEach(() => { stato.margini = true; stato.catalogo = []; localStorage.clear(); });
afterEach(() => cleanup());

const testoPagina = () => document.body.textContent ?? "";
/** Scenario di prova: prezzo pieno 4.000 €, sconto 5% (200 €), costo d'acquisto 2.400 €. */
const SCENARIO = {
  costi: {
    costo_totale_netto: 2400, prezzo_pieno_netto: 4000, prezzo_vendita_netto: 3800, sconto_eur_applicato: 200,
    prezzo_vendita_iva_inclusa: 4180, margine_eur: 1400, margine_pct: 0.3684, costi_incompleti: false,
  },
};

describe("Fase 7, «Vista impresa»", () => {
  it("con il permesso mostra costo diretto, margine in € e in %", () => {
    render(<Step7VistaImpresa progettoId="p1" scenario={SCENARIO} />);
    expect(screen.getByText("Costo diretto")).toBeTruthy();
    expect(screen.getByText("Margine €")).toBeTruthy();
    expect(screen.getByText("Margine %")).toBeTruthy();
    expect(testoPagina()).toContain("2400");
    expect(testoPagina()).toContain("1400");
  });

  it("senza il permesso non c'è nessun costo e nessun margine: solo l'avviso che la vista è riservata", () => {
    stato.margini = false;
    render(<Step7VistaImpresa progettoId="p1" scenario={SCENARIO} />);
    expect(screen.queryByText("Costo diretto")).toBeNull();
    expect(screen.queryByText("Margine €")).toBeNull();
    expect(testoPagina()).not.toContain("2400");
    expect(testoPagina()).not.toContain("1400");
    expect(screen.getByText(/riservata a chi può vedere costi e margini/i)).toBeTruthy();
  });
});

describe("Fase 5, scheda sconto", () => {
  const dati: WizardData = { ...INITIAL, sconto_tipo: "pct", sconto_valore: 5 };
  const monta = () => render(<FvScontoCard data={dati} update={vi.fn()} readOnlyMode={false} scenario={SCENARIO} calcolando={false} onRicalcola={vi.fn()} />);

  it("con il permesso: prezzo scontato e margine post-sconto (3.800 − 2.400 = 1.400 €, 36,8%)", () => {
    monta();
    expect(screen.getByText("Prezzo netto scontato")).toBeTruthy();
    expect(screen.getAllByText(/[Mm]argine post-sconto/).length).toBeGreaterThan(0);
    expect(testoPagina()).toMatch(/36,8%|36\.8%/);
  });

  it("senza il permesso: il prezzo scontato e il verdetto sullo sconto sì, il margine no", () => {
    stato.margini = false;
    monta();
    expect(screen.getByText("Prezzo netto scontato")).toBeTruthy();
    expect(screen.getByText("Sconto applicato")).toBeTruthy();
    expect(testoPagina()).not.toMatch(/[Mm]argine/);
    expect(testoPagina()).not.toMatch(/36,8|36\.8/);
  });
});

describe("Fase 6, controllo economico interno", () => {
  const guard = calcolaFvEconomicsGuard({
    prezzo_vendita_netto: 3800, costo_totale_netto: 2400, margine_eur: 1400, margine_pct: 0.3684, costi_incompleti: false,
    margine_target_pct: 0.5, cpl_max_sostenibile: 120, payback_anni: 7, rata_mensile_eur: 90, risparmio_mensile_eur: 100,
  });

  it("con il permesso: margine reale, margine lordo, CPL massimo e i motivi (margine sotto il target)", () => {
    render(<FvControlloEconomico guard={guard} variant="warn" title="Economia da rivedere" />);
    expect(screen.getByText("Margine reale")).toBeTruthy();
    expect(screen.getByText("Margine lordo")).toBeTruthy();
    expect(screen.getByText("CPL massimo")).toBeTruthy();
    expect(testoPagina()).toMatch(/sotto target/);
  });

  it("senza il permesso: niente, né margini né costo del lead né i motivi che li citano", () => {
    stato.margini = false;
    const { container } = render(<FvControlloEconomico guard={guard} variant="warn" title="Economia da rivedere" />);
    expect(container.textContent).toBe("");
  });
});

describe("Fase 5, prodotti extra: il costo d'acquisto", () => {
  const seminaBozza = () => localStorage.setItem(LS_KEY_NEW, JSON.stringify({
    step: 5, completedSteps: [1, 2, 3, 4], savedAt: Date.now(),
    data: {
      ...INITIAL,
      cliente_nome: "Mario", cliente_cognome: "Rossi", cliente_telefono: "347 123 4567",
      indirizzo: "Via Roma 4", cap: "36100", comune: "Vicenza", provincia: "VI",
      consumo_annuo_kwh: 4500, ore_sole_annue: 1350, numero_pannelli_max: 20, potenza_max_kwp: 9, numero_pannelli_scelti: 12, potenza_kwp: 5.4,
    },
  }));
  const apriConUnProdottoExtra = async () => {
    seminaBozza();
    render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><FotovoltaicoWizard /></QueryClientProvider>);
    fireEvent.click(await screen.findByRole("button", { name: /Prodotto libero/ }, { timeout: 8000 }));
    await screen.findByText("Vendita € (unit.)");
  };

  it("con il permesso c'è il campo «Acquisto €» (da lì si scrive il costo)", async () => {
    await apriConUnProdottoExtra();
    expect(screen.getAllByText(/Acquisto €/).length).toBe(1);
  });

  it("senza il permesso il campo del costo d'acquisto non c'è", async () => {
    stato.margini = false;
    await apriConUnProdottoExtra();
    expect(screen.getByText("Vendita € (unit.)")).toBeTruthy();
    expect(screen.queryByText(/Acquisto €/)).toBeNull();
  });
});

describe("Fase 5, servizi: «+ Dal catalogo»", () => {
  // Servizio di catalogo: costo 120 €, margine 40% → prezzo di vendita 200 €.
  const SERVIZIO = { id: "s1", codice: "enea", descrizione: "Pratica ENEA", prezzo_netto_default: 120, margine_pct_default: 0.4, note_operative: null as null };
  const POINTER = { button: 0, ctrlKey: false, pointerType: "mouse" } as const;
  const apriIlCatalogo = async () => {
    localStorage.setItem(LS_KEY_NEW, JSON.stringify({
      step: 5, completedSteps: [1, 2, 3, 4], savedAt: Date.now(),
      data: {
        ...INITIAL,
        cliente_nome: "Mario", cliente_cognome: "Rossi", cliente_telefono: "347 123 4567",
        indirizzo: "Via Roma 4", cap: "36100", comune: "Vicenza", provincia: "VI",
        consumo_annuo_kwh: 4500, ore_sole_annue: 1350, numero_pannelli_max: 20, potenza_max_kwp: 9, numero_pannelli_scelti: 12, potenza_kwp: 5.4,
      },
    }));
    render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><FotovoltaicoWizard /></QueryClientProvider>);
    const segnaposto = await screen.findByText("+ Dal catalogo", {}, { timeout: 8000 });
    fireEvent.pointerDown(segnaposto.closest("[role='combobox']") as HTMLElement, POINTER);
    return screen.findByRole("option", { name: /Pratica ENEA/ });
  };

  it("con il permesso accanto al servizio c'è il suo importo (il costo: 120 €), come prima", async () => {
    stato.catalogo = [SERVIZIO];
    const voce = await apriIlCatalogo();
    expect(voce.textContent).toContain("120€");
  });

  it("senza il permesso il servizio c'è, l'importo (il costo) no", async () => {
    stato.margini = false;
    stato.catalogo = [SERVIZIO];
    const voce = await apriIlCatalogo();
    expect(voce.textContent).toBe("Pratica ENEA");
    expect(document.body.textContent).not.toContain("120€");
  });

  it("scegliendo il servizio senza permesso entra comunque nel preventivo, col suo prezzo di vendita (200 €)", async () => {
    stato.margini = false;
    stato.catalogo = [SERVIZIO];
    fireEvent.click(await apriIlCatalogo());
    const prezzo = (await screen.findByTitle("Prezzo vendita")) as HTMLInputElement;
    expect(prezzo.value).toBe("200");
    expect((screen.getByPlaceholderText("Descrizione servizio") as HTMLInputElement).value).toBe("Pratica ENEA");
  });
});
