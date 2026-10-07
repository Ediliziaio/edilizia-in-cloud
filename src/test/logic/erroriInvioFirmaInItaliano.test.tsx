/// <reference types="node" />
/**
 * «Invia per la firma»: gli errori del server si leggono in italiano.
 *
 * send-quote-signature rifiuta con una frase scritta apposta nel CORPO della risposta
 * («già accettato… non si può rimandare», «serve il permesso di modificare», «sconto
 * oltre il limite: serve l'approvazione»). Per supabase-js un 4xx è un errore HTTP il
 * cui `message` è il generico «Edge Function returned a non-2xx status code»: i tre
 * punti del web che invocano la funzione mostravano quello, e chi mandava l'offerta
 * non capiva perché non partiva.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { gestoriVeri } from "../helpers/gestoriVeri";

const invoke = vi.hoisted(() => vi.fn());
const toast = vi.hoisted(() => ({ error: vi.fn(), success: vi.fn() }));

vi.mock("@/integrations/supabase/client", () => ({ supabase: { functions: { invoke }, from: vi.fn(), storage: { from: vi.fn() }, rpc: vi.fn() } }));
vi.mock("sonner", () => ({ toast }));

import { useSignatureActions } from "@/hooks/useSignatureActions";
import { sendModuleQuoteSignature } from "@/lib/moduli/quoteBridge";
import { messaggioDaErroreFirma } from "@/lib/preventivi/offertaPubblica";

const FRASE_409 = "Questo preventivo è stato rifiutato dal cliente: non si può rimandare per la firma. Per un'altra offerta, duplicalo o fanne una nuova revisione.";
const FRASE_403 = "Sconto del 12% oltre il limite consentito (10%): serve l'approvazione prima di inviare il preventivo.";
const GENERICO = "Edge Function returned a non-2xx status code";

/** Come lo dà supabase-js: un Error col messaggio generico e, in `context`, la risposta HTTP. */
const conRisposta = (stato: number, json: () => Promise<unknown>) => Object.assign(new Error(GENERICO), { context: { status: stato, json } });
const errore = (stato: number, corpo: Record<string, unknown>) => ({
  data: null as unknown,
  error: conRisposta(stato, async () => corpo),
});
const erroreSenzaCorpo = (stato: number) => ({
  data: null as unknown,
  error: conRisposta(stato, async () => { throw new Error("html"); }),
});

beforeEach(() => { invoke.mockReset(); toast.error.mockReset(); toast.success.mockReset(); });
afterEach(cleanup);

describe("useSignatureActions.sendForSignature (scheda del preventivo)", () => {
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={new QueryClient({ defaultOptions: { mutations: { retry: false } } })}>{children}</QueryClientProvider>
  );
  const params = { recipientEmail: "mario@example.it", recipientName: "Mario Rossi", expiresDays: 30 };

  it.each([[409, FRASE_409], [403, FRASE_403]])("%s: l'avviso dice il motivo scritto dal server", async (stato, frase) => {
    invoke.mockResolvedValue(errore(stato, { error: frase }));
    const { result } = renderHook(() => useSignatureActions("q-1"), { wrapper });
    await expect(result.current.sendForSignature.mutateAsync(params)).rejects.toThrow(frase);
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith(`Errore invio: ${frase}`));
  });

  it("senza corpo leggibile (gateway, rete): frase italiana di riserva, mai il generico «non-2xx»", async () => {
    invoke.mockResolvedValue(erroreSenzaCorpo(502));
    const { result } = renderHook(() => useSignatureActions("q-1"), { wrapper });
    await expect(result.current.sendForSignature.mutateAsync(params)).rejects.toThrow();
    await waitFor(() => expect(toast.error).toHaveBeenCalledTimes(1));
    const testo = String(toast.error.mock.calls[0][0]);
    expect(testo).not.toContain("non-2xx");
    expect(testo).toMatch(/riprova tra qualche istante/i);
  });

  it("risposta 200 con `error` nel corpo: resta il suo messaggio; invio riuscito: avviso di successo", async () => {
    invoke.mockResolvedValueOnce({ data: { error: "Email del destinatario mancante" }, error: null });
    const { result } = renderHook(() => useSignatureActions("q-1"), { wrapper });
    await expect(result.current.sendForSignature.mutateAsync(params)).rejects.toThrow("Email del destinatario mancante");
    invoke.mockResolvedValueOnce({ data: { success: true }, error: null });
    await result.current.sendForSignature.mutateAsync(params);
    await waitFor(() => expect(toast.success).toHaveBeenCalledTimes(1));
  });
});

