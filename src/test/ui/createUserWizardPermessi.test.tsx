import { describe, expect, it, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup, within, waitFor } from "@testing-library/react";
import { CreateUserWizard, type WizardUserFormData } from "@/components/users/CreateUserWizard";

type RisultatoCreazione = { temporaryPassword?: string };
const creaUtente = (esito: RisultatoCreazione = {}) =>
  vi.fn(async (_dati: WizardUserFormData): Promise<RisultatoCreazione> => esito);

/**
 * Nuovo utente (ridisegnato il 25/09/2026): nome, email e ruolo su un passo
 * solo, «Crea utente» subito col preset del ruolo; «Personalizza» apre i
 * permessi (importi, solo i suoi dati, sola lettura in cima; moduli in gruppi
 * chiusi che la ricerca apre; avanzate). Qui si percorre davvero il flusso.
 */
function renderWizard(onSubmit = creaUtente()) {
  render(
    <CreateUserWizard
      open
      onOpenChange={() => {}}
      onSubmit={onSubmit}
      isLoading={false}
    />,
  );
  return onSubmit;
}

function compilaDati() {
  fireEvent.change(screen.getByPlaceholderText("Mario"), { target: { value: "Test" } });
  fireEvent.change(screen.getByPlaceholderText("Rossi"), { target: { value: "Utente" } });
  fireEvent.change(screen.getByPlaceholderText("mario.rossi@azienda.it"), { target: { value: "test.utente@azienda.it" } });
}

function apriPermessiVenditore() {
  renderWizard();
  fireEvent.click(screen.getByText("Venditore"));
  compilaDati();
  fireEvent.click(screen.getByRole("button", { name: /personalizza/i }));
}

function cercaModulo(testo: string) {
  fireEvent.change(screen.getByPlaceholderText("Cerca modulo…"), { target: { value: testo } });
}

afterEach(cleanup);

/**
 * La matrice permessi (7 gruppi, ~90 moduli) è pesante da montare: quando la
 * suite gira coi 250 file in parallelo e la macchina è satura si arriva oltre
 * i 5s di default. Il tetto qui è esplicito.
 */
const TIMEOUT_MATRICE_PERMESSI = 30_000;

describe("CreateUserWizard — nuovo utente", () => {
  it("crea l'utente dal primo passo col preset del ruolo", async () => {
    const onSubmit = renderWizard();
    fireEvent.click(screen.getByText("Venditore"));
    compilaDati();
    // Il riassunto dice cosa potrà fare prima di creare.
    expect(screen.getByText("Permessi da Venditore")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /crea utente/i }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    const dati = onSubmit.mock.calls[0][0];
    expect(dati.role_type).toBe("salesperson");
    expect(dati.email).toBe("test.utente@azienda.it");
    expect(dati.permissions?.can_view_marketing_contacts).toBe(true);
  }, TIMEOUT_MATRICE_PERMESSI);

  it("senza email valida non crea e non passa ai permessi", () => {
    const onSubmit = renderWizard();
    fireEvent.change(screen.getByPlaceholderText("Mario"), { target: { value: "Test" } });
    fireEvent.change(screen.getByPlaceholderText("Rossi"), { target: { value: "Utente" } });
    fireEvent.change(screen.getByPlaceholderText("mario.rossi@azienda.it"), { target: { value: "non-una-email" } });
    fireEvent.click(screen.getByRole("button", { name: /personalizza/i }));
    expect(screen.queryByPlaceholderText("Cerca modulo…")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /crea utente/i }));
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("alla fine mostra le credenziali e le copia in un messaggio pronto", async () => {
    const writeText = vi.fn(async (_testo: string) => {});
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    renderWizard(creaUtente({ temporaryPassword: "Abc-123-xyz" }));
    fireEvent.click(screen.getByText("Operaio / Tecnico"));
    compilaDati();
    fireEvent.click(screen.getByRole("button", { name: /crea utente/i }));
    expect(await screen.findByText("Abc-123-xyz")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /copia accesso/i }));
    await waitFor(() => expect(writeText).toHaveBeenCalled());
    const testo = writeText.mock.calls[0][0] as string;
    expect(testo).toContain("test.utente@azienda.it");
    expect(testo).toContain("Abc-123-xyz");
    // L'operaio entra dall'app di cantiere, non dal gestionale.
    expect(testo).toContain("lavori.ediliziaincloud.com");
  });
});

