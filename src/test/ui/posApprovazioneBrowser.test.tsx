/**
 * Approvare, emettere una copia e aprire l'anteprima del POS: il PDF lo disegna il browser (il server ha 2 s di CPU),
 * e dove il browser non può — o il server in linea è ancora quello di prima — si ripiega sulle azioni di sempre, in cui
 * il PDF lo disegna il server. I conflitti e gli errori veri NON ripiegano: ripetere altrove nasconderebbe il motivo.
 */
import { act, renderHook, cleanup } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
const s = vi.hoisted(() => ({ disegna: vi.fn() }));
vi.mock("@/hooks/useEffectiveCompanyId", () => ({ useEffectiveCompanyId: () => "azienda-a" }));
vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));
vi.mock("@/lib/sicurezza/disegnaPdfPos", () => ({ disegnaPdfPosNelBrowser: s.disegna }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { auth: { getSession: async () => ({ data: { session: { access_token: "token-di-prova" } } }) } } }));
import { pdfAnteprimaPos, useApprovaPos } from "@/hooks/usePos";
import { usePreparaEmissione } from "@/hooks/useEmissioniPos";

const html = "<html>modello</html>";
const pdf = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 9, 8, 7]);
const prenotazione = { ok: true, emissione_id: "emissione-1", token: "token-1", emesso_il: "2026-10-30T10:00:00+00:00", html, layout: "pos-pdf-9-riferimento-psc", codice: "ORD-1", revisione: 0 };
const anteprima = { ok: true, html, layout: "pos-pdf-9-riferimento-psc", codice: "ORD-1", revisione: 0, emessoIl: "2026-10-30T10:05:00Z" };

/** I byte di un file del multipart, letti come li leggerebbe il server: con le API di jsdom, che non sono quelle di Node. */
const leggiByte = (file: Blob) => new Promise<Uint8Array>((ok, ko) => { const l = new FileReader(); l.onload = () => ok(new Uint8Array(l.result as ArrayBuffer)); l.onerror = () => ko(l.error); l.readAsArrayBuffer(file); });

