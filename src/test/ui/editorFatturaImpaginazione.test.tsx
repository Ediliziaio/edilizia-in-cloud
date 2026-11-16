/**
 * Editor fattura rifatto (15/11/2026): le mancanze sono «da completare» in grigio finché non
 * si preme «Emetti», poi rosse; «Emetti» con mancanze non apre la conferma e non emette; le
 * note si aprono quando servono; il cliente scelto mostra il tipo in evidenza.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

vi.mock("@/contexts/AuthContext", () => ({ useAuth: (): { effectiveCompany: null } => ({ effectiveCompany: null }) }));
vi.mock("@/hooks/use-mobile", () => ({ useIsMobile: () => false }));
vi.mock("@/hooks/useEffectiveCompanyId", () => ({ useEffectiveCompanyId: () => "az-1" }));
vi.mock("@/hooks/useAnagraficheNative", () => ({ useAnagraficheNative: () => ({ data: [] as never[] }) }));
// useQuery serve all'avviso sulla numerazione nel popup di «Emetti» (16/11/2026): senza dati
// l'avviso non compare, che è quello che questi test si aspettano.
vi.mock("@tanstack/react-query", () => ({
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
  useQuery: () => ({ data: undefined, isLoading: false, isError: false }),
}));
vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));

import { EditorTopBar } from "@/pages/azienda/fatturazione/editor/EditorTopBar";
import { EditorTotaliSection } from "@/pages/azienda/fatturazione/editor/EditorTotaliSection";
import { EditorNoteSection } from "@/pages/azienda/fatturazione/editor/EditorNoteSection";
import { EditorClienteSection } from "@/pages/azienda/fatturazione/editor/EditorClienteSection";
import type { EditorState } from "@/pages/azienda/fatturazione/editor/useEditorState";

afterEach(cleanup);
const bozza = { id: "b1", tipo: "fattura", stato: "bozza", numero: "Bozza AAAA0000" } as EditorState;
const errori = [{ field: "cliente", message: "Cliente obbligatorio", severity: "error" as const }];

describe("Mancanze nel riepilogo", () => {
  it("mentre si compila sono grigie, «Da completare»; dopo «Emetti» rosse", () => {
    const vai = vi.fn();
    const { rerender } = render(<EditorTotaliSection state={bozza} dispatch={vi.fn()} errori={errori} errorePieno={false} onVaiAlCampo={vai} />);
    const voce = screen.getByRole("button", { name: /Da completare: Cliente obbligatorio/ });
    expect(voce.className).toContain("text-muted-foreground");
    fireEvent.click(voce);
    expect(vai).toHaveBeenCalledWith("cliente");
    rerender(<EditorTotaliSection state={bozza} dispatch={vi.fn()} errori={errori} errorePieno onVaiAlCampo={vai} />);
    expect(screen.getByText("Per emettere manca")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Cliente obbligatorio" }).className).toContain("text-destructive");
  });
});

describe("«Emetti» con mancanze", () => {
  const barra = (n: number, bloccata = vi.fn(), emetti = vi.fn(), vai = vi.fn()) => {
    render(<MemoryRouter><EditorTopBar state={bozza} isSaving={false} isDirty={false} lastSaved={null}
      onEmetti={emetti} onDelete={vi.fn()} onFieldChange={vi.fn()} validationErrorCount={n}
      onEmissioneBloccata={bloccata} onVaiAlRiepilogo={vai} /></MemoryRouter>);
    return { bloccata, emetti, vai };
  };
  it("non apre la conferma, non emette, segnala le mancanze; l'indicatore porta al riepilogo", () => {
    const { bloccata, emetti, vai } = barra(2);
    fireEvent.click(screen.getByRole("button", { name: "Emetti" }));
    expect(bloccata).toHaveBeenCalledTimes(1);
    expect(emetti).not.toHaveBeenCalled();
    expect(screen.queryByRole("alertdialog")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /2 da completare/ }));
    expect(vai).toHaveBeenCalled();
  });
  it("senza mancanze apre la conferma come prima", () => {
    const { bloccata, emetti } = barra(0);
    fireEvent.click(screen.getByRole("button", { name: "Emetti" }));
    expect(bloccata).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Emetti documento" }));
    expect(emetti).toHaveBeenCalledTimes(1);
  });
});

describe("Note che si aprono quando servono", () => {
  it("vuote: tre pulsanti; con un valore il campo è già aperto", () => {
    render(<EditorNoteSection state={{ ...bozza, note_interne: "solo per noi" }} dispatch={vi.fn()} />);
    expect(screen.getByRole("button", { name: /Causale/ })).toBeTruthy();
    expect(screen.queryByLabelText(/Note documento/)).toBeNull();
    expect((screen.getByLabelText(/Note interne/) as HTMLTextAreaElement).value).toBe("solo per noi");
    fireEvent.click(screen.getByRole("button", { name: /Note documento/ }));
    expect(screen.getByLabelText(/Note documento/)).toBeTruthy();
  });
});

describe("Cliente", () => {
  it("vuoto: ricerca, «Nuovo cliente» e «Occasionale» sulla stessa riga, come pulsanti", () => {
    render(<EditorClienteSection state={bozza} dispatch={vi.fn()} />);
    expect(screen.getByPlaceholderText(/Cerca cliente/)).toBeTruthy();
    expect(screen.getByRole("button", { name: /Nuovo cliente/ }).className).toContain("border");
    expect(screen.getByRole("button", { name: "Occasionale" }).className).toContain("border");
  });
  it("scelto: tipo in evidenza, ufficio e split per la PA, «Cambia» e «Modifica»", () => {
    render(<EditorClienteSection state={{ ...bozza, anagrafica_id: "pa-1", esigibilita_iva: "S", cliente_snapshot: {
      ragione_sociale: "Comune di Prova", codice_fiscale: "80012345676", codice_sdi: "UFXYZ1", tipo_cliente: "PA", pec: "protocollo@pec.it",
      ufficio_pa: { id: "u1", codice: "UFXYZ1", descrizione: "Ufficio di fatturazione", anagrafica_id: "pa-1", origine: "commessa" },
    } } as EditorState} dispatch={vi.fn()} />);
    expect(screen.getByTestId("tipo-cliente").textContent).toBe("PA");
    expect(screen.getByText(/Ufficio di fatturazione/)).toBeTruthy();
    expect(screen.getByText("Split payment")).toBeTruthy();
    expect(screen.getByText("protocollo@pec.it")).toBeTruthy();
    expect(screen.getByRole("button", { name: /Cambia/ })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /^Modifica$/ }));
    expect(screen.getByRole("button", { name: /Fine modifica/ })).toBeTruthy();
  });
});
