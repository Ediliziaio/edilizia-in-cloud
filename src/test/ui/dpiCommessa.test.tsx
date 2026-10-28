import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  posVuoto,
  lavorazioneVuota,
} from "../../../supabase/functions/_shared/posModello";
import type { PosRiga } from "@/hooks/usePos";
import type { QuadroDpi } from "@/lib/sicurezza/dpiCommessa";
vi.mock('@/hooks/usePermissions',()=>({usePermissions:()=>({canViewSicurezzaCantiere:true,solaLettura:false})}));
const s = vi.hoisted(() => ({
  loading: false,
  error: false,
  quadro: undefined as QuadroDpi | undefined,
  refetch: vi.fn(),
  hook: vi.fn(),
}));
vi.mock("@/hooks/useDpiCommessa", () => ({
  useDpiCommessa: (...args: unknown[]) => {
    s.hook(...args);
    return {
      data: s.quadro,
      isLoading: s.loading,
      isError: s.error,
      isFetching: false,
      refetch: s.refetch,
    };
  },
}));
import { DpiCommessa } from "@/components/sicurezza/DpiCommessa";
afterEach(cleanup);
beforeEach(() => {
  s.loading = false;
  s.error = false;
  s.quadro = {
    data: "2026-10-27",
    fase_id: "fase",
    campo_senza_dipendente: 0,
    addetti: [],
  };
  s.refetch.mockClear();
  s.hook.mockClear();
});
const renderizza = (pos: PosRiga[] = [], extra = {}) =>
  render(
    <DpiCommessa
      companyId="azienda"
      orderId="ordine"
      dataRiferimento="2026-10-27"
      faseRiferimento="fase"
      pos={pos}
      {...extra}
    />,
  );
describe("DPI nella sicurezza della commessa", () => {
  it("propaga contesto e distingue vuoto, caricamento ed errore senza esito positivo", () => {
    s.loading = true;
    const r = renderizza();
    expect(screen.getByRole("status")).toHaveTextContent("Caricamento");
    expect(s.hook).toHaveBeenCalledWith(
      "azienda",
      "ordine",
      "2026-10-27",
      "fase",
      true,
    );
    s.loading = false;
    s.error = true;
    r.rerender(
      <DpiCommessa
        companyId="azienda"
        orderId="ordine"
        dataRiferimento="2026-10-27"
        pos={[]}
      />,
    );
    expect(screen.getByRole("alert")).toHaveTextContent(
      "quadro non è completo",
    );
    expect(screen.queryByText(/0 addetti collegati/)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Aggiorna consegne" }));
    expect(s.refetch).toHaveBeenCalledOnce();
  });
  it("un errore del contesto non allarga la consultazione a tutte le fasi", () => {
    renderizza([], { contestoNonDisponibile: true });
    expect(s.hook).toHaveBeenCalledWith(
      "azienda",
      "ordine",
      "2026-10-27",
      "fase",
      false,
    );
    expect(screen.getByRole("alert")).toHaveTextContent("attendi il contesto");
    expect(
      screen.getByRole("button", { name: "Aggiorna consegne" }),
    ).toBeDisabled();
    expect(screen.queryByText("0 addetti collegati")).toBeNull();
  });
  it("non dichiara completezza con zero assegnati e segnala identità non collegate", () => {
    s.quadro!.campo_senza_dipendente = 2;
    renderizza();
    expect(screen.getByText(/non attesta l’assenza/)).toBeTruthy();
    expect(screen.getByRole("alert")).toHaveTextContent("2 addetti Campo");
  });
  it("mostra date e criticità per addetto, il modulo non diventa una firma", () => {
    s.quadro!.addetti = [
      {
        id: "operaio",
        nome: "Mario",
        cognome: "Rossi",
        qualifica: "Posatore",
        attivo: true,
        assegnazioni: [
          { fonte: "commessa", dal: null, al: null, fase_id: null },
        ],
        consegne: [
          {
            id: "dpi",
            tipo: "imbragatura",
            marca: "Marca",
            matricola: "123",
            consegnato_il: "2026-10-01",
            scade_il: "2026-10-26",
            restituito_il: null,
            stato: "in_use",
            modulo_registrato: true,
          },
        ],
      },
    ];
    renderizza();
    fireEvent.click(screen.getByText(/Mario Rossi/));
    expect(screen.getByText("Scaduto")).toBeTruthy();
    expect(
      screen.getByText("Riferimento registrato, da verificare"),
    ).toBeTruthy();
    expect(screen.getByText(/senza periodo: conferma/)).toBeTruthy();
    expect(screen.queryByText("Conforme")).toBeNull();
  });
  it("consulta una versione POS esplicita senza dedurre automaticamente i tipi DPI", () => {
    const contenuto = posVuoto();
    contenuto.lavorazioni = [
      {
        ...lavorazioneVuota("l1"),
        titolo: "Demolizioni",
        dpi: "DPI tecnici da verificare",
      },
    ];
    const altro = posVuoto();
    altro.lavorazioni = [
      {
        ...lavorazioneVuota("l2"),
        titolo: "Finiture",
        dpi: "Guanti previsti nel testo",
      },
    ];
    renderizza([
      {
        id: "p1",
        contenuto,
        status: "bozza",
        revisione: 0,
        created_at: "2026-10-27",
      } as PosRiga,
      {
        id: "p2",
        contenuto: altro,
        status: "approvato",
        revisione: 1,
        created_at: "2026-10-20",
      } as PosRiga,
    ]);
    fireEvent.click(screen.getByText("DPI indicati nelle lavorazioni dei POS"));
    expect(screen.getByText("DPI tecnici da verificare")).toBeTruthy();
    fireEvent.change(screen.getByLabelText("POS da consultare"), {
      target: { value: "p2" },
    });
    expect(screen.getByText("Guanti previsti nel testo")).toBeTruthy();
    expect(screen.queryByText("DPI tecnici da verificare")).toBeNull();
  });
});
