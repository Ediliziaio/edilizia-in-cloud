import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { EditorSendEmailDialog } from "@/pages/azienda/fatturazione/editor/EditorSendEmailDialog";
import { RichTextEditor } from "@/pages/azienda/email/components/RichTextEditor";
import type { EditorState } from "@/pages/azienda/fatturazione/editor/useEditorState";

const state = vi.hoisted(() => ({ lookup: null as unknown as Promise<unknown>, invoke: vi.fn(), toastError: vi.fn() }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: state.toastError } }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: {
  from: () => ({ select: () => ({ eq: () => ({ maybeSingle: () => state.lookup }) }) }),
  auth: { getSession: async () => ({ data: { session: null as null } }) },
  functions: { invoke: state.invoke },
} }));
let resolveLookup: (value: unknown) => void;
const doc = { id: "demo-documento", tipo: "fattura", stato: "emessa", numero: "FT-DEMO", anagrafica_id: "demo-anagrafica", cliente_snapshot: { email: "iniziale@example.test" }, totale_da_pagare: 100 } as unknown as EditorState;
function setup(saveNow = vi.fn().mockResolvedValue(undefined), onOpenChange = vi.fn()) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={client}><EditorSendEmailDialog state={doc} open onOpenChange={onOpenChange} saveNow={saveNow} /></QueryClientProvider>);
  return { saveNow, onOpenChange };
}
beforeEach(() => {
  state.lookup = new Promise(resolve => { resolveLookup = resolve; });
  state.invoke.mockReset().mockResolvedValue({ data: { success: true }, error: null });
  state.toastError.mockClear();
});
afterEach(cleanup);

describe("email documento: bozza e invio protetti", () => {
  it("l'arrivo dell'anagrafica non azzera destinatario, oggetto e messaggio già scritti", async () => {
    setup();
    fireEvent.change(screen.getByLabelText("Destinatario *"), { target: { value: "scelto@example.test" } });
    fireEvent.change(screen.getByLabelText("Oggetto"), { target: { value: "Oggetto modificato" } });
    fireEvent.change(screen.getByLabelText("Messaggio (opzionale)"), { target: { value: "Testo da conservare" } });
    resolveLookup({ data: { email: "anagrafica@example.test" }, error: null });
    await state.lookup;
    await waitFor(() => expect(screen.getByLabelText("Destinatario *")).toHaveValue("scelto@example.test"));
    expect(screen.getByLabelText("Oggetto")).toHaveValue("Oggetto modificato");
    expect(screen.getByLabelText("Messaggio (opzionale)")).toHaveValue("Testo da conservare");
    expect(state.invoke).not.toHaveBeenCalled();
  });
  it("il refetch durante un invio non riabilita il pulsante né permette di chiudere o inviare due volte", async () => {
    let finishSave!: () => void;
    const save = vi.fn(() => new Promise<void>(resolve => { finishSave = resolve; }));
    const { onOpenChange } = setup(save);
    fireEvent.click(screen.getByRole("button", { name: "Invia email" }));
    resolveLookup({ data: { email: "anagrafica@example.test" }, error: null });
    await state.lookup;
    expect(screen.getByRole("button", { name: "Invio in corso..." })).toBeDisabled();
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    expect(onOpenChange).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Invio in corso..." }));
    finishSave();
    await waitFor(() => expect(state.invoke).toHaveBeenCalledTimes(1));
    expect(save).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
  });
  it("un errore nel salvataggio conserva la bozza e non chiama l'invio", async () => {
    setup(vi.fn().mockRejectedValue(new Error("Rete assente")));
    fireEvent.change(screen.getByLabelText("Messaggio (opzionale)"), { target: { value: "Bozza locale" } });
    fireEvent.click(screen.getByRole("button", { name: "Invia email" }));
    await waitFor(() => expect(state.toastError).toHaveBeenCalled());
    expect(screen.getByLabelText("Messaggio (opzionale)")).toHaveValue("Bozza locale");
    expect(state.invoke).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Invia email" })).toBeEnabled();
  });
});

it("l'editor email mantiene la formattazione e rimuove handler e link eseguibili", () => {
  const onChange = vi.fn();
  const { rerender } = render(<RichTextEditor value={'<p><strong>Testo</strong><img onerror="alert(1)"><a href="javascript:alert(1)">link</a></p>'} onChange={onChange} />);
  const editor = screen.getByRole("textbox", { name: "Messaggio" });
  expect(editor.querySelector("strong")).toHaveTextContent("Testo");
  expect(editor.innerHTML).not.toMatch(/onerror|javascript:/);
  rerender(<RichTextEditor value="<p>Nuova bozza</p>" onChange={onChange} />);
  expect(editor).toHaveTextContent("Nuova bozza");
  expect(onChange).not.toHaveBeenCalled();
});