describe("CreateUserWizard — permessi (parità con la scheda utente)", () => {
  it("in cima importi, solo i suoi dati e sola lettura; poi ricerca e avanzate", () => {
    apriPermessiVenditore();

    expect(screen.getByText("Importi")).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "Operativo" })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "Commerciale" })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "Pieno" })).toBeInTheDocument();
    expect(screen.getByText("Solo i dati assegnati a lui")).toBeInTheDocument();
    expect(screen.getByText("Sola lettura")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Cerca modulo…")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /nessuno/i })).toBeInTheDocument();

    // Visibilità sul team: nelle avanzate.
    fireEvent.click(screen.getByRole("button", { name: /avanzate/i }));
    expect(screen.getByText("Attività del team")).toBeInTheDocument();
    expect(screen.getByText("Calendario del team")).toBeInTheDocument();

    // La ricerca apre i gruppi: descrizioni dal registro condiviso.
    cercaModulo("commesse");
    expect(screen.getByText(/Vede, crea e modifica le commesse/)).toBeInTheDocument();
    expect(screen.getByText("Può eliminare ordini e commesse")).toBeInTheDocument();
  }, TIMEOUT_MATRICE_PERMESSI);

  it("il preset Venditore parte a importi Commerciale; Pieno accende costi e margini", () => {
    apriPermessiVenditore();

    expect(screen.getByRole("radio", { name: "Commerciale" })).toHaveAttribute("aria-checked", "true");

    fireEvent.click(screen.getByRole("button", { name: /avanzate/i }));
    const margini = screen.getByText("Margini").closest("label")!;
    expect(within(margini).getByRole("switch")).toHaveAttribute("aria-checked", "false");

    fireEvent.click(screen.getByRole("radio", { name: "Pieno" }));
    expect(within(margini).getByRole("switch")).toHaveAttribute("aria-checked", "true");
    const costi = screen.getByText("Costi", { selector: "span" }).closest("label")!;
    expect(within(costi).getByRole("switch")).toHaveAttribute("aria-checked", "true");
  }, TIMEOUT_MATRICE_PERMESSI);

  it("la ricerca filtra i moduli e mostra il messaggio quando non c'è niente", () => {
    apriPermessiVenditore();

    // I gruppi partono chiusi: la ricerca li apre sui moduli trovati.
    expect(screen.queryByText("Magazzino")).not.toBeInTheDocument();
    cercaModulo("magazz");
    expect(screen.getByText("Magazzino")).toBeInTheDocument();

    cercaModulo("firma");
    expect(screen.getByText("Firma Elettronica (FEA)")).toBeInTheDocument();
    expect(screen.queryByText("Magazzino")).not.toBeInTheDocument();

    cercaModulo("zzzz-inesistente");
    expect(screen.getByText(/nessun modulo corrisponde/i)).toBeInTheDocument();

    cercaModulo("");
    expect(screen.queryByText(/nessun modulo corrisponde/i)).not.toBeInTheDocument();
  }, TIMEOUT_MATRICE_PERMESSI);

  it("le 3 chiavi economiche NON compaiono doppie nei gruppi modulo", () => {
    apriPermessiVenditore();
    fireEvent.click(screen.getByRole("button", { name: /avanzate/i }));
    cercaModulo("import");
    // "Importi di vendita" esiste SOLO come switch delle avanzate, non anche
    // come riga del gruppo Cantieri (niente doppioni).
    expect(screen.getAllByText("Importi di vendita")).toHaveLength(1);
    cercaModulo("margin");
    expect(screen.getAllByText("Margini")).toHaveLength(1);
  }, TIMEOUT_MATRICE_PERMESSI);

  it("le aree operative non hanno più un «Modifica» a parte", () => {
    apriPermessiVenditore();
    cercaModulo("commesse");
    expect(document.getElementById("wiz-can_edit_orders")).toBeNull();
    cercaModulo("contatti");
    expect(document.getElementById("wiz-can_edit_marketing_contacts")).toBeNull();
  }, TIMEOUT_MATRICE_PERMESSI);

  it("con Sola lettura le azioni speciali si disabilitano", () => {
    apriPermessiVenditore();
    cercaModulo("sconti");
    const approva = document.getElementById("wiz-can_approve_discounts")!;
    expect(approva).not.toBeDisabled();
    fireEvent.click(document.getElementById("wiz-sola_lettura")!);
    expect(approva).toBeDisabled();
    expect(approva).toHaveAttribute("aria-checked", "false");
  }, TIMEOUT_MATRICE_PERMESSI);
});
