/**
 * «Preventivi» nella scheda committente (10/11/2026): elenco con stati e importi, rifiuto col motivo,
 * revisione, le due strade dell'accettato; e le voci dal contratto col prezzo che si cambia.
 */
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { PreventiviCommittente, type PreventivoScheda } from "@/components/committenti/PreventiviCommittente";
import { VociContrattoDialog } from "@/components/marketing/preventivi/VociContrattoDialog";
import { righeDaContratto } from "@/lib/preventivi/preventiviCommittente";

const stato = vi.hoisted(() => ({ aggiornamenti: [] as Array<{ tabella: string; valori: unknown; filtri: Array<[string, unknown]> }> }));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (tabella: string) => ({
      update: (valori: unknown) => {
        const filtri: Array<[string, unknown]> = [];
        const q = {
          eq: (c: string, v: unknown) => { filtri.push([c, v]); return q; },
          select: async () => { stato.aggiornamenti.push({ tabella, valori, filtri }); return { data: [{ id: "x" }], error: null as unknown }; },
        };
        return q;
      },
    }),
  },
}));
const duplica = vi.hoisted(() => vi.fn(async () => ({ id: "rev-1", nonAllegate: [] as unknown[] })));
vi.mock("@/lib/quotes/duplicaPreventivo", () => ({ duplicaPreventivo: duplica }));
const converti = vi.hoisted(() => vi.fn(async () => ({ orderId: "o-nuova", avviso: null as string | null })));
vi.mock("@/lib/quotes/convertiPreventivoInCantiere", () => ({ convertiPreventivoInCantiere: converti }));

const base: PreventivoScheda = {
  id: "q1", quote_number: "PRV/2026/10", title: "Cappotto via Roma", total: 12200, status: "inviata", created_at: "2026-10-01T09:00:00Z",
  sent_at: "2026-10-01T09:00:00Z", expires_at: "2026-12-31", signed_at: null, revision_number: null, parent_quote_id: null,
  refused_motivo: null, refused_reason: null, variante_id: null, version: 3, source: null,
};
const lista: PreventivoScheda[] = [
  { ...base, id: "b", quote_number: "PRV/2026/1", status: "bozza", total: 1000 },
  { ...base, id: "i", quote_number: "PRV/2026/2" },
  { ...base, id: "a", quote_number: "PRV/2026/3", status: "accettata", signed_at: "2026-11-01T10:00:00Z" },
  { ...base, id: "r", quote_number: "PRV/2026/4", status: "rifiutata", refused_motivo: "prezzo", refused_reason: "troppo caro" },
  { ...base, id: "s", quote_number: "PRV/2026/5", status: "inviata", expires_at: "2026-11-01" },
];
const commesse = [
  { id: "o1", order_code: "APP-001", description: "Posa cappotto", quote_id: null as string | null },
  { id: "o2", order_code: "APP-002", description: "Bagni", quote_id: null },
];

function Dove() {
  const l = useLocation();
  return <p data-testid="dove">{l.pathname}{l.search}</p>;
}

const mostra = (props: Partial<Parameters<typeof PreventiviCommittente>[0]> = {}) => render(
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    <MemoryRouter initialEntries={["/azienda/committenti/k"]}>
      <Routes>
        <Route path="*" element={<>
          <PreventiviCommittente committenteId="k" companyId="company" preventivi={lista} caricamento={false} errore={false}
            commesse={commesse} oggi="2026-11-10" vedeImporti puoPreventivi puoCommesse {...props} />
          <Dove />
        </>} />
      </Routes>
    </MemoryRouter>
  </QueryClientProvider>,
);
const riga = (numero: string) => screen.getByRole("button", { name: numero }).closest("li") as HTMLElement;

beforeEach(() => { stato.aggiornamenti = []; duplica.mockClear(); converti.mockClear(); });
afterEach(cleanup);

it("elenca i preventivi con numero, data, importo e stato", () => {
  mostra();
  expect(within(riga("PRV/2026/1")).getByText("Bozza")).toBeInTheDocument();
  expect(within(riga("PRV/2026/2")).getByText("Inviato")).toBeInTheDocument();
  expect(within(riga("PRV/2026/3")).getByText("Accettato")).toBeInTheDocument();
  expect(within(riga("PRV/2026/4")).getByText("Rifiutato")).toBeInTheDocument();
  expect(within(riga("PRV/2026/4")).getByText("Prezzo · troppo caro")).toBeInTheDocument();
  expect(within(riga("PRV/2026/5")).getByText("Scaduto")).toBeInTheDocument();
  expect(within(riga("PRV/2026/1")).getByText("€ 1.000,00")).toBeInTheDocument();
  expect(within(riga("PRV/2026/1")).getByText("01/10/2026")).toBeInTheDocument();
});

it("senza il permesso sugli importi gli euro non ci sono", () => {
  mostra({ vedeImporti: false });
  expect(screen.queryByText(/€/)).not.toBeInTheDocument();
});

it("«Nuovo preventivo» apre il preventivatore classico legato al committente", () => {
  mostra();
  fireEvent.click(screen.getByRole("button", { name: /Nuovo preventivo/ }));
  expect(screen.getByTestId("dove")).toHaveTextContent("/azienda/marketing/preventivi/nuovo?customer_id=k");
});

