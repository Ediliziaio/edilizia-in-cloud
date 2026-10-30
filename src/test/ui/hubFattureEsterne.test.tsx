import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { MemoryRouter, Routes, Route, useLocation } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import "@testing-library/jest-dom/vitest";
import sorgenteRotte from "@/routes/companyRoutes.tsx?raw";
import sorgenteMenu from "@/lib/sidebarConfig.ts?raw";

// Chi fattura con un altro programma vede l'hub fatture nativo, con le sue fatture
// importate, ma non crea documenti.
const s = vi.hoisted(() => ({
  esterna: true,
  filtri: [] as Record<string, unknown>[],
  documenti: [] as Record<string, unknown>[],
}));

vi.mock("@/contexts/BillingModeContext", () => ({
  useBillingMode: () => ({ mode: s.esterna ? "external" : "native", isExternal: s.esterna, isNative: !s.esterna, isLoading: false }),
}));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ effectiveCompany: { id: "c1" } }) }));
vi.mock("@/hooks/useIsMobile", () => ({ useIsMobile: () => false }));
vi.mock("@/hooks/use-mobile", () => ({ useIsMobile: () => false }));
vi.mock("@/hooks/useEffectiveCompanyId", () => ({ useEffectiveCompanyId: () => "c1" }));
vi.mock("@/hooks/useSubscriptionLimits", () => ({ useSubscriptionLimits: () => ({ isScopriPlan: false }) }));
vi.mock("@/hooks/useAnagraficaAzienda", () => ({ useAnagraficaAzienda: () => ({ data: null as null }) }));
vi.mock("@/hooks/useShipmentDDTPDF", () => ({ useShipmentDDTPDF: () => ({ generate: vi.fn(), uploadAndAttach: vi.fn(), isUploading: false }) }));
vi.mock("@/hooks/billing/useDocumentCounts", () => ({ useDocumentCounts: () => ({ data: { fatture: 1, proforma: 0, nota_credito: 0, ddt: 0, preventivo: 0, annullate: 0, cestinati: 0 } }) }));
vi.mock("@/hooks/billing/useMonthlyTimeline", () => ({ useMonthlyTimeline: () => ({ data: [] as unknown[] }) }));
vi.mock("@/hooks/useDocumentiFiscali", () => ({
  useDocumentiFiscali: (filtri: Record<string, unknown>) => {
    s.filtri.push(filtri);
    return { data: { documenti: s.documenti, total: s.documenti.length }, isLoading: false, isError: false, isFetching: false, refetch: vi.fn() };
  },
  useDeleteDocumento: () => ({ mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false }),
  useUpdateDocumento: () => ({ mutate: vi.fn(), isPending: false }),
}));
vi.mock("@/components/fatturazione/GestionaleEsterno", async (orig) => ({
  ...(await orig<typeof import("@/components/fatturazione/GestionaleEsterno")>()),
  GestionaleEsternoAzioni: () => <button type="button">Sincronizza</button>,
  ImportInCorsoBanner: (): null => null,
  SegnaPagataImportataDialog: ({ fattura }: { fattura: { numero: string } | null }) => (fattura ? <p>Incasso di {fattura.numero}</p> : null),
}));
vi.mock("@/components/fatturazione/EmessaImportataDettaglio", () => ({
  EmessaImportataDettaglio: ({ id }: { id: string }) => <p>Dettaglio importata {id}</p>,
}));
vi.mock("@/components/fatture/AbbinaFattureCommesseDialog", () => ({ AbbinaFattureCommesseDialog: (): null => null }));
vi.mock("@/components/fatturazione/SegnaPagataDialog", () => ({ SegnaPagataDialog: (): null => null }));
vi.mock("@/components/fatturazione/HubEsterno", () => ({
  RegistroIncassiImportate: () => <p>Incassi delle importate</p>,
  CassettoSdiEsterno: () => <p>Cassetto del gestionale</p>,
  ClientiFiscaliImportatiTable: () => <p>Clienti delle importate</p>,
}));
vi.mock("@/pages/azienda/fatturazione/RegistroIncassi", () => ({ default: () => <p>Incassi nativi</p> }));
vi.mock("@/pages/azienda/fatturazione/CassettoSDI", () => ({ default: () => <p>Cassetto nativo</p> }));
vi.mock("@/pages/azienda/fatturazione/AnagraficheList", () => ({ default: () => <p>Anagrafiche</p> }));
vi.mock("@/components/fatturazione/FiscalWorkspace", () => ({ default: () => <p>Fiscalità</p> }));

import DocumentiFiscaliList from "@/pages/azienda/fatturazione/DocumentiFiscaliList";

const importata = {
  id: "inv-1", company_id: "c1", origine: "importata", external_provider: "fattureincloud",
  tipo: "fattura", numero: "FPR 12/26", numero_progressivo: 12, anno: 2026,
  data_emissione: "2026-09-01", data_scadenza: "2026-09-30",
  cliente_snapshot: { ragione_sociale: "Rossi Costruzioni" }, stato: "emessa",
  imponibile_totale: 1000, iva_totale: 220, totale_documento: 1220,
  totale_da_pagare: 1220, importo_pagato: 0, sdi_errori: [] as unknown[], righe: [] as unknown[], riepilogo_iva: [] as unknown[],
};

function Dove() {
  const l = useLocation();
  return <output data-testid="dove">{l.pathname + l.search}</output>;
}

