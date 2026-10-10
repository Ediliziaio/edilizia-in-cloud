/**
 * Telefonia: dice perché «Acquista» è spento, parla in euro e in italiano (10/10/2026).
 *
 * Prima «Acquista Numero» era spento senza una parola (solo un title che su tablet non si vede) e la scheda che lo sblocca stava
 * in mezzo alla pagina, dopo due scorciatoie e un riquadro; il titolo «Telefonia» era ripetuto in un h2 sotto quello della
 * testata; nella finestra d'acquisto gli importi erano «$12.00/USD/mese» mentre la tabella era in euro; «Voice» e le
 * funzionalità crude («sms», «voice»); «Importa numeri Telnyx» (il nome del fornitore sparso nei testi); il cestino non aveva un
 * nome. NON si è toccato chi può comprare, rilasciare e importare (solo l'amministratore: telefoniaSoloAdminRestoSeguePermesso).
 */
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const stato = vi.hoisted(() => ({
  admin: true,
  compliance: "approvato" as string | "errore",
  numeri: [] as Array<Record<string, unknown>>,
  numeriAi: [] as Array<Record<string, unknown>> | "errore",
  consuntivo: null as unknown,
  risultati: [] as Array<Record<string, unknown>>,
  rilascia: vi.fn(),
}));

vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ effectiveCompany: { id: "azienda-1" } }) }));
vi.mock("@/hooks/usePermissions", () => ({ usePermissions: () => ({ isAdmin: stato.admin }) }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }));
vi.mock("@/hooks/usePhoneNumbers", () => ({
  usePhoneNumbers: () => ({ data: stato.numeri, isLoading: false, isError: false }),
  useSearchAvailableNumbers: () => ({ results: stato.risultati, isSearching: false, search: async () => stato.risultati, setResults: vi.fn() }),
  usePurchaseNumber: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useReleaseNumber: () => ({ mutate: stato.rilascia }),
}));
vi.mock("@/components/telephony/TelephonyComplianceCard", () => ({ TelephonyComplianceCard: () => <div>scheda dei dati normativi</div> }));
vi.mock("@/integrations/supabase/client", () => {
  const catena = (tabella: string): unknown => {
    const proxy: unknown = new Proxy(
      {},
      {
        get(_t, metodo: string) {
          if (metodo === "then") {
            return (ok: (v: unknown) => unknown, ko: (e: unknown) => unknown) => {
              let risposta: { data: unknown; error: unknown };
              if (tabella === "company_telephony_compliance") {
                risposta = stato.compliance === "errore" ? { data: null, error: { message: "boom" } } : { data: { stato: stato.compliance }, error: null };
              } else if (tabella === "ai_phone_numbers_v2") {
                risposta = stato.numeriAi === "errore" ? { data: null, error: { message: "boom" } } : { data: stato.numeriAi, error: null };
              } else {
                risposta = { data: [], error: null };
              }
              return Promise.resolve(risposta).then(ok, ko);
            };
          }
          return () => proxy;
        },
      },
    );
    return proxy;
  };
  return {
    supabase: {
      from: (tabella: string) => catena(tabella),
      rpc: async (): Promise<{ data: unknown; error: unknown }> => ({ data: stato.consuntivo, error: null }),
    },
  };
});

import SettingsPhoneNumbers from "@/pages/azienda/settings/SettingsPhoneNumbers";

const nbsp = (testo: string | null) => (testo ?? "").replace(/\u00a0/g, " ");

function monta() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <SettingsPhoneNumbers />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const numero = (extra: Record<string, unknown> = {}) => ({
  id: "n1",
  phone_number: "+39 02 1234567",
  friendly_name: "Reception",
  capabilities: { sms: true, voice: true },
  monthly_cost_eur: 12,
  telnyx_phone_id: "t1",
  ...extra,
});

beforeEach(() => {
  stato.admin = true;
  stato.compliance = "approvato";
  stato.numeri = [numero()];
  stato.numeriAi = [];
  stato.consuntivo = null;
  stato.risultati = [];
  stato.rilascia.mockReset();
});
afterEach(() => cleanup());

