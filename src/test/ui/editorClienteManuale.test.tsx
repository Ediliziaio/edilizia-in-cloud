// Scelto un cliente dalla lista, passare a mano non deve far ripartire da capo (09/11/2026).
import { useReducer } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const db = vi.hoisted(() => ({ update: vi.fn() }));

vi.mock("@/hooks/useEffectiveCompanyId", () => ({ useEffectiveCompanyId: () => "az-1" }));
vi.mock("@/hooks/useAnagraficheNative", () => ({
  useAnagraficheNative: (): { data: Record<string, unknown>[] } => ({
    data: [{
      id: "cli-1", ragione_sociale: "Edile Prova srl", partita_iva: "01234567890", codice_fiscale: "01234567890",
      tipo_cliente: "B2B", indirizzo_via: "Via Roma 1", indirizzo_cap: "20100", indirizzo_comune: "Milano", indirizzo_provincia: "MI",
    }],
  }),
}));
vi.mock("@/components/shared/CampoIndirizzo", () => ({ CampoIndirizzo: (): null => null }));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: () => ({
      update: (...a: unknown[]) => {
        db.update(...a);
        return { eq: () => ({ eq: async (): Promise<{ error: unknown }> => ({ error: undefined }) }) };
      },
    }),
  },
}));

import { EditorClienteSection } from "@/pages/azienda/fatturazione/editor/EditorClienteSection";
import { createEmptyRiga, editorReducer, type EditorState } from "@/pages/azienda/fatturazione/editor/useEditorState";

const LAVORO = {
  data_emissione: "2026-11-09", data_scadenza: "2026-12-09", metodo_pagamento_codice: "MP05",
  iban_pagamento: "IT60X0542811101000000123456", note_documento: "Note già scritte",
};

function Harness() {
  const [state, dispatch] = useReducer(editorReducer, {
    tipo: "fattura", stato: "bozza", _initialized: true, ...LAVORO,
    righe: [{ ...createEmptyRiga(1), descrizione: "Riga già scritta", prezzo_unitario: 100 }],
  } as unknown as EditorState);
  return (
    <>
      <EditorClienteSection state={state} dispatch={dispatch} />
      <pre data-testid="stato">{JSON.stringify(state)}</pre>
    </>
  );
}

const stato = () => JSON.parse(screen.getByTestId("stato").textContent ?? "{}");

function scegliDallaLista() {
  fireEvent.focus(screen.getByPlaceholderText(/Cerca cliente/));
  fireEvent.click(screen.getByText("Edile Prova srl"));
}

const campoRagioneSociale = () => screen.getByDisplayValue("Edile Prova srl") as HTMLInputElement;

describe("Cliente: dalla lista all'inserimento a mano", () => {
  beforeEach(() => db.update.mockClear());
  const renderizza = () => render(<QueryClientProvider client={new QueryClient()}><Harness /></QueryClientProvider>);

  it("sgancia l'anagrafica, lascia i dati modificabili e non tocca il resto del documento", () => {
    renderizza();
    scegliDallaLista();
    expect(stato().anagrafica_id).toBe("cli-1");

    fireEvent.click(screen.getByRole("button", { name: "Inserisci a mano" }));

    const s = stato();
    expect(s.anagrafica_id).toBeUndefined();
    expect(s.cliente_snapshot.partita_iva).toBe("01234567890");
    expect(campoRagioneSociale().disabled).toBe(false);
    expect(s.righe[0].descrizione).toBe("Riga già scritta");
    for (const [campo, valore] of Object.entries(LAVORO)) expect(s[campo], campo).toBe(valore);
  });

  it("cancellando tutto il nome per scriverne un altro il modulo resta aperto", () => {
    renderizza();
    scegliDallaLista();
    fireEvent.click(screen.getByRole("button", { name: "Inserisci a mano" }));

    fireEvent.change(campoRagioneSociale(), { target: { value: "" } });
    expect(screen.queryByPlaceholderText(/Cerca cliente/)).toBeNull();

    fireEvent.change(screen.getByLabelText("Ragione Sociale"), { target: { value: "Altro Cliente" } });
    expect(stato().cliente_snapshot.ragione_sociale).toBe("Altro Cliente");
  });

  it("i dati scritti a mano non finiscono sull'anagrafica scelta prima", async () => {
    renderizza();
    scegliDallaLista();
    fireEvent.click(screen.getByRole("button", { name: "Inserisci a mano" }));
    fireEvent.change(campoRagioneSociale(), { target: { value: "Altro Cliente" } });
    fireEvent.click(screen.getByRole("button", { name: "Fine modifica" }));
    await Promise.resolve();
    expect(db.update).not.toHaveBeenCalled();
    expect(stato().cliente_snapshot.ragione_sociale).toBe("Altro Cliente");
  });

  it("a mano si può passare da azienda a privato", () => {
    renderizza();
    scegliDallaLista();
    fireEvent.click(screen.getByRole("button", { name: "Inserisci a mano" }));

    fireEvent.click(screen.getByRole("button", { name: "Privato" }));
    const s = stato();
    expect(s.cliente_snapshot.tipo_cliente).toBe("B2C");
    expect(s.cliente_snapshot.partita_iva).toBeFalsy();
    expect(s.cliente_snapshot.ragione_sociale).toBeFalsy();
    expect(screen.getByLabelText("Nome *")).toBeTruthy();
    expect(screen.getByLabelText("Cognome *")).toBeTruthy();
    expect(s.righe[0].descrizione).toBe("Riga già scritta");
  });

  it("un cliente già a mano non offre il pulsante: non c'è niente da sganciare", () => {
    renderizza();
    expect(screen.queryByRole("button", { name: "Inserisci a mano" })).toBeNull();
  });
});
