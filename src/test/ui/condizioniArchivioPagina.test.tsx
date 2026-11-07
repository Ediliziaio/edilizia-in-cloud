/**
 * Impostazioni → Contratti e condizioni: la schermata dell'archivio (07/11/2026).
 *
 * Cosa deve dire: quali documenti escono ancora senza condizioni dell'azienda, dove finiscono quelle che
 * ci sono, e cosa si può riusare. Chi non può gestire guarda e basta.
 */
import { render, screen, within, fireEvent } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, useLocation } from "react-router-dom";

function DoveSono() { return <span data-testid="dove-sono">{useLocation().pathname}</span>; }
import { beforeEach, describe, expect, it, vi } from "vitest";

const permessi = vi.hoisted(() => ({ valore: {} as Record<string, unknown> }));
const archivio = vi.hoisted(() => ({ valore: {} as Record<string, unknown> }));
const importa = vi.hoisted(() => ({ valore: {} as Record<string, unknown> }));

vi.mock("@/hooks/usePermissions", () => ({ usePermissions: () => permessi.valore }));
vi.mock("@/hooks/useCondizioniArchivio", () => ({ useCondizioniArchivio: () => archivio.valore }));
vi.mock("@/hooks/useCondizioniImporta", () => ({ useCondizioniImporta: () => importa.valore }));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ effectiveCompany: { id: "c", name: "Impresa Esempio" } }) }));
// Il PDF vero non si disegna in jsdom: basta sapere quale modello mostrerebbe.
vi.mock("@/components/shared/PdfBlobLivePreviewPanel", () => ({
  PdfBlobLivePreviewPanel: ({ depsKey }: { depsKey: string }) => <div data-testid="anteprima-pdf">{depsKey}</div>,
}));

import SettingsCondizioni from "@/pages/azienda/impostazioni/SettingsCondizioni";

const muta = () => ({ mutate: vi.fn(), isPending: false });

const MODELLO_SUB = {
  id: "m1", nome: "Subappalto opere edili", ambito: "subappalto", predefinito: true, attivo: true, versione: 4,
  clausole: [
    { titolo: "Sicurezza", testo: "Oneri a carico dell'impresa." },
    { titolo: "Penale", testo: "Penale per ritardo.", vessatoria: true },
  ],
};

/** La scheda aperta sta nell'indirizzo (07/11/2026): serve un router anche solo per leggerlo. */
const disegna = (indirizzo = "/azienda/impostazioni/contratti-e-condizioni") =>
  render(
    <MemoryRouter initialEntries={[indirizzo]}>
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <SettingsCondizioni />
        <DoveSono />
      </QueryClientProvider>
    </MemoryRouter>,
  );

