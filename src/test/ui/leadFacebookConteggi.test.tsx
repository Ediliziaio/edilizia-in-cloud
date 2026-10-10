/**
 * Lead Facebook e Instagram: conteggi veri, importazione solo per chi gestisce, niente roba da sviluppatori (09/10/2026).
 *
 *   · «Lead totali» scaricava tutti gli eventi con il loro contenuto e li contava nel browser; una risposta si ferma a
 *     1.000 righe e un'azienda ne ha 1.726. Ora un conteggio esatto per modulo, senza scaricare nessun contenuto.
 *   · «Backfill» è attivo solo per chi ha «Integrazioni & Canali» in modifica.
 *   · La lista «Meta App Review» (per chi sviluppa l'app Meta) e il secondo titolo non compaiono più al cliente.
 *   · Gli annunci e i moduli contatto di Meta non si toccano: la pagina legge da Meta e scrive solo nel CRM.
 */
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type Evento = { id: string; company_id: string; provider: string; event_type: string; status: string; received_at: string; payload: { form_id: string } };

const stato = vi.hoisted(() => ({
  ruolo: "company_admin" as string,
  puoModificare: true,
  eventi: [] as Array<{ id: string; company_id: string; provider: string; event_type: string; status: string; received_at: string; payload: { form_id: string } }>,
  chiamate: [] as Array<{ tabella: string; colonne: string; testa: boolean }>,
  conteggiInErrore: false,
  toastOk: vi.fn(),
  toastErrore: vi.fn(),
  fetch: vi.fn(),
}));

vi.mock("sonner", () => ({ toast: { success: stato.toastOk, error: stato.toastErrore, info: vi.fn(), warning: vi.fn() } }));
vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ effectiveCompany: { id: "azienda-1" }, role: stato.ruolo }),
}));
vi.mock("@/hooks/usePermissions", () => ({
  usePermissions: () => ({ canEditSettingsIntegrations: stato.puoModificare }),
}));
vi.mock("@/components/integrations/MetaIntegrationWizard", () => ({ MetaIntegrationWizard: (): null => null }));
vi.mock("@/integrations/supabase/client", () => {
  const costruisci = (tabella: string) => {
    let colonne = "";
    let testa = false;
    const filtri: Array<[string, unknown]> = [];
    let minimo: string | null = null;
    let limite: number | null = null;
    let decrescente = false;
    const risultato = () => {
      if (tabella === "integrations") {
        return { data: { id: "int-1", company_id: "azienda-1", provider: "meta", status: "connected", rientro_lead_modo: "off", rientro_lead_giorni: 90 }, error: null as unknown, count: null as number | null };
      }
      if (tabella === "meta_lead_forms") {
        return {
          data: [
            { id: "f1", form_id: "1111", form_name: "Preventivo fotovoltaico", status: "active", page_asset_id: "p1" },
            { id: "f2", form_id: "2222", form_name: "Bagno chiavi in mano", status: "active", page_asset_id: "p1" },
          ] as unknown,
          error: null as unknown,
          count: null as number | null,
        };
      }
      if (tabella === "meta_assets") return { data: [{ id: "p1", asset_id: "x", asset_name: "Rossi Costruzioni" }] as unknown, error: null as unknown, count: null as number | null };
      if (tabella === "integration_webhook_events") {
        if (stato.conteggiInErrore && testa) return { data: null as unknown, error: { message: "boom" } as unknown, count: null as number | null };
        let righe = stato.eventi.filter((e) =>
          filtri.every(([col, val]) => (col === "payload->>form_id" ? String(e.payload.form_id) === val : (e as unknown as Record<string, unknown>)[col] === val)),
        );
        if (minimo) righe = righe.filter((e) => e.received_at >= minimo!);
        righe = [...righe].sort((a, b) => (decrescente ? b.received_at.localeCompare(a.received_at) : a.received_at.localeCompare(b.received_at)));
        const totale = righe.length;
        if (limite !== null) righe = righe.slice(0, limite);
        // Come PostgREST: mai più di 1.000 righe in una risposta.
        righe = righe.slice(0, 1000);
        return { data: (testa ? null : righe) as unknown, error: null as unknown, count: totale as number | null };
      }
      return { data: null as unknown, error: null as unknown, count: null as number | null };
    };
    const b = {
      select: (cols: string, opzioni?: { head?: boolean }) => {
        colonne = cols;
        testa = !!opzioni?.head;
        stato.chiamate.push({ tabella, colonne, testa });
        return b;
      },
      eq: (col: string, val: unknown) => {
        filtri.push([col, val]);
        return b;
      },
      gte: (_col: string, val: string) => {
        minimo = val;
        return b;
      },
      order: (_col: string, o?: { ascending?: boolean }) => {
        decrescente = o?.ascending === false;
        return b;
      },
      limit: (n: number) => {
        limite = n;
        return b;
      },
      maybeSingle: () => Promise.resolve(risultato()),
      then: (ok: (v: ReturnType<typeof risultato>) => unknown, ko?: (e: unknown) => unknown) => Promise.resolve(risultato()).then(ok, ko),
    };
    return b;
  };
  return {
    supabase: {
      from: (tabella: string) => costruisci(tabella),
      auth: { getSession: async () => ({ data: { session: { access_token: "token-finto" } as unknown } }) },
    },
  };
});