describe("la testata", () => {
  it("niente titolo «Telefonia» ripetuto: una frase che dice cosa si fa qui", async () => {
    monta();
    await screen.findAllByText("Reception");
    expect(screen.queryByRole("heading", { level: 2, name: "Telefonia" })).toBeNull();
    expect(screen.getByText("Numeri per SMS, chiamate e agenti vocali. Per comprare un numero italiano servono prima i dati dell'azienda, approvati.")).toBeTruthy();
    expect(screen.queryByText(/Sistema telefonico aziendale/)).toBeNull();
  });

  it("le due scorciatoie e il riquadro sono una riga con tre collegamenti", async () => {
    monta();
    await screen.findAllByText("Reception");
    const riga = screen.getByText(/Dove li usi:/);
    expect(riga.tagName).toBe("P");
    expect(within(riga).getByRole("link", { name: "Centralino" }).getAttribute("href")).toBe("/azienda/centralino");
    expect(within(riga).getByRole("link", { name: "Agenti AI → Telefonia" }).getAttribute("href")).toBe("/azienda/agenti-ai?tab=telefonia");
    expect(within(riga).getByRole("link", { name: "Crediti" }).getAttribute("href")).toBe("/azienda/impostazioni/crediti");
    expect(riga.textContent).toContain("I numeri sono gestiti da Telnyx per conto della piattaforma; il credito SMS è in Crediti.");
    expect(screen.queryByText(/Chiama e parla dal browser/)).toBeNull();
  });
});

