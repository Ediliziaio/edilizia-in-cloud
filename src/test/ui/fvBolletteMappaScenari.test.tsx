import "@testing-library/jest-dom/vitest";
import { useState } from "react";
import { Blob as NodeBlob, File as NodeFile } from "node:buffer";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { changeFormControl } from "@/test/helpers/changeFormControl";
import { FvBolletteConsumi } from "@/components/fotovoltaico/FvBolletteConsumi";
import { FvMappaTetto } from "@/components/fotovoltaico/FvMappaTetto";
import {
  FvProfiloEnergetico,
  FvScenariEnergia,
} from "@/components/fotovoltaico/FvScenariEnergia";
import {
  type AnalisiConsumiFv,
  analisiConsumiIniziale,
  datiBollettaVuoti,
} from "../../../supabase/functions/_shared/fvBollette";
import {
  areaPoligono,
  creaDisegnoTetto,
} from "../../../supabase/functions/_shared/fvDisegnoCommerciale";
import { INITIAL } from "@/pages/azienda/fotovoltaico/FotovoltaicoWizard/constants";
const mocks = vi.hoisted(() => ({
  invoke: vi.fn(),
  upload: vi.fn(),
  download: vi.fn(),
}));
vi.mock('@/hooks/useLettureBollettaFv', () => ({ useLettureBollettaFv: () => ({ jobs: [] as never[], errore: '', ora: 0, ricarica: () => {} }) }));
vi.mock(
  "@/integrations/supabase/client",
  () => ({
    supabase: {
      functions: { invoke: mocks.invoke },
      storage: {
        from: () => ({ upload: mocks.upload, download: mocks.download }),
      },
    },
  }),
);
vi.mock(
  "@/hooks/useEffectiveCompanyId",
  () => ({
    useEffectiveCompanyId: () => "10000000-0000-4000-a000-000000000001",
  }),
);
const project = "20000000-0000-4000-a000-000000000001", pod = "IT001E12345678";
const lettura = () => {
  const hash = "a".repeat(64),
    dati = {
      ...datiBollettaVuoti(),
      pod,
      consumo_annuo_kwh: 6000,
      periodo_dal: "2025-01-01",
      periodo_al: "2025-12-31",
      consumo_periodo_kwh: 6000,
      pagine: { consumo_annuo_kwh: 2 },
    };
  return {
    id: hash + ":0",
    hash,
    nome: "Esempio bolletta.pdf",
    path: `10000000-0000-4000-a000-000000000001/${project}/${hash}.pdf`,
    mime: "application/pdf",
    dati,
    estratti: structuredClone(dati),
    confermato: true,
    pagine_totali: 3,
    pagine_non_lette: [] as number[],
    metodo: "ai" as const,
  };
};
beforeEach(() => {
  vi.clearAllMocks();
  URL.createObjectURL = vi.fn(() => "blob:bolletta-test");
  URL.revokeObjectURL = vi.fn();
  mocks.download.mockResolvedValue({
    data: new NodeBlob(["PDF test"]),
    error: null,
  });
  mocks.upload.mockResolvedValue({ data: {}, error: null });
  mocks.invoke.mockResolvedValue({
    data: null,
    error: Error("Servizio temporaneamente non disponibile"),
  });
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
function Bollette({
  iniziale = analisiConsumiIniziale(),
  readOnly = false,
  onApplica = vi.fn(),
}: {
  iniziale?: AnalisiConsumiFv;
  readOnly?: boolean;
  onApplica?: (r: { consumo: number; costoEvitabile: number | null }) => void;
}) {
  const [a, setA] = useState(iniziale);
  return (
    <>
      <output aria-label="Numero letture">{a.documenti.length}</output>
      <FvBolletteConsumi
        progettoId={project}
        value={a}
        azienda={false}
        modificabile={!readOnly}
        onChange={setA}
        onApplica={onApplica}
        onIndirizzo={vi.fn()}
      />
    </>
  );
}
describe("Revisione bollette nelle schermate dell'operatore", () => {
  it("permette l'inserimento manuale separando prezzo evitabile e quote fisse", () => {
    const applica = vi.fn();
    render(<Bollette onApplica={applica} />);
    for (
      const [label, value] of [
        ["Consumo annuo confermato (kWh)", "6000"],
        ["Spesa annua ricorrente confermata (€)", "1800"],
        ["Quote fisse annue che restano (€)", "360"],
        ["Costi annui proporzionali evitabili (€)", "1440"],
      ]
    ) changeFormControl(screen.getByLabelText(label), { target: { value } });
    fireEvent.click(
      screen.getByRole("button", {
        name: "Conferma e usa questi dati",
      }),
    );
    expect(applica).toHaveBeenCalledWith({
      consumo: 6000,
      costoEvitabile: .24,
    });
  });
  it("mostra il file e la pagina di origine accanto ai dati modificabili", async () => {
    const a = {
      ...analisiConsumiIniziale(),
      podSelezionato: pod,
      documenti: [lettura()],
    };
    render(<Bollette iniziale={a} />);
    fireEvent.click(screen.getByText(/Controlla i documenti e i dati letti/));
    await waitFor(() =>
      expect(screen.getByTitle("Bolletta Esempio bolletta.pdf"))
        .toHaveAttribute("src", "blob:bolletta-test#page=1")
    );
    fireEvent.click(screen.getByRole("button", { name: "pagina 2" }));
    expect(screen.getByTitle("Bolletta Esempio bolletta.pdf")).toHaveAttribute(
      "src",
      "blob:bolletta-test#page=2",
    );
    changeFormControl(screen.getByLabelText("Consumo annuo dichiarato (kWh)"), {
      target: { value: "6500" },
    });
    expect(screen.getByText(/Corretto dall’operatore · estratto: 6000/))
      .toBeTruthy();
    expect(
      screen.getByRole("button", {
        name: "Conferma i dati di questa bolletta",
      }),
    ).toBeTruthy();
  });
  it("conferma la lettura automatica con una sola azione e senza compilare quattro campi", () => {
    const d = lettura();
    d.confermato = false;
    d.dati = { ...d.dati, totale_da_pagare: 1800, quote_fisse: 360 };
    const applica = vi.fn();
    render(
      <Bollette
        iniziale={{
          ...analisiConsumiIniziale(),
          podSelezionato: pod,
          documenti: [d],
        }}
        onApplica={applica}
      />,
    );
    const summary = screen.getByLabelText(
      "Riepilogo automatico della bolletta",
    );
    expect(summary).toHaveTextContent(/1\.?800/);
    expect(summary).toHaveTextContent("0,24");
    expect(
      screen.getByLabelText("Consumo annuo confermato (kWh)").closest(
        "details",
      ),
    ).not.toHaveAttribute("open");
    fireEvent.click(
      screen.getByRole("button", { name: "Conferma e usa questi dati" }),
    );
    expect(applica).toHaveBeenCalledWith({
      consumo: 6000,
      costoEvitabile: .24,
    });
    expect(screen.getByRole("status", { name: "" })).toHaveTextContent(
      "Dati pronti",
    );
  });
  it("propone il solo POD selezionato e mantiene esplicita la proiezione parziale", () => {
    const d = lettura();
    d.confermato = false;
    d.dati = {
      ...d.dati,
      consumo_annuo_kwh: null,
      periodo_al: "2025-02-28",
      consumo_periodo_kwh: 1000,
      totale_da_pagare: 300,
      quote_fisse: 60,
    };
    render(
      <Bollette
        iniziale={{
          ...analisiConsumiIniziale(),
          podSelezionato: pod,
          documenti: [d],
        }}
      />,
    );
    expect(screen.getByRole("button", { name: "Conferma e usa questi dati" }))
      .toBeDisabled();
    fireEvent.click(
      screen.getByLabelText("Confermo l’uso della proiezione annua indicativa"),
    );
    expect(screen.getByRole("button", { name: "Conferma e usa questi dati" }))
      .toBeEnabled();
  });
  it("conserva le correzioni aggiungendo una bolletta", async () => {
    const a = analisiConsumiIniziale();
    a.correzioni = { consumoAnnuo: 7200, costiEvitabiliAnnui: 1440 };
    const file = new NodeFile(["bolletta nuova"], "nuova.pdf", {
      type: "application/pdf",
    });
    mocks.invoke.mockImplementation(
      async (_name: string, o: { body: { path: string } }) => {
        const hash = o.body.path.split("/").pop()!.split(".")[0], d = lettura();
        return {
          data: {
            documenti: [{
              ...d,
              id: hash + ":0",
              hash,
              path: o.body.path,
              confermato: false,
            }],
          },
          error: null,
        };
      },
    );
    render(<Bollette iniziale={a} />);
    fireEvent.change(screen.getByLabelText("Scegli bollette"), {
      target: { files: [file] },
    });
    await waitFor(() =>
      expect(screen.getByLabelText("Numero letture")).toHaveTextContent("1")
    );
    expect(screen.getByLabelText("Consumo annuo confermato (kWh)")).toHaveValue(
      7200,
    );
    expect(screen.getByLabelText("Costi annui proporzionali evitabili (€)"))
      .toHaveValue(1440);
  });
  it("non invia file troppo grandi o di formato non ammesso", async () => {
    render(<Bollette />);
    fireEvent.change(screen.getByLabelText("Scegli bollette"), {
      target: {
        files: [
          new NodeFile(["x"], "file.exe", { type: "application/octet-stream" }),
        ],
      },
    });
    expect(screen.getByRole("alert")).toHaveTextContent("20 MB");
    expect(mocks.upload).not.toHaveBeenCalled();
    expect(mocks.invoke).not.toHaveBeenCalled();
  });
  it("un blocco credito resta leggibile e lascia disponibile la compilazione manuale", async () => {
    mocks.invoke.mockResolvedValue({
      data: null,
      error: {
        message: "non-2xx",
        context: new Response(
          JSON.stringify({ error: "Crediti AI esauriti" }),
          { status: 402 },
        ),
      },
    });
    render(<Bollette />);
    fireEvent.change(screen.getByLabelText("Scegli bollette"), {
      target: {
        files: [new NodeFile(["esempio"], "foto.jpg", { type: "image/jpeg" })],
      },
    });
    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent(/Crediti AI esauriti/)
    );
    expect(screen.getByLabelText("Consumo annuo confermato (kWh)")).not
      .toBeDisabled();
    expect(screen.getByLabelText("Numero letture")).toHaveTextContent("0");
  });
  it("rispetta la sola lettura dei preventivi emessi", () => {
    render(<Bollette readOnly />);
    expect(screen.getByRole("button", { name: "Carica bolletta" }))
      .toBeDisabled();
    expect(screen.getByLabelText("Consumo annuo confermato (kWh)"))
      .toBeDisabled();
  });
});
const posizione = { lat: 41.9, lng: 12.5 },
  ricerca = { lat: 41.9002, lng: 12.5002 };
describe("Tetto manuale e mappa indisponibile", () => {
  it("continua con un rettangolo metrico ruotato senza perdere la posizione", async () => {
    const salva = vi.fn();
    render(
      <FvMappaTetto
        ricerca={ricerca}
        indirizzo="Via Esempio 1"
        riferimento={{
          posizione,
          ricerca: { indirizzo: "Via Esempio 1", posizione: ricerca },
        }}
        piano={null}
        modificabile
        onPosizione={vi.fn()}
        onChange={salva}
      />,
    );
    await waitFor(() =>
      expect(screen.getByText(/Collegamento alla mappa non disponibile/)).toBeTruthy()
    );
    fireEvent.click(screen.getByText("Rettangolo rapido e misure precise"));
    changeFormControl(screen.getByLabelText("Rotazione rettangolo falda"), {
      target: { value: "35" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Aggiungi rettangolo ruotato" }),
    );
    fireEvent.click(
      screen.getByRole("button", {
        name: "Usa falde e prepara nuova disposizione",
      }),
    );
    expect(salva).toHaveBeenCalledTimes(1);
    const p = salva.mock.calls[0][0];
    expect(p.mappa.origine).toEqual(posizione);
    expect(p.mappa.ricerca.posizione).toEqual(ricerca);
    expect(areaPoligono(p.mappa.falde[0].punti)).toBeCloseTo(96, 5);
    expect(p.pannelli).toHaveLength(0);
  });
  it("permette di correggere il pin senza cambiare l'indirizzo cercato", () => {
    const conferma = vi.fn();
    render(
      <FvMappaTetto
        ricerca={ricerca}
        indirizzo="Via Esempio 1"
        riferimento={null}
        piano={null}
        modificabile
        onPosizione={conferma}
        onChange={vi.fn()}
      />,
    );
    changeFormControl(screen.getByLabelText("Pin lat"), {
      target: { value: "41.901" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Conferma tetto" }));
    expect(conferma).toHaveBeenCalledWith({
      posizione: { lat: 41.901, lng: ricerca.lng },
      ricerca: { indirizzo: "Via Esempio 1", posizione: ricerca },
    });
  });
});
describe("Disegno diretto sulla mappa", () => {
  const pointer = (el: Element, tipo: string, x: number, y: number) => {
    const evento = new MouseEvent(tipo, {
      bubbles: true,
      clientX: x,
      clientY: y,
      button: 0,
    });
    Object.defineProperty(evento, "pointerId", { value: 1 });
    fireEvent(el, evento);
  };
  const preparaMappa = () => {
    const el = screen.getByRole("group", {
      name: "Mappa satellitare: scegli il tetto o disegna una falda",
    });
    vi.spyOn(el, "getBoundingClientRect").mockReturnValue({
      x: 0,
      y: 0,
      left: 0,
      top: 0,
      right: 640,
      bottom: 440,
      width: 640,
      height: 440,
      toJSON: () => ({}),
    });
    Object.defineProperty(el, "setPointerCapture", {
      value: vi.fn(),
      configurable: true,
    });
    return el;
  };
  it("chiude il contorno sul primo vertice e conserva la geometria dopo aver spostato la vista", async () => {
    const salva = vi.fn();
    render(
      <FvMappaTetto
        ricerca={ricerca}
        indirizzo="Via Esempio 1"
        riferimento={{
          posizione,
          ricerca: { indirizzo: "Via Esempio 1", posizione: ricerca },
        }}
        piano={null}
        modificabile
        onPosizione={vi.fn()}
        onChange={salva}
      />,
    );
    const el = preparaMappa();
    fireEvent.click(screen.getByRole("button", { name: "Disegna falda" }));
    for (const [x, y] of [[280, 180], [360, 180], [360, 260], [280, 180]]) {
      pointer(el, "pointerdown", x, y);
    }
    expect(
      screen.getByRole("button", {
        name: "Usa falde e prepara nuova disposizione",
      }),
    ).toBeEnabled();
    const prima = el.querySelector("polygon")!.getAttribute("points");
    fireEvent.click(screen.getByRole("button", { name: "Sposta mappa" }));
    pointer(el, "pointerdown", 300, 200);
    pointer(el, "pointermove", 400, 200);
    pointer(el, "pointerup", 400, 200);
    expect(el.querySelector("polygon")!.getAttribute("points")).not.toBe(prima);
    fireEvent.click(
      screen.getByRole("button", {
        name: "Usa falde e prepara nuova disposizione",
      }),
    );
    expect(salva).toHaveBeenCalledTimes(1);
    const p = salva.mock.calls[0][0];
    expect(p.mappa.origine).toEqual(posizione);
    expect(p.mappa.falde[0].punti).toHaveLength(3);
    expect(areaPoligono(p.mappa.falde[0].punti)).toBeGreaterThan(1);
  });
  it("annulla il tracciamento da tastiera senza cancellare le falde confermate", () => {
    render(
      <FvMappaTetto
        ricerca={ricerca}
        indirizzo="Via Esempio 1"
        riferimento={{
          posizione,
          ricerca: { indirizzo: "Via Esempio 1", posizione: ricerca },
        }}
        piano={null}
        modificabile
        onPosizione={vi.fn()}
        onChange={vi.fn()}
      />,
    );
    const el = preparaMappa();
    fireEvent.click(screen.getByRole("button", { name: "Disegna falda" }));
    pointer(el, "pointerdown", 280, 180);
    pointer(el, "pointerdown", 360, 180);
    fireEvent.keyDown(el, { key: "Backspace" });
    expect(screen.getByText(/1 vertici/)).toBeTruthy();
    fireEvent.keyDown(el, { key: "Escape" });
    expect(screen.getByRole("button", { name: "Seleziona e sposta" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });
});

const listino = {
  pannelli: [{
    id: "p450",
    potenza_w: 450,
    prezzo_vendita: 180,
    larghezza_mm: 1100,
    lunghezza_mm: 1800,
  }],
  inverter: [{ id: "inv", prezzo_vendita: 1500, potenza_kw: 8 }],
  accumuli: [{ id: "acc", prezzo_vendita: 3000, capacita_kwh: 5 }],
};
describe("Scenari della configurazione", () => {
  it("trasferisce quantità e accumulo dalle tre proposte usando la stessa posa", () => {
    const scegli = vi.fn(),
      data = {
        ...INITIAL,
        consumo_annuo_kwh: 6000,
        costo_kwh_attuale: .24,
        pannello_id: "p450",
        inverter_id: "inv",
        ore_sole_annue: 1700,
        layout_overlay: creaDisegnoTetto("due_falde", 12, 8, {
          corto: 1.1,
          lungo: 1.8,
          stimato: false,
        }),
        analisi_consumi: analisiConsumiIniziale(),
      };
    render(
      <FvScenariEnergia
        data={data}
        listino={listino}
        modificabile
        onLayout={vi.fn()}
        onScenario={scegli}
      />,
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Calcola disposizione pannelli" }),
    );
    const cards = screen.getAllByRole("article");
    expect(cards).toHaveLength(3);
    fireEvent.click(
      within(cards.find(c => c.textContent?.includes("Con accumulo"))!).getByRole("button", {
        name: "Usa questa configurazione",
      }),
    );
    const p = scegli.mock.calls[0][0];
    expect(Object.keys(p).sort()).toEqual(
      [
        "layout_overlay",
        "numero_pannelli_scelti",
        "potenza_kwp",
        "con_accumulo",
        "capacita_accumulo_kwh",
        "accumulo_id",
        "analisi_consumi",
        "prezzo_vendita_manuale",
        "prodotti_extra",
      ].sort(),
    );
    expect(p.con_accumulo).toBe(true);
    expect(p.accumulo_id).toBe("acc");
    expect(p.capacita_accumulo_kwh).toBe(5);
    expect(p.numero_pannelli_scelti).toBe(p.layout_overlay.pannelli.length);
    expect(p.potenza_kwp).toBe(p.numero_pannelli_scelti * .45);
    fireEvent.click(
      within(cards.find(c => c.textContent?.includes("Investimento contenuto"))!).getByRole("button", {
        name: "Usa questa configurazione",
      }),
    );
    expect(scegli.mock.calls[1][0].numero_pannelli_scelti)
      .toBeLessThanOrEqual(p.numero_pannelli_scelti);
  });
  it("richiede conferma delle misure stimate prima del conteggio fisico", () => {
    const data = {
      ...INITIAL,
      pannello_id: "p450",
      layout_overlay: creaDisegnoTetto("singola", 12, 8, {
        corto: 1.1,
        lungo: 1.8,
        stimato: true,
      }),
    };
    render(
      <FvScenariEnergia
        data={data}
        listino={listino}
        modificabile
        onLayout={vi.fn()}
        onScenario={vi.fn()}
      />,
    );
    expect(
      screen.getByRole("button", { name: "Calcola disposizione pannelli" }),
    ).toBeDisabled();
    expect(
      screen.getByRole("button", { name: "Confermo entrambe le dimensioni" }),
    ).toBeTruthy();
  });
});

function ProfiloRapido() {
  const [a, setA] = useState(analisiConsumiIniziale());
  return (
    <>
      <output aria-label="Profilo salvato">{JSON.stringify(a)}</output>
      <FvProfiloEnergetico
        value={a}
        azienda={false}
        modificabile
        consumoAnnuo={6000}
        onChange={setA}
      />
    </>
  );
}
describe("Scelte rapide del commerciale", () => {
  it("imposta orari e giorni insieme, aggiunge e rimuove consumi futuri conservando i totali della bolletta", () => {
    render(<ProfiloRapido />);
    changeFormControl(screen.getByLabelText("Utilizzo rapido dell’energia"), {
      target: { value: "ufficio" },
    });
    let a = JSON.parse(screen.getByLabelText("Profilo salvato").textContent!);
    expect(a.profilo.giorni).toEqual([1, 2, 3, 4, 5]);
    expect(a.profilo.oraInizio).toBe(8);
    expect(a.profilo.oraFine).toBe(18);
    fireEvent.click(screen.getByRole("button", { name: /Auto elettrica/ }));
    a = JSON.parse(screen.getByLabelText("Profilo salvato").textContent!);
    expect(a.profilo.aumentoConsumiPct).toBe(30);
    expect(a.correzioni).toEqual({});
    expect(screen.getByText(/Consumo futuro:/)).toBeTruthy();
    changeFormControl(
      screen.getByLabelText("Consumo aggiuntivo Auto elettrica 1"),
      { target: { value: "1200" } },
    );
    a = JSON.parse(screen.getByLabelText("Profilo salvato").textContent!);
    expect(a.profilo.aumentoConsumiPct).toBe(20);
    fireEvent.click(
      screen.getByRole("button", { name: "Rimuovi Auto elettrica 1" }),
    );
    a = JSON.parse(screen.getByLabelText("Profilo salvato").textContent!);
    expect(a.profilo.aumentoConsumiPct).toBe(0);
  });
});
