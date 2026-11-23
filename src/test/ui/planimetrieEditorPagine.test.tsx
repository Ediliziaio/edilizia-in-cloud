import { describe, expect, it, vi, beforeEach } from "vitest";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import bilocale from "../../../shared/planimetrie/esempi/bilocale.json";
import { pavimentoDaCampione } from "../../../shared/planimetrie/materialiProgetto";
import { nuovaPlanimetria, type Planimetria } from "../../../shared/planimetrie/modello";
import * as dwgLocale from "@/lib/planimetrie/dwgLocale";
import type { Vista3DProps } from "@/components/planimetrie/Vista3DPigra";

const archivio = vi.hoisted(() => ({
  creaPlanimetria: vi.fn(),
  salvaNuovaVersione: vi.fn(),
  invoke: vi.fn(),
  upload: vi.fn(),
}));

vi.mock("@/integrations/supabase/client", () => ({ supabase: {
  functions: { invoke: archivio.invoke },
  storage: { from: () => ({ upload: archivio.upload, createSignedUrl: async () => ({ data: { signedUrl: "/tavola.png" } }) }) },
} }));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ effectiveCompany: { id: "azienda-1" } }) }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/components/planimetrie/Vista3DPigra", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/components/planimetrie/Vista3DPigra")>(),
  Vista3DPigra: ({ piante, anteprimaEditor }: Vista3DProps) => {
    const pianta = piante[anteprimaEditor?.vista === "fatto" ? "fatto" : "progetto"];
    return <>
      <output aria-label="Locali visibili nel 3D">{pianta.locali.map(l => l.nome).join(" · ")}</output>
      <output aria-label="Arredi visibili nel 3D">{pianta.elementi.length}</output>
      {anteprimaEditor?.confronto}
    </>;
  },
}));
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
import type { Riconoscitore } from "@/lib/planimetrie/dettatura";

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
          <Route path="/azienda/planimetrie/:id" element={<p>Scheda della pianta</p>} />
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
  it("annulla i primi arredi nel disegno nuovo, nel 3D e nel documento salvato", async () => {
    archivio.creaPlanimetria.mockResolvedValue("nuova-1");
    const { container } = monta(<EditorConSalvataggio companyId="azienda-1" titoloPagina="Disegna una pianta" indietro="/x" />, "/n", "/n");
    fireEvent.change(screen.getByLabelText("Nome della pianta"), { target: { value: "Prova soggiorno" } });
    fireEvent.click(screen.getByRole("button", { name: "Scrivi le misure" }));
    fireEvent.change(screen.getByLabelText("Nome (facoltativo)"), { target: { value: "Soggiorno" } });
    fireEvent.change(screen.getByLabelText("Larghezza (m)"), { target: { value: "4" } });
    fireEvent.change(screen.getByLabelText("Lunghezza (m)"), { target: { value: "5" } });
    fireEvent.click(screen.getByRole("button", { name: "Aggiungi la stanza" }));
    fireEvent.click(screen.getByRole("button", { name: /^Anteprima 3D$/ }));
    const arredi = screen.getByLabelText("Arredi visibili nel 3D");
    expect(arredi).toHaveTextContent("0");
    fireEvent.click(screen.getByRole("button", { name: "Chat del disegno" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Scrivi alla chat del disegno" }), { target: { value: "Arreda il soggiorno" } });
    fireEvent.click(screen.getByRole("button", { name: "Invia messaggio" }));
    fireEvent.click(await screen.findByRole("button", { name: "Applica alla pianta" }));
    expect(arredi).not.toHaveTextContent("0");
    fireEvent.click(await screen.findByRole("button", { name: "Annulla applicazione" }));
    expect(arredi).toHaveTextContent("0");
    expect(container.querySelectorAll('g[data-tipo="elemento"]')).toHaveLength(0);
    fireEvent.click(screen.getByRole("button", { name: "Salva" }));
    await waitFor(() => expect(archivio.creaPlanimetria).toHaveBeenCalledOnce());
    expect(archivio.creaPlanimetria.mock.calls[0][0].documento.livelli[0].fatto.elementi).toEqual([]);
  });

  it("confronta la proposta in 3D prima di applicarla e ripristina la pianta scartandola", async () => {
    monta(<RenderPlanimetriaModifica />, "/azienda/planimetrie/p1/modifica", "/azienda/planimetrie/:id/modifica");
    const apri3D = screen.getByRole("button", { name: /^Anteprima 3D$/ });
    fireEvent.click(apri3D);
    const pannello = within(screen.getByRole("region", { name: "Anteprima 3D affiancata" }));
    const locali = pannello.getByLabelText("Locali visibili nel 3D");
    expect(locali).toHaveTextContent("Soggiorno");
    expect(locali).not.toHaveTextContent("Lavanderia");
    fireEvent.click(screen.getByRole("button", { name: "Chat del disegno" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Scrivi alla chat del disegno" }), { target: { value: "Lavanderia 2,4 × 2,5 m" } });
    fireEvent.click(screen.getByRole("button", { name: "Invia messaggio" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Applica alla pianta" })).toBeEnabled());
    expect(locali).toHaveTextContent("Lavanderia");
    expect(pannello.getByText(/Proposta di Silvio/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Salva" })).toBeDisabled();
    const confronto = within(screen.getByRole("group", { name: "Confronta sulla pianta" }));
    fireEvent.click(confronto.getByRole("button", { name: "Prima" }));
    expect(locali).not.toHaveTextContent("Lavanderia");
    expect(pannello.getByText(/Prima della proposta/)).toBeInTheDocument();
    fireEvent.click(confronto.getByRole("button", { name: "Dopo" }));
    expect(locali).toHaveTextContent("Lavanderia");
    const divisore = screen.getByRole("separator", { name: "Ridimensiona la pianta 2D" });
    fireEvent.keyDown(divisore, { key: "ArrowLeft" });
    expect(divisore).toHaveAttribute("aria-valuenow", "50");
    fireEvent.keyDown(divisore, { key: "Enter" });
    const mostraPianta = pannello.getByRole("button", { name: "Mostra pianta 2D" });
    expect(mostraPianta).toHaveFocus();
    expect(document.getElementById(mostraPianta.getAttribute("aria-controls")!)).toBeEmptyDOMElement();
    expect(screen.queryByRole("group", { name: "Confronta sulla pianta" })).toBeNull();
    const confronto3D = within(pannello.getByRole("group", { name: "Confronta la proposta in 3D" }));
    fireEvent.click(confronto3D.getByRole("button", { name: "Prima" }));
    expect(locali).not.toHaveTextContent("Lavanderia");
    fireEvent.click(confronto3D.getByRole("button", { name: "Dopo" }));
    expect(locali).toHaveTextContent("Lavanderia");
    fireEvent.click(mostraPianta);
    expect(screen.getByRole("separator", { name: "Ridimensiona la pianta 2D" })).toHaveAttribute("aria-valuenow", "50");
    expect(screen.getByRole("group", { name: "Confronta sulla pianta" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Scarta" }));
    expect(locali).not.toHaveTextContent("Lavanderia");
    expect(archivio.salvaNuovaVersione).not.toHaveBeenCalled();
    fireEvent.click(pannello.getByRole("button", { name: "Nascondi pianta 2D" }));
    fireEvent.click(pannello.getByRole("button", { name: "Chiudi anteprima 3D" }));
    expect(apri3D).toHaveFocus();
    expect(screen.queryByRole("region", { name: "Anteprima 3D affiancata" })).toBeNull();
    expect(document.getElementById(mostraPianta.getAttribute("aria-controls")!)?.querySelector("svg")).toBeInTheDocument();
  });

  it("salva il riferimento DWG bloccato quando la ricostruzione parte dalla chat", async () => {
    const dwg = structuredClone(bilocale) as Planimetria;
    dwg.livelli[0].tavolaDwg = { riquadro: { x: 0, y: 0, larghezza: 800, altezza: 600 },
      layer: [{ nome: "MURI", linee: "M0 0l800 0", campiture: "" }] };
    const anteprima = new File(["demo"], "pianta.png", { type: "image/png" });
    const leggi = vi.spyOn(dwgLocale, "leggiTavolaDwg").mockResolvedValue({ file: anteprima,
      riferimento: { unita: 6, rettangolo: [0, 0, 8, 6], quote: [] } });
    const ricostruisci = vi.spyOn(dwgLocale, "ricostruisciModelloDwg").mockResolvedValue({ documento: dwg,
      piani: [{ origine: [0, 600], larghezza: 800, altezza: 600, allineamento: "primo" }] });
    vi.stubGlobal("URL", class extends URL {
      static createObjectURL() { return "blob:tavola-dwg"; }
      static revokeObjectURL() {}
    });
    try {
      archivio.upload.mockResolvedValue({ error: null });
      archivio.salvaNuovaVersione.mockResolvedValue(4);
      monta(<EditorConSalvataggio companyId="azienda-1" titoloPagina="Piano vuoto" indietro="/azienda/planimetrie/p1"
        iniziale={nuovaPlanimetria()} planimetriaId="p1" versioneAttesa={3} />, "/azienda/planimetrie/p1/modifica", "/azienda/planimetrie/:id/modifica");
      fireEvent.click(screen.getByRole("button", { name: "Chat del disegno" }));
      fireEvent.change(screen.getByLabelText("File per la planimetria"), { target: { files: [new File(["DWG"], "base.dwg")] } });
      fireEvent.click(await screen.findByRole("button", { name: "Ricostruisci il piano" }));
      await waitFor(() => expect(screen.getByRole("button", { name: "Applica alla pianta" })).toBeEnabled());
      expect(archivio.upload).not.toHaveBeenCalled();
      fireEvent.click(screen.getByRole("button", { name: "Applica alla pianta" }));
      await screen.findByTitle("Originale DWG bloccato");
      fireEvent.click(screen.getByRole("button", { name: "Salva" }));
      await waitFor(() => expect(archivio.salvaNuovaVersione).toHaveBeenCalledOnce());
      const salvato = archivio.salvaNuovaVersione.mock.calls[0][0].documento as Planimetria;
      expect(salvato.livelli[0].tavolaDwg).toEqual(dwg.livelli[0].tavolaDwg);
      expect(salvato.livelli[0].ricalco).toMatchObject({ bloccata: true, calibrata: true, x: 0, y: 600 });
      expect(salvato.livelli[0].riscontroScala).toEqual({ stato: "da_verificare" });
    } finally {
      leggi.mockRestore();
      ricostruisci.mockRestore();
      vi.unstubAllGlobals();
    }
  });

  it("salva un riscontro documentale conservando i locali importati", async () => {
    const originale = structuredClone(bilocale) as Planimetria;
    originale.livelli[0].fatto.locali[0].nome = "Contorno da conservare";
    originale.letturaDocumento = {
      protocolloVerifica: 1, avvisiIniziali: [], superficiScritteMq: {},
      verifiche: [{ id: "riscontro", tipo: "nota", descrizione: "Confronto la quota stampata" }],
    };
    archivio.salvaNuovaVersione.mockResolvedValue(4);
    monta(<EditorConSalvataggio companyId="azienda-1" titoloPagina="Bilocale" indietro="/azienda/planimetrie/p1"
      iniziale={originale} planimetriaId="p1" versioneAttesa={3} />, "/azienda/planimetrie/p1/modifica", "/azienda/planimetrie/:id/modifica");
    const controllo = within(screen.getByRole("region", { name: "Confronto la quota stampata" }));
    fireEvent.change(controllo.getByRole("textbox"), { target: { value: "Confrontata con il foglio originale." } });
    fireEvent.click(controllo.getByRole("button", { name: "Confermo il controllo" }));
    fireEvent.click(screen.getByRole("button", { name: "Salva" }));
    await waitFor(() => expect(archivio.salvaNuovaVersione).toHaveBeenCalledOnce());
    const salvato = archivio.salvaNuovaVersione.mock.calls[0][0].documento as Planimetria;
    expect(salvato.livelli[0].fatto).toEqual(originale.livelli[0].fatto);
    expect(salvato.livelli[0].proposte).toEqual(originale.livelli[0].proposte);
    expect(salvato.letturaDocumento?.verifiche?.[0].conferma?.nota).toBe("Confrontata con il foglio originale.");
  });

  it("rivede una modifica dettata, scarta la prova e salva solo quella applicata", async () => {
    let riconoscitore: Riconoscitore | undefined;
    const registraRiconoscitore = (istanza: Riconoscitore) => { riconoscitore = istanza; };
    vi.stubGlobal("SpeechRecognition", class implements Riconoscitore {
      lang = "";
      continuous = false;
      interimResults = false;
      onresult: Riconoscitore["onresult"] = null;
      onend: Riconoscitore["onend"] = null;
      onerror: Riconoscitore["onerror"] = null;
      start() { registraRiconoscitore(this); }
      stop() { this.onend?.(); }
    });
    try {
      archivio.salvaNuovaVersione.mockResolvedValue(4);
      monta(<RenderPlanimetriaModifica />, "/azienda/planimetrie/p1/modifica", "/azienda/planimetrie/:id/modifica");
      fireEvent.click(screen.getByRole("button", { name: "Chat del disegno" }));
      const testo = screen.getByRole("textbox", { name: "Scrivi alla chat del disegno" });
      const salva = screen.getByRole("button", { name: "Salva" });
      fireEvent.click(screen.getByRole("button", { name: "Detta un comando" }));
      const frase = "Lavanderia prova due virgola quaranta per due virgola cinquanta";
      expect(riconoscitore?.lang).toBe("it-IT");
      act(() => {
        const risultato = Object.assign([{ transcript: frase }], { isFinal: true });
        riconoscitore?.onresult?.({ resultIndex: 0, results: [risultato] });
      });
      fireEvent.click(screen.getByRole("button", { name: "Termina dettatura" }));
      expect(testo).toHaveValue(frase);
      fireEvent.click(screen.getByRole("button", { name: "Invia messaggio" }));
      await waitFor(() => expect(screen.getByRole("button", { name: "Scarta" })).toBeEnabled());
      expect(salva).toBeDisabled();
      fireEvent.click(screen.getByRole("button", { name: "Scarta" }));
      expect(salva).toBeDisabled();
      expect(archivio.salvaNuovaVersione).not.toHaveBeenCalled();

      fireEvent.change(testo, { target: { value: "Lavanderia 2,4 × 2,5 m" } });
      fireEvent.click(screen.getByRole("button", { name: "Invia messaggio" }));
      await waitFor(() => expect(screen.getByRole("button", { name: "Applica alla pianta" })).toBeEnabled());
      fireEvent.click(screen.getByRole("button", { name: "Applica alla pianta" }));
      fireEvent.click(salva);
      await waitFor(() => expect(archivio.salvaNuovaVersione).toHaveBeenCalledOnce());
      expect(archivio.salvaNuovaVersione.mock.calls[0][0].documento.livelli[0].fatto.locali.map((l: { nome: string }) => l.nome))
        .toContain("Lavanderia");
      expect(archivio.salvaNuovaVersione.mock.calls[0][0].documento.livelli[0].fatto.locali.map((l: { nome: string }) => l.nome))
        .not.toContain("Lavanderia prova");
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("apre la versione corrente e, dopo una modifica, salva una versione nuova con la versione attesa", async () => {
    archivio.salvaNuovaVersione.mockResolvedValue(4);
    monta(<RenderPlanimetriaModifica />, "/azienda/planimetrie/p1/modifica", "/azienda/planimetrie/:id/modifica");
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
    monta(<RenderPlanimetriaModifica />, "/azienda/planimetrie/p1/modifica", "/azienda/planimetrie/:id/modifica");
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
  it("mostra la sequenza di disegno e permette di arrivare subito al risultato o di interromperla", () => {
    vi.useFakeTimers();
    try {
      monta(<EditorConSalvataggio companyId="azienda-1" titoloPagina="Disegna una pianta" indietro="/x" />, "/n", "/n");
      fireEvent.click(screen.getByRole("button", { name: "Chat del disegno" }));
      const testo = screen.getByRole("textbox", { name: "Scrivi alla chat del disegno" });
      fireEvent.click(screen.getByRole("button", { name: "Prova cucina e ingresso" }));
      fireEvent.keyDown(testo, { key: "Enter" });
      expect(screen.getByRole("progressbar", { name: "Passaggi del disegno" })).toHaveAttribute("aria-valuenow", "1");
      act(() => vi.advanceTimersByTime(170));
      expect(screen.getByRole("progressbar", { name: "Passaggi del disegno" })).toHaveAttribute("aria-valuenow", "2");
      fireEvent.click(screen.getByRole("button", { name: "Interrompi risposta" }));
      act(() => vi.advanceTimersByTime(800));
      expect(screen.queryByRole("button", { name: "Applica alla pianta" })).toBeNull();
      fireEvent.change(testo, { target: { value: "Cucina 3,20 × 4,10 m\nIngresso 2 × 2,50 m a destra della cucina" } });
      fireEvent.keyDown(testo, { key: "Enter" });
      fireEvent.click(screen.getByRole("button", { name: "Vai al risultato" }));
      expect(screen.queryByRole("progressbar")).toBeNull();
      expect(screen.getByRole("button", { name: "Applica alla pianta" })).toBeEnabled();
      expect(screen.getByRole("button", { name: "Evidenzia Ingresso sulla tavola" })).toBeEnabled();
    } finally {
      vi.useRealTimers();
    }
  });

  it("con movimento ridotto propone il risultato completo e localizza le misure con la tastiera", () => {
    vi.stubGlobal("matchMedia", (query: string) => ({
      matches: query === "(prefers-reduced-motion: reduce)",
      addEventListener() {},
      removeEventListener() {},
    }));
    try {
      monta(<EditorConSalvataggio companyId="azienda-1" titoloPagina="Disegna una pianta" indietro="/x" />, "/n", "/n");
      const toggle = screen.getByRole("button", { name: "Chat del disegno" });
      fireEvent.click(toggle);
      fireEvent.click(screen.getByRole("button", { name: "Prova cucina e ingresso" }));
      fireEvent.keyDown(screen.getByRole("textbox", { name: "Scrivi alla chat del disegno" }), { key: "Enter" });
      expect(screen.queryByRole("progressbar")).toBeNull();
      expect(screen.getByRole("button", { name: "Applica alla pianta" })).toBeEnabled();
      const cucina = screen.getByRole("button", { name: "Evidenzia Cucina sulla tavola" });
      fireEvent.click(cucina);
      expect(cucina).toHaveAttribute("aria-pressed", "true");
      fireEvent.click(screen.getByRole("button", { name: "Chiudi chat del disegno" }));
      expect(toggle).toHaveFocus();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("confronta la proposta sulla stessa tavola e può annullarla dopo averla applicata", () => {
    vi.useFakeTimers();
    try {
      const { container } = monta(<EditorConSalvataggio companyId="azienda-1" titoloPagina="Disegna una pianta" indietro="/x" />, "/n", "/n");
      fireEvent.click(screen.getByRole("button", { name: "Chat del disegno" }));
      const chat = screen.getByRole("textbox", { name: "Scrivi alla chat del disegno" });
      fireEvent.change(chat, { target: { value: "Cucina 3,20 × 4,10 m" } });
      fireEvent.keyDown(chat, { key: "Enter" });
      act(() => vi.advanceTimersByTime(600));
      const confronto = within(screen.getByRole("group", { name: "Confronta sulla pianta" }));
      const contaLocali = () => container.querySelectorAll('svg[data-tipo="sfondo"] polygon[data-tipo="locale"]').length;
      expect(confronto.getByRole("button", { name: "Differenze" })).toHaveAttribute("aria-pressed", "true");
      expect(container.querySelector("[data-chat-differenze]")).toBeTruthy();
      expect(contaLocali()).toBe(1);
      fireEvent.click(confronto.getByRole("button", { name: "Prima" }));
      expect(contaLocali()).toBe(0);
      fireEvent.click(confronto.getByRole("button", { name: "Dopo" }));
      expect(contaLocali()).toBe(1);
      expect(container.querySelector("[data-chat-differenze]")).toBeNull();
      fireEvent.click(confronto.getByRole("button", { name: "Riproduci le modifiche" }));
      expect(container.querySelector("[data-chat-traccia]")).toBeTruthy();
      fireEvent.click(screen.getByRole("button", { name: "Applica alla pianta" }));
      expect(screen.getByRole("heading", { name: "Modifiche applicate · da salvare" })).toHaveFocus();
      expect(archivio.creaPlanimetria).not.toHaveBeenCalled();
      fireEvent.click(screen.getByRole("button", { name: "Annulla applicazione" }));
      expect(contaLocali()).toBe(0);
      expect(chat).toHaveFocus();
    } finally {
      vi.useRealTimers();
    }
  });

  it("distingue il pavimento comune dalle finiture proprie della stanza", async () => {
    const doc = { ...structuredClone(bilocale), materialiProgetto: { fatto: { pavimento: pavimentoDaCampione("rovere") } } };
    monta(<EditorConSalvataggio companyId="azienda-1" titoloPagina="Disegna una pianta" indietro="/x" iniziale={doc as never} />, "/n", "/n");
    fireEvent.click(vocePanello("Soggiorno"));
    expect(await screen.findByText("Pavimento comune del progetto")).toBeTruthy();
    expect(screen.queryByRole("combobox", { name: "Finitura pavimento" })).toBeNull();
    expect(screen.getByRole("combobox", { name: "Finitura pareti" })).toBeTruthy();
  });

  it("dopo l'arredo automatico una nuova stanza mostra i propri dettagli", async () => {
    monta(<EditorConSalvataggio companyId="azienda-1" titoloPagina="Disegna una pianta" indietro="/x" iniziale={bilocale as never} />, "/n", "/n");
    fireEvent.click(vocePanello("Soggiorno"));
    fireEvent.click(await screen.findByRole("button", { name: "Arreda con un clic" }));
    expect(screen.getByRole("button", { name: "Deseleziona (Esc)" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Scrivi le misure" }));
    fireEvent.change(screen.getByLabelText("Nome (facoltativo)"), { target: { value: "Nuova stanza QA" } });
    fireEvent.change(screen.getByLabelText("Larghezza (m)"), { target: { value: "3" } });
    fireEvent.change(screen.getByLabelText("Lunghezza (m)"), { target: { value: "4" } });
    fireEvent.click(screen.getByRole("button", { name: "Aggiungi la stanza" }));
    expect((await screen.findByLabelText("Nome della stanza") as HTMLInputElement).value).toBe("Nuova stanza QA");
    expect(screen.queryByRole("button", { name: "Deseleziona (Esc)" })).toBeNull();
  });

  it("Indietro lascia aperto il disegno quando si annulla l'uscita con modifiche non salvate", async () => {
    const conferma = vi.spyOn(window, "confirm").mockReturnValue(false);
    monta(<EditorConSalvataggio companyId="azienda-1" titoloPagina="Disegna una pianta" indietro="/x" iniziale={bilocale as never} />, "/n", "/n");
    fireEvent.click(screen.getByRole("link", { name: "Indietro" }));
    expect(conferma).toHaveBeenCalledOnce();
    expect(screen.getByText("Disegna una pianta")).toBeTruthy();
    conferma.mockRestore();
  });

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
    monta(<RenderPlanimetriaNuova />, "/azienda/planimetrie/nuova?da=testo", "/azienda/planimetrie/nuova");
    fireEvent.change(screen.getByLabelText("Com'è la casa?"), { target: { value: "Bilocale di 50 mq con bagno e camera" } });
    fireEvent.click(screen.getByRole("button", { name: /Ricava la pianta/ }));
    expect(await screen.findByText(/Editor · Da una descrizione/)).toBeTruthy();
    expect(screen.getByRole("heading", {name:"Nuova planimetria"})).toBeTruthy();
    expect(archivio.invoke).toHaveBeenCalledWith("planimetria-genera", { body: expect.objectContaining({ company_id: "azienda-1", ingresso: "descrizione" }) });
    expect(screen.getByText("Controlla le misure del bagno.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Salva/ }));
    await waitFor(() => expect(archivio.creaPlanimetria).toHaveBeenCalled());
    expect(archivio.creaPlanimetria.mock.calls[0][0]).toMatchObject({ titolo: "Bilocale di esempio", origine: "ai_testo" });
  });

  it("dal sopralluogo: le misure dettate vanno all'AI come «rilievo» e la pianta si apre nell'editor", async () => {
    archivio.invoke.mockResolvedValue({
      data: {
        success: true,
        planimetria: bilocale,
        origine_versione: "sopralluogo",
        generazione: { ingresso: "rilievo", scala: { metodo: "in_metri", cm_per_unita: 1, da_confermare: false }, avvisi: [], sorgente_path: null, sfondo_dxf: null, superfici_scritte: {} },
      },
      error: null,
    });
    monta(<RenderPlanimetriaNuova />, "/azienda/planimetrie/nuova?da=sopralluogo", "/azienda/planimetrie/nuova");
    expect(screen.getByRole("link",{name:/Dal sopralluogo/})).toHaveAttribute("aria-current","page");
    fireEvent.change(screen.getByLabelText("Le misure, stanza per stanza"), { target: { value: "Cucina 3,20 per 4,10\nBagno 2,10 x 2,40" } });
    fireEvent.click(screen.getByRole("button", { name: /Ricava la pianta/ }));
    expect(await screen.findByText(/Editor · Dal sopralluogo/)).toBeTruthy();
    expect(archivio.invoke).toHaveBeenCalledWith("planimetria-genera", { body: expect.objectContaining({ ingresso: "rilievo", testo: "Cucina 3,20 per 4,10\nBagno 2,10 x 2,40" }) });
  });

  it("crediti finiti: frase semplice e «Disegnala a mano»", async () => {
    const risposta = new Response(JSON.stringify({ success: false, codice: "crediti", messaggio: "Crediti AI esauriti" }), { status: 402 });
    archivio.invoke.mockResolvedValue({ data: null, error: Object.assign(new Error("non-2xx"), { context: risposta }) });
    monta(<RenderPlanimetriaNuova />, "/azienda/planimetrie/nuova?da=testo", "/azienda/planimetrie/nuova");
    fireEvent.change(screen.getByLabelText("Com'è la casa?"), { target: { value: "Trilocale di 75 mq" } });
    fireEvent.click(screen.getByRole("button", { name: /Ricava la pianta/ }));
    const avviso = await screen.findByRole("alert");
    expect(avviso.textContent).toMatch(/crediti AI sono finiti/);
    expect(screen.getByRole("link", { name: /Disegnala a mano/ })).toBeTruthy();
  });
});


it("salvataggio pianta: una sola creazione e disegno/nome bloccati finché risponde", async () => {
  let finish!: (id: string) => void;
  archivio.creaPlanimetria.mockImplementationOnce(() => new Promise<string>(resolve => { finish = resolve; }));
  monta(<EditorConSalvataggio companyId="azienda-1" titoloPagina="Disegna una pianta" indietro="/x" iniziale={bilocale as never} />, "/n", "/n");
  fireEvent.change(screen.getByLabelText("Nome della pianta"), { target: { value: "Pianta demo" } });
  const salva = screen.getByRole("button", { name: "Salva" });
  act(() => { fireEvent.click(salva); fireEvent.click(salva); });
  await waitFor(() => expect(archivio.creaPlanimetria).toHaveBeenCalledTimes(1));
  expect(screen.getByLabelText("Nome della pianta")).toBeDisabled();
  expect(screen.queryByRole("button", { name: "Scrivi le misure" })).toBeNull();
  expect(screen.queryByText("Scheda della pianta")).toBeNull();
  await act(async () => finish("nuova-protetta"));
  expect(await screen.findByText("Scheda della pianta")).toBeInTheDocument();
});

it("salvataggio pianta: errore e retry conservano nome e disegno", async () => {
  archivio.creaPlanimetria.mockRejectedValueOnce(new Error("offline")).mockResolvedValueOnce("nuova-retry");
  monta(<EditorConSalvataggio companyId="azienda-1" titoloPagina="Disegna una pianta" indietro="/x" iniziale={bilocale as never} />, "/n", "/n");
  fireEvent.change(screen.getByLabelText("Nome della pianta"), { target: { value: "Pianta da conservare" } });
  fireEvent.click(screen.getByRole("button", { name: "Salva" }));
  await waitFor(() => expect(screen.getByLabelText("Nome della pianta")).toBeEnabled());
  expect(screen.getByLabelText("Nome della pianta")).toHaveValue("Pianta da conservare");
  expect(screen.getByRole("button", { name: "Scrivi le misure" })).toBeInTheDocument();
  expect(screen.queryByText("Scheda della pianta")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Salva" }));
  expect(await screen.findByText("Scheda della pianta")).toBeInTheDocument();
  expect(archivio.creaPlanimetria).toHaveBeenCalledTimes(2);
  const [prima, seconda] = archivio.creaPlanimetria.mock.calls;
  expect(seconda[0].documento).toEqual(prima[0].documento);
});
