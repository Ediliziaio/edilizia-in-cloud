/**
 * Pagina di un numero WhatsApp: sola lettura onesta, bozza protetta, parole di tutti i giorni (09/10/2026).
 *
 * Prima i campi si potevano scrivere tutti e solo «Salva impostazioni» era spento (con la frase in fondo alla pagina):
 * chi non amministra scriveva e poi non poteva salvare. Ora i campi sono spenti e la frase sta in cima. «Salva» sta in
 * una barra che resta in vista, uscire con modifiche non salvate chiede conferma, e le sezioni hanno nomi che un
 * titolare capisce («Come lavora Silvio sui cantieri», non «Playbook operativo cantieri»).
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type Risposta = { data: unknown; error: unknown };

const db = vi.hoisted(() => ({
  lettura: { data: null, error: null } as { data: unknown; error: unknown },
  scrittura: { data: [{ id: "numero-1" }], error: null } as { data: unknown; error: unknown },
  aggiornamenti: [] as unknown[],
}));
const permessi = vi.hoisted(() => ({ isAdmin: true }));
const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() }));

vi.mock("@/integrations/supabase/client", () => {
  const catena = (): unknown => {
    let scrive = false;
    const proxy: unknown = new Proxy(
      {},
      {
        get(_t, metodo: string) {
          if (metodo === "then") {
            return (ok: (v: Risposta) => unknown, ko: (e: unknown) => unknown) =>
              Promise.resolve(scrive ? db.scrittura : db.lettura).then(ok, ko);
          }
          return (...argomenti: unknown[]) => {
            if (metodo === "update") {
              scrive = true;
              db.aggiornamenti.push(argomenti[0]);
            }
            return proxy;
          };
        },
      },
    );
    return proxy;
  };
  return { supabase: { from: () => catena(), functions: { invoke: async (): Promise<Risposta> => ({ data: null as unknown, error: null as unknown }) } } };
});
vi.mock("sonner", () => ({ toast }));
vi.mock("@/hooks/usePermissions", () => ({ usePermissions: () => ({ isAdmin: permessi.isAdmin }) }));
vi.mock("@/hooks/useEffectiveCompanyId", () => ({ useEffectiveCompanyId: () => "azienda-1" }));
vi.mock("@/components/whatsapp-multi/WhatsAppEmbeddedSignupButton", () => ({ WhatsAppEmbeddedSignupButton: () => <button>Continua con Meta</button> }));

import WANumberDetailPage from "@/pages/azienda/whatsapp/WANumberDetailPage";
import { ConnectNumberWizard } from "@/components/whatsapp-multi/ConnectNumberWizard";
import { SOLO_AMMINISTRATORI_WA, type WANumber } from "@/hooks/whatsapp/useWhatsAppNumbers";
import { confermaNavigazioneImpostazioni } from "@/hooks/useSettingsDraftGuard";

const numero = (purpose: string): WANumber =>
  ({
    id: "numero-1",
    company_id: "azienda-1",
    purpose,
    display_name: "Cantieri Rossi",
    numero: "+39 351 000 0000",
    phone_number_id: null,
    waba_id: null,
    stato: "active",
    webhook_verified: true,
    daily_budget_eur: 10,
    current_day_spend_eur: 0,
    operational_settings: {},
    messaggio_benvenuto: null,
    messaggio_fuori_orario: null,
  }) as unknown as WANumber;

function apri() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={["/azienda/whatsapp/numeri/numero-1"]}>
        <Routes>
          <Route path="/azienda/whatsapp/numeri/:id" element={<WANumberDetailPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  db.lettura = { data: numero("bot_operativo"), error: null };
  db.scrittura = { data: [{ id: "numero-1" }], error: null };
  db.aggiornamenti.length = 0;
  permessi.isAdmin = true;
  Object.values(toast).forEach((f) => f.mockReset());
});

afterEach(() => cleanup());

describe("sola lettura onesta", () => {
  it("chi non amministra: la frase in cima (una volta sola), campi e «Salva» spenti", async () => {
    permessi.isAdmin = false;
    apri();
    expect(await screen.findByText(SOLO_AMMINISTRATORI_WA)).toBeTruthy();
    expect(screen.getAllByText(SOLO_AMMINISTRATORI_WA)).toHaveLength(1);
    // Un fieldset spento spegne tutto quello che contiene (anche tendine e interruttori).
    expect(screen.getByLabelText("Nome visualizzato")).toBeDisabled();
    expect(screen.getByLabelText("Spesa massima AI al giorno (€)")).toBeDisabled();
    expect(screen.getByLabelText("Messaggio di benvenuto")).toBeDisabled();
    expect(screen.getByRole("switch", { name: "Accetta le timbrature da WhatsApp" })).toBeDisabled();
    expect(screen.getByRole("combobox", { name: "Quanto fa Silvio da solo" })).toBeDisabled();
    expect(screen.getByRole("button", { name: /Salva impostazioni/ })).toBeDisabled();
  });

  it("chi amministra: tutto attivo e nessuna frase di divieto", async () => {
    apri();
    expect(await screen.findByLabelText("Nome visualizzato")).not.toBeDisabled();
    expect(screen.getByRole("switch", { name: "Accetta le timbrature da WhatsApp" })).not.toBeDisabled();
    expect(screen.getByRole("button", { name: /Salva impostazioni/ })).not.toBeDisabled();
    expect(screen.queryByText(SOLO_AMMINISTRATORI_WA)).toBeNull();
  });
});

describe("la bozza non si perde in silenzio", () => {
  it("con modifiche non salvate l'uscita chiede conferma; «Annulla modifiche» torna al salvato", async () => {
    const conferma = vi.spyOn(window, "confirm").mockReturnValue(false);
    apri();
    const nome = await screen.findByLabelText("Nome visualizzato");
    expect(confermaNavigazioneImpostazioni()).toBe(true);
    expect(screen.queryByRole("button", { name: "Annulla modifiche" })).toBeNull();
    fireEvent.change(nome, { target: { value: "Cantieri Verdi" } });
    expect(screen.getByRole("status")).toHaveTextContent("Modifiche non salvate");
    expect(confermaNavigazioneImpostazioni()).toBe(false);
    expect(conferma).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByRole("button", { name: "Annulla modifiche" }));
    expect((screen.getByLabelText("Nome visualizzato") as HTMLInputElement).value).toBe("Cantieri Rossi");
    expect(confermaNavigazioneImpostazioni()).toBe(true);
    conferma.mockRestore();
  });

  it("salvando manda il nome nuovo e dice «salvate»", async () => {
    apri();
    fireEvent.change(await screen.findByLabelText("Nome visualizzato"), { target: { value: "Cantieri Verdi" } });
    fireEvent.click(screen.getByRole("button", { name: /Salva impostazioni/ }));
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith("Impostazioni salvate."));
    expect(db.aggiornamenti[0]).toMatchObject({ display_name: "Cantieri Verdi", daily_budget_eur: 10 });
  });

  it("chi non può modificare non ha bozze da proteggere", async () => {
    permessi.isAdmin = false;
    const conferma = vi.spyOn(window, "confirm").mockReturnValue(false);
    apri();
    await screen.findByText(SOLO_AMMINISTRATORI_WA);
    expect(confermaNavigazioneImpostazioni()).toBe(true);
    conferma.mockRestore();
  });
});

describe("sezioni e parole", () => {
  it("numero Operativo: nome e spesa, come lavora Silvio, messaggi; «a cosa serve» chiuso in fondo", async () => {
    apri();
    await screen.findByLabelText("Nome visualizzato");
    expect(screen.getAllByRole("heading", { level: 2 }).map((h) => h.textContent)).toEqual([
      "Nome e spesa",
      "Come lavora Silvio sui cantieri",
      "Messaggi automatici",
      "A cosa serve questo numero",
    ]);
    const serve = screen.getByText("A cosa serve questo numero").closest("details") as HTMLDetailsElement;
    expect(serve.open).toBe(false);
    expect(serve.textContent).toContain("Operativo / Cantieri");
  });

  it("un numero non Operativo non ha la sezione dei cantieri", async () => {
    db.lettura = { data: numero("marketing"), error: null };
    apri();
    await screen.findByLabelText("Nome visualizzato");
    expect(screen.queryByText("Come lavora Silvio sui cantieri")).toBeNull();
    expect(screen.getAllByRole("heading", { level: 2 }).map((h) => h.textContent)).toEqual([
      "Nome e spesa",
      "Messaggi automatici",
      "A cosa serve questo numero",
    ]);
  });

  it("parole di tutti i giorni, e la spesa in euro", async () => {
    apri();
    await screen.findByLabelText("Nome visualizzato");
    const testo = document.body.textContent ?? "";
    expect(testo).not.toMatch(/Playbook|Budget giornaliero AI|Escalation|Numeri non riconosciuti|Modalità Silvio|Classifica foto|Regola interna|Presenze ed/);
    expect(testo.replace(/\u00a0/g, " ")).toContain("Speso oggi: 0,00 €");
    expect(testo).not.toContain("0.0000");
    for (const nome of [
      "Riconosci foto e documenti da solo",
      "Avvisa il responsabile se c'è un rischio per la sicurezza",
      "Manda il promemoria ogni giorno",
    ]) {
      expect(screen.getByRole("switch", { name: nome })).toBeTruthy();
    }
    expect(screen.getByLabelText("Se scrive un numero sconosciuto")).toBeTruthy();
    expect(screen.getByLabelText("Istruzioni in più per Silvio")).toBeTruthy();
    expect(screen.getByText("Promemoria del rapportino")).toBeTruthy();
  });
});

describe("collegare un numero: parole", () => {
  function apriProcedura() {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
    return render(
      <QueryClientProvider client={client}>
        <ConnectNumberWizard open onClose={() => undefined} initialPurpose="marketing" />
      </QueryClientProvider>,
    );
  }

  it("niente «Embedded Signup», «super_admin», «staging/test» né lo stato «pending»", async () => {
    db.lettura = { data: [] as unknown, error: null }; // nessun numero ancora collegato
    apriProcedura();
    expect(await screen.findByText("Collegamento guidato con Meta")).toBeTruthy();
    expect(screen.getByText("Con i codici di Meta (avanzato)")).toBeTruthy();
    expect(screen.getByText(/risulta «in attesa di verifica» finché Meta non conferma il collegamento/)).toBeTruthy();
    expect(screen.getByText("Se non funziona, scegli «Con i codici di Meta».")).toBeTruthy();
    expect(document.body.textContent).not.toMatch(/Embedded Signup|super_admin|staging\/test|pending/);
    fireEvent.click(screen.getByText("Con i codici di Meta (avanzato)"));
    expect(screen.getByText(/Per un numero vero conviene il collegamento guidato/)).toBeTruthy();
    // I campi dei codici restano com'erano (e il token non cambia).
    expect(screen.getByLabelText("Phone Number ID")).toBeTruthy();
    expect(screen.getByLabelText("WABA ID")).toBeTruthy();
    expect(screen.getByLabelText("Access Token permanente")).toBeTruthy();
  });
});
