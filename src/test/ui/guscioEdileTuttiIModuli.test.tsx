/**
 * Gli otto preventivatori edili (bagni, tetti, climatizzazione, elettrico,
 * termoidraulico, pavimenti, piscine, ristrutturazione) nel guscio comune, provati
 * TUTTI con i loro passi veri e i loro hook veri (cambia solo il database, finto):
 * sei fasi in alto, il totale IVA inclusa sempre in vista, a destra il preventivo che
 * nasce dal computo, «Impresa» solo a chi può vedere i margini; un preventivo nuovo ha
 * le fasi chiuse e nessun totale. Prima solo il termoidraulico aveva una prova a
 * pagina intera: gli altri sette erano copie provate solo sui sorgenti.
 *
 * Nella seconda fase c'è «Cosa ti ha detto il cliente?»: le esigenze (freddo, muffa,
 * bolletta alta…) sono facoltative e, se scelte, si vedono subito nel preventivo a destra.
 */
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import type { ComponentType } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ESIGENZE_DI_SERIE, type ModuloConEsigenze } from "@/lib/preventivatore/esigenzeDiSerie";

// Il primo test importa il wizard (e il suo mondo): con la macchina carica supera i 5 secondi di partenza.
vi.setConfig({ testTimeout: 30_000 });

const { stato } = vi.hoisted(() => ({ stato: { prefisso: "idr", margini: true } }));

