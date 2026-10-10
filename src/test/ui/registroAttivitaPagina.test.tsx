/**
 * Registro attività dell'azienda: la pagina che vede il titolare (09/10/2026).
 *
 * Prima mostrava «contact.updated» come badge e, nel «Dettaglio», l'identificativo
 * della commessa (9.696 righe su 10.676 negli ultimi 30 giorni). Ora: Data · Chi ·
 * Cosa è successo · Su cosa, in italiano; filtro per cosa (Contatti, Commesse…);
 * ricerca su tutto il registro.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const COMMESSA = "39e05a1b-f998-48d8-aab7-9aafb25a4a2a";

type Chiamata = { tabella: string; metodo: string; args: unknown[] };
const stato = vi.hoisted(() => ({
  chiamate: [] as Array<{ tabella: string; metodo: string; args: unknown[] }>,
  registro: [] as Array<Record<string, unknown>>,
  totale: 0,
  profili: [] as Array<Record<string, unknown>>,
  commesse: [] as Array<Record<string, unknown>>,
  errore: false,
}));

vi.mock("@/integrations/supabase/client", () => {
  function builder(tabella: string) {
    const b: Record<string, unknown> = {};
    for (const metodo of ["select", "eq", "in", "order", "range", "like", "or", "gte", "lte", "limit"]) {
      b[metodo] = (...args: unknown[]) => {
        stato.chiamate.push({ tabella, metodo, args });
        return b;
      };
    }
    b.then = (ok: (v: unknown) => unknown, ko?: (e: unknown) => unknown) => {
      let risposta: { data: unknown; error: unknown; count?: number };
      if (tabella === "company_activity_log") {
        risposta = stato.errore
          ? { data: null, error: { message: "boom" } }
          : { data: stato.registro, error: null, count: stato.totale };
      } else if (tabella === "profiles") risposta = { data: stato.profili, error: null };
      else if (tabella === "orders") risposta = { data: stato.commesse, error: null };
      else risposta = { data: [], error: null };
      return Promise.resolve(risposta).then(ok, ko);
    };
    return b;
  }
  return { supabase: { from: (t: string) => builder(t) } };
});
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ effectiveCompany: { id: "az-1" } }) }));

// Radix Select e Popover in jsdom
Object.assign(Element.prototype, {
  hasPointerCapture: () => false,
  releasePointerCapture: () => {},
  setPointerCapture: () => {},
  scrollIntoView: () => {},
});

import CompanyActivityLogTab from "@/components/settings/CompanyActivityLogTab";

function riga(extra: Record<string, unknown>) {
  return {
    id: `r-${Math.random().toString(36).slice(2, 9)}`,
    created_at: "2026-10-09T09:30:00.000Z",
    actor_name: null as unknown, user_id: null as unknown, target_id: null as unknown, target_type: null as unknown, details: null as unknown,
    ...extra,
  };
}

function pagina() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}><CompanyActivityLogTab /></QueryClientProvider>);
}

const delRegistro = (): Chiamata[] => stato.chiamate.filter((c) => c.tabella === "company_activity_log");
const ultimaDelRegistro = (metodo: string) => [...delRegistro()].reverse().find((c) => c.metodo === metodo);

beforeEach(() => {
  stato.chiamate = [];
  stato.registro = [];
  stato.totale = 0;
  stato.profili = [];
  stato.commesse = [];
  stato.errore = false;
});
afterEach(cleanup);

describe("Registro attività: cosa legge il titolare", () => {
  it("titolo h2 (l'h1 lo mette la pagina), colonne in italiano, azione e nome in italiano", async () => {
    stato.registro = [
      riga({
        action: "contact.updated",
        description: "Contatto Fatima Menezes aggiornato. Campi: tags, province",
        target_label: "Fatima Menezes", target_type: "marketing_contacts", user_id: "u-1",
      }),
      riga({
        action: "customer.created",
        description: "customer.created su customers Giovanna Serra",
        target_label: "Giovanna Serra", target_type: "customers", actor_name: "Anna Bianchi",
      }),
    ];
    stato.totale = 2;
    stato.profili = [{ id: "u-1", first_name: "Mario", last_name: "Verdi" }];
    pagina();

    expect(await screen.findByRole("heading", { level: 2, name: "Registro attività" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { level: 1 })).toBeNull();
    await screen.findByText("Contatto modificato");
    for (const colonna of ["Data", "Chi", "Cosa è successo", "Su cosa"]) {
      expect(screen.getByRole("columnheader", { name: colonna })).toBeInTheDocument();
    }

    const righe = screen.getAllByRole("row").slice(1);
    expect(within(righe[0]).getByText("Contatto modificato")).toBeInTheDocument();
    expect(within(righe[0]).getByText("Fatima Menezes")).toBeInTheDocument();
    expect(within(righe[0]).getByText("Cambiato: etichette, provincia")).toBeInTheDocument();
    expect(within(righe[0]).getByText("Mario Verdi")).toBeInTheDocument();
    expect(within(righe[1]).getByText("Cliente creato")).toBeInTheDocument();
    expect(within(righe[1]).getByText("Anna Bianchi")).toBeInTheDocument();
    // Il codice inglese non si vede più.
    expect(screen.queryByText(/contact\.updated|customer\.created/)).toBeNull();
  });

  it("una commessa prende il numero dalla commessa: l'identificativo non si vede mai", async () => {
    stato.registro = [
      riga({
        action: "order.updated",
        description: `Commessa ${COMMESSA} modificata. Campi: version, quote_id, quote_number`,
        target_label: COMMESSA, target_id: COMMESSA, target_type: "orders", actor_name: "Anna Bianchi",
      }),
      riga({
        action: "order.deleted",
        description: `Commessa 1272e976-0707-4bcf-bab9-6b1c2e325245 eliminata`,
        target_label: "1272e976-0707-4bcf-bab9-6b1c2e325245", target_id: "1272e976-0707-4bcf-bab9-6b1c2e325245", target_type: "orders",
      }),
    ];
    stato.totale = 2;
    stato.commesse = [{ id: COMMESSA, order_code: "C-2026-042", client_name: "Mario Rossi" }];
    const { container } = pagina();

    expect(await screen.findByText("C-2026-042 · Mario Rossi")).toBeInTheDocument();
    expect(screen.getByText("Commessa modificata")).toBeInTheDocument();
    expect(screen.getByText("Commessa eliminata")).toBeInTheDocument();
    expect(screen.getByText("Cambiato: preventivo collegato")).toBeInTheDocument();
    // Nessun UUID da nessuna parte, né il nome tecnico «version».
    expect(container.textContent ?? "").not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
    expect(container.textContent ?? "").not.toMatch(/version|quote_id/);
    // La commessa è letta dalla SUA azienda.
    const lettura = stato.chiamate.filter((c) => c.tabella === "orders");
    expect(lettura.find((c) => c.metodo === "eq")?.args).toEqual(["company_id", "az-1"]);
    expect(lettura.find((c) => c.metodo === "in")?.args).toEqual(["id", [COMMESSA, "1272e976-0707-4bcf-bab9-6b1c2e325245"]]);
  });

  it("chi non ha nome registrato è «Non attribuito», e una riga sotto lo spiega", async () => {
    stato.registro = [riga({ action: "contact.created", description: "Nuovo contatto CRM: Fatima Menezes", target_label: "Fatima Menezes" })];
    stato.totale = 1;
    pagina();

    expect(await screen.findByText("Non attribuito")).toBeInTheDocument();
    expect(screen.getByText(/azione fatta da un'importazione, da un'automazione o registrata senza il nome/)).toBeInTheDocument();
  });

  it("un task racconta la frase del registro", async () => {
    stato.registro = [riga({
      action: "task_status_changed", description: "ha spostato l'attivita da Da fare a In corso",
      target_label: "RICHIAMARE MASIERO", target_type: "tasks", actor_name: "Anna Bianchi",
    })];
    stato.totale = 1;
    pagina();

    expect(await screen.findByText("Attività: stato cambiato")).toBeInTheDocument();
    expect(screen.getByText("Ha spostato l'attivita da Da fare a In corso")).toBeInTheDocument();
    expect(screen.getByText("RICHIAMARE MASIERO")).toBeInTheDocument();
  });
});

describe("Registro attività: filtro e ricerca", () => {
  it("il filtro è per cosa (Contatti, Commesse…): «Commesse» manda order.%", async () => {
    stato.registro = [riga({ action: "order.updated", description: "x", target_label: "C-1" })];
    stato.totale = 1;
    pagina();
    await screen.findByText("Commessa modificata");
    expect(ultimaDelRegistro("like")).toBeUndefined();

    fireEvent.pointerDown(screen.getByRole("combobox", { name: "Filtra per tipo di dato" }), { button: 0, ctrlKey: false, pointerType: "mouse" });
    for (const voce of ["Tutto", "Contatti", "Clienti", "Commesse", "Preventivi", "Fornitori", "Attività", "Dipendenti", "Richieste HR"]) {
      expect(await screen.findByRole("option", { name: voce })).toBeInTheDocument();
    }
    // Le 12 azioni di un'altra epoca non ci sono più.
    expect(screen.queryByRole("option", { name: /Ordine Creato|Cambio Stato|Modifica Impostazioni/ })).toBeNull();
    fireEvent.click(screen.getByRole("option", { name: "Commesse" }));

    await waitFor(() => expect(ultimaDelRegistro("like")?.args).toEqual(["action", "order.%"]));
  });

  it("la ricerca va nel database: descrizione, nome e persone dell'azienda che si chiamano così", async () => {
    stato.registro = [riga({ action: "contact.updated", description: "Contatto Mario Rossi aggiornato. Campi: tags", target_label: "Mario Rossi" })];
    stato.totale = 1;
    stato.profili = [{ id: "u-7", first_name: "Mario", last_name: "Rossi" }];
    pagina();
    await screen.findByText("Contatto modificato");

    fireEvent.change(screen.getByRole("searchbox", { name: "Cerca nel registro" }), { target: { value: "  mario rossi, (x)* " } });

    await waitFor(() => {
      const filtro = ultimaDelRegistro("or")?.args[0] as string | undefined;
      expect(filtro).toBeDefined();
      expect(filtro).toContain("description.ilike.*mario rossi x*");
      expect(filtro).toContain("target_label.ilike.*mario rossi x*");
      expect(filtro).toContain("actor_name.ilike.*mario rossi x*");
      // La persona si cerca fra quelle DELL'azienda, e le sue azioni entrano nel filtro.
      expect(filtro).toContain("user_id.in.(u-7)");
    }, { timeout: 3000 });
    const nomi = stato.chiamate.filter((c) => c.tabella === "profiles" && c.metodo === "eq");
    expect(nomi.some((c) => c.args[0] === "company_id" && c.args[1] === "az-1")).toBe(true);
  });

  it("senza risultati, con un filtro: lo dice e permette di toglierlo", async () => {
    stato.registro = [];
    stato.totale = 0;
    pagina();
    expect(await screen.findByText("Nessuna attività registrata")).toBeInTheDocument();

    fireEvent.change(screen.getByRole("searchbox", { name: "Cerca nel registro" }), { target: { value: "xyz" } });
    expect(await screen.findByText("Nessun risultato con questi filtri", {}, { timeout: 3000 })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Togli i filtri" }));
    expect(await screen.findByText("Nessuna attività registrata")).toBeInTheDocument();
    expect((screen.getByRole("searchbox", { name: "Cerca nel registro" }) as HTMLInputElement).value).toBe("");
  });
});

describe("Registro attività: pagine, errore, accessibilità", () => {
  it("le frecce e l'aggiornamento hanno un nome", async () => {
    stato.registro = Array.from({ length: 20 }, (_, i) => riga({ action: "contact.created", description: `n ${i}`, target_label: `Contatto ${i}` }));
    stato.totale = 45;
    pagina();

    expect(await screen.findByText("Pagina 1 di 3 (45 risultati)")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Pagina precedente" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Pagina successiva" }));
    expect(await screen.findByText("Pagina 2 di 3 (45 risultati)")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Aggiorna il registro" })).toBeInTheDocument();
    // Il campo di ricerca e il filtro hanno un nome per il lettore di schermo.
    expect(screen.getByRole("searchbox", { name: "Cerca nel registro" })).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Filtra per tipo di dato" })).toBeInTheDocument();
  });

  it("se il registro non si legge, lo dice in italiano e permette di riprovare", async () => {
    stato.errore = true;
    pagina();
    const avviso = await screen.findByRole("alert");
    expect(avviso).toHaveTextContent("Non riesco a leggere il registro.");
    expect(within(avviso).getByRole("button", { name: "Riprova" })).toBeInTheDocument();
    expect(avviso.textContent).not.toMatch(/boom|Errore nel caricamento/);
  });
});
