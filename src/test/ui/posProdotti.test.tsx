import { useState } from "react";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  posVuoto,
  lavorazioneVuota,
  type PosContenuto,
} from "../../../supabase/functions/_shared/posModello";
import {
  vuotoProdottoSds,
  type ImpiegoProdottoSds,
  type QuadroProdottiSds,
} from "@/lib/sicurezza/prodottiSds";
import { fotografaProdottoPos } from "@/lib/sicurezza/prodottiPos";
const s = vi.hoisted(() => ({
  q: undefined as QuadroProdottiSds | undefined,
  error: false,
  hook: vi.fn(),
}));
vi.mock("@/hooks/useProdottiSds", () => ({
  useProdottiSds: (...a: unknown[]) => {
    s.hook(...a);
    return {
      data: s.q,
      isError: s.error,
      isLoading: false,
      isFetching: false,
      refetch: vi.fn(),
    };
  },
}));
vi.mock("@/hooks/useFascicoloCantiere", () => ({
  useFasiFascicolo: () => ({
    data: [
      { id: "fase1", name: "Fase uno" },
      { id: "fase2", name: "Fase due" },
    ],
    isLoading: false,
    isError: false,
  }),
}));
import { ProdottiLavorazionePos } from "@/components/sicurezza/pos/ProdottiLavorazionePos";
const prodotto = (id = "p1"): ImpiegoProdottoSds => ({
  ...vuotoProdottoSds("2026-10-01", "fase1"),
  id,
  versione: 2,
  company_id: "azienda",
  order_id: "ordine",
  aggiornato_il: "2026-10-27T10:00:00Z",
  nome: `Prodotto ${id}`,
  produttore: "Fabbricante",
  codice: id,
  impiego: "Sigillatura",
  al: "2026-11-30",
  sds_necessaria: "no",
  motivo_non_necessaria: "Motivo sintetico da riesaminare",
  materiale_snapshot: null,
  evidenza_snapshot: null,
  materiale_corrente: null,
  documento_corrente: null,
  materiale_cambiato: false,
  documento_cambiato: false,
  pertinente: true,
  documento_pertinente: false,
});
function Wrapper({
  iniziale,
  ro = false,
}: {
  iniziale: PosContenuto;
  ro?: boolean;
}) {
  const [p, setP] = useState(iniziale);
  return (
    <>
      <ProdottiLavorazionePos
        companyId="azienda"
        orderId="ordine"
        d={p}
        l={p.lavorazioni[0]}
        n={0}
        ro={ro}
        modifica={(fn) =>
          setP((v) => {
            const c = structuredClone(v);
            fn(c);
            return c;
          })
        }
      />
      <output aria-label="Bozza test">
        {JSON.stringify(p.lavorazioni[0])}
      </output>
    </>
  );
}
const bozza = () => {
  const p = posVuoto();
  p.versione_prodotti = 1;
  p.opera.data_inizio = "2026-10-01";
  p.opera.data_fine = "2026-11-30";
  p.lavorazioni = [
    { ...lavorazioneVuota("l1"), fase_id: "fase1", sostanze: "Nessuna" },
  ];
  return p;
};
beforeEach(() => {
  s.error = false;
  s.hook.mockClear();
  s.q = {
    company_id: "azienda",
    order_id: "ordine",
    data: "2026-10-01",
    fase_id: null,
    materiali: [],
    documenti: [],
    imprese: [],
    impieghi: [
      prodotto(),
      { ...prodotto("altra-impresa"), subappaltatore_id: "sub" },
      { ...prodotto("altra-fase"), fase_id: "fase2" },
    ],
  };
});
afterEach(cleanup);
describe("Prodotti fotografati nella lavorazione POS", () => {
  it("legge su apertura e propone solo prodotti propri della fase e periodo", () => {
    render(<Wrapper iniziale={bozza()} />);
    expect(s.hook.mock.calls.at(-1)?.[1]).toBe(false);
    fireEvent.click(
      screen.getByRole("button", {
        name: "Scegli dall’inventario di commessa",
      }),
    );
    expect(s.hook.mock.calls.at(-1)?.[1]).toBe(true);
    expect(
      within(screen.getByLabelText("Prodotto da collegare alla lavorazione 1"))
        .getAllByRole("option")
        .map((o) => o.getAttribute("value")),
    ).toEqual(["", "p1"]);
  });
  it("collega una fotografia non confermata e richiede due riesami espliciti", () => {
    render(<Wrapper iniziale={bozza()} />);
    fireEvent.click(
      screen.getByRole("button", {
        name: "Scegli dall’inventario di commessa",
      }),
    );
    fireEvent.change(
      screen.getByLabelText("Prodotto da collegare alla lavorazione 1"),
      { target: { value: "p1" } },
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Collega prodotto da riesaminare" }),
    );
    const c = screen.getByLabelText(/Ho riesaminato questo prodotto/);
    expect(c).not.toBeChecked();
    fireEvent.click(c);
    fireEvent.click(screen.getByLabelText(/Ho verificato l’elenco/));
    expect(
      JSON.parse(screen.getByLabelText("Bozza test").textContent!),
    ).toMatchObject({
      prodotti_riesaminati: true,
      prodotti: [{ impiego_id: "p1", versione: 2, verificato: true }],
    });
  });
  it("cambiare fase revoca la conferma dei riferimenti conservati", () => {
    const p = bozza();
    p.lavorazioni[0].prodotti = [
      { ...fotografaProdottoPos(prodotto()), verificato: true },
    ];
    p.lavorazioni[0].prodotti_riesaminati = true;
    render(<Wrapper iniziale={p} />);
    fireEvent.change(screen.getByLabelText("Fase della lavorazione 1"), {
      target: { value: "fase2" },
    });
    expect(
      screen.getByLabelText(/Ho riesaminato questo prodotto/),
    ).not.toBeChecked();
    expect(screen.getByLabelText(/Ho verificato l’elenco/)).not.toBeChecked();
    expect(screen.getByText(/fase dell’impiego diversa/)).toBeTruthy();
  });
  it("un aggiornamento della fonte non sovrascrive la fotografia senza richiesta", async () => {
    const p = bozza();
    p.lavorazioni[0].prodotti = [
      { ...fotografaProdottoPos(prodotto()), verificato: true },
    ];
    const r = render(<Wrapper iniziale={p} />);
    s.q!.impieghi[0] = { ...prodotto(), versione: 3, nome: "Prodotto riletto" };
    r.rerender(<Wrapper iniziale={p} />);
    expect(screen.getByText(/La fonte è cambiata/)).toBeTruthy();
    expect(screen.getByLabelText("Bozza test")).toHaveTextContent(
      '"versione":2',
    );
    fireEvent.click(
      screen.getByRole("button", {
        name: "Proponi versione aggiornata del prodotto",
      }),
    );
    await waitFor(() =>
      expect(screen.getByLabelText("Bozza test")).toHaveTextContent(
        '"versione":3',
      ),
    );
    expect(
      screen.getByLabelText(/Ho riesaminato questo prodotto/),
    ).not.toBeChecked();
  });
  it("errore e sola lettura non eliminano la fotografia approvata", () => {
    const p = bozza();
    p.lavorazioni[0].prodotti = [
      { ...fotografaProdottoPos(prodotto()), verificato: true },
    ];
    s.error = true;
    render(<Wrapper iniziale={p} ro />);
    expect(
      screen.queryByRole("button", {
        name: "Scegli dall’inventario di commessa",
      }),
    ).toBeNull();
    expect(screen.queryByRole("button", { name: "Togli prodotto" })).toBeNull();
    expect(
      screen.getByLabelText(/Ho riesaminato questo prodotto/),
    ).toBeDisabled();
    expect(screen.getByLabelText("Bozza test")).toHaveTextContent(
      '"versione":2',
    );
  });
});
