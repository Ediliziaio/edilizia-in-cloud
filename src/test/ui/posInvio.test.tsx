import { cleanup, fireEvent, render, renderHook, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { oggiRoma } from "../../../supabase/functions/_shared/posData";

const s = vi.hoisted(() => ({
  upload: vi.fn(), insertTask: vi.fn(), chiama: vi.fn(), errore: vi.fn(), avviso: vi.fn(),
  composer: null as null | Record<string, unknown>, incarichi: { data: [] as unknown[], error: null as unknown },
}));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ user: { id: "utente-1" } }) }));
vi.mock("@/hooks/usePos", () => ({ chiamaServerPos: s.chiama }));
vi.mock("sonner", () => ({ toast: { error: s.errore, warning: s.avviso, success: vi.fn() } }));
vi.mock("@/integrations/supabase/client", () => {
  const catena: Record<string, unknown> = {};
  for (const m of ["select", "eq", "neq", "order"]) catena[m] = () => catena;
  catena.limit = () => Promise.resolve(s.incarichi);
  return { supabase: { storage: { from: () => ({ upload: s.upload }) }, from: (t: string) => (t === "tasks" ? { insert: s.insertTask } : catena) } };
});
vi.mock("@/components/contacts/QuickContactSendDialog", () => ({
  QuickContactSendDialog: (p: Record<string, unknown>) => { s.composer = p; return <div data-testid="composer"><button onClick={() => (p.onSent as () => void)()}>simula invio riuscito</button></div>; },
}));
import { InvioPos, piuGiorni, testiInvioPos, useIncaricoCse } from "@/components/sicurezza/pos/InvioPos";

const pdfFinto = (size = 4000) => ({ size, slice: () => ({ arrayBuffer: async () => new TextEncoder().encode("%PDF-").buffer }) });
const base = { tipo: "cse" as const, companyId: "az", orderId: "ord", emissioneId: "em-1", codice: "2026-014", revisione: 2, impresa: "Edil Rossi S.r.l.", cantiere: "Via Mazzini 14, Como (CO)",
  nomeIniziale: "Ing. Verdi", emailIniziale: "verdi@studio.it", disabilitato: false };
const mostra = (extra: Partial<Parameters<typeof InvioPos>[0]> = {}) => { const onInviato = vi.fn(); render(<InvioPos {...base} onInviato={onInviato} {...extra} />); return onInviato; };

beforeEach(() => {
  vi.clearAllMocks(); s.composer = null; s.incarichi = { data: [], error: null };
  s.chiama.mockResolvedValue({ url: "https://storage.esempio/pos.pdf" });
  s.upload.mockResolvedValue({ error: null });
  s.insertTask.mockResolvedValue({ error: null });
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, blob: async () => pdfFinto() }));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("testi e date dell'invio", () => {
  it("i giorni si sommano sul calendario, anche a cavallo di mese e anno bisestile", () => {
    expect(piuGiorni("2026-10-30", 15)).toBe("2026-11-14");
    expect(piuGiorni("2026-12-25", 15)).toBe("2027-01-09");
    expect(piuGiorni("2028-02-20", 10)).toBe("2028-03-01");
    expect(piuGiorni("2026-10-30", 13)).toBe("2026-11-12");
  });

  it("il testo dice cosa si invia, a chi e il termine dei 15 giorni", () => {
    const cse = testiInvioPos("cse", { codice: "2026-014", revisione: 2, impresa: "Edil Rossi S.r.l.", cantiere: "Via Mazzini 14, Como (CO)" });
    expect(cse.oggetto).toBe("POS 2026-014 — revisione 2 — Edil Rossi S.r.l.");
    expect(cse.corpo).toContain("verifica di idoneità e coerenza con il PSC");
    expect(cse.corpo).toContain("entro 15 giorni dalla ricezione (art. 101, comma 3, D.Lgs 81/2008)");
    expect(cse.corpo).toContain("Via Mazzini 14, Como (CO)");
    const aff = testiInvioPos("affidataria", { codice: "X", revisione: 0, impresa: "", cantiere: "" });
    expect(aff.corpo).toContain("verifica di congruenza con il vostro POS");
    expect(aff.oggetto).toBe("POS X — revisione 0");
  });
});

