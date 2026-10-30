import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { RiepilogoGenerale, TotaliGenerale } from "@/lib/orders/commesseGenerali";
import { CONTRATTO_VUOTO, formattaEuroContratto, type DatiContratto } from "@/lib/orders/generali/contratto";

/**
 * Modulo «Contratto e SAL» della commessa generale (31/10/2026): cosa vede chi usa l'app.
 * I conti sono in generaleContratto.test.ts; i numeri del SAL sono quelli della prova in produzione.
 */
const m = vi.hoisted(() => ({ dati: null as DatiContratto | null }));
const { nessuno } = vi.hoisted(() => ({ nessuno: () => ({ mutate: (): void => undefined, isPending: false }) }));

vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ effectiveCompany: { id: "azienda" }, user: { id: "utente" } }) }));
vi.mock("@/hooks/useGeneraleContratto", () => ({
  useDatiContratto: () => ({ data: m.dati, isLoading: false, isError: false, refetch: vi.fn() }),
  useSalvaContratto: nessuno, useSalvaAtto: nessuno, useEliminaAtto: nessuno, useSalvaGaranzia: nessuno, useEliminaGaranzia: nessuno,
}));
vi.mock("@/hooks/useGeneraleContrattoSal", () => ({
  useAnteprimaSal: () => ({ data: undefined as undefined, isLoading: false, isError: false, isFetching: false }),
  useCreaSal: nessuno, useEmettiSal: nessuno, useAnnullaSal: nessuno, useRegistraRitenuta: nessuno,
  documentoSal: vi.fn(),
}));
// Fatture dei SAL (sessione cg-fatture): nessuna fattura ancora, l'utente può fatturare.
vi.mock("@/hooks/useGeneraleFatture", () => ({
  useFattureGenerale: () => ({ data: { fatture: [] as unknown[], puoFatturare: true } }),
  useDatiFatturaGenerale: () => ({ data: undefined as undefined, isLoading: true, error: null }),
  useCreaFatturaGenerale: nessuno,
}));
vi.mock("@/hooks/useGeneraleContrattoElenco", () => ({
  useElencoPrezzi: () => ({ data: [] as unknown[], isLoading: false, isError: false, refetch: vi.fn() }),
  useComputo: () => ({ data: [] as unknown[], isLoading: false, isError: false }),
  useMisure: () => ({ data: [] as unknown[], isLoading: false, isError: false }),
  useImportaElenco: nessuno, useSalvaVoceElenco: nessuno, useEliminaVoceElenco: nessuno,
  useSalvaComputo: nessuno, usePrezzaFiglia: nessuno, useAggiungiMisura: nessuno, useEliminaMisura: nessuno,
}));

import { modulo } from "@/components/orders/generali/moduli/ContrattoScheda";
import { SchedaContratto } from "@/components/orders/generali/contratto/SchedaContratto";
import { RiquadroContratto } from "@/components/orders/generali/contratto/RiquadroContratto";

const riepilogo: RiepilogoGenerale = {
  generale: { id: "g", codice: "C-014", nome: "Appalto scuole 2027", cliente: "Comune di Prova", clienteId: "cli", modello: "appalto", creataIl: null, valore: 980_000 },
  figlie: [
    { id: "f1", codice: "O-0025", nome: "Scuola Rodari", stato: null, statoNome: null, statoColore: null, indirizzo: null, inizio: null, fine: null, avanzamento: 0,
      importo: 2_080, eseguito: 0, fatturato: 0, incassato: 0, costo: null, margine: null },
  ],
  permessi: { importi: true, costi: true, margini: true },
};
const totali = {} as TotaliGenerale;