describe("«Acquista un numero»", () => {
  it("con i dati normativi da approvare è spento, e una riga dice perché, col collegamento alla scheda che sta in cima", async () => {
    stato.compliance = "da_compilare";
    monta();
    const acquista = await screen.findByRole("button", { name: "Acquista un numero" });
    expect(acquista).toBeDisabled();
    const motivo = await screen.findByText(/Prima compila e fai approvare «Dati normativi azienda»/);
    expect(within(motivo).getByRole("link", { name: "vai alla scheda" }).getAttribute("href")).toBe("#dati-normativi");
    // La scheda che sblocca l'acquisto sta sopra le tabelle.
    const scheda = screen.getByText("scheda dei dati normativi");
    expect(scheda.closest("#dati-normativi")).toBeTruthy();
    const tabella = screen.getByText("Numeri aziendali (SMS e voce)");
    expect(scheda.compareDocumentPosition(tabella) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(acquista.getAttribute("title")).toBeNull();
  });

  it("approvati i dati, il pulsante è acceso, non c'è la riga e la scheda scende sotto le tabelle", async () => {
    monta();
    const acquista = await screen.findByRole("button", { name: "Acquista un numero" });
    await waitFor(() => expect(acquista).toBeEnabled());
    expect(screen.queryByText(/Prima compila e fai approvare/)).toBeNull();
    // Approvati, i dati normativi scendono in fondo: dopo le tabelle e il consuntivo.
    const scheda = await screen.findByText("scheda dei dati normativi");
    const tabella = screen.getByText("Numeri aziendali (SMS e voce)");
    const consuntivo = screen.getByText("Consuntivo chiamate");
    expect(tabella.compareDocumentPosition(scheda) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(consuntivo.compareDocumentPosition(scheda) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("se i dati normativi non si riescono a leggere non dice «compila»: dice che non riesce a controllare", async () => {
    stato.compliance = "errore";
    monta();
    expect(await screen.findByText("Non riesco a controllare i dati normativi dell'azienda: riprova tra poco.")).toBeTruthy();
    expect(screen.queryByText(/Prima compila e fai approvare/)).toBeNull();
  });

  it("chi non amministra non vede il pulsante, né il motivo, né il cestino, né «Porta qui…»", async () => {
    stato.admin = false;
    stato.compliance = "da_compilare";
    monta();
    await screen.findAllByText("Reception");
    expect(screen.queryByRole("button", { name: "Acquista un numero" })).toBeNull();
    expect(screen.queryByText(/Prima compila e fai approvare/)).toBeNull();
    expect(screen.queryByRole("button", { name: /Rilascia il numero/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /Porta qui i numeri/ })).toBeNull();
  });

  it("la finestra d'acquisto: titoli e campi in italiano, importi «12,00 USD al mese», funzionalità «SMS» e «Voce»", async () => {
    stato.risultati = [{ phone_number: "+39 06 7654321", features: ["sms", "voice"], monthly_cost: { amount: "12.00", currency: "USD" } }];
    monta();
    const acquista = await screen.findByRole("button", { name: "Acquista un numero" });
    await waitFor(() => expect(acquista).toBeEnabled());
    fireEvent.click(acquista);
    const finestra = await screen.findByRole("dialog");
    expect(within(finestra).getByRole("heading", { name: "Cerca numeri disponibili" })).toBeTruthy();
    expect(within(finestra).getByLabelText("Paese")).toBeTruthy();
    expect(within(finestra).getByLabelText("Prefisso (facoltativo)")).toBeTruthy();
    expect(finestra.textContent).not.toMatch(/Telnyx|Cerca Numeri Disponibili/);

    fireEvent.click(within(finestra).getByRole("button", { name: "Cerca" }));
    const risultato = await within(finestra).findByRole("button", { name: /\+39 06 7654321/ });
    expect(nbsp(risultato.textContent)).toContain("12,00 USD al mese");
    expect(risultato.textContent).toContain("SMS");
    expect(risultato.textContent).toContain("Voce");
    expect(risultato.textContent).not.toMatch(/Voice|\$12|\/mese/);

    fireEvent.click(risultato);
    expect(within(finestra).getByRole("heading", { name: "Conferma l'acquisto" })).toBeTruthy();
    expect(nbsp(finestra.textContent)).toContain("12,00 USD al mese");
    expect(within(finestra).getByRole("button", { name: "Conferma l'acquisto" })).toBeTruthy();
    expect(within(finestra).getByLabelText("Etichetta (facoltativa)")).toBeTruthy();
    // Le funzionalità sono parole, non «sms»/«voice» crudi.
    expect(within(finestra).getAllByText(/^(SMS|Voce)$/).length).toBeGreaterThan(0);
    expect(within(finestra).queryByText(/^(sms|voice)$/)).toBeNull();
  });
});

describe("la tabella dei numeri", () => {
  it("«Costo al mese (€)», importo all'italiana, funzionalità «SMS» e «Voce»", async () => {
    monta();
    await screen.findAllByText("Reception");
    const riga = screen.getAllByText("Reception")[0].closest("tr") as HTMLElement;
    const intestazioni = within(screen.getAllByRole("table")[0]).getAllByRole("columnheader").map((h) => h.textContent);
    expect(intestazioni).toContain("Costo al mese (€)");
    expect(intestazioni).not.toContain("Costo/mese");
    expect(within(riga).getByText("12,00")).toBeTruthy();
    expect(riga.textContent).not.toContain("€12.00");
    expect(within(riga).getAllByText("SMS").length).toBeGreaterThan(0);
    expect(within(riga).getAllByText("Voce").length).toBeGreaterThan(0);
    expect(within(riga).queryByText("Voice")).toBeNull();
    expect(screen.getByText("Numeri aziendali (SMS e voce)")).toBeTruthy();
    // Un numero solo non è «1 numeri attivi».
    expect(screen.getByText("1 numero attivo · acquisto, etichetta e rilascio")).toBeTruthy();
  });

  it("sul telefono etichetta e funzionalità stanno sotto il numero, e costo e cestino restano in vista", async () => {
    monta();
    await screen.findAllByText("Reception");
    const tabella = screen.getAllByRole("table")[0];
    const riga = screen.getAllByText("Reception")[0].closest("tr") as HTMLElement;
    const celle = within(riga).getAllByRole("cell");
    // Le colonne «Etichetta» e «Funzionalità» spariscono sotto i 640 px…
    const intestazioni = within(tabella).getAllByRole("columnheader");
    for (const nome of ["Etichetta", "Funzionalità"]) {
      const colonna = intestazioni.find((h) => h.textContent === nome) as HTMLElement;
      expect(colonna.className).toMatch(/hidden/);
      expect(colonna.className).toMatch(/sm:table-cell/);
    }
    // …e quello che dicevano sta nella cella del numero, visibile solo lì.
    const cellaNumero = celle[0];
    expect(within(cellaNumero).getByText("Reception")).toBeTruthy();
    expect(within(cellaNumero).getByText("SMS")).toBeTruthy();
    expect(within(cellaNumero).getByText("Voce")).toBeTruthy();
    expect((within(cellaNumero).getByText("Reception").parentElement as HTMLElement).className).toMatch(/sm:hidden/);
    // Costo e cestino non sono nascosti sotto i 640 px.
    const costo = within(riga).getByText("12,00").closest("td") as HTMLElement;
    expect(costo.className).not.toMatch(/hidden/);
    const cestino = within(riga).getByRole("button", { name: /Rilascia il numero/ }).closest("td") as HTMLElement;
    expect(cestino.className).not.toMatch(/hidden/);
  });

  it("il cestino ha il nome del numero, è da 44 px sul telefono, e la finestra dice «Rilasciare il numero?»", async () => {
    monta();
    const cestino = await screen.findByRole("button", { name: "Rilascia il numero +39 02 1234567" });
    expect(cestino.className).toMatch(/max-md:h-11/);
    expect(cestino.className).toMatch(/max-md:w-11/);
    fireEvent.click(cestino);
    const finestra = await screen.findByRole("alertdialog");
    expect(within(finestra).getByText("Rilasciare il numero?")).toBeTruthy();
    expect(finestra.textContent).toContain("Non si può annullare: il numero non sarà più disponibile.");
    expect(finestra.textContent).not.toMatch(/irreversibile|Rilascia Numero/);
    fireEvent.click(within(finestra).getByRole("button", { name: "Rilascia il numero" }));
    expect(stato.rilascia).toHaveBeenCalledWith({ id: "n1", telnyx_phone_id: "t1" });
  });
});

describe("numeri per le chiamate AI e consuntivo", () => {
  it("«Porta qui i numeri che usi già per gli SMS» al posto di «Importa numeri Telnyx»", async () => {
    monta();
    expect(await screen.findByRole("button", { name: "Porta qui i numeri che usi già per gli SMS" })).toBeTruthy();
    expect(screen.queryByText(/Importa numeri Telnyx/)).toBeNull();
    expect(screen.getByText(/Nessun numero per le chiamate AI\. Premi/)).toBeTruthy();
  });

  it("sul telefono il pulsante lungo va sotto il testo e può andare a capo (non esce dalla pagina)", async () => {
    monta();
    const pulsante = await screen.findByRole("button", { name: "Porta qui i numeri che usi già per gli SMS" });
    expect(pulsante.className).toMatch(/max-md:whitespace-normal/);
    expect(pulsante.className).toMatch(/max-md:min-h-11/);
    const intestazione = pulsante.parentElement as HTMLElement;
    expect(intestazione.className).toMatch(/flex-col/);
    expect(intestazione.className).toMatch(/sm:flex-row/);
  });

  it("se i numeri per le chiamate AI non si leggono non dice «nessun numero»", async () => {
    stato.numeriAi = "errore";
    monta();
    expect(await screen.findByText("Non riesco a leggere i numeri per le chiamate AI. Riprova tra poco.")).toBeTruthy();
    expect(screen.queryByText(/Nessun numero per le chiamate AI/)).toBeNull();
  });

  it("il consuntivo scrive gli euro all'italiana", async () => {
    stato.consuntivo = { chiamate: 4, minuti: 18, costo_cliente: 12.5, costo_wholesale: 8, margine: 4.5 };
    monta();
    expect(nbsp((await screen.findByText(/12,50/)).textContent)).toBe("12,50 €");
    expect(nbsp(screen.getByText(/Costo Telnyx:/).textContent)).toContain("8,00 €");
    expect(nbsp(screen.getByText(/Margine:/).textContent)).toContain("4,50 €");
    expect(document.body.textContent).not.toMatch(/€12\.50/);
  });
});
