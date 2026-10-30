import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AllegatoVendita } from "@/hooks/useGeneraleVendita";
import type { DatiListino, DatiSchedaVendita } from "@/lib/orders/generali/vendita";
import type { UnitaGenerale } from "@/lib/orders/generali/unita";

/**
 * Il modulo unità come strumento di vendita (30/10/2026): planimetria e foto nel pannello
 * dell'unità, «Carica planimetria» se manca, la scheda vendita e il listino che si scaricano.
 */
const m = vi.hoisted(() => ({
  file: null as null | { planimetria: AllegatoVendita[]; capitolato: AllegatoVendita[]; foto: AllegatoVendita[] },
  carica: vi.fn(),
  apri: vi.fn(),
  scarica: vi.fn(),
  /** I dati passati al PDF: quello che finirebbe sulla carta. */
  dati: null as unknown,
  excel: vi.fn(),
}));

vi.mock("@/hooks/useGeneraleVendita", () => ({
  useFileVenditaUnita: () => ({ file: m.file, voci: [] as unknown[], isLoading: false, isError: false, refetch: vi.fn() }),
  useAnteprimaAllegato: (a: AllegatoVendita) => ({ data: `blob:${a.id}`, isLoading: false }),
  immaginePerScheda: async (a: AllegatoVendita) => `data:image/jpeg;base64,${a.id}`,
}));
vi.mock("@/hooks/useGeneraleDocumenti", () => ({
  useCaricaDocumentoVoce: () => ({ mutate: m.carica, isPending: false }),
  messaggioDocumenti: (_e: unknown, f: string) => f,
}));
vi.mock("@/hooks/useGeneraleRendiconto", () => ({
  useAziendaDossier: () => ({ data: { nome: "Edil Srl", partitaIva: "0123", indirizzo: "Via Po 1", email: "v@edil.it", telefono: "011", logo: null as string | null } }),
}));
vi.mock("@/components/orders/filePreviewUtils", () => ({ openAttachmentInTab: m.apri }));
vi.mock("@/components/orders/generali/vendita/scarica", () => ({ scaricaBlob: m.scarica }));
vi.mock("@react-pdf/renderer", () => ({
  pdf: (el: { props: { d: unknown } }) => {
    m.dati = el.props.d;
    return { toBlob: async () => new Blob(["%PDF-"]) };
  },
}));
vi.mock("@/components/orders/generali/vendita/VenditaPDF", () => ({ SchedaVenditaPDF: (): null => null, ListinoPDF: (): null => null }));
vi.mock("@/lib/orders/generali/venditaExcel", () => ({ creaExcelListino: m.excel, TIPO_XLSX: "xlsx" }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() } }));

import { BottoneListino } from "@/components/orders/generali/vendita/BottoneListino";
import { MaterialeUnita } from "@/components/orders/generali/vendita/MaterialeUnita";
import { SchedaVendita } from "@/components/orders/generali/vendita/SchedaVendita";

const allegato = (id: string, file_name: string): AllegatoVendita => ({
  id, order_id: "o-A1", file_name, file_url: `orders/o-A1/${file_name}`, file_type: null, created_at: "2026-11-01T10:00:00Z", thumb_path: null,
});
const unita = (sigla: string, over: Partial<UnitaGenerale> = {}): UnitaGenerale => ({
  orderId: `o-${sigla}`, codice: null, nome: sigla, scheda: true, id: `u-${sigla}`, sigla, edificio: null, piano: "1", tipologia: "Trilocale",
  mq: 90, millesimi: null, listino: 300000, trattato: null, rogito: null, provvigione: 9000, stato: "libera",
  dataPrenotazione: null, dataCompromesso: null, rogitoPrevisto: null, dataRogito: null, acquirenteId: null, acquirente: null,
  agenzia: null, note: null, origineId: null, divisaIl: null, movimenti: [], importoCommessa: 300000, costoDiretto: 150000, ...over,
});

beforeEach(() => {
  m.file = { planimetria: [], capitolato: [], foto: [] };
  m.carica.mockReset();
  m.apri.mockReset();
  m.scarica.mockReset();
  m.excel.mockReset().mockResolvedValue(new ArrayBuffer(4));
  m.dati = null;
  try { window.localStorage.clear(); } catch { /* niente */ }
});
afterEach(cleanup);

