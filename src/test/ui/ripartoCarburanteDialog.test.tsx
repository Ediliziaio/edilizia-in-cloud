import { QueryClient, QueryClientProvider, useQuery } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import RipartoCarburanteDialog from "@/components/mezzi/RipartoCarburanteDialog";
import { formatCurrency } from "@/lib/formatters";
import type { Viaggio } from "@/lib/mezzi/viaggi";

const leggiViaggi = vi.fn<() => Promise<Viaggio[]>>();

vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ user: { id: "operatore" } }) }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));
vi.mock("@/hooks/useMezziViaggi", () => ({
  useViaggiRipartoCarburante: (_azienda: string, _mezzo: string, richiesta: object | null) =>
    useQuery({ queryKey: ["viaggi", richiesta], enabled: !!richiesta, queryFn: leggiViaggi }),
}));

function calcola(importo: string, quota = 150) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <RipartoCarburanteDialog companyId="azienda" mezzoId="mezzo" numero="F-12"
        dataFattura="2026-11-22" quota={quota} onClose={vi.fn()} onFattura={vi.fn()} />
    </QueryClientProvider>,
  );
  fireEvent.change(screen.getByLabelText("Solo carburante netto (€)"), { target: { value: importo } });
  fireEvent.click(screen.getByRole("button", { name: "Calcola quote" }));
}

const viaggio: Viaggio = {
  id: "v1", stato: "verificato", company_id: "azienda", mezzo_id: "mezzo", mezzo_nome: "Furgone",
  versione: 1, conducente: null, partenza: "2026-11-20T08:00:00+01:00", arrivo: "2026-11-20T08:20:00+01:00",
  contatore_inizio: null, contatore_fine: null, note: "", updated_at: "2026-11-20T08:30:00+01:00",
  tratte: [{ id: "t1", da: "Magazzino", a: "Officina", destinazione: "generale", order_id: null, fonte: "dichiarati", km: 8, minuti: null }],
};

beforeEach(() => leggiViaggi.mockReset());
afterEach(cleanup);

describe("Riparto carburante in fattura", () => {
  it.each([[120, "120,00"], [-120, "-120,00"]] as const)(
    "mostra %s euro da attribuire quando mancano km verificati",
    async (euro, importo) => {
      leggiViaggi.mockResolvedValue([]);
      calcola(importo, Math.sign(euro) * 150);
      expect(await screen.findByText(/da attribuire\. Il mezzo/)).toHaveTextContent(formatCurrency(euro).replace(/\s/g, " "));
      expect(screen.queryByRole("button", { name: "Copia proposta" })).not.toBeInTheDocument();
    },
  );

  it("dopo un errore di aggiornamento nasconde le quote precedenti e permette un nuovo calcolo", async () => {
    leggiViaggi.mockResolvedValueOnce([viaggio]).mockRejectedValueOnce(new Error("Viaggi non disponibili"))
      .mockResolvedValueOnce([viaggio]);
    calcola("120,00");
    expect(await screen.findByRole("button", { name: "Copia proposta" })).toBeEnabled();
    fireEvent.click(screen.getByRole("button", { name: "Calcola quote" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Viaggi non disponibili");
    expect(screen.queryByRole("button", { name: "Copia proposta" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Calcola quote" }));
    expect(await screen.findByRole("button", { name: "Copia proposta" })).toBeEnabled();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(leggiViaggi).toHaveBeenCalledTimes(3);
  });
});