describe("«Invia al CSE» / «Invia all'impresa affidataria»", () => {
  it("senza un PDF approvato, o con modifiche non salvate, il pulsante è spento e dice perché", () => {
    mostra({ emissioneId: null });
    const spento = screen.getByRole("button", { name: /Invia al CSE/ });
    expect(spento).toBeDisabled();
    expect(spento).toHaveAttribute("title", "Approva il POS: l’invio parte dal PDF approvato");
    cleanup();
    mostra({ disabilitato: true });
    expect(screen.getByRole("button", { name: /Invia al CSE/ })).toBeDisabled();
    expect(screen.getByRole("button", { name: /Invia al CSE/ })).toHaveAttribute("title", "Salva prima le modifiche");
  });

  it("l'e-mail del destinatario si controlla prima di scaricare qualsiasi cosa", () => {
    mostra({ emailIniziale: "" });
    fireEvent.click(screen.getByRole("button", { name: /Invia al CSE/ }));
    expect(screen.getByText(/non ha un’e-mail registrata/)).toBeTruthy();
    const prepara = screen.getByRole("button", { name: "Prepara l’e-mail" });
    expect(prepara).toBeDisabled();
    fireEvent.change(screen.getByLabelText("E-mail del destinatario"), { target: { value: "non-una-mail" } });
    expect(prepara).toBeDisabled();
    expect(s.chiama).not.toHaveBeenCalled();
  });

  it("scarica il PDF verificato dal server, lo carica fra gli allegati e apre il compositore con testo e destinatario", async () => {
    mostra();
    fireEvent.click(screen.getByRole("button", { name: /Invia al CSE/ }));
    expect(screen.getByLabelText("E-mail del destinatario")).toHaveValue("verdi@studio.it");
    fireEvent.click(screen.getByRole("button", { name: "Prepara l’e-mail" }));
    await screen.findByTestId("composer");
    expect(s.chiama).toHaveBeenCalledWith({ azione: "scarica_emissione", company_id: "az", emissione_id: "em-1", tipo: "pdf" });
    expect(fetch).toHaveBeenCalledWith("https://storage.esempio/pos.pdf");
    const [percorso, , opzioni] = s.upload.mock.calls[0];
    expect(percorso).toMatch(/^utente-1\/pos\/[0-9a-f-]{36}-POS-2026-014-rev2\.pdf$/);
    expect(opzioni).toMatchObject({ contentType: "application/pdf", upsert: false });
    expect(s.composer).toMatchObject({
      open: true, defaultChannel: "email", email: "verdi@studio.it", name: "Ing. Verdi", orderId: "ord",
      prefill: { emailSubject: "POS 2026-014 — revisione 2 — Edil Rossi S.r.l." },
      initialAttachments: [{ name: "POS-2026-014-rev2.pdf", size: 4000, mime: "application/pdf", storage_path: percorso }],
    });
    // niente è partito: solo l'utente, dal compositore, può inviare
    expect(s.insertTask).not.toHaveBeenCalled();
  });

  it("a invio riuscito registra la data e crea il promemoria due giorni prima della scadenza dei 15", async () => {
    const onInviato = mostra();
    fireEvent.click(screen.getByRole("button", { name: /Invia al CSE/ }));
    fireEvent.click(screen.getByRole("button", { name: "Prepara l’e-mail" }));
    fireEvent.click(await screen.findByRole("button", { name: "simula invio riuscito" }));
    const oggi = oggiRoma();
    await waitFor(() => expect(onInviato).toHaveBeenCalledWith("cse", oggi));
    await waitFor(() => expect(s.insertTask).toHaveBeenCalledTimes(1));
    const t = s.insertTask.mock.calls[0][0];
    expect(t).toMatchObject({ company_id: "az", created_by: "utente-1", assigned_to: "utente-1", order_id: "ord", priority: "alta", due_date: piuGiorni(oggi, 13) });
    expect(t.title).toContain("Verifica del POS 2026-014 (CSE): scade il");
    expect(t.notes).toContain("art. 101, comma 3");
    await waitFor(() => expect(screen.queryByTestId("composer")).toBeNull());
  });

  it("se il promemoria non si crea l'invio è comunque registrato, e l'utente lo sa", async () => {
    s.insertTask.mockResolvedValue({ error: { message: "negato" } });
    const onInviato = mostra({ tipo: "affidataria", nomeIniziale: "Impresa Bianchi", emailIniziale: "" });
    fireEvent.click(screen.getByRole("button", { name: /Invia all’impresa affidataria/ }));
    fireEvent.change(screen.getByLabelText("E-mail del destinatario"), { target: { value: "ufficio@bianchi.it" } });
    fireEvent.click(screen.getByRole("button", { name: "Prepara l’e-mail" }));
    fireEvent.click(await screen.findByRole("button", { name: "simula invio riuscito" }));
    await waitFor(() => expect(onInviato).toHaveBeenCalledWith("affidataria", oggiRoma()));
    await waitFor(() => expect(s.avviso).toHaveBeenCalledWith(expect.stringContaining("il promemoria non è stato creato")));
  });

  it("un file che non è un PDF, un PDF troppo grande o un server che non risponde fermano tutto senza aprire il compositore", async () => {
    const prova = async (blob: unknown, ok = true, messaggio: RegExp) => {
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok, blob: async () => blob }));
      s.errore.mockClear(); cleanup(); mostra();
      fireEvent.click(screen.getByRole("button", { name: /Invia al CSE/ }));
      fireEvent.click(screen.getByRole("button", { name: "Prepara l’e-mail" }));
      await waitFor(() => expect(s.errore).toHaveBeenCalledWith(expect.stringMatching(messaggio)));
      expect(screen.queryByTestId("composer")).toBeNull();
    };
    await prova({ size: 100, slice: () => ({ arrayBuffer: async () => new TextEncoder().encode("<html").buffer }) }, true, /non è un PDF/);
    await prova(pdfFinto(16 * 1024 * 1024), true, /troppo grande/);
    await prova(pdfFinto(), false, /non è scaricabile/);
    expect(s.upload).not.toHaveBeenCalled();
    s.chiama.mockRejectedValue(new Error("Non hai il permesso"));
    s.errore.mockClear(); cleanup(); mostra();
    fireEvent.click(screen.getByRole("button", { name: /Invia al CSE/ }));
    fireEvent.click(screen.getByRole("button", { name: "Prepara l’e-mail" }));
    await waitFor(() => expect(s.errore).toHaveBeenCalledWith("Non hai il permesso"));
  });

  it("se il caricamento fra gli allegati fallisce non si apre il compositore", async () => {
    s.upload.mockResolvedValue({ error: { message: "quota" } });
    mostra();
    fireEvent.click(screen.getByRole("button", { name: /Invia al CSE/ }));
    fireEvent.click(screen.getByRole("button", { name: "Prepara l’e-mail" }));
    await waitFor(() => expect(s.errore).toHaveBeenCalledWith("Caricamento del PDF fallito"));
    expect(screen.queryByTestId("composer")).toBeNull();
  });
});

