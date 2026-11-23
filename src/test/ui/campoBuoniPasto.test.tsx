import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, expect, it, vi } from "vitest";
import CampoBuoniPasto from "@/pages/campo/CampoBuoniPasto";

const stato = vi.hoisted(() => ({
  regole: null as Record<string, unknown> | null,
  profiloId: "p1" as string | null,
  scheda: { buono_pasto_abilitato: true } as Record<string, unknown> | null,
  buoni: [] as Record<string, unknown>[],
}));

function catena(tabella: string) {
  const q: Record<string, unknown> = {};
  for (const m of ["select", "eq", "gte", "order", "limit"]) q[m] = () => q;
  const dati = () => tabella === "hr_impostazioni_benefit" ? stato.regole : tabella === "hr_profili" ? stato.scheda : stato.buoni;
  q.maybeSingle = () => Promise.resolve({ data: dati(), error: null });
  q.then = (ok: (v: unknown) => unknown) => Promise.resolve({ data: dati(), error: null }).then(ok);
  return q;
}
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { from: (t: string) => catena(t), rpc: () => Promise.resolve({ data: stato.profiloId, error: null }) },
}));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ user: { id: "u1" }, profile: { company_id: "c1" } }) }));

const disegna = () => render(
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><CampoBuoniPasto /></QueryClientProvider>,
);
const oggi = new Date().toISOString().slice(0, 10);
const attive = { buono_pasto_attivo: true, buono_pasto_modalita: "fisso", buono_pasto_valore: 8, buono_pasto_soglia_ore: 6 };

beforeEach(() => { stato.regole = null; stato.profiloId = "p1"; stato.scheda = { buono_pasto_abilitato: true }; stato.buoni = []; });

it("se l'azienda non li usa lo dice, invece di mostrare zero", async () => {
  disegna();
  expect(await screen.findByText("La tua azienda non gestisce i buoni pasto dall'app.")).toBeInTheDocument();
});

it("se la persona non è abilitata la manda dall'ufficio", async () => {
  stato.regole = attive; stato.scheda = { buono_pasto_abilitato: false };
  disegna();
  expect(await screen.findByText(/Non hai i buoni pasto attivi/)).toBeInTheDocument();
});

it("mostra la regola, i conti del mese e i giorni", async () => {
  stato.regole = attive;
  stato.buoni = [
    { id: "a", giorno: oggi, tipo: "fisso", importo: 8, stato: "erogato" },
    { id: "b", giorno: oggi, tipo: "fisso", importo: 8, stato: "maturato" },
    { id: "c", giorno: oggi, tipo: "fisso", importo: 8, stato: "annullato" },
  ];
  disegna();
  expect(await screen.findByText("Maturi un buono ogni giorno in cui lavori almeno 6 ore.")).toBeInTheDocument();
  expect(screen.getByText("buoni").previousSibling).toHaveTextContent("2");
  expect(screen.getByText("già ricevuti").previousSibling).toHaveTextContent("1");
  expect(screen.getByText("totale").previousSibling).toHaveTextContent("16,00");
  expect(screen.getByText("Ricevuto")).toBeInTheDocument();
  expect(screen.getByText("Annullato")).toBeInTheDocument();
});