describe("sendModuleQuoteSignature (preventivi dei moduli)", () => {
  it("409: l'errore porta la frase del server", async () => {
    invoke.mockResolvedValue(errore(409, { error: FRASE_409 }));
    await expect(sendModuleQuoteSignature("q-1", "mario@example.it", "Mario Rossi")).rejects.toThrow(FRASE_409);
  });
  it("senza corpo leggibile: frase italiana di riserva, non il generico", async () => {
    invoke.mockResolvedValue(erroreSenzaCorpo(500));
    await expect(sendModuleQuoteSignature("q-1", "a@b.it", "Mario")).rejects.toThrow(/riprova tra qualche istante/i);
  });
  it("`success: false` nel corpo e invio riuscito restano come prima", async () => {
    invoke.mockResolvedValueOnce({ data: { success: false, error: "Indirizzo non valido" }, error: null });
    await expect(sendModuleQuoteSignature("q-1", "x", "Mario")).rejects.toThrow("Indirizzo non valido");
    invoke.mockResolvedValueOnce({ data: { success: true }, error: null });
    await expect(sendModuleQuoteSignature("q-1", "a@b.it", "Mario")).resolves.toBeUndefined();
  });
});

describe("QuoteDetail: invio del solo PDF (inviaPdfSemplice)", () => {
  function inviaPdf() {
    const toasts = { error: vi.fn(), success: vi.fn() };
    const contesto: Record<string, unknown> = {
      id: "q-1",
      inviandoPdf: false,
      setInviandoPdf: vi.fn(),
      supabase: { functions: { invoke } },
      toast: toasts,
      queryClient: { invalidateQueries: vi.fn() },
      queryKeys: { quotes: { detail: (id: string) => ["quotes", "detail", id] } },
      messaggioDaErroreFirma,
    };
    const g = gestoriVeri("src/pages/azienda/marketing/QuoteDetail.tsx", ["inviaPdfSemplice"], contesto);
    return { toasts, invia: () => g.inviaPdfSemplice("mario@example.it", 30) as Promise<void> };
  }

  it("rifiuto del server (403, permesso): la descrizione dell'avviso è la frase del server", async () => {
    const frase = "Per mandare il preventivo al cliente serve il permesso di modificare i preventivi.";
    invoke.mockResolvedValue(errore(403, { error: frase }));
    const { toasts, invia } = inviaPdf();
    await invia();
    expect(toasts.error).toHaveBeenCalledWith("Invio non riuscito", { description: frase });
  });
  it("senza corpo leggibile: descrizione in italiano, mai il generico", async () => {
    invoke.mockResolvedValue(erroreSenzaCorpo(500));
    const { toasts, invia } = inviaPdf();
    await invia();
    const descrizione = String((toasts.error.mock.calls[0][1] as { description: string }).description);
    expect(descrizione).not.toContain("non-2xx");
    expect(descrizione).toMatch(/riprova tra qualche istante/i);
  });
  it("invio riuscito: avviso di successo e preventivo riletto", async () => {
    invoke.mockResolvedValue({ data: { success: true }, error: null });
    const { toasts, invia } = inviaPdf();
    await invia();
    expect(toasts.success).toHaveBeenCalledTimes(1);
    expect(toasts.error).not.toHaveBeenCalled();
  });
});
