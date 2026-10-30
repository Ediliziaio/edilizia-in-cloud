import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { DatiSubappalti } from "@/lib/orders/generali/subappalti";
import type { DatiContratto } from "@/lib/orders/generali/contratto";
import type { ElencoUnita, UnitaGenerale } from "@/lib/orders/generali/unita";
import { leggiVarianti } from "@/lib/orders/generali/varianti";

/**
 * Subappalti sul contratto e varianti dell'acquirente (05/11/2028): cosa vede chi segue
 * l'appalto (quota sulla soglia, SAL passivi contro attivi, DURC) e chi vende le unità.
 */
const m = vi.hoisted(() => ({
  subappalti: null as DatiSubappalti | null,
  collega: vi.fn(),
  soglia: vi.fn(),
  scadenza: vi.fn(),
  dialogo: vi.fn(),
}));

vi.mock("@/hooks/useCommesseGenerali", () => ({ messaggioGenerale: (_e: unknown, cosa: string) => `errore ${cosa}` }));
vi.mock("@/hooks/useGeneraleSubappalti", () => ({
  useSubappaltiGenerale: () => ({ data: m.subappalti, isLoading: false, isError: false, refetch: vi.fn() }),
  useCollegaSubappalto: () => ({ mutate: m.collega, isPending: false }),
  useSogliaSubappalti: () => ({ mutate: m.soglia, isPending: false }),
}));
vi.mock("@/hooks/useGeneraleVarianti", () => ({
  useScadenzaVariante: () => ({ mutate: m.scadenza, isPending: false }),
  rileggiDopoVariante: vi.fn(),
}));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ effectiveCompany: { id: "az" } }) }));
vi.mock("@/components/orders/VariationLifecycleDialog", () => ({
  VariationLifecycleDialog: (p: { order: string; existing: boolean }) => {
    m.dialogo(p);
    return <div role="dialog">Variante {p.order}</div>;
  },
}));
vi.mock("@tanstack/react-query", async (orig) => ({ ...(await orig<typeof import("@tanstack/react-query")>()), useQueryClient: () => ({}) }));

import { SubappaltiContratto } from "@/components/orders/generali/subappalti/SubappaltiContratto";
import { VariantiUnita } from "@/components/orders/generali/varianti/VariantiUnita";

afterEach(() => { cleanup(); vi.clearAllMocks(); });

const datiContratto = (): DatiContratto => ({
  permessi: { importi: true, modifica: true },
  contratto: {
    riferimento: "Rep. 12", importoBase: 300000, ribassoPct: 0, oneriSicurezza: 0, dataFirma: null, dataConsegnaLavori: null,
    dataFinePrevista: null, dataUltimazione: null, penaleGiornaliera: null, penaleMassimaPct: 10, anticipazionePct: 0,
    anticipazioneImporto: null, anticipazioneData: null, ritenutaPct: 0.5, cig: null, cup: null, splitPayment: false, reverseCharge: false, note: null,
  } as DatiContratto["contratto"],
  atti: [],
  garanzie: [],
  sal: [{
    id: "s1", numero: 1, stato: "emesso", data: "2026-10-01", note: null, cumulativo: 120000, dal: null, al: "2026-09-30", precedente: 0,
    lordo: 120000, ritenutaPct: 0.5, ritenuta: 600, recuperoPct: 0, recupero: 0, netto: 119400, diContratto: true, registro: null, firma: null, voci: [],
  }],
  fatture: [{ id: "f1", numero: "1", data: "2026-10-05", scadenza: null, stato: "pagata", totale: 119400, incassato: 90000 }],
  elencoVoci: 0,
});

const subappalti = (soglia: number | null): DatiSubappalti => ({
  permessi: { vede: true, modifica: true },
  sogliaPct: soglia,
  ordini: [{ id: "o1", codice: "ODL-1", nome: "Scuola" }, { id: "o2", codice: "ODL-2", nome: "Palestra" }],
  subappalti: [{
    id: "c1", numero: "SUB-1", descrizione: "Carpenteria", importo: 100000, oneriSicurezza: 2000, stato: "attivo",
    dataInizio: null, dataFinePrevista: null, firmatoIl: null, orderId: "o1", ordiniCollegati: [],
    subappaltatore: { id: "s1", nome: "Carpenteria Veneta", piva: null, durcScadenza: "2020-01-01" },
    sal: [{ id: "a", numero: 1, data: "2026-09-30", lordo: 50000, ritenuta: 2500, netto: 47500, stato: "verificato", pagato: 20000 }],
    documenti: [],
  }],
});

const scheda = () => render(<MemoryRouter><SubappaltiContratto generaleId="G" dati={datiContratto()} puoModificare /></MemoryRouter>);

