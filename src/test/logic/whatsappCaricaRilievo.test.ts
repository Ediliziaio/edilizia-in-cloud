import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * WhatsApp → rilievo della commessa (piano sopralluoghi, lotto 9). Database e archivio finti:
 * nessun messaggio, nessun file vero.
 */
vi.mock("../../../supabase/functions/whatsapp-ai-processor/tools/shared/sceltaCantiere.ts", () => ({
  sceltaCantiere: vi.fn(async () => ({ proposto: { id: "ord-1", motivo: "dove hai timbrato oggi" }, candidati: [] })),
}));
import { caricaRilievo, rilievoDaUsare, type RilievoAperto } from "../../../supabase/functions/whatsapp-ai-processor/tools/operaio/carica_rilievo";

const r = (id: string, p: Partial<RilievoAperto>): RilievoAperto => ({ id, code: id, technician_id: null, mode: "structured", scheduled_at: null, created_at: "2026-11-01T00:00:00Z", ...p });

describe("quale rilievo prende il foglio", () => {
  it("prima quello di cui sono il tecnico, poi quello su carta, poi il più recente", () => {
    const aperti = [r("altro", { created_at: "2026-11-20T00:00:00Z" }), r("carta", { mode: "express" }), r("mio", { technician_id: "u1" })];
    expect(rilievoDaUsare(aperti, "u1")?.id).toBe("mio");
    expect(rilievoDaUsare(aperti, "u2")?.id).toBe("carta");
    expect(rilievoDaUsare([], "u1")).toBeNull();
  });
});

type Esito = { data: unknown; error: { message: string } | null };
const ok = (data: unknown): Esito => ({ data, error: null });

function ctxFinto(opzioni: { aperti?: RilievoAperto[]; mime?: string; tipo?: string } = {}) {
  const scritti: Record<string, unknown[]> = { surveys: [], survey_media: [], survey_activity_log: [], upload: [] };
  const tabella = (nome: string) => {
    const q: Record<string, unknown> = {};
    let ins: unknown = null;
    for (const m of ["select", "eq", "is", "in", "limit"]) q[m] = () => q;
    q.insert = (v: unknown) => { ins = v; scritti[nome].push(v); return q; };
    q.maybeSingle = async () => nome === "orders" ? { data: { id: "ord-1", order_code: "C-7", client_name: "Rossi", customer_id: "cli", indirizzo_lavori: "Via Po 1" } } : { data: null };
    q.single = async (): Promise<Esito> => nome === "surveys" ? ok({ id: "sop-nuovo", code: "SOP-9", technician_id: "u1", mode: "express", scheduled_at: "", created_at: "x" })
      : ok({ id: "media-1" });
    q.then = (fatto: (x: unknown) => unknown) => Promise.resolve(nome === "surveys" && !ins ? ok(opzioni.aperti ?? []) : ok(null)).then(fatto);
    return q;
  };
  const storage = { from: (bucket: string) => ({
    download: async (): Promise<Esito> => ok(new Blob(["x"], { type: opzioni.mime ?? "image/jpeg" })),
    upload: async (percorso: string): Promise<Esito> => { scritti.upload.push({ bucket, percorso }); return ok(null); },
    remove: async (): Promise<Esito> => ok(null),
  }) };
  const ctx = { company_id: "az", user_id: "u1", supabase: { from: tabella, storage }, mediaCorrente: { storagePath: "az/wa/123.jpg", url: "", tipo: opzioni.tipo ?? "image" } };
  return { ctx: ctx as never, scritti };
}

describe("carica_rilievo", () => {
  beforeEach(() => vi.clearAllMocks());

  it("senza file chiede il foglio", async () => {
    const { ctx } = ctxFinto();
    const esito = await caricaRilievo({ ...(ctx as object), mediaCorrente: null } as never, {});
    expect(esito.ok).toBe(false);
  });

  it("nessun rilievo da eseguire: ne crea uno su carta e ci mette la foto", async () => {
    const { ctx, scritti } = ctxFinto();
    const esito = await caricaRilievo(ctx, { nota: "pagina 1" });
    expect(esito.ok).toBe(true);
    expect(scritti.surveys[0]).toMatchObject({ mode: "express", template_id: "feca0825-6909-4208-9ed7-cd52070ea1d5", order_id: "ord-1", technician_id: "u1", tipo: "tecnico" });
    expect(scritti.upload[0]).toMatchObject({ bucket: "surveys" });
    expect(String((scritti.upload[0] as { percorso: string }).percorso)).toMatch(/^az\/sop-nuovo\/photos\/.+\.jpg$/);
    expect(scritti.survey_media[0]).toMatchObject({ survey_id: "sop-nuovo", type: "photo", checklist_label: "pagina 1" });
    if (esito.ok) expect(esito.user_message).toMatch(/nuovo rilievo su carta SOP-9 di Rossi · C-7/);
  });

  it("rilievo da eseguire: il PDF va lì come documento, senza crearne un altro", async () => {
    const { ctx, scritti } = ctxFinto({ aperti: [r("sop-mio", { technician_id: "u1", code: "SOP-3" })], mime: "application/pdf", tipo: "document" });
    const esito = await caricaRilievo(ctx, {});
    expect(esito.ok).toBe(true);
    expect(scritti.surveys).toHaveLength(0);
    expect(scritti.survey_media[0]).toMatchObject({ survey_id: "sop-mio", type: "document", mime_type: "application/pdf" });
    expect(String((scritti.upload[0] as { percorso: string }).percorso)).toMatch(/^az\/sop-mio\/documents\/.+\.pdf$/);
  });

  it("un documento che non è PDF non entra nel rilievo", async () => {
    const { ctx, scritti } = ctxFinto({ aperti: [r("sop-mio", {})], mime: "application/msword", tipo: "document" });
    const esito = await caricaRilievo(ctx, {});
    expect(esito.ok).toBe(false);
    expect(scritti.upload).toHaveLength(0);
  });
});
