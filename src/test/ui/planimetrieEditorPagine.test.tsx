import { describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import bilocale from "../../../shared/planimetrie/esempi/bilocale.json";

const archivio = vi.hoisted(() => ({
  creaPlanimetria: vi.fn(),
  salvaNuovaVersione: vi.fn(),
  invoke: vi.fn(),
}));

vi.mock("@/integrations/supabase/client", () => ({ supabase: { functions: { invoke: archivio.invoke } } }));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ effectiveCompany: { id: "azienda-1" } }) }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/lib/planimetrie/archivio", async (importOriginal) => {
  const vero = await importOriginal<typeof import("@/lib/planimetrie/archivio")>();
  return {
    ...vero,
    creaPlanimetria: archivio.creaPlanimetria,
    salvaNuovaVersione: archivio.salvaNuovaVersione,
    usePlanimetria: () => ({
      isLoading: false,
      error: null as Error | null,
      data: {
        riga: { id: "p1", titolo: "Bilocale di esempio", versione_corrente: 3 },
        versione: { numero: 3, documento: bilocale },
      },
    }),
  };
});

import RenderPlanimetriaModifica from "@/pages/azienda/RenderPlanimetriaModifica";
import RenderPlanimetriaNuova from "@/pages/azienda/RenderPlanimetriaNuova";
import { EditorConSalvataggio } from "@/components/planimetrie/editor/EditorConSalvataggio";

class ResizeObserverFinto {
  observe() {}
  disconnect() {}
  unobserve() {}
}

/** La voce della stanza nell'elenco a destra. */
const vocePanello = (nome: string) =>
  screen.getAllByRole("button").find((b) => b.textContent?.startsWith(nome)) as HTMLElement;

function monta(ui: React.ReactNode, percorso: string, rotta: string) {
  const qc = new QueryClient();
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[percorso]}>
        <Routes>
          <Route path={rotta} element={ui} />
          <Route path="/azienda/render/planimetrie/:id" element={<p>Scheda della pianta</p>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  (globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = ResizeObserverFinto;
});

describe("Modifica la pianta", () => {
  it("apre la versione corrente e, dopo una modifica, salva una versione nuova con la versione attesa", async () => {
    archivio.salvaNuovaVersione.mockResolvedValue(4);
    monta(<RenderPlanimetriaModifica />, "/azienda/render/planimetrie/p1/modifica", "/azienda/render/planimetrie/:id/modifica");
    expect(screen.getByText("Bilocale di esempio")).toBeTruthy();
    expect(screen.getAllByText("Camera").length).toBeGreaterThan(0);
    const salva = screen.getByRole("button", { name: /Salva/ }) as HTMLButtonElement;
    expect(salva.disabled).toBe(true);

    // una modifica: si rinomina la camera dal pannello
    fireEvent.click(vocePanello("Camera"));
    const nome = await screen.findByLabelText("Nome della stanza");
    fireEvent.change(nome, { target: { value: "Camera matrimoniale" } });
    fireEvent.blur(nome);
    await waitFor(() => expect(salva.disabled).toBe(false));

    fireEvent.click(salva);
    await waitFor(() => expect(archivio.salvaNuovaVersione).toHaveBeenCalled());
    const chiamata = archivio.salvaNuovaVersione.mock.calls[0][0];
    expect(chiamata).toMatchObject({ planimetriaId: "p1", versioneAttesa: 3, origine: "manuale" });
    expect(chiamata.documento.livelli[0].fatto.locali.map((l: { nome: string }) => l.nome)).toContain("Camera matrimoniale");
    expect(await screen.findByText("Scheda della pianta")).toBeTruthy();
  });

  it("se qualcun altro ha salvato nel frattempo non sovrascrive e propone di ricaricare", async () => {
    const { messaggioErrorePlanimetria } = await import("@/lib/planimetrie/archivio");
    archivio.salvaNuovaVersione.mockRejectedValue(new Error(messaggioErrorePlanimetria({ code: "40001" })));
    monta(<RenderPlanimetriaModifica />, "/azienda/render/planimetrie/p1/modifica", "/azienda/render/planimetrie/:id/modifica");
    fireEvent.click(vocePanello("Camera"));
    const nome = await screen.findByLabelText("Nome della stanza");
    fireEvent.change(nome, { target: { value: "Studio" } });
    fireEvent.blur(nome);
    fireEvent.click(screen.getByRole("button", { name: /Salva/ }));
    expect(await screen.findByRole("alert")).toBeTruthy();
    expect(screen.getByRole("alert").textContent).toMatch(/salvata da qualcun altro/);
    expect(screen.getByRole("button", { name: /Ricarica/ })).toBeTruthy();
    expect(screen.queryByText("Scheda della pianta")).toBeNull();
  });
});

