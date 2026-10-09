/**
 * Serramenti: uscire dal preventivo con modifiche non ancora salvate (07/10/2026).
 *
 * L'autosave aspetta 2 secondi e il suo timer si annullava con la pagina; la copia nel browser propone il recupero alla
 * riapertura solo se è più recente del salvataggio di almeno 5 secondi, quindi chi scriveva di continuo perdeva l'ultima
 * modifica senza saperlo. Le uscite sono due, e la seconda c'è già su main (salvaPrimaDiUscireRef):
 *  · la freccia «Esci dal preventivo» salva ORA ed esce solo se il salvataggio riesce; se non riesce dice perché, in
 *    italiano, e offre «Esci comunque» (se il salvataggio fosse rifiutato SEMPRE, un account bloccato o un permesso tolto,
 *    dal preventivo non si uscirebbe più); ha un nome per chi usa un lettore di schermo ed è spenta mentre salva;
 *  · ogni altra uscita (menu, «indietro» del browser): alla chiusura parte il salvataggio di ciò che resta.
 * Un preventivo nuovo non scrive niente (non esiste ancora).
 */
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { toast } from "sonner";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SrProgettoDetail, SrProgettoRow } from "@/types/serramenti";

vi.setConfig({ testTimeout: 30_000 });

const { stato, DETAIL } = vi.hoisted(() => {
  const progetto = {
    id: "p1", company_id: "c1", code: "SR-2026-0412", stato: "bozza", revision_number: 1, parent_id: null, updated_at: "2026-10-05T09:24:00Z",
    cliente_nome: "Mario", cliente_cognome: "Rossi", cliente_telefono: "347 123 4567", cantiere_indirizzo: "Via Roma 4", cantiere_citta: "Vicenza",
    tipo_intervento: "sostituzione", intervento_titolo: null, iva_percentuale: 10, sconto_percentuale: 0, sconto_importo: 0, modello_snapshot: null,
    totale_min: 0, totale_max: 0, totale_serramenti: 0, totale_accessori: 0, metri_quadri_totali: 0,
  } as unknown as SrProgettoRow;
  const detail: SrProgettoDetail = { progetto, serramenti: [], accessori: [], media: [], risparmio: null, servizi: [] };
  return {
    DETAIL: detail,
    stato: {
      id: "p1" as string | undefined,
      navigate: vi.fn(),
      update: vi.fn(async (_patch: Record<string, unknown>): Promise<void> => undefined),
      /** Se c'è, il salvataggio aspetta che si risolva: un salvataggio lento, che la prova tiene aperto. */
      attesa: null as null | Promise<void>,
      rilascia: null as null | (() => void),
    },
  };
});

vi.mock("react-router-dom", () => ({ useParams: () => ({ id: stato.id }), useNavigate: () => stato.navigate, useSearchParams: () => [new URLSearchParams(), vi.fn()] }));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ user: { id: "u1" }, effectiveCompany: { id: "c1", name: "Bianchi Infissi" } }) }));
vi.mock("@/integrations/supabase/client", () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const catena: any = new Proxy({}, { get: (_t, p) => (p === "then" ? undefined : p === "maybeSingle" ? () => Promise.resolve({ data: null as null, error: null as null }) : () => catena) });
  return { supabase: { from: () => catena } };
});
vi.mock("sonner", () => ({ toast: Object.assign(vi.fn(), { info: vi.fn(), success: vi.fn(), error: vi.fn(), warning: vi.fn(), dismiss: vi.fn() }) }));
vi.mock("@/hooks/usePermissions", () => ({ usePermissions: () => ({ canViewMargins: false, canViewCosts: false }) }));
vi.mock("@/hooks/useSerramentiModelSupport", () => ({ useSerramentiModelSupport: () => ({ supported: true, isLoading: false }) }));
vi.mock("@/hooks/useSerramentoPDF", () => ({ useSerramentoPDF: () => ({ previewPDF: vi.fn(), isGenerating: false }) }));
vi.mock("@/lib/serramenti/queries", async () => {
  const { useMutation } = await import("@tanstack/react-query");
  return {
    useProgetto: () => ({ data: (stato.id ? DETAIL : undefined) as SrProgettoDetail | undefined, isLoading: false, isError: false, refetch: vi.fn() }),
    useCreateProgetto: () => ({ mutateAsync: vi.fn(), isPending: false }),
    // Una mutation vera, con la stessa chiave dell'autosave vero: così lo stato «sta salvando» del wizard si accende davvero.
    useUpdateProgetto: (id: string | undefined) => useMutation({
      mutationKey: ["sr-progetto-autosave", id],
      mutationFn: async (patch: Record<string, unknown>) => { if (stato.attesa) await stato.attesa; return stato.update(patch); },
    }),
    useDuplicaProgetto: () => ({ mutateAsync: vi.fn(), isPending: false }),
    useTemplatePdf: () => ({ data: null as null, isLoading: false, isError: false }),
    useAziendaPerPdf: () => ({ data: { ragione_sociale: "Bianchi Infissi S.r.l." } }),
  };
});
vi.mock("@/lib/serramenti/useCostoPosizioneListino", () => ({ useCostoPosizioneListino: () => ({ costoPosizione: (): null => null, inCaricamento: false }) }));
vi.mock("@/components/serramenti/StepBom", () => ({ StepBom: (): null => null }));
vi.mock("@/components/serramenti/StepAccessori", () => ({ StepAccessori: (): null => null }));
vi.mock("@/components/serramenti/StepEconomia", () => ({ StepEconomia: (): null => null }));
vi.mock("@/components/serramenti/StepConsulenza", () => ({ StepConsulenza: (): null => null }));
vi.mock("@/components/serramenti/StepPdf", () => ({ StepPdf: (): null => null }));
vi.mock("@/components/serramenti/StepContenuti", () => ({ StepContenuti: (): null => null }));
vi.mock("@/components/serramenti/ContactPickerDialog", () => ({ ContactPickerDialog: (): null => null }));
vi.mock("@/components/serramenti/AiSerramentiDraftLauncher", () => ({ AiSerramentiDraftLauncher: (): null => null }));
vi.mock("@/components/serramenti/AnteprimaPdfLive", () => ({ AnteprimaPdfLive: (): null => null }));

