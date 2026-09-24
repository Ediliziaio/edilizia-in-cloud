/**
 * Email Marketing › Campagne (24/09/2026).
 *
 * Com'era: una colonna a sinistra con «Campagne di flusso» e «Campagne Azione
 * in blocco» che filtravano su tipi che nessuna schermata crea (sempre vuote);
 * «Home» scritto sopra la tabella anche senza cartelle; una colonna «Tipo»
 * che diceva «Email» su tutte; «Da completare prima dell'invio» anche sulle
 * campagne già inviate; aprendo una campagna inviata si finiva nell'editor.
 * E «Duplica» copiava la riga della lista, che non ha il pubblico: la copia
 * perdeva a chi mandare.
 */
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

type Riga = Record<string, unknown>;

const stato: { righe: Riga[]; inserite: Riga[]; lette: string[] } = { righe: [], inserite: [], lette: [] };
const navigate = vi.fn();

// La campagna intera, come la rilegge «Duplica»: ha il pubblico e l'A/B.
const INTERA: Riga = {
  id: "c-inviata", name: "Newsletter settembre", type: "newsletter", subject: "Novità di settembre",
  html_content: "<p>ciao</p>", json_content: null, preview_text: null, sender_name: "Flo", sender_email: "flo@x.it",
  folder_id: null, segment_json: { tags: ["clienti"] }, ab_test_enabled: true, ab_subject_b: "Oggetto B",
  ab_split_percent: 30, ab_winner_criteria: "open_rate", ab_test_duration_hours: 6, track_clicks: true,
  utm_tracking: false, auto_tag: false, resend_to_unopened: false, template_id: null,
};

vi.mock("@/integrations/supabase/client", () => {
  const catena = (tabella: string) => {
    const c: Record<string, unknown> = {};
    for (const m of ["select", "eq", "is", "in", "order", "limit", "range", "ilike"]) c[m] = () => c;
    c.single = () => {
      stato.lette.push(tabella);
      return Promise.resolve({ data: INTERA, error: null });
    };
    c.insert = (riga: Riga) => {
      stato.inserite.push(riga);
      return Promise.resolve({ data: null, error: null });
    };
    c.then = (a: (v: unknown) => unknown, b?: (e: unknown) => unknown) =>
      Promise.resolve({ data: [], error: null }).then(a, b);
    return c;
  };
  return { supabase: { from: (t: string) => catena(t) } };
});

vi.mock("@/contexts/AuthContext", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/contexts/AuthContext")>()),
  useAuth: () => ({ effectiveCompany: { id: "az-1" }, user: { id: "u-1" } }),
}));

vi.mock("@/hooks/useEmailCampaignsPaginated", () => ({
  useEmailCampaignsPaginated: () => ({ data: { data: stato.righe, total: stato.righe.length }, isLoading: false }),
}));

vi.mock("@/components/email-marketing/CampaignDetailDialog", () => ({
  CampaignDetailDialog: ({ campaignId }: { campaignId: string | null }) =>
    campaignId ? <div data-testid="risultati">{campaignId}</div> : null,
}));

vi.mock("react-router-dom", async (importOriginal) => ({
  ...(await importOriginal<typeof import("react-router-dom")>()),
  useNavigate: () => navigate,
}));

const { EmailCampaignsTab } = await import("@/components/email-marketing/EmailCampaignsTab");

const riga = (p: Riga): Riga => ({
  type: "broadcast", subject: "Oggetto", html_content: "<p>x</p>", json_content: null, folder_id: null,
  updated_at: "2026-09-24T10:00:00Z", scheduled_at: null, sent_at: null,
  sent_count: 0, failed_count: 0, total_recipients: 0, ...p,
});

function disegna() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={["/azienda/marketing/email"]}>
        <EmailCampaignsTab />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  stato.righe = [];
  stato.inserite = [];
  stato.lette = [];
  navigate.mockReset();
});

describe("Email Marketing › Campagne", () => {
  it("una lista sola: niente sezioni sempre vuote, niente «Home» senza cartelle", () => {
    stato.righe = [riga({ id: "c-1", name: "Promo", status: "draft" })];
    disegna();
    expect(screen.queryByText("Campagne di flusso")).toBeNull();
    expect(screen.queryByText("Campagne Azione in blocco")).toBeNull();
    expect(screen.queryByText("Home")).toBeNull();
    expect(screen.queryByText("Tipo")).toBeNull();
  });

  it("per le inviate dice quante sono partite, e «da completare» solo sulle bozze", () => {
    stato.righe = [
      riga({ id: "c-bozza", name: "Promo autunno", status: "draft", subject: "", html_content: "" }),
      riga({ id: "c-inviata", name: "Newsletter settembre", status: "sent", subject: "", sent_at: "2026-09-20T08:00:00Z", sent_count: 120, failed_count: 3 }),
    ];
    disegna();
    expect(screen.getByText("120 inviate · 3 non partite")).toBeTruthy();
    expect(screen.getAllByText("Da completare prima dell'invio")).toHaveLength(1);
  });

  it("aprendo un'inviata si vedono i risultati, aprendo una bozza l'editor", () => {
    stato.righe = [
      riga({ id: "c-bozza", name: "Promo autunno", status: "draft" }),
      riga({ id: "c-inviata", name: "Newsletter settembre", status: "sent", sent_count: 120 }),
    ];
    disegna();
    fireEvent.click(screen.getByText("Newsletter settembre"));
    expect(screen.getByTestId("risultati").textContent).toBe("c-inviata");
    expect(navigate).not.toHaveBeenCalled();

    fireEvent.click(screen.getByText("Promo autunno"));
    expect(navigate).toHaveBeenCalledWith("/azienda/marketing/email/campagna/c-bozza/editor");
  });

  it("vuota al primo uso spiega cosa fare; vuota per i filtri offre «Mostra tutte»", () => {
    disegna();
    expect(screen.getByText("Ancora nessuna campagna")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Bozze" }));
    expect(screen.getByText("Nessuna campagna con questi filtri")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Mostra tutte" }));
    expect(screen.getByText("Ancora nessuna campagna")).toBeTruthy();
  });

  it("con dieci campagne o meno la barra delle pagine non c'è", () => {
    stato.righe = [riga({ id: "c-1", name: "Promo", status: "draft" })];
    disegna();
    expect(screen.queryByText("Precedente")).toBeNull();
  });

  it("«Duplica» rilegge la campagna intera: la copia tiene pubblico e A/B", async () => {
    stato.righe = [riga({ id: "c-inviata", name: "Newsletter settembre", status: "sent", sent_count: 120 })];
    disegna();
    const riga0 = screen.getByText("Newsletter settembre").closest("tr")!;
    const menu = within(riga0).getByRole("button");
    fireEvent.pointerDown(menu, { button: 0, ctrlKey: false, pointerType: "mouse" });
    fireEvent.click(await screen.findByText("Duplica"));

    await waitFor(() => expect(stato.inserite).toHaveLength(1));
    expect(stato.lette).toEqual(["email_campaigns"]);
    const copia = stato.inserite[0];
    expect(copia.name).toBe("Copia di Newsletter settembre");
    expect(copia.status).toBe("draft");
    expect(copia.segment_json).toEqual({ tags: ["clienti"] });
    expect(copia.ab_subject_b).toBe("Oggetto B");
    expect(copia.company_id).toBe("az-1");
  });
});
