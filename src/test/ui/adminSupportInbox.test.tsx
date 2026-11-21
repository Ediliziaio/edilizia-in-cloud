import "@testing-library/jest-dom/vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import AdminCustomerSuccessHub from "@/pages/admin/cs/AdminCustomerSuccessHub";
import { supportTicketDetails } from "@/components/admin/support/supportInbox";

const fixture = vi.hoisted(() => ({
  canManageTickets: true,
  replied: false,
  lookups: [] as string[],
  dates: {
    latest: "2026-11-20T10:00:00Z",
    archived: "2026-11-10T10:00:00Z",
    old: "2024-08-01T10:00:00Z",
  },
}));

vi.mock("@/hooks/useSuperAdminPermissions", () => ({
  useSuperAdminPermissions: () => ({
    permissions: { can_manage_companies: true, impersonation: true, super_admin: true, can_manage_tickets: fixture.canManageTickets },
  }),
}));
vi.mock("@/pages/admin/cs/CockpitTab", () => ({ CockpitTab: () => <p>Riepilogo clienti AI</p> }));
vi.mock("@/components/admin/support/AdminSupportChatSheet", () => ({
  AdminSupportChatSheet: ({ companyName, requestedTicket }: { companyName: string; requestedTicket?: { id: string } }) => (
    <div role="dialog">Conversazione di {companyName}{requestedTicket && <output>{requestedTicket.id}</output>}</div>
  ),
}));
vi.mock("@/components/admin/tasks/NewTaskDialog", () => ({ NewTaskDialog: (): null => null }));
vi.mock("@/integrations/supabase/client", () => {
  const companies = [
    { id: "alpha", name: "Impresa Alfa" },
    { id: "beta", name: "Impresa Beta" },
    { id: "gamma", name: "Impresa Gamma" },
  ];
  const conversations = [
    { company_id: "alpha", status: "open", priority: "high", resolved_at: null, updated_at: fixture.dates.latest },
    { company_id: "beta", status: "pending", priority: "urgent", resolved_at: null, updated_at: fixture.dates.old },
    { company_id: "gamma", status: "resolved", priority: "normal", resolved_at: fixture.dates.archived, updated_at: fixture.dates.archived },
  ];
  const messages = [
    { id: "nuovo-alfa", company_id: "alpha", sender_role: "company", message: "## 🎫 Ticket #EIC-12 — Importazione allegati\n\nTrascrizione da mostrare solo nella chat.", created_at: fixture.dates.latest },
    { id: "ultimo-gamma", company_id: "gamma", sender_role: "company", message: "Chiarimento fattura", created_at: fixture.dates.archived },
    { id: "vecchio-alfa", company_id: "alpha", sender_role: "company", message: "## 🎫 Ticket #EIC-11 — DDT non visibile", created_at: fixture.dates.old },
  ];
  const archivedTicket = { id: "vecchio-gamma", company_id: "gamma", sender_role: "company", message: "## 🎫 Ticket #EIC-7 — Permessi del tecnico", created_at: fixture.dates.old };
  const read = (data: unknown) => {
    const result: { data: unknown; error: null } = { data, error: null };
    const query = {
      select: () => query, eq: () => query, order: () => query, limit: () => query, abortSignal: () => query,
      in: (field: string, allowed: string[]) => {
        if (Array.isArray(result.data)) result.data = result.data.filter((row: Record<string, string>) => allowed.includes(row[field]));
        return query;
      },
      ilike: (_column: string, pattern: string) => {
        fixture.lookups.push(pattern);
        result.data = pattern === "## 🎫 Ticket #EIC-7 %" ? [archivedTicket] : [];
        return query;
      },
      then: (resolve: (value: typeof result) => unknown) => Promise.resolve(result).then(resolve),
    };
    return query;
  };
  return {
    supabase: {
      from: (table: string) => read(
        table === "companies" ? companies : table === "support_conversations" ? conversations : table === "customer_profile" ? [] : fixture.replied
          ? [{ id: "risposta-alfa", company_id: "alpha", sender_role: "super_admin", message: "Grazie, abbiamo preso in carico la richiesta.", created_at: "2026-11-20T11:00:00Z" }, ...messages]
          : messages,
      ),
      rpc: () => Promise.resolve({
        data: [
          { company_id: "beta", sender_role: "company", created_at: fixture.dates.old },
          { company_id: "alpha", sender_role: fixture.replied ? "super_admin" : "company", created_at: fixture.dates.latest },
        ],
        error: null,
      }),
    },
  };
});