import SerramentiWizard from "@/pages/azienda/serramenti/SerramentiWizard";

const monta = () => render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })}><SerramentiWizard /></QueryClientProvider>);
/** All'apertura il wizard salta da solo al passo Immobile: si torna al Contatto, dove c'è il campo Nome. */
async function apriSulContatto() {
  const vista = monta();
  const nav = await screen.findByRole("navigation", { name: "Fasi del preventivo" });
  await waitFor(() => expect(within(nav).getByRole("button", { name: "Immobile e contenuti" }).getAttribute("aria-current")).toBe("step"));
  fireEvent.click(within(nav).getByRole("button", { name: "Contatto" }));
  const nome = (await screen.findByPlaceholderText("Paolo")) as HTMLInputElement;
  return { nome, ...vista };
}
const freccia = () => screen.getByRole("button", { name: "Esci dal preventivo" }) as HTMLButtonElement;
const dopoUnAttimo = () => new Promise((r) => setTimeout(r, 150));
/** L'avviso «Salvataggio fallito» della freccia: il testo e l'azione «Esci comunque». */
const avvisoDellaFreccia = () => {
  const chiamata = vi.mocked(toast.error).mock.calls.find((c) => c[0] === "Salvataggio fallito");
  return chiamata?.[1] as { description: string; action?: { label: string; onClick: () => void } } | undefined;
};

beforeEach(() => {
  stato.id = "p1";
  stato.navigate.mockClear();
  stato.update.mockReset();
  stato.update.mockResolvedValue(undefined);
  stato.attesa = null;
  stato.rilascia = null;
  vi.mocked(toast.error).mockClear();
  localStorage.clear();
});
afterEach(() => {
  // Un salvataggio tenuto aperto dalla prova si libera sempre (una prova fallita a metà non deve bloccare le altre).
  stato.rilascia?.();
  stato.rilascia = null;
  cleanup();
});

