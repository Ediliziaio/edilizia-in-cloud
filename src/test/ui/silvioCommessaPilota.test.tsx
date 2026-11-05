/**
 * Il pilota automatico nell'interfaccia (fase 5): la pagina «Silvio e le commesse» in Impostazioni
 * (tre livelli, il massimo rispettato, la soglia, il calendario, sola lettura senza permesso), la
 * scheda «Quanto lavora Silvio» (zero con «ancora nessun dato», numeri veri quando ci sono) e il
 * piano di volo sulla commessa (le azioni spuntate vanno alla RPC).
 */
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import type { ReactNode } from "react";

const permessi = { isAdmin: false, isLoading: false, canEditSettingsOrders: true, canViewSettingsOrders: true };
vi.mock("@/hooks/usePermissions", () => ({ usePermissions: () => permessi }));
vi.mock("@/hooks/useEffectiveCompanyId", () => ({ useEffectiveCompanyId: () => "d2000000-0000-4000-a000-000000000002" }));
vi.mock("@/hooks/useSettingsDraftGuard", () => ({ useSettingsDraftGuard: (): void => undefined }));
vi.mock("@/components/silvio-commessa/useCreaConSilvioAttivo", () => ({ useCreaConSilvioAttivo: () => true }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import SettingsSilvioCommesse from "@/pages/azienda/impostazioni/SettingsSilvioCommesse";
import QuantoLavoraSilvio from "@/components/silvio-commessa/QuantoLavoraSilvio";
import { PianoDiVoloCommessa } from "@/components/silvio-commessa/PianoDiVoloCommessa";
import { quantoLavoraDaRisposta } from "../../../shared/silvio-commessa/quantoLavora.ts";

function avvolgi(n: ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}><MemoryRouter>{n}</MemoryRouter></QueryClientProvider>);
}

function dbImpostazioni() {
  const rpc = vi.fn(async (nome: string, _a: Record<string, unknown>) => {
    if (nome === "silvio_autonomia_leggi") {
      return { data: {
        azioni: [
          { azione: "squadra", massimo: "da_sola", livello: "chiede" }, { azione: "ditte", massimo: "chiede", livello: "chiede" },
          { azione: "ordini", massimo: "da_sola", livello: "chiede", soglia_eur: null },
        ],
        calendario: null, festivita: [],
      }, error: null };
    }
    return { data: { azioni: 9 }, error: null };
  });
  return { rpc };
}

describe("Impostazioni → Silvio e le commesse", () => {
  it("tutte le azioni a «Chiede»; «Da solo» non c'è dove non si può; il salvataggio manda livelli, soglia e calendario", async () => {
    const db = dbImpostazioni();
    avvolgi(<SettingsSilvioCommesse db={db} />);
    const ditte = await screen.findByRole("radiogroup", { name: "Assegnare le ditte alle fasi" });
    expect(within(ditte).getByRole("radio", { name: "Chiede" })).toHaveAttribute("aria-checked", "true");
    expect(within(ditte).queryByRole("radio", { name: "Da solo" })).not.toBeInTheDocument();
    expect(screen.getAllByRole("radiogroup")).toHaveLength(9);
    expect(screen.getByText(/Sempre tu, mai Silvio da solo: firma dei contratti/)).toBeInTheDocument();

    const salva = screen.getByRole("button", { name: /Salva/ });
    expect(salva).toBeDisabled();
    fireEvent.click(within(screen.getByRole("radiogroup", { name: "Assegnare la squadra e il capomastro" })).getByRole("radio", { name: "Mai" }));
    fireEvent.click(within(screen.getByRole("radiogroup", { name: "Preparare gli ordini ai fornitori, in bozza" })).getByRole("radio", { name: "Da solo" }));
    // senza soglia non si salva
    expect(screen.getByRole("alert")).toHaveTextContent(/scrivi la soglia/);
    expect(salva).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Soglia degli ordini in euro"), { target: { value: "500" } });
    fireEvent.change(screen.getByLabelText("Chiusura estiva dal"), { target: { value: "10/08" } });
    fireEvent.change(screen.getByLabelText("Chiusura estiva al"), { target: { value: "23/08" } });
    fireEvent.click(salva);
    await waitFor(() => expect(db.rpc).toHaveBeenCalledWith("silvio_autonomia_salva", expect.anything()));
    const args = db.rpc.mock.calls.find((c) => c[0] === "silvio_autonomia_salva")![1] as { p_azioni: { azione: string; livello: string; soglia_eur: number | null }[]; p_calendario: Record<string, unknown> };
    expect(args.p_azioni.find((a) => a.azione === "squadra")?.livello).toBe("vietata");
    expect(args.p_azioni.find((a) => a.azione === "ordini")).toEqual({ azione: "ordini", livello: "da_sola", soglia_eur: 500 });
    expect(args.p_azioni.find((a) => a.azione === "mezzi")).toEqual({ azione: "mezzi", livello: "chiede", soglia_eur: null });
    expect(args.p_calendario).toMatchObject({ chiusura_dal: "08-10", chiusura_al: "08-23", patrono: null, sabato_lavorativo: false });
  });

  it("senza il permesso di modifica: sola lettura", async () => {
    permessi.canEditSettingsOrders = false;
    try {
      avvolgi(<SettingsSilvioCommesse db={dbImpostazioni()} />);
      expect(await screen.findByText(/Sola lettura/)).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: /Salva/ })).toBeNull();
      expect(within(screen.getByRole("radiogroup", { name: "Assegnare la squadra e il capomastro" })).getByRole("radio", { name: "Mai" })).toBeDisabled();
    } finally {
      permessi.canEditSettingsOrders = true;
    }
  });
});