function monta(url = "/azienda/documenti") {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[url]}>
        <Routes><Route path="*" element={<><DocumentiFiscaliList /><Dove /></>} /></Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  s.esterna = true;
  s.filtri = [];
  s.documenti = [importata];
  Element.prototype.scrollIntoView = vi.fn();
});
afterEach(cleanup);

describe("Hub fatture per chi fattura con un altro programma", () => {
  it("vede l'hub con tutte le schede e le sue fatture importate", () => {
    monta();
    for (const scheda of ["Fatture", "Clienti fiscali", "Registro incassi", "Cassetto SDI", "Fiscalità"]) {
      expect(screen.getAllByRole("button", { name: new RegExp(scheda) }).length).toBeGreaterThan(0);
    }
    expect(screen.getAllByText("Rossi Costruzioni").length).toBeGreaterThan(0);
    // Stessa intestazione del nativo, parola per parola.
    expect(screen.getByRole("heading", { name: "Fatturazione" })).toBeInTheDocument();
    expect(screen.getByText("Gestisci documenti fiscali, SDI, incassi e scadenze operative.")).toBeInTheDocument();
    // Stesse colonne della tabella nativa.
    for (const col of ["Stato", "Cliente", "Data / Numero", "Prox. Scadenza", "Importo"]) {
      expect(screen.getByRole("columnheader", { name: col })).toBeInTheDocument();
    }
    // L'elenco legge anche le importate.
    expect(s.filtri.at(-1)?.conImportate).toBe(true);
  });

  it("non vede «Nuovo documento» né la creazione dall'elenco vuoto, ma ha Sincronizza, Report e Abbina", () => {
    s.documenti = [];
    monta();
    expect(screen.queryByRole("button", { name: /Nuovo documento/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Crea la tua prima fattura/ })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Sincronizza" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Report fiscali/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Abbina alle commesse/ })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Emesse importate/ })).toBeInTheDocument();
    // Le impostazioni sono quelle del collegamento al gestionale, non la numerazione nativa.
    expect(screen.getByRole("link", { name: /Impostazioni/ })).toHaveAttribute("href", "/azienda/impostazioni/fatturazione");
  });

  it("una fattura importata si apre nel suo dettaglio, non nell'editor", () => {
    monta();
    fireEvent.click(screen.getAllByText("Rossi Costruzioni")[0]);
    expect(screen.getByTestId("dove")).toHaveTextContent("/azienda/documenti/importata/inv-1");
  });

  it("«Sincronizza» sta dove il nativo ha «Nuovo documento»: ultimo pulsante della testata", () => {
    monta();
    const testata = screen.getByRole("heading", { name: "Fatturazione" }).closest(".testata-pagina") as HTMLElement;
    const pulsanti = Array.from(testata.querySelectorAll("button, a")).map((e) => e.textContent?.trim());
    expect(pulsanti.at(-1)).toBe("Sincronizza");
  });

  it("le schede senza dato nativo leggono le importate o lo dicono", () => {
    monta("/azienda/documenti?tab=incassi");
    expect(screen.getByText("Incassi delle importate")).toBeInTheDocument();
    cleanup();
    monta("/azienda/documenti?tab=sdi");
    expect(screen.getByText("Cassetto del gestionale")).toBeInTheDocument();
  });

  it("niente filtri SDI e bozze nello stato", () => {
    monta();
    fireEvent.click(screen.getByRole("combobox", { name: "Filtra per stato" }));
    expect(screen.queryByRole("option", { name: "Da inviare SDI" })).not.toBeInTheDocument();
    expect(screen.queryByRole("option", { name: "Bozza" })).not.toBeInTheDocument();
    expect(screen.getAllByRole("option", { name: "Scaduta" }).length).toBeGreaterThan(0);
  });

  it("chi fattura con Edilizia in Cloud continua a creare e non legge le importate", () => {
    s.esterna = false;
    monta();
    expect(screen.getByRole("button", { name: /Nuovo documento/ })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Sincronizza" })).not.toBeInTheDocument();
    expect(s.filtri.at(-1)?.conImportate).toBe(false);
  });
});

describe("Rotte e menu: una pagina sola", () => {
  it("/azienda/documenti non chiede più il modo nativo; creare sì", () => {
    expect(sorgenteRotte).toMatch(/path="documenti" element=\{withCompanyPermissionOrCommercialista\("canViewBilling", <FeatureRoute featureKey="documenti"><DocumentiFiscaliList \/>/);
    expect(sorgenteRotte).toMatch(/path="documenti\/nuovo"[^\n]*BillingModeGuard requiredMode="native"/);
    expect(sorgenteRotte).toMatch(/path="documenti\/:id" [^\n]*BillingModeGuard requiredMode="native"/);
    for (const r of ["documenti\\/report", "documenti\\/registro-iva", "documenti\\/:id\\/dettaglio"]) {
      expect(sorgenteRotte).not.toMatch(new RegExp(`path="${r}"[^\\n]*BillingModeGuard`));
    }
  });

  it("/azienda/fatturazione porta all'hub tenendo i parametri", () => {
    expect(sorgenteRotte).toMatch(/path="fatturazione" element=\{<RimandoConParametri to="\/azienda\/documenti" \/>\}/);
    expect(sorgenteRotte).toContain("`${to}${location.search}${location.hash}`");
  });

  it("una sola voce «Fatture» per entrambi i modi", () => {
    expect(sorgenteMenu).not.toContain('featureKey: "billing_external"');
    expect(sorgenteMenu).not.toContain('url: "/azienda/fatturazione"');
    expect(sorgenteMenu).toMatch(/title: "Fatture", url: "\/azienda\/documenti"[^\n]*featureKey: "documenti"/);
  });
});
