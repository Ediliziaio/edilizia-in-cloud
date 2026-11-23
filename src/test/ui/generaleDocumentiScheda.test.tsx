// src/test/ui/generaleDocumentiScheda.test.tsx
// Checklist, matrice per unità e originali di tutta l'operazione.
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  calcolaChecklist, vociDelModello,
  type AllegatoCommessa, type SegnoDocumento,
} from "@/lib/orders/generali/documenti";
import type { FigliaGenerale, RiepilogoGenerale, TotaliGenerale } from "@/lib/orders/commesseGenerali";

const stato = vi.hoisted(() => ({ mobile: false, mutate: vi.fn(), mutateAsync: vi.fn() }));

vi.mock("@/hooks/use-mobile", () => ({ useIsMobile: () => stato.mobile }));
vi.mock("@/hooks/usePermissions", () => ({ usePermissions: () => ({ isAdmin: true, isLoading: false, canViewSettingsOrders: true }) }));
vi.mock("@/hooks/useCartelleDocumenti", () => ({
  useCartelleDocumenti: () => ({
    cartelle: [
      { id: "atti", nome: "Atti", archiviata_at: null as string | null },
      { id: "cert", nome: "Certificazioni", archiviata_at: null as string | null },
    ],
    isLoading: false, isError: false,
  }),
}));
vi.mock("@/components/orders/OrderAttachments", () => ({
  OrderAttachments: ({ orderId, editable, cartellaIniziale }: { orderId: string; editable: boolean; cartellaIniziale?: string }) =>
    <div data-testid="archivio" data-cartella={cartellaIniziale}>{orderId}:{String(editable)}</div>,
}));
vi.mock("@/components/orders/generali/documenti/OriginaleDocumentoDialog", () => ({
  OriginaleDocumentoDialog: ({ file, ambito }: { file: AllegatoCommessa; ambito: string }) =>
    <div role="dialog" aria-label={file.file_name}>{ambito}</div>,
}));

const OGGI = new Date().toISOString().slice(0, 10);
const tra = (giorni: number) => new Date(Date.now() + giorni * 86_400_000).toISOString().slice(0, 10);

const figlia = (id: string, nome: string, incassato: number): FigliaGenerale => ({
  id, codice: id.toUpperCase(), nome, stato: null, statoNome: null, statoColore: null, indirizzo: null, inizio: null, fine: null,
  avanzamento: 0, importo: 100000, eseguito: 0, fatturato: incassato, incassato, costo: 0, margine: 0,
});
const riepilogo: RiepilogoGenerale = {
  generale: { id: "gen", codice: "C-1", nome: "Residenza Via Roma", cliente: null, clienteId: null, modello: "sviluppo", creataIl: null, valore: null },
  figlie: [figlia("a1", "Appartamento A1", 30000), figlia("a2", "Appartamento A2", 0)],
  permessi: { importi: true, costi: true, margini: true },
};
const allegati: AllegatoCommessa[] = [
  { id: "f1", order_id: "gen", folder_id: "atti", file_name: "Rogito acquisto terreno.pdf", file_url: "orders/gen/f1", file_type: "application/pdf", created_at: "2026-10-01T10:00:00Z" },
  { id: "f2", order_id: "gen", folder_id: "cert", file_name: "Polizza decennale.pdf", file_url: "orders/gen/f2", file_type: "application/pdf", created_at: "2026-10-01T10:00:00Z" },
  { id: "f3", order_id: "gen", folder_id: "vecchia", file_name: "Scansione 12.pdf", file_url: "orders/gen/f3", file_type: "application/pdf", created_at: "2026-10-02T10:00:00Z" },
  { id: "f4", order_id: "a1", folder_id: "cert", file_name: "APE A1.pdf", file_url: "orders/a1/f4", file_type: "application/pdf", created_at: "2026-10-01T10:00:00Z" },
];
const segni: SegnoDocumento[] = [
  { id: "s1", order_id: "gen", voce: "polizza_decennale", tipo: "documento", attachment_id: "f2", scadenza: tra(10) },
];
const voci = vociDelModello("sviluppo");
const checklist = calcolaChecklist({ voci, generaleId: "gen", figlie: riepilogo.figlie, allegati, segni, oggi: OGGI });
const allegatiPer = new Map<string, AllegatoCommessa[]>();
for (const a of allegati) allegatiPer.set(a.order_id, [...(allegatiPer.get(a.order_id) ?? []), a]);