describe("Serramenti: uscita dal preventivo con modifiche non ancora salvate", () => {
  it("la freccia ha un nome (per chi usa un lettore di schermo) e, dalla freccia, si salva ORA ciò che resta e poi si esce", async () => {
    const { nome } = await apriSulContatto();
    fireEvent.change(nome, { target: { value: "Anna" } });
    fireEvent.click(freccia());
    await waitFor(() => expect(stato.update).toHaveBeenCalledWith(expect.objectContaining({ cliente_nome: "Anna" })));
    await waitFor(() => expect(stato.navigate).toHaveBeenCalledWith("/azienda/marketing/preventivi"));
    await dopoUnAttimo();
    expect(stato.update).toHaveBeenCalledTimes(1); // la chiusura della pagina non risalva
  });

  it("se il salvataggio non riesce dalla freccia non si esce: le modifiche restano a video e l'avviso dice perché, in italiano, con «Esci comunque»", async () => {
    stato.update.mockRejectedValue(new TypeError("Failed to fetch"));
    const { nome } = await apriSulContatto();
    fireEvent.change(nome, { target: { value: "Anna" } });
    fireEvent.click(freccia());
    await waitFor(() => expect(avvisoDellaFreccia()?.action).toBeTruthy());
    expect(avvisoDellaFreccia()?.description).toContain("Connessione persa");
    expect(avvisoDellaFreccia()?.description).toContain("copia di recupero"); // Serramenti tiene le modifiche anche sul dispositivo
    expect(avvisoDellaFreccia()?.description).not.toMatch(/Failed to fetch|TypeError/);
    expect(avvisoDellaFreccia()?.action?.label).toBe("Esci comunque");
    expect(stato.navigate).not.toHaveBeenCalled();
    expect((screen.getByPlaceholderText("Paolo") as HTMLInputElement).value).toBe("Anna");
  });

  it("se il salvataggio è rifiutato SEMPRE (permesso tolto) l'avviso lo dice con la frase dei permessi, e «Esci comunque» esce", async () => {
    stato.update.mockRejectedValue(new Error("new row violates row-level security policy for table \"sr_progetti\""));
    const { nome, unmount } = await apriSulContatto();
    fireEvent.change(nome, { target: { value: "Anna" } });
    fireEvent.click(freccia());
    await waitFor(() => expect(avvisoDellaFreccia()?.action).toBeTruthy());
    expect(avvisoDellaFreccia()?.description).toContain("Non hai i permessi");
    expect(avvisoDellaFreccia()?.description).not.toMatch(/row-level security|policy/);
    expect(stato.navigate).not.toHaveBeenCalled();
    await waitFor(() => expect(freccia().disabled).toBe(false));
    const tentativiPrima = stato.update.mock.calls.length;
    avvisoDellaFreccia()?.action?.onClick(); // «Esci comunque»
    expect(stato.navigate).toHaveBeenCalledWith("/azienda/marketing/preventivi");
    // la pagina si chiude (qui la rotta è finta: la si smonta) e la rete di sicurezza ritenta; l'esito lo dice la mutation
    unmount();
    await waitFor(() => expect(stato.update.mock.calls.length).toBeGreaterThan(tentativiPrima));
  });

  it("mentre la freccia sta salvando è spenta: un altro clic non mette un secondo salvataggio in coda", async () => {
    const { nome } = await apriSulContatto();
    stato.attesa = new Promise<void>((ok) => { stato.rilascia = ok; });
    fireEvent.change(nome, { target: { value: "Anna" } });
    fireEvent.click(freccia());
    await waitFor(() => expect(freccia().disabled).toBe(true));
    fireEvent.click(freccia());
    fireEvent.click(freccia());
    stato.rilascia?.();
    await waitFor(() => expect(stato.navigate).toHaveBeenCalledWith("/azienda/marketing/preventivi"));
    await dopoUnAttimo();
    expect(stato.update).toHaveBeenCalledTimes(1);
    expect(stato.navigate).toHaveBeenCalledTimes(1);
  });

  it("se il salvataggio dalla freccia non riesce, la freccia si riaccende", async () => {
    stato.update.mockRejectedValue(new TypeError("Failed to fetch"));
    const { nome } = await apriSulContatto();
    fireEvent.change(nome, { target: { value: "Anna" } });
    fireEvent.click(freccia());
    await waitFor(() => expect(avvisoDellaFreccia()).toBeTruthy());
    await waitFor(() => expect(freccia().disabled).toBe(false));
  });

  it("lasciando la pagina in un altro modo (menu, indietro del browser) la modifica si salva comunque", async () => {
    const { nome, unmount } = await apriSulContatto();
    fireEvent.change(nome, { target: { value: "Anna" } });
    unmount();
    await waitFor(() => expect(stato.update).toHaveBeenCalledWith(expect.objectContaining({ cliente_nome: "Anna" })));
  });

  it("senza modifiche, uscire non scrive niente", async () => {
    await apriSulContatto();
    fireEvent.click(freccia());
    await waitFor(() => expect(stato.navigate).toHaveBeenCalledWith("/azienda/marketing/preventivi"));
    expect(stato.update).not.toHaveBeenCalled();
  });

  it("un preventivo nuovo non scrive niente in uscita (non esiste ancora)", async () => {
    stato.id = undefined;
    const vista = monta();
    await screen.findByRole("navigation", { name: "Fasi del preventivo" });
    fireEvent.change(await screen.findByPlaceholderText("Paolo"), { target: { value: "Anna" } });
    vista.unmount();
    await dopoUnAttimo();
    expect(stato.update).not.toHaveBeenCalled();
  });
});
