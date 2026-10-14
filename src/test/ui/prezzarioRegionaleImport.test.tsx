import { webcrypto } from "node:crypto";
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import {
  SelettorePrezzario,
  type SelezionePrezzario,
} from "@/components/prezzario/SelettorePrezzario";
import { ImportaPrezzarioRegionaleDialog } from "@/pages/azienda/settings/SettingsTariffe/ImportaPrezzarioRegionaleDialog";
import type { PrezzarioVoce, PrezzarioCapitolo } from "@/lib/prezzario/tipi";

const stato = vi.hoisted(() => ({
  voci: [] as PrezzarioVoce[],
  filtri: [] as Record<string, unknown>[],
  errore: false,
  upsert: vi.fn(),
  success: vi.fn(),
  error: vi.fn(),
  refetch: vi.fn(),
}));
const capitoli: PrezzarioCapitolo[] = [
  {
    id: "A",
    fonte_id: "fonte",
    codice: "A",
    titolo: "Opere edili",
    parent_id: null,
    ordine: 0,
    livello: 0,
  },
  {
    id: "B",
    fonte_id: "fonte",
    codice: "B",
    titolo: "Demolizioni",
    parent_id: null,
    ordine: 1,
    livello: 0,
  },
];
vi.mock("@/lib/prezzario/queries", () => ({
  PREZZARIO_PAGE_SIZE: 100,
  usePrezzarioFonti: () => ({
    data: [
      {
        id: "fonte",
        regione: "Molise",
        anno: 2026,
        nome: "Prezziario Molise 2026",
      },
    ],
    isLoading: false,
    isError: false,
  }),
  usePrezzarioCapitoli: () => ({
    data: capitoli,
    isLoading: false,
    isError: false,
    refetch: stato.refetch,
  }),
  usePrezzarioVociPagina: (f: {
    search: string;
    capitoliIds?: string[];
    pagina: number;
  }) => {
    stato.filtri.push(f);
    const righe = stato.voci.filter(
      (v) =>
        (!f.capitoliIds || f.capitoliIds.includes(v.capitolo_id!)) &&
        (!f.search || `${v.codice} ${v.descrizione}`.includes(f.search)),
    );
    return {
      data: {
        voci: righe.slice(f.pagina * 100, (f.pagina + 1) * 100),
        totale: righe.length,
      },
      isError: stato.errore,
      isLoading: false,
      isFetching: false,
      refetch: stato.refetch,
    };
  },
}));
vi.mock("sonner", () => ({
  toast: { success: stato.success, error: stato.error },
}));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: () => ({
      upsert: (rows: unknown[], options: unknown) => ({
        select: () => stato.upsert(rows, options),
      }),
    }),
  },
}));
function voce(i: number, extra: Partial<PrezzarioVoce> = {}): PrezzarioVoce {
  return {
    id: `v${i}`,
    fonte_id: "fonte",
    capitolo_id: i < 100 ? "A" : "B",
    codice: `COD-${i}`,
    descrizione: `Lavorazione ${i}`,
    unita_misura: "mq",
    prezzo: 100,
    incidenza_manodopera_pct: null,
    incidenza_sicurezza_pct: null,
    note: null,
    ordine: i,
    ...extra,
  };
}
function Browser() {
  const [selezione, setSelezione] = useState<SelezionePrezzario>({});
  return (
    <SelettorePrezzario
      fonteId="fonte"
      onFonte={vi.fn()}
      capitoli={capitoli}
      onRiprovaCapitoli={stato.refetch}
      selezione={selezione}
      onSelezione={setSelezione}
    />
  );
}
function apri() {
  const onImported = vi.fn();
  const onOpenChange = vi.fn();
  render(
    <ImportaPrezzarioRegionaleDialog
      open
      onOpenChange={onOpenChange}
      companyId="azienda"
      isAdmin
      onImported={onImported}
    />,
  );
  fireEvent.change(screen.getByRole("combobox", { name: "Regione e anno" }), {
    target: { value: "fonte" },
  });
  return { onImported, onOpenChange };
}
beforeEach(() => {
  vi.stubGlobal("crypto", webcrypto);
  stato.voci = Array.from({ length: 101 }, (_, i) => voce(i));
  stato.filtri = [];
  stato.errore = false;
  stato.upsert
    .mockReset()
    .mockImplementation(async (rows: { id: string }[]) => ({
      data: rows.map((r) => ({ id: r.id })),
      error: null,
    }));
  stato.success.mockClear();
  stato.error.mockClear();
  stato.refetch.mockClear();
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
describe("Importazione regionale: selezione e categorie", () => {
  it("completa una voce della prima pagina dalla selezione e torna alla seconda pagina del catalogo", () => {
    stato.voci[0] = voce(0, { unita_misura: null });
    render(<Browser />);
    fireEvent.click(screen.getByRole("checkbox", { name: "Seleziona COD-0" }));
    fireEvent.click(screen.getByRole("button", { name: "Pagina successiva" }));
    fireEvent.click(screen.getByRole("button", { name: "Completa le selezionate" }));
    expect(screen.getByRole("list", { name: "Voci selezionate" })).toBeInTheDocument();
    fireEvent.change(screen.getByRole("combobox", { name: "Unità per COD-0" }), { target: { value: "h" } });
    expect(screen.queryByText("voce selezionata da completare", { exact: false })).toBeNull();
    // L'unità integrata resta correggibile senza falsificare il dato originale.
    fireEvent.change(screen.getByRole("combobox", { name: "Unità per COD-0" }), { target: { value: "mq" } });
    expect(screen.getByRole("combobox", { name: "Unità per COD-0" })).toHaveValue("mq");
    expect(screen.getByText("Unità del prezziario: non indicata")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Torna al catalogo" }));
    expect(screen.getByText("101–101 di 101")).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: "Seleziona COD-100" })).toBeInTheDocument();
  });
  it("torna alla prima pagina della selezione quando si toglie l'unica voce della seconda", () => {
    render(<Browser />);
    fireEvent.click(screen.getByRole("button", { name: "Seleziona questa pagina" }));
    fireEvent.click(screen.getByRole("button", { name: "Pagina successiva" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "Seleziona COD-100" }));
    fireEvent.click(screen.getByRole("button", { name: "Mostra voci selezionate" }));
    fireEvent.click(screen.getByRole("button", { name: "Pagina successiva" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "Seleziona COD-100" }));
    expect(screen.getByText("1–100 di 100")).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: "Seleziona COD-0" })).toBeChecked();
  });
  it("mostra il totale reale, distingue la pagina e mantiene la selezione cambiando pagina", () => {
    render(<Browser />);
    expect(screen.getByText("101 voci trovate")).toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("button", { name: "Seleziona questa pagina" }),
    );
    expect(screen.getByText("100", { selector: "strong" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Pagina successiva" }));
    expect(
      screen.getByRole("checkbox", { name: "Seleziona COD-100" }),
    ).not.toBeChecked();
    expect(screen.getByText("100", { selector: "strong" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Pagina precedente" }));
    expect(
      screen.getByRole("checkbox", { name: "Seleziona COD-0" }),
    ).toBeChecked();
  });
  it("trova le voci delle altre categorie e cerca un codice senza ignorare la categoria", async () => {
    render(<Browser />);
    fireEvent.click(screen.getByRole("button", { name: "B Demolizioni" }));
    expect(
      screen.getByRole("checkbox", { name: "Seleziona COD-100" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("checkbox", { name: "Seleziona COD-0" }),
    ).toBeNull();
    fireEvent.change(
      screen.getByRole("textbox", { name: "Cerca codice o descrizione" }),
      { target: { value: "COD-100" } },
    );
    await waitFor(() =>
      expect(stato.filtri.at(-1)).toMatchObject({
        search: "COD-100",
        capitoliIds: ["B"],
      }),
    );
  });
  it("un errore di rete non è confuso con un capitolo vuoto", () => {
    stato.errore = true;
    render(<Browser />);
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Le voci non si sono caricate",
    );
    fireEvent.click(screen.getByRole("button", { name: "Riprova" }));
    expect(stato.refetch).toHaveBeenCalledOnce();
  });
  it("richiede l'unità mancante prima di importare, anche se la voce è su un'altra pagina", () => {
    stato.voci[0].unita_misura = null;
    apri();
    fireEvent.click(screen.getByRole("checkbox", { name: "Seleziona COD-0" }));
    expect(
      screen.getByRole("button", { name: "Importa 1 voce" }),
    ).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Pagina successiva" }));
    expect(screen.getByRole("alert")).toHaveTextContent(
      "1 voce selezionata da completare",
    );
    fireEvent.click(screen.getByRole("button", { name: "Pagina precedente" }));
    fireEvent.change(
      screen.getByRole("combobox", { name: "Unità per COD-0" }),
      { target: { value: "mq" } },
    );
    expect(
      screen.getByRole("button", { name: "Importa 1 voce" }),
    ).toBeEnabled();
    expect(stato.upsert).not.toHaveBeenCalled();
  });
  it("converte il prezzo in tonnellate, mantiene la categoria e usa insert senza sovrascrivere", async () => {
    stato.voci = [voce(0, { unita_misura: "t", prezzo: 150 })];
    const callbacks = apri();
    fireEvent.change(
      screen.getByRole("textbox", { name: "Ricarico sul prezzo regionale %" }),
      { target: { value: "20" } },
    );
    fireEvent.click(screen.getByRole("checkbox", { name: "Seleziona COD-0" }));
    expect(screen.getByText(/Nel listino: 0,18 €\/kg/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Importa 1 voce" }));
    await waitFor(() => expect(callbacks.onImported).toHaveBeenCalledOnce());
    const [rows, options] = stato.upsert.mock.calls[0];
    expect(options).toEqual({ onConflict: "id", ignoreDuplicates: true });
    expect(rows[0]).toMatchObject({
      prezzo_vendita: 0.18,
      costo_interno: 0.15,
      unita_fatturazione: "kg",
      custom_field_values: { _prezzario: { capitolo_nome: "A · Opere edili" } },
    });
  });
  it("se il secondo lotto fallisce, aggiorna il listino e riprende solo la voce rimasta", async () => {
    stato.upsert
      .mockImplementationOnce(async (rows: { id: string }[]) => ({
        data: rows.map((r) => ({ id: r.id })),
        error: null,
      }))
      .mockResolvedValueOnce({
        data: null,
        error: new Error("Rete interrotta"),
      });
    const callbacks = apri();
    fireEvent.click(
      screen.getByRole("button", { name: "Seleziona questa pagina" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Pagina successiva" }));
    fireEvent.click(
      screen.getByRole("button", { name: "Seleziona questa pagina" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Importa 101 voci" }));
    await waitFor(() =>
      expect(stato.error).toHaveBeenCalledWith(
        "Importazione parziale",
        expect.objectContaining({
          description: expect.stringContaining("100 voci salvate"),
        }),
      ),
    );
    expect(callbacks.onImported).toHaveBeenCalledOnce();
    const retry = screen.getByRole("button", { name: "Importa 1 voce" });
    expect(retry).toBeEnabled();
    fireEvent.click(retry);
    await waitFor(() => expect(stato.success).toHaveBeenCalledOnce());
    expect(stato.upsert.mock.calls.map((c) => c[0].length)).toEqual([
      100, 1, 1,
    ]);
    expect(stato.upsert.mock.calls[1][0][0].id).toBe(
      stato.upsert.mock.calls[2][0][0].id,
    );
  });
  it("non trasforma un ricarico sbagliato in zero", () => {
    apri();
    fireEvent.click(screen.getByRole("checkbox", { name: "Seleziona COD-0" }));
    fireEvent.change(
      screen.getByRole("textbox", { name: "Ricarico sul prezzo regionale %" }),
      { target: { value: "abc" } },
    );
    expect(
      screen.getByRole("button", { name: "Importa 1 voce" }),
    ).toBeDisabled();
    expect(stato.upsert).not.toHaveBeenCalled();
  });
});