describe("Nuova pianta", () => {
  it("disegno: senza nome non si salva; col nome si crea e si va alla scheda", async () => {
    archivio.creaPlanimetria.mockResolvedValue("nuova-1");
    monta(
      <EditorConSalvataggio companyId="azienda-1" titoloPagina="Disegna una pianta" indietro="/x" iniziale={bilocale as never} />,
      "/n",
      "/n",
    );
    const salva = screen.getByRole("button", { name: /Salva/ }) as HTMLButtonElement;
    expect(salva.disabled).toBe(true);
    fireEvent.change(screen.getByLabelText("Nome della pianta"), { target: { value: "Casa Bianchi" } });
    expect(salva.disabled).toBe(false);
    fireEvent.click(salva);
    await waitFor(() => expect(archivio.creaPlanimetria).toHaveBeenCalled());
    expect(archivio.creaPlanimetria.mock.calls[0][0]).toMatchObject({ companyId: "azienda-1", titolo: "Casa Bianchi", origine: "manuale" });
    expect(await screen.findByText("Scheda della pianta")).toBeTruthy();
  });

  it("descrizione: la pianta dell'AI si apre nell'editor e si salva con l'origine dell'AI", async () => {
    archivio.invoke.mockResolvedValue({
      data: {
        success: true,
        planimetria: bilocale,
        origine_versione: "ai_testo",
        generazione: { ingresso: "descrizione", scala: null, avvisi: ["Controlla le misure del bagno."], sorgente_path: null, sfondo_dxf: null, superfici_scritte: {} },
      },
      error: null,
    });
    archivio.creaPlanimetria.mockResolvedValue("nuova-2");
    monta(<RenderPlanimetriaNuova />, "/azienda/render/planimetrie/nuova?da=testo", "/azienda/render/planimetrie/nuova");
    fireEvent.change(screen.getByLabelText("Com'è la casa?"), { target: { value: "Bilocale di 50 mq con bagno e camera" } });
    fireEvent.click(screen.getByRole("button", { name: /Ricava la pianta/ }));
    expect(await screen.findByText("Controlla la pianta e salvala")).toBeTruthy();
    expect(archivio.invoke).toHaveBeenCalledWith("planimetria-genera", { body: expect.objectContaining({ company_id: "azienda-1", ingresso: "descrizione" }) });
    expect(screen.getByText("Controlla le misure del bagno.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Salva/ }));
    await waitFor(() => expect(archivio.creaPlanimetria).toHaveBeenCalled());
    expect(archivio.creaPlanimetria.mock.calls[0][0]).toMatchObject({ titolo: "Bilocale di esempio", origine: "ai_testo" });
  });

  it("crediti finiti: frase semplice e «Disegnala a mano»", async () => {
    const risposta = new Response(JSON.stringify({ success: false, codice: "crediti", messaggio: "Crediti AI esauriti" }), { status: 402 });
    archivio.invoke.mockResolvedValue({ data: null, error: Object.assign(new Error("non-2xx"), { context: risposta }) });
    monta(<RenderPlanimetriaNuova />, "/azienda/render/planimetrie/nuova?da=testo", "/azienda/render/planimetrie/nuova");
    fireEvent.change(screen.getByLabelText("Com'è la casa?"), { target: { value: "Trilocale di 75 mq" } });
    fireEvent.click(screen.getByRole("button", { name: /Ricava la pianta/ }));
    const avviso = await screen.findByRole("alert");
    expect(avviso.textContent).toMatch(/crediti AI sono finiti/);
    expect(screen.getByRole("link", { name: /Disegnala a mano/ })).toBeTruthy();
  });
});
