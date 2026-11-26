import { Blob as BlobNode } from "node:buffer";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { processCampoOffline } from "@/lib/campo/offlineProcessor";
import { SyncDeferredError, SyncPermanentError, type SyncItem } from "@/lib/campo/sync-queue";
const state = vi.hoisted(() => ({ owner: "u", insert: vi.fn(), upsert: vi.fn(), update: vi.fn(), select: vi.fn(), filters: vi.fn(), upload: vi.fn(), download: vi.fn(), error: null as null | { code: string; message: string }, existing: null as null | { id: string } }));
const rpc = vi.hoisted(() => vi.fn());
vi.mock("@/integrations/supabase/client", () => ({ supabase: {
  rpc,
  auth: { getSession: async () => ({ data: { session: { user: { id: state.owner } } }, error: null as null }) },
  from: () => { const q = { insert: (p: unknown) => { state.insert(p); return Promise.resolve({ error: state.error }); }, upsert: async (p: unknown) => { state.upsert(p); return { error: state.error }; }, update: (p: unknown) => { state.update(p); return q; }, select: (p: string) => { state.select(p); return q; }, eq: (...p: unknown[]) => { state.filters(...p); return q; }, maybeSingle: async () => ({ data: state.existing, error: null as null }) }; return q; },
  storage: { from: () => ({ upload: state.upload, download: state.download }) },
} }));
const id = "11111111-1111-4111-a111-111111111111";
const item = (patch: Partial<SyncItem> = {}): SyncItem => ({ id, operationId: id, type: "timbratura", payload: { user_id: "u", company_id: "c", order_id: "o", tipo: "entrata" }, createdAt: 0, updatedAt: 0, retryCount: 0, status: "pending", ...patch });
beforeEach(() => { vi.clearAllMocks(); state.owner = "u"; state.error = null; state.existing = null; state.upload.mockResolvedValue({ error: null }); state.download.mockResolvedValue({ data: new BlobNode(["foto"]), error: null }); });
describe("Sincronizzazione con API simulate", () => {
  // Piano campo completo 1.7 (26/11/2026): la spesa fatta senza rete.
  const spesa = { company_id: "c", user_id: "u", riga: { id, company_id: "c", user_id: "u", order_id: null as string | null, tipo: "carburante", importo: 55.5, descrizione: null as string | null, pagata_con: "soldi_miei", giorno: "2026-11-26" },
    foto: { path: `c/u/${id}-s.jpg`, blob: new BlobNode(["s"]) as unknown as Blob, contentType: "image/jpeg" } };
  it("spesa in coda: prima la foto, poi la riga con l'id del telefono", async () => {
    await expect(processCampoOffline(item({ type: "spesa", payload: spesa }))).resolves.toBeUndefined();
    expect(state.upload).toHaveBeenCalledWith(spesa.foto.path, spesa.foto.blob, expect.objectContaining({ upsert: false }));
    expect(state.insert).toHaveBeenCalledWith(expect.objectContaining({ id, importo: 55.5, foto_path: spesa.foto.path }));
  });
  it("infortunio in coda: prima le foto, poi la riga con i percorsi", async () => {
    const evento = { company_id: "c", user_id: "u", bucket: "sicurezza-eventi", riga: { id, company_id: "c", tipo: "infortunio", descrizione: "Caduta" },
      foto: [{ path: `c/${id}/a.jpg`, blob: new BlobNode(["a"]) as unknown as Blob, contentType: "image/jpeg" }] };
    await expect(processCampoOffline(item({ type: "sicurezza", payload: evento }))).resolves.toBeUndefined();
    expect(state.upload).toHaveBeenCalledWith(`c/${id}/a.jpg`, expect.anything(), expect.objectContaining({ upsert: false }));
    expect(state.insert).toHaveBeenCalledWith(expect.objectContaining({ id, descrizione: "Caduta", foto: [`c/${id}/a.jpg`] }));
  });
  it("segnalazione in coda: ticket e foto, e il ripetersi non raddoppia", async () => {
    const segnalazione = { company_id: "c", user_id: "u", riga: { id, company_id: "c", created_by: "u", subject: "Manca la colla", fonte: "campo" },
      foto: [{ path: `${id}/f.jpg`, blob: new BlobNode(["f"]) as unknown as Blob, contentType: "image/jpeg", nome: "f.jpg" }] };
    await expect(processCampoOffline(item({ type: "segnalazione", payload: segnalazione }))).resolves.toBeUndefined();
    expect(state.insert).toHaveBeenCalledWith(expect.objectContaining({ id, subject: "Manca la colla" }));
    expect(state.insert).toHaveBeenCalledWith(expect.objectContaining({ ticket_id: id, attachment_url: `${id}/f.jpg` }));
    vi.clearAllMocks(); state.upload.mockResolvedValue({ error: null });
    state.existing = { id: "messaggio" };
    await expect(processCampoOffline(item({ type: "segnalazione", payload: segnalazione }))).resolves.toBeUndefined();
    expect(state.insert).toHaveBeenCalledTimes(1);
  });
  it("spesa in coda: risposta persa, la riga c'è già e non si raddoppia", async () => {
    state.upload.mockResolvedValue({ error: { statusCode: "409", message: "already exists" } });
    state.error = { code: "23505", message: "duplicato" }; state.existing = { id };
    await expect(processCampoOffline(item({ type: "spesa", payload: spesa }))).resolves.toBeUndefined();
    expect(state.insert).toHaveBeenCalledTimes(1);
  });
  const checklist = { company_id: "c", operaio_id: "u", data: "2026-11-20", turno: "mattina", note: "Copia offline", risposte: [{ itemId: "dpi", checked: true }] };

  it("mantiene in coda la checklist con revisione superata, senza sovrascrivere quella remota", async () => {
    const revisione_base = "2026-11-20T07:00:00+00:00";
    await expect(processCampoOffline(item({ type: "checklist", payload: { ...checklist, revisione_base } })))
      .rejects.toBeInstanceOf(SyncPermanentError);
    expect(state.filters).toHaveBeenCalledWith("updated_at", revisione_base);
    expect(state.upsert).not.toHaveBeenCalled();
  });

  it("conserva la checklist pregressa senza revisione quando esiste già il turno sul server", async () => {
    state.error = { code: "23505", message: "duplicato" };
    await expect(processCampoOffline(item({ type: "checklist", payload: checklist })))
      .rejects.toThrow("La checklist locale è ancora in coda");
    expect(state.insert).toHaveBeenCalledWith(expect.objectContaining({ id, note: "Copia offline" }));
    expect(state.update).not.toHaveBeenCalled();
  });

  it("riconosce il reinvio della stessa nuova checklist dopo una risposta persa", async () => {
    state.error = { code: "23505", message: "duplicato" };
    state.existing = { id };
    await expect(processCampoOffline(item({ type: "checklist", payload: checklist }))).resolves.toBeUndefined();
    expect(state.filters).toHaveBeenCalledWith("id", id);
    expect(state.filters).toHaveBeenCalledWith("operaio_id", "u");
  });
  it.each(["22023", "22P02", "23503", "23505", "23514", "42501", "40001", "40P01", "53300", "57014", "08006", "PGRST000"])("classifica errore %s senza dichiarare l'invio riuscito", async code => {
    state.error = { code, message: "Errore simulato" };
    const result = processCampoOffline(item());
    if (["22023", "22P02", "23503", "23505", "23514", "42501"].includes(code)) {
      await expect(result).rejects.toBeInstanceOf(SyncPermanentError);
    } else {
      try { await result; throw new Error("Invio dichiarato riuscito per errore"); }
      catch (error) { expect(error).toBeInstanceOf(Error); expect(error).not.toBeInstanceOf(SyncPermanentError); expect((error as Error).message).toBe("Errore simulato"); }
    }
    expect(state.insert).toHaveBeenCalledTimes(1);
  });
  it("usa l'identità originale al primo invio", async () => {
    await processCampoOffline(item()); expect(state.insert).toHaveBeenCalledWith(expect.objectContaining({ id, user_id: "u", company_id: "c" }));
  });
  it("una risposta persa non crea una seconda riga", async () => {
    state.error = { code: "23505", message: "duplicato" }; state.existing = { id };
    await expect(processCampoOffline(item())).resolves.toBeUndefined();
    expect(state.filters).toHaveBeenCalledWith("id", id); expect(state.filters).toHaveBeenCalledWith("company_id", "c"); expect(state.filters).toHaveBeenCalledWith("user_id", "u");
  });
  it("un altro vincolo duplicato non viene scambiato per ricevuta riuscita", async () => {
    state.error = { code: "23505", message: "duplicato" }; await expect(processCampoOffline(item())).rejects.toBeInstanceOf(SyncPermanentError);
  });
  it("non invia la coda di un altro utente", async () => {
    state.owner = "other"; await expect(processCampoOffline(item())).rejects.toBeInstanceOf(SyncDeferredError); expect(state.insert).not.toHaveBeenCalled();
  });
  it.each(["prelievo", "rapportino"] as const)("tiene in attesa il %s mentre è attiva un'altra azienda", async type => {
    rpc.mockResolvedValueOnce({ data: "altra-azienda", error: null });
    await expect(processCampoOffline(item({ type }))).rejects.toBeInstanceOf(SyncDeferredError);
    expect(rpc.mock.calls).toEqual([["get_my_company_id"]]);
    expect(state.select).not.toHaveBeenCalled();
    expect(state.upload).not.toHaveBeenCalled();
  });
  it("richiede di rileggere l’avanzamento quando il server risponde con un conflitto", async () => {
    const azienda = "22222222-2222-4222-8222-222222222222";
    const cantiere = "33333333-3333-4333-8333-333333333333";
    state.owner = "44444444-4444-4444-8444-444444444444";
    rpc.mockResolvedValueOnce({ data: azienda, error: null as null });
    rpc.mockReturnValueOnce({ abortSignal: async (): Promise<{ data: boolean; error: null }> => ({ data: false, error: null }) });
    rpc.mockResolvedValueOnce({ data: null as null, error: { code: "PT409", details: "avanzamento-cambiato" } });
    await expect(processCampoOffline(item({ type: "avanzamento", payload: {
      tipo: "avanzamento", company_id: azienda, user_id: state.owner, order_id: cantiere,
      nomeCantiere: "Cantiere", note: "", foto: [], valore: "60", chiusuraRichiesta: false,
      target: { faseId: id, nome: "Posa", percentuale: 30, completata: false },
    } }))).rejects.toMatchObject({ code: "avanzamento-cambiato", message: expect.stringContaining("Rileggi") });
  });
  it("conserva le vecchie note vocali senza dichiararle giornalieri ricevuti", async () => {
    await expect(processCampoOffline(item({ type: "rapportino_vocale", payload: { operaio_id: "u", company_id: "c", trascrizione: "giornata" } }))).rejects.toBeInstanceOf(SyncPermanentError); expect(state.insert).not.toHaveBeenCalled();
  });
  it("non permette di indicare una tabella arbitraria", async () => {
    await expect(processCampoOffline(item({ type: "generic", target: "orders" }))).rejects.toBeInstanceOf(SyncPermanentError); expect(state.insert).not.toHaveBeenCalled();
  });
  it("una foto già caricata ritenta solo la riga con identità stabile", async () => {
    state.upload.mockResolvedValue({ error: { message: "The resource already exists" } });
    await processCampoOffline(item({ type: "foto", payload: { bucket: "campo-rapportini", path: "c/o/foto.jpg", blob: new BlobNode(["foto"]), contentType: "image/jpeg", riga: { uploaded_by: "u", company_id: "c", order_id: "o" } } }));
    expect(state.insert).toHaveBeenCalledWith(expect.objectContaining({ id, storage_path: "c/o/foto.jpg" }));
  });
  it("mantiene l'UUID originale della foto anche al passaggio dalla rete alla coda", async () => {
    const idFoto = "22222222-2222-4222-a222-222222222222";
    state.upload.mockResolvedValue({ error: { statusCode: "409", message: "File presente" } });
    state.error = { code: "23505", message: "duplicato" };
    state.existing = { id: idFoto };
    const path = `c/o/${idFoto}-foto.jpg`;
    await processCampoOffline(item({ type: "foto", payload: {
      bucket: "foto-cantiere", path, blob: new BlobNode(["foto"]), contentType: "image/jpeg",
      riga: { id: idFoto, uploaded_by: "u", company_id: "c", order_id: "o" },
    }}));
    expect(state.insert).toHaveBeenCalledWith(expect.objectContaining({ id: idFoto, storage_path: path }));
    expect(state.filters).toHaveBeenCalledWith("storage_path", path);
  });

  it("conserva la foto in coda se il percorso è occupato da un file diverso", async () => {
    state.upload.mockResolvedValue({ error: { statusCode: "409", message: "File presente" } });
    state.download.mockResolvedValue({ data: new BlobNode(["altr"]), error: null });
    await expect(processCampoOffline(item({ type: "foto", payload: {
      bucket: "foto-cantiere", path: "c/o/legacy-foto.jpg", blob: new BlobNode(["foto"]), contentType: "image/jpeg",
      riga: { uploaded_by: "u", company_id: "c", order_id: "o" },
    }}))).rejects.toBeInstanceOf(SyncPermanentError);
    expect(state.insert).not.toHaveBeenCalled();
  });
});