vi.mock("sonner", () => ({ toast: Object.assign(vi.fn(), { info: vi.fn(), success: vi.fn(), error: vi.fn(), warning: vi.fn(), dismiss: vi.fn() }) }));
vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ user: { id: "u1", email: "titolare@example.it" }, profile: { id: "u1", company_id: "c1" }, effectiveCompany: { id: "c1", name: "Bianchi Impianti" }, companyId: "c1", loading: false }),
}));
vi.mock("@/hooks/useEffectiveCompanyId", () => ({ useEffectiveCompanyId: () => "c1" }));
vi.mock("@/hooks/usePermissions", () => ({
  usePermissions: () => new Proxy({}, { get: (_t, p) => (p === "canViewMargins" || p === "canViewCosts" ? stato.margini : typeof p === "string" && p.startsWith("can") ? true : undefined) }),
}));
vi.mock("@/hooks/useSupportoModelliPreventivo", () => ({ useSupportoModelloPreventivo: () => ({ supported: true, isLoading: false }) }));
vi.mock("@/hooks/useTettiModelSupport", () => ({ useTettiModelSupport: () => ({ supported: true, isLoading: false, data: true }) }));
vi.mock("@/integrations/supabase/client", () => {
  const voce = (id: string, capitolo: string, descrizione: string, extra: Record<string, unknown>) => ({
    id, progetto_id: "p1", company_id: "c1", capitolo_nome: capitolo, descrizione, unita_misura: "cad", quantita: 1,
    prezzo_unitario: 0, costo_materiali: 0, costo_manodopera: 0, sconto_pct: 0, importo: 0, margine_eur: 0, margine_pct: 0,
    listino_voce_id: null as string | null, fonte: null as string | null, ordine: 0, ...extra,
  });
  const dati = (tabella: string, singolo: boolean, perId: boolean): unknown => {
    const p = stato.prefisso;
    // senza filtro sull'id è la ricerca dell'ultima bozza («Riprendi bozza»): nessuna
    if (tabella === `${p}_progetti` && !perId) return singolo ? null : [];
    if (tabella === `${p}_progetti`) {
      const riga = {
        id: "p1", company_id: "c1", code: `${p.toUpperCase()}-2026-0031`, stato: "bozza", tipo_intervento: null as null,
        cliente_nome: "Mario", cliente_cognome: "Rossi", cliente_email: null as null, cliente_telefono: "347 123 4567",
        cantiere_indirizzo: "Via Roma 4", cantiere_citta: "Vicenza", cantiere_provincia: "VI", cantiere_cap: "36100",
        sconto_pct: 5, iva_pct: 10, detrazione_pct: 50, massimale_detrazione: 96000, prezzo_manuale: null as null,
        totale_imponibile: 0, totale: 0, note: null as null, modello_snapshot: null as null,
        created_at: "2026-10-05T08:00:00Z", updated_at: "2026-10-05T08:30:00Z",
      };
      return singolo ? riga : [riga];
    }
    if (tabella === `${p}_computo_voci`) {
      return [
        voce("v1", "Lavorazioni principali", "Fornitura e posa del materiale principale", { prezzo_unitario: 2400, costo_materiali: 1500, costo_manodopera: 400 }),
        voce("v2", "Lavorazioni principali", "Accessori e finiture", { quantita: 6, prezzo_unitario: 120, costo_materiali: 60, costo_manodopera: 20 }),
        voce("v3", "Opere accessorie", "Posa e collaudo", { unita_misura: "a corpo" }),
      ];
    }
    if (tabella === `${p}_template_pdf`) return singolo ? { company_id: "c1", ragione_sociale: "Bianchi Impianti S.r.l." } : [];
    return singolo ? null : [];
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (globalThis as any).__inserimenti = [] as Array<{ tabella: string; riga: unknown }>;
  const catena = (tabella: string): unknown => {
    let singolo = false;
    let perId = false;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const p: any = new Proxy(function () {}, {
      get: (_t, nome) => {
        if (nome === "then") return (ok: (v: unknown) => unknown) => Promise.resolve({ data: dati(tabella, singolo, perId), error: null as null, count: 0 }).then(ok);
        if (nome === "eq") return (colonna: string) => { if (colonna === "id") perId = true; return p; };
        if (nome === "maybeSingle" || nome === "single") return () => { singolo = true; return p; };
        if (nome === "insert") {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          return (riga: unknown) => { (globalThis as any).__inserimenti.push({ tabella, riga }); perId = true; return p; };
        }
        return () => p;
      },
    });
    return p;
  };
  const nulla = () => Promise.resolve({ data: null as null, error: null as null });
  type Canale = { on: () => Canale; subscribe: () => Canale; unsubscribe: () => void };
  const canale: Canale = { on: () => canale, subscribe: () => canale, unsubscribe: (): void => undefined };
  return {
    supabase: {
      from: (t: string) => catena(t), rpc: nulla, functions: { invoke: nulla },
      storage: { from: () => ({ upload: nulla, download: nulla, remove: nulla, list: () => Promise.resolve({ data: [], error: null }), getPublicUrl: () => ({ data: { publicUrl: "" } }), createSignedUrl: () => Promise.resolve({ data: { signedUrl: "" }, error: null }), createSignedUrls: () => Promise.resolve({ data: [], error: null }) }) },
      auth: { getSession: () => Promise.resolve({ data: { session: null } }), getUser: () => Promise.resolve({ data: { user: { id: "u1" } } }), onAuthStateChange: () => ({ data: { subscription: { unsubscribe: (): void => undefined } } }) },
      channel: () => canale, removeChannel: (): void => undefined,
    },
  };
});

const MODULI: Array<{ slug: string; p: string; fasi: string[]; wizard: () => Promise<{ default: ComponentType }> }> = [
  { slug: "bagni", p: "bgn", fasi: ["Cliente", "Dati bagno", "Computo", "Foto", "Economia", "PDF"], wizard: () => import("@/pages/azienda/bagni/BagniWizard") },
  { slug: "tetti", p: "tet", fasi: ["Cliente", "Dati copertura", "Computo", "Foto", "Economia", "PDF"], wizard: () => import("@/pages/azienda/tetti/TettiWizard") },
  { slug: "climatizzazione", p: "clm", fasi: ["Cliente", "Dati impianto", "Computo", "Foto", "Economia", "PDF"], wizard: () => import("@/pages/azienda/climatizzazione/ClimatizzazioneWizard") },
  { slug: "elettrico", p: "ele", fasi: ["Cliente", "Dati impianto", "Computo", "Foto", "Economia", "PDF"], wizard: () => import("@/pages/azienda/elettrico/ElettricoWizard") },
  { slug: "termoidraulico", p: "idr", fasi: ["Cliente", "Dati impianto", "Computo", "Foto", "Economia", "PDF"], wizard: () => import("@/pages/azienda/termoidraulico/TermoidraulicoWizard") },
  { slug: "pavimenti", p: "pav", fasi: ["Cliente", "Dati intervento", "Computo", "Foto", "Economia", "PDF"], wizard: () => import("@/pages/azienda/pavimenti/PavimentiWizard") },
  { slug: "piscine", p: "pis", fasi: ["Cliente", "Dati piscina", "Computo", "Foto", "Economia", "PDF"], wizard: () => import("@/pages/azienda/piscine/PiscineWizard") },
  { slug: "ristrutturazione", p: "rst", fasi: ["Cliente", "Immobile", "Computo", "Foto", "Economia", "PDF"], wizard: () => import("@/pages/azienda/ristrutturazione/RistrutturazioneWizard") },
];

async function monta(m: (typeof MODULI)[number], nuovo = false) {
  stato.prefisso = m.p;
  const { default: Wizard } = await m.wizard();
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <TooltipProvider>
        <MemoryRouter initialEntries={[nuovo ? "/azienda/x/nuovo" : "/azienda/x/p1/modifica"]}>
          <Routes>
            <Route path="/azienda/x/nuovo" element={<Wizard />} />
            <Route path="/azienda/x/:id/modifica" element={<Wizard />} />
            {/* dopo «Crea e continua» il wizard va a /azienda/<modulo>/<id>/modifica */}
            <Route path="/azienda/:modulo/:id/modifica" element={<Wizard />} />
          </Routes>
        </MemoryRouter>
      </TooltipProvider>
    </QueryClientProvider>,
  );
  return screen.findByRole("navigation", { name: /Fasi del preventivo/ }, { timeout: 8000 });
}
const anteprima = () => screen.getByRole("complementary", { name: "Anteprima del preventivo", hidden: true });

beforeEach(() => { stato.margini = true; localStorage.clear(); });
afterEach(() => cleanup());

