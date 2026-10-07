/// <reference types="node" />
/**
 * Il passo Economia dei preventivatori edili vede il computo che hai a video (06/10/2026), non la copia salvata.
 *
 * I wizard passavano a `StepEconomia` il `detail.computo` (le voci come sono sul server) mentre l'anteprima a destra e il
 * passo Computo usano `computoLive ?? detail.computo` (le voci come le hai scritte). Uscendo dal Computo il salvataggio parte,
 * ma `detail` si rinfresca solo a salvataggio finito: per un secondo o due «Arriva a €», i tasti dello sconto veloce e la
 * rata scelta ragionavano su un totale diverso da quello dell'anteprima accanto, e col computo svuotato mostravano ancora
 * i vecchi importi. Ora anche l'Economia parte dalle voci a video.
 *
 * Prova montando il wizard vero (Termoidraulico, con i dati e i passi finti) e, per tutti e otto, sul sorgente del wizard
 * (stesso metodo di economiaEdili.test.tsx: gli otto wizard sono cloni).
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { IdrComputoVoce, IdrProgetto } from "@/types/termoidraulico";

vi.setConfig({ testTimeout: 30_000 });

const { DETAIL, VOCE_NUOVA, stato } = vi.hoisted(() => {
  const voce = (id: string, capitolo: string, descrizione: string, extra: Partial<IdrComputoVoce>): IdrComputoVoce => ({
    id, progetto_id: "p1", company_id: "c1", capitolo_nome: capitolo, descrizione, unita_misura: "cad", quantita: 1,
    prezzo_unitario: 0, costo_materiali: 0, costo_manodopera: 0, sconto_pct: 0, importo: 0, margine_eur: 0, margine_pct: 0,
    listino_voce_id: null, fonte: null, ordine: 0, ...extra,
  });
  const progetto = {
    id: "p1", company_id: "c1", code: "IDR-2026-0031", stato: "bozza", tipo_intervento: null,
    cliente_nome: "Mario", cliente_cognome: "Rossi", cliente_email: null, cliente_telefono: "347 123 4567",
    cantiere_indirizzo: "Via Roma 4", cantiere_citta: "Vicenza", cantiere_provincia: "VI", cantiere_cap: "36100",
    sconto_pct: 5, iva_pct: 10, detrazione_pct: 50, massimale_detrazione: 96000, prezzo_manuale: null as number | null,
    totale_imponibile: 0, totale: 0, note: null,
  } as unknown as IdrProgetto;
  return {
    stato: { id: "p1" as string | undefined },
    DETAIL: {
      progetto,
      computo: [
        voce("v1", "Generatore", "Caldaia a condensazione 24 kW", { prezzo_unitario: 2400 }),
        voce("v2", "Distribuzione", "Radiatori in alluminio", { quantita: 6, prezzo_unitario: 120 }),
      ],
      media: [] as never[],
    },
    VOCE_NUOVA: voce("v4", "Generatore", "Valvola di sicurezza", { prezzo_unitario: 1000 }),
  };
});

vi.mock("react-router-dom", () => ({ useParams: () => ({ id: stato.id }), useNavigate: () => vi.fn(), useSearchParams: () => [new URLSearchParams(), vi.fn()] }));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ user: { id: "u1" }, effectiveCompany: { id: "c1", name: "Bianchi Impianti" } }) }));
vi.mock("@/integrations/supabase/client", () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const catena: any = new Proxy({}, { get: (_t, p) => (p === "then" ? undefined : p === "maybeSingle" ? () => Promise.resolve({ data: null as null, error: null as null }) : () => catena) });
  return { supabase: { from: () => catena } };
});
vi.mock("@/hooks/usePermissions", () => ({ usePermissions: () => ({ canViewMargins: true, canViewCosts: true }) }));
vi.mock("@/hooks/useSupportoModelliPreventivo", () => ({ useSupportoModelloPreventivo: () => ({ supported: true, isLoading: false }) }));
vi.mock("@/hooks/useTermoidraulicoProgetto", () => ({
  useTermoidraulicoProgetto: () => ({ data: stato.id ? DETAIL : undefined, isLoading: false, isError: false, refetch: vi.fn() }),
  useUpsertProgetto: () => ({ mutateAsync: vi.fn(() => Promise.resolve({ id: "p1" })), isPending: false }),
  useIdrTemplatePdf: () => ({ data: { ragione_sociale: "Bianchi Impianti S.r.l." } }),
  getIdrTemplatePdf: vi.fn(),
  useSaveComputo: () => ({ mutateAsync: vi.fn((): Promise<{ totale_imponibile: number; totale: number }> => Promise.resolve({ totale_imponibile: 0, totale: 0 })), isPending: false }),
  useEffectiveCompanyId: () => "c1",
}));
vi.mock("@/hooks/useTermoidraulicoListino", () => ({ useListinoVociSearch: () => ({ data: [{ id: "x" }] as unknown[], isLoading: false }) }));
// L'editor vero ha il suo test: qui basta un pulsante che aggiunge una voce, come farebbe lui.
vi.mock("@/components/termoidraulico/ComputoEditor/ComputoEditor", () => ({
  default: ({ value, onChange }: { value: IdrComputoVoce[]; onChange: (v: IdrComputoVoce[]) => void }) => (
    <button type="button" onClick={() => onChange([...value, VOCE_NUOVA])}>aggiungi una voce</button>
  ),
}));
vi.mock("@/components/computo/ComputoUploadModal", () => ({ ComputoUploadModal: (): null => null }));
vi.mock("@/components/computo/VoiceComputoDialog", () => ({ VoiceComputoDialog: (): null => null }));
vi.mock("@/components/moduli/InterventoScelto", () => ({ LavorazioniDelModello: (): null => null }));
vi.mock("@/pages/azienda/termoidraulico/TermoidraulicoWizard/StepCliente", () => ({ default: () => <p>contenuto Cliente</p> }));
vi.mock("@/pages/azienda/termoidraulico/TermoidraulicoWizard/StepImmobile", () => ({ default: () => <p>contenuto Impianto</p> }));
vi.mock("@/pages/azienda/termoidraulico/TermoidraulicoWizard/StepMedia", () => ({ default: () => <p>contenuto Foto</p> }));
// L'Economia finta dice quali voci ha ricevuto: è quello che conta.
vi.mock("@/pages/azienda/termoidraulico/TermoidraulicoWizard/StepEconomia", () => ({
  default: ({ computo }: { computo: Array<{ descrizione: string }> }) => (
    <p data-testid="economia">{`Economia riceve: ${computo.map((v) => v.descrizione).join(" + ") || "nessuna voce"}`}</p>
  ),
}));
vi.mock("@/pages/azienda/termoidraulico/TermoidraulicoWizard/StepPdf", () => ({ default: () => <p>contenuto PDF</p> }));

import TermoidraulicoWizard from "@/pages/azienda/termoidraulico/TermoidraulicoWizard";

const monta = () => render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><TermoidraulicoWizard /></QueryClientProvider>);
const barra = () => screen.findByRole("navigation", { name: "Fasi del preventivo termoidraulico" });

beforeEach(() => { stato.id = "p1"; localStorage.clear(); });
afterEach(() => cleanup());

describe("Termoidraulico: il passo Economia parte dalle voci a video", () => {
  it("senza aver toccato il computo l'Economia riceve le voci del preventivo", async () => {
    monta();
    const nav = await barra();
    fireEvent.click(within(nav).getByRole("button", { name: "Economia" }));
    const economia = await screen.findByTestId("economia");
    expect(economia.textContent).toBe("Economia riceve: Caldaia a condensazione 24 kW + Radiatori in alluminio");
  });

  it("aggiunta una voce nel Computo e passati subito all'Economia, l'Economia la vede (come l'anteprima), senza aspettare il salvataggio", async () => {
    monta();
    const nav = await barra();
    fireEvent.click(within(nav).getByRole("button", { name: "Computo" }));
    fireEvent.click(await screen.findByRole("button", { name: "aggiungi una voce" }));
    fireEvent.click(within(nav).getByRole("button", { name: "Economia" }));
    const economia = await screen.findByTestId("economia");
    await waitFor(() => expect(economia.textContent).toContain("Valvola di sicurezza"));
    expect(economia.textContent).toBe("Economia riceve: Caldaia a condensazione 24 kW + Radiatori in alluminio + Valvola di sicurezza");
  });
});

describe("i wizard passano all'Economia il computo a video", () => {
  const MODULI = [
    ["bagni", "Bagni"], ["tetti", "Tetti"], ["climatizzazione", "Climatizzazione"], ["elettrico", "Elettrico"],
    ["termoidraulico", "Termoidraulico"], ["pavimenti", "Pavimenti"], ["piscine", "Piscine"], ["ristrutturazione", "Ristrutturazione"],
  ] as const;

  it.each(MODULI)("%s", (modulo, cartella) => {
    const sorgente = readFileSync(join(process.cwd(), `src/pages/azienda/${modulo}/${cartella}Wizard.tsx`), "utf8");
    const chiamata = sorgente.match(/<StepEconomia\b[\s\S]*?\/>/);
    expect(chiamata).not.toBeNull();
    expect(chiamata?.[0]).toContain("computo={computoLive ?? detail.computo}");
    // Ed è lo stesso computo che usano l'anteprima e il passo Computo.
    expect(sorgente).toContain("const vociAnteprima = computoLive ?? detail?.computo ?? NESSUNA_VOCE;");
    expect(sorgente).toContain("initialComputo={computoLive ?? detail.computo}");
  });
});
