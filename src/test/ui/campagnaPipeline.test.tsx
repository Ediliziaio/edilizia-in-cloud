/**
 * La scheda Pipeline dell'Outreach Engine con i numeri veri di ThermoDMR ·
 * Flusso C del 24/09/2026: prima diceva «417 contattati» sotto una scheda che
 * ne diceva 390, «<1% degli iscritti» su tutto e «7 da richiamare» era una
 * scritta, non un pulsante. E contava 37 rimbalzi su 621 invii (6%, badge
 * rosso): 21 erano indirizzi mai scritti da questo flusso, chiusi perché già
 * rimbalzati con un altro. I rimbalzi veri erano 16 (2,6%).
 */
import { fireEvent, render, screen, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import type { FaseRiga, PassoDef } from "@/components/admin/outreach/campagne/campagneFasi";

vi.mock("@/integrations/supabase/client", () => {
  const catena: Record<string, unknown> = {};
  const fine = Promise.resolve({ data: [], error: null });
  for (const m of ["from", "select", "eq", "in", "order", "limit", "rpc"]) catena[m] = () => catena;
  catena.then = (a: (v: unknown) => unknown, b?: (e: unknown) => unknown) => fine.then(a, b);
  return { supabase: catena };
});
vi.mock("@/components/admin/outreach/OutreachConvertContactDialog", () => ({
  OutreachConvertContactDialog: ({ trigger }: { trigger?: React.ReactNode }) => trigger ?? null,
}));

const FASI: FaseRiga[] = ([
  ["da_contattare", 4320], ["passo_1", 171], ["passo_2", 164], ["passo_3", 30],
  ["risposta_interessato", 4], ["risposta_domanda", 3], ["risposta_non_interessato", 6],
  ["rimbalzato", 16], ["escluso", 21], ["disiscritto", 1], ["fermato", 1],
] as Array<[string, number]>).map(([fase, contatti]): FaseRiga => ({ fase, contatti, in_pausa: 0, prossimo_invio: null, ultimo_programmato: null }));
const freno: { ultimo: { fermato_at: string; prime_email: number; rimbalzi: number } | null } = { ultimo: null };
const PASSI = Array.from({ length: 7 }, (_, i): PassoDef => ({ passo: i + 1, canale: "email", giorno: i * 4, oggetto: null }));

vi.mock("@/components/admin/outreach/campagne/useCampagneOutreach", async (importOriginal) => {
  const originale = await importOriginal<typeof import("@/components/admin/outreach/campagne/useCampagneOutreach")>();
  const pronto = <T,>(data: T) => ({ data, isLoading: false, isFetching: false, error: null as Error | null });
  return {
    ...originale,
    useCampagnaFasi: () => pronto(FASI),
    useCampagnaPassi: () => pronto(PASSI),
    useCampagnaContatti: () => pronto({ righe: [], totale: 0 }),
    useUltimoFreno: () => pronto(freno.ultimo),
  };
});

import { CampagnaPipeline } from "@/components/admin/outreach/campagne/CampagnaPipeline";
import { CampagnaSelettore } from "@/components/admin/outreach/campagne/CampagnaSelettore";
import type { CampagnaRiepilogo } from "@/components/admin/outreach/campagne/useCampagneOutreach";

function campagna(sopra: Partial<CampagnaRiepilogo> = {}): CampagnaRiepilogo {
  return {
    sequence_id: "s1", nome: "ThermoDMR · Flusso C — Imprese edili", stato: "active", brand_id: "b1", brand: "ThermoDMR",
    creata_at: "2026-09-10T08:00:00Z", passi: 7, ramificata: false, aperture_tracciate: false,
    iscritti: 4737, contattati: 390, da_contattare: 4320, in_corso: 365, completati: 0, risposte: 13, interessati: 7,
    non_interessati: 6, rimbalzati: 16, disiscritti: 1, fermati: 1, in_pausa: 0, messaggi_inviati: 621,
    messaggi_programmati: 0, messaggi_da_mandare: 0, prossimo_invio: null, ultimo_programmato: null,
    ...sopra,
  };
}

function disegna(ui: React.ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}><MemoryRouter>{ui}</MemoryRouter></QueryClientProvider>);
}