const conContratto = (): DatiContratto => ({
  permessi: { importi: true, modifica: true },
  contratto: { ...CONTRATTO_VUOTO, importoBase: 1_000_000, ribassoPct: 10, oneriSicurezza: 30_000, anticipazionePct: 20, anticipazioneImporto: 20_000, ritenutaPct: 0.5, cig: "CIG1" },
  atti: [{ id: "a1", tipo: "atto_aggiuntivo", numero: "1", data: "2026-10-01", descrizione: "Lavori aggiuntivi", importo: 50_000, giorniProroga: 0, allegato: null }],
  garanzie: [{ id: "x1", tipo: "cauzione_definitiva", garante: "Banca Prova", numero: null, importo: 98_000, dataEmissione: null, scadenza: "2026-11-15", svincolataIl: null, note: null, allegato: null }],
  sal: [{
    id: "s1", numero: 1, stato: "emesso", data: "2026-10-31", note: null, cumulativo: 44_896, dal: "2026-10-01", al: "2026-10-20",
    precedente: 0, lordo: 44_896, ritenutaPct: 0.5, ritenuta: 224.48, recuperoPct: 20, recupero: 8_979.2, netto: 35_692.32,
    diContratto: true, registro: { id: "r1", stato: "trattenuta", svincolataIl: null }, firma: null,
    voci: [{ id: "v1", descrizione: "O-0025 · A.01 Scavo di sbancamento — 60 m³ × 9 €", importoContrattuale: 540, percentuale: 100, importo: 540, tipo: "misure", figliaId: "f1", voceId: "e1", quantita: 60, prezzo: 9, unita: "m³" }],
  }],
  fatture: [],
  elencoVoci: 4,
});

// Intl mette uno spazio non separabile prima di «€»; il testo letto dalla pagina ha spazi normali.
const eur = (n: number) => formattaEuroContratto(n).replace(/\s/g, " ");

const disegna = (ui: React.ReactElement, indirizzo = "/azienda/ordini/g?scheda=contratto") =>
  render(<MemoryRouter initialEntries={[indirizzo]}>{ui}</MemoryRouter>);

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-31T10:00:00"));
  m.dati = conContratto();
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("il modulo si aggancia alla pagina della generale", () => {
  it("è pronto, si chiama «Contratto e SAL» e da telefono non c'è", () => {
    expect(modulo).toMatchObject({ pronto: true, titolo: "Contratto e SAL", telefono: false });
    expect(modulo.Riquadro).toBeDefined();
  });
});

