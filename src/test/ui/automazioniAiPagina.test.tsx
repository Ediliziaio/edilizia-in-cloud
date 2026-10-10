/**
 * «Cosa fa Silvio da solo» (impostazioni → Automazioni AI).
 *
 * - Un solo titolo di pagina (lo mette il layout): prima la pagina ne aggiungeva un secondo, dentro un contenitore con altro padding.
 * - Parole di chi legge: niente «super_admin», «auto-execute», «Preset», «Policy», «log audit», «Resend»; la scelta pronta
 *   «Aggressivo» c'è solo per EdiliziaInCloud (per un'azienda caricava in silenzio un'altra cosa).
 * - «Salva tutte» dà UN messaggio («3 scelte salvate»), non uno per azione; un rifiuto dice quale e perché, senza perdere la bozza.
 * - Le scelte non salvate non si perdono uscendo; chi non è amministratore vede le scelte in sola lettura e il perché
 *   (l'RPC che scrive vuole il ruolo di amministratore: il permesso «Branding & Template» non basta).
 * - Se le scelte salvate non si leggono la pagina non mostra quelle di partenza spacciandole per salvate.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const AZIONI = [
  { type: "send_overdue_reminder", mode: "require_confirmation", risk: "yellow", max: 50 as number | null },
  { type: "send_quote_followup", mode: "require_confirmation", risk: "yellow", max: 50 as number | null },
  { type: "create_purchase_order", mode: "require_confirmation", risk: "yellow", max: 25 as number | null },
  { type: "create_quote_draft", mode: "propose", risk: "yellow", max: 10 as number | null },
  { type: "create_invoice_draft", mode: "propose", risk: "yellow", max: 10 as number | null },
  { type: "mark_payment_received", mode: "require_strong_confirmation", risk: "red", max: null as number | null },
  { type: "generic_email", mode: "require_strong_confirmation", risk: "red", max: null as number | null },
];

const stato = vi.hoisted(() => ({
  ruolo: "company_admin",
  admin: true,
  modifica: true,
  letturaErrore: false,
  storicoErrore: false,
  salvato: {} as Record<string, Record<string, unknown>>,
  scritture: [] as Record<string, unknown>[],
  rifiuta: new Set<string>(),
  storico: [] as Record<string, unknown>[],
  guardia: [] as boolean[],
  success: vi.fn(), error: vi.fn(), info: vi.fn(),
  azienda: { id: "company-1", name: "Rossi Costruzioni" },
}));

const permesso = (a: (typeof AZIONI)[number]) => ({
  company_id: "company-1", action_type: a.type, source: "default", risk_level: a.risk, mode: a.mode, allowed_roles: [] as string[],
  requires_company_admin: a.risk === "red", requires_strong_confirmation: a.risk === "red", max_daily_executions: a.max,
  daily_executions: 3, daily_limit_reached: false, notes: null as string | null,
});

vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ effectiveCompany: stato.azienda, role: stato.ruolo }) }));
vi.mock("@/hooks/usePermissions", () => ({
  usePermissions: () => ({ isAdmin: stato.admin, canEditSettingsCustomization: stato.modifica }),
}));
vi.mock("@/hooks/useSettingsDraftGuard", () => ({ useSettingsDraftGuard: (attivo: boolean) => { stato.guardia.push(attivo); } }));
vi.mock("sonner", () => ({ toast: { success: stato.success, error: stato.error, info: stato.info } }));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    rpc: async (nome: string, args: Record<string, unknown>) => {
      if (nome === "get_ai_action_permission") {
        if (stato.letturaErrore) return { data: null as unknown, error: { code: "XX000", message: "boom" } };
        const base = AZIONI.find((a) => a.type === args.p_action_type)!;
        return { data: { ...permesso(base), ...(stato.salvato[base.type] ?? {}) }, error: null };
      }
      if (nome === "set_ai_action_permission") {
        const tipo = String(args.p_action_type);
        if (stato.rifiuta.has(tipo)) return { data: null as unknown, error: { code: "42501", message: "company admin access required" } };
        stato.scritture.push(args);
        stato.salvato[tipo] = { mode: args.p_mode, max_daily_executions: args.p_max_daily_executions, source: "company_override" };
        return { data: {}, error: null };
      }
      return { data: null as unknown, error: { message: "rpc sconosciuta" } };
    },
    from: () => {
      const catena = {
        select: () => catena, eq: () => catena, in: () => catena, order: () => catena,
        limit: async () => (stato.storicoErrore
          ? { data: null, error: { message: "boom" } }
          : { data: stato.storico, error: null as unknown }),
      };
      return catena;
    },
  },
}));

import SettingsAIAutomazioni from "@/pages/azienda/impostazioni/SettingsAIAutomazioni";

function apri() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(<QueryClientProvider client={client}><SettingsAIAutomazioni /></QueryClientProvider>);
}
const attendi = () => screen.findAllByRole("heading", { level: 3 });
const sceltaPronta = (nome: string) => screen.getByRole("button", { name: new RegExp(`^${nome}`) });

beforeEach(() => {
  stato.ruolo = "company_admin"; stato.admin = true; stato.modifica = true;
  stato.letturaErrore = false; stato.storicoErrore = false;
  stato.salvato = {}; stato.scritture.length = 0; stato.rifiuta.clear(); stato.storico = []; stato.guardia.length = 0;
  stato.success.mockClear(); stato.error.mockClear(); stato.info.mockClear();
  // Radix Select in jsdom
  Element.prototype.hasPointerCapture = () => false;
  Element.prototype.releasePointerCapture = () => {};
  Element.prototype.setPointerCapture = () => {};
  Element.prototype.scrollIntoView = () => {};
});
afterEach(cleanup);

describe("Automazioni AI: un solo titolo e parole di chi legge", () => {
  it("nessun titolo di primo livello: le sezioni sono di secondo, le sette azioni di terzo", async () => {
    apri();
    await attendi();
    expect(screen.queryByRole("heading", { level: 1 })).toBeNull();
    expect(screen.getByRole("heading", { level: 2, name: "Scelte pronte" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 2, name: "Le azioni di Silvio" })).toBeInTheDocument();
    expect(screen.getAllByRole("heading", { level: 3 })).toHaveLength(7);
  });

  it("per un'azienda le scelte pronte sono due: «Aggressivo» c'è solo per EdiliziaInCloud", async () => {
    apri();
    await attendi();
    expect(sceltaPronta("Prudente")).toBeInTheDocument();
    expect(sceltaPronta("Equilibrata")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Aggressivo/ })).toBeNull();
    cleanup();
    stato.ruolo = "super_admin";
    apri();
    await attendi();
    expect(sceltaPronta("Aggressivo")).toBeInTheDocument();
  });

  it("nessuna parola interna: super_admin, auto-execute, Preset, Policy, log audit, Resend", async () => {
    apri();
    await attendi();
    const testo = document.body.textContent ?? "";
    expect(testo).not.toMatch(/super_?admin/i);
    expect(testo).not.toMatch(/auto-?execute/i);
    expect(testo).not.toMatch(/preset/i);
    expect(testo).not.toMatch(/\bpolic(y|ies)\b/i);
    expect(testo).not.toMatch(/audit/i);
    expect(testo).not.toMatch(/resend/i);
    expect(testo).not.toMatch(/\bcustom\b/i);
    expect(testo).not.toMatch(/arbitrar/i);
  });

  it("le modalità hanno i nomi di chi legge e quella automatica è spenta, con a chi chiederla", async () => {
    apri();
    await attendi();
    const [primo] = screen.getAllByRole("combobox");
    expect(primo).toHaveTextContent("Chiede conferma (un tocco)");
    fireEvent.pointerDown(primo, { button: 0, ctrlKey: false, pointerType: "mouse" });
    const opzioni = await screen.findAllByRole("option");
    expect(opzioni.map((o) => o.textContent)).toEqual([
      "Spenta", "Solo proposta", "Chiede conferma (un tocco)", "Chiede di scrivere CONFERMO", "Esegue da sola — su richiesta all'assistenza",
    ]);
    expect(opzioni[4]).toHaveAttribute("aria-disabled", "true");
  });

  it("ogni azione ha i suoi campi con l'etichetta collegata", async () => {
    apri();
    await attendi();
    expect(screen.getAllByLabelText("Cosa fa Silvio")).toHaveLength(7);
    expect(screen.getAllByLabelText(/^Limite al giorno/)).toHaveLength(7);
  });

  it("il «Come funziona» è chiuso e non ripete il titolo: una frase e basta", async () => {
    apri();
    await attendi();
    const come = screen.getByText("Come funziona").closest("details")!;
    expect(come).not.toHaveAttribute("open");
    expect(screen.getByText(/Per ogni azione scegli se Silvio la propone, chiede conferma o la esegue da solo/)).toBeInTheDocument();
  });
});

describe("Automazioni AI: le scelte pronte fanno quello che facevano (cambiano solo le parole)", () => {
  const modalita = () => screen.getAllByRole("combobox").map((c) => c.textContent);
  const CONFERMA = "Chiede conferma (un tocco)";
  const CONFERMO = "Chiede di scrivere CONFERMO";

  it("Prudente: tutto chiede conferma, i pagamenti e l'email libera di scrivere CONFERMO", async () => {
    apri();
    await attendi();
    fireEvent.click(sceltaPronta("Prudente"));
    await screen.findByText("2 scelte da salvare");
    expect(modalita()).toEqual([CONFERMA, CONFERMA, CONFERMA, CONFERMA, CONFERMA, CONFERMO, CONFERMO]);
  });

  it("Equilibrata: bozze solo proposte, solleciti e follow-up con conferma, pagamenti e email libera con CONFERMO", async () => {
    apri();
    await attendi();
    fireEvent.click(sceltaPronta("Equilibrata"));
    await screen.findByText("1 scelta da salvare");
    expect(modalita()).toEqual([CONFERMA, CONFERMA, "Solo proposta", "Solo proposta", "Solo proposta", CONFERMO, CONFERMO]);
  });

  it("per un'azienda l'esecuzione da sola non si carica mai, nemmeno da «Aggressivo» (che non c'è)", async () => {
    apri();
    await attendi();
    fireEvent.click(sceltaPronta("Equilibrata"));
    fireEvent.click(sceltaPronta("Prudente"));
    expect(modalita()).not.toContain("Esegue da sola");
  });

  it("per EdiliziaInCloud «Aggressivo» fa partire da sole le email ai clienti, e solo quelle", async () => {
    stato.ruolo = "super_admin";
    apri();
    await attendi();
    fireEvent.click(sceltaPronta("Aggressivo"));
    expect(modalita()).toEqual(["Esegue da sola", "Esegue da sola", CONFERMA, CONFERMA, CONFERMA, CONFERMO, CONFERMO]);
  });

  it("la scelta pronta rimette anche i limiti al giorno a quelli consigliati, e la pagina lo dice", async () => {
    apri();
    await attendi();
    fireEvent.change(document.getElementById("limit-send_overdue_reminder")!, { target: { value: "7" } });
    fireEvent.click(sceltaPronta("Prudente"));
    expect(document.getElementById("limit-send_overdue_reminder")).toHaveValue(50);
    expect(screen.getByText(/Rimette anche i limiti al giorno a quelli consigliati/)).toBeInTheDocument();
  });
});

describe("Automazioni AI: salvare dà un solo messaggio", () => {
  const preparaTreScelte = async () => {
    apri();
    await attendi();
    fireEvent.click(sceltaPronta("Prudente")); // preventivo e fattura (bozza) passano a «Chiede conferma»: 2 scelte
    fireEvent.change(document.getElementById("limit-send_overdue_reminder")!, { target: { value: "20" } }); // la terza
    await screen.findByText("3 scelte da salvare");
  };

  it("«Salva tutte» salva le tre scelte e dice «3 scelte salvate» una volta sola", async () => {
    await preparaTreScelte();
    expect(stato.info).toHaveBeenCalledWith("Scelta «Prudente» caricata: controlla le azioni e premi «Salva tutte».");
    fireEvent.click(screen.getByRole("button", { name: /Salva tutte/ }));
    await waitFor(() => expect(stato.success).toHaveBeenCalledTimes(1));
    expect(stato.success).toHaveBeenCalledWith("3 scelte salvate");
    expect(stato.error).not.toHaveBeenCalled();
    expect(stato.scritture.map((s) => s.p_action_type).sort()).toEqual(["create_invoice_draft", "create_quote_draft", "send_overdue_reminder"]);
    expect(await screen.findByText("Nessuna modifica da salvare")).toBeInTheDocument();
  });

  it("«Salva» su una sola azione dice quale", async () => {
    apri();
    await attendi();
    fireEvent.change(document.getElementById("limit-create_quote_draft")!, { target: { value: "5" } });
    fireEvent.click(await screen.findByRole("button", { name: "Salva: Preventivo (bozza)" }));
    await waitFor(() => expect(stato.success).toHaveBeenCalledWith("Scelta salvata: Preventivo (bozza)"));
    expect(stato.success).toHaveBeenCalledTimes(1);
    expect(stato.scritture).toHaveLength(1);
  });

  it("un rifiuto dice quale azione e perché, e quella resta da salvare mentre le altre sono salvate", async () => {
    stato.rifiuta.add("send_overdue_reminder");
    await preparaTreScelte();
    fireEvent.click(screen.getByRole("button", { name: /Salva tutte/ }));
    await waitFor(() => expect(stato.error).toHaveBeenCalledTimes(1));
    expect(stato.error).toHaveBeenCalledWith("Salvate 2 scelte su 3", {
      description: "«Sollecito di pagamento»: Non hai i permessi per questa operazione. Contatta l'amministratore.",
    });
    expect(stato.success).not.toHaveBeenCalled();
    expect(await screen.findByText("1 scelta da salvare")).toBeInTheDocument();
    expect(document.getElementById("limit-send_overdue_reminder")).toHaveValue(20);
  });

  it("«Annulla modifiche» le butta tutte", async () => {
    await preparaTreScelte();
    fireEvent.click(screen.getByRole("button", { name: "Annulla modifiche" }));
    expect(await screen.findByText("Nessuna modifica da salvare")).toBeInTheDocument();
    expect(document.getElementById("limit-send_overdue_reminder")).toHaveValue(50);
    expect(stato.scritture).toHaveLength(0);
  });

  it("le scelte non salvate non si perdono uscendo: la guardia è accesa solo con qualcosa da salvare", async () => {
    apri();
    await attendi();
    expect(stato.guardia.at(-1)).toBe(false);
    fireEvent.change(document.getElementById("limit-create_quote_draft")!, { target: { value: "5" } });
    await screen.findByText("1 scelta da salvare");
    expect(stato.guardia.at(-1)).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: /Salva tutte/ }));
    await screen.findByText("Nessuna modifica da salvare");
    expect(stato.guardia.at(-1)).toBe(false);
  });
});

describe("Automazioni AI: sola lettura e letture che falliscono", () => {
  it("chi ha il permesso ma non è amministratore vede le scelte e il perché non le cambia", async () => {
    stato.admin = false; stato.modifica = true;
    apri();
    await attendi();
    expect(screen.getByText("Stai consultando le scelte di Silvio: le cambia l'amministratore dell'azienda.")).toBeInTheDocument();
    expect(sceltaPronta("Prudente")).toBeDisabled();
    for (const campo of screen.getAllByRole("combobox")) expect(campo).toBeDisabled();
    expect(screen.queryByRole("button", { name: /Salva tutte/ })).toBeNull();
  });

  it("l'amministratore non vede l'avviso e ha tutto acceso", async () => {
    apri();
    await attendi();
    expect(screen.queryByText(/Stai consultando/)).toBeNull();
    expect(sceltaPronta("Prudente")).toBeEnabled();
    const [primo] = screen.getAllByRole("combobox");
    expect(primo).toBeEnabled();
  });

  it("le azioni a rischio alto si cambiano solo da EdiliziaInCloud e lo dicono", async () => {
    apri();
    await attendi();
    expect(screen.getAllByText("Azione a rischio alto: la scelta la cambia solo EdiliziaInCloud, su richiesta.")).toHaveLength(2);
    expect(document.getElementById("mode-mark_payment_received")).toBeDisabled();
    expect(document.getElementById("limit-generic_email")).toBeDisabled();
  });

  it("se le scelte salvate non si leggono non mostra quelle di partenza", async () => {
    stato.letturaErrore = true;
    apri();
    expect(await screen.findByText(/Non riesco a leggere le scelte salvate/)).toBeInTheDocument();
    expect(screen.queryAllByRole("heading", { level: 3 })).toHaveLength(0);
    expect(screen.getByRole("button", { name: "Riprova" })).toBeInTheDocument();
  });

  it("lo storico: vuoto, con le azioni, o non leggibile", async () => {
    apri();
    await attendi();
    fireEvent.mouseDown(screen.getByRole("tab", { name: /Cosa ha fatto/ }), { button: 0, ctrlKey: false });
    expect(await screen.findByText("Silvio non ha ancora eseguito azioni.")).toBeInTheDocument();
    cleanup();

    stato.storico = [
      { id: "p1", action_type: "send_overdue_reminder", summary: "Sollecito a Bianchi", status: "applied", applied_at: "2026-10-08T09:00:00Z", risk_level: "yellow" },
      { id: "p2", action_type: "mark_payment_received", summary: "Rata 2 Verdi", status: "failed", applied_at: "2026-10-07T09:00:00Z", risk_level: "red" },
    ];
    apri();
    await attendi();
    fireEvent.mouseDown(screen.getByRole("tab", { name: /Cosa ha fatto/ }), { button: 0, ctrlKey: false });
    const sezione = (await screen.findByRole("heading", { level: 2, name: "Le ultime azioni di Silvio" })).closest("section")!;
    expect(within(sezione).getByText("Eseguita")).toBeInTheDocument();
    expect(within(sezione).getByText("Non riuscita")).toBeInTheDocument();
    expect(within(sezione).getByText("Rischio alto")).toBeInTheDocument();
    cleanup();

    stato.storicoErrore = true;
    apri();
    await attendi();
    fireEvent.mouseDown(screen.getByRole("tab", { name: /Cosa ha fatto/ }), { button: 0, ctrlKey: false });
    expect(await screen.findByText("Non riesco a leggere lo storico.")).toBeInTheDocument();
  });
});
