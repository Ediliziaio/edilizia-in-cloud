/**
 * Preferenze email (mittente e aspetto): sola lettura onesta, bozza protetta, testi veri (09/10/2026).
 *
 *   · Campi e «Salva» erano attivi per tutti: il rifiuto arrivava dal database dopo il clic. Ora scrive chi amministra o
 *     chi ha «Email Marketing» e non è in «sola lettura» (policy «Permesso email: preferenze», `cep_write`).
 *   · Uscendo con modifiche non salvate non si veniva avvisati.
 *   · «Disattivabile solo sui piani con white-label» era falso (qualsiasi azienda può spegnerlo).
 *   · Il piè di pagina di disiscrizione sostituisce quello standard così com'è: senza `{{unsubscribe_url}}` le campagne
 *     partirebbero senza il link per disiscriversi, obbligatorio per legge.
 *   · «Salva» spento senza spiegazione: ora dice cosa manca (il «Reply-to» era obbligatorio senza dirlo).
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type Riga = Record<string, unknown>;

const db = vi.hoisted(() => ({
  prefs: null as Record<string, unknown> | null,
  domini: [] as Array<Record<string, unknown>>,
  upserts: [] as Array<Record<string, unknown>>,
  erroreSalvataggio: false,
}));
const permessi = vi.hoisted(() => ({ isAdmin: true, canViewMarketingEmail: true, solaLettura: false, isLoading: false }));
const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn(), info: vi.fn() }));

vi.mock("sonner", () => ({ toast }));
vi.mock("@/hooks/usePermissions", () => ({ usePermissions: () => permessi }));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ effectiveCompany: { id: "azienda-1" } }) }));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (tabella: string) => {
      const b = {
        select: () => b,
        eq: () => b,
        maybeSingle: () => Promise.resolve({ data: db.prefs, error: null as unknown }),
        upsert: (payload: Riga) => {
          db.upserts.push(payload);
          return Promise.resolve({ error: db.erroreSalvataggio ? { message: "new row violates row-level security policy" } : null });
        },
        then: (ok: (v: { data: unknown; error: unknown }) => unknown, ko?: (e: unknown) => unknown) =>
          Promise.resolve({ data: tabella === "company_email_domains" ? db.domini : null, error: null as unknown }).then(ok, ko),
      };
      return b;
    },
  },
}));

import SettingsEmailPreferences from "@/pages/azienda/settings/SettingsEmailPreferences";
import { confermaNavigazioneImpostazioni } from "@/hooks/useSettingsDraftGuard";
import { isValidUnsubscribeFooter } from "@/lib/email/preferencesValidators";

const salvate = (): Riga => ({
  company_id: "azienda-1",
  logo_url: null,
  primary_color: "#1E3A5F",
  secondary_color: "#F97316",
  footer_text: null,
  footer_show_powered_by: true,
  sender_name: "Rossi Costruzioni",
  sender_prefix: "info",
  reply_to_email: "info@rossi.it",
  transactional_domain_id: null,
  marketing_domain_id: null,
  unsubscribe_footer_html: null,
});

function monta() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={["/azienda/impostazioni/preferenze-email"]}>
        <SettingsEmailPreferences />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const salva = () => screen.getByRole("button", { name: /Salva preferenze/ }) as HTMLButtonElement;
const SOLO_LETTURA = /Stai solo consultando: per cambiare mittente e aspetto serve il permesso «Email Marketing»/;

beforeEach(() => {
  db.prefs = salvate();
  db.domini = [];
  db.upserts.length = 0;
  db.erroreSalvataggio = false;
  Object.assign(permessi, { isAdmin: true, canViewMarketingEmail: true, solaLettura: false, isLoading: false });
  Object.values(toast).forEach((f) => f.mockReset());
});

afterEach(() => cleanup());

describe("chi può cambiarle", () => {
  it("chi amministra: i campi sono attivi, «Salva» parte da spento e si accende con una modifica", async () => {
    monta();
    const nome = await screen.findByLabelText("Nome che vede il cliente");
    expect(nome).not.toBeDisabled();
    expect(screen.queryByText(SOLO_LETTURA)).toBeNull();
    expect(salva().disabled).toBe(true);
    fireEvent.change(nome, { target: { value: "Rossi SRL" } });
    expect(salva().disabled).toBe(false);
    expect(screen.getByRole("status")).toHaveTextContent("Modifiche non salvate");
  });

  it("salvando manda tutti i campi e poi dice «salvate»", async () => {
    monta();
    fireEvent.change(await screen.findByLabelText("Nome che vede il cliente"), { target: { value: "Rossi SRL" } });
    fireEvent.click(salva());
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith("Preferenze email salvate"));
    expect(db.upserts).toHaveLength(1);
    expect(db.upserts[0]).toMatchObject({
      company_id: "azienda-1",
      sender_name: "Rossi SRL",
      sender_prefix: "info",
      reply_to_email: "info@rossi.it",
      primary_color: "#1E3A5F",
      footer_show_powered_by: true,
      unsubscribe_footer_html: null,
    });
  });

  it("chi ha «Email Marketing» e non è in sola lettura può cambiarle anche senza essere amministratore", async () => {
    Object.assign(permessi, { isAdmin: false });
    monta();
    expect(await screen.findByLabelText("Nome che vede il cliente")).not.toBeDisabled();
  });

  it("un rifiuto del database si legge in italiano", async () => {
    db.erroreSalvataggio = true;
    monta();
    fireEvent.change(await screen.findByLabelText("Nome che vede il cliente"), { target: { value: "Rossi SRL" } });
    fireEvent.click(salva());
    await waitFor(() => expect(toast.error).toHaveBeenCalled());
    const [titolo, opzioni] = toast.error.mock.calls[0] as [string, { description: string }];
    expect(titolo).toBe("Non sono riuscito a salvare");
    expect(opzioni.description).not.toMatch(/new row violates|row-level security/i);
  });
});

describe("chi può solo consultare", () => {
  it("campi e «Salva» spenti, e dice cosa serve", async () => {
    Object.assign(permessi, { isAdmin: false, solaLettura: true });
    monta();
    expect(await screen.findByText(SOLO_LETTURA)).toBeTruthy();
    // Un fieldset spento spegne tutto quello che contiene (la proprietà `disabled` del singolo campo non lo dice).
    expect(screen.getByLabelText("Nome che vede il cliente")).toBeDisabled();
    expect(screen.getByLabelText("Risposte a")).toBeDisabled();
    expect(screen.getByLabelText("Scrivi «Inviato con EdiliziaInCloud» in fondo alle email")).toBeDisabled();
    expect(salva()).toBeDisabled();
    expect(db.upserts).toHaveLength(0);
  });

  it("senza il permesso «Email Marketing» e non amministratore: sola lettura anche lui", async () => {
    Object.assign(permessi, { isAdmin: false, canViewMarketingEmail: false });
    monta();
    expect(await screen.findByText(SOLO_LETTURA)).toBeTruthy();
    expect(screen.getByLabelText("Nome che vede il cliente")).toBeDisabled();
  });

  it("mentre i permessi si caricano non li dà per buoni", async () => {
    Object.assign(permessi, { isLoading: true });
    monta();
    expect(await screen.findByLabelText("Nome che vede il cliente")).toBeDisabled();
  });
});

describe("la bozza non si perde in silenzio", () => {
  it("con modifiche non salvate l'uscita chiede conferma; «Annulla modifiche» la toglie", async () => {
    const conferma = vi.spyOn(window, "confirm").mockReturnValue(false);
    monta();
    const nome = await screen.findByLabelText("Nome che vede il cliente");
    expect(confermaNavigazioneImpostazioni()).toBe(true);
    fireEvent.change(nome, { target: { value: "Rossi SRL" } });
    expect(confermaNavigazioneImpostazioni()).toBe(false);
    expect(conferma).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByRole("button", { name: "Annulla modifiche" }));
    expect((screen.getByLabelText("Nome che vede il cliente") as HTMLInputElement).value).toBe("Rossi Costruzioni");
    expect(confermaNavigazioneImpostazioni()).toBe(true);
    expect(conferma).toHaveBeenCalledOnce();
    conferma.mockRestore();
  });

  it("chi non può modificare non ha bozze da proteggere", async () => {
    Object.assign(permessi, { isAdmin: false, solaLettura: true });
    const conferma = vi.spyOn(window, "confirm").mockReturnValue(false);
    monta();
    await screen.findByText(SOLO_LETTURA);
    expect(confermaNavigazioneImpostazioni()).toBe(true);
    conferma.mockRestore();
  });
});

describe("«Salva» spento: dice perché", () => {
  it("l'indirizzo per le risposte è obbligatorio e lo si dice", async () => {
    db.prefs = null; // azienda senza nessuna riga: parte con i valori di partenza, senza risposte
    monta();
    fireEvent.change(await screen.findByLabelText("Nome che vede il cliente"), { target: { value: "Rossi SRL" } });
    expect(salva().disabled).toBe(true);
    expect(screen.getByRole("status")).toHaveTextContent("Manca l'indirizzo per le risposte.");
    fireEvent.change(screen.getByLabelText("Risposte a"), { target: { value: "info@rossi.it" } });
    expect(salva().disabled).toBe(false);
  });

  it("un indirizzo scritto male non è «mancante»: dice che non è valido", async () => {
    monta();
    fireEvent.change(await screen.findByLabelText("Risposte a"), { target: { value: "info@rossi" } });
    expect(salva().disabled).toBe(true);
    expect(screen.getByRole("status")).toHaveTextContent("L'indirizzo per le risposte non è valido.");
  });

  it("il piè di pagina delle campagne senza il link per disiscriversi non si salva", async () => {
    monta();
    const piede = await screen.findByLabelText("Piè di pagina delle campagne");
    fireEvent.change(piede, { target: { value: "<p>Rossi SRL, via Roma 1</p>" } });
    expect(salva().disabled).toBe(true);
    expect(screen.getByRole("status")).toHaveTextContent("Manca il link per disiscriversi: scrivi {{unsubscribe_url}} nel testo.");
    // Con spazi dentro le graffe i due invii di campagne non lo riconoscono: non vale.
    fireEvent.change(piede, { target: { value: "<a href='{{ unsubscribe_url }}'>Disiscriviti</a>" } });
    expect(salva().disabled).toBe(true);
    fireEvent.change(piede, { target: { value: "<p>Rossi SRL · <a href='{{unsubscribe_url}}'>Disiscriviti</a></p>" } });
    expect(salva().disabled).toBe(false);
    fireEvent.click(salva());
    await waitFor(() => expect(db.upserts).toHaveLength(1));
    expect(db.upserts[0].unsubscribe_footer_html).toContain("{{unsubscribe_url}}");
  });

  it("isValidUnsubscribeFooter: vuoto va bene, altrimenti serve il segnaposto esatto", () => {
    expect(isValidUnsubscribeFooter(null)).toBe(true);
    expect(isValidUnsubscribeFooter("   ")).toBe(true);
    expect(isValidUnsubscribeFooter("testo")).toBe(false);
    expect(isValidUnsubscribeFooter("{{ unsubscribe_url }}")).toBe(false);
    expect(isValidUnsubscribeFooter("ciao {{unsubscribe_url}}")).toBe(true);
  });
});

describe("testi veri e ordine", () => {
  it("la scritta «Inviato con» dice cosa succede davvero, senza il blocco ai piani white-label", async () => {
    monta();
    await screen.findByLabelText("Nome che vede il cliente");
    expect(screen.getByText("Se lo spegni la scritta sparisce dalle email.")).toBeTruthy();
    expect(document.body.textContent).not.toMatch(/white-label/i);
  });

  it("titolo vero nella pagina e sezioni nell'ordine in cui si cercano: chi scrive, dominio, aspetto, avanzate", async () => {
    monta();
    await screen.findByLabelText("Nome che vede il cliente");
    expect(screen.getByRole("heading", { level: 2, name: "Mittente e aspetto delle email" })).toBeTruthy();
    expect(screen.getAllByRole("heading", { level: 2 }).map((h) => h.textContent)).toEqual([
      "Mittente e aspetto delle email",
      "Chi scrive",
      "Da quale dominio partono le email",
      "Aspetto delle email",
    ]);
    const avanzate = screen.getByText("Avanzate").closest("details") as HTMLDetailsElement;
    expect(avanzate.open).toBe(false);
    expect(avanzate.textContent).toContain("Piè di pagina delle campagne");
    expect(avanzate.textContent).toContain("Solo campagne");
    expect(screen.queryAllByRole("heading", { level: 1 })).toHaveLength(0);
  });

  it("parole di tutti i giorni: niente «Reply-to», «Dominio per stream», «Footer unsubscribe», «transazionali»", async () => {
    monta();
    await screen.findByLabelText("Nome che vede il cliente");
    expect(document.body.textContent).not.toMatch(/Reply-to|per stream|Footer unsubscribe|transazional|Parte locale|Branding email/);
    expect(screen.getByLabelText("Messaggi di servizio (notifiche, documenti, codici)")).toBeTruthy();
    expect(screen.getByLabelText("Campagne e newsletter")).toBeTruthy();
  });

  it("«Dominio» rimanda alla pagina accanto (qui e nel pannello admin)", async () => {
    monta();
    await screen.findByLabelText("Nome che vede il cliente");
    // C'è anche la voce «Dominio» dell'indice in cima (#dominio): qui si cerca quella che porta alla pagina del dominio.
    const link = screen.getAllByRole("link", { name: "Dominio" }).find((a) => a.getAttribute("href") !== "#dominio");
    expect(link?.getAttribute("href")).toBe("/azienda/impostazioni/dominio-email");
  });
});
