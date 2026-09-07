import { describe, expect, it, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup, within } from "@testing-library/react";
import { CreateUserWizard } from "@/components/users/CreateUserWizard";

/**
 * Verifica FUNZIONALE dello step Permessi del wizard Nuovo Utente
 * (redesign 2026-07-12): percorre davvero gli step 1→2→3 e interagisce
 * con selettore economico, ricerca moduli e blocchi visibilità.
 */
function openWizardAtStep3() {
  render(
    <CreateUserWizard
      open
      onOpenChange={() => {}}
      onSubmit={vi.fn(async () => ({}))}
      isLoading={false}
    />,
  );

  // STEP 1 — scegli "Venditore" e avanti
  fireEvent.click(screen.getByText("Venditore"));
  fireEvent.click(screen.getByRole("button", { name: /avanti/i }));

  // STEP 2 — anagrafica minima e avanti
  fireEvent.change(screen.getByPlaceholderText("Mario"), { target: { value: "Test" } });
  fireEvent.change(screen.getByPlaceholderText("Rossi"), { target: { value: "Utente" } });
  fireEvent.change(screen.getByPlaceholderText("mario.rossi@azienda.it"), { target: { value: "test.utente@azienda.it" } });
  fireEvent.click(screen.getByRole("button", { name: /avanti/i }));
}

afterEach(cleanup);

/**
 * Il wizard monta l'INTERA matrice permessi (7 gruppi, ~90 moduli) a ogni
 * render. Isolato costa mezzo secondo, ma quando la suite gira coi 250 file
 * in parallelo e la macchina è satura si arriva oltre i 5s di default e il
 * test cadeva per timeout — verde o rosso a seconda di quanto era occupato
 * il portatile, che è il modo peggiore di fallire. Il tetto qui è esplicito.
 */
const TIMEOUT_MATRICE_PERMESSI = 30_000;

describe("CreateUserWizard — step Permessi (parità con la scheda utente)", () => {
  it("arriva allo step 3 e mostra selettore economico, blocchi visibilità e ricerca", () => {
    openWizardAtStep3();

    // Selettore economico condiviso
    expect(screen.getByText("Visibilità dati economici")).toBeInTheDocument();
    expect(screen.getByText("Operativo")).toBeInTheDocument();
    expect(screen.getByText("Commerciale")).toBeInTheDocument();
    expect(screen.getByText("Pieno")).toBeInTheDocument();

    // Blocchi visibilità trasversali
    expect(screen.getByText("Limita visibilità ai dati assegnati")).toBeInTheDocument();
    expect(screen.getByText("Attività del team")).toBeInTheDocument();
    expect(screen.getByText("Calendario del team")).toBeInTheDocument();

    // Ricerca + azioni rapide
    expect(screen.getByPlaceholderText("Cerca modulo…")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /nessuno/i })).toBeInTheDocument();

    // Descrizioni dei moduli renderizzate (dal registro condiviso)
    expect(screen.getByText(/Con «Modifica» si creano e si modificano/)).toBeInTheDocument();
    expect(screen.getByText("Può eliminare ordini e commesse")).toBeInTheDocument();
  }, TIMEOUT_MATRICE_PERMESSI);

  it("il preset Venditore parte a livello economico Commerciale; click su Pieno accende i margini", () => {
    openWizardAtStep3();

    // Preset venditore: importi sì, costi/margini no → "Commerciale" attivo.
    // Il livello attivo mostra il check dentro la card.
    const commercialeCard = screen.getByText("Commerciale").closest("button")!;
    expect(within(commercialeCard).queryByText("Vede importi di vendita e incassi, ma NON costi né margini.")).toBeInTheDocument();

    // Gli switch granulari: Margini spento
    const margini = screen.getByText("Margini").closest("label")!;
    expect(within(margini).getByRole("switch")).toHaveAttribute("aria-checked", "false");

    // Click su "Pieno" → margini e costi si accendono
    fireEvent.click(screen.getByText("Pieno").closest("button")!);
    expect(within(margini).getByRole("switch")).toHaveAttribute("aria-checked", "true");
    const costi = screen.getByText("Costi", { selector: "span" }).closest("label")!;
    expect(within(costi).getByRole("switch")).toHaveAttribute("aria-checked", "true");
  }, TIMEOUT_MATRICE_PERMESSI);

  it("la ricerca filtra i moduli e mostra l'empty state quando non c'è match", () => {
    openWizardAtStep3();

    const search = screen.getByPlaceholderText("Cerca modulo…");

    // Prima della ricerca il modulo Magazzino esiste
    expect(screen.getByText("Magazzino")).toBeInTheDocument();

    fireEvent.change(search, { target: { value: "firma" } });
    expect(screen.getByText("Firma Elettronica (FEA)")).toBeInTheDocument();
    expect(screen.queryByText("Magazzino")).not.toBeInTheDocument();

    fireEvent.change(search, { target: { value: "zzzz-inesistente" } });
    expect(screen.getByText(/nessun modulo corrisponde/i)).toBeInTheDocument();

    fireEvent.change(search, { target: { value: "" } });
    expect(screen.getByText("Magazzino")).toBeInTheDocument();
  }, TIMEOUT_MATRICE_PERMESSI);

  it("le 3 chiavi economiche NON compaiono doppie nei gruppi modulo", () => {
    openWizardAtStep3();
    // "Importi di vendita" esiste SOLO come switch del selettore economico,
    // non anche come riga del gruppo Cantieri (niente doppioni).
    expect(screen.getAllByText("Importi di vendita")).toHaveLength(1);
    expect(screen.getAllByText("Margini")).toHaveLength(1);
  }, TIMEOUT_MATRICE_PERMESSI);
});
