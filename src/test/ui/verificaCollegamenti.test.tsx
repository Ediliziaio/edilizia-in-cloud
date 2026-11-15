/**
 * Popup di verifica dei collegamenti (§7.14): proposte certe confermabili insieme, quelle da guardare una
 * per una, il perché (prove e percorso), rifiuto e annullamento col motivo, sola lettura senza permesso.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { readFileSync } from "node:fs";
import type { RigaCollegamento } from "@/lib/acquisti/verificaCollegamenti";

const riga = (id: string, over: Partial<RigaCollegamento> = {}): RigaCollegamento => ({
  id,
  company_id: "c",
  da_tipo: "fattura_ricevuta",
  da_id: "f1",
  da_riga: null,
  a_tipo: "ddt",
  a_id: `d-${id}`,
  a_riga: null,
  regola: "xml_ddt_numero_data_fornitore",
  esito: "proposta",
  stato: "proposto",
  prove: [
    { campo: "numero_ddt", ruolo: "identifica", esito: "uguale", testo: `DDT ${id}` },
    { campo: "data_ddt", ruolo: "conferma", esito: "uguale", testo: "data compatibile" },
  ],
  percorso: null,
  importo: null,
  con_ai: false,
  autore_tipo: "processo",
  created_at: "2026-11-15T10:00:00Z",
  updated_at: "2026-11-15T10:00:00Z",
  ...over,
});

const state = vi.hoisted(() => ({
  righe: [] as unknown[],
  chiamate: [] as Array<{ ids: string[]; stato: string; motivo?: string | null }>,
}));
vi.mock("@/hooks/useVerificaCollegamenti", () => ({
  useVerificaCollegamenti: (companyId: string | undefined) => ({
    data: companyId ? { righe: state.righe, nomi: { f1: "Fattura 77", "d-1068": "Bolla 1068" }, troncato: false } : undefined,
    isLoading: false,
    error: null as Error | null,
  }),
  useCambiaStatoCollegamenti: () => ({
    mutate: (v: { ids: string[]; stato: string; motivo?: string | null }, o?: { onSuccess?: () => void }) => {
      state.chiamate.push(v);
      o?.onSuccess?.();
    },
    isPending: false,
  }),
}));

import { VerificaCollegamentiDialog } from "@/components/acquisti/VerificaCollegamentiDialog";
import { azioniPossibili, gruppoVerifica, schedaDi } from "@/lib/acquisti/verificaCollegamenti";

function apri(puoModificare = true) {
  const client = new QueryClient();
  render(
    <QueryClientProvider client={client}>
      <VerificaCollegamentiDialog companyId="c" fatturaId="f1" puoModificare={puoModificare} />
    </QueryClientProvider>,
  );
  fireEvent.click(screen.getByRole("button", { name: /Verifica collegamenti/ }));
}
afterEach(() => {
  cleanup();
  state.righe = [];
  state.chiamate = [];
});

describe("regole del popup", () => {
  it("certa solo se tutte le prove tornano, una identifica e nessun dato viene dall'AI", () => {
    expect(gruppoVerifica(riga("a"))).toBe("certo");
    expect(gruppoVerifica(riga("a", { con_ai: true }))).toBe("da_guardare");
    expect(gruppoVerifica(riga("a", { prove: [{ campo: "data", ruolo: "conferma", esito: "uguale", testo: "x" }] }))).toBe("da_guardare");
    expect(gruppoVerifica(riga("a", { prove: [{ campo: "n", ruolo: "identifica", esito: "uguale", testo: "x" }, { campo: "d", ruolo: "conferma", esito: "diverso", testo: "y" }] }))).toBe("da_guardare");
    expect(gruppoVerifica(riga("a", { prove: [] }))).toBe("da_guardare");
  });
  it("azioni come le transizioni del database; pagato non si tocca", () => {
    expect(azioniPossibili("proposto").map((a) => a.verso)).toEqual(["collegato", "rifiutato"]);
    expect(azioniPossibili("collegato").map((a) => a.verso)).toEqual(["verificato", "annullato"]);
    expect(azioniPossibili("pagato")).toEqual([]);
    expect(schedaDi("rifiutato")).toBe("annullati");
    // Le stesse della migrazione: chi cambia l'una cambia l'altra.
    const sql = readFileSync("supabase/migrations/20290404210000_acquisti_collegamenti_traccia.sql", "utf8");
    expect(sql).toContain("when 'proposto' then p_a in ('collegato', 'rifiutato')");
    expect(sql).toContain("when 'collegato' then p_a in ('verificato', 'annullato')");
  });
});

describe("popup di verifica", () => {
  it("separa le certe da quelle da guardare e mostra il perché", () => {
    state.righe = [
      riga("1068"),
      riga("2001", { prove: [{ campo: "numero_ddt", ruolo: "identifica", esito: "uguale", testo: "DDT 2001" }, { campo: "data_ddt", ruolo: "conferma", esito: "diverso", testo: "date lontane 40 giorni" }] }),
    ];
    apri();
    expect(screen.getByRole("tab", { name: "Da confermare (2)" })).toBeInTheDocument();
    expect(screen.getByText("Certe: tutti i dati tornano (1)")).toBeInTheDocument();
    expect(screen.getByText("Da guardare una per una (1)")).toBeInTheDocument();
    expect(screen.getByText("Bolla 1068")).toBeInTheDocument();
    expect(screen.getByText(/date lontane 40 giorni/)).toBeInTheDocument();
    expect(screen.getAllByText(/Bolla citata nella fattura/).length).toBe(2);
  });

  it("conferma in massa solo le certe selezionate", () => {
    state.righe = [riga("1068"), riga("1069"), riga("2001", { con_ai: true })];
    apri();
    fireEvent.click(screen.getByRole("button", { name: "Seleziona tutte" }));
    fireEvent.click(screen.getByRole("button", { name: /Conferma 2 selezionate/ }));
    expect(state.chiamate).toEqual([{ ids: ["1068", "1069"], stato: "collegato", motivo: undefined }]);
  });

  it("rifiutare chiede il motivo, che viene passato al database", () => {
    state.righe = [riga("1068")];
    apri();
    const r = document.querySelector('[data-collegamento="1068"]') as HTMLElement;
    fireEvent.click(within(r).getByRole("button", { name: "Rifiuta" }));
    const pulsanti = screen.getAllByRole("button", { name: "Rifiuta" });
    expect(pulsanti[pulsanti.length - 1]).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Motivo"), { target: { value: "bolla di un altro cantiere" } });
    fireEvent.click(pulsanti[pulsanti.length - 1]);
    expect(state.chiamate).toEqual([{ ids: ["1068"], stato: "rifiutato", motivo: "bolla di un altro cantiere" }]);
  });

  it("un collegato si può annullare; chi non ha il permesso guarda e basta", () => {
    state.righe = [riga("1068", { stato: "collegato", esito: "automatico" })];
    apri(false);
    fireEvent.mouseDown(screen.getByRole("tab", { name: "Collegati (1)" }));
    fireEvent.click(screen.getByRole("tab", { name: "Collegati (1)" }));
    expect(screen.queryByRole("button", { name: "Annulla" })).toBeNull();
    expect(screen.getByText(/per confermarli serve il permesso/)).toBeInTheDocument();
  });

  it("collegati in passato senza conferma: a parte, «da ricontrollare», con annulla e verificato", () => {
    state.righe = [
      riga("st", { stato: "collegato", esito: "automatico", regola: "oda_importo_fornitore_storico", a_tipo: "ordine", prove: [{ campo: "storico", ruolo: "conferma", esito: "mancante", testo: "agganciata prima del 15/11 senza conferma" }] }),
      riga("ok", { stato: "collegato", esito: "automatico" }),
    ];
    apri();
    fireEvent.mouseDown(screen.getByRole("tab", { name: "Collegati (2)" }));
    fireEvent.click(screen.getByRole("tab", { name: "Collegati (2)" }));
    expect(screen.getByText(/Da ricontrollare \(1\)/)).toBeInTheDocument();
    const r = document.querySelector('[data-collegamento="st"]') as HTMLElement;
    expect(within(r).getByRole("button", { name: "Segna verificato" })).toBeInTheDocument();
    expect(within(r).getByRole("button", { name: "Annulla" })).toBeInTheDocument();
  });

  it("si apre dalla fattura ricevuta, accanto ai DDT", () => {
    expect(readFileSync("src/components/fatturazione/CollegamentiFattura.tsx", "utf8")).toContain("<VerificaCollegamentiDialog companyId={companyId} fatturaId={fatturaId}");
  });
});