vi.mock("@/hooks/useGeneraleDocumenti", () => ({
  useChecklistGenerale: () => ({ checklist, voci, allegatiPer, isLoading: false, isError: false, refetch: vi.fn() }),
  useAzioneDocumento: () => ({ mutate: stato.mutate, isPending: false }),
  useCaricaDocumentoVoce: () => ({ mutateAsync: stato.mutateAsync, isPending: false }),
  messaggioDocumenti: (_e: unknown, f: string) => f,
}));

import { modulo } from "@/components/orders/generali/moduli/DocumentiScheda";
import { ArchivioDocumentiPanoramica } from "@/components/orders/generali/documenti/RiquadroDocumenti";

const totali: TotaliGenerale = { figlie: 2, assegnato: 200000, daAssegnare: null, eseguito: 0, fatturato: 30000, incassato: 30000, daIncassare: 0, costo: 0, margine: 0, avanzamento: 0, base: 200000 };

function Indirizzo() {
  const l = useLocation();
  return <output data-testid="indirizzo">{l.search}</output>;
}
const apri = (Componente: typeof modulo.Scheda, puoModificare = true, url = "/azienda/ordini/gen?vista=x") =>
  render(
    <MemoryRouter initialEntries={[url]}>
      <Componente riepilogo={riepilogo} totali={totali} puoModificare={puoModificare} />
      <Indirizzo />
    </MemoryRouter>,
  );

beforeEach(() => { vi.clearAllMocks(); stato.mobile = false; });
afterEach(cleanup);

describe("il modulo si aggancia alla pagina della generale", () => {
  it("è pronto, compare anche da telefono e porta un riquadro in Panoramica", () => {
    expect(modulo).toMatchObject({ pronto: true, telefono: true, titolo: "Documenti" });
    expect(modulo.Riquadro).toBeDefined();
  });
});