interface Richiesta { azione: string; corpo: Record<string, unknown>; intestazioni: Record<string, string>; pdf?: Uint8Array; multipart: boolean }
const richieste: Richiesta[] = [];
/** Un server finto: risponde per azione. Una funzione può anche lanciare per simulare la rete che cade. */
function server(risposte: Record<string, (r: Richiesta) => Response | Promise<Response>>) {
  richieste.length = 0;
  vi.stubGlobal("fetch", vi.fn(async (_url: string, opzioni: RequestInit) => {
    const intestazioni = (opzioni.headers ?? {}) as Record<string, string>;
    let r: Richiesta;
    if (opzioni.body instanceof FormData) {
      const file = opzioni.body.get("pdf") as File;
      const corpo = JSON.parse(opzioni.body.get("meta") as string);
      r = { azione: corpo.azione, corpo, intestazioni, pdf: await leggiByte(file), multipart: true };
    } else {
      const corpo = JSON.parse(opzioni.body as string);
      r = { azione: corpo.azione, corpo, intestazioni, multipart: false };
    }
    richieste.push(r);
    const risponde = risposte[r.azione];
    if (!risponde) throw new Error(`azione non prevista dal server finto: ${r.azione}`);
    return risponde(r);
  }));
}
const json = (corpo: unknown, status = 200) => new Response(JSON.stringify(corpo), { status });
const azioni = () => richieste.map((r) => r.azione);
const contesto = () => {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return ({ children }: { children: ReactNode }) => <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
};
beforeEach(() => { s.disegna.mockReset(); s.disegna.mockResolvedValue(pdf); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("Approvazione del POS", () => {
  it("prepara, fa disegnare il PDF al browser e lo carica (multipart) senza far disegnare nulla al server", async () => {
    server({ prepara_emissione: () => json(prenotazione), completa_emissione: () => json({ ok: true, emissione_id: "emissione-1", approvato_da_nome: "Mario Rossi" }) });
    const h = renderHook(() => useApprovaPos(), { wrapper: contesto() });
    let esito: { approvato_da_nome: string } | undefined;
    await act(async () => { esito = await h.result.current.mutateAsync({ posId: "pos-1", attesaUpdatedAt: "2026-10-30T09:00:00Z" }); });
    expect(azioni()).toEqual(["prepara_emissione", "completa_emissione"]);
    expect(richieste[0].corpo).toMatchObject({ azione: "prepara_emissione", company_id: "azienda-a", pos_id: "pos-1", attesa_updated_at: "2026-10-30T09:00:00Z", versione_client: 2 });
    expect(s.disegna).toHaveBeenCalledOnce();
    expect(richieste[1].multipart).toBe(true);
    expect(richieste[1].corpo).toMatchObject({ azione: "completa_emissione", company_id: "azienda-a", emissione_id: "emissione-1", token: "token-1", versione_client: 2 });
    expect(richieste[1].corpo.pdf_sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(richieste[1].pdf).toEqual(pdf);
    expect(richieste[1].intestazioni.Authorization).toBe("Bearer token-di-prova");
    // Il Content-Type del multipart lo mette il browser, con il suo confine: scriverlo a mano lo rompe.
    expect(Object.keys(richieste[1].intestazioni).map((k) => k.toLowerCase())).not.toContain("content-type");
    expect(esito).toEqual({ approvato_da_nome: "Mario Rossi" });
  });

  it("un POS già approvato risponde senza disegnare e senza altre richieste", async () => {
    server({ prepara_emissione: () => json({ ok: true, gia_approvato: true }) });
    const h = renderHook(() => useApprovaPos(), { wrapper: contesto() });
    await act(async () => { await h.result.current.mutateAsync({ posId: "pos-1", attesaUpdatedAt: "x" }); });
    expect(azioni()).toEqual(["prepara_emissione"]);
    expect(s.disegna).not.toHaveBeenCalled();
  });

  it("un conflitto (POS cambiato) o voci mancanti passano com'è e NON ripiegano sul server", async () => {
    server({ prepara_emissione: () => json({ ok: false, error: "Il POS è cambiato rispetto alla versione che hai letto." }, 409) });
    const h = renderHook(() => useApprovaPos(), { wrapper: contesto() });
    await act(async () => { await expect(h.result.current.mutateAsync({ posId: "pos-1", attesaUpdatedAt: "x" })).rejects.toThrow(/è cambiato/); });
    expect(azioni()).toEqual(["prepara_emissione"]);
  });

  it("se il server in linea non conosce ancora le azioni nuove, approva come prima (PDF disegnato dal server)", async () => {
    server({ prepara_emissione: () => json({ ok: false, error: "Azione non riconosciuta" }, 400), approva: () => json({ ok: true, approvato_da_nome: "Mario Rossi" }) });
    const h = renderHook(() => useApprovaPos(), { wrapper: contesto() });
    let esito: { approvato_da_nome: string } | undefined;
    await act(async () => { esito = await h.result.current.mutateAsync({ posId: "pos-1", attesaUpdatedAt: "2026-10-30T09:00:00Z" }); });
    expect(azioni()).toEqual(["prepara_emissione", "approva"]);
    expect(richieste[1].corpo).toMatchObject({ azione: "approva", company_id: "azienda-a", pos_id: "pos-1", attesa_updated_at: "2026-10-30T09:00:00Z", versione_client: 2 });
    expect(esito).toEqual({ approvato_da_nome: "Mario Rossi" });
  });

  it("se il browser non riesce a disegnare libera la prenotazione e approva come prima", async () => {
    s.disegna.mockRejectedValue(new Error("memoria esaurita"));
    server({ prepara_emissione: () => json(prenotazione), annulla_emissione: () => json({ ok: true }), approva: () => json({ ok: true, approvato_da_nome: "Mario Rossi" }) });
    const h = renderHook(() => useApprovaPos(), { wrapper: contesto() });
    await act(async () => { await h.result.current.mutateAsync({ posId: "pos-1", attesaUpdatedAt: "x" }); });
    expect(azioni()).toEqual(["prepara_emissione", "annulla_emissione", "approva"]);
    expect(richieste[1].corpo).toMatchObject({ emissione_id: "emissione-1", token: "token-1" });
  });

  it("se il server rifiuta il PDF caricato (POS cambiato nel frattempo) l'errore arriva all'utente e la prenotazione si libera", async () => {
    server({ prepara_emissione: () => json(prenotazione), completa_emissione: () => json({ ok: false, error: "Il POS è cambiato durante la preparazione del PDF: ricaricalo e riprova" }, 409), annulla_emissione: () => json({ ok: true }) });
    const h = renderHook(() => useApprovaPos(), { wrapper: contesto() });
    await act(async () => { await expect(h.result.current.mutateAsync({ posId: "pos-1", attesaUpdatedAt: "x" })).rejects.toThrow(/è cambiato durante la preparazione/); });
    expect(azioni()).toEqual(["prepara_emissione", "completa_emissione", "annulla_emissione"]);
  });
});

describe("Emissione di una copia del contenuto archiviato", () => {
  it("chiede la copia al server, disegna nel browser e carica; il ripiego è «emetti»", async () => {
    server({ prepara_emissione: () => json(prenotazione), completa_emissione: () => json({ ok: true, emissione_id: "emissione-1" }) });
    const h = renderHook(() => usePreparaEmissione("azienda-a", "pos-1"), { wrapper: contesto() });
    await act(async () => { await h.result.current.mutateAsync("copia-7"); });
    expect(richieste[0].corpo).toMatchObject({ azione: "prepara_emissione", pos_id: "pos-1", snapshot_id: "copia-7" });
    expect(richieste[0].corpo).not.toHaveProperty("attesa_updated_at");
    expect(azioni()).toEqual(["prepara_emissione", "completa_emissione"]);

    server({ prepara_emissione: () => json({ ok: false, error: "Azione non riconosciuta" }, 400), emetti: () => json({ ok: true, emissione_id: "emissione-9" }) });
    await act(async () => { await h.result.current.mutateAsync("copia-7"); });
    expect(azioni()).toEqual(["prepara_emissione", "emetti"]);
    expect(richieste[1].corpo).toMatchObject({ azione: "emetti", company_id: "azienda-a", pos_id: "pos-1", snapshot_id: "copia-7" });
  });
});

describe("Anteprima del POS", () => {
  it("si fa dare l'HTML dal server e disegna il PDF nel browser", async () => {
    server({ anteprima_html: () => json(anteprima) });
    const blob = await pdfAnteprimaPos("azienda-a", "pos-1");
    expect(azioni()).toEqual(["anteprima_html"]);
    expect(s.disegna).toHaveBeenCalledWith(expect.objectContaining({ html, anteprima: true, codice: "ORD-1" }));
    expect(blob.type).toBe("application/pdf");
  });

  it("se non riesce a disegnare, o il server è quello di prima, usa l'anteprima di sempre", async () => {
    s.disegna.mockRejectedValue(new Error("Worker bloccato"));
    server({ anteprima_html: () => json(anteprima), anteprima_pdf: () => new Response(pdf, { status: 200, headers: { "Content-Type": "application/pdf" } }) });
    expect((await pdfAnteprimaPos("azienda-a", "pos-1")).type).toBe("application/pdf");
    expect(azioni()).toEqual(["anteprima_html", "anteprima_pdf"]);

    s.disegna.mockResolvedValue(pdf);
    server({ anteprima_html: () => json({ ok: false, error: "Azione non riconosciuta" }, 400), anteprima_pdf: () => new Response(pdf, { status: 200, headers: { "Content-Type": "application/pdf" } }) });
    await pdfAnteprimaPos("azienda-a", "pos-1");
    expect(azioni()).toEqual(["anteprima_html", "anteprima_pdf"]);
  });

  it("un carattere che il font non ha ferma l'anteprima con il suo messaggio, senza ripiegare (il server direbbe lo stesso)", async () => {
    server({ anteprima_html: () => json({ ok: false, error: "Il PDF richiede un font aggiuntivo per i caratteri U+6D4B" }, 422) });
    await expect(pdfAnteprimaPos("azienda-a", "pos-1")).rejects.toThrow(/font aggiuntivo/);
    expect(azioni()).toEqual(["anteprima_html"]);
  });
});
