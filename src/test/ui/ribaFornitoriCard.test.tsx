import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RibaFornitoriCard } from "@/components/tesoreria/RibaFornitoriCard";
import type { RibaFornitore } from "@/lib/costi/ribaFornitori";

const avvisi = vi.hoisted(() => ({ ok: [] as string[], errori: [] as string[] }));
vi.mock("sonner", () => ({
  toast: {
    success: (m: string) => avvisi.ok.push(m),
    error: (m: string) => avvisi.errori.push(m),
  },
}));

// Le RiBa di renova del 29/10/2026, come le restituisce v_riba_fornitori.
const RIGHE: RibaFornitore[] = [
  { rata_id: "r1", cost_id: "c1", fornitore: "Centrufficio S.p.A.", order_code: null, numero_fattura: "26VIT11181",
    numero_rata: 1, rate_riba_della_fattura: 4, scadenza: "2026-10-31", importo: 939.7, stato: "in_arrivo", giorni: 2 },
  { rata_id: "r2", cost_id: "c1", fornitore: "Centrufficio S.p.A.", order_code: null, numero_fattura: "26VIT11181",
    numero_rata: 2, rate_riba_della_fattura: 4, scadenza: "2026-11-30", importo: 939.7, stato: "futura", giorni: 32 },
  { rata_id: "r3", cost_id: "c2", fornitore: "AFG TRASPORTI S.R.L.", order_code: null, numero_fattura: "001000482026",
    numero_rata: 1, rate_riba_della_fattura: 1, scadenza: "2026-05-31", importo: 366, stato: "passata", giorni: -151 },
];

let risposta: unknown[] = RIGHE;
// Che cosa il riquadro ha chiesto di scrivere, e quante righe «risponde» il db.
const scritture: { tabella: string; valori: unknown; id: unknown }[] = [];
let righeAggiornate = 1;
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (tabella: string) => {
      const lettura = {
        select: () => lettura, eq: () => lettura, neq: () => lettura, order: () => lettura,
        limit: () => Promise.resolve({ data: risposta, error: null }),
      };
      return {
        ...lettura,
        update: (valori: unknown) => ({
          eq: (_c: string, id: unknown) => ({
            select: () => {
              scritture.push({ tabella, valori, id });
              return Promise.resolve({
                data: Array.from({ length: righeAggiornate }, () => ({ id })), error: null,
              });
            },
          }),
        }),
      };
    },
  },
}));

// Import statico (vi.mock sopra è sollevato in cima dal compilatore): caricato
// dentro il test, sotto carico il primo render superava i 5 secondi.
async function disegna(liquidita: number | null) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <RibaFornitoriCard companyId="renova" liquidita={liquidita} />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("Riquadro RiBa ai fornitori in Tesoreria", () => {
  it("mostra la RiBa di dopodomani per prima, con la rata della fattura", async () => {
    risposta = RIGHE;
    await disegna(5000);
    expect(await screen.findByText("RiBa ai fornitori")).toBeTruthy();
    expect(screen.getByText("Tra 2 giorni")).toBeTruthy();
    expect(screen.getAllByText(/RiBa 1 di 4/).length).toBeGreaterThan(0);
    expect(screen.getByText("Il saldo attuale le copre.")).toBeTruthy();
  });

  it("una RiBa passata e non registrata non è «pagata»: va verificata", async () => {
    risposta = RIGHE;
    await disegna(5000);
    expect(await screen.findByText("Passata: addebitata?")).toBeTruthy();
    expect(screen.getByText(/Addebitate o insolute\?/)).toBeTruthy();
  });

  it("senza conto collegato non dice «coperte»: dice che non si sa", async () => {
    risposta = RIGHE;
    await disegna(null);
    expect(await screen.findByText(/Nessun conto collegato/)).toBeTruthy();
    expect(screen.queryByText("Il saldo attuale le copre.")).toBeNull();
  });

  it("dice quanto manca quando il saldo non basta", async () => {
    risposta = RIGHE;
    await disegna(500);
    expect(await screen.findByText(/rischio insoluto/)).toBeTruthy();
  });

  it("porta ai costi già filtrati sulle RiBa", async () => {
    risposta = RIGHE;
    await disegna(5000);
    const link = await screen.findByText("Vedi nei costi");
    expect(link.closest("a")?.getAttribute("href")).toBe("/azienda/costi?tab=spese&preset=riba");
  });

  it("dal menu di una RiBa si registra lo stato, sulla rata giusta", async () => {
    risposta = RIGHE;
    scritture.length = 0;
    righeAggiornate = 1;
    await disegna(5000);
    const bottoni = await screen.findAllByRole("button", { name: /Cambia lo stato della RiBa di Centrufficio/ });
    // Radix apre il menu sul pointerdown, come fanno le altre prove del progetto
    fireEvent.pointerDown(bottoni[0], { button: 0, ctrlKey: false, pointerType: "mouse" });
    fireEvent.click(await screen.findByText("La banca l'ha avvisata"));
    await vi.waitFor(() => expect(scritture).toHaveLength(1));
    expect(scritture[0]).toEqual({ tabella: "rate_fornitori", valori: { stato: "avvisata" }, id: "r1" });
  });

  it("senza permesso il database aggiorna zero righe in silenzio: la pagina lo dice", async () => {
    risposta = RIGHE;
    scritture.length = 0;
    avvisi.ok.length = 0;
    avvisi.errori.length = 0;
    righeAggiornate = 0;
    await disegna(5000);
    const bottoni = await screen.findAllByRole("button", { name: /Cambia lo stato della RiBa di Centrufficio/ });
    fireEvent.pointerDown(bottoni[0], { button: 0, ctrlKey: false, pointerType: "mouse" });
    fireEvent.click(await screen.findByText("Addebitata (pagata)"));
    await vi.waitFor(() => expect(avvisi.errori).toHaveLength(1));
    expect(avvisi.errori[0]).toMatch(/permesso/);
    expect(avvisi.ok).toHaveLength(0);
    righeAggiornate = 1;
  });
});
