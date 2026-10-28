import { beforeEach, describe, it, expect, vi } from "vitest";
import { makeSurveyDetail } from "../fixtures/surveyDetail";
import { saveSurveyElement } from "@/lib/surveys/saveElement";
const m = vi.hoisted(() => ({
  from: vi.fn(),
  eq: vi.fn(),
  update: vi.fn(),
  read: vi.fn(),
  write: vi.fn(),
  select: vi.fn(),
}));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { from: m.from },
}));
beforeEach(() => {
  vi.clearAllMocks();
  m.read.mockResolvedValue({
    data: { id: "survey1", company_id: "company1", client_signature_at: null },
    error: null,
  });
  m.write.mockResolvedValue({
    data: makeSurveyDetail().elements[0],
    error: null,
  });
  m.from.mockImplementation((table) => {
    const q = {
      select: m.select,
      update: m.update,
      eq: m.eq,
      maybeSingle: table === "surveys" ? m.read : m.write,
    };
    m.eq.mockReturnValue(q);
    m.select.mockReturnValue(q);
    m.update.mockReturnValue(q);
    return q;
  });
});
describe("Salvataggio protetto dell’elemento", () => {
  it("restringe azienda e sopralluogo e confronta la versione senza aggiornare il verbale", async () => {
    const d = makeSurveyDetail(),
      e = d.elements[0];
    await saveSurveyElement(
      d,
      e,
      { ...e, values: { ...e.values, larghezza: 135 } },
      "company1",
    );
    expect(m.eq).toHaveBeenCalledWith("company_id", "company1");
    expect(m.eq).toHaveBeenCalledWith("survey_id", "survey1");
    expect(m.eq).toHaveBeenCalledWith("updated_at", e.updated_at);
    expect(m.update).toHaveBeenCalledTimes(1);
    expect(m.update.mock.calls[0][0]).not.toHaveProperty("client_signature_at");
  });
  it("non procede con un’altra azienda", async () => {
    const d = makeSurveyDetail();
    await expect(
      saveSurveyElement(d, d.elements[0], d.elements[0], "other"),
    ).rejects.toThrow("non appartiene");
    expect(m.from).not.toHaveBeenCalled();
  });
  it("non salva su righe senza versione", async () => {
    const d = makeSurveyDetail();
    d.elements[0].updated_at = "";
    await expect(
      saveSurveyElement(d, d.elements[0], d.elements[0], "company1"),
    ).rejects.toThrow();
    expect(m.update).not.toHaveBeenCalled();
  });
  it("una modifica concorrente o accesso negato non è un falso successo", async () => {
    m.write.mockResolvedValue({ data: null, error: null });
    const d = makeSurveyDetail();
    await expect(
      saveSurveyElement(d, d.elements[0], d.elements[0], "company1"),
    ).rejects.toThrow("nessun dato è stato sovrascritto");
  });
  it("non cambia un rilievo con firma presente", async () => {
    m.read.mockResolvedValue({
      data: { client_signature_at: "2026-10-21" },
      error: null,
    });
    const d = makeSurveyDetail();
    await expect(
      saveSurveyElement(d, d.elements[0], d.elements[0], "company1"),
    ).rejects.toThrow("firma");
    expect(m.update).not.toHaveBeenCalled();
  });
  it("mantiene un errore di rete come errore", async () => {
    m.write.mockResolvedValue({ data: null, error: new Error("offline") });
    const d = makeSurveyDetail();
    await expect(
      saveSurveyElement(d, d.elements[0], d.elements[0], "company1"),
    ).rejects.toThrow("Salvataggio non riuscito");
  });
});
