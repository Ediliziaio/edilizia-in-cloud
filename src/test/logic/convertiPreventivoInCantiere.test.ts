/// <reference types="node" />
/**
 * «Converti in Cantiere» dal dettaglio di un preventivo accettato (06/10/2026): due cose che l'utente non vedeva.
 *
 *  1. La edge function `converti-preventivo-cantiere` risponde `avviso: "Righe non copiate: …"` quando la commessa è nata
 *     ma le righe no. La pagina diceva comunque «convertito con successo» e apriva una commessa vuota.
 *  2. I rifiuti della funzione (nessun permesso, «Esiste già un cantiere associato a questo preventivo», preventivo non
 *     ancora accettato) stanno nel corpo della risposta: la pagina leggeva `error.context.json.error`, ma `context` è una
 *     Response e `json` un metodo, quindi usciva sempre «Edge Function returned a non-2xx status code».
 *
 * L'handler provato è il testo vero di `handleConvertToCantiere` in QuoteDetail.tsx, eseguito con servizi finti (stessa
 * tecnica di quoteSaveHandlers.test.ts): così si vede anche se la pagina usa davvero l'helper.
 */
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import { beforeEach, describe, expect, it, vi } from "vitest";

const finto = vi.hoisted(() => ({ invoke: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { functions: { invoke: finto.invoke } } }));

import { convertiPreventivoInCantiere } from "@/lib/quotes/convertiPreventivoInCantiere";

const FILE = "src/pages/azienda/marketing/QuoteDetail.tsx";

