import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { RevisioneRiconciliazioneAI } from "@/components/fatturazione/RevisioneRiconciliazioneAI";
const analisi = {
  id: "a",
  revisione: 0,
  decisioni: {},
  rivista_il: null,
  proposta: {
    righe: [
      {
        fattura: "1",
        ddt: ["d1"],
        oda: [],
        affidabilita: "alta",
        motivo: "Stesso adesivo bianco A81 25kg",
      },
    ],
    avvisi: [],
  },
  esiti: [
    {
      stato: "da_controllare",
      motivo: "Prezzo da confermare",
      deltaImporto: null,
    },
  ],
};
const righe = [
  {
    id: "1",
    descrizione: "Adesivo A81",
    codice: null,
    um: "pz",
    quantita: 4,
    prezzo: null,
    importo: null,
  },
];
const setup = (
  props: Record<string, unknown> = {},
  aiProps: Record<string, unknown> = {},
) => {
  const mutate = vi.fn(),
    onRiga = vi.fn(),
    onApertura = vi.fn();
  const ai = {
    dati: { data: { analisi }, refetch: vi.fn() },
    analizza: { reset: vi.fn() },
    salva: { mutate, reset: vi.fn(), isPending: false },
    ...aiProps,
  };
  render(
    <RevisioneRiconciliazioneAI
      {...({
        ai,
        righe,
        documenti: [],
        puoModificare: true,
        onRiga,
        onApertura,
        aperta: true,
        ...props,
      } as unknown as Parameters<typeof RevisioneRiconciliazioneAI>[0])}
    />,
  );
  return { mutate, onRiga, onApertura };
};
describe("revisione AI compatta e conferma umana", () => {
  it("mostra solo il riepilogo prima di aprire la revisione", () => {
    setup({ aperta: false });
    expect(
      screen.getByRole("button", { name: "Rivedi abbinamenti" }),
    ).toBeVisible();
    expect(
      screen.queryByText("Stesso adesivo bianco A81 25kg"),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Salva revisione" }),
    ).not.toBeInTheDocument();
  });
  it("richiede una scelta esplicita e salva la versione della revisione", () => {
    const { mutate } = setup();
    expect(
      screen.getByRole("button", { name: "Salva revisione" }),
    ).toBeDisabled();
    fireEvent.click(
      screen.getByRole("button", { name: "Accetta abbinamento F1" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Salva revisione" }));
    expect(mutate).toHaveBeenCalledWith({
      analisi,
      decisioni: { "1": "accettata" },
    });
    expect(
      screen.getByText(/non cambia la verifica della fattura/),
    ).toBeVisible();
  });
  it("permette il rifiuto e apre il confronto sulla riga corrispondente", () => {
    const { mutate, onRiga, onApertura } = setup();
    fireEvent.click(
      screen.getByRole("button", { name: "Vedi confronto voce F1" }),
    );
    expect(onRiga).toHaveBeenCalledWith(0);
    expect(onApertura).toHaveBeenCalledWith(false);
    fireEvent.click(
      screen.getByRole("button", { name: "Rifiuta abbinamento F1" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Salva revisione" }));
    expect(mutate.mock.calls[0][0].decisioni).toEqual({ "1": "rifiutata" });
  });
  it("nasconde spiegazioni e dettagli fino alla richiesta dell’utente", () => {
    setup();
    expect(screen.queryByText(/Stesso adesivo bianco/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Dettagli voce F1" }));
    expect(screen.getByText(/Stesso adesivo bianco/)).toBeVisible();
    expect(screen.getByText("Prezzo da confermare")).toBeVisible();
  });
  it("rispetta la sola lettura", () => {
    setup({ puoModificare: false });
    expect(
      screen.getByRole("button", { name: "Accetta abbinamento F1" }),
    ).toBeDisabled();
  });
  it("mostra un errore di salvataggio senza fingere un successo", () => {
    setup(
      {},
      {
        salva: {
          error: { message: "Un collega ha aggiornato la revisione" },
          isPending: false,
        },
      },
    );
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Un collega ha aggiornato",
    );
  });
  it("accetta in gruppo solo le corrispondenze numericamente coerenti", () => {
    const a = {
      ...analisi,
      esiti: [
        {
          stato: "coerente",
          motivo: "Quantità e prezzi corrispondenti",
          deltaImporto: 0,
        },
      ],
    };
    const { mutate } = setup({}, { dati: { data: { analisi: a } } });
    fireEvent.click(
      screen.getByRole("button", { name: "Accetta coerenti (1)" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Salva revisione" }));
    expect(mutate.mock.calls[0][0].decisioni).toEqual({ "1": "accettata" });
  });
  it("non perde le scelte non salvate chiudendo la revisione per vedere il confronto", () => {
    function Prova() {
      const [aperta, setAperta] = useState(true);
      const props = {
        ai: {
          dati: { data: { analisi } },
          analizza: {},
          salva: { isPending: false },
        },
        righe,
        documenti: [],
        puoModificare: true,
        onRiga: vi.fn(),
        aperta,
        onApertura: setAperta,
      } as unknown as Parameters<typeof RevisioneRiconciliazioneAI>[0];
      return <RevisioneRiconciliazioneAI {...props} />;
    }
    render(<Prova />);
    fireEvent.click(
      screen.getByRole("button", { name: "Rifiuta abbinamento F1" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Torna al confronto" }));
    fireEvent.click(screen.getByRole("button", { name: "Rivedi e salva" }));
    expect(
      screen.getByRole("button", { name: "Rifiuta abbinamento F1" }),
    ).toHaveAttribute("aria-pressed", "true");
  });
  it("ripristina le scelte registrate quando si riapre", () => {
    setup(
      {},
      {
        dati: {
          data: {
            analisi: {
              ...analisi,
              revisione: 1,
              decisioni: { "1": "accettata" },
              rivista_il: "2026-11-11T12:00:00Z",
            },
          },
        },
      },
    );
    expect(
      screen.getByRole("button", { name: "Accetta abbinamento F1" }),
    ).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("status")).toHaveTextContent("Revisione salvata");
  });
});