describe("Subappalti sul contratto", () => {
  it("quota sul valore, avviso oltre la soglia, SAL passivi contro attivi e DURC scaduto", () => {
    m.subappalti = subappalti(30);
    scheda();
    expect(screen.getByRole("alert").textContent).toContain("oltre la soglia del 30%");
    expect(screen.getByText("34% del contratto")).toBeTruthy();
    const confronto = screen.getByRole("region", { name: /Quanto incasso/ });
    expect(within(confronto).getByText("Resta sui lavori a SAL").parentElement!.textContent).toContain("70.000");
    expect(within(confronto).getByText("Resta in cassa").parentElement!.textContent).toContain("70.000");
    expect(screen.getByText(/DURC scaduto il 01\/01\/2020/)).toBeTruthy();
  });

  it("senza soglia nessun avviso; si lega il subappalto a un altro ordine", () => {
    m.subappalti = subappalti(null);
    scheda();
    expect(screen.queryByRole("alert")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /Ordini/ }));
    const dialogo = screen.getByRole("dialog");
    fireEvent.click(within(dialogo).getByText("ODL-2 · Palestra"));
    fireEvent.click(within(dialogo).getByRole("button", { name: "Salva" }));
    expect(m.collega).toHaveBeenCalledWith({ contrattoId: "c1", ordini: ["o2"] }, expect.anything());
  });

  it("chi non vede i costi trova il prossimo passo, non i numeri", () => {
    m.subappalti = { permessi: { vede: false, modifica: false }, sogliaPct: null, ordini: [], subappalti: [] };
    scheda();
    expect(screen.getByText(/li vede chi ha il permesso di vedere i costi/)).toBeTruthy();
  });
});

const unita = (): UnitaGenerale => ({
  orderId: "o-A1", codice: "U-A1", nome: "A1", scheda: true, id: "u-A1", sigla: "A1", edificio: null, piano: "1", tipologia: null,
  mq: 100, millesimi: null, listino: 300000, trattato: 290000, rogito: null, provvigione: null, stato: "compromesso",
  dataPrenotazione: null, dataCompromesso: null, rogitoPrevisto: null, dataRogito: null, acquirenteId: "cli", acquirente: "Mario Rossi",
  agenzia: null, note: null, origineId: null, divisaIl: null, movimenti: [], importoCommessa: 290000, costoDiretto: 0, variantiAccettate: 8000,
});

const elenco = (): ElencoUnita => ({
  modello: "sviluppo", costiGenerale: 0, permessi: { importi: true, costi: true, margini: true, modifica: true }, unita: [unita()],
  varianti: leggiVarianti({
    permessi: { importi: true, costi: true, modifica: true },
    varianti: [
      { id: "v1", order_id: "o-A1", numero: 1, titolo: "Parquet", stato: "approvato", importo: 8000, costo_previsto: "5000", firmata_il: "2026-10-10", canale: "offline", documento: true },
      { id: "v2", order_id: "o-A1", numero: 2, titolo: "Doccia", stato: "in_attesa", importo: 3000, documento: true },
      { id: "v3", order_id: "o-B1", numero: 1, titolo: "Altra unità", stato: "approvato", importo: 1000 },
    ],
  }),
});

describe("Varianti dell'acquirente", () => {
  it("le accettate entrano nel prezzo; le proposte restano da decidere", () => {
    render(<VariantiUnita generaleId="G" unita={unita()} elenco={elenco()} gestisci />);
    expect(screen.getByText("Prezzo con varianti").nextElementSibling!.textContent).toContain("298.000");
    expect(screen.getByText("una da decidere")).toBeTruthy();
    expect(screen.queryByText("Altra unità")).toBeNull();
    expect(screen.getByText(/Firmata il 10\/10\/2026 su carta/)).toBeTruthy();
    expect(screen.getByText(/margine delle varianti/).textContent).toMatch(/margine delle varianti 3\.?000/);
  });

  it("la nuova variante usa il flusso delle varianti di commessa, sulla commessa dell'unità", () => {
    render(<VariantiUnita generaleId="G" unita={unita()} elenco={elenco()} gestisci />);
    fireEvent.click(screen.getByRole("button", { name: /Nuova variante/ }));
    expect(m.dialogo).toHaveBeenCalledWith(expect.objectContaining({ order: "o-A1", existing: false, company: "az" }));
  });

  it("la scadenza delle scelte si salva lasciando il campo", () => {
    render(<VariantiUnita generaleId="G" unita={unita()} elenco={elenco()} gestisci />);
    const campo = screen.getByLabelText("Scadenza delle scelte di Doccia");
    fireEvent.change(campo, { target: { value: "2026-11-15" } });
    fireEvent.blur(campo);
    expect(m.scadenza).toHaveBeenCalledWith({ variazioneId: "v2", scadenza: "2026-11-15" }, expect.anything());
  });

  it("senza permesso di modifica solo lettura", () => {
    render(<VariantiUnita generaleId="G" unita={unita()} elenco={elenco()} gestisci={false} />);
    expect(screen.queryByRole("button", { name: /Nuova variante/ })).toBeNull();
    expect(screen.queryByLabelText(/Scadenza delle scelte/)).toBeNull();
  });
});
