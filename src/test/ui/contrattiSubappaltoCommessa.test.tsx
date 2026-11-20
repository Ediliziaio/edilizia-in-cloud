import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { ComponentProps } from "react";
import { ContrattiSubappaltoCommessa } from "@/components/orders/ContrattiSubappaltoCommessa";

const m = vi.hoisted(() => ({ costi: true, scrive: true, errore: false, carica: false, quadroErrato: false, refetch: vi.fn(), dettaglio: vi.fn() }));
vi.mock("@/hooks/usePermissions", () => ({ usePermissions: () => ({ canViewCosts: m.costi, canViewSubappaltatori: true, canViewSubappaltatoriAmministrazione: true, canEditOrders: m.scrive, solaLettura: !m.scrive }) }));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ effectiveCompany: { id: "az", name: "Impresa" } }) }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));
vi.mock("@/hooks/useDettaglioSubappaltoCommessa", () => ({
  chiaveFlussoSubappalto: (c: string, o: string) => ["subappalto-flusso", c, o],
  useDettaglioSubappaltoCommessa: (...args: unknown[]) => { m.dettaglio(...args); return { isError: m.errore, isFetching: m.carica, refetch: m.refetch, data: m.carica ? undefined : {
    quadro: { id: "quadro", revisione: 2, importo_lavori: m.quadroErrato ? 999 : 1200, voci: [{ id: "r", fase_id: "f", descrizione: "Intonaco", base: "misura", unita: "mq", quantita: 120, prezzo: 10, affidamento_id: "a", voce_commessa_id: "v" }] },
    varianti: [{ id: "var", importo_prima: 1000, importo_dopo: 1200, oneri_prima: 100, oneri_dopo: 100, motivo: "Muri in più", created_at: "2026-11-16" }],
    sal: [{ id: "sal1", contratto_id: "c", numero_sal: 1, data_emissione: "2026-11-18", importo_lordo: 300, importo_netto: 285, ritenuta_importo: 15, stato: "verificato" }],
  } }; },
}));
vi.mock("@/components/subappaltatori/LavorazioniAffidateDialog", () => ({ LavorazioniAffidateDialog: ({ titolo, righe }: { titolo: string; righe: { quantita: number }[] }) => <div role="dialog" aria-label={titolo}>Quantità computo {righe[0].quantita}</div> }));
vi.mock("@/components/subappaltatori/LavoriMisureSubDialog", () => ({ LavoriMisureSubDialog: ({ sezioneIniziale, contratto }: { sezioneIniziale: string; contratto: { id: string } }) => <div role="dialog">Misure {sezioneIniziale} contratto {contratto.id}</div> }));
vi.mock("@/components/subappaltatori/VerbaleSalSubDialog", () => ({ VerbaleSalSubDialog: ({ sal }: { sal: { id: string } }) => <div role="dialog">Verbale {sal.id}</div> }));
vi.mock("@/components/sicurezza/SchedaCommessaDialog", () => ({ SchedaCommessaDialog: ({ destinazione, onClose }: { destinazione: { to: string }; onClose: () => void }) => <div role="dialog">{destinazione.to}<button onClick={onClose}>Torna</button></div> }));
vi.mock("@/components/orders/AffidaVociDialog", () => ({ AffidaVociDialog: ({ dittaFissa, onAffidate }: { dittaFissa: { id: string }; onAffidate: () => void }) => <div role="dialog">Affida a {dittaFissa.id}<button onClick={onAffidate}>Affidate</button></div> }));
vi.mock("@/components/orders/VarianteVociDialog", () => ({ VarianteVociDialog: ({ quote }: { quote: { id: string }[] }) => <div role="dialog">Variante quote {quote.map((q) => q.id).join(",")}</div> }));

const props: ComponentProps<typeof ContrattiSubappaltoCommessa> = {
  companyId: "az", orderId: "ord", dati: {
    codiceCommessa: "ORD-12", fasi: [{ id: "f", name: "Finiture", position: 1, start_date: null, end_date: null }], sottofasi: [],
    schede: [{ id: "sicurezza", ragione_sociale: "Alfa", campo_subappaltatore_id: "anagrafica", order_id: null, created_at: "2026-01-01" }],
    contratti: [{ id: "c", subappaltatore_id: "sicurezza", numero_contratto: "ORD-12/S01", descrizione_lavori: "Finiture", stato: "attivo", firmato_il: "2026-11-01", elenco_lavori: [{ fase: "Finiture", descrizione: "Intonaco", quantita: 100, prezzo: 10, unita: "mq", importo: 1000, voce_id: "v", affidamento_id: "a" }], importo_contrattuale: 1200, oneri_sicurezza: 100, ritenuta_garanzia_pct: 5, data_inizio: null, data_fine_prevista: null }],
  }, voci: [], affidamenti: [
    { id: "a", voce_id: "v", subappaltatore_id: "anagrafica", quantita: 120, prezzo_unitario: 10, origine_prezzo: "manuale", comprende: "posa", stato: "a_contratto", contratto_id: "c" },
    { id: "altra", voce_id: "v2", subappaltatore_id: "anagrafica", quantita: 10, prezzo_unitario: 20, origine_prezzo: "manuale", comprende: "posa", stato: "a_contratto", contratto_id: "altro-contratto" },
  ],
};
let qc: QueryClient;
const disegna = (p = props) => { qc = new QueryClient({ defaultOptions: { queries: { retry: false } } }); return render(<QueryClientProvider client={qc}><ContrattiSubappaltoCommessa {...p} /></QueryClientProvider>); };
const apri = () => fireEvent.click(screen.getByRole("button", { name: /Alfa · ORD-12\/S01/ }));
beforeEach(() => { m.costi = true; m.scrive = true; m.errore = false; m.carica = false; m.quadroErrato = false; m.dettaglio.mockClear(); m.refetch.mockClear(); });
afterEach(() => { cleanup(); qc?.clear(); });

