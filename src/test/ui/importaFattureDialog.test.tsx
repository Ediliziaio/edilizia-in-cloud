/**
 * Il popup «Importa fatture» (12/11/2026) provato come lo usa chi importa:
 * più file insieme, uno rotto in mezzo, uno già a sistema, la spunta che
 * esclude — e al momento di importare parte solo quello che è spuntato.
 *
 * Dati inventati: il repository è pubblico.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { ImportaFattureDialog } from "@/components/fatturazione/ImportaFattureDialog";

const MIA_PIVA = "11111111111";
const FORNITORE_PIVA = "22222222222";

function fattura({ numero = "2026/114", data = "2026-03-18", nome = "Edilfornitura Prova Srl" } = {}): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<p:FatturaElettronica versione="FPR12" xmlns:p="http://x">
  <FatturaElettronicaHeader>
    <CedentePrestatore><DatiAnagrafici><IdFiscaleIVA><IdPaese>IT</IdPaese><IdCodice>${FORNITORE_PIVA}</IdCodice></IdFiscaleIVA>
      <Anagrafica><Denominazione>${nome}</Denominazione></Anagrafica></DatiAnagrafici></CedentePrestatore>
    <CessionarioCommittente><DatiAnagrafici><IdFiscaleIVA><IdPaese>IT</IdPaese><IdCodice>${MIA_PIVA}</IdCodice></IdFiscaleIVA>
      <Anagrafica><Denominazione>Impresa Esempio Srl</Denominazione></Anagrafica></DatiAnagrafici></CessionarioCommittente>
  </FatturaElettronicaHeader>
  <FatturaElettronicaBody>
    <DatiGenerali><DatiGeneraliDocumento><TipoDocumento>TD01</TipoDocumento><Data>${data}</Data><Numero>${numero}</Numero>
      <ImportoTotaleDocumento>1220.00</ImportoTotaleDocumento></DatiGeneraliDocumento></DatiGenerali>
    <DatiBeniServizi>
      <DettaglioLinee><NumeroLinea>1</NumeroLinea><Descrizione>Ponteggio</Descrizione><PrezzoTotale>1000.00</PrezzoTotale><AliquotaIVA>22.00</AliquotaIVA></DettaglioLinee>
      <DatiRiepilogo><AliquotaIVA>22.00</AliquotaIVA><ImponibileImporto>1000.00</ImponibileImporto><Imposta>220.00</Imposta></DatiRiepilogo>
    </DatiBeniServizi>
  </FatturaElettronicaBody>
</p:FatturaElettronica>`;
}

/**
 * Quello che il database dice di avere già: la 2026/90 completa del suo XML
 * (è un doppione vero) e la 2026/95 registrata senza file (si importa per
 * attaccarle l'originale).
 */
const finto = vi.hoisted(() => {
  const ricevute: Array<{ cedente_piva: string | null; cedente_cf: string | null; numero_fattura: string; data_fattura: string; xml_url: string | null }> = [
    { cedente_piva: "22222222222", cedente_cf: null, numero_fattura: "2026/90", data_fattura: "2026-02-02", xml_url: "archivio/2026-90.xml" },
    { cedente_piva: "22222222222", cedente_cf: null, numero_fattura: "2026/95", data_fattura: "2026-02-20", xml_url: null },
  ];
  // Tipizzato a mano: il mock deve ricordare il nome della funzione chiamata,
  // perché i test ci leggono dentro (`mock.calls[0][0]`).
  type Risposta = { data: Record<string, unknown> | null; error: { message: string } | null };
  const invoke = vi.fn(async (_nome: string, _opzioni?: unknown): Promise<Risposta> => ({ data: { success: true }, error: null }));
  const rimuovi = vi.fn(async (_percorsi: string[]) => ({ error: null as null }));
  const carica = vi.fn(async (_bucket: string, _percorso: string) => ({ error: null as null }));
  const inserisci = vi.fn(async (_riga: Record<string, unknown>) => ({ error: null as { message: string; code?: string } | null }));
  const tabella = (righe: unknown[]) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const c: any = {};
    for (const m of ["select", "eq", "order", "range", "not", "is"]) c[m] = () => c;
    c.then = (ok: (v: unknown) => unknown, ko: (e: unknown) => unknown) =>
      Promise.resolve({ data: righe, error: null as null }).then(ok, ko);
    return c;
  };
  return { ricevute, invoke, rimuovi, carica, inserisci, tabella };
});

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (t: string) => ({ ...finto.tabella(t === "fatture_ricevute" ? finto.ricevute : []), insert: finto.inserisci }),
    functions: { invoke: finto.invoke },
    storage: {
      from: (bucket: string) => ({
        upload: (percorso: string) => finto.carica(bucket, percorso),
        remove: finto.rimuovi,
      }),
    },
  },
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() } }));