describe.each(MODULI)("$slug nel guscio comune", (m) => {
  it("sei fasi in alto coi loro nomi, il totale IVA inclusa in vista (3.260 €) e il preventivo a destra", async () => {
    const nav = await monta(m);
    expect(within(nav).getAllByRole("button").map((b) => b.getAttribute("aria-label") ?? b.textContent)).toEqual(m.fasi);
    // 2.400 + 6 × 120 = 3.120; sconto 5% → 2.964; IVA 10% → 3.260,40
    expect(within(nav.parentElement as HTMLElement).getByText("€ 3.260")).toBeTruthy();
    const a = within(anteprima());
    expect(a.getByText("Bianchi Impianti S.r.l.")).toBeTruthy();
    expect(a.getByText("Mario Rossi")).toBeTruthy();
    expect(a.getByText("Fornitura e posa del materiale principale")).toBeTruthy();
    expect(a.getByText("da prezzare")).toBeTruthy();
    expect(a.getByText("Sconto 5%")).toBeTruthy();
  });

  it("«Impresa» compare solo a chi può vedere i margini", async () => {
    stato.margini = false;
    await monta(m);
    expect(within(anteprima()).queryByRole("button", { name: "Impresa" })).toBeNull();
    cleanup();
    stato.margini = true;
    await monta(m);
    expect(within(anteprima()).getByRole("button", { name: "Impresa" })).toBeTruthy();
  });

  it("«Cosa ti ha detto il cliente?»: facoltativo, un tocco e il problema compare nel preventivo a destra", async () => {
    const nav = await monta(m);
    // La seconda fase è dove si descrive il lavoro: la scheda sta in cima.
    fireEvent.click(within(nav).getAllByRole("button")[1]);
    const scheda = await screen.findByText("Cosa ti ha detto il cliente?", undefined, { timeout: 8000 });
    expect(scheda).toBeTruthy();
    expect(screen.getByText("Facoltativo")).toBeTruthy();
    // Senza scelte l'anteprima è quella di sempre.
    expect(within(anteprima()).queryByText("Da dove partiamo")).toBeNull();

    // Il modello dell'azienda qui non ha una libreria: si parte dalle voci pronte del modulo.
    const pronte = ESIGENZE_DI_SERIE[m.slug as ModuloConEsigenze];
    const chip = screen.getByRole("button", { name: pronte[0].titolo });
    expect(chip.getAttribute("aria-pressed")).toBe("false");
    fireEvent.click(chip);

    await waitFor(() => expect(within(anteprima()).getByText("Da dove partiamo")).toBeTruthy());
    expect(within(anteprima()).getByText(pronte[0].titolo)).toBeTruthy();
    expect(screen.getByRole("button", { name: pronte[0].titolo }).getAttribute("aria-pressed")).toBe("true");

    // Toccata di nuovo, la voce esce: si torna allo standard.
    fireEvent.click(screen.getByRole("button", { name: pronte[0].titolo }));
    await waitFor(() => expect(within(anteprima()).queryByText("Da dove partiamo")).toBeNull());
  });

  it("un preventivo nuovo ha le fasi dopo la prima chiuse e nessun totale", async () => {
    const nav = await monta(m, true);
    const bottoni = within(nav).getAllByRole("button") as HTMLButtonElement[];
    expect(bottoni).toHaveLength(6);
    expect(bottoni[0].disabled).toBe(false);
    expect(bottoni.slice(1).every((b) => b.disabled)).toBe(true);
    expect(within(nav.parentElement as HTMLElement).queryByText("Totale IVA incl.")).toBeNull();
  });

  it("un preventivo nuovo: nome, cognome e telefono, «Crea e continua» crea il progetto e apre le fasi", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (globalThis as any).__inserimenti.length = 0;
    await monta(m, true);
    fireEvent.change(screen.getByPlaceholderText("Mario"), { target: { value: "Anna" } });
    fireEvent.change(screen.getByPlaceholderText("Rossi"), { target: { value: "Verdi" } });
    fireEvent.change(screen.getByPlaceholderText("+39 333 1234567"), { target: { value: "347 765 4321" } });
    // a destra compare subito chi stai scrivendo
    await waitFor(() => expect(within(anteprima()).getByText("Anna Verdi")).toBeTruthy());
    fireEvent.click(await screen.findByRole("button", { name: /Crea e continua/ }));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const inserimenti = () => ((globalThis as any).__inserimenti as Array<{ tabella: string; riga: Record<string, unknown> }>);
    await waitFor(() => expect(inserimenti().some((i) => i.tabella === `${m.p}_progetti`)).toBe(true), { timeout: 5000 });
    const riga = inserimenti().find((i) => i.tabella === `${m.p}_progetti`)!.riga;
    expect(riga.cliente_nome).toBe("Anna");
    expect(riga.cliente_cognome).toBe("Verdi");
    // il preventivo esiste: le fasi dopo la prima si aprono
    await waitFor(() => {
      const fasi = within(screen.getByRole("navigation", { name: /Fasi del preventivo/ })).getAllByRole("button") as HTMLButtonElement[];
      expect(fasi.slice(1).some((b) => !b.disabled)).toBe(true);
    }, { timeout: 8000 });
  });
});