describe("Quanto lavora Silvio", () => {
  it("senza commesse: una frase al posto dei riquadri a zero, mai numeri inventati", async () => {
    avvolgi(<QuantoLavoraSilvio companyId="c" leggi={async () => quantoLavoraDaRisposta({ dal: "2026-08-04", al: "2026-11-01" })} />);
    expect(await screen.findByText(/Ancora nessuna commessa creata o completata con Silvio/)).toBeInTheDocument();
    expect(screen.queryByText("Commesse create")).not.toBeInTheDocument();
    expect(screen.queryByText(/Costo AI/)).not.toBeInTheDocument();
  });

  it("senza commesse ma con letture già pagate: il costo si dice comunque", async () => {
    avvolgi(<QuantoLavoraSilvio companyId="c" leggi={async () => quantoLavoraDaRisposta({ dal: "2026-08-04", al: "2026-11-01", costo_ai_eur: 0.26 })} />);
    expect(await screen.findByText(/Costo AI finora: 0,26/)).toBeInTheDocument();
  });

  it("coi dati: i numeri della RPC, la regola della stima, le commesse a pagine", async () => {
    const leggi = vi.fn(async (_c: string, pagina: number) => quantoLavoraDaRisposta({
      dal: "2026-08-04", al: "2026-11-01", pagina, per_pagina: 20, totale_righe: 25,
      totali: { commesse_create: 3, commesse_completate: 2, punteggio_medio: 71, voci_scritte: 95 },
      correzioni: { totale: 40, tenute_cosi: 34, cambiate: 6, per_area: { fasi: 4 } }, costo_ai_eur: 0.37, piano_volo: { confermata: 4, aperta: 1 },
      commesse: [{ order_id: "o1", codice: "DEMO2-0004", titolo: "Bagno Rossi", modo: "crea", eseguita_il: "2026-10-31T10:00:00Z", voci: 21, punteggio: 74, correzioni: 2 }],
    }));
    avvolgi(<QuantoLavoraSilvio companyId="c" leggi={leggi} />);
    expect(await screen.findByText("Proposte tenute così")).toBeInTheDocument();
    expect(screen.getByText("85 %")).toBeInTheDocument();
    expect(screen.getByText("3 h 10 min")).toBeInTheDocument();
    expect(screen.getByText("stima: 95 voci × 2 min")).toBeInTheDocument();
    expect(screen.getByText("Costo AI").nextSibling).toHaveTextContent(/0,37/);
    expect(screen.getByText(/Dove lo correggi di più: Fasi e tempi \(4\)/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /DEMO2-0004 · Bagno Rossi/ })).toHaveAttribute("href", "/azienda/ordini/o1");
    fireEvent.click(screen.getByRole("button", { name: "Pagina dopo" }));
    await waitFor(() => expect(leggi).toHaveBeenLastCalledWith("c", 2));
  });
});

describe("Il piano di volo sulla commessa", () => {
  it("le azioni spuntate vanno alla conferma; quelle saltate si dicono", async () => {
    const proposta = {
      id: "v1", tipo: "controllo", giorno: "2026-11-11", riassunto: "«Rifacimento tetto» parte il 16/11: una cosa da sistemare.",
      problemi: [{ area: "persone", testo: "Nessuno è assegnato a «Rifacimento tetto»." }, { area: "meteo", testo: "Rifacimento tetto (novembre): freddo." }],
      azioni: [
        { tipo: "assegna_persona", employee_id: "p1", nome: "Mario Bianchi", fase_id: "f1", motivo: "è libero" },
        { tipo: "attivita", titolo: "Manda l'ordine ODA-1 a Tegole Srl", testo: "t", scadenza: null as string | null },
      ],
      fase: [{ name: "Rifacimento tetto" }],
    };
    // Le proposte si leggono dalla RPC che toglie gli importi a chi non può vederli (revisione 1/11, S5).
    const rpc = vi.fn(async (nome: string, _argomenti?: Record<string, unknown>) => (nome === "silvio_volo_della_commessa"
      ? { data: [proposta], error: null }
      : { data: { fatte: [{ indice: 1, tipo: "attivita" }], saltate: [] as unknown[] }, error: null }));
    avvolgi(<PianoDiVoloCommessa orderId="o1" companyId="c" puoModificare db={{ rpc }} />);
    expect(await screen.findByText(/una cosa da guardare/)).toBeInTheDocument();
    expect(screen.getByText(/Nessuno è assegnato/)).toBeInTheDocument();
    expect(screen.getByText(/☂ Rifacimento tetto \(novembre\)/)).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText(/Assegna Mario Bianchi/));
    fireEvent.click(screen.getByRole("button", { name: "Fai questa" }));
    await waitFor(() => expect(rpc).toHaveBeenCalledWith("silvio_volo_conferma", { p_id: "v1", p_indici: [1] }));
  });
});
