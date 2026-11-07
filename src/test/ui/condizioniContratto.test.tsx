/**
 * Il blocco «Clausole contrattuali» negli editor dei preventivatori (07/11/2026).
 *
 * Florin: «le definisco in Contratti e condizioni e le associo: non le devo modificare da altre parti».
 * Qui non si scrive più il testo: si vede cosa esce nel PDF e da dove, si sceglie quale modello
 * dell'archivio usa il preventivatore, e chi ha ancora il testo nel modulo lo porta nell'archivio
 * senza crearne un doppione.
 */
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

const archivio = vi.hoisted(() => ({ valore: {} as Record<string, unknown> }));
vi.mock("@/hooks/useCondizioniArchivio", () => ({ useCondizioniArchivio: () => archivio.valore }));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ effectiveCompany: { name: "Edile Prova" } }) }));
vi.mock("@/components/shared/PdfBlobLivePreviewPanel", () => ({
  PdfBlobLivePreviewPanel: ({ depsKey }: { depsKey: string }) => <div data-testid="anteprima-pdf">{depsKey}</div>,
}));

import { CondizioniContratto } from "@/components/preventivi/CondizioniContratto";

const modello = (p: Record<string, unknown> = {}) => ({
  id: "m1", nome: "Condizioni 2026", ambito: "preventivo", predefinito: true, attivo: true, versione: 3,
  clausole: [{ titolo: "Pagamenti", testo: "30% alla firma." }], ...p,
});

const salva = vi.fn(async () => ({ id: "nuovo", nome: "Bagni · condizioni", versione: 1 }));

function disegna(props: Partial<Parameters<typeof CondizioniContratto>[0]> = {}) {
  const onAssocia = vi.fn();
  const onAttivo = vi.fn();
  const onRecesso = vi.fn();
  render(
    <MemoryRouter>
      <CondizioniContratto companyId="c" settore="bagni" nomeModulo="Bagni" attivo testo="" onAttivo={onAttivo}
        modelloAssociatoId={null} onAssocia={onAssocia} recesso={false} onRecesso={onRecesso} {...props} />
    </MemoryRouter>,
  );
  return { onAssocia, onAttivo, onRecesso };
}

beforeEach(() => {
  salva.mockClear();
  archivio.valore = { modelli: [], salvaModello: { mutateAsync: salva, isPending: false } };
});

describe("Cosa esce nel PDF, e da dove", () => {
  it("con un predefinito nell'archivio, dice quale e porta a modificarlo lì", () => {
    archivio.valore = { ...archivio.valore, modelli: [modello()] };
    disegna();
    expect(screen.getByText(/Nel PDF esce/)).toHaveTextContent("«Condizioni 2026»");
    expect(screen.getByText(/versione 3 · da Contratti e condizioni/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Apri e modifica/ })).toHaveAttribute("href", "/azienda/impostazioni/contratti-e-condizioni/modello/m1");
    // Nessuna casella per scrivere il testo qui.
    expect(screen.queryByRole("textbox")).toBeNull();
  });

  it("il modello associato al preventivatore vince sul predefinito, e si cambia dalla tendina", () => {
    archivio.valore = { ...archivio.valore, modelli: [modello(), modello({ id: "m2", nome: "Condizioni bagno", predefinito: false })] };
    const { onAssocia } = disegna({ modelloAssociatoId: "m2" });
    expect(screen.getByText(/Nel PDF esce/)).toHaveTextContent("«Condizioni bagno»");
    fireEvent.change(screen.getByLabelText("Modello delle condizioni per questo preventivatore"), { target: { value: "" } });
    expect(onAssocia).toHaveBeenCalledWith(null);
  });

  it("solo i modelli dei preventivi: quello dell'appalto o della fattura non si propone", () => {
    archivio.valore = { ...archivio.valore, modelli: [modello(), modello({ id: "a", nome: "Appalto", ambito: "appalto", predefinito: false }), modello({ id: "b", nome: "Bagno", predefinito: false })] };
    disegna();
    const opzioni = Array.from((screen.getByLabelText("Modello delle condizioni per questo preventivatore") as HTMLSelectElement).options).map((o) => o.text);
    expect(opzioni).toEqual(["il predefinito («Condizioni 2026»)", "Bagno"]);
  });

  it("senza niente da nessuna parte, dice che escono quelle di base del settore", () => {
    disegna();
    expect(screen.getByText(/condizioni di base del settore/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Scrivi le tue/ })).toHaveAttribute("href", "/azienda/impostazioni/contratti-e-condizioni");
  });
});

describe("L'anteprima è il PDF vero", () => {
  it("il bottone apre il PDF del modello che esce, e lo monta solo quando serve", () => {
    archivio.valore = { ...archivio.valore, modelli: [modello()] };
    disegna();
    expect(screen.queryByTestId("anteprima-pdf")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /Anteprima condizioni/ }));
    expect(screen.getByTestId("anteprima-pdf")).toHaveTextContent("m1:3");
  });

  it("c'è anche quando escono le condizioni di base del settore", () => {
    disegna();
    fireEvent.click(screen.getByRole("button", { name: /Anteprima condizioni/ }));
    expect(screen.getByTestId("anteprima-pdf")).toHaveTextContent("modulo:1");
  });
});

describe("Il testo che il modulo aveva non si perde", () => {
  it("si dice che esce ancora quello, e si porta nell'archivio associandolo al preventivatore", async () => {
    const { onAssocia } = disegna({ testo: "<p>Le condizioni scritte nel modulo dei bagni.</p>" });
    expect(screen.getByText(/Nel PDF esce il testo scritto in questo preventivatore/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Porta questo testo nell'archivio" }));
    await vi.waitFor(() => expect(onAssocia).toHaveBeenCalledWith("nuovo"));
    expect(salva).toHaveBeenCalledWith(expect.objectContaining({
      nome: "Bagni · condizioni", ambito: "preventivo", predefinito: false,
      clausole: [{ titolo: "Condizioni generali", testo: "<p>Le condizioni scritte nel modulo dei bagni.</p>" }],
    }));
  });

  it("se lo stesso testo è già nell'archivio, associa quello invece di farne un doppione", () => {
    archivio.valore = { ...archivio.valore, modelli: [modello({ id: "gia", nome: "Importato", predefinito: false, attivo: true,
      clausole: [{ titolo: "Condizioni generali", testo: "Le condizioni   scritte nel modulo dei bagni." }] })] };
    // Un modello attivo ma non predefinito, non associato: il PDF esce ancora col testo del modulo.
    const { onAssocia } = disegna({ testo: "<p>Le condizioni scritte nel modulo dei bagni.</p>" });
    fireEvent.click(screen.getByRole("button", { name: /Usa «Importato», che è lo stesso testo/ }));
    expect(onAssocia).toHaveBeenCalledWith("gia");
    expect(salva).not.toHaveBeenCalled();
  });
});

describe("Gli interruttori restano dove sono", () => {
  it("spento, il blocco non mostra altro; il modulo di recesso si accende", () => {
    const spento = disegna({ attivo: false });
    expect(screen.queryByText(/Nel PDF/)).toBeNull();
    fireEvent.click(screen.getByLabelText("Condizioni generali nel documento"));
    expect(spento.onAttivo).toHaveBeenCalledWith(true);
  });

  it("il modulo di recesso è spento di serie, dice quando serve e si accende", () => {
    const { onRecesso } = disegna();
    expect(screen.getByText(/a casa sua o a distanza/)).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText("Allega il modulo di recesso"));
    expect(onRecesso).toHaveBeenCalledWith(true);
  });
});