import FacebookFormsPage from "@/pages/azienda/marketing/FacebookFormsPage";

function evento(formId: string, i: number, extra: Partial<Evento> = {}): Evento {
  // Date decrescenti: i primi sono i più recenti. Tutte entro gli ultimi giorni.
  return {
    id: `e-${formId}-${i}`,
    company_id: "azienda-1",
    provider: "meta",
    event_type: "leadgen",
    status: "processed",
    received_at: new Date(Date.now() - (i + 1) * 60000).toISOString(),
    payload: { form_id: formId },
    ...extra,
  };
}

function monta(comeAdmin = false) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <FacebookFormsPage comeAdmin={comeAdmin} />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const rigaDel = (nome: string) => screen.getByText(nome).closest("tr") as HTMLElement;

beforeEach(() => {
  stato.ruolo = "company_admin";
  stato.puoModificare = true;
  stato.eventi = [];
  stato.chiamate.length = 0;
  stato.conteggiInErrore = false;
  stato.toastOk.mockReset();
  stato.toastErrore.mockReset();
  stato.fetch.mockReset();
  stato.fetch.mockResolvedValue({ ok: true, status: 200, json: async () => ({}) });
  vi.stubGlobal("fetch", stato.fetch);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("contatti ricevuti per modulo", () => {
  it("1726 contatti di un modulo sono 1726, non 1000", async () => {
    stato.eventi = [
      ...Array.from({ length: 1726 }, (_, i) => evento("1111", i)),
      ...Array.from({ length: 5 }, (_, i) => evento("2222", i)),
      // Non contano: altro modulo non nostro, evento fallito, altra azienda.
      evento("9999", 0),
      evento("1111", 5000, { status: "failed" }),
      evento("1111", 5001, { company_id: "altra-azienda" }),
    ];
    monta();
    await screen.findByText("Preventivo fotovoltaico");
    await waitFor(() => expect(within(rigaDel("Preventivo fotovoltaico")).getByText("1726")).toBeInTheDocument());
    expect(within(rigaDel("Bagno chiavi in mano")).getByText("5")).toBeInTheDocument();
  });

  it("non scarica il contenuto degli eventi: solo conteggi e la data dell'ultimo", async () => {
    stato.eventi = Array.from({ length: 30 }, (_, i) => evento("1111", i));
    monta();
    await waitFor(() => expect(within(rigaDel("Preventivo fotovoltaico")).getByText("30")).toBeInTheDocument());
    const suglieventi = stato.chiamate.filter((c) => c.tabella === "integration_webhook_events");
    expect(suglieventi.length).toBeGreaterThan(0);
    expect(suglieventi.some((c) => /payload/.test(c.colonne))).toBe(false);
    expect(suglieventi.some((c) => c.testa)).toBe(true);
  });

  it("mostra la data dell'ultimo contatto di ogni modulo", async () => {
    stato.eventi = [evento("1111", 0)];
    monta();
    await screen.findByText("Preventivo fotovoltaico");
    await waitFor(() => expect(within(rigaDel("Preventivo fotovoltaico")).getByText(/^\d{2}\/\d{2}\/\d{4} \d{2}:\d{2}$/)).toBeInTheDocument());
    expect(within(rigaDel("Bagno chiavi in mano")).getByText("—")).toBeInTheDocument();
  });

  it("se i conteggi non si leggono scrive «–», non «0»", async () => {
    stato.conteggiInErrore = true;
    stato.eventi = [evento("1111", 0)];
    monta();
    await screen.findByText("Preventivo fotovoltaico");
    await waitFor(() => expect(within(rigaDel("Preventivo fotovoltaico")).getByText("–")).toBeInTheDocument());
    expect(screen.getByText(/Non riesco a contare i contatti di ogni modulo/)).toBeInTheDocument();
  });
});

describe("importare i contatti passati", () => {
  it("chi gestisce le integrazioni può importarli: parte la richiesta e lo dice", async () => {
    monta();
    await screen.findByText("Preventivo fotovoltaico");
    const pulsante = (await within(rigaDel("Preventivo fotovoltaico")).findByRole("button", { name: /Importa i contatti passati/ })) as HTMLButtonElement;
    expect(pulsante.disabled).toBe(false);
    fireEvent.click(pulsante);
    await waitFor(() => expect(stato.toastOk).toHaveBeenCalledWith("Importazione avviata", expect.objectContaining({ description: expect.stringMatching(/nei prossimi minuti/) })));
    const [indirizzo, opzioni] = stato.fetch.mock.calls[0] as [string, { body: string }];
    expect(indirizzo).toMatch(/\/functions\/v1\/meta-api-proxy$/);
    expect(JSON.parse(opzioni.body)).toMatchObject({ action: "backfill-leads", form_id: "1111", company_id: "azienda-1" });
  });

  it("chi può solo consultare non lo importa: pulsante spento, e il motivo", async () => {
    stato.ruolo = "company_user";
    stato.puoModificare = false;
    monta();
    await screen.findByText("Preventivo fotovoltaico");
    const pulsante = (await within(rigaDel("Preventivo fotovoltaico")).findByRole("button", { name: /Importa i contatti passati/ })) as HTMLButtonElement;
    expect(pulsante.disabled).toBe(true);
    expect(pulsante.title).toMatch(/Integrazioni & Canali/);
    fireEvent.click(pulsante);
    expect(stato.fetch).not.toHaveBeenCalled();
  });
});

describe("titolo e testi", () => {
  it("dentro le Impostazioni la pagina non scrive un suo h1 e non mostra la lista per la revisione dell'app Meta", async () => {
    monta();
    await screen.findByText("Preventivo fotovoltaico");
    expect(screen.queryAllByRole("heading", { level: 1 })).toHaveLength(0);
    expect(screen.queryByText(/Meta App Review/)).toBeNull();
    expect(screen.queryByText(/Webhook URL verificato/)).toBeNull();
    // Riquadri con h2, nell'ordine: ricezione, moduli, lead che rientrano.
    expect(screen.getAllByRole("heading", { level: 2 }).map((h) => h.textContent)).toEqual([
      "Ricezione dei contatti",
      "Moduli collegati",
      "Lead che rientrano",
    ]);
  });

  it("nel pannello admin tiene il suo titolo e la lista per la revisione dell'app Meta", async () => {
    monta(true);
    await screen.findByText("Preventivo fotovoltaico");
    expect(screen.getByRole("heading", { level: 1, name: "Moduli Lead Ads" })).toBeInTheDocument();
    expect(screen.getByText(/Meta App Review/)).toBeInTheDocument();
  });

  it("niente istruzioni per sviluppatori: il codice del modulo sta chiuso, le parole sono in italiano", async () => {
    stato.eventi = [];
    monta();
    await screen.findByText("Preventivo fotovoltaico");
    expect(screen.queryByText("Stato Webhook Meta")).toBeNull();
    expect(screen.queryByText(/Meta Business Manager/)).toBeNull();
    expect(screen.queryByText("Form ID")).toBeNull();
    expect(screen.queryByText("Backfill")).toBeNull();
    const dettagli = screen.getAllByText("Codice del modulo in Meta")[0].closest("details") as HTMLDetailsElement;
    expect(dettagli.open).toBe(false);
    // Nessun contatto da 7 giorni: rimanda a «Risolvi problemi» di Integrazioni.
    const link = await screen.findByRole("link", { name: /Integrazioni → Facebook e Instagram → Risolvi problemi/ });
    expect(link.getAttribute("href")).toBe("/azienda/impostazioni/integrazioni");
  });
});
