/**
 * Impostazioni → Contratti e condizioni: la schermata dell'archivio (07/11/2026).
 *
 * Cosa deve dire: quali documenti escono ancora senza condizioni dell'azienda, dove finiscono quelle che
 * ci sono, e cosa si può riusare. Chi non può gestire guarda e basta.
 */
import { render, screen, within, fireEvent } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";

const permessi = vi.hoisted(() => ({ valore: {} as Record<string, unknown> }));
const archivio = vi.hoisted(() => ({ valore: {} as Record<string, unknown> }));
const importa = vi.hoisted(() => ({ valore: {} as Record<string, unknown> }));

vi.mock("@/hooks/usePermissions", () => ({ usePermissions: () => permessi.valore }));
vi.mock("@/hooks/useCondizioniArchivio", () => ({ useCondizioniArchivio: () => archivio.valore }));
vi.mock("@/hooks/useCondizioniImporta", () => ({ useCondizioniImporta: () => importa.valore }));

import SettingsCondizioni from "@/pages/azienda/impostazioni/SettingsCondizioni";

const muta = () => ({ mutate: vi.fn(), isPending: false });

const MODELLO_SUB = {
  id: "m1", nome: "Subappalto opere edili", ambito: "subappalto", predefinito: true, attivo: true, versione: 4,
  clausole: [
    { titolo: "Sicurezza", testo: "Oneri a carico dell'impresa." },
    { titolo: "Penale", testo: "Penale per ritardo.", vessatoria: true },
  ],
};

const disegna = () =>
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <SettingsCondizioni />
    </QueryClientProvider>,
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
    const riga = screen.getByText("Subappalto opere edili").closest("div")!.parentElement!;
    expect(within(riga).getByText(/2 clausole · 1 da approvare a parte · versione 4/)).toBeInTheDocument();
    expect(screen.getByLabelText("Predefinito")).toBeInTheDocument();
    expect(screen.queryByText(/8 tipi di documento/)).toBeNull();
    expect(screen.getByText(/7 tipi di documento escono ancora/)).toBeInTheDocument();
  });

  it("l'anteprima mostra il testo come esce sul documento", () => {
    archivio.valore = { ...archivio.valore, modelli: [MODELLO_SUB] };
    disegna();
    fireEvent.click(screen.getByLabelText("Vedi come esce Subappalto opere edili"));
    expect(screen.getByText(/Oneri a carico dell'impresa\./)).toBeInTheDocument();
  });

  it("chi non può gestire non vede i pulsanti che scrivono", () => {
    permessi.valore = { isLoading: false, isAdmin: false, canManageCondizioni: false };
    archivio.valore = { ...archivio.valore, modelli: [MODELLO_SUB] };
    disegna();
    expect(screen.queryByLabelText("Modifica Subappalto opere edili")).toBeNull();
    expect(screen.queryByLabelText("Archivia Subappalto opere edili")).toBeNull();
    expect(screen.getByLabelText("Vedi come esce Subappalto opere edili")).toBeInTheDocument();
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