it("rifiutato: si sceglie il motivo e resta scritto sul preventivo", async () => {
  mostra();
  fireEvent.click(within(riga("PRV/2026/2")).getByRole("button", { name: /Segna rifiutato/ }));
  const salva = screen.getByRole("button", { name: /Salva/ });
  expect(salva).toBeDisabled();
  fireEvent.click(screen.getByRole("button", { name: "Tempi" }));
  fireEvent.change(screen.getByLabelText(/Nota/), { target: { value: "partono a marzo" } });
  fireEvent.click(salva);
  await waitFor(() => expect(stato.aggiornamenti).toHaveLength(1));
  const [u] = stato.aggiornamenti;
  expect(u.tabella).toBe("quotes");
  expect(u.valori).toMatchObject({ status: "rifiutata", refused_motivo: "tempi", refused_reason: "partono a marzo" });
  expect(u.filtri).toEqual([["id", "i"], ["company_id", "company"]]);
});

it("rifiutato o scaduto: la revisione si fa con la duplicazione dei preventivi e si apre nel builder", async () => {
  mostra();
  expect(within(riga("PRV/2026/2")).queryByRole("button", { name: /Revisione/ })).not.toBeInTheDocument();
  fireEvent.click(within(riga("PRV/2026/4")).getByRole("button", { name: /Revisione/ }));
  await waitFor(() => expect(duplica).toHaveBeenCalledWith("r", "company", { comeRevisione: true }));
  await waitFor(() => expect(screen.getByTestId("dove")).toHaveTextContent("/azienda/marketing/preventivi/rev-1/modifica"));
});

it("accettato → nuova commessa dal percorso di sempre", async () => {
  mostra();
  expect(within(riga("PRV/2026/2")).queryByRole("button", { name: /Nuova commessa/ })).not.toBeInTheDocument();
  fireEvent.click(within(riga("PRV/2026/3")).getByRole("button", { name: /Nuova commessa/ }));
  fireEvent.click(screen.getByRole("button", { name: /Crea commessa/ }));
  await waitFor(() => expect(converti).toHaveBeenCalledWith("a", 3));
  await waitFor(() => expect(screen.getByTestId("dove")).toHaveTextContent("/azienda/ordini/o-nuova"));
});

it("accettato → lavoro extra: si sceglie la commessa e si apre il suo lavoro extra dal preventivo", () => {
  mostra();
  fireEvent.click(within(riga("PRV/2026/3")).getByRole("button", { name: /Lavoro extra/ }));
  fireEvent.click(screen.getByRole("button", { name: /Apri il lavoro extra/ }));
  expect(screen.getByTestId("dove")).toHaveTextContent("/azienda/ordini/o1?lavoro_extra_da=a");
});

it("un accettato già diventato commessa non si converte una seconda volta", () => {
  mostra({ commesse: [{ ...commesse[0], quote_id: "a" }] });
  expect(within(riga("PRV/2026/3")).queryByRole("button", { name: /Nuova commessa/ })).not.toBeInTheDocument();
  expect(within(riga("PRV/2026/3")).getByRole("button", { name: /Commessa APP-001/ })).toBeInTheDocument();
});

it("senza permessi niente azioni", () => {
  mostra({ puoPreventivi: false, puoCommesse: false });
  expect(screen.queryByRole("button", { name: /Nuovo preventivo|Segna rifiutato|Revisione|Nuova commessa|Lavoro extra/ })).not.toBeInTheDocument();
});

it("voci dal contratto: prezzo proposto, modificabile riga per riga, con la nota", () => {
  const aggiungi = vi.fn();
  render(
    <VociContrattoDialog open onClose={() => {}} contratto={{ nome: "Accordo 2026" }} onAggiungi={aggiungi} tariffe={[
      { id: "t1", tipo: "manodopera", codice: null, descrizione: "Giornata uomo", unita_misura: "uomo_giorno", prezzo_unitario: 180, attivo: true },
      { id: "t2", tipo: "trasporto", codice: null, descrizione: "Viaggio", unita_misura: "viaggio", prezzo_unitario: 40, attivo: true },
    ]} />,
  );
  expect(screen.getByLabelText("Prezzo di Giornata uomo")).toHaveValue("180,00");
  fireEvent.change(screen.getByLabelText("Prezzo di Giornata uomo"), { target: { value: "165,50" } });
  fireEvent.change(screen.getByLabelText("Quantità di Giornata uomo"), { target: { value: "3" } });
  fireEvent.change(screen.getByLabelText("Nota di Giornata uomo"), { target: { value: "anche sabato" } });
  fireEvent.click(screen.getByRole("button", { name: "Aggiungi la voce" }));
  expect(aggiungi).toHaveBeenCalledTimes(1);
  const scelte = aggiungi.mock.calls[0][0];
  expect(scelte).toHaveLength(1);
  const [r] = righeDaContratto(scelte, { iva: 22, ordine: 0 });
  expect(r).toMatchObject({ name: "Giornata uomo", quantity: 3, unit_price: 165.5, description: "anche sabato", unit_of_measure: "uomo/giorno" });
});