// Le caselle di spunta di Radix misurano il riquadro: jsdom non ha ResizeObserver.
globalThis.ResizeObserver ??= class { observe() {} unobserve() {} disconnect() {} } as unknown as typeof ResizeObserver;

const scheda = () => m.dati as DatiSchedaVendita;
const listino = () => m.dati as DatiListino;

describe("planimetria e foto nel pannello dell'unità", () => {
  it("manca la planimetria: «Carica planimetria» la mette nell'archivio dell'unità, sulla sua voce", () => {
    render(<MaterialeUnita generaleId="g" modello="sviluppo" orderId="o-A1" sigla="A1" puoCaricare />);
    fireEvent.click(screen.getByRole("button", { name: "Carica planimetria" }));
    const file = new File(["%PDF-"], "pianta A1.pdf", { type: "application/pdf" });
    fireEvent.change(screen.getByLabelText("Scegli il file da caricare"), { target: { files: [file] } });
    expect(m.carica).toHaveBeenCalledWith(
      { orderId: "o-A1", voce: { id: "planimetria", nome: "Planimetria" }, file, scadenza: null },
      expect.anything(),
    );
  });

  it("le foto si aggiungono sulla loro voce", () => {
    render(<MaterialeUnita generaleId="g" modello="sviluppo" orderId="o-A1" sigla="A1" puoCaricare />);
    fireEvent.click(screen.getByRole("button", { name: "Aggiungi foto o render" }));
    const file = new File(["x"], "soggiorno.jpg", { type: "image/jpeg" });
    fireEvent.change(screen.getByLabelText("Scegli il file da caricare"), { target: { files: [file] } });
    expect(m.carica.mock.calls[0][0].voce).toEqual({ id: "foto_render", nome: "Foto o render" });
  });

  it("con la planimetria: si vede in anteprima, si apre toccandola, non si propone di ricaricarla", () => {
    m.file = { planimetria: [allegato("p1", "Planimetria A1.pdf")], capitolato: [], foto: [allegato("f1", "render.jpg"), allegato("f2", "cucina.jpg")] };
    const { container } = render(<MaterialeUnita generaleId="g" modello="sviluppo" orderId="o-A1" sigla="A1" puoCaricare />);
    expect(screen.queryByRole("button", { name: "Carica planimetria" })).toBeNull();
    expect([...container.querySelectorAll("img")].map((i) => i.getAttribute("src"))).toEqual(["blob:p1", "blob:f1", "blob:f2"]);
    fireEvent.click(screen.getByRole("button", { name: "Planimetria: apri Planimetria A1.pdf" }));
    expect(m.apri).toHaveBeenCalledWith("orders/o-A1/Planimetria A1.pdf");
  });

  it("da telefono (o senza permesso) si guarda e si apre, non si carica", () => {
    m.file = { planimetria: [allegato("p1", "Planimetria A1.pdf")], capitolato: [], foto: [] };
    render(<MaterialeUnita generaleId="g" modello="sviluppo" orderId="o-A1" sigla="A1" puoCaricare={false} />);
    expect(screen.getByRole("button", { name: /Planimetria: apri/ })).toBeVisible();
    expect(screen.queryByRole("button", { name: /Carica|Aggiungi/ })).toBeNull();
    expect(screen.queryByLabelText("Scegli il file da caricare")).toBeNull();
  });

  it("niente caricato e niente permesso: lo dice", () => {
    render(<MaterialeUnita generaleId="g" modello="sviluppo" orderId="o-A1" sigla="A1" puoCaricare={false} />);
    expect(screen.getByText("Nessuna planimetria caricata per A1.")).toBeVisible();
  });
});

