import { describe, it, expect, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RipartizioneQuantitaFattura } from "@/components/fatturazione/RipartizioneQuantitaFattura";
import { scenarioRiconciliazione } from "../../../supabase/functions/_shared/riconciliazioneFattureScenari";
import type { AnalisiFatturaAI } from "@/hooks/useRiconciliazioneFatturaAI";
const rpc = vi.hoisted(() => vi.fn());
vi.mock("@/lib/ddt/documentiPersistenti", () => ({ documentiDb: { rpc } }));
function setup(puoModificare = true) {
  const contesto = scenarioRiconciliazione("due-ddt")!;
  const analisi: AnalisiFatturaAI = {
    id: "analisi",
    impronta: "istantanea",
    revisione: 4,
    rivista_il: null,
    created_at: "2026-11-11",
    decisioni: { "1": "accettata" },
    esiti: [],
    proposta: {
      righe: [
        {
          fattura: "1",
          ddt: ["d1-r1", "d2-r1"],
          oda: [],
          affidabilita: "alta",
          motivo: "Articolo confermato",
        },
      ],
      avvisi: [],
    },
  };
  render(
    <QueryClientProvider
      client={
        new QueryClient({
          defaultOptions: {
            queries: { retry: false },
            mutations: { retry: false },
          },
        })
      }
    >
      <RipartizioneQuantitaFattura
        analisi={analisi}
        contesto={contesto}
        impronta="istantanea"
        puoModificare={puoModificare}
      />
    </QueryClientProvider>,
  );
}
beforeEach(() => {
  rpc.mockReset();
  rpc.mockResolvedValue({ data: { righe: 2 }, error: null });
});
describe("ripartizione quantità della fattura", () => {
  it("salva soltanto dopo la conferma e invia la revisione corrente", async () => {
    setup();
    expect(rpc).not.toHaveBeenCalled();
    fireEvent.click(
      screen.getByRole("button", { name: "Ripartisci quantità" }),
    );
    fireEvent.click(
      screen.getByRole("checkbox", { name: /Confermo di avere ripartito/ }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Salva quantità" }));
    await waitFor(() => expect(rpc).toHaveBeenCalledOnce());
    expect(rpc.mock.calls[0]).toEqual([
      "fattura_riconciliazione_imputa",
      expect.objectContaining({
        p_analisi: "analisi",
        p_impronta: "istantanea",
        p_revisione: 4,
        p_completa: true,
        p_righe: [
          expect.objectContaining({ quantita_fattura: 30 }),
          expect.objectContaining({ quantita_fattura: 15 }),
        ],
      }),
    ]);
    expect(rpc.mock.calls.map((c) => c[0])).not.toContain(
      "fattura_verifica_salva",
    );
  });
  it("un errore di quantità resta visibile e non invia ripartizioni incomplete", async () => {
    setup();
    fireEvent.click(
      screen.getByRole("button", { name: "Ripartisci quantità" }),
    );
    fireEvent.change(
      screen.getByRole("textbox", { name: "Quantità fattura 1:d1-r1:" }),
      { target: { value: "errore" } },
    );
    fireEvent.click(screen.getByRole("button", { name: "Salva quantità" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Controlla quantità",
    );
    expect(rpc).not.toHaveBeenCalled();
  });
  it("il conflitto tra colleghi non chiude la finestra come se fosse salvato", async () => {
    rpc.mockResolvedValue({
      data: null,
      error: {
        code: "PT409",
        message: "Un collega ha aggiornato il confronto.",
      },
    });
    setup();
    fireEvent.click(
      screen.getByRole("button", { name: "Ripartisci quantità" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Salva quantità" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      /collega|aggiorn/,
    );
    expect(screen.getByRole("dialog")).toBeVisible();
  });
  it("il ruolo di sola lettura non apre le modifiche", () => {
    setup(false);
    expect(
      screen.getByRole("button", { name: "Ripartisci quantità" }),
    ).toBeDisabled();
    expect(rpc).not.toHaveBeenCalled();
  });
});
