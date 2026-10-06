/**
 * Uscire dal preventivo non butta via quello che si è appena scritto (06/10/2026).
 *
 * Nei wizard dei preventivi edili le modifiche si salvano da sole 2 secondi dopo l'ultimo
 * tasto. Chi scrive il nome del cliente e subito dopo tocca la freccia «Esci», o usa il
 * menu, o il «indietro» del telefono, usciva prima: il timer veniva spento insieme alla
 * pagina e quello che aveva scritto non arrivava mai al database (restava vero solo il
 * salvataggio all'uscita dal passo Computo, che ha il suo). Si prova la pagina vera, con
 * i passi finti: si scrive, si esce, e la modifica deve essere stata inviata.
 */
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ClmProgetto } from "@/types/climatizzazione";

vi.setConfig({ testTimeout: 60_000 });

const { DETAIL, stato, upsert, navigate } = vi.hoisted(() => {
  const progetto = {
    id: "p1", company_id: "c1", code: "CLM-2026-0007", stato: "bozza", tipo_intervento: null,
    cliente_nome: "Mario", cliente_cognome: "Rossi", cliente_email: null, cliente_telefono: null,
    cantiere_indirizzo: null, cantiere_citta: null, cantiere_provincia: null, cantiere_cap: null,
    sconto_pct: 0, iva_pct: 22, detrazione_pct: 0, massimale_detrazione: null, prezzo_manuale: null as number | null,
    totale_imponibile: 0, totale: 0, note: null,
  } as unknown as ClmProgetto;
  return {
    DETAIL: { progetto, computo: [] as never[], media: [] as never[] },
    stato: { id: "p1" as string | undefined },
    upsert: vi.fn((_input: unknown): Promise<{ id: string }> => Promise.resolve({ id: "p1" })),
    navigate: vi.fn(),
  };
});

vi.mock("react-router-dom", () => ({ useParams: () => ({ id: stato.id }), useNavigate: () => navigate, useSearchParams: () => [new URLSearchParams(), vi.fn()] }));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ user: { id: "u1" }, effectiveCompany: { id: "c1", name: "Bianchi Clima" } }) }));
vi.mock("@/integrations/supabase/client", () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const catena: any = new Proxy({}, { get: (_t, p) => (p === "then" ? undefined : p === "maybeSingle" ? () => Promise.resolve({ data: null as null, error: null as null }) : () => catena) });
  return { supabase: { from: () => catena } };
});
vi.mock("@/hooks/usePermissions", () => ({ usePermissions: () => ({ canViewMargins: true, canViewCosts: true }) }));
vi.mock("@/hooks/useSupportoModelliPreventivo", () => ({ useSupportoModelloPreventivo: () => ({ supported: true, isLoading: false }) }));
vi.mock("@/hooks/useClimatizzazioneProgetto", () => ({
  useClimatizzazioneProgetto: () => ({ data: stato.id ? DETAIL : undefined, isLoading: false, isError: false, refetch: vi.fn() }),
  useUpsertProgetto: () => ({ mutateAsync: upsert, isPending: false }),
  useClmTemplatePdf: () => ({ data: { ragione_sociale: "Bianchi Clima S.r.l." } }),
  getClmTemplatePdf: vi.fn(),
  useSaveComputo: () => ({ mutateAsync: vi.fn(() => Promise.resolve({ totale_imponibile: 0, totale: 0 })), isPending: false }),
  useEffectiveCompanyId: () => "c1",
}));
vi.mock("@/pages/azienda/climatizzazione/ClimatizzazioneWizard/StepCliente", () => ({
  default: ({ onChange }: { onChange: (k: string, v: unknown) => void }) => (
    <button type="button" onClick={() => onChange("cliente_nome", "Luigi")}>scrivi il nome del cliente</button>
  ),
}));
vi.mock("@/pages/azienda/climatizzazione/ClimatizzazioneWizard/StepImmobile", () => ({ default: () => <p>contenuto Impianto</p> }));
vi.mock("@/pages/azienda/climatizzazione/ClimatizzazioneWizard/StepComputo", () => ({ default: () => <p>contenuto Computo</p> }));
vi.mock("@/pages/azienda/climatizzazione/ClimatizzazioneWizard/StepMedia", () => ({ default: () => <p>contenuto Foto</p> }));
vi.mock("@/pages/azienda/climatizzazione/ClimatizzazioneWizard/StepEconomia", () => ({ default: () => <p>contenuto Economia</p> }));
vi.mock("@/pages/azienda/climatizzazione/ClimatizzazioneWizard/StepPdf", () => ({ default: () => <p>contenuto PDF</p> }));

import ClimatizzazioneWizard from "@/pages/azienda/climatizzazione/ClimatizzazioneWizard";

const monta = () => render(
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><ClimatizzazioneWizard /></QueryClientProvider>,
);

beforeEach(() => { stato.id = "p1"; upsert.mockClear(); navigate.mockClear(); });
afterEach(() => cleanup());

describe("uscire da un preventivo edile con una modifica non ancora autosalvata", () => {
  it("la modifica scritta un attimo prima di uscire viene inviata lo stesso", async () => {
    const { unmount } = monta();
    // Il wizard apre il passo Immobile se il cliente c'è: si torna al passo Cliente per scrivere.
    const fasi = await screen.findByRole("navigation", { name: "Fasi del preventivo climatizzazione" });
    fireEvent.click(within(fasi).getByRole("button", { name: "Cliente" }));
    fireEvent.click(await screen.findByRole("button", { name: "scrivi il nome del cliente" }));
    expect(upsert).not.toHaveBeenCalled(); // l'autosave aspetta 2 secondi
    // Si esce con la freccia: la pagina si smonta prima dello scadere dei 2 secondi.
    fireEvent.click(screen.getByRole("button", { name: "Esci dal preventivo" }));
    expect(navigate).toHaveBeenCalledWith("/azienda/marketing/preventivi");
    unmount();
    expect(upsert).toHaveBeenCalledTimes(1);
    expect(upsert).toHaveBeenCalledWith(expect.objectContaining({ id: "p1", cliente_nome: "Luigi", cliente_cognome: "Rossi" }));
  });

  it("senza modifiche in sospeso l'uscita non salva niente", async () => {
    const { unmount } = monta();
    await screen.findByRole("button", { name: "Esci dal preventivo" });
    unmount();
    expect(upsert).not.toHaveBeenCalled();
  });

  it("un preventivo nuovo (non ancora creato) non si salva da solo uscendo: ha il suo dialogo", async () => {
    stato.id = undefined;
    const { unmount } = monta();
    fireEvent.click(await screen.findByRole("button", { name: "scrivi il nome del cliente" }));
    unmount();
    expect(upsert).not.toHaveBeenCalled();
  });
});
