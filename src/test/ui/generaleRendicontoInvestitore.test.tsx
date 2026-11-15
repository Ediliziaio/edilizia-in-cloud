/**
 * Il dialogo del rendiconto all'investitore: la spunta «Includi il piano», la versione del piano
 * e «Scarica» con le due versioni, che finiscono nello storico come «scaricato» (niente email).
 * Finti la lettura dei numeri, il PDF e l'invio; veri i conti e la composizione dei dati.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { calcolaInvestitori, type Fonte } from "@/lib/orders/generali/investitoriConti";
import type { NumeriInvestitori } from "@/lib/orders/generali/pianoConti";
import type { VersionePiano } from "@/lib/orders/generali/pianoLettura";

const m = vi.hoisted(() => ({ archivia: vi.fn(), invia: vi.fn(), modifica: true, versioniChieste: [] as (string | null | undefined)[] }));

vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ effectiveCompany: { id: "c1", name: "Edil Srl" } }) }));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { name: "Edil Srl" } }) }) }) }) },
}));
vi.mock("@react-pdf/renderer", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@react-pdf/renderer")>()),
  pdf: () => ({ toBlob: async () => new Blob(["%PDF-1.4"], { type: "application/pdf" }) }),
}));

const versioni: VersionePiano[] = [
  { id: "v2", numero: 2, stato: "approvata", nota: null, approvataIl: null, creataIl: null },
  { id: "v1", numero: 1, stato: "superata", nota: null, approvataIl: null, creataIl: null },
];
const fonte = (f: Partial<Fonte> & Pick<Fonte, "id" | "tipo" | "nome">): Fonte => ({
  soggetto: "persona", clienteId: null, email: null, impegno: 0, quotaUtilePct: null, tassoPct: null,
  dataInizio: null, scadenza: null, nota: null, ordine: 0, ...f,
});
const conti = calcolaInvestitori({
  fonti: [fonte({ id: "M", tipo: "capitale", nome: "Mario Rossi", impegno: 200_000, email: "mario@example.com" })],
  movimenti: [{ id: "1", fonteId: "M", tipo: "versamento", data: "2027-01-15", importo: 200_000, nota: null }],
  numeri: null, oggi: "2027-06-30",
});
const numeriPiano: NumeriInvestitori = {
  capitaleMassimoImpegnato: 600_000, meseCapitaleMassimo: "2027-09", capitaleInvestitoOggi: 250_000,
  previsto: { ricavi: 1_500_000, costi: 1_200_000, margine: 300_000 },
  stimaFinale: { ricavi: 1_450_000, costi: 1_210_000, margine: 240_000 },
  tirAnnuo: 0.18, durataMesi: 24, flussoMensile: [],
  righe: [{ tipo: "costo", categoria: "materiali", etichetta: "Calcestruzzo", previsto: 300_000, reale: 0, aFinire: 310_000, stima: 310_000, scostamento: 10_000 }],
};

vi.mock("@/hooks/useGeneraleInvestitori", () => ({
  useGeneraleInvestitori: (_r: unknown, o: { versioneId?: string | null; enabled?: boolean } = {}) => {
    m.versioniChieste.push(o.versioneId);
    const v = versioni.find((x) => x.id === o.versioneId) ?? versioni[0];
    return { conti, numeriPiano, versioni, versionePiano: v, isLoading: false };
  },
  useInviaRendiconto: () => ({ mutate: m.invia, mutateAsync: m.archivia, isPending: false }),
}));

const { RendicontoDialog } = await import("@/components/orders/generali/investitori/RendicontoDialog");

const riepilogo = {
  generale: { id: "g", codice: "C-27", nome: "Residenza Via Roma", cliente: null, clienteId: null, modello: "sviluppo", creataIl: null, valore: null },
  figlie: [],
  permessi: { importi: true, costi: true, margini: true },
} as never;

beforeEach(() => {
  m.archivia.mockReset();
  m.archivia.mockResolvedValue({ id: "x" });
  m.invia.mockReset();
  m.versioniChieste = [];
  URL.createObjectURL = vi.fn(() => "blob:anteprima") as never;
  URL.revokeObjectURL = vi.fn() as never;
  // Radix (tendina e menu) usa ResizeObserver, che jsdom non ha.
  globalThis.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} } as unknown as typeof ResizeObserver;
});
afterEach(cleanup);

const disegna = (puoInviare = true) =>
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <RendicontoDialog open onOpenChange={() => {}} riepilogo={riepilogo} fonteId="M" conti={conti} numeriPiano={numeriPiano} vendite={null} oggi="2027-06-30" puoInviare={puoInviare} />
    </QueryClientProvider>,
  );

const apriMenu = () => fireEvent.pointerDown(screen.getByRole("button", { name: /Scarica/ }), { button: 0, ctrlKey: false, pointerType: "mouse" });

describe("Rendiconto all'investitore: piano e versioni", () => {
  it("parte col piano voce per voce e con la versione approvata", async () => {
    disegna();
    expect(screen.getByRole("checkbox", { name: /Includi il piano voce per voce/ })).toBeChecked();
    expect(screen.getByRole("combobox", { name: "Versione del piano" })).toHaveTextContent("Versione 2 approvata");
    await waitFor(() => expect(screen.getByRole("button", { name: /Scarica/ })).toBeEnabled());
  });

  it("«Tutte e due le versioni» salva nello storico il PDF con il piano e quello senza", async () => {
    disegna();
    await waitFor(() => expect(screen.getByRole("button", { name: /Scarica/ })).toBeEnabled());
    apriMenu();
    await act(async () => { fireEvent.click(await screen.findByRole("menuitem", { name: "Tutte e due le versioni" })); });
    await waitFor(() => expect(m.archivia).toHaveBeenCalledTimes(2));
    const salvati = m.archivia.mock.calls.map((c) => c[0]);
    expect(salvati.every((x) => x.archivia === true && x.to === "")).toBe(true);
    expect(salvati.map((x) => x.numeri.conPiano).sort()).toEqual([false, true]);
    expect(salvati.find((x) => !x.numeri.conPiano).filename).toMatch(/senza piano\.pdf$/);
    expect(salvati.find((x) => x.numeri.conPiano).numeri.piano.costi[0].etichetta).toBe("Calcestruzzo");
    expect(m.invia).not.toHaveBeenCalled();
  });

  it("togliere la spunta toglie il piano dal PDF", async () => {
    disegna();
    await waitFor(() => expect(screen.getByRole("button", { name: /Scarica/ })).toBeEnabled());
    fireEvent.click(screen.getByRole("checkbox", { name: /Includi il piano voce per voce/ }));
    await waitFor(() => expect(screen.getByRole("button", { name: /Scarica/ })).toBeEnabled());
    apriMenu();
    await act(async () => { fireEvent.click(await screen.findByRole("menuitem", { name: "Il PDF dell'anteprima" })); });
    await waitFor(() => expect(m.archivia).toHaveBeenCalledTimes(1));
    expect(m.archivia.mock.calls[0][0].numeri.piano).toBeNull();
  });

  it("senza il permesso di modificare si scarica ma non si salva nello storico", async () => {
    disegna(false);
    await waitFor(() => expect(screen.getByRole("button", { name: /Scarica/ })).toBeEnabled());
    apriMenu();
    await act(async () => { fireEvent.click(await screen.findByRole("menuitem", { name: "Con il piano voce per voce" })); });
    expect(m.archivia).not.toHaveBeenCalled();
  });
});