/** Il testo vero dell'handler, tradotto e messo in un contesto con i soli servizi che gli passiamo. */
function handlerVero(name: string, context: Record<string, unknown>) {
  const source = ts.createSourceFile(FILE, readFileSync(FILE, "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let initializer: ts.Expression | undefined;
  const visita = (node: ts.Node): void => {
    if (ts.isVariableDeclaration(node) && node.name.getText(source) === name) initializer = node.initializer;
    ts.forEachChild(node, visita);
  };
  visita(source);
  if (!initializer) throw new Error(`Handler mancante: ${name}`);
  const code = ts.transpileModule(`globalThis.handler = ${initializer.getText(source)}`, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
  }).outputText;
  vm.createContext(context);
  vm.runInContext(code, context);
  return context.handler as () => Promise<void>;
}

/** Un rifiuto della funzione come lo restituisce supabase-js: errore generico + `context` = la Response col motivo. */
const rifiuto = (stato: number, motivo: string) =>
  Object.assign(new Error("Edge Function returned a non-2xx status code"), {
    name: "FunctionsHttpError",
    context: new Response(JSON.stringify({ error: motivo }), { status: stato, headers: { "Content-Type": "application/json" } }),
  });

beforeEach(() => finto.invoke.mockReset());

describe("convertiPreventivoInCantiere", () => {
  it("commessa creata con tutte le righe: id della commessa e nessun avviso", async () => {
    finto.invoke.mockResolvedValue({ data: { success: true, order_id: "o1", avviso: null }, error: null });
    await expect(convertiPreventivoInCantiere("q1")).resolves.toEqual({ orderId: "o1", avviso: null });
    expect(finto.invoke).toHaveBeenCalledWith("converti-preventivo-cantiere", { body: { quote_id: "q1" } });
  });

  it("commessa creata ma righe non copiate: l'avviso della funzione arriva a chi chiama", async () => {
    finto.invoke.mockResolvedValue({ data: { success: true, order_id: "o1", avviso: " Righe non copiate: invalid input syntax for type integer: \"12.5\" " }, error: null });
    await expect(convertiPreventivoInCantiere("q1")).resolves.toEqual({
      orderId: "o1", avviso: 'Righe non copiate: invalid input syntax for type integer: "12.5"',
    });
  });

  it("un avviso vuoto non è un avviso", async () => {
    finto.invoke.mockResolvedValue({ data: { success: true, order_id: "o1", avviso: "  " }, error: null });
    expect((await convertiPreventivoInCantiere("q1")).avviso).toBeNull();
  });

  it("un rifiuto dice il motivo vero, non «non-2xx status code»", async () => {
    finto.invoke.mockResolvedValue({ data: null, error: rifiuto(409, "Esiste già un cantiere associato a questo preventivo (ID: o9)") });
    await expect(convertiPreventivoInCantiere("q1")).rejects.toThrow("Esiste già un cantiere associato a questo preventivo (ID: o9)");
  });

  it("senza corpo leggibile resta il messaggio dell'errore", async () => {
    finto.invoke.mockResolvedValue({ data: null, error: new Error("Failed to send a request to the Edge Function") });
    await expect(convertiPreventivoInCantiere("q1")).rejects.toThrow("Failed to send a request to the Edge Function");
  });

  it("una risposta senza commessa è un errore, non una pagina /ordini/undefined", async () => {
    finto.invoke.mockResolvedValue({ data: { success: true }, error: null });
    await expect(convertiPreventivoInCantiere("q1")).rejects.toThrow(/non ha restituito la commessa/);
  });
});

describe("QuoteDetail.handleConvertToCantiere (il testo vero dell'handler)", () => {
  function esegui() {
    const toast = { error: vi.fn(), success: vi.fn(), warning: vi.fn() };
    const navigate = vi.fn();
    const setConverting = vi.fn();
    const invalidateQueries = vi.fn();
    const handler = handlerVero("handleConvertToCantiere", {
      Error, id: "q1", toast, navigate, setConverting, converting: false,
      queryClient: { invalidateQueries }, queryKeys: { quotes: { detail: (id: string) => ["quotes", id] } },
      // Il vecchio handler chiamava direttamente supabase: lo stesso finto, così il test dice cosa vede l'utente.
      supabase: { functions: { invoke: finto.invoke } },
      convertiPreventivoInCantiere,
    });
    return { handler, toast, navigate, setConverting, invalidateQueries };
  }

  it("righe non copiate: avviso visibile (non «successo») e si apre comunque la commessa", async () => {
    finto.invoke.mockResolvedValue({ data: { success: true, order_id: "o1", avviso: "Righe non copiate: boom" }, error: null });
    const { handler, toast, navigate } = esegui();
    await handler();
    expect(toast.warning).toHaveBeenCalledWith("Commessa creata, ma non completa", expect.objectContaining({ description: "Righe non copiate: boom" }));
    expect(toast.success).not.toHaveBeenCalled();
    expect(navigate).toHaveBeenCalledWith("/azienda/ordini/o1");
  });

  it("tutto copiato: il messaggio di successo di sempre", async () => {
    finto.invoke.mockResolvedValue({ data: { success: true, order_id: "o1", avviso: null }, error: null });
    const { handler, toast, navigate, invalidateQueries } = esegui();
    await handler();
    expect(toast.success).toHaveBeenCalledWith("Preventivo convertito in cantiere con successo!");
    expect(toast.warning).not.toHaveBeenCalled();
    expect(navigate).toHaveBeenCalledWith("/azienda/ordini/o1");
    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: ["quotes", "q1"] });
  });

  it("rifiuto della funzione: l'utente legge il motivo, non si naviga, il pulsante si riabilita", async () => {
    finto.invoke.mockResolvedValue({ data: null, error: rifiuto(403, "Non hai il permesso di creare commesse (chiedi all'amministratore).") });
    const { handler, toast, navigate, setConverting } = esegui();
    await handler();
    expect(toast.error).toHaveBeenCalledWith("Errore conversione: Non hai il permesso di creare commesse (chiedi all'amministratore).");
    expect(toast.success).not.toHaveBeenCalled();
    expect(navigate).not.toHaveBeenCalled();
    expect(setConverting).toHaveBeenLastCalledWith(false);
  });
});