it("mostra un contratto anche senza squadra esterna e legge i dettagli solo all'apertura", () => {
  disegna(); expect(screen.getByText("Alfa · ORD-12/S01")).toBeVisible();
  expect(m.dettaglio).toHaveBeenLastCalledWith("az", "ord", "c", false);
  apri(); expect(m.dettaglio).toHaveBeenLastCalledWith("az", "ord", "c", true);
  const iniziale = screen.getByText("Importo iniziale").parentElement!;
  expect(within(iniziale).getByText("1.100,00 €")).toBeVisible();
  expect(screen.getByText("Costo attuale").parentElement).toHaveTextContent("1.300,00 €");
});
it("apre il computo corrente con quantità variata e mantiene distinto l'originale firmato", async () => {
  disegna(); apri(); fireEvent.click(screen.getByRole("button", { name: /Computo aggiornato/ }));
  expect(await screen.findByRole("dialog")).toHaveTextContent("Quantità computo 120");
});
it("raggiunge misure e verbale sul contratto giusto", async () => {
  disegna(); apri(); fireEvent.click(screen.getByRole("button", { name: "Prepara SAL e verbale" }));
  expect(await screen.findByRole("dialog")).toHaveTextContent("Misure sal contratto c");
  fireEvent.click(screen.getByRole("button", { name: "Apri verbale SAL 1" }));
  expect(await screen.findByText("Verbale sal1")).toBeVisible();
});
it("apre listino e condizioni della scheda sicurezza corretta restando nella commessa", async () => {
  disegna(); apri(); fireEvent.click(screen.getByRole("button", { name: "Listino della ditta" }));
  expect(await screen.findByRole("dialog")).toHaveTextContent("/azienda/subappaltatori/sicurezza?tab=listino&contratto=c");
  const invalidate = vi.spyOn(qc, "invalidateQueries");
  fireEvent.click(screen.getByRole("button", { name: "Torna" }));
  await waitFor(() => expect(invalidate).toHaveBeenCalledWith({ queryKey: ["subappalto-flusso", "az", "ord"] }));
});
it("nuove voci restano sulla ditta scelta e la variante esclude quote di altri contratti", async () => {
  disegna(); apri(); fireEvent.click(screen.getByRole("button", { name: "Assegna nuove voci alla ditta" }));
  expect(screen.getByRole("dialog")).toHaveTextContent("Affida a anagrafica");
  fireEvent.click(screen.getByRole("button", { name: "Affidate" }));
  expect(screen.getByRole("dialog")).toHaveTextContent("Variante quote a");
  expect(screen.getByRole("dialog")).not.toHaveTextContent("altra");
});
it("un errore non presenta SAL a zero e impedisce varianti o PDF basati su dati non verificati", () => {
  m.errore = true; disegna(); apri();
  expect(screen.getByRole("alert")).toHaveTextContent("Non riesco a leggere");
  expect(screen.queryByText("SAL approvati")).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "PDF computo" })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Riprova" })); expect(m.refetch).toHaveBeenCalled();
});
it("blocca il computo corrente quando quadro e importo non tornano", () => {
  m.quadroErrato = true; disegna(); apri();
  expect(screen.getByRole("alert")).toHaveTextContent("Il computo non torna");
  expect(screen.getByRole("button", { name: "PDF computo" })).toBeDisabled();
});
it("la consultazione in sola lettura non offre assegnazioni o registrazioni", () => {
  m.scrive = false; disegna(); apri();
  expect(screen.queryByRole("button", { name: "Registra variante sulle voci" })).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Consulta SAL" })).toBeEnabled();
});
it("senza permesso costi non legge né espone i contratti", () => {
  m.costi = false; disegna(); expect(screen.queryByText(/Alfa/)).not.toBeInTheDocument(); expect(m.dettaglio).not.toHaveBeenCalled();
});
