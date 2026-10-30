// src/test/ui/generaleDocumentiScheda.test.tsx
// Commesse generali, scheda «Documenti»: da computer la checklist con le azioni e l'archivio della
// generale; da telefono un elenco da leggere; in Panoramica una riga che dice cosa manca e apre la scheda.
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  calcolaChecklist, vociDelModello,
  type AllegatoCommessa, type SegnoDocumento,
} from "@/lib/orders/generali/documenti";
import type { FigliaGenerale, RiepilogoGenerale, TotaliGenerale } from "@/lib/orders/commesseGenerali";

const stato = vi.hoisted(() => ({ mobile: false, mutate: vi.fn(), mutateAsync: vi.fn(), apri: vi.fn() }));

vi.mock("@/hooks/use-mobile", () => ({ useIsMobile: () => stato.mobile }));
vi.mock("@/hooks/usePermissions", () => ({ usePermissions: () => ({ isAdmin: true, isLoading: false, canViewSettingsOrders: true }) }));
vi.mock("@/components/orders/OrderAttachments", () => ({
  OrderAttachments: ({ orderId, editable }: { orderId: string; editable: boolean }) => <div data-testid="archivio">{orderId}:{String(editable)}</div>,
}));
vi.mock("@/components/orders/filePreviewUtils", () => ({ openAttachmentInTab: stato.apri }));

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
  { id: "f1", order_id: "gen", file_name: "Rogito acquisto terreno.pdf", file_url: "orders/gen/f1", file_type: "application/pdf", created_at: "2026-10-01T10:00:00Z" },
  { id: "f2", order_id: "gen", file_name: "Polizza decennale.pdf", file_url: "orders/gen/f2", file_type: "application/pdf", created_at: "2026-10-01T10:00:00Z" },
  { id: "f3", order_id: "gen", file_name: "Scansione 12.pdf", file_url: "orders/gen/f3", file_type: "application/pdf", created_at: "2026-10-02T10:00:00Z" },
  { id: "f4", order_id: "a1", file_name: "APE A1.pdf", file_url: "orders/a1/f4", file_type: "application/pdf", created_at: "2026-10-01T10:00:00Z" },
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

const totali: TotaliGenerale = { figlie: 2, assegnato: 200000, daAssegnare: null, eseguito: 0, fatturato: 30000, incassato: 30000, daIncassare: 0, costo: 0, margine: 0, avanzamento: 0, base: 200000 };

function Indirizzo() {
  const l = useLocation();
  return <output data-testid="indirizzo">{l.search}</output>;
}
const apri = (Componente: typeof modulo.Scheda, puoModificare = true) =>
  render(
    <MemoryRouter initialEntries={["/azienda/ordini/gen?vista=x"]}>
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
  it("dice quanti obbligatori ci sono e cosa manca, con la voce sulla generale e lo stato di ognuna", () => {
    apri(modulo.Scheda);
    const c = checklist.conteggi;
    expect(screen.getByText(new RegExp(`^${c.presenti} di ${c.richiesti} obbligatori presenti`))).toBeInTheDocument();
    expect(screen.getByText("Sull'operazione")).toBeInTheDocument();
    const riga = screen.getByText("Polizza decennale postuma").closest("tr")!;
    expect(within(riga).getByText("Scade tra 10 giorni")).toBeInTheDocument();
    // Riconosciuto dal nome: l'atto di acquisto è presente senza averlo segnato.
    expect(within(screen.getByText("Atto di acquisto").closest("tr")!).getByText("Presente")).toBeInTheDocument();
  });

  it("le voci delle unità stanno in una tabella: una riga per unità, una colonna per documento", () => {
    apri(modulo.Scheda);
    expect(screen.getByText("Su ogni unità")).toBeInTheDocument();
    const colonne = screen.getAllByRole("columnheader").map((th) => th.textContent);
    expect(colonne).toEqual(expect.arrayContaining(["Unità", "APE", "Fideiussione D.Lgs. 122/2005"]));
    expect(screen.getByRole("button", { name: /^APE — .*, A1 · Appartamento A1: Manca la data di scadenza$/ })).toBeInTheDocument();
    // A2 non ha incassato niente: la fideiussione non serve.
    expect(screen.getByRole("button", { name: /Fideiussione D\.Lgs\. 122\/2005, A2 · Appartamento A2: Non serve: nessun acconto incassato/ })).toBeInTheDocument();
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

  it("sotto la checklist c'è l'archivio della generale, quello delle commesse", () => {
    apri(modulo.Scheda);
    expect(screen.getByTestId("archivio")).toHaveTextContent("gen:true");
  });

  it("chi non può modificare vede gli stati ma nessun «Carica»", () => {
    apri(modulo.Scheda, false);
    expect(screen.queryByRole("button", { name: /^Carica$/ })).toBeNull();
    expect(screen.getByTestId("archivio")).toHaveTextContent("gen:false");
  });
});

describe("da telefono", () => {
  it("un elenco da leggere: niente archivio, niente caricamenti; una voce delle unità si apre sulle unità", () => {
    stato.mobile = true;
    apri(modulo.Scheda, false);
    expect(screen.queryByTestId("archivio")).toBeNull();
    expect(screen.queryByRole("button", { name: /Carica/ })).toBeNull();
    expect(screen.queryByText("Appartamento A1")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /APE.*1 di 2/ }));
    expect(screen.getByText("A1")).toBeInTheDocument();
    // Toccando una voce presente si apre il file.
    fireEvent.click(screen.getByRole("button", { name: /Atto di acquisto/ }));
    expect(stato.apri).toHaveBeenCalledWith("orders/gen/f1");
  });
});

describe("in Panoramica", () => {
  it("una riga dice cosa manca e apre la scheda Documenti senza perdere il resto dell'indirizzo", () => {
    const Riquadro = modulo.Riquadro!;
    apri(Riquadro);
    const riga = screen.getByRole("button", { name: /Documenti · \d+ documenti mancanti, 1 in scadenza/ });
    fireEvent.click(riga);
    expect(screen.getByTestId("indirizzo").textContent).toBe("?vista=x&scheda=documenti");
  });
});