describe("da computer", () => {
  it("i contatori filtrano le caselle corrette senza perdere la commessa e si azzerano", () => {
    apri(modulo.Scheda, false);
    const mancanti = screen.getByRole("button", { name: `Mancanti ${checklist.conteggi.mancanti}` });
    fireEvent.click(mancanti);
    expect(mancanti).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByTestId("indirizzo")).toHaveTextContent("?vista=x&stato-documenti=mancanti");
    expect(screen.queryByText("Atto di acquisto")).not.toBeInTheDocument();
    expect(screen.getByText("Business plan approvato")).toBeVisible();
    expect(screen.queryByRole("button", { name: "Carica" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /^Tutti \d/ }));
    expect(screen.getByText("Atto di acquisto")).toBeVisible();
  });
  it("dice quanti obbligatori ci sono e cosa manca, con la voce sulla generale e lo stato di ognuna", () => {
    apri(modulo.Scheda);
    expect(screen.getByRole("button", { name: `Obbligatori presenti ${checklist.conteggi.presenti}` })).toBeInTheDocument();
    const riga = screen.getByRole("button", { name: "Polizza decennale postuma" }).closest("tr")!;
    expect(within(riga).getByText("In scadenza")).toHaveAttribute("title", "Scade tra 10 giorni");
    // Riconosciuto dal nome: l'atto di acquisto è presente senza averlo segnato.
    expect(within(screen.getByText("Atto di acquisto").closest("tr")!).getByText("Presente")).toBeInTheDocument();
  });

  it("le voci delle unità stanno in una tabella: una riga per unità, una colonna per documento", () => {
    apri(modulo.Scheda);
    fireEvent.click(screen.getByRole("button", { name: "Per unità" }));
    const colonne = within(screen.getByRole("table", { name: "Matrice dei documenti" })).getAllByRole("columnheader");
    expect(colonne.map(th => th.textContent)).toEqual(expect.arrayContaining(["Unità", expect.stringMatching(/^APE/), expect.stringMatching(/^Fideiussione/)]));
    expect(screen.getByRole("button", { name: /^APE — .* · A1 · Appartamento A1 · Manca la data di scadenza$/ })).toBeInTheDocument();
    // A2 non ha incassato niente: la fideiussione non serve.
    expect(screen.getByRole("button", { name: /Fideiussione D\.Lgs\. 122\/2005 · A2 · Appartamento A2 · Non serve: nessun acconto incassato/ })).toBeInTheDocument();
  });

  it("chi modifica carica da una voce mancante; il pannello propone i file già caricati", () => {
    apri(modulo.Scheda);
    const riga = screen.getByText("Business plan approvato").closest("tr")!;
    fireEvent.click(within(riga).getByRole("button", { name: /Carica/ }));
    expect(screen.getByRole("button", { name: /Carica file/ })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Scegli tra i caricati \(\d+\)/ }));
    fireEvent.click(screen.getByRole("button", { name: /Scansione 12\.pdf/ }));
    expect(stato.mutate).toHaveBeenCalledWith(
      { tipo: "segna", orderId: "gen", voce: "business_plan", attachmentId: "f3", scadenza: null },
      expect.anything(),
    );
  });

  it("mostra insieme i file della generale e delle unità e conserva la gestione dell'archivio", async () => {
    apri(modulo.Scheda);
    fireEvent.click(screen.getByRole("button", { name: "File originali" }));
    const elenco = screen.getByRole("table", { name: "Originali dell’operazione" });
    expect(within(elenco).getByRole("button", { name: "Scansione 12.pdf" })).toBeInTheDocument();
    expect(within(elenco).getByRole("button", { name: "APE A1.pdf" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Archivio della generale" }));
    expect(await screen.findByTestId("archivio")).toHaveTextContent("gen:true");
  });

  it("combina cartella e unità e apre la gestione nella stessa cartella", async () => {
    apri(modulo.Scheda, true, "/azienda/ordini/gen?scheda=documenti&vista-documenti=archivio&ambito-documenti=a1&cartella-documenti=cert");
    const pannello = screen.getByRole("navigation", { name: "Cartelle documenti" });
    expect(within(pannello).getByRole("button", { name: "Certificazioni: 1 documenti" })).toHaveAttribute("aria-current", "true");
    expect(screen.getByRole("button", { name: "APE A1.pdf" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Polizza decennale.pdf" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Gestisci archivio" }));
    const archivio = await screen.findByTestId("archivio");
    expect(archivio).toHaveTextContent("a1:true");
    expect(archivio).toHaveAttribute("data-cartella", "cert");
  });

  it("lascia consultabili i file con cartella rimossa", () => {
    apri(modulo.Scheda, true, "/azienda/ordini/gen?scheda=documenti&vista-documenti=archivio");
    fireEvent.click(screen.getByRole("button", { name: "Senza cartella: 1 documenti" }));
    expect(screen.getByRole("button", { name: "Scansione 12.pdf" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "APE A1.pdf" })).toBeNull();
  });

  it("chi non può modificare vede gli stati e l'archivio in sola lettura", async () => {
    apri(modulo.Scheda, false);
    expect(screen.queryByRole("button", { name: /^Carica/ })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "File originali" }));
    fireEvent.click(screen.getByRole("button", { name: "Archivio della generale" }));
    expect(await screen.findByTestId("archivio")).toHaveTextContent("gen:false");
  });
});

describe("da telefono", () => {
  it("può cercare e aprire direttamente un originale, con la checklist in sola lettura", async () => {
    stato.mobile = true;
    apri(modulo.Scheda);
    expect(screen.queryByRole("button", { name: /^Carica/ })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "File originali" }));
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "APE A1" } });
    expect(screen.queryByRole("button", { name: "Scansione 12.pdf" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "APE A1.pdf" }));
    expect(await screen.findByRole("dialog", { name: "APE A1.pdf" })).toHaveTextContent("A1 · Appartamento A1");
  });
});

describe("in Panoramica", () => {
  it("apre una cartella con il conteggio dell’operazione", () => {
    apri(ArchivioDocumentiPanoramica, true, "/azienda/ordini/gen?vista=x&ambito-documenti=a1");
    expect(screen.getByRole("link", { name: "Certificazioni · 2 file" })).toHaveAttribute(
      "href", "/azienda/ordini/gen?vista=x&scheda=documenti&vista-documenti=archivio&cartella-documenti=cert",
    );
  });
  it("una riga dice cosa manca e apre la scheda Documenti senza perdere il resto dell'indirizzo", () => {
    const Riquadro = modulo.Riquadro!;
    apri(Riquadro);
    const riga = screen.getByRole("button", { name: /Documenti · \d+ documenti mancanti, 1 in scadenza/ });
    fireEvent.click(riga);
    expect(screen.getByTestId("indirizzo").textContent).toBe("?vista=x&scheda=documenti&stato-documenti=mancanti");
  });
});