describe("scheda vendita", () => {
  it("di base senza prezzo; con la planimetria, le foto e il capitolato, che si ricorda per l'operazione", async () => {
    m.file = { planimetria: [allegato("p1", "Planimetria A1.pdf")], capitolato: [], foto: [allegato("f1", "render.jpg")] };
    render(<SchedaVendita generaleId="g" modello="sviluppo" operazione="Residenza Via Roma" unita={unita("A1")} vedeImporti />);
    expect(screen.getByLabelText("Metti il prezzo di listino (300.000 €)")).not.toBeChecked();
    fireEvent.change(screen.getByLabelText(/Capitolato in breve/), { target: { value: "Pavimenti in gres\nClasse A4" } });
    fireEvent.click(screen.getByRole("button", { name: "Scarica la scheda PDF" }));
    await waitFor(() => expect(m.scarica).toHaveBeenCalled());
    expect(m.scarica.mock.calls[0][1]).toMatch(/^Scheda-A1-Residenza-Via-Roma-\d{4}-\d{2}-\d{2}\.pdf$/);
    expect(scheda()).toMatchObject({
      operazione: "Residenza Via Roma",
      prezzo: null,
      planimetria: "data:image/jpeg;base64,p1",
      foto: ["data:image/jpeg;base64,f1"],
      capitolato: ["Pavimenti in gres", "Classe A4"],
    });
    expect(JSON.stringify(scheda())).not.toContain("150000");
    cleanup();
    // Il capitolato è quello di prima, per l'unità dopo.
    render(<SchedaVendita generaleId="g" modello="sviluppo" operazione="Residenza Via Roma" unita={unita("A2")} vedeImporti />);
    expect(screen.getByLabelText(/Capitolato in breve/)).toHaveValue("Pavimenti in gres\nClasse A4");
  });

  it("il prezzo di listino se lo scelgo; senza planimetria non la chiede", async () => {
    render(<SchedaVendita generaleId="g" modello="sviluppo" operazione="Residenza" unita={unita("A1")} vedeImporti />);
    expect(screen.getByLabelText(/Planimetria \(non caricata/)).toBeDisabled();
    fireEvent.click(screen.getByLabelText(/Metti il prezzo di listino/));
    fireEvent.click(screen.getByRole("button", { name: "Scarica la scheda PDF" }));
    await waitFor(() => expect(m.dati).not.toBeNull());
    expect(scheda().prezzo).toBe(300000);
    expect(scheda().planimetria).toBeNull();
  });

  it("chi non vede gli importi non può mettere il prezzo", () => {
    render(<SchedaVendita generaleId="g" modello="sviluppo" operazione="Residenza" unita={unita("A1")} vedeImporti={false} />);
    expect(screen.queryByLabelText(/prezzo/i)).toBeNull();
  });
});

describe("listino disponibilità", () => {
  const elenco = [unita("A1"), unita("A2", { stato: "compromesso", acquirente: "Mario Rossi", trattato: 290000 })];

  it("PDF con i prezzi delle libere, senza acquirenti", async () => {
    render(<BottoneListino generaleId="g" operazione="Residenza" unita={elenco} vedeImporti />);
    fireEvent.click(screen.getByRole("button", { name: "Listino" }));
    expect(screen.getByLabelText("Con i prezzi delle unità libere")).toBeChecked();
    fireEvent.click(screen.getByRole("button", { name: "PDF" }));
    await waitFor(() => expect(m.scarica).toHaveBeenCalled());
    expect(m.scarica.mock.calls[0][1]).toMatch(/^Listino-Residenza-.*\.pdf$/);
    expect(listino().righe.map((r) => [r.sigla, r.prezzo, r.stato])).toEqual([["A1", 300000, "libera"], ["A2", null, "venduta"]]);
    expect(JSON.stringify(listino())).not.toContain("Mario Rossi");
  });

  it("Excel; e chi non vede gli importi lo prepara senza prezzi", async () => {
    render(<BottoneListino generaleId="g" operazione="Residenza" unita={elenco} vedeImporti={false} />);
    fireEvent.click(screen.getByRole("button", { name: "Listino" }));
    expect(screen.queryByLabelText(/Con i prezzi/)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Excel" }));
    await waitFor(() => expect(m.scarica).toHaveBeenCalled());
    expect(m.excel.mock.calls[0][0].conPrezzi).toBe(false);
    expect(m.scarica.mock.calls[0][1]).toMatch(/\.xlsx$/);
  });
});