describe("CSE della commessa", () => {
  const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>{children}</QueryClientProvider>;

  it("legge nome ed e-mail dell'incarico CSE; senza incarico o con la funzione spenta non legge nulla", async () => {
    s.incarichi = { data: [{ nominativo: "Ing. Verdi", email: "verdi@studio.it", stato: "proposto" }], error: null };
    const { result } = renderHook(() => useIncaricoCse("az", "ord", true), { wrapper });
    await waitFor(() => expect(result.current.data).toEqual({ nome: "Ing. Verdi", email: "verdi@studio.it" }));
    s.incarichi = { data: [{ nominativo: "Ing. Neri", email: null, stato: "proposto" }], error: null };
    const senzaMail = renderHook(() => useIncaricoCse("az2", "ord2", true), { wrapper });
    await waitFor(() => expect(senzaMail.result.current.data).toEqual({ nome: "Ing. Neri", email: "" }));
    s.incarichi = { data: [], error: null };
    const nessuno = renderHook(() => useIncaricoCse("az3", "ord3", true), { wrapper });
    await waitFor(() => expect(nessuno.result.current.data).toBeNull());
    const spento = renderHook(() => useIncaricoCse("az4", "ord4", false), { wrapper });
    expect(spento.result.current.fetchStatus).toBe("idle");
  });
});
