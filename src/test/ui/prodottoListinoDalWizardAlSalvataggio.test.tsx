/**
 * Il prodotto del listino prodotti, dal passo «Computo» di ognuno degli otto preventivatori
 * edili fino al salvataggio (06/10/2026): scelto dal selettore, finisce nel database con la
 * sua foto e la sua descrizione, e a destra nell'anteprima si vede subito. È la prova che
 * l'intera catena è collegata: selettore → passo Computo → salvataggio automatico → riga.
 * Wizard veri con i loro hook veri; cambia solo il database, finto.
 */
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import type { ComponentType } from "react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { TooltipProvider } from "@/components/ui/tooltip";

// Il primo test importa il wizard (e il suo mondo): con la macchina carica supera i 5 secondi di partenza.
vi.setConfig({ testTimeout: 40_000 });

type Inserimenti = Array<{ tabella: string; righe: Array<Record<string, unknown>> }>;
const { stato, registro } = vi.hoisted(() => ({
  stato: { prefisso: "bgn" },
  registro: { inserimenti: [] as Array<{ tabella: string; righe: Array<Record<string, unknown>> }> },
}));

vi.mock("sonner", () => ({ toast: Object.assign(vi.fn(), { info: vi.fn(), success: vi.fn(), error: vi.fn(), warning: vi.fn(), dismiss: vi.fn() }) }));
vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ user: { id: "u1", email: "titolare@example.it" }, profile: { id: "u1", company_id: "c1" }, effectiveCompany: { id: "c1", name: "Bianchi Bagni" }, companyId: "c1", loading: false }),
}));
vi.mock("@/hooks/useEffectiveCompanyId", () => ({ useEffectiveCompanyId: () => "c1" }));
vi.mock("@/hooks/usePermissions", () => ({
  usePermissions: () => new Proxy({}, { get: (_t, p) => (typeof p === "string" && p.startsWith("can") ? true : undefined) }),
}));
vi.mock("@/hooks/useSupportoModelliPreventivo", () => ({ useSupportoModelloPreventivo: () => ({ supported: true, isLoading: false }) }));
vi.mock("@/hooks/useTettiModelSupport", () => ({ useTettiModelSupport: () => ({ supported: true, isLoading: false, data: true }) }));
vi.mock("@/integrations/supabase/client", () => {
  const FAMIGLIA = {
    id: "f-piatto", nome: "Piatto doccia in resina 120x80 cm", codice: "PD-12080", descrizione: "Antiscivolo, finitura pietra.",
    immagine_url: "/templates/bagno/products/piatto-doccia.webp", vertical: "bagno", unit_of_measure: "pz",
    modalita_prezzo_base: "pz", prezzo_base_mode: "vendita", prezzo_base_vendita: 235, prezzo_base_acquisto: 130,
    markup_tipo: "percentuale", markup_valore: 0, sconto_fornitore_1: 0, sconto_fornitore_2: 0, axes: [] as unknown[],
  };
  const dati = (tabella: string, singolo: boolean, perId: boolean): unknown => {
    const p = stato.prefisso;
    if (tabella === "article_families") return [FAMIGLIA];
    if (tabella === `${p}_progetti` && !perId) return singolo ? null : [];
    if (tabella === `${p}_progetti`) {
      const riga = {
        id: "p1", company_id: "c1", code: `${p.toUpperCase()}-2026-0031`, stato: "bozza", tipo_intervento: null as null,
        cliente_nome: "Mario", cliente_cognome: "Rossi", cliente_email: null as null, cliente_telefono: "347 123 4567",
        cantiere_indirizzo: "Via Roma 4", cantiere_citta: "Vicenza", cantiere_provincia: "VI", cantiere_cap: "36100",
        sconto_pct: 0, iva_pct: 10, detrazione_pct: 0, massimale_detrazione: null as null, prezzo_manuale: null as null,
        totale_imponibile: 0, totale: 0, note: null as null, modello_snapshot: null as null,
        created_at: "2026-10-06T08:00:00Z", updated_at: "2026-10-06T08:30:00Z",
      };
      return singolo ? riga : [riga];
    }
    if (tabella === `${p}_computo_voci`) return []; // il computo parte vuoto
    if (tabella === `${p}_template_pdf`) return singolo ? { company_id: "c1", ragione_sociale: "Bianchi Bagni S.r.l." } : [];
    return singolo ? null : [];
  };
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
          return (righe: unknown) => {
            registro.inserimenti.push({ tabella, righe: Array.isArray(righe) ? (righe as Array<Record<string, unknown>>) : [righe as Record<string, unknown>] });
            perId = true;
            return p;
          };
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

const MODULI: Array<{ slug: string; p: string; wizard: () => Promise<{ default: ComponentType }> }> = [
  { slug: "bagni", p: "bgn", wizard: () => import("@/pages/azienda/bagni/BagniWizard") },
  { slug: "tetti", p: "tet", wizard: () => import("@/pages/azienda/tetti/TettiWizard") },
  { slug: "climatizzazione", p: "clm", wizard: () => import("@/pages/azienda/climatizzazione/ClimatizzazioneWizard") },
  { slug: "elettrico", p: "ele", wizard: () => import("@/pages/azienda/elettrico/ElettricoWizard") },
  { slug: "termoidraulico", p: "idr", wizard: () => import("@/pages/azienda/termoidraulico/TermoidraulicoWizard") },
  { slug: "pavimenti", p: "pav", wizard: () => import("@/pages/azienda/pavimenti/PavimentiWizard") },
  { slug: "piscine", p: "pis", wizard: () => import("@/pages/azienda/piscine/PiscineWizard") },
  { slug: "ristrutturazione", p: "rst", wizard: () => import("@/pages/azienda/ristrutturazione/RistrutturazioneWizard") },
];

const inserimenti = (): Inserimenti => registro.inserimenti;

beforeAll(() => {
  // cmdk (il selettore) usa due cose che jsdom non ha.
  Element.prototype.scrollIntoView = Element.prototype.scrollIntoView ?? (() => {});
  globalThis.ResizeObserver = globalThis.ResizeObserver ?? class { observe() {} unobserve() {} disconnect() {} };
});
beforeEach(() => { localStorage.clear(); inserimenti().length = 0; });
afterEach(() => cleanup());

describe.each(MODULI)("$slug: dal selettore al salvataggio", ({ slug, p, wizard }) => {
  it("il prodotto scelto si salva con foto e descrizione, e a destra si vede subito", async () => {
    stato.prefisso = p;
    const { default: Wizard } = await wizard();
    render(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <TooltipProvider>
          <MemoryRouter initialEntries={["/azienda/x/p1/modifica"]}>
            <Routes>
              <Route path="/azienda/x/:id/modifica" element={<Wizard />} />
            </Routes>
          </MemoryRouter>
        </TooltipProvider>
      </QueryClientProvider>,
    );
    const nav = await screen.findByRole("navigation", { name: /Fasi del preventivo/ }, { timeout: 10_000 });
    fireEvent.click(within(nav).getByRole("button", { name: /^Computo/ }));

    fireEvent.click(await screen.findByRole("button", { name: /Cerca voce/ }, { timeout: 10_000 }));
    const dialogo = await screen.findByRole("dialog");
    const riga = (await within(dialogo).findByText("Piatto doccia in resina 120x80 cm", undefined, { timeout: 10_000 })).closest("[cmdk-item]") as HTMLElement;
    // Nel selettore ha la sua foto.
    expect(riga.querySelector('img[src="/templates/bagno/products/piatto-doccia.webp"]')).not.toBeNull();
    fireEvent.click(riga);

    // A destra, nell'anteprima, il prodotto compare con foto e descrizione.
    const anteprima = await screen.findByRole("complementary", { name: "Anteprima del preventivo", hidden: true });
    await waitFor(() => expect(within(anteprima).getByText("Antiscivolo, finitura pietra.")).toBeInTheDocument());
    expect(anteprima.querySelector('img[src="/templates/bagno/products/piatto-doccia.webp"]')).not.toBeNull();

    // Il salvataggio automatico scrive la riga con la provenienza, la foto e la descrizione.
    await waitFor(() => expect(inserimenti().some((i) => i.tabella === `${p}_computo_voci`)).toBe(true), { timeout: 10_000 });
    const scritta = inserimenti().find((i) => i.tabella === `${p}_computo_voci`)!.righe[0];
    expect(scritta).toMatchObject({
      descrizione: "Piatto doccia in resina 120x80 cm", unita_misura: "cad", prezzo_unitario: 235, costo_materiali: 130,
      famiglia_id: "f-piatto", immagine_url: "/templates/bagno/products/piatto-doccia.webp", descrizione_estesa: "Antiscivolo, finitura pietra.",
    });
    expect(slug).toBeTruthy();
  });
});