describe("Contratti e condizioni", () => {
  beforeEach(() => {
    permessi.valore = { isLoading: false, isAdmin: false, canManageCondizioni: true };
    archivio.valore = {
      disponibile: true, inCaricamento: false, clausole: [], modelli: [],
      salvaClausola: muta(), clausoleDiPartenza: muta(), eliminaClausola: muta(), salvaModello: muta(), eliminaModello: muta(),
    };
    importa.valore = { inCerca: false, trovate: { clausole: [], modelli: [] }, importa: muta() };
  });

  it("con l'archivio vuoto dice quanti documenti escono ancora col testo di sistema", () => {
    disegna();
    expect(screen.getByText(/8 tipi di documento escono ancora col testo di sistema/)).toBeInTheDocument();
  });

  it("raggruppa per destinatario e dice dove finiscono le condizioni di ogni tipo", () => {
    disegna();
    for (const gruppo of ["Al cliente", "Al fornitore", "Al subappaltatore", "Al dipendente"]) {
      expect(screen.getByText(gruppo)).toBeInTheDocument();
    }
    expect(screen.getByText("Nel contratto che fai firmare al subappaltatore")).toBeInTheDocument();
    expect(screen.getByText("Negli ordini e nelle richieste d'offerta ai fornitori")).toBeInTheDocument();
  });

  it("del modello predefinito dice clausole, quante vanno approvate a parte e a che versione è", () => {
    archivio.valore = { ...archivio.valore, modelli: [MODELLO_SUB] };
    disegna();
    const riga = screen.getByLabelText("Mostra l'anteprima di Subappalto opere edili");
    expect(within(riga).getByText(/2 clausole · 1 da approvare a parte · versione 4/)).toBeInTheDocument();
    expect(screen.getByLabelText("Predefinito")).toBeInTheDocument();
    expect(screen.queryByText(/8 tipi di documento/)).toBeNull();
    expect(screen.getByText(/7 tipi di documento escono ancora/)).toBeInTheDocument();
  });

  it("un modello si apre nella sua pagina, dove c'è il PDF vero (07/11/2026: niente più popup)", () => {
    archivio.valore = { ...archivio.valore, modelli: [MODELLO_SUB] };
    disegna();
    fireEvent.click(screen.getByLabelText("Modifica Subappalto opere edili"));
    expect(screen.getByTestId("dove-sono")).toHaveTextContent("/azienda/impostazioni/contratti-e-condizioni/modello/m1");
  });

  it("chi non può gestire non vede i pulsanti che scrivono", () => {
    permessi.valore = { isLoading: false, isAdmin: false, canManageCondizioni: false };
    archivio.valore = { ...archivio.valore, modelli: [MODELLO_SUB] };
    disegna();
    expect(screen.queryByLabelText("Modifica Subappalto opere edili")).toBeNull();
    expect(screen.queryByLabelText("Archivia Subappalto opere edili")).toBeNull();
    // Lo apre e lo legge, senza poterlo cambiare.
    expect(screen.getByLabelText("Apri Subappalto opere edili")).toBeInTheDocument();
  });

  it("la libreria vuota offre le clausole di partenza, e le scrive tutte in un colpo", () => {
    disegna();
    fireEvent.click(screen.getByRole("tab", { name: /Clausole/ }));
    fireEvent.click(screen.getByRole("button", { name: /Parti dalle clausole di base/ }));
    const mutate = (archivio.valore.clausoleDiPartenza as { mutate: ReturnType<typeof vi.fn> }).mutate;
    expect(mutate).toHaveBeenCalledTimes(1);
    expect(mutate.mock.calls[0][0].length).toBeGreaterThan(5);
  });

  it("nella libreria ogni clausola dice in quanti modelli è finita", () => {
    archivio.valore = {
      ...archivio.valore,
      modelli: [{ ...MODELLO_SUB, clausole: [{ clausola_id: "c1", titolo: "Pagamenti", testo: "…" }] }],
      clausole: [
        { id: "c1", titolo: "Pagamenti", testo: "30% alla firma.", categoria: "Pagamenti", vessatoria: false, attiva: true },
        { id: "c2", titolo: "Foro competente", testo: "Foro dell'impresa.", categoria: "Legale", vessatoria: true, attiva: true },
      ],
    };
    disegna();
    fireEvent.click(screen.getByRole("tab", { name: /Clausole/ }));
    expect(screen.getByText("in 1 modello")).toBeInTheDocument();
    expect(screen.getByText("non è in nessun modello")).toBeInTheDocument();
    expect(screen.getByText("da approvare a parte")).toBeInTheDocument();
    expect(screen.getByText("Legale")).toBeInTheDocument();
  });

  it("se le tabelle non ci sono lo dice invece di mostrare un archivio finto", () => {
    archivio.valore = { ...archivio.valore, disponibile: false };
    disegna();
    expect(screen.getByRole("alert")).toHaveTextContent(/non è ancora attivo/);
  });

  it("dice quello che l'azienda ha già scritto altrove e lo porta dentro senza toccare gli originali", () => {
    importa.valore = {
      inCerca: false,
      trovate: {
        clausole: [{ titolo: "Oggetto del contratto", testo: "…", categoria: null, vessatoria: true, fonte: "Condizioni della firma" }],
        modelli: [{ nome: "Condizioni generali d'appalto", ambito: "preventivo", fonte: "Modelli preventivi e contratti", clausole: [{ titolo: "Condizioni generali", testo: "<p>Testo lungo del contratto.</p>" }] }],
      },
      importa: muta(),
    };
    disegna();
    expect(screen.getByText("Le condizioni che hai già")).toBeInTheDocument();
    expect(screen.getByText(/Ho trovato 1 testo e 1 clausola/)).toBeInTheDocument();
    expect(screen.getByText("Condizioni generali d'appalto")).toBeInTheDocument();
    expect(screen.getByText(/gli originali restano dove sono/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Portali nell'archivio/ }));
    expect((importa.valore.importa as { mutate: ReturnType<typeof vi.fn> }).mutate).toHaveBeenCalledTimes(1);
  });

  it("se non c'è niente da importare il riquadro non compare", () => {
    disegna();
    expect(screen.queryByText("Le condizioni che hai già")).toBeNull();
  });
});

/**
 * Una pagina sola (07/11/2026): le due pagine sorelle — le clausole che il cliente approva quando
 * firma, e la firma elettronica — sono diventate schede di questa. Ognuna resta dietro il permesso
 * che aveva: chi non poteva vederle non se le trova qui per sbaglio.
 */
describe("Le schede delle firme stanno qui dentro", () => {
  beforeEach(() => {
    archivio.valore = { modelli: [], clausole: [], disponibile: true, caricamento: false, salvaModello: muta(), eliminaModello: muta(), salvaClausola: muta(), eliminaClausola: muta(), clausoleDiPartenza: muta() };
    importa.valore = { inCerca: false, trovate: { clausole: [], modelli: [] }, importa: muta() };
  });

  it("chi ha listino e integrazioni vede anche «Firma del preventivo» e «Firma elettronica»", () => {
    permessi.valore = { isLoading: false, isAdmin: false, canManageCondizioni: true, canViewSettingsPricing: true, canViewSettingsIntegrations: true };
    disegna();
    const schede = screen.getAllByRole("tab").map((t) => t.textContent);
    expect(schede).toEqual(["Modelli (0)", "Clausole (0)", "Firma del preventivo", "Firma elettronica"]);
  });

  it("senza quei permessi restano solo i modelli e le clausole", () => {
    permessi.valore = { isLoading: false, isAdmin: false, canManageCondizioni: true };
    disegna();
    expect(screen.getAllByRole("tab").map((t) => t.textContent)).toEqual(["Modelli (0)", "Clausole (0)"]);
  });

  it("il vecchio indirizzo apre la scheda giusta, e lì non si propone di importare", () => {
    permessi.valore = { isLoading: false, isAdmin: true };
    importa.valore = { inCerca: false, trovate: { clausole: [{ titolo: "Foro", testo: "…", categoria: null, vessatoria: true, fonte: "Condizioni della firma" }], modelli: [] }, importa: muta() };
    disegna("/azienda/impostazioni/contratti-e-condizioni?scheda=firma");
    expect(screen.getByRole("tab", { name: "Firma del preventivo" })).toHaveAttribute("aria-selected", "true");
    expect(screen.queryByText("Le condizioni che hai già")).toBeNull();
  });
});

describe("L'anteprima è sempre a fianco (07/11/2026)", () => {
  beforeEach(() => {
    permessi.valore = { isLoading: false, isAdmin: true };
    importa.valore = { inCerca: false, trovate: { clausole: [], modelli: [] }, importa: muta() };
  });

  it("mostra il PDF del predefinito appena si apre, e cambia modello con un clic", () => {
    const altro = { ...MODELLO_SUB, id: "m2", nome: "Subappalto impianti", predefinito: false, versione: 1 };
    archivio.valore = { modelli: [MODELLO_SUB, altro], clausole: [], disponibile: true, caricamento: false,
      salvaModello: muta(), eliminaModello: muta(), salvaClausola: muta(), eliminaClausola: muta(), clausoleDiPartenza: muta() };
    disegna();
    expect(screen.getByTestId("anteprima-pdf")).toHaveTextContent("m1:4");
    fireEvent.click(screen.getByLabelText("Mostra l'anteprima di Subappalto impianti"));
    expect(screen.getByTestId("anteprima-pdf")).toHaveTextContent("m2:1");
  });
});