beforeEach(() => {
  finto.invoke.mockReset();
  finto.invoke.mockImplementation(async () => ({ data: { success: true }, error: null }));
  finto.rimuovi.mockClear();
  finto.carica.mockClear();
  finto.inserisci.mockClear();
});
afterEach(cleanup);

/** In jsdom `input.files` non si scrive con fireEvent: va messo sull'elemento. */
function scegli(scelti: File[]) {
  const input = screen.getByLabelText("Scegli i file da importare") as HTMLInputElement;
  Object.defineProperty(input, "files", { value: scelti, configurable: true });
  fireEvent.change(input);
}
function files(...f: File[]): File[] {
  return f;
}

const xmlFile = (nome: string, contenuto: string) => new File([contenuto], nome, { type: "text/xml" });

function apri() {
  return render(
    <ImportaFattureDialog
      aperto
      companyId="11111111-1111-1111-1111-111111111111"
      partitaIvaAzienda={MIA_PIVA}
      onChiudi={vi.fn()}
      onImportate={vi.fn()}
    />,
  );
}

describe("Popup «Importa fatture»", () => {
  it("prende più file insieme, mostra nome peso e tipo, e ne lascia togliere uno", async () => {
    apri();
    expect(screen.getByTestId("area-trascinamento")).toBeInTheDocument();
    scegli(files(xmlFile("a.xml", fattura()), xmlFile("b.xml", fattura({ numero: "2026/115" })), new File(["%PDF-"], "c.pdf", { type: "application/pdf" })));

    expect(await screen.findByText("a.xml")).toBeInTheDocument();
    expect(screen.getByText("c.pdf")).toBeInTheDocument();
    expect(screen.getAllByText("XML di fattura")).toHaveLength(2);
    expect(screen.getByText("PDF")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Leggi 3 file/ })).toBeEnabled();

    fireEvent.click(screen.getByRole("button", { name: "Togli c.pdf" }));
    expect(screen.queryByText("c.pdf")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Leggi 2 file/ })).toBeInTheDocument();
  });

  it("legge i file: la buona è spuntata coi suoi dati, la rotta è in errore, la già presente parte spenta", async () => {
    apri();
    scegli(files(
      xmlFile("buona.xml", fattura()),
      xmlFile("rotta.xml", "<Ordine><Riga/></Ordine>"),
      xmlFile("gia.xml", fattura({ numero: "2026/90", data: "2026-02-02" })),
    ));
    fireEvent.click(await screen.findByRole("button", { name: /Leggi 3 file/ }));

    const buona = await screen.findByRole("checkbox", { name: "Importa buona.xml" });
    expect(buona).toBeChecked();
    expect(screen.getByText(/2026\/114/)).toBeInTheDocument();
    expect(screen.getAllByText("Edilfornitura Prova Srl").length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Imponibile.*1\.000.*IVA.*220.*Totale/s).length).toBe(2);

    expect(screen.getByRole("checkbox", { name: "Importa rotta.xml" })).toBeDisabled();
    expect(screen.getByText(/non e' una fattura elettronica/i)).toBeInTheDocument();

    expect(screen.getByRole("checkbox", { name: "Importa gia.xml" })).not.toBeChecked();
    expect(screen.getByText("già a sistema")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Importa 1 fattura$/ })).toBeEnabled();
    expect(screen.getByText(/per 1\.220,00\s*€ in tutto/)).toBeInTheDocument();
    // Il totale dice a colpo d'occhio quanto vale quello che si sta per importare.
    expect(screen.getByText(/per 1\.220,00\s*€ in tutto/)).toBeInTheDocument();
  });

  it("la spunta decide: tolta quella buona non si importa niente; rimessa parte solo lei", async () => {
    apri();
    scegli(files(xmlFile("buona.xml", fattura()), xmlFile("gia.xml", fattura({ numero: "2026/90", data: "2026-02-02" }))));
    fireEvent.click(await screen.findByRole("button", { name: /Leggi 2 file/ }));

    const buona = await screen.findByRole("checkbox", { name: "Importa buona.xml" });
    fireEvent.click(buona);
    await waitFor(() => expect(screen.getByRole("button", { name: "Importa" })).toBeDisabled());

    fireEvent.click(screen.getByRole("checkbox", { name: "Importa buona.xml" }));
    fireEvent.click(await screen.findByRole("button", { name: /Importa 1 fattura$/ }));

    await waitFor(() => expect(finto.invoke).toHaveBeenCalledTimes(1));
    expect(finto.invoke.mock.calls[0][0]).toBe("ricevi-sdi");
    expect(await screen.findByText("1 importata")).toBeInTheDocument();
  });

  it("un errore su una fattura non ferma le altre, e il riepilogo dice quale e perché", async () => {
    finto.invoke
      .mockImplementationOnce(async () => ({ data: null, error: { message: "Numero già presente" } as never }))
      .mockImplementationOnce(async () => ({ data: { success: true }, error: null }));
    apri();
    scegli(files(xmlFile("prima.xml", fattura()), xmlFile("seconda.xml", fattura({ numero: "2026/115" }))));
    fireEvent.click(await screen.findByRole("button", { name: /Leggi 2 file/ }));
    fireEvent.click(await screen.findByRole("button", { name: /Importa 2 fatture$/ }));

    expect(await screen.findByText("1 importata")).toBeInTheDocument();
    expect(screen.getByText("1 non riuscite")).toBeInTheDocument();
    const esito = screen.getByText("Numero già presente").closest("div")!;
    expect(within(esito).getByText("prima.xml")).toBeInTheDocument();
  });
});