function LocationDisplay() {
  return <output aria-label="URL della vista">{useLocation().search}</output>;
}

function openInbox(url = "/admin/cs") {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[url]}>
        <AdminCustomerSuccessHub />
        <LocationDisplay />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

afterEach(cleanup);
beforeEach(() => { fixture.canManageTickets = true; fixture.replied = false; fixture.lookups.length = 0; });

describe("Assistenza Clienti", () => {
  it("apre i ticket attivi, mostra il titolo e mantiene visibile una conversazione fuori dalla finestra dei messaggi", async () => {
    openInbox();
    expect(await screen.findByRole("button", { name: /Apri ticket di Impresa Alfa/ }, { timeout: 5_000 })).toBeVisible();
    expect(screen.getByRole("tab", { name: "Ticket", selected: true })).toBeInTheDocument();
    expect(within(screen.getByRole("tablist", { name: "Sezioni assistenza clienti" })).getAllByRole("tab").map((tab) => tab.textContent)).toEqual([
      "Ticket", "Priorità clienti", "Indicatori", "Aziende", "Avvio clienti", "Automazioni",
    ]);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Assistenza Clienti");
    expect(screen.getByText("Importazione allegati")).toBeVisible();
    expect(screen.queryByText(/Trascrizione da mostrare/)).not.toBeInTheDocument();
    expect(await screen.findByRole("button", { name: /Da rispondere\s*2/ })).toBeVisible();
    expect(screen.getByRole("button", { name: /Apri ticket di Impresa Beta/ })).toBeVisible();
    expect(screen.queryByRole("button", { name: /Apri ticket di Impresa Gamma/ })).not.toBeInTheDocument();
    expect(screen.queryByText("Attesa media")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Statistiche" }));
    expect(screen.getByText("Attesa media")).toBeVisible();
  }, 8_000);

  it("permette di ritrovare chiusi e risolti, cercare per codice e aprire il dettaglio originale", async () => {
    fixture.replied = true;
    openInbox("/admin/cs?tab=assistenza");
    fireEvent.click(await screen.findByRole("button", { name: /Tutti\s*3/ }));
    expect(screen.getByRole("button", { name: /Apri ticket di Impresa Gamma/ })).toBeVisible();
    fireEvent.change(screen.getByRole("textbox", { name: "Cerca ticket" }), { target: { value: "EIC-12" } });
    expect(screen.queryByRole("button", { name: /Apri ticket di Impresa Gamma/ })).not.toBeInTheDocument();
    expect(screen.getByText("Importazione allegati")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: /Apri ticket di Impresa Alfa/ }));
    expect(await screen.findByRole("dialog")).toHaveTextContent("Conversazione di Impresa Alfa");
  });

  it("apre la specifica richiesta storica e trova un codice oltre la finestra dei messaggi", async () => {
    openInbox();
    const search = await screen.findByRole("textbox", { name: "Cerca ticket" });
    fireEvent.change(search, { target: { value: "eic-7" } });
    const archived = await screen.findByRole("button", { name: /Apri ticket di Impresa Gamma · Permessi del tecnico/ });
    expect(fixture.lookups).toEqual(["## 🎫 Ticket #EIC-7 %"]);
    expect(screen.getByRole("button", { name: /Tutti\s*3/ })).toHaveAttribute("aria-pressed", "true");
    expect(screen.queryByRole("button", { name: "Azioni ticket di Impresa Gamma" })).not.toBeInTheDocument();
    fireEvent.click(archived);
    expect(await screen.findByRole("dialog")).toHaveTextContent("vecchio-gamma");
  });

  it("usa il titolo storico anche se la stessa azienda ha aperto una richiesta più recente", async () => {
    openInbox();
    const search = await screen.findByRole("textbox", { name: "Cerca ticket" });
    fireEvent.change(search, { target: { value: "DDT non visibile" } });
    fireEvent.click(await screen.findByRole("button", { name: /Apri ticket di Impresa Alfa · DDT non visibile/ }));
    expect(await screen.findByRole("dialog")).toHaveTextContent("vecchio-alfa");
    expect(fixture.lookups).toEqual([]);
  });

  it("mantiene il collegamento al cockpit con il nuovo nome e conserva gli altri parametri", async () => {
    openInbox("/admin/cs?tab=cockpit&origine=dashboard");
    expect(await screen.findByText("Riepilogo clienti AI")).toBeVisible();
    expect(screen.getByRole("tab", { name: "Priorità clienti", selected: true })).toBeVisible();
    fireEvent.click(screen.getByRole("tab", { name: "Ticket" }));
    expect(await screen.findByRole("textbox", { name: "Cerca ticket" })).toBeVisible();
    expect(screen.getByLabelText("URL della vista")).toHaveTextContent("?origine=dashboard");
  });

  it("permette di passare dai ticket alle priorità con la tastiera", async () => {
    openInbox();
    fireEvent.keyDown(screen.getByRole("tab", { name: "Ticket" }), { key: "ArrowRight" });
    expect(await screen.findByText("Riepilogo clienti AI")).toBeVisible();
    expect(screen.getByRole("tab", { name: "Priorità clienti", selected: true })).toHaveFocus();
  });

  it("Indicatori conta i ticket in attesa senza attribuire ritardi ai ticket con risposta", async () => {
    fixture.replied = true;
    openInbox("/admin/cs?tab=dashboard");
    const queue = await screen.findByText("In attesa da oltre 4 ore");
    const counts = queue.closest("dl");
    expect(counts?.textContent).toContain("Da gestire2");
    expect(counts?.textContent).toContain("Da rispondere1");
    expect(queue.parentElement?.querySelector("dd")).toHaveTextContent("1");
  });

  it("apre un'altra vista disponibile quando il profilo non può gestire i ticket", async () => {
    fixture.canManageTickets = false;
    openInbox();
    expect(await screen.findByText("Riepilogo clienti AI")).toBeVisible();
    expect(screen.queryByRole("tab", { name: "Ticket" })).not.toBeInTheDocument();
  });
});

describe("Formato richieste di assistenza", () => {
  it("separa i dettagli del ticket e conserva il testo libero dei messaggi storici", () => {
    const ticket = supportTicketDetails(
      "## 🎫 Ticket #ABCDEF01 — Modulo di collaudo\r\n\r\n**Aperto da**: Giulia\r\n\r\n### 📝 Descrizione\r\nPrima riga.\r\nSeconda riga.\r\n\r\n### 🤖 Conversazione con Silvio Assistente (per contesto)\r\nChat precedente.\r\n\r\n---\r\n_Ticket aperto via AI Assistant. Rispondi qui per gestirlo._",
    );
    expect(ticket).toEqual({ code: "#ABCDEF01", title: "Modulo di collaudo", author: "Giulia", description: "Prima riga.\nSeconda riga.", transcript: "Chat precedente." });
    expect(supportTicketDetails("## 🎫 Ticket #EIC-7 — Permessi\n\nTesto precedente")).toMatchObject({ description: "Testo precedente", transcript: null });
    expect(supportTicketDetails("Messaggio diretto")).toBeNull();
  });
});
