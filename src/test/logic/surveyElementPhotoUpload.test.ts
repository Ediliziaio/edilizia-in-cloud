import { beforeEach, describe, expect, it, vi } from "vitest";
import { uploadMedia, validateSurveyPhoto } from "@/lib/api/surveys";
const m = vi.hoisted(() => ({
  from: vi.fn(),
  upload: vi.fn(),
  signed: vi.fn(),
  insert: vi.fn(),
  eq: vi.fn(),
  company: "company1",
  survey: {
    id: "survey1",
    status: "in_progress",
    client_signature_at: null as string | null,
  },
  element: { id: "element1", area_id: "area1" } as {
    id: string;
    area_id: string;
  } | null,
  surveyError: null as Error | null,
  converti: vi.fn(),
}));
vi.mock("@/lib/files/convertiHeic", () => ({ convertiHeic: m.converti }));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: { getUser: async () => ({ data: { user: { id: "user1" } } }) },
    from: m.from,
    storage: { from: () => ({ upload: m.upload, createSignedUrl: m.signed }) },
  },
}));
beforeEach(() => {
  vi.clearAllMocks();
  m.company = "company1";
  m.converti.mockImplementation(async () => new File(["jpg"], "telefono.jpg", { type: "image/jpeg" }));
  m.survey = {
    id: "survey1",
    status: "in_progress",
    client_signature_at: null,
  };
  m.surveyError = null;
  m.element = { id: "element1", area_id: "area1" };
  m.upload.mockResolvedValue({ data: {}, error: null });
  m.signed.mockResolvedValue({
    data: { signedUrl: "https://example.test/photo.jpg" },
  });
  m.insert.mockReturnThis();
  m.from.mockImplementation((table) => {
    const q = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockImplementation((...args) => {
        m.eq(...args);
        return q;
      }),
      insert: m.insert,
      maybeSingle: async () =>
        table === "profiles"
          ? { data: { company_id: m.company } }
          : table === "surveys"
            ? { data: m.survey, error: m.surveyError }
            : { data: m.element },
      single: async () => ({
        data: { id: "media1" },
        error: null as Error | null,
      }),
    };
    return q;
  });
});
const file = () => new File(["test"], "foro.jpg", { type: "image/jpeg" });
const opts = {
  type: "photo" as const,
  elementId: "element1",
  areaId: "area1",
  expectedCompanyId: "company1",
};
describe("Caricamento foto dalla scheda: verifiche prima dello storage", () => {
  it("carica una foto Android anche senza MIME e registra il tipo corretto", async () => {
    const foto = new File(["foto"], "telefono.jpg");
    expect(validateSurveyPhoto(foto)).toBeNull();
    await uploadMedia("survey1", foto, opts);
    expect(m.upload.mock.calls[0][1].type).toBe("image/jpeg");
    expect(m.insert).toHaveBeenCalledWith(expect.objectContaining({ mime_type: "image/jpeg" }));
  });
  it("converte HEIC e HEIF in JPG prima di salvare, così la foto si vede anche su Android e computer", async () => {
    await uploadMedia("survey1", new File(["heif"], "telefono.heif", { type: "application/octet-stream" }), opts);
    expect(m.converti).toHaveBeenCalledOnce();
    expect(m.upload.mock.calls[0][0]).toMatch(/\.jpg$/);
    expect(m.upload.mock.calls[0][1].type).toBe("image/jpeg");
  });
  it("se la conversione fallisce non crea una riga o un file vuoto", async () => {
    m.converti.mockRejectedValueOnce(new Error("Conversione non riuscita"));
    await expect(uploadMedia("survey1", new File(["heic"], "telefono.heic", { type: "image/heic" }), opts)).rejects.toThrow("Conversione");
    expect(m.upload).not.toHaveBeenCalled();
    expect(m.insert).not.toHaveBeenCalled();
  });
  it("rifiuta foto vuote e formati non accettati dal bucket senza abbassare il limite di 25 MB", () => {
    expect(validateSurveyPhoto(new File([], "vuota.jpg", { type: "image/jpeg" }))).toContain("vuoto");
    expect(validateSurveyPhoto(new File(["svg"], "disegno.svg", { type: "image/svg+xml" }))).toContain("JPG");
    const grande = file(); Object.defineProperty(grande, "size", { value: 20 * 1024 * 1024 });
    expect(validateSurveyPhoto(grande)).toBeNull();
  });
  it("registra la copia annotata e la provenienza senza modificare l’originale", async () => {
    await uploadMedia("survey1", file(), { ...opts, type: "annotated_photo", annotations: { kind: "equipment-placement", sourceMediaId: "original", notToScale: true } });
    expect(m.insert).toHaveBeenCalledWith(expect.objectContaining({ type: "annotated_photo", annotations: { kind: "equipment-placement", sourceMediaId: "original", notToScale: true } }));
    expect(m.upload.mock.calls[0][2]).toMatchObject({ upsert: false });
  });
  it("controlla azienda, rilievo e appartenenza dell’elemento prima di caricare", async () => {
    await uploadMedia("survey1", file(), opts);
    expect(m.eq).toHaveBeenCalledWith("company_id", "company1");
    expect(m.eq).toHaveBeenCalledWith("survey_id", "survey1");
    expect(m.upload).toHaveBeenCalledOnce();
    expect(m.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        survey_id: "survey1",
        element_id: "element1",
        area_id: "area1",
      }),
    );
  });
  it("rifiuta un’altra azienda senza scrivere storage o media", async () => {
    m.company = "other";
    await expect(uploadMedia("survey1", file(), opts)).rejects.toThrow(
      "Azienda cambiata",
    );
    expect(m.upload).not.toHaveBeenCalled();
    expect(m.insert).not.toHaveBeenCalled();
  });
  it.each(["signature", "status"])(
    "rilievo firmato (%s): nessun upload",
    async (kind) => {
      if (kind === "signature") m.survey.client_signature_at = "2026-10-27";
      else m.survey.status = "signed";
      await expect(uploadMedia("survey1", file(), opts)).rejects.toThrow(
        "firma",
      );
      expect(m.upload).not.toHaveBeenCalled();
    },
  );
  it("elemento eliminato/spostato: interrompe prima dello storage", async () => {
    m.element = { id: "element1", area_id: "moved" };
    await expect(uploadMedia("survey1", file(), opts)).rejects.toThrow(
      "spostato",
    );
    expect(m.upload).not.toHaveBeenCalled();
  });
  it("non trasforma un errore di lettura in un upload permesso", async () => {
    m.surveyError = new Error("Offline");
    await expect(uploadMedia("survey1", file(), opts)).rejects.toThrow(
      "non disponibile",
    );
    expect(m.upload).not.toHaveBeenCalled();
  });
});