describe("Popup «Importa fatture» — le fatture da completare", () => {
  it("quella registrata senza il suo file parte spuntata, con scritto perché", async () => {
    apri();
    scegli(files(xmlFile("senza-file.xml", fattura({ numero: "2026/95", data: "2026-02-20" }))));
    fireEvent.click(await screen.findByRole("button", { name: /Leggi 1 file/ }));

    expect(await screen.findByRole("checkbox", { name: "Importa senza-file.xml" })).toBeChecked();
    expect(screen.getByText("da completare")).toBeInTheDocument();
    expect(screen.getByText(/le si attacca l'originale/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Importa 1 fattura$/ })).toBeEnabled();
  });
});

describe("Popup «Importa fatture» — i PDF", () => {
  it("il PDF letto dall'AI compare con i suoi dati; quello illeggibile resta fuori con il motivo", async () => {
    finto.invoke.mockImplementation(async (nome: string) => {
      if (nome !== "ai-fattura-ricevuta-ocr") return { data: { success: true }, error: null };
      const quante = finto.invoke.mock.calls.filter((c) => c[0] === "ai-fattura-ricevuta-ocr").length;
      return quante === 1
        ? { data: { ok: true, extracted: { numero_fattura: "A/7", data_fattura: "2026-05-04", cedente: { ragione_sociale: "Serramenti Prova Srl" }, imponibile_totale: 500, iva_totale: 110, totale_documento: 610 } }, error: null }
        : { data: { ok: true, extracted: { numero_fattura: null, data_fattura: null } }, error: null };
    });
    apri();
    scegli(files(new File(["%PDF-leggibile"], "buono.pdf", { type: "application/pdf" }), new File(["%PDF-storto"], "storto.pdf", { type: "application/pdf" })));
    expect(await screen.findByText(/li legge l'AI/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Leggi 2 file/ }));

    expect(await screen.findByRole("checkbox", { name: "Importa buono.pdf" })).toBeChecked();
    expect(screen.getByText(/A\/7/)).toBeInTheDocument();
    expect(screen.getByText("Serramenti Prova Srl")).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: "Importa storto.pdf" })).toBeDisabled();
    expect(screen.getByText(/non ha ricavato numero e data/)).toBeInTheDocument();
    // Il file caricato solo per la lettura non resta nello storage.
    expect(finto.rimuovi).toHaveBeenCalled();

    // Importandolo, il PDF va dove stanno le altre fatture da PDF, non nel
    // bucket di passaggio che serve solo all'AI.
    fireEvent.click(screen.getByRole("button", { name: /Importa 1 fattura$/ }));
    expect(await screen.findByText("1 importata")).toBeInTheDocument();
    const bucketUsati = finto.carica.mock.calls.map((c) => c[0]);
    expect(bucketUsati).toContain("documenti-smart");
    expect(bucketUsati).toContain("documenti-fiscali");
    const riga = finto.inserisci.mock.calls[0][0];
    expect(riga.pdf_storage_bucket).toBe("documenti-fiscali");
    expect(riga.cedente_paese).toBe("IT");
    expect(String(riga.pdf_storage_path)).toMatch(/ricevute-pdf/);
    // Finito l'import, il passaggio in documenti-smart viene ripulito.
    expect(finto.rimuovi.mock.calls.some((c) => c[0].some((x) => x.includes("import-fatture")))).toBe(true);
  });
});

describe("Popup «Importa fatture» — quello che non si deve perdere", () => {
  it("non si chiude mentre importa, e il PDF letto ma non importato non resta nello storage", async () => {
    const chiudi = vi.fn();
    let sblocca: (() => void) | null = null;
    finto.invoke.mockImplementation(async (nome: string) => {
      if (nome === "ai-fattura-ricevuta-ocr") {
        return { data: { ok: true, extracted: { numero_fattura: "B/1", data_fattura: "2026-06-01", cedente: { ragione_sociale: "Ferramenta Prova Srl" }, imponibile_totale: 100, iva_totale: 22, totale_documento: 122 } }, error: null };
      }
      await new Promise<void>((ok) => { sblocca = ok; });
      return { data: { success: true }, error: null };
    });
    render(
      <ImportaFattureDialog aperto companyId="11111111-1111-1111-1111-111111111111" partitaIvaAzienda={MIA_PIVA}
        onChiudi={chiudi} onImportate={vi.fn()} />,
    );
    scegli(files(xmlFile("buona.xml", fattura()), new File(["%PDF"], "scartato.pdf", { type: "application/pdf" })));
    fireEvent.click(await screen.findByRole("button", { name: /Leggi 2 file/ }));

    // Il PDF è leggibile ma lo escludo a mano: il suo file non deve restare.
    const pdf = await screen.findByRole("checkbox", { name: "Importa scartato.pdf" });
    expect(pdf).toBeChecked();
    fireEvent.click(pdf);
    fireEvent.click(screen.getByRole("button", { name: /Importa 1 fattura$/ }));

    // Mentre lavora, la X non chiude niente.
    expect(await screen.findByText(/Importazione 0 di 1/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Chiudi" }));
    expect(chiudi).not.toHaveBeenCalled();

    sblocca!();
    expect(await screen.findByText("1 importata")).toBeInTheDocument();
    await waitFor(() => expect(finto.rimuovi).toHaveBeenCalled());
    expect(finto.rimuovi.mock.calls.at(-1)![0][0]).toMatch(/import-fatture/);
  });
});