describe("Pipeline di una campagna", () => {
  it("i contattati sono quelli della scheda (chi ha ricevuto almeno un'email), con la quota di risposte", () => {
    disegna(<CampagnaPipeline companyId="c" campagna={campagna()} stima={null} />);
    expect(screen.getByText("390")).toBeInTheDocument();
    expect(screen.getByText(/hanno risposto \(3,3%\)/)).toBeInTheDocument();
    expect(screen.queryByText("417")).not.toBeInTheDocument();
  });

  it("le percentuali di risposte e uscite sono sui contattati, i rimbalzi sugli invii", () => {
    disegna(<CampagnaPipeline companyId="c" campagna={campagna()} stima={null} />);
    const interessati = screen.getByRole("button", { name: /Interessati/ });
    expect(within(interessati).getByText("1% dei contattati")).toBeInTheDocument();
    const rimbalzate = screen.getByRole("button", { name: /Rimbalzate/ });
    expect(within(rimbalzate).getByText("2,6% degli invii")).toBeInTheDocument();
    expect(screen.queryByText(/degli iscritti/)).not.toBeInTheDocument();
  });

  it("chi è escluso prima dell'invio ha la sua tessera, senza quota e fuori dai rimbalzi", () => {
    disegna(<CampagnaPipeline companyId="c" campagna={campagna()} stima={null} />);
    const esclusi = screen.getByRole("button", { name: /Esclusi prima dell'invio/ });
    expect(within(esclusi).getByText("21")).toBeInTheDocument();
    expect(within(esclusi).getByText("nessuna email partita")).toBeInTheDocument();
    // 16 su 621 è il 2,6%: sotto la soglia, niente avviso (con 37 era il 6%).
    expect(screen.queryByText(/Rimbalzi al/)).not.toBeInTheDocument();
  });

  it("«da richiamare» è un pulsante che apre l'elenco delle risposte calde", () => {
    disegna(<CampagnaPipeline companyId="c" campagna={campagna()} stima={null} />);
    fireEvent.click(screen.getByRole("button", { name: /Email 1/ }));
    expect(screen.getByText("ricevuta · la 2ª parte al giorno 4")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /7 da richiamare/ }));
    expect(screen.getByText("vogliono saperne di più", { selector: "p" })).toBeInTheDocument();
  });

  it("rimbalzi oltre il 3% degli invii: avviso con il pulsante per vedere chi", () => {
    disegna(<CampagnaPipeline companyId="c" campagna={campagna({ messaggi_inviati: 400 })} stima={null} />);
    expect(screen.getByText(/Rimbalzi al 4% degli invii/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Vedi chi" }));
    expect(screen.getByText("indirizzo inesistente o rifiutato", { selector: "p" })).toBeInTheDocument();
  });

  it("rimbalzi sotto la soglia: nessun avviso", () => {
    disegna(<CampagnaPipeline companyId="c" campagna={campagna({ messaggi_inviati: 2400 })} stima={null} />);
    expect(screen.queryByText(/Rimbalzi al/)).not.toBeInTheDocument();
  });

  it("fermata dal freno dei rimbalzi: dice quando e perché", () => {
    freno.ultimo = { fermato_at: "2026-09-25T09:18:00Z", prime_email: 100, rimbalzi: 5 };
    try {
      disegna(<CampagnaPipeline companyId="c" campagna={campagna({ stato: "paused" })} stima={null} />);
      expect(screen.getByText("Fermata dal freno dei rimbalzi")).toBeInTheDocument();
      expect(screen.getByText(/5 indirizzi\s+inesistenti sulle ultime 100 prime email/)).toBeInTheDocument();
    } finally {
      freno.ultimo = null;
    }
  });

  it("in pausa a mano: il messaggio di sempre", () => {
    disegna(<CampagnaPipeline companyId="c" campagna={campagna({ stato: "paused" })} stima={null} />);
    expect(screen.getByText(/Campagna in pausa: non parte niente finché non la riattivi/)).toBeInTheDocument();
    expect(screen.queryByText("Fermata dal freno dei rimbalzi")).not.toBeInTheDocument();
  });
});

describe("Schede delle campagne", () => {
  it("dicono come sta andando e segnalano i rimbalzi alti", () => {
    disegna(
      <CampagnaSelettore
        campagne={[campagna(), campagna({ sequence_id: "s2", nome: "Marketing Edile · Serramenti", rimbalzati: 25, messaggi_inviati: 755, contattati: 475, risposte: 7 })]}
        scelta="s1"
        onCambia={() => {}}
      />,
    );
    const [c, serramenti] = screen.getAllByRole("radio");
    expect(within(c).getByText(/\(3,3%\)/)).toBeInTheDocument();
    // 16 rimbalzi veri su 621 invii: sotto il 3%, niente badge.
    expect(within(c).queryByText(/rimbalzi/)).not.toBeInTheDocument();
    expect(within(serramenti).getByText(/rimbalzi 3,3%/)).toBeInTheDocument();
  });
});
