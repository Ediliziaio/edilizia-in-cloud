/**
 * Il wizard Termoidraulico (e con lui i preventivatori a computo) nel guscio
 * comune: fasi in alto col totale sempre in vista, anteprima live a destra che si
 * ricalcola mentre si scrive nel computo, «Impresa» solo a chi può vedere i
 * margini. Si prova la pagina vera, con i dati e i passi finti.
 */
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { IdrComputoVoce, IdrProgetto } from "@/types/termoidraulico";

const { DETAIL, VOCE_NUOVA, stato, salvaComputo } = vi.hoisted(() => {
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
    salvaComputo: vi.fn((): Promise<{ totale_imponibile: number; totale: number }> => Promise.resolve({ totale_imponibile: 0, totale: 0 })),
    stato: { id: "p1" as string | undefined, margini: true },
    DETAIL: {
      progetto,
      computo: [
        voce("v1", "Generatore", "Caldaia a condensazione 24 kW", { prezzo_unitario: 2400, costo_materiali: 1500, costo_manodopera: 400 }),
        voce("v2", "Distribuzione", "Radiatori in alluminio", { quantita: 6, prezzo_unitario: 120, costo_materiali: 60, costo_manodopera: 20 }),
        voce("v3", "Distribuzione", "Posa e collaudo", { unita_misura: "a corpo" }),
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
vi.mock("@/hooks/usePermissions", () => ({ usePermissions: () => ({ canViewMargins: stato.margini, canViewCosts: stato.margini }) }));
vi.mock("@/hooks/useSupportoModelliPreventivo", () => ({ useSupportoModelloPreventivo: () => ({ supported: true, isLoading: false }) }));
vi.mock("@/hooks/useTermoidraulicoProgetto", () => ({
  useTermoidraulicoProgetto: () => ({ data: stato.id ? DETAIL : undefined, isLoading: false, isError: false, refetch: vi.fn() }),
  useUpsertProgetto: () => ({ mutateAsync: vi.fn(() => Promise.resolve({ id: "p1" })), isPending: false }),
  useIdrTemplatePdf: () => ({ data: { ragione_sociale: "Bianchi Impianti S.r.l." } }),
  getIdrTemplatePdf: vi.fn(),
  useSaveComputo: () => ({ mutateAsync: salvaComputo, isPending: false }),
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
vi.mock("@/pages/azienda/termoidraulico/TermoidraulicoWizard/StepEconomia", () => ({ default: () => <p>contenuto Economia</p> }));
vi.mock("@/pages/azienda/termoidraulico/TermoidraulicoWizard/StepPdf", () => ({ default: () => <p>contenuto PDF</p> }));

import TermoidraulicoWizard from "@/pages/azienda/termoidraulico/TermoidraulicoWizard";

const monta = () => render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><TermoidraulicoWizard /></QueryClientProvider>);
const barra = () => screen.findByRole("navigation", { name: "Fasi del preventivo termoidraulico" });
const anteprima = () => screen.getByRole("complementary", { name: "Anteprima del preventivo", hidden: true });

beforeEach(() => { stato.id = "p1"; stato.margini = true; localStorage.clear(); salvaComputo.mockClear(); });
afterEach(() => cleanup());

describe("Termoidraulico nel guscio comune", () => {
  it("sei fasi in alto, col totale IVA inclusa sempre in vista (3.260 €)", async () => {
    monta();
    const nav = await barra();
    expect(within(nav).getAllByRole("button").map((b) => b.getAttribute("aria-label"))).toEqual([
      "Cliente", "Dati impianto", "Computo", "Foto", "Economia", "PDF",
    ]);
    // 2.400 + 6 × 120 = 3.120; sconto 5% → 2.964; IVA 10% → 3.260,40
    expect(within(nav.parentElement as HTMLElement).getByText("€ 3.260")).toBeTruthy();
  });

  it("a destra il preventivo: capitoli, righe, sconto, detrazione e la voce senza prezzo segnalata", async () => {
    monta();
    await barra();
    const a = within(anteprima());
    expect(a.getByText("Bianchi Impianti S.r.l.")).toBeTruthy();
    expect(a.getByText("Mario Rossi")).toBeTruthy();
    expect(a.getByText("Generatore")).toBeTruthy();
    expect(a.getByText("Distribuzione")).toBeTruthy();
    expect(a.getByText("Radiatori in alluminio")).toBeTruthy();
    expect(a.getByText("Sconto 5%")).toBeTruthy();
    expect(a.getByText("da prezzare")).toBeTruthy();
    expect(a.getByText(/1 voce senza prezzo/)).toBeTruthy();
    // 50% su 2.964 € netti, sotto il tetto di 96.000 €
    expect(a.getByText("Detrazione indicativa (50%)")).toBeTruthy();
    expect(a.getByText("€ 1.482")).toBeTruthy();
  });

  it("nel computo l'anteprima si ricalcola a ogni voce, e il totale in barra con lei", async () => {
    monta();
    const nav = await barra();
    fireEvent.click(within(nav).getByRole("button", { name: "Computo" }));
    fireEvent.click(await screen.findByRole("button", { name: "aggiungi una voce" }));
    // 3.120 + 1.000 = 4.120; sconto 5% → 3.914; IVA 10% → 4.305,40
    await waitFor(() => expect(within(nav.parentElement as HTMLElement).getByText("€ 4.305")).toBeTruthy());
    expect(within(anteprima()).getByText("Valvola di sicurezza")).toBeTruthy();
  });

  it("uscendo dal computo l'anteprima tiene le voci scritte, senza aspettare il salvataggio", async () => {
    monta();
    const nav = await barra();
    fireEvent.click(within(nav).getByRole("button", { name: "Computo" }));
    fireEvent.click(await screen.findByRole("button", { name: "aggiungi una voce" }));
    fireEvent.click(within(nav).getByRole("button", { name: "Economia" }));
    await screen.findByText("contenuto Economia");
    expect(within(anteprima()).getByText("Valvola di sicurezza")).toBeTruthy();
  });

  it("il piede dice com'è il salvataggio, e al computo modificato lo dice subito", async () => {
    monta();
    const nav = await barra();
    expect(screen.getAllByText("Salvato adesso").length).toBeGreaterThan(0);
    fireEvent.click(within(nav).getByRole("button", { name: "Computo" }));
    fireEvent.click(await screen.findByRole("button", { name: "aggiungi una voce" }));
    await waitFor(() => expect(screen.getAllByText(/Modifiche non salvate/).length).toBeGreaterThan(0));
  });

  it("se il salvataggio all'uscita dal computo non riesce, il piede lo dice e tornando al passo le voci si risalvano da sole", async () => {
    salvaComputo.mockRejectedValueOnce(new Error("rete assente"));
    monta();
    const nav = await barra();
    fireEvent.click(within(nav).getByRole("button", { name: "Computo" }));
    fireEvent.click(await screen.findByRole("button", { name: "aggiungi una voce" }));
    // si esce prima che scatti l'autosave: parte il salvataggio all'uscita, e fallisce
    fireEvent.click(within(nav).getByRole("button", { name: "Economia" }));
    await screen.findByText("contenuto Economia");
    await waitFor(() => expect(salvaComputo).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.getAllByText(/Modifiche non salvate/).length).toBeGreaterThan(0));
    // l'anteprima intanto non le perde
    expect(within(anteprima()).getByText("Valvola di sicurezza")).toBeTruthy();

    // tornando al passo il computo si presenta già «da salvare» e si risalva (autosave a 1,2 s)
    fireEvent.click(within(nav).getByRole("button", { name: "Computo" }));
    await screen.findByRole("button", { name: "aggiungi una voce" });
    await waitFor(() => expect(salvaComputo).toHaveBeenCalledTimes(2), { timeout: 3500 });
  });

  it("se invece il salvataggio all'uscita riesce, il piede torna a «Salvato» e tornando al passo non si risalva", async () => {
    monta();
    const nav = await barra();
    fireEvent.click(within(nav).getByRole("button", { name: "Computo" }));
    fireEvent.click(await screen.findByRole("button", { name: "aggiungi una voce" }));
    fireEvent.click(within(nav).getByRole("button", { name: "Economia" }));
    await waitFor(() => expect(salvaComputo).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.queryAllByText(/Modifiche non salvate/)).toHaveLength(0));
    fireEvent.click(within(nav).getByRole("button", { name: "Computo" }));
    await screen.findByRole("button", { name: "aggiungi una voce" });
    await new Promise((r) => setTimeout(r, 1600));
    expect(salvaComputo).toHaveBeenCalledTimes(1);
  });

  it("«Impresa» compare solo a chi può vedere i margini; con una voce senza costo il margine è «—»", async () => {
    stato.margini = false;
    const { unmount } = monta();
    await barra();
    expect(within(anteprima()).queryByRole("button", { name: "Impresa" })).toBeNull();
    unmount();

    stato.margini = true;
    monta();
    await barra();
    expect(within(anteprima()).queryByText("Costo")).toBeNull();
    fireEvent.click(within(anteprima()).getByRole("button", { name: "Impresa" }));
    await waitFor(() => expect(within(anteprima()).getByText("Costo")).toBeTruthy());
    expect(within(anteprima()).getByText(/Vista impresa/)).toBeTruthy();
    // «Posa e collaudo» è a 0 €: non è venduta. Tutte le righe a prezzo hanno il costo: margine vero.
    // 2.964 netti − (1.900 + 6 × 80 = 2.380) = 584
    expect(within(anteprima()).getByText("€ 584")).toBeTruthy();
  });

  it("cambiando fase si riparte dall'alto della pagina (scorre <main>, non la finestra)", async () => {
    const main = document.createElement("main");
    main.id = "main-content";
    main.scrollTo = vi.fn();
    document.body.appendChild(main);
    try {
      monta();
      const nav = await barra();
      // aperto con il cliente già scelto, il wizard passa da solo al passo dopo: poi si riparte da zero
      await screen.findByText("contenuto Impianto");
      (main.scrollTo as ReturnType<typeof vi.fn>).mockClear();
      fireEvent.click(within(nav).getByRole("button", { name: "Economia" }));
      await screen.findByText("contenuto Economia");
      expect(main.scrollTo).toHaveBeenCalledWith({ top: 0 });
    } finally {
      main.remove();
    }
  });

  it("nascondere l'anteprima la toglie e la ricorda per tutti i preventivatori", async () => {
    monta();
    await barra();
    fireEvent.click(within(anteprima()).getByRole("button", { name: "Nascondi l'anteprima" }));
    expect(screen.queryByRole("complementary", { name: "Anteprima del preventivo", hidden: true })).toBeNull();
    expect(localStorage.getItem("preventivatore_anteprima_nascosta")).toBe("1");
    fireEvent.click(screen.getByRole("button", { name: /Mostra anteprima/ }));
    expect(anteprima()).toBeTruthy();
  });

  it("senza progetto salvato le fasi dopo la prima sono chiuse e il totale non c'è", async () => {
    stato.id = undefined;
    monta();
    const nav = await barra();
    const bottoni = within(nav).getAllByRole("button") as HTMLButtonElement[];
    expect(bottoni.slice(1).every((b) => b.disabled)).toBe(true);
    expect(within(nav.parentElement as HTMLElement).queryByText("Totale IVA incl.")).toBeNull();
  });
});
