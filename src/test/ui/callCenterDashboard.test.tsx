import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import CallCenterDashboard from "@/pages/azienda/CallCenterDashboard";

const stato = vi.hoisted(() => ({
  coda: { conteggi: {}, righe: [] } as unknown,
  admin: false,
  operatori: [] as { operatore_id: string; nome: string }[],
}));

const numeriVuoti = {
  chiamate: 0, contatti_chiamati: 0, contatti_raggiunti: 0, giorni_attivi: 0, appuntamenti_fissati: 0,
  appuntamenti_annullati: 0, svolti_totale: 0, svolti_presentati: 0, svolti_assenti: 0, lead_assegnati: 0,
  lead_chiamati: 0, lead_con_appuntamento: 0, mediana_minuti: null as number | null, entro_5_min: 0,
};

vi.mock("@/hooks/useCallCenterDashboard", () => ({
  useOperatoriCallCenter: () => ({ data: stato.operatori }),
  useCodaCallCenter: () => ({ data: stato.coda }),
  useNumeriCallCenter: () => ({ data: numeriVuoti }),
  useAppuntamentiCallCenter: () => ({ data: [] as unknown[] }),
}));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ user: { id: "u1" } }) }));
vi.mock("@/hooks/useEffectiveCompanyId", () => ({ useEffectiveCompanyId: () => "c1" }));
vi.mock("@/hooks/usePermissions", () => ({ usePermissions: () => ({ isAdmin: stato.admin }) }));
vi.mock("@/components/dashboard/DashboardSelectorBar", () => ({ DashboardSelectorBar: (): null => null }));
vi.mock("@/components/appointments/AppointmentDialog", () => ({ AppointmentDialog: (): null => null }));

const mostra = () =>
  render(
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter>
        <CallCenterDashboard />
      </MemoryRouter>
    </QueryClientProvider>,
  );

describe("Dashboard Call Center", () => {
  beforeEach(() => {
    stato.coda = { conteggi: {}, righe: [] };
    stato.admin = false;
    stato.operatori = [];
  });

  it("senza chiamate lo dice, e non scrive 0%", () => {
    mostra();
    expect(screen.getByText("Nessuna chiamata registrata in questo periodo.")).toBeTruthy();
    expect(screen.getByText(/Nessun contatto da chiamare/)).toBeTruthy();
    expect(screen.queryByText("0%")).toBeNull();
  });

  it("mostra chi chiamare, con il numero da comporre", () => {
    stato.coda = {
      conteggi: { nuovo: 120 },
      righe: [{
        contact_id: "k1", nome: "Lead Di Prova", azienda: null, telefono: "+39 333 000 0000", fonte: null, fase: null,
        arrivato_il: "2026-11-03T10:00:00Z", operatore_id: "u1", categoria: "nuovo", tentativi: 0,
        ultima_chiamata_at: null, ultimo_esito: null, richiamo_il: null, opportunita_id: null,
      }],
    };
    mostra();
    expect(screen.getByRole("link", { name: "Lead Di Prova" }).getAttribute("href")).toBe("/azienda/marketing/contatti/k1");
    expect(screen.getByRole("link", { name: "Chiama Lead Di Prova" }).getAttribute("href")).toBe("tel:+393330000000");
    expect(screen.getByText("Mostrati i primi 1 su 120.")).toBeTruthy();
  });

  it("l'operatore da solo non ha il selettore dei colleghi", () => {
    mostra();
    expect(screen.queryByRole("combobox", { name: "Operatore" })).toBeNull();
  });

  it("l'amministratore può scegliere l'operatore", () => {
    stato.admin = true;
    mostra();
    expect(screen.getByRole("combobox", { name: "Operatore" })).toBeTruthy();
  });
});