describe("la scheda del contratto", () => {
  it("senza contratto dice il prossimo passo invece di uno zero", () => {
    m.dati = { ...conContratto(), contratto: null, atti: [], garanzie: [], sal: [] };
    disegna(<SchedaContratto riepilogo={riepilogo} totali={totali} puoModificare />);
    expect(screen.getByText(/Inserisci il valore del contratto per vedere quanto resta da mettere a SAL/)).toBeVisible();
    expect(screen.getByRole("button", { name: "Compila il contratto" })).toBeVisible();
    expect(screen.queryByText(/0,00 €/)).toBeNull();
  });

  it("Previsto · Reale · A finire, e il valore si apre sulle righe da cui viene", () => {
    disegna(<SchedaContratto riepilogo={riepilogo} totali={totali} puoModificare />);
    const valore = screen.getByRole("button", { name: /Previsto · valore aggiornato/ });
    expect(valore).toHaveTextContent(eur(980_000));
    expect(screen.getByRole("button", { name: /Reale · a SAL/ })).toHaveTextContent(eur(44_896));
    expect(screen.getByRole("button", { name: /A finire/ })).toHaveTextContent(eur(935_104));
    fireEvent.click(valore);
    const dialogo = screen.getByRole("dialog", { name: "Da dove viene il valore del contratto" });
    expect(within(dialogo).getByText("Ribasso 10%")).toBeVisible();
    expect(within(dialogo).getByText("Atto aggiuntivo n. 1")).toBeVisible();
    expect(within(dialogo).getByText(eur(-100_000))).toBeVisible();
  });

  it("le scadenze vicine e le ritenute da svincolare stanno in alto", () => {
    disegna(<SchedaContratto riepilogo={riepilogo} totali={totali} puoModificare />);
    expect(screen.getByText("Cauzione definitiva scade il 15/11/2026 (tra 15 giorni).")).toBeVisible();
    expect(screen.getByRole("button", { name: /Ritenute da svincolare/ })).toHaveTextContent(eur(224.48));
    expect(screen.getByRole("button", { name: /Anticipazione da recuperare/ })).toHaveTextContent(eur(11_020.8));
  });

  it("ogni voce del SAL dice da quale ordine di lavoro arriva; il netto è dopo ritenuta e anticipazione", () => {
    disegna(<SchedaContratto riepilogo={riepilogo} totali={totali} puoModificare />, "/azienda/ordini/g?scheda=contratto&sezione=sal");
    expect(screen.getByRole("heading", { name: "SAL n. 1" })).toBeVisible();
    expect(screen.getByText(eur(35_692.32))).toBeVisible();
    expect(screen.getByRole("link", { name: "O-0025" })).toHaveAttribute("href", "/azienda/ordini/f1");
    expect(screen.getByText(/Ritenuta nel registro/)).toBeVisible();
    expect(screen.getByRole("button", { name: /Link per il committente/ })).toBeVisible();
    expect(screen.getByRole("button", { name: /Crea fattura/ })).toBeVisible();
  });

  it("chi non può modificare legge soltanto", () => {
    disegna(<SchedaContratto riepilogo={riepilogo} totali={totali} puoModificare={false} />, "/azienda/ordini/g?scheda=contratto&sezione=sal");
    expect(screen.queryByRole("button", { name: /Nuovo SAL/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /Link per il committente/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /Crea fattura/ })).toBeNull();
    expect(screen.getByRole("button", { name: /Documento/ })).toBeVisible();
  });

  it("senza il permesso degli importi non mostra niente del contratto", () => {
    m.dati = { ...conContratto(), permessi: { importi: false, modifica: false }, contratto: null, sal: [] };
    disegna(<SchedaContratto riepilogo={riepilogo} totali={totali} puoModificare />);
    expect(screen.getByText(/lo vede chi ha il permesso di vedere gli importi/)).toBeVisible();
    expect(screen.queryByText(eur(980_000))).toBeNull();
  });
});

describe("il riquadro in Panoramica", () => {
  it("ritenute, anticipazione, ultimo SAL e scadenze, con il link alla scheda", () => {
    disegna(<RiquadroContratto riepilogo={riepilogo} totali={totali} puoModificare />, "/azienda/ordini/g");
    expect(screen.getByRole("heading", { name: "Contratto e SAL" })).toBeVisible();
    expect(screen.getByText("Ritenute da svincolare").nextSibling).toHaveTextContent(eur(224.48));
    expect(screen.getByText("Anticipazione da recuperare").nextSibling).toHaveTextContent(eur(11_020.8));
    expect(screen.getByRole("link", { name: /Ultimo SAL n. 1 al 20\/10\/2026/ })).toHaveAttribute("href", "/azienda/ordini/g?scheda=contratto&sezione=sal");
    expect(screen.getByText(/Cauzione definitiva scade il 15\/11\/2026/)).toBeVisible();
  });

  it("senza contratto porta al contratto; senza permesso degli importi non c'è", () => {
    m.dati = { ...conContratto(), contratto: null };
    const { unmount } = disegna(<RiquadroContratto riepilogo={riepilogo} totali={totali} puoModificare />, "/azienda/ordini/g");
    expect(screen.getByRole("link", { name: /Vai al contratto/ })).toHaveAttribute("href", "/azienda/ordini/g?scheda=contratto");
    unmount();
    const { container } = disegna(<RiquadroContratto riepilogo={{ ...riepilogo, permessi: { importi: false, costi: false, margini: false } }} totali={totali} puoModificare />, "/azienda/ordini/g");
    expect(container).toBeEmptyDOMElement();
  });
});
