import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const esito = vi.hoisted((): Record<string, unknown> => ({
  commessa: { id: "o", company_id: "c", codice: "O-1", descrizione: "", stato: "in_corso", inizio: null, fine: "2026-12-14", indirizzo: null },
  ipotesi: { costoOrario: 30, oreGiorno: 8, resaPct: 85 }, costoOrarioDa: "predefinito", regione: "Lombardia", origineVoci: "computo",
  voci: [{ descrizione: "Posa gres", quantita: 10, unita: "m2", calcolo: { ore: 8, min: 8, max: 8, fonte: "prezzario" } }],
  piano: {
    dal: "2026-11-02", al: "2026-12-14", giorniDisponibili: 30, oreTotali: 120, oreMin: 80, oreMax: 160, operaiMassimi: 2, voci: 1, vociSenzaDato: 0, coperturaPct: 100, fonti: {}, fattibile: true,
    avvisi: ["Una parte delle ore è stimata dal prezzario regionale: correggi le rese per renderla tua."],
    fasi: [{ nome: "Posa", dal: "2026-11-02", al: "2026-11-20", ore: 120, oreMin: 80, oreMax: 160, fonti: ["prezzario"], giorni: 15, operaiNecessari: 2, ditta: null, percentuale: 0, vociSenzaDato: 0, conOreDivise: false, id: "f" }],
  },
  margine: { ricavi: 1000, costi: {}, margine: null, margineMassimo: 400, percentuale: null, completo: false, mancano: ["il costo dei materiali"] },
  risorse: { persone: [{ employee_id: "e", nome: "Anna", fase: "Posa", faseId: "f", dal: null, al: null, motivo: "è libero in queste date" }], mezzi: [], mancano: [{ fase: "Posa", persone: 1 }], mezziMancanti: [] },
  previsione: { dataPrevista: null, ritardoGiorni: null, avanzamentoPct: 0, affidabile: false, perche: "Il cantiere non è ancora partito." },
  avvisiLettura: [],
}));
const inserite: unknown[] = [];
vi.mock("../../../shared/piano-cantiere/costruisci.ts", () => ({ costruisciPiano: vi.fn(async () => esito) }));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    rpc: vi.fn(async (name: string, args: unknown) => {
      if (name !== "commessa_assegna_persona") throw new Error("RPC inattesa");
      inserite.push(args); return { data: "riga-assegnata", error: null as null };
    }),
    from: () => ({
      insert: async (r: unknown) => { inserite.push(r); return { error: null as null }; },
      select: () => ({ eq: async () => ({ data: [] as unknown[], error: null as null }) }),
    }),
  },
}));
const permessi = vi.hoisted(() => ({ canEditOrders: true, solaLettura: false }));
vi.mock("@/hooks/usePermissions", () => ({ usePermissions: () => permessi }));
vi.mock("@/lib/orders/refreshWorkQueries", () => ({ refreshWorkQueries: vi.fn() }));
import { PianoCantiereDialog } from "@/components/orders/PianoCantiereDialog";

const apri = (puoModificare = true) => render(
  <QueryClientProvider client={new QueryClient()}><PianoCantiereDialog orderId="o" puoModificare={puoModificare} open onOpenChange={() => {}} /></QueryClientProvider>,
);

describe("Calcola come finire", () => {
  it("mostra ore con l'intervallo, ipotesi, fonte e margine «al massimo» con cosa manca", async () => {
    apri();
    expect((await screen.findAllByText("120 ore", { exact: false })).length).toBeGreaterThan(0);
    expect(screen.getByText("da 80 ore a 160 ore")).toBeTruthy();
    expect(screen.getByText("Margine al massimo")).toBeTruthy();
    expect(screen.getByText(/mancano: il costo dei materiali/)).toBeTruthy();
    expect(screen.getAllByText(/stima dal prezzario regionale/).length).toBeGreaterThan(0);
    expect(screen.getByText(/Mancano 1 persona/)).toBeTruthy();
    expect(screen.getByLabelText("Costo orario (€)")).toBeTruthy();
  });
  it("assegna solo quando si preme il pulsante, sulla fase giusta", async () => {
    apri();
    expect(inserite).toHaveLength(0);
    fireEvent.click(await screen.findByRole("button", { name: /Assegna questa persona/ }));
    await waitFor(() => expect(inserite).toHaveLength(1));
    expect(inserite[0]).toMatchObject({ p_employee_id: "e", p_phase_id: "f", p_planned_hours: 60 });
    expect(inserite[0]).not.toHaveProperty("hourly_rate");
  });
  it("chi non può modificare vede i conti ma non assegna", async () => {
    apri(false);
    await screen.findByText("Margine al massimo");
    expect(screen.queryByRole("button", { name: /Assegna/ })).toBeNull();
    expect(screen.queryByText(/Correggi le ore/)).toBeNull();
  });
  it("assegna anche chi non è amministratore ma ha «Modifica commesse»; senza, il pulsante non c'è (14/11/2026)", async () => {
    permessi.canEditOrders = false;
    const { unmount } = apri();
    await screen.findByText("Margine al massimo");
    expect(screen.queryByRole("button", { name: /Assegna questa persona/ })).toBeNull();
    unmount();
    permessi.canEditOrders = true;
    apri();
    expect(await screen.findByRole("button", { name: /Assegna questa persona/ })).toBeTruthy();
  });
});
